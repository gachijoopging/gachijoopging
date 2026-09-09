"""서빙 조건에서의 평가 — ⑪.

    .venv/bin/python scripts/eval.py                   # 서빙 조건 평가
    .venv/bin/python scripts/eval.py --compare-rect    # rect=True 와 비교 (일회성 검증)
    .venv/bin/python scripts/eval.py --no-general \
        --weights runs/detect/train_nogen/weights/best.pt    # ⑫ A/B 의 B

**학습 로그의 지표는 서빙이 내는 값이 아니다.** ultralytics 는 학습 중 val 에
`rect=True` 를 넘기고(`models/yolo/detect/train.py:76`), 서빙은 `rect=False` 로 고정돼
있다(`app/infer.py`, `progress.md` §3.1 "절대 조건"). 이 스크립트가 그 간극을 메운다.

패스가 둘인 이유: **mAP 는 `conf` 를 낮게 둬야 맞고**(PR 곡선 전체가 필요하다)
**사용자가 보는 것은 `CONF_MIN` 이후**다. 한 번으로는 둘 다 못 낸다.

**측정 조건은 서빙과 같지만 스택은 다르다** — 학습 서버는 torch 2.11.0+cu128,
서빙은 2.13.0+cu130 이다(§3.1). 커널이 달라 소수점이 갈릴 수 있다.
"""

from __future__ import annotations

import argparse
import os
import subprocess
import sys
from pathlib import Path

# **ultralytics import 보다 먼저여야 한다.** 이유는 `app/__init__.py` 에 있다.
os.environ.setdefault("YOLO_AUTOINSTALL", "false")

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

# `calibrate` 를 통과시키는 이유: ⑯ 에서 보정 맵이 들어와도 이 스크립트를 고치지 않아도 된다.
from app.calibrate import calibrate  # noqa: E402
from app.classes import CLASSES  # noqa: E402  (클래스 순서는 학습·서빙이 공유하는 계약이다)

AI_DIR = Path(__file__).resolve().parent.parent

# 아래 4개는 **사본이고 정본은 `app/config.py`** 다. import 할 수 없는 이유: 그 파일
# 마지막 줄의 `_validate()` 가 `AI_SECRET` 없이 raise 하고 학습 서버에는 `.env` 가 없다.
# `train.py` 의 `TRAIN` dict 와 같은 패턴이다 — 바꿀 때는 그쪽과 함께 바꾼다.
IMGSZ = 1024        # 절대 조건. 학습·추론 동일
CONF_MIN = 0.25     # 서빙 임계값. 임시값이고 실측은 ⑰
UNCLASSIFIED = 0.7  # API 계약. 앱·백엔드·문서 3곳에 박혀 있다
VAL_CONF = 0.001    # mAP 는 정의상 낮은 conf 로 재야 맞다 (ultralytics val 기본값)

DEVICE = 1
# 학습이 val 에 쓴 배치. `engine/trainer.py:294` 가 detect 에서 `batch_size * 2` 를
# 넘긴다 → 64 × 2. **이 값이 맞아야 학습 기록이 재현된다** — `rect=True` 에서는 배치
# 구성이 letterbox 모양을 정하기 때문이다. 학습 로그 진행줄의 `2/2` 가 131 ÷ 128 이다.
BATCH = 128

WEIGHTS = AI_DIR / "runs" / "detect" / "train" / "weights" / "best.pt"
DATA_YAML = AI_DIR / "datasets" / "trash" / "data.yaml"
# ⑫ A/B 의 B. 이름은 7개 그대로라 아래 클래스 검사·`CLASSES` 인덱싱이 그대로 산다.
NOGEN_YAML = AI_DIR / "datasets" / "trash_nogen" / "data.yaml"
VAL_IMAGES = 131

# ⑫ A/B 의 판정 지표는 **6종 평균**이다 — B 는 `GENERAL` 을 안 내므로 7종 평균으로는
# 두 모델을 같은 자로 잴 수 없다.
SIX = tuple(name for name in CLASSES if name != "GENERAL")

# `experiment-log.md` §4 `run: train` 의 best.pt 검증값 (rect=True · batch=128 · conf=0.001).
# `--compare-rect` 가 이 숫자를 재현해야 나머지 출력을 믿을 수 있다.
RECORDED_RECT_TRUE = {"mAP50": 0.338, "mAP50-95": 0.255}

_passed = 0
_failed: list[str] = []


def check(name: str, cond: bool, detail: str = "") -> bool:
    """train.py·smoke.py 와 같은 패턴. 실패는 모아서 종료 코드로 낸다."""
    global _passed
    if cond:
        _passed += 1
        print(f"  PASS  {name}" + (f"  ({detail})" if detail else ""))
    else:
        _failed.append(name)
        print(f"  FAIL  {name}  {detail}")
    return cond


def preflight(weights: Path, data_yaml: Path) -> None:
    """평가 전 4가지. 전부 통과해야 `val()` 까지 간다.

    `weights`·`data_yaml` 을 인자로 받는다 — 모듈 전역을 `main()` 에서 바꾸면
    `add_argument` 의 `default=WEIGHTS` 가 `global` 선언보다 먼저 읽혀 `SyntaxError`
    가 된다.
    """
    print("[프리플라이트]")

    check("weights 존재", weights.exists(), str(weights))
    # 없으면 ultralytics 가 이름만 보고 인터넷에서 받는다 — 우리가 학습한 파일이 아니다.

    images = len(list((data_yaml.parent / "images" / "val").glob("*.jpg")))
    labels = len(list((data_yaml.parent / "labels" / "val").glob("*.txt")))
    check("val 이미지·라벨 수", images == labels == VAL_IMAGES,
          f"이미지 {images} · 라벨 {labels} · 기대 {VAL_IMAGES}")

    # ultralytics 는 torch 를 끌어와 몇 초가 걸린다. 위 검사가 실패할 때 그 비용을 낼
    # 이유가 없어 함수 안에서 import 한다 (train.py 와 같은 이유).
    from ultralytics.data.utils import check_det_dataset

    try:
        info = check_det_dataset(str(data_yaml))
        names = [info["names"][i] for i in range(len(info["names"]))]
        check("클래스 이름·순서 일치", names == list(CLASSES), f"{names}")
        # ⑧ 에서 Label Studio 가 라벨을 알파벳순으로 매겨 GLASS 가 4 대신 3 으로 나간
        # 전례가 있다. 순서가 어긋난 평가는 **지표가 정상으로 보인다** — 조용히 틀린다.
    except Exception as e:  # 경로 해석 실패는 여기서만 드러난다
        check("data.yaml 로드", False, f"{type(e).__name__}: {e}")

    try:
        out = subprocess.run(
            ["nvidia-smi", f"--id={DEVICE}", "--query-gpu=memory.total,memory.used",
             "--format=csv,noheader,nounits"],
            capture_output=True, text=True, check=True,
        ).stdout
        total, used = (float(v) for v in out.split(","))
        check(f"GPU {DEVICE} 조회", True, f"여유 {(total - used) / 1024:.0f} GiB")
        # 추론은 학습과 달리 VRAM 이 거의 안 든다(서빙 실측 92 MiB) — 문턱을 두지 않고
        # 값만 찍는다. 공유 머신이라 무엇이 물려 있는지는 보여야 한다.
    except (OSError, subprocess.CalledProcessError) as e:
        check(f"GPU {DEVICE} 조회", False, f"{type(e).__name__}: {e}")


def run_val(weights: Path, data_yaml: Path, rect: bool, name: str) -> dict:
    """`model.val()` 한 번. `rect` 만 바꿔 두 번 부를 수 있게 갈라 둔다.

    반환값의 `per_class` 키는 `CLASSES` 이름이다 — `ap_class_index` 가 위치 인덱스를
    클래스 id 로 매핑하므로 그걸 거쳐야 한다. 위치 순서를 그대로 쓰면 검출이 0인
    클래스가 빠졌을 때 이름이 한 칸씩 밀린다.
    """
    from ultralytics import YOLO

    m = YOLO(str(weights)).val(
        data=str(data_yaml),
        imgsz=IMGSZ,
        # **기본값에 맡기지 않는다.** `data/build.py:272` 가 `rect=cfg.rect or rect` 라
        # args 가 상속되면 조용히 True 가 된다 — 그러면 서빙 조건이 아니다.
        rect=rect,
        # 서빙과 같은 FP16. `half=True` 는 8.4.112 에서 deprecated (§3.1).
        quantize=16,
        conf=VAL_CONF,
        # 학습이 val 에 쓴 값. rect=True 에서 배치가 letterbox 모양을 정한다.
        batch=BATCH,
        device=DEVICE,
        plots=True,
        project=str(AI_DIR / "runs" / "detect"),
        name=name,
        exist_ok=True,
        verbose=False,
    )
    return {
        "mAP50": float(m.box.map50),
        "mAP50-95": float(m.box.map),
        "P": float(m.box.mp),
        "R": float(m.box.mr),
        "per_class": {
            CLASSES[int(class_id)]: {
                "AP50": float(m.box.ap50[i]),
                "AP50-95": float(m.box.ap[i]),
                "P": float(m.box.p[i]),
                "R": float(m.box.r[i]),
            }
            for i, class_id in enumerate(m.box.ap_class_index)
        },
    }


def six_map50(result: dict) -> float:
    """`GENERAL` 을 뺀 6종 평균 AP50 — ⑫ A/B 는 이 값으로 판정한다.

    `m.box.map50` 을 쓰지 않는 이유는 **그 값의 분모가 데이터셋에 따라 달라진다**는 것이다.
    `ap_per_class` 는 GT 에 있는 클래스만 다루므로 `trash` 에서는 7클래스 평균(0.336),
    `trash_nogen` 에서는 6클래스 평균(0.352)이 된다 — 우연히 후자가 우리가 원하는 값이지만
    그 우연에 판정을 걸면 데이터셋이 바뀌는 순간 자가 조용히 바뀐다. 여기서 직접 센다.

    **검출이 없는 클래스는 0 으로 센다.** 빼고 평균 내면 못 찾는 클래스가 값을 올린다.

    **P·R 로는 A/B 를 비교할 수 없다** (⑫ 통제 실행 실측). ultralytics 가 보고하는 P·R 은
    클래스 평균 F1 이 최대인 지점에서 읽는 값이라 클래스 집합이 7→6 으로 바뀌면 그 지점이
    옮겨간다 — 같은 weights·같은 이미지인데 전체 P 0.527 → 0.536 · R 0.355 → 0.375 로
    움직였다. AP 는 곡선 전체의 면적이라 소수 3자리까지 불변이었다.
    """
    return sum(result["per_class"].get(name, {}).get("AP50", 0.0) for name in SIX) / len(SIX)


def print_val(label: str, result: dict) -> None:
    """콘솔 표. markdown 출력은 Task 4 가 따로 만든다."""
    print(f"\n[{label}]")
    print(f"  {'클래스':<12} {'AP50':>7} {'AP50-95':>8} {'P':>7} {'R':>7}")
    for name in CLASSES:
        v = result["per_class"].get(name)
        if v is None:
            print(f"  {name:<12} {'—':>7} {'—':>8} {'—':>7} {'—':>7}  (검출 없음)")
            continue
        print(f"  {name:<12} {v['AP50']:>7.3f} {v['AP50-95']:>8.3f} "
              f"{v['P']:>7.3f} {v['R']:>7.3f}")
    print(f"  {'전체':<12} {result['mAP50']:>7.3f} {result['mAP50-95']:>8.3f} "
          f"{result['P']:>7.3f} {result['R']:>7.3f}")
    print(f"  6종 평균 AP50 {six_map50(result):.3f}  — ⑫ A/B 판정 지표 (GENERAL 제외)")


def run_predict(weights: Path, data_yaml: Path) -> dict:
    """서빙과 같은 인자로 검증셋을 추론해 `aiConfidence` 분포를 센다.

    **GT 매칭을 하지 않는다.** 답하는 질문이 "사용자가 몇 개를 보고 그중 몇 개가
    `unclassified` 인가"이고 그건 예측만으로 답이 된다. TP/FP 를 가르는 IoU 매칭은
    ⑮ 의 일이다 (스펙 §7).

    인자는 `app/infer.py` 의 `_predict_kwargs()` 와 같아야 한다 — 다르면 이 숫자가
    사용자가 보는 것을 예측하지 않는다.
    """
    from ultralytics import YOLO

    paths = sorted((data_yaml.parent / "images" / "val").glob("*.jpg"))
    per_class = {name: {"n": 0, "below": 0} for name in CLASSES}
    total = below = 0

    model = YOLO(str(weights))
    # stream=True 로 결과를 하나씩 받는다 — 131장이라 메모리 문제는 아니지만
    # `.cpu()` 를 장당 즉시 해서 GPU 텐서를 쌓지 않는 쪽이 낫다.
    for result in model.predict(
        source=[str(p) for p in paths],
        stream=True,
        imgsz=IMGSZ,
        rect=False,
        quantize=16,
        conf=CONF_MIN,
        device=DEVICE,
        verbose=False,
    ):
        boxes = result.boxes
        if boxes is None or len(boxes) == 0:
            continue
        # `.float()` 이 필요하다 — FP16 텐서를 numpy 로 바로 넘기면 반쪽 정밀도가 남는다
        # (`app/infer.py:167` 과 같은 이유).
        for class_id, raw in zip(boxes.cls.cpu().numpy(),
                                 boxes.conf.float().cpu().numpy(), strict=True):
            name = CLASSES[int(class_id)]
            ai_confidence = calibrate(float(raw))
            per_class[name]["n"] += 1
            total += 1
            if ai_confidence < UNCLASSIFIED:
                per_class[name]["below"] += 1
                below += 1

    return {"images": len(paths), "total": total, "below": below, "per_class": per_class}


def print_predict(result: dict) -> None:
    """콘솔 표. 비율의 분모는 그 클래스의 검출 수다."""
    total, below = result["total"], result["below"]
    print(f"\n[2패스 — 서빙 임계값 (conf={CONF_MIN})]")
    print(f"  검출 {total}개 / 이미지 {result['images']}장 "
          f"(이미지당 {total / result['images']:.1f}개)")
    if total == 0:
        print(f"  검출이 0개다 — conf={CONF_MIN} 이 이 모델에 너무 높다는 뜻이다 (⑰ 의 입력)")
        return
    print(f"  aiConfidence < {UNCLASSIFIED} (unclassified)  {below}개 ({below / total:.1%})")
    print(f"  aiConfidence >= {UNCLASSIFIED}                {total - below}개 "
          f"({(total - below) / total:.1%})")
    print(f"\n  {'클래스':<12} {'검출':>6} {'< 0.7':>7} {'비율':>7}")
    for name in CLASSES:
        v = result["per_class"][name]
        ratio = f"{v['below'] / v['n']:.1%}" if v["n"] else "—"
        print(f"  {name:<12} {v['n']:>6} {v['below']:>7} {ratio:>7}")


def write_report(serving: dict, predicted: dict, path: Path, dataset: str) -> Path:
    """`experiment-log.md` §4 에 그대로 붙는 markdown. 손으로 옮겨 적다 틀리는 것을 막는다.

    표 형태는 그 파일 §4 의 템플릿(`| 클래스 | AP50 | AP50-95 | 비고 |`)과 같아야 한다.
    """
    total, below = predicted["total"], predicted["below"]
    lines = [
        f"**서빙 조건 재측정** (`rect=False` · `quantize=16` · `imgsz={IMGSZ}` · "
        f"`batch={BATCH}` · `conf={VAL_CONF}` · 데이터셋 `{dataset}`). "
        "학습 스택(torch 2.11.0+cu128)에서 쟀다.",
        "",
        "| 클래스 | AP50 | AP50-95 | 비고 |",
        "|---|---|---|---|",
    ]
    for name in CLASSES:
        v = serving["per_class"].get(name)
        seen = predicted["per_class"][name]
        note = f"P {v['P']:.3f} · R {v['R']:.3f} · conf≥{CONF_MIN} 검출 {seen['n']}" if v \
            else f"검출 없음 · conf≥{CONF_MIN} 검출 {seen['n']}"
        ap50 = f"{v['AP50']:.3f}" if v else "—"
        ap = f"{v['AP50-95']:.3f}" if v else "—"
        lines.append(f"| {name} | {ap50} | {ap} | {note} |")
    lines += [
        f"| **전체** | **{serving['mAP50']:.3f}** | **{serving['mAP50-95']:.3f}** | "
        f"이미지 {predicted['images']} · P {serving['P']:.3f} · R {serving['R']:.3f} |",
        "",
        f"**6종 평균 AP50 (`GENERAL` 제외) {six_map50(serving):.3f}** — ⑫ A/B 판정 지표다. "
        "7종 평균으로는 A 와 B 를 같은 자로 잴 수 없다.",
        "",
        f"`conf={CONF_MIN}` 에서 검출 **{total}개** "
        f"(이미지당 {total / predicted['images']:.1f}). "
        + (f"그중 `aiConfidence < {UNCLASSIFIED}` 가 **{below}개 ({below / total:.1%})** — "
           f"앱이 `unclassified` 로 표시하는 몫이다." if total else
           f"검출이 0개다 — `conf={CONF_MIN}` 이 너무 높다(⑰ 의 입력)."),
    ]
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return path


def main() -> int:
    ap = argparse.ArgumentParser(description="서빙 조건 평가 (⑪)")
    ap.add_argument("--weights", type=Path, default=WEIGHTS,
                    help=f"평가할 weights (기본 {WEIGHTS.name})")
    ap.add_argument("--compare-rect", action="store_true",
                    help="rect=True 로 한 번 더 돌려 학습 기록 재현을 확인한다 (일회성 검증)")
    ap.add_argument("--no-general", action="store_true",
                    help="GENERAL 을 뺀 변형으로 평가한다 (⑫ A/B 의 B)")
    args = ap.parse_args()
    # cp949 콘솔에서 한글 출력이 터지면 검사 보고만 사라져 성공한 줄 알게 된다
    sys.stdout.reconfigure(errors="replace")

    data_yaml = NOGEN_YAML if args.no_general else DATA_YAML
    suffix = "_nogen" if args.no_general else ""

    preflight(args.weights, data_yaml)
    print(f"\n{_passed} 통과 · {len(_failed)} 실패")
    if _failed:
        print("실패: " + " · ".join(_failed))
        print("평가를 시작하지 않는다.")
        return 1

    print(f"\n측정 조건 — imgsz={IMGSZ} · quantize=16 · batch={BATCH} · conf={VAL_CONF}")
    print(f"데이터셋 {data_yaml.parent.name} · weights {args.weights.parent.parent.name}")
    print("스택은 학습 서버(torch 2.11.0+cu128)다. 서빙은 cu130 이라 소수점이 갈릴 수 있다.")

    serving = run_val(args.weights, data_yaml, rect=False, name=f"eval{suffix}")
    print_val("1패스 — 서빙 조건 (rect=False)", serving)

    predicted = run_predict(args.weights, data_yaml)
    print_predict(predicted)

    if args.compare_rect:
        recorded = run_val(args.weights, data_yaml, rect=True, name=f"eval_rect_true{suffix}")
        print_val("참고 — 학습과 같은 조건 (rect=True)", recorded)

        # 기록값은 `run: train`(7종) 의 것이다. 다른 데이터셋·다른 weights 로 맞출 이유가
        # 없고, 억지로 대조하면 정상인 run 이 FAIL 로 보인다.
        print("\n[재현 검사]  학습 기록을 맞추는가")
        for key, expected in ({} if args.no_general else RECORDED_RECT_TRUE).items():
            got = recorded[key]
            check(f"rect=True 의 {key} == {expected}", abs(got - expected) < 0.002,
                  f"{got:.3f} (기록 {expected})")
        if args.no_general:
            print("  건너뛴다 — 기록값은 `run: train`(7종) 의 것이라 대조 대상이 아니다")

        print("\n[rect 영향]")
        for key in ("mAP50", "mAP50-95", "P", "R"):
            delta = serving[key] - recorded[key]
            print(f"  {key:<9} rect=True {recorded[key]:.3f} → "
                  f"rect=False {serving[key]:.3f}   델타 {delta:+.3f}")
        print("  델타가 0.000 이어도 위 [재현 검사] 가 통과했을 때만 "
              "'rect 영향 없음'이 성립한다 — 아니면 인자가 안 먹은 것이다")

        print(f"\n{_passed} 통과 · {len(_failed)} 실패")
        if _failed:
            print("실패: " + " · ".join(_failed))
            return 1

    report = write_report(serving, predicted, AI_DIR / "runs" / f"eval_report{suffix}.md",
                          data_yaml.parent.name)
    print(f"\n→ {report}  (experiment-log.md §4 에 그대로 붙는다)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
