"""팀 사진 수령 → 라벨링용 정방향 사본 + 파일명 부여.

**왜 사본을 만드나** — 라벨링 도구가 EXIF Orientation 을 어떻게 다루는지는 우리가 통제할
수 없다. ⑦ 에서 TACO 주석이 EXIF 적용 후 픽셀 기준이라 해상도 불일치 152건이 났던 것과
같은 종류의 함정인데, 이쪽은 **에러 없이 조용히 틀어진다** — 도구가 EXIF 를 무시하면 세로
사진에 가로 좌표가 찍히고 라벨링 화면은 눈으로 멀쩡해 보인다.

EXIF 를 픽셀에 적용해 재저장하면 사본에는 방향 태그가 남지 않으므로 도구가 무엇을 하든
결과가 같다. bbox 는 정규화 좌표라 **사본에서 딴 값이 원본에도 그대로 유효**하다 — 학습
로더가 EXIF 를 적용하기 때문이다 (`진행상황.md` §3.3).

리사이즈는 하지 않는다. 담배꽁초는 `imgsz=1024` 에서 중앙 10.8px 인데(개발일지 ⑥) 줄이면
라벨러가 경계를 볼 수 없다. 로컬 도구라 용량은 제약이 아니다.

**왜 이름을 여기서 붙이나** — 폰은 `IMG_1234.jpg` 로 저장하고, 촬영 중에 폰에서 파일명을
바꾸는 것은 비현실적이다. 팀원은 USB 에 **자기 이니셜 폴더**로 넣기만 하고(연출 촬영은
`-s` 폴더), 규칙에 맞는 이름은 이 스크립트가 붙인다. `진행상황.md` §3.3 의 파일명 규칙
자체는 그대로다 — 그 이름을 만드는 책임만 팀원에서 스크립트로 옮긴 것이다. 30개 파일명을
손으로 맞추는 것보다 폴더 하나를 맞추는 쪽이 틀릴 자리가 적다.

입력 구조 (USB 로 받은 그대로):
    받은폴더/
      ssh/     IMG_0001.jpg ...      실제로 발견한 것
      ssh-s/   IMG_0042.jpg ...      연출한 것 → 검증셋에서 제외된다
      khc/     ...

사용:
    uv run python scripts/prep_labeling.py <받은폴더> --date 20260806
"""

from __future__ import annotations

import argparse
import csv
import re
import sys
from collections import Counter
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.preprocess import to_upright  # noqa: E402  (서빙과 같은 "정방향" 정의를 쓴다)

# `docs/작업배분.md` 의 등록된 이니셜. 없는 값은 **차단하지 않고 경고만** 한다 — 팀원이
# 늘거나 이니셜이 바뀌었을 때 스크립트가 사진을 막아서면 안 된다.
KNOWN_INITIALS = ("ssh", "khc", "bky", "yh", "yy")

FOLDER_RE = re.compile(r"^(?P<initial>[a-z]{2,3})(?P<staged>-s)?$")
JPEG_SUFFIXES = (".jpg", ".jpeg")


def prep_one(src: Path, dst: Path) -> int:
    """정방향 사본을 쓰고 원본의 EXIF Orientation 을 돌려준다."""
    with Image.open(src) as raw:
        orientation = raw.getexif().get(274, 1)
        # EXIF 를 넘기지 않는다 — 사본에 방향 태그가 남으면 사본을 만든 이유가 없어진다.
        to_upright(raw).save(dst, "JPEG", quality=95, subsampling=0)
    return orientation


def main() -> int:
    # cp949 콘솔(Git Bash 파이프 등)에서는 em dash 를 못 찍어 print 가 터진다. 사본을 다
    # 쓴 뒤에 죽으므로 **위반 보고만 사라져** 성공한 줄 알게 된다 — 그쪽이 더 위험하다.
    sys.stdout.reconfigure(errors="replace")

    ai_dir = Path(__file__).resolve().parent.parent
    ap = argparse.ArgumentParser(description="팀 사진 수령 → 라벨링용 정방향 사본")
    ap.add_argument("src", type=Path, help="이니셜 폴더들이 들어 있는 폴더 (USB 로 받은 그대로)")
    ap.add_argument("--date", required=True, help="촬영 세션 날짜 YYYYMMDD (한 세션 = 한 날짜)")
    ap.add_argument("--out", type=Path, default=ai_dir / "datasets" / "own" / "labeling",
                    help="기본값은 datasets/ 아래 — ai/.gitignore 가 차단한다")
    args = ap.parse_args()

    if not args.src.is_dir():
        sys.exit(f"받은 폴더가 없다: {args.src}")
    if not re.fullmatch(r"\d{8}", args.date):
        sys.exit(f"--date 는 YYYYMMDD 8자리다: {args.date}")

    folders = sorted(p for p in args.src.iterdir() if p.is_dir())
    if not folders:
        sys.exit(f"이니셜 폴더가 없다: {args.src}\n  구조: 받은폴더/ssh/, 받은폴더/ssh-s/ ...")

    args.out.mkdir(parents=True, exist_ok=True)
    orientations: Counter[int] = Counter()
    manifest: list[tuple[str, str, str]] = []
    per_person: dict[str, list[int]] = {}   # 이니셜 → [실제, 연출]
    skipped: list[Path] = []
    bad_folders: list[str] = []
    unknown: list[str] = []

    for folder in folders:
        m = FOLDER_RE.match(folder.name)
        if not m:
            bad_folders.append(folder.name)
            continue
        initial, staged = m["initial"], bool(m["staged"])
        if initial not in KNOWN_INITIALS:
            unknown.append(folder.name)

        files = sorted(p for p in folder.iterdir() if p.is_file())
        jpegs = [p for p in files if p.suffix.lower() in JPEG_SUFFIXES]
        skipped += [p for p in files if p.suffix.lower() not in JPEG_SUFFIXES]

        suffix = "-s" if staged else ""
        for seq, src in enumerate(jpegs, start=1):
            name = f"{initial}-{args.date}-{seq:03d}{suffix}.jpg"
            orientations[prep_one(src, args.out / name)] += 1
            manifest.append((name, folder.name, src.name))

        counts = per_person.setdefault(initial, [0, 0])
        counts[1 if staged else 0] += len(jpegs)

    if not manifest:
        sys.exit("처리한 사진이 0장이다 — 폴더 안에 JPEG 이 있는지 확인해라")

    # 이름을 바꾸면 원본 추적이 이 표에만 남는다. 검증셋 사진의 출처는 §4.3 이 무결성으로
    # 다루는 대상이라, "이 사진 누가 어디서 찍었나" 를 되물을 길을 없애지 않는다.
    # BOM 을 붙인다. 이 표는 사람이 "이 사진 누가 찍었나" 를 볼 때 여는 파일이고, 한국어
    # Windows 의 Excel 은 BOM 이 없으면 cp949 로 읽어 머리글을 깨뜨린다. 기계가 읽는
    # `configs/taco_to_7.csv` 는 반대로 BOM 없음이 정본이다 (§3.3).
    manifest_path = args.out / "_manifest.csv"
    with manifest_path.open("w", encoding="utf-8-sig", newline="") as f:
        w = csv.writer(f)
        w.writerow(["사본", "받은폴더", "원본파일명"])
        w.writerows(manifest)

    total = len(manifest)
    staged_total = sum(c[1] for c in per_person.values())
    rotated = sum(n for o, n in orientations.items() if o != 1)

    print(f"사본 {total}장 → {args.out}")
    print(f"  추적표 → {manifest_path.name}")
    print(f"\n  {'이니셜':<8}{'실제':>6}{'연출':>6}")
    for initial in sorted(per_person):
        real, st = per_person[initial]
        print(f"  {initial:<8}{real:>6}{st:>6}")

    print(f"\n  EXIF 로 회전된 사진 {rotated}장 "
          f"(Orientation 분포: {dict(sorted(orientations.items()))})")
    if rotated:
        print("  ↑ 이 사진들이 사본을 만드는 이유다. 원본에 그대로 라벨하면 도구가 EXIF 를")
        print("    무시하는 순간 이만큼이 조용히 틀어진다")
    print(f"  연출 촬영 {staged_total}장 — 검증셋에서 제외되고 학습셋으로 간다 (§3.3)")
    print(f"  검증셋 후보 {total - staged_total}장")

    if skipped:
        print(f"\n건너뜀 — JPEG 이 아님 ({len(skipped)}건): "
              f"{', '.join(p.name for p in skipped[:10])}"
              f"{' …' if len(skipped) > 10 else ''}")

    if bad_folders:
        print(f"\n폴더 이름 규칙 위반 ({len(bad_folders)}건) — 통째로 건너뛰었다:")
        print("  형식: {이니셜} 또는 {이니셜}-s   예: ssh, ssh-s")
        for name in bad_folders:
            print(f"  - {name}")

    if unknown:
        print(f"\n등록되지 않은 이니셜 ({len(unknown)}건) — 오타가 아닌지 확인:")
        print(f"  등록된 값: {', '.join(KNOWN_INITIALS)}")
        for name in unknown:
            print(f"  - {name}")

    return 1 if (bad_folders or skipped) else 0


if __name__ == "__main__":
    sys.exit(main())
