"""`GENERAL` 을 뺀 데이터셋 변형 — ⑫ A/B 의 B.

    uv run python scripts/make_no_general.py             # datasets/trash_nogen 생성
    uv run python scripts/make_no_general.py --dry-run   # 통계만, 파일 안 씀

**`nc` 를 7 그대로 둔다.** `README.md` §4.4 의 B 는 *"API 계약(7종)은 그대로 두고
모델이 `GENERAL` 을 내지 않을 뿐"* 이다. 6종으로 줄이면 서빙 코드(`app/classes.py`)와
`eval.py` 가 A 와 달라져 **A/B 비교에 기계 차이가 섞인다.** YOLO 는 클래스별 독립
sigmoid(BCE)라 학습 예시가 0인 7번째 로짓은 나머지 6종에 영향이 없다.

**이미지는 하드링크로 채운다** — 4.2GB 를 복제하지 않으면서 디스크도 안 쓴다. 라벨만
따로 둘 수는 없다: ultralytics 가 라벨 경로를 이미지 경로의 `/images/` → `/labels/`
치환으로 만들어서 `images/` 라는 이름이 이 폴더 안에 있어야 한다.

**디렉터리 심링크는 쓸 수 없다.** `data/utils.py:552` 의 `(path / data[k]).resolve()` 가
심링크를 따라가 원본 폴더를 스캔하고 **원본 라벨을 읽는다.** 학습 로그는 정상으로
보이는데 A 와 같은 라벨로 도는 — 조용히 틀리는 경로다. 08-04 에 실제로 밟았고,
아래 `[경로 검사]` 두 줄이 그것을 잡는다.
"""

from __future__ import annotations

import argparse
import os
import shutil
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.classes import CLASSES  # noqa: E402  (클래스 순서는 학습·서빙이 공유하는 계약이다)

AI_DIR = Path(__file__).resolve().parent.parent
DROP = "GENERAL"
SPLITS = ("train", "val")

# 2026-08-04 실측 (`datasets/trash` 기준). 구현이 이 숫자를 못 내면 구현이 틀린 것이다.
EXPECTED = {
    "train": {"files": 1369, "dropped": 244, "touched": 174, "emptied": 72, "kept": 3436},
    "val": {"files": 131, "dropped": 31, "touched": 26, "emptied": 9, "kept": 320},
}

_passed = 0
_failed: list[str] = []


def check(name: str, cond: bool, detail: str = "") -> bool:
    """build_dataset.py·train.py 와 같은 패턴. 실패는 모아서 종료 코드로 낸다."""
    global _passed
    if cond:
        _passed += 1
        print(f"  PASS  {name}" + (f"  ({detail})" if detail else ""))
    else:
        _failed.append(name)
        print(f"  FAIL  {name}  {detail}")
    return cond


def filter_split(source: Path, out: Path, split: str, drop: int, dry_run: bool) -> dict[str, int]:
    """`split` 의 라벨에서 클래스 `drop` 줄을 빼고 쓴다. 통계를 돌려준다.

    빈 파일(= `GENERAL` 만 있던 이미지)을 **0바이트로 남긴다.** ultralytics 는 그것을
    배경 이미지로 읽고 그게 B 의 정의다 — 일반쓰레기에 박스를 치지 않도록 가르친다.
    라벨 파일을 아예 지우면 결과는 같지만 `missing` 으로 세어져 **진짜 누락과 구별이
    안 된다.** 남기면 `empty` 로 따로 찍힌다.
    """
    label_dir = out / "labels" / split
    if not dry_run:
        label_dir.mkdir(parents=True, exist_ok=True)
        for stale in label_dir.glob("*.txt"):
            stale.unlink()

    stats = dict.fromkeys(("files", "dropped", "touched", "emptied", "kept"), 0)
    for path in sorted((source / "labels" / split).glob("*.txt")):
        lines = [line for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]
        keep = [line for line in lines if int(line.split()[0]) != drop]
        stats["files"] += 1
        stats["dropped"] += len(lines) - len(keep)
        stats["kept"] += len(keep)
        if len(keep) != len(lines):
            stats["touched"] += 1
        if lines and not keep:
            stats["emptied"] += 1
        if not dry_run:
            (label_dir / path.name).write_text(
                "".join(line + "\n" for line in keep), encoding="utf-8"
            )
    return stats


def mirror_images(source: Path, out: Path) -> int:
    """`out/images/{train,val}` 을 **하드링크**로 채운다. 왜 심링크가 아닌지는 파일 맨 위.

    하드링크는 디스크를 더 쓰지 않고 경로 해석도 없다. 같은 파일시스템이 아니면
    (Windows 의 다른 드라이브 등) 복사로 떨어진다 — 느릴 뿐 결과는 같다.
    """
    root = out / "images"
    # **먼저 심링크를 걷어낸다.** 남아 있으면 아래 정리가 심링크를 통과해 **원본
    # 이미지를 지운다.** 08-04 에 만들었던 심링크가 실제로 여기 걸린다.
    if root.is_symlink():
        root.unlink()

    mirrored = 0
    for split in SPLITS:
        target = root / split
        if target.is_symlink():
            target.unlink()
        target.mkdir(parents=True, exist_ok=True)
        for stale in target.glob("*.jpg"):
            stale.unlink()
        for image in sorted((source / "images" / split).glob("*.jpg")):
            try:
                os.link(image, target / image.name)
            except OSError:
                shutil.copy2(image, target / image.name)
            mirrored += 1
    return mirrored


def write_data_yaml(out: Path) -> Path:
    """형식 정본은 `build_dataset.py:write_data_yaml` 이고 여기는 사본이다 (`train.py` 의
    `TRAIN` dict 와 같은 패턴). **이름 7개를 그대로 쓴다** — 이 파일 맨 위 참고.
    """
    path = out / "data.yaml"
    names = "\n".join(f"  {i}: {name}" for i, name in enumerate(CLASSES))
    path.write_text(
        "# scripts/make_no_general.py 가 생성한다 (⑫ A/B 의 B). 손으로 고치지 않는다.\n"
        f"# 이름은 7개 그대로다. {DROP} 은 학습 예시가 0일 뿐 클래스에서 빠지지 않는다.\n"
        "train: images/train\n"
        "val: images/val\n"
        f"names:\n{names}\n",
        encoding="utf-8",
    )
    return path


def main() -> int:
    ap = argparse.ArgumentParser(description=f"{DROP} 을 뺀 데이터셋 변형 (⑫ A/B 의 B)")
    ap.add_argument("--source", type=Path, default=AI_DIR / "datasets" / "trash")
    ap.add_argument("--out", type=Path, default=AI_DIR / "datasets" / "trash_nogen")
    ap.add_argument("--dry-run", action="store_true", help="통계만 찍고 파일을 쓰지 않는다")
    args = ap.parse_args()

    # cp949 콘솔에서 한글 출력이 터지면 검사 보고만 사라져 성공한 줄 알게 된다
    sys.stdout.reconfigure(errors="replace")

    if not (args.source / "labels").is_dir():
        sys.exit(f"원본 라벨이 없다: {args.source / 'labels'}\n"
                 "  먼저: uv run python scripts/build_dataset.py")
    drop = CLASSES.index(DROP)

    print(f"{args.source.name} → {args.out.name}  ({DROP} = 인덱스 {drop} 제거)"
          + ("  (dry-run: 쓰지 않았다)" if args.dry_run else ""))
    stats = {s: filter_split(args.source, args.out, s, drop, args.dry_run) for s in SPLITS}
    for split, got in stats.items():
        print(f"  {split:<5} 파일 {got['files']:>5} · 남은 박스 {got['kept']:>5} · "
              f"지운 {DROP} {got['dropped']:>4} · 건드린 파일 {got['touched']:>4} · "
              f"빈 파일 {got['emptied']:>3}")

    print("\n[필터 검사]")
    for split, want in EXPECTED.items():
        check(f"{split} 통계 일치", stats[split] == want, f"{stats[split]}  기대 {want}")
    # 빈 파일은 배경 이미지가 된다. 10% 를 넘으면 recall 이 눌리므로 눈에 띄어야 한다.
    ratio = stats["train"]["emptied"] / stats["train"]["files"]
    check("train 배경 이미지 비율 10% 미만", ratio < 0.10, f"{ratio:.1%}")

    if args.dry_run:
        print(f"\n{_passed} 통과 · {len(_failed)} 실패  (dry-run)")
        return 1 if _failed else 0

    # 쓴 파일을 **다시 읽어** 검사한다 — 위 통계는 메모리 값이라 쓰기 버그를 못 잡는다.
    left = sum(
        1
        for split in SPLITS
        for path in (args.out / "labels" / split).glob("*.txt")
        for line in path.read_text(encoding="utf-8").splitlines()
        if line.strip() and int(line.split()[0]) == drop
    )
    check(f"쓴 라벨에 {DROP} 0줄", left == 0, f"{left}줄")

    yaml_path = write_data_yaml(args.out)
    mirrored = mirror_images(args.source, args.out)
    print(f"\n{yaml_path.name} 작성 · 이미지 {mirrored}장 하드링크 → {args.out}")

    print("\n[경로 검사]  이 데이터셋이 정말 자기 라벨을 읽는가")
    # **이 두 줄이 이 스크립트에서 가장 중요하다.** 틀리면 학습이 A 와 같은 라벨로
    # 돌면서 로그는 정상으로 보인다 (파일 맨 위).
    resolved = (args.out / "images" / "val").resolve()
    check("images 가 out 안으로 해석된다", args.out.resolve() in resolved.parents, str(resolved))

    # 함수 안에서 import 한다 — torch 를 끌어와 몇 초가 걸리고 위 검사가 실패하면
    # 그 비용을 낼 이유가 없다 (build_dataset.py 와 같은 이유).
    from ultralytics.data.utils import check_det_dataset, img2label_paths

    sample = sorted((args.out / "images" / "val").glob("*.jpg"))[0]
    # ultralytics 가 실제로 하는 것과 같은 순서다: resolve → /images/ → /labels/ 치환
    derived = Path(img2label_paths([str(sample.resolve())])[0])
    check("라벨 경로가 out/labels 로 간다",
          derived.parent == (args.out / "labels" / "val").resolve(), str(derived))

    print("\n[ultralytics 로드 검사]")
    try:
        info = check_det_dataset(str(yaml_path))
        check("data.yaml 로드", True, f"nc={info['nc']}")
        check("클래스 이름·순서 일치",
              [info["names"][i] for i in range(len(CLASSES))] == list(CLASSES),
              str(info["names"]))
        # `check_det_dataset` 이 val 경로에 `.resolve()` 를 먹인 **뒤의** 값을 본다 —
        # 위 검사와 겹쳐 보이지만 이쪽이 라이브러리가 실제로 쓰는 경로다.
        val_path = Path(info["val"][0] if isinstance(info["val"], list) else info["val"])
        check("ultralytics 가 보는 val 경로가 out 안", args.out.resolve() in val_path.parents,
              str(val_path))
    except Exception as e:  # 경로 해석 실패는 여기서만 드러난다
        check("data.yaml 로드", False, f"{type(e).__name__}: {e}")

    print(f"\n{_passed} 통과 · {len(_failed)} 실패")
    if _failed:
        print("실패: " + " · ".join(_failed))
    return 1 if _failed else 0


if __name__ == "__main__":
    sys.exit(main())
