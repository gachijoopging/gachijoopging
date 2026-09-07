"""전처리 — EXIF 정방향 보정 하나뿐이다.

리사이즈는 하지 않는다. Ultralytics 가 학습·추론 양쪽에서 동일한 letterbox 를 적용하고
좌표 역변환까지 처리하므로, 손으로 리사이즈하면 이중 보간으로 화질만 잃고
역변환에서 letterbox 패딩을 빼는 단계를 잊는 사고를 부른다 (README §3.1).

**W1 ① 확인 결과**: Ultralytics 학습 데이터 로더는 EXIF 를 픽셀에 이미 적용한다
(`cv2.imdecode`, opencv-python 4.10·4.12·5.0 공통). 따라서 학습 스크립트가 이 함수를
import 할 필요는 없고 실제 호출자는 서빙뿐이다. 그래도 "정방향"의 정의를 한 곳에 두어야
데이터셋 점검 도구를 만들 때 서빙과 다른 규칙을 쓰는 일이 없다.
"""

from PIL import Image, ImageOps


def to_upright(img: Image.Image) -> Image.Image:
    """EXIF Orientation 을 픽셀에 적용한 정방향 RGB 이미지.

    `convert("RGB")` 는 취향이 아니라 필수다 — 그레이스케일·CMYK JPEG 가 들어오면
    채널 수가 3이 아니라서 추론이 터진다.
    """
    return ImageOps.exif_transpose(img).convert("RGB")
