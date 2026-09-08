"""bbox 시각화 — 서버가 돌려준 좌표를 **앱과 같은 규칙으로** 그려서 눈으로 확인한다.

W1 의 완료 판정이 "세로 사진의 박스가 제 위치에 그려진다"이고, bbox 좌표계 오류는
**에러가 나지 않기 때문에** 숫자만 봐서는 못 잡는다 (`docs/openapi.yaml`). 그래서 이
도구는 두 가지를 의도적으로 지킨다:

1. **서버 HTTP 응답의 `{x,y,w,h}` 만 쓴다.** ultralytics 의 `result.plot()` 을 쓰면
   라이브러리 내부 좌표로 그려지므로 변환 버그가 그림에서 사라져 검증이 무의미해진다.
2. **`to_upright` 를 적용한 이미지에 그린다.** 앱도 EXIF 를 적용하는 로더로 표시하므로
   (Coil·Glide·Flutter Image 기본 동작) 그게 앱 화면과 같은 조건이다.

사용:
    uv run python scripts/draw_boxes.py 사진.jpg
    uv run python scripts/draw_boxes.py *.jpg --base-url https://<고정도메인>
    uv run python scripts/draw_boxes.py 세로사진.jpg --show-center-bug

`--show-center-bug` 는 같은 숫자를 "x,y 가 중심점"으로 해석해 빨간 박스로 겹쳐 그린다.
두 박스가 `(w/2, h/2)` 만큼 어긋난 것이 보이면 초록 박스가 맞다는 확인이 된다.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import requests
from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.preprocess import to_upright  # noqa: E402  (서버와 같은 전처리를 쓰기 위해)

GREEN = (60, 220, 90)
RED = (240, 60, 60)


def load_font(size: int) -> ImageFont.ImageFont:
    for name in ("malgun.ttf", "arial.ttf", "DejaVuSans.ttf"):
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            continue
    return ImageFont.load_default()


def read_secret(ai_dir: Path) -> str:
    import os

    if v := os.environ.get("AI_SECRET"):
        return v.strip()
    env = ai_dir / ".env"
    if env.exists():
        for line in env.read_text(encoding="utf-8").splitlines():
            if line.startswith("AI_SECRET="):
                return line.split("=", 1)[1].strip()
    sys.exit("AI_SECRET 을 찾을 수 없다 — 환경변수나 ai/.env 에 넣어라")


def draw_one(path: Path, items: list[dict], out_dir: Path, show_center_bug: bool) -> Path:
    raw = Image.open(path)
    stored = raw.size
    orientation = raw.getexif().get(274)
    img = to_upright(raw)  # 앱이 보는 것과 같은 정방향 이미지
    w, h = img.size

    canvas = img.copy()
    d = ImageDraw.Draw(canvas)
    lw = max(2, h // 320)
    font = load_font(max(13, h // 45))

    print(f"\n{path.name}")
    print(f"  저장 픽셀 {stored[0]}x{stored[1]} · EXIF Orientation={orientation} "
          f"· 정방향 {w}x{h}")
    if not items:
        print("  검출 0개 — 그릴 박스가 없다 (items:[] 는 정상 응답이다)")
    print(f"  {'category':<10} {'conf':>5}   정규화 (x, y, w, h)         → 픽셀 (좌상단)-(우하단)")

    for it in items:
        b = it["bbox"]
        # 앱 렌더링과 같은 산수: x,y 는 좌상단, w·h 는 크기. 곱하는 축을 틀리면 안 된다
        # (x·w 는 **너비**, y·h 는 **높이**).
        x0, y0 = b["x"] * w, b["y"] * h
        x1, y1 = (b["x"] + b["w"]) * w, (b["y"] + b["h"]) * h
        d.rectangle((x0, y0, x1, y1), outline=GREEN, width=lw)

        label = f"{it['category']} {it['aiConfidence']:.2f}"
        tb = d.textbbox((0, 0), label, font=font)
        tw, th = tb[2] - tb[0], tb[3] - tb[1]
        ty = max(0, y0 - th - 6)  # 화면 위로 넘어가면 박스 안쪽에 붙인다
        d.rectangle((x0, ty, x0 + tw + 8, ty + th + 6), fill=GREEN)
        d.text((x0 + 4, ty + 2), label, fill=(20, 20, 20), font=font)

        if show_center_bug:
            # 같은 숫자를 '중심점' 으로 해석했을 때 — 이렇게 어긋나는 것을 보여 준다
            cx, cy = b["x"] * w, b["y"] * h
            d.rectangle((cx - b["w"] * w / 2, cy - b["h"] * h / 2,
                         cx + b["w"] * w / 2, cy + b["h"] * h / 2),
                        outline=RED, width=max(1, lw // 2))

        print(f"  {it['category']:<10} {it['aiConfidence']:>5.2f}   "
              f"({b['x']:.4f}, {b['y']:.4f}, {b['w']:.4f}, {b['h']:.4f})   "
              f"→ ({x0:.0f},{y0:.0f})-({x1:.0f},{y1:.0f})")

    out_dir.mkdir(parents=True, exist_ok=True)
    out = out_dir / f"{path.stem}_boxes.jpg"
    canvas.convert("RGB").save(out, quality=92)
    print(f"  → {out}")
    return out


def main() -> int:
    ai_dir = Path(__file__).resolve().parent.parent
    ap = argparse.ArgumentParser()
    ap.add_argument("images", nargs="+", type=Path)
    ap.add_argument("--base-url", default="http://127.0.0.1:8000")
    ap.add_argument("--out-dir", type=Path, default=ai_dir / "runs" / "boxes",
                    help="기본값은 runs/ 아래 — .gitignore 가 차단한다")
    ap.add_argument("--show-center-bug", action="store_true",
                    help="같은 숫자를 중심점으로 해석한 박스를 빨간색으로 겹쳐 그린다")
    args = ap.parse_args()
    # cp949 콘솔에서 em dash 를 못 찍어 print 가 터진다. 검출 0개일 때만 밟는 경로라
    # **정상 응답에서만 죽는다** — `items:[]` 는 계약상 정상이다.
    sys.stdout.reconfigure(errors="replace")

    secret = read_secret(ai_dir)
    base = args.base_url.rstrip("/")

    try:
        h = requests.get(f"{base}/healthz", timeout=10)
    except requests.RequestException as e:
        sys.exit(f"서버에 연결할 수 없다 ({base}): {e}\n  먼저 실행: uv run uvicorn app.main:app")
    if h.status_code != 200:
        sys.exit(f"서버가 준비되지 않았다: {h.status_code} {h.text[:200]}")
    print(f"대상 {base} · modelVersion={h.json()['modelVersion']}")

    for path in args.images:
        if not path.exists():
            print(f"  건너뜀 (없는 파일): {path}")
            continue
        r = requests.post(
            f"{base}/internal/infer",
            headers={"X-AI-Secret": secret},
            files={"file": (path.name, path.read_bytes(), "image/jpeg")},
            timeout=120,
        )
        if r.status_code != 200:
            print(f"\n{path.name}\n  추론 실패 {r.status_code}: {r.text[:200]}")
            continue
        d = r.json()
        print(f"\n  inferenceMs={d['inferenceMs']}", end="")
        draw_one(path, d["items"], args.out_dir, args.show_center_bug)

    return 0


if __name__ == "__main__":
    sys.exit(main())
