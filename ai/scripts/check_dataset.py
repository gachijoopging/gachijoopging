"""데이터셋 라벨을 이미지에 그려 눈으로 확인한다 — ⑨ 의 마지막 관문.

    uv run python scripts/check_dataset.py --split val --rotated-first
    uv run python scripts/check_dataset.py --split train -n 20

**왜 숫자 검사로 부족한가** — 정규화 분모를 틀린 축으로 잡아도 왕복(픽셀→정규화→픽셀)은
항상 맞는다. 틀린 축으로 나눴다가 틀린 축으로 곱하면 원래 값이 돌아오기 때문이다. 그래서
좌표계 오류는 **그림으로만 보인다.**

`--rotated-first` 는 EXIF Orientation ≠ 1 인 사진을 먼저 고른다. 틀어질 수 있는 것이
그쪽뿐이므로 10장을 볼 수 있다면 그 10장을 봐야 한다.

`scripts/draw_boxes.py` 와 다른 도구다. 그쪽은 **서버 HTTP 응답**의 좌표를 그리고,
이쪽은 **데이터셋 라벨 파일**을 그린다.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.classes import CLASSES  # noqa: E402
from app.preprocess import to_upright  # noqa: E402  (서빙과 같은 "정방향" 정의를 쓴다)

AI_DIR = Path(__file__).resolve().parent.parent
GREEN = (60, 220, 90)


def load_font(size: int) -> ImageFont.ImageFont:
    for name in ("malgun.ttf", "arial.ttf", "DejaVuSans.ttf"):
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            continue
    return ImageFont.load_default()


def draw_one(image_path: Path, label_path: Path, out_dir: Path) -> Path:
    raw = Image.open(image_path)
    stored = raw.size
    orientation = raw.getexif().get(274, 1)
    # 라벨은 **정방향 크기**로 정규화돼 있다. 저장 픽셀에 그리면 회전된 사진이 다 틀어진다.
    canvas = to_upright(raw).convert("RGB")
    width, height = canvas.size

    draw = ImageDraw.Draw(canvas)
    line_width = max(2, height // 320)
    font = load_font(max(13, height // 45))

    rows = [line.split() for line in label_path.read_text(encoding="utf-8").split("\n") if line]
    print(f"\n{image_path.name}")
    print(f"  저장 {stored[0]}x{stored[1]} · Orientation={orientation} "
          f"· 정방향 {width}x{height} · 박스 {len(rows)}개")

    for index, cx, cy, w, h in rows:
        cx, cy, w, h = float(cx), float(cy), float(w), float(h)
        x0, y0 = (cx - w / 2) * width, (cy - h / 2) * height
        x1, y1 = (cx + w / 2) * width, (cy + h / 2) * height
        draw.rectangle((x0, y0, x1, y1), outline=GREEN, width=line_width)

        label = CLASSES[int(index)]
        box = draw.textbbox((0, 0), label, font=font)
        tw, th = box[2] - box[0], box[3] - box[1]
        ty = max(0, y0 - th - 6)
        draw.rectangle((x0, ty, x0 + tw + 8, ty + th + 6), fill=GREEN)
        draw.text((x0 + 4, ty + 2), label, fill=(20, 20, 20), font=font)
        print(f"    {label:<10} ({x0:.0f},{y0:.0f})-({x1:.0f},{y1:.0f})")

    out_dir.mkdir(parents=True, exist_ok=True)
    out = out_dir / f"{image_path.stem}_labels.jpg"
    canvas.save(out, quality=92)
    return out


def main() -> int:
    ap = argparse.ArgumentParser(description="데이터셋 라벨 시각 확인")
    ap.add_argument("--dataset", type=Path, default=AI_DIR / "datasets" / "trash")
    ap.add_argument("--split", default="val", choices=("val", "train"))
    ap.add_argument("-n", type=int, default=10, help="그릴 장수")
    ap.add_argument("--rotated-first", action="store_true",
                    help="EXIF Orientation != 1 인 사진을 먼저 고른다")
    ap.add_argument("--out-dir", type=Path, default=AI_DIR / "runs" / "dataset_check")
    args = ap.parse_args()
    sys.stdout.reconfigure(errors="replace")

    images = sorted((args.dataset / "images" / args.split).glob("*.jpg"))
    if not images:
        sys.exit(f"이미지가 없다: {args.dataset / 'images' / args.split}\n"
                 f"  먼저: uv run python scripts/build_dataset.py")

    if args.rotated_first:
        # train 은 1,369장이다. 컨텍스트 매니저 없이 정렬하면 핸들을 그만큼 열어 둔다.
        def already_upright(path: Path) -> bool:
            with Image.open(path) as im:
                return im.getexif().get(274, 1) == 1

        images.sort(key=already_upright)

    drawn = 0
    for image_path in images[: args.n]:
        label_path = args.dataset / "labels" / args.split / f"{image_path.stem}.txt"
        if not label_path.exists():
            print(f"\n{image_path.name}\n  라벨 없음 — 건너뜀")
            continue
        draw_one(image_path, label_path, args.out_dir)
        drawn += 1

    print(f"\n{drawn}장 → {args.out_dir}")
    print("이 그림들을 열어서 박스가 물체에 맞는지 확인해라. 어긋나면 정규화 분모를 의심한다.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
