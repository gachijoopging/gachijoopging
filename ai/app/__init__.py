"""가치줍깅 AI 추론 서버.

- `main` — FastAPI 앱 (계약: README §2)
- `infer` — 모델 로드·워밍업·추론. GPU 작업은 전용 스레드 1개에서만 돈다
- `preprocess` — EXIF 정방향 보정 (전처리의 전부)
- `classes` — 7종 카테고리와 W1 임시 COCO 매핑
- `calibrate` — confidence 보정. 항등 함수 (⑯ 은 범위 밖으로 닫혔다)
- `config` — 환경 설정. import 시점에 시크릿·임계값을 검증한다
"""

import os

# Ultralytics 의 런타임 자동 설치를 끈다. **ultralytics import 보다 먼저 설정돼야 한다**
# (`utils/__init__.py` 가 import 시점에 이 값을 읽는다) — 그래서 패키지 __init__ 에 둔다.
#
# 끄는 이유 (W1 ② 에서 실제로 당했다): ultralytics 가 `PIL.Image.open` 을 몽키패치해 두고,
# 이미지 열기가 실패하면 HEIC 일 수 있다고 보고 `pip install pi-heif` 를 **요청 처리 중에**
# 실행한다. 깨진 파일 하나가 서버에서 pip 를 돌리는 셈이다. 결과는 세 가지로 나쁘다 —
# ① uv.lock 에 없는 패키지가 venv 에 생겨 환경이 잠금 파일과 어긋난다
# ② 요청 경로에 네트워크 의존이 생긴다 (데모 당일 회선이 느리면 그만큼 응답이 늦는다)
# ③ 어차피 계약은 JPEG 이라 필요 없는 설치다
# 끄면 `check_requirements` 가 False 만 돌려주고, 깨진 파일은 그대로 422 로 나간다.
os.environ.setdefault("YOLO_AUTOINSTALL", "false")
