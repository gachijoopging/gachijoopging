"""TACO → YOLO 학습 데이터셋 빌드 + 검증셋 동결 — ⑨.

    uv run python scripts/build_dataset.py --dry-run    # 통계만, 파일 안 씀
    uv run python scripts/build_dataset.py              # 실제 빌드
    uv run python scripts/build_dataset.py --refreeze    # 검증셋 다시 뽑기 (평소엔 금지)

**정규화 분모는 `annotations.json` 의 width/height 다.** 저장 파일 크기로 나누면
Orientation=6 이미지의 bbox 가 전치돼 **에러 없이 조용히 틀어진다** (`progress.md` §3.3).
왕복 검증(픽셀→정규화→픽셀)으로는 절대 못 잡는다 — 틀린 축으로 나눴다가 틀린 축으로
곱하면 원래 값이 돌아온다. 잡는 것은 ① 파일 크기와 주석 크기의 대조와
② `scripts/check_dataset.py` 의 눈 검증뿐이다.

**`_split.json` 이 있으면 검증셋을 다시 뽑지 않는다.** 검증셋은 W6 까지 불변이고
(`README.md` §4.3, §10 "절대 못 버리는 것") `--refreeze` 만이 그것을 바꾼다.
"""

from __future__ import annotations

import argparse
import csv
import json
import random
import shutil
import sys
from collections import Counter, defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from download_taco import aspect_ok, size_of  # noqa: E402  (EXIF·비율 판정을 두 곳에 두지 않는다)

from app.classes import CLASSES  # noqa: E402  (클래스 순서는 서빙과 공유하는 계약이다)

AI_DIR = Path(__file__).resolve().parent.parent
SEED = 702
TARGET_VAL_INSTANCES = 350
# 순서가 결과를 바꾼다 — GLASS 를 먼저 채운다. dict 삽입 순서를 그대로 쓴다.
VAL_FLOOR = {"GLASS": 30, "GENERAL": 30}
INDOOR = "Indoor, Man-made"
EXCLUDE = "EXCLUDE"

# 2026-08-03 실측. 구현이 이 숫자를 못 내면 구현이 틀린 것이다.
EXPECTED = {
    "total_boxes": 4031,
    "excluded": 517,
    "attached_parts": 236,
    "indoor_only": 77,
    "per_class": {"CIGARETTE": 667, "CAN": 369, "PLASTIC": 1120, "PAPER": 497,
                  "GLASS": 254, "VINYL": 849, "GENERAL": 275},
    "val_images": 131,
    "val_boxes": 351,
    "val_per_class": {"CIGARETTE": 44, "CAN": 38, "PLASTIC": 73, "PAPER": 51,
                      "GLASS": 35, "VINYL": 79, "GENERAL": 31},
}

_passed = 0
_failed: list[str] = []


def check(name: str, cond: bool, detail: str = "") -> bool:
    """smoke.py 와 같은 패턴. 실패는 모아서 마지막에 종료 코드로 낸다."""
    global _passed
    if cond:
        _passed += 1
        print(f"  PASS  {name}" + (f"  ({detail})" if detail else ""))
    else:
        _failed.append(name)
        print(f"  FAIL  {name}  {detail}")
    return cond


def load_mapping(path: Path) -> dict[str, tuple[str, str]]:
    """TACO 이름 → (7종 카테고리, role). `utf-8-sig` 로 읽는다 — BOM 없음이 정본이다."""
    with path.open(encoding="utf-8-sig", newline="") as f:
        return {r["taco_name"]: (r["category"], r["role"]) for r in csv.DictReader(f)}


def contained_frac(inner: list[float], outer: list[float]) -> float:
    """inner 가 outer 에 몇 %나 들어가는가 — **inner 자신의 면적 기준** (§3.2 부품 규칙)."""
    ax, ay, aw, ah = inner
    bx, by, bw, bh = outer
    ix = max(0.0, min(ax + aw, bx + bw) - max(ax, bx))
    iy = max(0.0, min(ay + ah, by + bh) - max(ay, by))
    return (ix * iy) / (aw * ah) if aw * ah > 0 else 0.0


def boxes_per_image(
    coco: dict, mapping: dict[str, tuple[str, str]]
) -> tuple[dict[int, list[tuple[str, list[float]]]], Counter[str]]:
    """image_id → [(7종 카테고리, COCO bbox)]. 버린 것의 개수도 돌려준다.

    `bbox` 를 그대로 쓴다 — 세그멘테이션 외접 사각형과 4,784건 전부 일치한다(최대 편차 1px).
    """
    id2name = {c["id"]: c["name"] for c in coco["categories"]}
    grouped: dict[int, list[dict]] = defaultdict(list)
    for a in coco["annotations"]:
        grouped[a["image_id"]].append(a)

    kept: dict[int, list[tuple[str, list[float]]]] = {}
    dropped: Counter[str] = Counter()
    for image in coco["images"]:
        anns = grouped.get(image["id"], [])
        bodies = [a for a in anns if mapping[id2name[a["category_id"]]][1] == "body"]
        out: list[tuple[str, list[float]]] = []
        for a in anns:
            category, role = mapping[id2name[a["category_id"]]]
            if category == EXCLUDE:
                dropped["excluded"] += 1
                continue
            # 본체에 붙은 부품은 세지 않는다 — 안 그러면 페트병 1개가 PLASTIC 2개로 나간다
            if role == "part" and any(
                contained_frac(a["bbox"], b["bbox"]) >= 0.5 for b in bodies if b is not a
            ):
                dropped["attached_parts"] += 1
                continue
            out.append((category, a["bbox"]))
        kept[image["id"]] = out
    return kept, dropped


def indoor_only_ids(coco: dict) -> set[int]:
    """`Indoor, Man-made` 가 **유일한** 배경 태그인 이미지.

    이 태그는 이름 하나에 "실내"와 "인공물"을 묶어 놨다. 야외 태그와 섞인 134장은 실제로
    야외 도심이고(이미지로 확인) 그쪽이 시연 환경과 더 닮았다 — 단독 77장만 뺀다.
    """
    sid2name = {c["id"]: c["name"] for c in coco["scene_categories"]}
    tags: dict[int, set[str]] = defaultdict(set)
    for a in coco["scene_annotations"]:
        for background_id in a["background_ids"]:
            tags[a["image_id"]].add(sid2name.get(background_id, f"UNKNOWN({background_id})"))
    return {image_id for image_id, s in tags.items() if s == {INDOOR}}


def choose_val(
    coco: dict, kept: dict[int, list[tuple[str, list[float]]]], indoor_only: set[int]
) -> list[int]:
    """검증셋 image_id. **`annotations.json` 만의 함수다** — 디스크 상태와 무관하다.

    절차를 순서까지 고정한다. 하나라도 바꾸면 다른 검증셋이 나오고, 그러면 W6 까지의
    모든 지표가 이전 지표와 비교 불가가 된다.
    """
    order = sorted(image_id for image_id in kept if image_id not in indoor_only)
    random.Random(SEED).shuffle(order)

    chosen: list[int] = []
    seen: set[int] = set()
    got: Counter[str] = Counter()

    def take(image_id: int) -> None:
        chosen.append(image_id)
        seen.add(image_id)
        got.update(cat for cat, _ in kept[image_id])

    # 희소 클래스 하한을 먼저 채운다. GLASS·GENERAL 이 ⑫ A/B 판단의 핵심 입력인데
    # 무작위로만 뽑으면 15~17개가 되고, 자체 촬영 라벨링(8/16)이 ⑫(W3)와 겹쳐
    # 자체 50 없이 판단해야 할 수 있다.
    for category, need in VAL_FLOOR.items():
        for image_id in order:
            if got[category] >= need:
                break
            if image_id in seen or all(cat != category for cat, _ in kept[image_id]):
                continue
            take(image_id)

    for image_id in order:
        if sum(got.values()) >= TARGET_VAL_INSTANCES:
            break
        if image_id not in seen:
            take(image_id)
    return chosen


def load_or_freeze_split(
    out: Path,
    coco: dict,
    kept: dict[int, list[tuple[str, list[float]]]],
    indoor_only: set[int],
    refreeze: bool,
    dry_run: bool,
) -> set[str]:
    """val 의 file_name 집합. `_split.json` 이 있으면 **그것을 따른다**.

    검증셋은 한 번 정하면 W6 까지 건드리지 않는다 (`README.md` §4.3). 그 불변을 문서가
    아니라 코드로 지킨다 — `--refreeze` 만이 유일한 변경 경로다.
    """
    name_of = {image["id"]: image["file_name"] for image in coco["images"]}
    split_path = out / "_split.json"

    if split_path.exists() and not refreeze:
        frozen = json.loads(split_path.read_text(encoding="utf-8"))
        print(f"\n동결된 검증셋을 따른다 — {split_path.name} "
              f"(시드 {frozen['seed']} · {frozen['created']} · {len(frozen['val'])}장)")
        return set(frozen["val"])

    val_ids = choose_val(coco, kept, indoor_only)
    val_names = [name_of[image_id] for image_id in val_ids]
    val_per_class = Counter(cat for image_id in val_ids for cat, _ in kept[image_id])
    train_per_class = Counter(
        cat for image_id in kept if image_id not in set(val_ids) for cat, _ in kept[image_id]
    )

    print(f"\n{'검증셋을 다시 뽑는다 (--refreeze)' if refreeze else '검증셋을 새로 뽑는다'}")
    print(f"  val   {len(val_ids):>5}장  {sum(val_per_class.values()):>5}박스   "
          + " ".join(f"{c[:3]} {val_per_class[c]}" for c in CLASSES))
    print(f"  train {len(kept) - len(val_ids):>5}장  {sum(train_per_class.values()):>5}박스   "
          + " ".join(f"{c[:3]} {train_per_class[c]}" for c in CLASSES))

    if not dry_run:
        out.mkdir(parents=True, exist_ok=True)
        split_path.write_text(json.dumps({
            "seed": SEED,
            "created": "2026-08-03",
            "target_instances": TARGET_VAL_INSTANCES,
            "floor": VAL_FLOOR,
            "excluded_indoor_only": len(indoor_only),
            "val": val_names,
            "stats": {"val": dict(val_per_class), "train": dict(train_per_class)},
        }, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"  → 동결 {split_path}")
    return set(val_names)


def load_substituted(taco: Path) -> set[str]:
    """`substituted.txt` — 원본이 거부돼 장변 1024 대체본을 받은 파일명 집합.

    이 목록이 있어야 ⑫ 평가에서 "이 클래스가 약한 게 저화질 때문인가"를 되물을 수 있고
    ⑱ 보강 대상을 정할 수 있다. 필요한 건 멤버십뿐이라 크기(둘째 필드)는 읽지 않는다 —
    크기 파싱을 게이트로 쓰면 파싱 실패가 조용한 멤버십 누락으로 번진다(⑨ 최종 리뷰).
    탭 앞 첫 필드만 읽으므로 download_taco.py 가 메시지 없는 줄을 써도 계약이 깨지지
    않는다. TACO 파일명(`batch_N/NNNNNN.jpg`)에는 탭이 올 수 없어 이 구분자는 안전하다.
    """
    path = taco / "substituted.txt"
    if not path.exists():
        return set()
    return {
        line.split("\t", 1)[0]
        for line in path.read_text(encoding="utf-8").splitlines()
        if line.strip()
    }


def dataset_name(file_name: str) -> str:
    """`batch_1/000006.JPG` → `taco_batch_1_000006.jpg`.

    batch 마다 `000006` 이 있어 flatten 하면 충돌한다. 확장자를 `.jpg` 로 통일하는 이유는
    원본에 `.JPG` 가 667개 섞여 있고 **학습은 Linux 에서 돌기** 때문이다. `taco_` 접두어는
    재실행 시 이것만 지워 나중에 붙는 자체 촬영분을 지키기 위한 것이다.
    """
    return "taco_" + file_name.rsplit(".", 1)[0].replace("/", "_") + ".jpg"


def yolo_line(index: int, bbox: list[float], width: int, height: int) -> str:
    """COCO 좌상단 픽셀 → YOLO 중심 정규화. **API 계약의 좌상단 형식과 다르다** (§3.3).

    분모는 반드시 주석의 width/height 다. 저장 파일 크기를 쓰면 조용히 전치된다.
    """
    x, y, w, h = bbox
    return (f"{index} {(x + w / 2) / width:.6f} {(y + h / 2) / height:.6f} "
            f"{w / width:.6f} {h / height:.6f}")


def bad_values(line: str) -> list[float]:
    """정규화 좌표가 [0,1] 밖이거나 w·h 가 0 이하인 값. 비어 있으면 정상이다."""
    cx, cy, w, h = (float(v) for v in line.split()[1:])
    bad = [v for v in (cx, cy, w, h) if not 0.0 <= v <= 1.0]
    return bad + ([w, h] if w <= 0 or h <= 0 else [])


def write_labels(
    coco: dict,
    kept: dict[int, list[tuple[str, list[float]]]],
    val_names: set[str],
    taco: Path,
    out: Path,
    dry_run: bool,
    substituted: set[str],
) -> tuple[list[tuple[int, str]], list[tuple[int, str]]]:
    """라벨 txt 를 쓰고 (val 항목, train 항목) 을 돌려준다.

    **val 이미지가 없거나 크기가 어긋나면 중단한다.** 동결 대상에 구멍을 낼 수 없다.
    train 이미지는 건너뛰고 보고한다 — 다운로드가 진행되면 재실행으로 채워진다.

    기존 라벨 삭제·재작성은 **val 게이트를 통과한 뒤**에 한다. 먼저 지우면, 중단된
    실행이 이번에 못 찾은 이미지의 라벨만 지운 채로 끝난다 — images/ 복사는 이 함수
    뒤(`main`) 라 손대지 않으므로 그 이미지는 파일로는 남는데 라벨은 없어진다. 그런
    "라벨 없는 이미지"를 ultralytics 는 에러 없이 배경 이미지로 조용히 통과시킨다.
    """
    index_of = {name: i for i, name in enumerate(CLASSES)}
    picked: dict[str, list[tuple[int, str]]] = {"val": [], "train": []}
    missing: dict[str, list[str]] = {"val": [], "train": []}
    mismatched: dict[str, list[str]] = {"val": [], "train": []}
    coordinate_errors: list[str] = []
    lines_of: dict[str, list[str]] = {}

    for image in coco["images"]:
        image_id, file_name = image["id"], image["file_name"]
        split = "val" if file_name in val_names else "train"
        source = taco / "images" / file_name

        if not source.exists():
            missing[split].append(file_name)
            continue
        # 주석은 EXIF 적용 후(정방향) 픽셀 기준이다. 이 대조가 정규화 방향의 근본 검증이다.
        expected_size = (image["width"], image["height"])
        actual_size = size_of(source)
        if actual_size != expected_size:
            # 대체본은 해상도가 다르다. 정규화 좌표는 해상도와 무관하므로 비율만 본다 —
            # 전치는 비율이 뒤집히므로 여전히 걸린다. **목록에 있는 파일만** 이 경로를 탄다.
            if not (file_name in substituted and actual_size
                    and aspect_ok(actual_size, expected_size)):
                mismatched[split].append(
                    f"{file_name} 주석 {expected_size} vs 파일 {actual_size}")
                continue

        name = dataset_name(file_name)
        lines = [yolo_line(index_of[cat], bbox, image["width"], image["height"])
                 for cat, bbox in kept[image_id]]
        for line in lines:
            if bad_values(line):
                coordinate_errors.append(f"{file_name}: {line}")
        picked[split].append((image_id, name))
        lines_of[name] = lines

    print(f"\n라벨 — val {len(picked['val'])}장 · train {len(picked['train'])}장"
          + ("  (dry-run: 쓰지 않았다)" if dry_run else ""))
    for split in ("val", "train"):
        if missing[split]:
            print(f"  {split} 이미지 없음 {len(missing[split])}장: "
                  f"{', '.join(missing[split][:3])}{' …' if len(missing[split]) > 3 else ''}")
        if mismatched[split]:
            print(f"  {split} 크기 불일치 {len(mismatched[split])}장: {mismatched[split][0]}")

    print("\n[라벨 검사]")
    check("좌표가 전부 [0,1] 안", not coordinate_errors,
          f"{len(coordinate_errors)}건 " + (coordinate_errors[0] if coordinate_errors else ""))
    check("val 이미지 전부 확보", not missing["val"] and not mismatched["val"],
          f"없음 {len(missing['val'])} · 불일치 {len(mismatched['val'])}")

    if substituted:
        included = {n for _, n in picked["val"] + picked["train"]}
        passed = [name for name in substituted if dataset_name(name) in included]
        dropped = [name for name in substituted if dataset_name(name) not in included]
        in_val = sum(1 for name in passed if name in val_names)
        print(f"  대체본(장변 1024) {len(passed)}장 통과 — "
              f"val {in_val} · train {len(passed) - in_val}")
        check("대체본 전부 통과", not dropped, f"{len(dropped)}장 누락")

    if missing["val"] or mismatched["val"]:
        print(f"\n검증셋 {len(missing['val']) + len(mismatched['val'])}장이 비었다. 동결 대상에")
        print("  구멍을 낼 수 없으므로 중단한다. 다운로드를 마치고 다시 실행해라:")
        print("    uv run python scripts/download_taco.py --workers 2")
        sys.exit(1)

    # 여기 도달했다는 것은 val 게이트를 통과했다는 뜻이다 — 이제야 기존 산출물을 지운다.
    if not dry_run:
        for split, items in (("val", picked["val"]), ("train", picked["train"])):
            label_dir = out / "labels" / split
            label_dir.mkdir(parents=True, exist_ok=True)
            for stale in label_dir.glob("taco_*.txt"):
                stale.unlink()
            for _, name in items:
                label_path = label_dir / Path(name).with_suffix(".txt").name
                label_path.write_text("\n".join(lines_of[name]) + "\n", encoding="utf-8")

    return picked["val"], picked["train"]


def copy_images(
    coco: dict, items: list[tuple[int, str]], split: str, taco: Path, out: Path
) -> int:
    """원본 바이트를 그대로 복사한다 — **EXIF 를 보존한다.**

    `scripts/prep_labeling.py` 는 반대로 EXIF 를 픽셀에 적용해 지운 사본을 만든다. 이유가
    다르다: 라벨링 도구의 EXIF 처리는 통제할 수 없지만 **학습 로더는 EXIF 를 적용한다**는
    것이 W1 ① 에서 실측됐다. TACO 주석이 EXIF 적용 후 기준이므로 여기서는 EXIF 가
    있어야 좌표가 맞는다. 재인코딩하면 화질만 잃는다.
    """
    name_of = {image["id"]: image["file_name"] for image in coco["images"]}
    target = out / "images" / split
    target.mkdir(parents=True, exist_ok=True)
    for stale in target.glob("taco_*.jpg"):
        stale.unlink()
    for image_id, name in items:
        shutil.copy2(taco / "images" / name_of[image_id], target / name)
    return len(items)


def write_data_yaml(out: Path) -> Path:
    """`path:` 를 쓰지 않는다 — 생략하면 이 파일이 있는 폴더가 데이터셋 루트가 된다
    (`check_det_dataset` 실측). 절대 경로를 안 박으므로 클라우드 학습 서버로 폴더를
    옮겨도 깨지지 않는다.
    """
    path = out / "data.yaml"
    names = "\n".join(f"  {i}: {name}" for i, name in enumerate(CLASSES))
    path.write_text(
        "# scripts/build_dataset.py 가 생성한다. 손으로 고치지 않는다.\n"
        "# path: 생략 — 이 파일이 있는 폴더가 데이터셋 루트다.\n"
        "train: images/train\n"
        "val: images/val\n"
        f"names:\n{names}\n",
        encoding="utf-8",
    )
    return path


def main() -> int:
    ap = argparse.ArgumentParser(description="TACO → YOLO 데이터셋 빌드")
    ap.add_argument("--taco", type=Path, default=AI_DIR / "datasets" / "taco")
    ap.add_argument("--out", type=Path, default=AI_DIR / "datasets" / "trash")
    ap.add_argument("--dry-run", action="store_true", help="통계만 찍고 파일을 쓰지 않는다")
    ap.add_argument("--refreeze", action="store_true",
                    help="_split.json 을 무시하고 검증셋을 다시 뽑는다. 평소엔 쓰지 않는다")
    args = ap.parse_args()

    # cp949 콘솔에서 한글·기호 출력이 터지면 검사 보고만 사라져 성공한 줄 알게 된다
    sys.stdout.reconfigure(errors="replace")

    ann_path = args.taco / "annotations.json"
    if not ann_path.exists():
        sys.exit(f"주석이 없다: {ann_path}\n  먼저: uv run python scripts/download_taco.py")
    coco = json.loads(ann_path.read_text(encoding="utf-8"))
    mapping = load_mapping(AI_DIR / "configs" / "taco_to_7.csv")

    missing = {c["name"] for c in coco["categories"]} - set(mapping)
    if missing:
        sys.exit(f"매핑 표에 없는 TACO 카테고리: {sorted(missing)}")

    kept, dropped = boxes_per_image(coco, mapping)
    per_class = Counter(cat for boxes in kept.values() for cat, _ in boxes)
    total = sum(per_class.values())

    print(f"\n주석 {len(coco['annotations'])}건 → 유지 {total}박스 / {len(kept)}장")
    print(f"  버림: EXCLUDE {dropped['excluded']} · 본체에 붙은 부품 {dropped['attached_parts']}")
    print("  " + "  ".join(f"{c} {per_class[c]}" for c in CLASSES))

    print("\n[매핑 검사]")
    check("총 박스 4031", total == EXPECTED["total_boxes"], f"{total}")
    check("EXCLUDE 517", dropped["excluded"] == EXPECTED["excluded"], f"{dropped['excluded']}")
    check("붙은 부품 236", dropped["attached_parts"] == EXPECTED["attached_parts"],
          f"{dropped['attached_parts']}")
    check("클래스별 개수 일치", dict(per_class) == EXPECTED["per_class"], f"{dict(per_class)}")

    indoor_only = indoor_only_ids(coco)
    check("실내 단독 77장", len(indoor_only) == EXPECTED["indoor_only"], f"{len(indoor_only)}")

    val_names = load_or_freeze_split(
        args.out, coco, kept, indoor_only, args.refreeze, args.dry_run
    )
    name_of = {image["id"]: image["file_name"] for image in coco["images"]}
    val_ids = {image_id for image_id, name in name_of.items() if name in val_names}
    val_per_class = Counter(cat for image_id in val_ids for cat, _ in kept[image_id])

    print("\n[분할 검사]")
    check("val 131장", len(val_names) == EXPECTED["val_images"], f"{len(val_names)}")
    check("val 351박스", sum(val_per_class.values()) == EXPECTED["val_boxes"],
          f"{sum(val_per_class.values())}")
    check("val 클래스별 일치", dict(val_per_class) == EXPECTED["val_per_class"],
          f"{dict(val_per_class)}")
    check("val 에 실내 단독 없음", not (val_ids & indoor_only), f"{len(val_ids & indoor_only)}건")
    check("분할이 결정적", choose_val(coco, kept, indoor_only) == choose_val(
        coco, kept, indoor_only), "같은 입력 두 번")

    substituted = load_substituted(args.taco)
    val_items, train_items = write_labels(
        coco, kept, val_names, args.taco, args.out, args.dry_run, substituted
    )
    check("train ∩ val = 0",
          not ({n for _, n in val_items} & {n for _, n in train_items}), "이름 교집합")

    if not args.dry_run:
        copied = sum(copy_images(coco, items, split, args.taco, args.out)
                     for items, split in ((val_items, "val"), (train_items, "train")))
        yaml_path = write_data_yaml(args.out)
        print(f"\n이미지 {copied}장 복사 · {yaml_path.name} 작성 → {args.out}")

        print("\n[ultralytics 로드 검사]")
        # 함수 안에서 import 한다 — ultralytics 는 torch 를 끌어와 몇 초가 걸리고,
        # --dry-run 경로는 이 비용을 낼 이유가 없다.
        from ultralytics.data.utils import check_det_dataset

        try:
            info = check_det_dataset(str(yaml_path))
            check("data.yaml 로드", True, f"nc={info['nc']}")
            check("클래스 이름·순서 일치",
                  [info["names"][i] for i in range(len(CLASSES))] == list(CLASSES),
                  str(info["names"]))
        except Exception as e:  # 경로 해석 실패는 여기서만 드러난다
            check("data.yaml 로드", False, f"{type(e).__name__}: {e}")

    print(f"\n{_passed} 통과 · {len(_failed)} 실패")
    if _failed:
        print("실패: " + " · ".join(_failed))
    return 1 if _failed else 0


if __name__ == "__main__":
    sys.exit(main())
