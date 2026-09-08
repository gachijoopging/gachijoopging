"""환경 설정.

시크릿은 저장소에 두지 않는다 — `ai/.env`(`.gitignore` 가 차단) 또는 프로세스 환경변수.
`.env` 를 자동으로 읽으므로 README §8 의 실행 명령(`uvicorn app.main:app --reload`)이
추가 플래그 없이 그대로 동작한다.
"""

import os
from pathlib import Path

from dotenv import load_dotenv

AI_DIR = Path(__file__).resolve().parent.parent
load_dotenv(AI_DIR / ".env")

# ---------------------------------------------------------------------------
# 환경변수로 열지 않는 값
# ---------------------------------------------------------------------------
# imgsz 는 설정이 아니다. "학습과 추론이 동일" 이 이 프로젝트의 유일한 절대 조건이라
# (README §5) 배포마다 달라질 수 있는 자리에 두면 조용히 어긋난다. 바꿔야 할 일이
# 생기면 학습 쪽과 함께 코드로 바꾼다.
IMGSZ = 1024

# ---------------------------------------------------------------------------
# 환경변수
# ---------------------------------------------------------------------------
SECRET = os.environ.get("AI_SECRET", "").strip()
WEIGHTS = Path(os.environ.get("AI_WEIGHTS") or AI_DIR / "weights" / "yolo26s-1024-v1.pt")
# 파일명과 같은 값을 쓴다 — 응답의 버전만 보고 어느 weights 였는지 되찾을 수 있다.
# **weights 가 그대로여도 보정 맵이 바뀌면 올린다** (app/calibrate.py) — 다음은 ⑯.
MODEL_VERSION = os.environ.get("AI_MODEL_VERSION", "yolo26s-1024-v1")

_device = os.environ.get("AI_DEVICE", "0").strip()
DEVICE: int | str = int(_device) if _device.isdigit() else _device

# CONF_MIN 미만은 items 에 넣지 않는다. **실측값은 W4 ⑰**이고 지금은 임시다.
# 0.25 = Ultralytics 기본값. 근거 없는 숫자를 새로 만들지 않기 위해 기본값을 쓴다
# (진행상황.md §3 "미정 항목을 추측으로 채우지 않는다").
CONF_MIN = float(os.environ.get("AI_CONF_MIN", "0.25"))

# API 계약. 앱·백엔드·문서 3곳에 박혀 있어 바꾸지 않는다 (README §3.3).
# AI 서버는 이 값을 응답에 쓰지 않는다 — 판정은 소비자가 하고, 여기서는 CONF_MIN 검증에만 쓴다.
UNCLASSIFIED_THRESHOLD = 0.7


def _validate() -> None:
    if not SECRET:
        raise RuntimeError(
            "AI_SECRET 이 없습니다. 터널 URL 은 공개되므로 시크릿 없이 뜨면 누구나 GPU 를 씁니다"
            " (서버설계 결정 29). ai/.env 에 AI_SECRET=... 을 넣으세요 — 커밋하지 않습니다."
        )
    if not 0.0 < CONF_MIN < UNCLASSIFIED_THRESHOLD:
        raise RuntimeError(
            f"AI_CONF_MIN={CONF_MIN} 은 (0, {UNCLASSIFIED_THRESHOLD}) 범위여야 합니다."
            f" {UNCLASSIFIED_THRESHOLD} 이상이면 모든 항목이 임계값을 넘어 unclassified 가"
            " 영원히 false 가 되고, 앱의 사용자 확인 플로우 전체가 죽은 코드가 됩니다"
            " (README §3.3)."
        )


_validate()
