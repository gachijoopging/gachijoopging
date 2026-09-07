"""FastAPI 추론 서버 — Spring 과의 사내 계약 (README §2).

앱은 이 서버를 직접 호출하지 않는다. 백엔드(ai-proxy)가 원본 사진을 가공 없이 중계하고,
여기서 나온 `items` 를 `POST /media` 응답의 `inference` 객체에 담아 앱에 전달한다
(`docs/openapi.yaml`). 따라서 여기서 나가는 **503 은 앱이 보지 않는다** — 백엔드가
`inference.status = "UNAVAILABLE"` 로 바꿔 주고 앱은 수동 입력으로 내려간다.

실행 (워커 1개. GPU 하나를 여러 워커가 나눠 쓰면 VRAM 만 낭비한다 — README §8):
    uv run uvicorn app.main:app
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from hmac import compare_digest
from typing import Annotated

from fastapi import FastAPI, File, Request, Response, UploadFile
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from starlette.requests import ClientDisconnect

from app import config, infer

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
log = logging.getLogger("gachijoopging.ai")


# ---------------------------------------------------------------------------
# 응답 스키마 — 필드 이름이 계약이다. camelCase 를 그대로 쓴다.
# ---------------------------------------------------------------------------
class BBox(BaseModel):
    """축 정렬 박스. **`x,y` 는 좌상단이고 중심점이 아니다** (`docs/openapi.yaml`)."""

    x: float = Field(description="좌상단 x / 이미지 너비 (0~1)")
    y: float = Field(description="좌상단 y / 이미지 높이 (0~1)")
    w: float = Field(description="너비 비율 (0~1)")
    h: float = Field(description="높이 비율 (0~1)")


class Item(BaseModel):
    bbox: BBox
    category: str = Field(
        description="7종 중 하나: CIGARETTE·CAN·PLASTIC·PAPER·GLASS·VINYL·GENERAL"
    )
    aiConfidence: float = Field(  # noqa: N815 — 계약 필드명
        description="보정된 신뢰도. 0.7 미만을 unclassified 로 보는 판정은 소비자가 한다"
    )


class InferResponse(BaseModel):
    modelVersion: str  # noqa: N815 — 계약 필드명
    inferenceMs: int  # noqa: N815 — 계약 필드명
    items: list[Item]


class HealthResponse(BaseModel):
    ready: bool = Field(description="추론 가능. 모델 로드 + 워밍업 완료")
    modelVersion: str  # noqa: N815 — 계약 필드명
    warmedUp: bool  # noqa: N815 — 계약 필드명
    error: str | None = Field(
        default=None, description="로드·워밍업이 실패했을 때 원인. 정상이면 null"
    )


class ContractError(Exception):
    """계약에 정의된 에러 응답. 본문 형태를 한 곳에서 고정한다."""

    def __init__(self, status: int, code: str, message: str = "") -> None:
        self.status = status
        self.code = code
        self.message = message


# ---------------------------------------------------------------------------
# 앱
# ---------------------------------------------------------------------------
@asynccontextmanager
async def lifespan(_: FastAPI):
    # 워밍업은 수 초 걸린다(W1 ① 실측). 여기서 기다리면 그 동안 서버가 아예 응답을 못 해
    # 백엔드가 연결 거부를 받는다. GPU 전용 스레드로 넘겨 `/healthz` 가 ready:false 를 답하게 한다.
    infer.start_warmup()
    yield
    infer.shutdown()


app = FastAPI(
    title="가치줍깅 AI 추론 서버",
    description="YOLO26s @ imgsz 1024, 단일 스테이지 7클래스. 호출자는 백엔드뿐이다.",
    lifespan=lifespan,
)


@app.exception_handler(ContractError)
async def _contract_error_handler(_: Request, exc: ContractError) -> JSONResponse:
    return JSONResponse({"code": exc.code, "message": exc.message}, status_code=exc.status)


@app.exception_handler(RequestValidationError)
async def _validation_handler(_: Request, exc: RequestValidationError) -> JSONResponse:
    # FastAPI 기본 422 는 {"detail": [...]} 라 다른 에러와 형태가 달라진다. 통일해 둔다.
    return JSONResponse({"code": "VALIDATION", "message": str(exc.errors()[:3])}, status_code=422)


# 401 을 본문보다 먼저 내보내고 연결을 닫으면, 아직 사진을 올리던 클라이언트는 그 401 을
# 받지 못하고 **연결 끊김만** 본다. 루프백은 버퍼가 본문을 통째로 삼켜서 드러나지 않고
# 터널에서만 드러난다 (W1 판정 중 실측 — 3.8MB · 터널 · 시크릿 없음, 그 한 칸만 끊겼다).
# 백엔드에게는 시크릿 오설정이 "AI 서버 다운"과 구별되지 않게 되므로 — README §9 가 502 를
# 두고 걱정한 것과 같은 종류다 — 401 전에 본문을 읽어 버린다.
#
# 다만 인증 안 된 업로드를 무제한으로 받지는 않는다 (결정 29). 상한을 넘으면 읽기를 멈추고
# 그냥 끊는다: 그 크기는 앱이 보내는 사진이 아니라서 깨끗한 401 을 줄 이유가 없다.
DRAIN_LIMIT = 20 * 1024 * 1024


async def _drain(request: Request) -> None:
    read = 0
    try:
        async for chunk in request.stream():
            read += len(chunk)
            if read > DRAIN_LIMIT:
                break
    except ClientDisconnect:
        pass


@app.middleware("http")
async def verify_secret(request: Request, call_next):
    """`/internal/*` 는 공유 시크릿을 요구한다 (서버설계 결정 29).

    라우트가 아니라 미들웨어에서 막는 이유: FastAPI 가 `UploadFile` 을 파싱하는 시점이
    엔드포인트 함수보다 앞이라, 라우트에서 검사하면 **인증 실패한 요청의 사진이 디코딩
    경로까지 들어간다.** 여기서 끊으면 본문은 읽어 버릴 뿐 아무 처리도 하지 않는다.
    """
    if request.url.path.startswith("/internal/"):
        provided = request.headers.get("X-AI-Secret", "")
        # compare_digest 는 비-ASCII str 에 TypeError 를 낸다. bytes 로 비교한다.
        if not compare_digest(provided.encode("utf-8", "replace"), config.SECRET.encode("utf-8")):
            # 값은 로그에 남기지 않는다 — 오타로 진짜 시크릿이 찍힐 수 있다.
            log.warning(
                "시크릿 불일치 401 — %s, 헤더 %s",
                request.url.path,
                "있음" if provided else "없음",
            )
            await _drain(request)
            return JSONResponse(
                {"code": "UNAUTHORIZED", "message": "X-AI-Secret 불일치"}, status_code=401
            )
    return await call_next(request)


@app.get(
    "/healthz",
    response_model=HealthResponse,
    summary="준비 상태",
    description=(
        "준비되면 200, 준비 전이거나 로드 실패면 **503** 이고 본문 형태는 같다.\n\n"
        "상태 코드만 봐도 되고 `ready` 만 봐도 된다 — 둘은 항상 일치한다. 백엔드는 이걸로 "
        "타임아웃을 기다리지 않고 즉시 `UNAVAILABLE` 을 판정할 수 있다.\n\n"
        "시크릿을 요구하지 않는다 — GPU 를 쓰지 않고, 데모 직전 `curl` 한 번으로 확인하는 "
        "용도이기 때문이다 (README §9)."
    ),
)
def healthz(response: Response) -> HealthResponse:
    ready = infer.is_ready()
    response.status_code = 200 if ready else 503
    return HealthResponse(
        ready=ready,
        modelVersion=config.MODEL_VERSION,
        warmedUp=infer.warmed_up(),
        error=infer.load_error(),
    )


@app.post(
    "/internal/infer",
    response_model=InferResponse,
    summary="사진 1장 추론",
    description=(
        "`X-AI-Secret` 헤더 필수. `file` 은 **원본 JPEG**(리사이즈·EXIF 처리 없이)이다.\n\n"
        "`inferenceMs` 는 JPEG 디코딩·EXIF 회전·letterbox·추론·좌표 변환과 GPU 대기를 "
        "포함하고 네트워크를 제외한다.\n\n"
        "`items: []` 는 **정상 응답**이다 — 쓰레기를 못 찾았다는 뜻이고 장애가 아니다."
    ),
    responses={
        401: {"description": "시크릿 불일치"},
        422: {"description": "이미지를 열 수 없음 / 필드 누락"},
        503: {"description": "모델 미로드 또는 워밍업 미완료"},
    },
)
def internal_infer(file: Annotated[UploadFile, File()]) -> InferResponse:
    if not infer.is_ready():
        raise ContractError(503, "AI_UNAVAILABLE", infer.load_error() or "워밍업 미완료")

    # 동기(`def`) 엔드포인트라 스레드풀에서 돈다 → JPEG 디코딩이 병렬화되고 이벤트 루프가
    # 막히지 않는다. 그래서 `await file.read()` 가 아니라 동기 파일 객체를 읽는다 (README §8).
    raw = file.file.read()
    if not raw:
        raise ContractError(422, "INVALID_IMAGE", "빈 파일")

    try:
        items, elapsed_ms = infer.infer(raw)
    except infer.ImageDecodeError as e:
        raise ContractError(422, "INVALID_IMAGE", str(e)) from e
    except Exception as e:  # noqa: BLE001
        # 추론이 터져도 프로세스는 유지한다. 백엔드가 이걸 UNAVAILABLE 로 바꿔 앱을
        # 수동 입력으로 내려보낸다 — 사다리 바닥은 항상 수동 입력이다.
        log.exception("추론 실패")
        raise ContractError(503, "AI_UNAVAILABLE", f"{type(e).__name__}: {e}") from e

    return InferResponse(
        modelVersion=config.MODEL_VERSION,
        inferenceMs=round(elapsed_ms),
        items=items,
    )
