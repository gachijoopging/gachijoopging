"""모델 로드 · 워밍업 · 추론.

**GPU 를 만지는 코드는 전부 단일 전용 스레드(`_GPU`)에서 돈다.** JPEG 디코딩은 요청
스레드에 남겨 병렬로 처리한다 — W1 ① 실측에서 디코딩(110~145ms)이 GPU 추론(20ms)보다
5배 이상 오래 걸렸으므로 디코딩까지 직렬화하면 그게 바로 병목이 된다 (README §8).

세마포어가 아니라 단일 스레드인 이유 (W1 ② 실측):
PyTorch 는 **스레드마다 CUDA 초기화 비용을 따로 낸다** — 어떤 스레드가 처음 추론할 때
약 810ms 가 붙는다. 세마포어로 직렬화하면 요청이 스레드풀의 여러 스레드에 흩어지므로
스레드마다 그 810ms 를 새로 내고, **워밍업 스레드와 요청 스레드가 달라서 워밍업이 첫
사용자를 지켜 주지 못한다**(워밍업 직후 단독 요청 815ms 측정). 동시 8건 실측:
스레드가 새것일 때 5,702ms(1.4 req/s) → 같은 스레드를 재사용할 때 189ms(42 req/s).
GPU 작업을 한 스레드에 못 박으면 그 비용을 워밍업에서 한 번만 내고 끝난다.
"""

from __future__ import annotations

import io
import logging
import time
from concurrent.futures import ThreadPoolExecutor

import numpy as np
from PIL import Image
from ultralytics import YOLO

from app import config
from app.calibrate import calibrate
from app.classes import CLASSES, validate_model_names
from app.preprocess import to_upright

log = logging.getLogger("gachijoopging.ai")

# GPU 전용 스레드 1개. 직렬화가 구조로 보장되고(락 불필요) CUDA 초기화 비용도 1회로 끝난다.
_GPU = ThreadPoolExecutor(max_workers=1, thread_name_prefix="gpu")

_model: YOLO | None = None
_warmed_up = False
_load_error: str | None = None
_queued = 0  # GPU 대기 중인 요청 수. 부하 테스트(⑳)용 관찰값


class ImageDecodeError(Exception):
    """업로드된 바이트를 이미지로 열 수 없음. 백엔드가 보낸 것이 JPEG 이 아니거나 깨졌다."""


def is_ready() -> bool:
    """모델이 로드됐고 워밍업까지 끝났는가. `/healthz` 의 `ready` 이자 추론 가능 조건."""
    return _model is not None and _warmed_up


def warmed_up() -> bool:
    return _warmed_up


def load_error() -> str | None:
    return _load_error


def _predict_kwargs() -> dict:
    return {
        "imgsz": config.IMGSZ,
        # 정사각 letterbox 고정. **성능 문제이자 학습 정합성 문제다** (W1 ② 실측).
        # predict 의 기본값은 rect=True 로, 종횡비를 살린 직사각 텐서를 만든다:
        # 가로 사진 → (1024, 768), 세로 → (768, 1024), 정사각 → (1024, 1024).
        # cuDNN 은 텐서 모양마다 커널을 새로 고르므로 **모양이 처음 나올 때마다 약 810ms**
        # 가 붙는다. 워밍업은 한 모양만 예열하니 데모에서 세로 첫 장이 812ms 를 맞는다.
        # rect=False 면 모든 입력이 1024x1024 하나로 모여 21~38ms 로 평탄해지고,
        # 학습(imgsz=1024 정사각)과 입력 모양도 같아진다. 스케일은 양쪽 동일하고
        # 회색 패딩 양만 달라서 정확도 영향은 없다.
        "rect": False,
        # FP16. `half=True` 는 ultralytics 8.4.112 에서 deprecated (W1 ①).
        # 4070 에서 속도 이득은 없었고 VRAM·동시요청 여유가 목적이다.
        "quantize": 16,
        "device": config.DEVICE,
        # 여기서 자르면 ultralytics 가 후처리 단계에서 걸러 준다. 300개 후보를 전부
        # 파이썬으로 가져와 직접 필터링할 이유가 없다.
        "conf": config.CONF_MIN,
        "verbose": False,
    }


def start_warmup() -> None:
    """워밍업을 **GPU 전용 스레드에** 예약한다. 프로세스 시작 시 1회만 호출한다.

    반드시 `_GPU` 위에서 돌아야 한다 — 그 스레드가 CUDA 초기화 비용(약 810ms)을 여기서
    한 번 내고, 이후 모든 요청이 그 스레드를 쓰므로 다시 내지 않는다. 다른 스레드에서
    워밍업하면 비용을 두 번 내고 첫 사용자가 그걸 맞는다.

    이벤트 루프를 막지 않으므로 그 동안 `/healthz` 는 `ready: false` 를 답하고
    `/internal/infer` 는 503 을 준다.
    """
    _GPU.submit(_load_and_warmup)


def shutdown() -> None:
    """GPU 스레드 정리. 진행 중인 추론은 기다린다 (④ 자동 재시작에서 반쪽 응답을 막는다)."""
    _GPU.shutdown(wait=True, cancel_futures=True)


def _load_and_warmup() -> None:
    global _model, _warmed_up, _load_error

    try:
        if not config.WEIGHTS.exists():
            raise FileNotFoundError(
                f"weights 가 없습니다: {config.WEIGHTS}"
                " (커밋하지 않는 파일이다 — .gitignore 의 *.pt)"
            )
        t0 = time.perf_counter()
        model = YOLO(str(config.WEIGHTS))
        log.info("weights 로드 %.2fs — %s", time.perf_counter() - t0, config.WEIGHTS.name)
        validate_model_names(model.names)

        # 앱이 장변 2048 로 줄여 보내므로(서버설계 결정 35) 그 크기로 예열한다.
        # 균일한 색이 아니라 노이즈를 쓴다 — 검출이 0개면 좌표 변환 경로가 예열되지 않는다.
        rng = np.random.default_rng(0)
        dummy = Image.fromarray(rng.integers(0, 255, (1536, 2048, 3), dtype=np.uint8))

        _model = model
        for i in range(2):
            t0 = time.perf_counter()
            _predict_to_items(dummy)  # 좌표 변환 경로까지 예열
            log.info("워밍업 %d회차 %.0fms", i + 1, (time.perf_counter() - t0) * 1000)

        _warmed_up = True
        log.info(
            "준비 완료 — modelVersion=%s imgsz=%d CONF_MIN=%s device=%s",
            config.MODEL_VERSION,
            config.IMGSZ,
            config.CONF_MIN,
            config.DEVICE,
        )
    except Exception as e:  # noqa: BLE001 — 죽이지 않고 상태로 남긴다
        _model = None
        _warmed_up = False
        _load_error = f"{type(e).__name__}: {e}"
        # 여기서 프로세스를 죽이면 백엔드가 연결 거부를 받고 원인을 모른다.
        # 살아서 503 + /healthz 로 이유를 알려주는 쪽이 데모 당일에 낫다.
        log.exception("모델 로드/워밍업 실패 — 계속 503 을 반환한다")


def _bbox(x1: float, y1: float, x2: float, y2: float) -> dict[str, float] | None:
    """`xyxyn`(좌상단+우하단, 0~1) → API 계약의 `{x, y, w, h}`(좌상단+크기, 0~1).

    `xywhn` 은 이름이 계약과 똑같지만 x,y 가 **중심점**이라 그대로 쓰면 에러 없이 박스가
    `(w/2, h/2)` 만큼 우하단으로 밀린다 (README §3.2). `xyxyn` 은 정의상 두 꼭짓점이라
    중심으로 오해될 수가 없어서 이 함수의 산수가 유일한 변환 지점이 된다.
    """
    x = min(max(x1, 0.0), 1.0)
    y = min(max(y1, 0.0), 1.0)
    w = min(max(x2 - x1, 0.0), 1.0 - x)
    h = min(max(y2 - y1, 0.0), 1.0 - y)
    # 소수 5자리 = 4096px 에서 0.04px. 앱이 그리는 데 충분하고 JSON 이 읽을 만해진다.
    x, y, w, h = (round(v, 5) for v in (x, y, w, h))
    if w <= 0.0 or h <= 0.0:
        return None  # 면적 0 박스는 앱에서 그릴 수 없다
    return {"x": x, "y": y, "w": w, "h": h}


def _to_items(result) -> list[dict]:
    boxes = result.boxes
    if boxes is None or len(boxes) == 0:
        return []

    xyxyn = boxes.xyxyn.cpu().numpy()
    cls = boxes.cls.cpu().numpy()
    conf = boxes.conf.float().cpu().numpy()

    items: list[dict] = []
    dropped = 0
    for (x1, y1, x2, y2), c, p in zip(xyxyn, cls, conf, strict=True):
        bbox = _bbox(float(x1), float(y1), float(x2), float(y2))
        if bbox is None:
            dropped += 1
            continue
        items.append(
            {
                "bbox": bbox,
                "category": CLASSES[int(c)],
                "aiConfidence": round(float(calibrate(float(p))), 4),
            }
        )
    if dropped:
        log.warning("면적 0 박스 %d개 제외", dropped)
    return items


def _predict_to_items(img: Image.Image) -> tuple[list[dict], float]:
    """**GPU 전용 스레드에서만 호출된다.** 추론 + 좌표 변환.

    `_to_items` 까지 여기 두는 이유: `.cpu().numpy()` 도 CUDA 를 만지는 호출이라,
    요청 스레드로 새어 나가면 그 스레드가 초기화 비용을 낼 여지가 생긴다.
    """
    t0 = time.perf_counter()
    result = _model.predict(img, **_predict_kwargs())[0]
    return _to_items(result), (time.perf_counter() - t0) * 1000.0


def infer(raw: bytes) -> tuple[list[dict], float]:
    """업로드 바이트 → (items, inferenceMs).

    `inferenceMs` 는 JPEG 디코딩·EXIF 회전·letterbox·추론·좌표 변환을 포함하고 네트워크를
    제외한다(README §2). **GPU 대기 시간도 포함**한다 — 서버가 실제로 붙잡고 있던 시간이어야
    백엔드의 `(총 왕복 − inferenceMs)` 로그에 네트워크·백엔드 비용만 남는다(⑭).
    """
    global _queued

    if _model is None:
        raise RuntimeError("모델이 로드되지 않았다 — is_ready() 를 먼저 확인해야 한다")

    t0 = time.perf_counter()
    try:
        # Image.open 은 게으르다. 실제 디코딩은 to_upright 의 exif_transpose 에서 일어나므로
        # 디코딩 시간이 이 타이머 안에 들어온다. 여기는 요청 스레드 = 병렬 구간이다.
        img = to_upright(Image.open(io.BytesIO(raw)))
    except Exception as e:  # noqa: BLE001
        # 원인은 로그에만 남긴다. ultralytics 가 PIL.Image.open 을 감싸 두었기 때문에
        # 여기 올라오는 예외 메시지가 "No module named 'pi_heif'" 처럼 실제 원인과
        # 무관해 보이는 경우가 있어, 그대로 응답에 실으면 백엔드 쪽을 헷갈리게 한다.
        log.warning("디코딩 실패 (%d bytes): %r", len(raw), e)
        raise ImageDecodeError("이미지로 열 수 없다 — JPEG 이 아니거나 손상됐다") from e
    decode_ms = (time.perf_counter() - t0) * 1000.0

    _queued += 1
    try:
        if _queued > 8:
            # 백엔드 타임아웃이 2~3초다. 대기가 이만큼 쌓이면 뒤쪽 요청은 이미 늦다.
            # 지금은 관찰만 한다 — 거절 정책은 ⑳ 부하 테스트 결과로 정한다.
            log.warning("GPU 대기 %d건", _queued)
        items, gpu_ms = _GPU.submit(_predict_to_items, img).result()
    finally:
        _queued -= 1

    elapsed_ms = (time.perf_counter() - t0) * 1000.0

    # '추론' 은 predict 전체 = letterbox(CPU) + 순전파(GPU) + 좌표 변환이다.
    # 순수 GPU 시간만 보려면 predict 가 돌려주는 result.speed 를 봐야 한다.
    log.info(
        "infer %dx%d items=%d %.0fms (디코딩 %.0f · 대기 %.0f · 추론 %.0f) [%s]",
        img.width,
        img.height,
        len(items),
        elapsed_ms,
        decode_ms,
        elapsed_ms - decode_ms - gpu_ms,
        gpu_ms,
        ", ".join(f"{i['category']}:{i['aiConfidence']:.2f}" for i in items[:6]) or "-",
    )
    return items, elapsed_ms
