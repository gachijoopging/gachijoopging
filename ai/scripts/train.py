"""학습 실행 — ⑩(파이프라인 검증) 과 ⑪(본학습) 이 같은 스크립트를 쓴다.

    uv run python scripts/train.py --smoke        # 3에폭. 파이프라인 검증 (⑩)
    uv run python scripts/train.py                # 250에폭 본학습 (⑪)
    uv run python scripts/train.py --no-general   # GENERAL 뺀 변형 (⑫ A/B 의 B)

**설정을 CLI 인자로 노출하지 않는다.** 아래 `TRAIN` 을 고쳐야 바뀌고, 그러면 diff 가 남아
"변경점을 `experiment-log.md` §4 에 적는다"는 약속이 지켜진다. `imgsz` 는 추론과 반드시 같아야 하는
**유일한 절대 조건**이라 특히 그렇다 — 인자로 열어 두면 서빙에 올릴 수 없는 run 이 만들어진다.

두 플래그는 이 규칙의 예외가 아니다. **설정이 아니라 이름 붙은 변형을 고르고**, 고르는 축
둘(에폭·데이터셋)은 `experiment-log.md` §2·§3 이 이미 열로 갖고 있어 기록에서 사라지지 않는다.

**프리플라이트는 "에러 없이 조용히 틀리는" 것만 잡는다.** 하나라도 걸리면 학습을 시작하지
않는다. 본학습은 **약 40분**이라(⑩ 실측 — `experiment-log.md` §6) 태우는 비용이 근거는 아니다.
근거는 **클래스 순서가 어긋난 run 은 지표가 정상으로 보인다**는 것 — 결과만 봐서는 알 수 없다.
"""

from __future__ import annotations

import argparse
import os
import subprocess
import sys
from pathlib import Path

# **ultralytics import 보다 먼저여야 한다.** 이유(요청 처리 중 pip install)는 `app/__init__.py`
# 에 적혀 있다. 여기서 다시 세팅하는 건 train.py 가 `app` 을 안 쓰게 돼도 유지되도록.
os.environ.setdefault("YOLO_AUTOINSTALL", "false")

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.classes import CLASSES  # noqa: E402  (클래스 순서는 학습·서빙이 공유하는 계약이다)

AI_DIR = Path(__file__).resolve().parent.parent

# `experiment-log.md` §1 고정 설정. **여기는 사본이고 정본은 그쪽이다** —
# 바꿀 때는 그 파일 §4 의 해당 run "변경점" 에 이유를 함께 적는다.
TRAIN: dict[str, int] = {
    "imgsz": 1024,
    "batch": 64,
    "epochs": 250,
    "patience": 50,
    "close_mosaic": 20,
    "device": 1,
}
SMOKE_EPOCHS = 3
WEIGHTS = AI_DIR / "weights" / "yolo26s.pt"
DATA_YAML = AI_DIR / "datasets" / "trash" / "data.yaml"
# ⑫ A/B 의 B. `scripts/make_no_general.py` 가 만들고 **이름은 7개 그대로다** —
# 다른 것은 `GENERAL` 라벨 줄이 없다는 것뿐이라 이미지 수 검사·클래스 검사가 그대로 산다.
NOGEN_YAML = AI_DIR / "datasets" / "trash_nogen" / "data.yaml"
# ⑩ 실측 피크 62.3 GiB (63,841 MiB) + 약간의 여유. `progress.md` §3.5.
# 작은 배치에서 뽑은 선형 추정(배치 1당 734MB → 46 GiB)은 34% 낮았다 — 그 값을 쓰지 않는다.
# 문턱을 실측 피크에 딱 맞추면 안 된다: 모자라면 ultralytics 가 배치를 자동으로 줄여
# (`trainer.py:523`) `batch=64` 라고 기록된 run 이 실제로는 다른 배치가 된다.
NEED_GIB = 66
EXPECTED_IMAGES = {"train": 1369, "val": 131}  # ⑨ 가 만든 수 (`progress.md` §3.3)

_passed = 0
_failed: list[str] = []


def check(name: str, cond: bool, detail: str = "") -> bool:
    """build_dataset.py·smoke.py 와 같은 패턴. 실패는 모아서 종료 코드로 낸다."""
    global _passed
    if cond:
        _passed += 1
        print(f"  PASS  {name}" + (f"  ({detail})" if detail else ""))
    else:
        _failed.append(name)
        print(f"  FAIL  {name}  {detail}")
    return cond


def free_gib(index: int) -> float:
    """GPU `index` 의 남은 VRAM (GiB). nvidia-smi 가 MiB 로 준다."""
    out = subprocess.run(
        ["nvidia-smi", f"--id={index}", "--query-gpu=memory.total,memory.used",
         "--format=csv,noheader,nounits"],
        capture_output=True, text=True, check=True,
    ).stdout
    total, used = (float(v) for v in out.split(","))
    return (total - used) / 1024


def preflight(data_yaml: Path) -> None:
    """학습 전 4가지. 전부 통과해야 `model.train()` 까지 간다.

    `data_yaml` 을 인자로 받는다 — `--no-general` 이 전역을 바꾸게 하면 `main()` 이
    전역을 읽은 뒤 `global` 을 선언하는 꼴이 되고 파이썬이 그걸 거부한다
    (`eval.py` 의 `weights` 와 같은 이유).
    """
    print("[프리플라이트]")

    check("weights 존재", WEIGHTS.exists(), str(WEIGHTS))
    # 없으면 ultralytics 가 이름만 보고 인터넷에서 새로 받는다 — W1 에서 검증한 그 파일이
    # 아닐 수 있고, 공유 머신에서 조용히 네트워크를 타는 것도 원치 않는다.

    for split, expected in EXPECTED_IMAGES.items():
        images = len(list((data_yaml.parent / "images" / split).glob("*.jpg")))
        labels = len(list((data_yaml.parent / "labels" / split).glob("*.txt")))
        check(f"{split} 이미지·라벨 수", images == labels == expected,
              f"이미지 {images} · 라벨 {labels} · 기대 {expected}")

    # ultralytics 는 torch 를 끌어와 몇 초가 걸린다. 위 검사들이 실패할 때 그 비용을 낼
    # 이유가 없어 함수 안에서 import 한다 (build_dataset.py 와 같은 이유).
    from ultralytics.data.utils import check_det_dataset

    try:
        info = check_det_dataset(str(data_yaml))
        names = [info["names"][i] for i in range(len(info["names"]))]
        check("클래스 이름·순서 일치", names == list(CLASSES), f"{names}")
        # ⑧ 에서 Label Studio 가 라벨을 알파벳순으로 매겨 GLASS 가 4 대신 3 으로 나간 전례가
        # 있다. 순서가 어긋난 weights 는 출력이 전부 다른 카테고리로 해석된다 — 조용히 틀린다.
    except Exception as e:  # 경로 해석 실패는 여기서만 드러난다
        check("data.yaml 로드", False, f"{type(e).__name__}: {e}")

    device = TRAIN["device"]
    try:
        gib = free_gib(device)
        check(f"GPU {device} 여유 VRAM", gib >= NEED_GIB, f"{gib:.0f} GiB / 필요 {NEED_GIB}")
        # `experiment-log.md` §1 이 "학습 직전에 nvidia-smi 로 다시 확인" 이라고 적은 것을
        # 여기서 한다.
        # 공유 머신이라 남의 프로세스가 언제든 들어온다.
    except (OSError, subprocess.CalledProcessError) as e:
        check(f"GPU {device} 조회", False, f"{type(e).__name__}: {e}")


def main() -> int:
    ap = argparse.ArgumentParser(description="YOLO 학습 실행")
    ap.add_argument("--smoke", action="store_true",
                    help=f"{SMOKE_EPOCHS}에폭만. 파이프라인 검증용 (⑩)")
    ap.add_argument("--no-general", action="store_true",
                    help="GENERAL 라벨을 뺀 변형으로 학습한다 (⑫ A/B 의 B)")
    args = ap.parse_args()
    sys.stdout.reconfigure(errors="replace")

    settings = TRAIN | ({"epochs": SMOKE_EPOCHS} if args.smoke else {})
    # 학습 **설정**은 여전히 CLI 로 안 연다 (위 docstring). 여기서 고르는 것은 데이터셋과
    # run 이름뿐이고, 둘 다 `experiment-log.md` §2·§3 이 이미 열로 갖고 있는 축이다.
    data_yaml = NOGEN_YAML if args.no_general else DATA_YAML
    run_name = ("smoke" if args.smoke else "train") + ("_nogen" if args.no_general else "")

    preflight(data_yaml)
    print(f"\n{_passed} 통과 · {len(_failed)} 실패")
    if _failed:
        print("실패: " + " · ".join(_failed))
        print("학습을 시작하지 않는다.")
        return 1

    print("\n[설정]  " + " · ".join(f"{k}={v}" for k, v in settings.items()))
    print(f"  데이터셋 {data_yaml.parent.name} · run {run_name}")
    if args.no_general:
        print("  --no-general: GENERAL 라벨만 뺀 변형이다. 이름은 7개 그대로고 "
              "학습 예시가 0일 뿐이다.")
    if args.smoke:
        print(f"  --smoke: epochs 만 {TRAIN['epochs']} → {SMOKE_EPOCHS}. 나머지는 본학습과 같다.")
        print(f"  close_mosaic={TRAIN['close_mosaic']} 는 이 런에서 걸리지 않는다 "
              f"(epoch == {SMOKE_EPOCHS} - {TRAIN['close_mosaic']} 가 안 된다).")
    # **로그에 찍힐 문자열을 여기서 그대로 쓰지 않는다.** 안내 문구가 검색어를 담으면
    # 그 문구 자신이 걸려서 "0건"이 "1건"으로 보인다 — ⑩ 에서 실제로 당했다.
    print("\n로그에서 확인할 것 — 결정된 옵티마이저와 lr0 · 진행줄의 VRAM · 라벨 스캔의 "
          "손상 건수 · 데이터로더 워커 수 · OOM 으로 배치가 자동 축소됐는지")

    from ultralytics import YOLO

    YOLO(str(WEIGHTS)).train(
        data=str(data_yaml),
        project=str(AI_DIR / "runs" / "detect"),  # 절대 경로여야 CWD 와 무관하게 여기 쓴다
        name=run_name,  # run id = 이 디렉터리 이름 (`experiment-log.md` §3)
        **settings,
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
