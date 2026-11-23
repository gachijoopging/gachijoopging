"""계약 스모크 테스트 — 서버가 README §2 를 지키는지 항목별로 확인한다.

로컬에도 ngrok 고정 도메인에도 같은 스크립트를 쓴다:

    uv run python scripts/smoke.py
    uv run python scripts/smoke.py --base-url https://<고정도메인> --image ~/사진.jpg

`--image` 에 **세로로 찍은 폰 사진**을 주면 EXIF 정합성 확인이 실물 검증이 된다
(박스가 제 위치인지 눈으로 보는 것은 ③ 시각화 도구가 한다).

**사진에 쓰레기가 보여야 한다.** 검출이 0개면 항목 단위 검사 5건이 빈 목록 위에서
`all() == True` 로 통과해 아무것도 뜻하지 않는다. 그 5건은 PASS 가 아니라 **SKIP** 으로
찍고 종료 코드도 0 이 아니다 — ⑬ 에서 실제로 밟았다(자체 학습 모델은 버스를 검출하지
않으므로 그때까지 기본값이던 `bus.jpg` 로는 5건이 전부 빈 검사가 됐다).

종료 코드 0 = 전부 통과 **+ 건너뛴 것 없음**. 데모 전 점검(README §9)에 그대로 쓸 수 있다.
"""

from __future__ import annotations

import argparse
import io
import json
import os
import re
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import requests
from PIL import Image

AI_DIR = Path(__file__).resolve().parent.parent
CLASSES = {"CIGARETTE", "CAN", "PLASTIC", "PAPER", "GLASS", "VINYL", "GENERAL"}

# 이 파일은 em dash 를 출력한다. 한국어 Windows 에서 stdout 이 cp949 로 잡히면
# UnicodeEncodeError 로 죽는데, 파이프·리다이렉트 여부에 따라 인코딩이 갈려서
# **같은 코드가 어떤 실행에서는 통과하고 어떤 실행에서는 죽는다** — 원인이 안 보인다.
# 그래서 실행 시점에 못박는다. cp949 콘솔이면 글자가 깨질 수는 있지만 죽지는 않는다.
for _stream in (sys.stdout, sys.stderr):
    if hasattr(_stream, "reconfigure"):
        _stream.reconfigure(encoding="utf-8", errors="replace")

_passed = 0
_failed: list[str] = []
_skipped: list[str] = []


def check(name: str, cond: bool, detail: str = "") -> bool:
    global _passed
    if cond:
        _passed += 1
        print(f"  PASS  {name}" + (f"  ({detail})" if detail else ""))
    else:
        _failed.append(name)
        print(f"  FAIL  {name}  {detail}")
    return cond


def skip(name: str, why: str) -> None:
    """검사가 **성립하지 않았다**. PASS 도 FAIL 도 아니고, 종료 코드는 0 이 아니다.

    빈 목록에 `all()` 을 걸면 참이 나온다. 그걸 PASS 로 찍으면 확인하지 않은 것을
    확인했다고 보고하게 되고, 데모 당일에 그 차이가 드러난다.
    """
    _skipped.append(name)
    print(f"  SKIP  {name}  — {why}")


def read_secret() -> str:
    if v := os.environ.get("AI_SECRET"):
        return v.strip()
    env = AI_DIR / ".env"
    if env.exists():
        for line in env.read_text(encoding="utf-8").splitlines():
            if line.startswith("AI_SECRET="):
                return line.split("=", 1)[1].strip()
    sys.exit("AI_SECRET 을 찾을 수 없다 — 환경변수나 ai/.env 에 넣어라")


def default_image() -> Path:
    """테스트 사진. **쓰레기가 찍힌 것**이어야 항목 단위 검사가 성립한다(모듈 docstring).

    데이터셋이 있으면 **학습** 이미지를 쓴다 — val 을 쓰지 않는 이유는 검증셋을 건드리는
    코드로 보이지 않게 하려는 것뿐이고, 스모크는 추론만 하므로 정확도와는 무관하다.
    데이터셋은 커밋되지 않으므로(4.2GB) 없으면 ultralytics 내장 샘플로 떨어진다 —
    그 경우 검출이 0개라 5건이 SKIP 되고, 그 메시지가 무엇을 줘야 하는지 말한다.
    """
    train = AI_DIR / "datasets" / "trash" / "images" / "train"
    if train.is_dir() and (found := sorted(train.glob("*.jpg"))):
        return found[0]

    from ultralytics.utils import ASSETS

    return Path(ASSETS) / "bus.jpg"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base-url", default="http://127.0.0.1:8000")
    ap.add_argument("--image", type=Path, default=None, help="테스트 사진 (기본: 내장 샘플)")
    ap.add_argument("--concurrency", type=int, default=8)
    ap.add_argument("--timeout", type=float, default=60.0)
    args = ap.parse_args()

    base = args.base_url.rstrip("/")
    secret = read_secret()
    img_path = args.image or default_image()
    if not img_path.exists():
        sys.exit(f"이미지가 없다: {img_path}")
    payload = img_path.read_bytes()
    print(f"대상 {base} · 이미지 {img_path.name} ({len(payload) / 1024:.0f} KB)\n")

    def post(data: bytes, headers: dict | None = None, files_override=None):
        return requests.post(
            f"{base}/internal/infer",
            headers={"X-AI-Secret": secret} if headers is None else headers,
            files=files_override or {"file": (img_path.name, data, "image/jpeg")},
            timeout=args.timeout,
        )

    # --------------------------------------------------------------- /healthz
    print("[1] /healthz")
    try:
        h = requests.get(f"{base}/healthz", timeout=10)
    except requests.RequestException as e:
        return fail_out(f"서버에 연결할 수 없다: {e}")
    try:
        hb = h.json()
    except ValueError:
        # **연결은 됐는데 우리 서버가 아닌 경우가 여기로 온다.** 터널을 거치면 ngrok 이
        # 자기 에러를 HTML 로 돌려주므로(`ERR_NGROK_8012` 502 = 터널 뒤 uvicorn 이 죽음,
        # `ERR_NGROK_3200` 404 = 터널 자체가 없음) `.json()` 이 JSONDecodeError 로 터진다.
        # 그대로 두면 데모 직전 점검(§9.1)에서 판정 대신 트레이스백을 읽게 된다.
        # 이 지점만 막으면 충분하다 — /healthz 가 JSON 을 주면 그 뒤는 우리 FastAPI 이고,
        # 계약상 에러 본문도 전부 {"code","message"} 라 아래 .json() 들은 안전하다.
        # ngrok 의 에러 코드를 뽑아 준다 — HTML 200자를 쏟는 것보다 이 한 토큰이
        # README §9.1 의 진단표로 바로 이어진다. 못 찾으면 본문 앞부분으로 떨어진다.
        code = re.search(r"ERR_NGROK_\d+", h.text)
        detail = code.group() if code else " ".join(h.text.split())[:120]
        return fail_out(
            f"/healthz 가 JSON 이 아니다 — 터널 뒤에 서버가 없을 수 있다"
            f" (status={h.status_code}, content-type={h.headers.get('content-type', '?')}):"
            f" {detail}"
        )
    check("본문 키가 계약과 일치",
          {"ready", "modelVersion", "warmedUp"} <= set(hb), str(sorted(hb)))
    check("상태 코드와 ready 가 일치",
          (h.status_code == 200) == bool(hb["ready"]),
          f"status={h.status_code} ready={hb['ready']}")
    check("시크릿 없이 조회 가능", True)
    if not hb["ready"]:
        print(f"        아직 준비 안 됨 — 대기한다. error={hb.get('error')}")
        deadline = time.time() + 180
        while time.time() < deadline:
            r = post(payload)
            if r.status_code == 503:
                check("워밍업 중 추론은 503 AI_UNAVAILABLE",
                      r.json().get("code") == "AI_UNAVAILABLE", r.text[:100])
                break
            time.sleep(0.2)
        while time.time() < deadline:
            hb = requests.get(f"{base}/healthz", timeout=10).json()
            if hb["ready"]:
                break
            time.sleep(0.5)
    check("ready=true, warmedUp=true", hb["ready"] and hb["warmedUp"],
          json.dumps(hb, ensure_ascii=False))
    check("error 는 null", hb.get("error") is None, str(hb.get("error")))
    print(f"        modelVersion={hb['modelVersion']}")

    # ---------------------------------------------------------------- 시크릿
    print("\n[2] 시크릿 검증")
    for label, hdr in (("헤더 없음", {}), ("틀린 값", {"X-AI-Secret": "wrong"})):
        r = post(payload, headers=hdr)
        check(f"401 — {label}",
              r.status_code == 401 and r.json().get("code") == "UNAUTHORIZED",
              f"status={r.status_code} {r.text[:80]}")

    # ------------------------------------------------------------- 정상 추론
    print("\n[3] 응답 형태")
    r = post(payload)
    if not check("200", r.status_code == 200, f"status={r.status_code} {r.text[:150]}"):
        return fail_out()
    d = r.json()
    check("최상위 키 == {modelVersion, inferenceMs, items}",
          set(d) == {"modelVersion", "inferenceMs", "items"}, str(sorted(d)))
    check("inferenceMs 는 int", isinstance(d["inferenceMs"], int), str(d["inferenceMs"]))
    if d["items"]:
        check("모든 item 키 == {bbox, category, aiConfidence}",
              all(set(i) == {"bbox", "category", "aiConfidence"} for i in d["items"]),
              str([sorted(i) for i in d["items"][:2]]))
        check("모든 bbox 키 == {x, y, w, h}",
              all(set(i["bbox"]) == {"x", "y", "w", "h"} for i in d["items"]),
              str([sorted(i["bbox"]) for i in d["items"][:2]]))
        check("category 전부 7종",
              all(i["category"] in CLASSES for i in d["items"]),
              str({i["category"] for i in d["items"]}))
        check("bbox 0~1 · w,h>0 · x+w<=1",
              all(0 <= b["x"] <= 1 and 0 <= b["y"] <= 1 and 0 < b["w"] <= 1 and 0 < b["h"] <= 1
                  and b["x"] + b["w"] <= 1.0001 and b["y"] + b["h"] <= 1.0001
                  for b in (i["bbox"] for i in d["items"])))
    else:
        for name in ("모든 item 키 == {bbox, category, aiConfidence}",
                     "모든 bbox 키 == {x, y, w, h}",
                     "category 전부 7종",
                     "bbox 0~1 · w,h>0 · x+w<=1"):
            skip(name, "검출 0개 — 빈 목록에는 all() 이 참이라 통과가 아무것도 뜻하지 않는다")
    print(f"        inferenceMs={d['inferenceMs']} items={len(d['items'])}")
    if d["items"]:
        print(f"        items[0]={json.dumps(d['items'][0], ensure_ascii=False)}")
    else:
        print("        검출 0개 — items:[] 자체는 정상 응답이지만(장애가 아니다)"
              " 이 사진으로는 계약을 확인할 수 없다")

    # -------------------------------------------------------- EXIF 정합성
    print("\n[4] EXIF 정합성 — 같은 그림을 세로 원본 / 가로저장+Orientation=6 으로 보낸다")
    src = Image.open(io.BytesIO(payload))
    upright = Image.open(io.BytesIO(payload)).convert("RGB")
    buf_a, buf_b = io.BytesIO(), io.BytesIO()
    upright.save(buf_a, "JPEG", quality=95)
    ex = Image.Exif()
    ex[0x0112] = 6  # 표시할 때 시계방향 90도
    upright.rotate(90, expand=True).save(buf_b, "JPEG", quality=95, exif=ex)
    a, b = post(buf_a.getvalue()).json(), post(buf_b.getvalue()).json()
    print(f"        원본 EXIF Orientation={src.getexif().get(274)} · 저장 크기 {src.size}")
    if check("검출 수 동일", len(a["items"]) == len(b["items"]),
             f"{len(a['items'])} vs {len(b['items'])}"):
        if a["items"]:
            worst = max(abs(x["bbox"][k] - y["bbox"][k])
                        for x, y in zip(a["items"], b["items"]) for k in "xywh")
            check("좌표 최대 오차 < 0.02", worst < 0.02, f"오차 {worst:.4f}")
        else:
            # 위 "검출 수 동일" 도 0 vs 0 으로 통과한 것이다. EXIF 정방향 보정은 §6 이
            # "절대 못 버리는 것" 1순위로 꼽은 항목인데, 여기서 조용히 넘어가면 그 검사가
            # 사라진 것을 아무도 모른다.
            skip("좌표 최대 오차 < 0.02",
                 "검출 0개 — 비교할 좌표가 없다. 위 '검출 수 동일'도 0 vs 0 이라 무의미하다")

    # ------------------------------------------------------- 잘못된 입력
    print("\n[5] 잘못된 입력")
    r = post(b"not an image at all")
    check("이미지 아님 → 422 INVALID_IMAGE",
          r.status_code == 422 and r.json().get("code") == "INVALID_IMAGE",
          f"status={r.status_code} {r.text[:110]}")
    r = post(b"")
    check("빈 파일 → 422", r.status_code == 422, f"status={r.status_code}")
    r = requests.post(f"{base}/internal/infer", headers={"X-AI-Secret": secret},
                      data={"nope": "1"}, timeout=args.timeout)
    check("file 누락 → 422 VALIDATION",
          r.status_code == 422 and r.json().get("code") == "VALIDATION",
          f"status={r.status_code} {r.text[:110]}")
    buf = io.BytesIO()
    Image.new("RGB", (1200, 900), (128, 128, 128)).save(buf, "JPEG")
    r = post(buf.getvalue())
    check("검출 0개 → 200 + items:[]",
          r.status_code == 200 and r.json()["items"] == [], f"{r.status_code} {r.text[:110]}")
    buf = io.BytesIO()
    upright.convert("L").save(buf, "JPEG")
    check("그레이스케일 JPEG 200", post(buf.getvalue()).status_code == 200)

    # ------------------------------------------------------------- 동시성
    n = args.concurrency
    print(f"\n[6] 동시 요청 {n}건")
    t0 = time.perf_counter()
    with ThreadPoolExecutor(n) as ex_:
        rs = list(ex_.map(lambda _: post(payload), range(n)))
    wall = (time.perf_counter() - t0) * 1000
    check(f"{n}건 전부 200", all(x.status_code == 200 for x in rs),
          str([x.status_code for x in rs]))
    if all(x.status_code == 200 for x in rs):
        bodies = [x.json() for x in rs]
        check("결과 동일 (GPU 직렬화가 결과를 섞지 않음)",
              len({json.dumps(x["items"], sort_keys=True) for x in bodies}) == 1)
        ms = sorted(x["inferenceMs"] for x in bodies)
        print(f"        전체 {wall:.0f}ms · {n / (wall / 1000):.1f} req/s · "
              f"inferenceMs {ms[0]}~{ms[-1]} (GPU 대기 포함)")

    return fail_out()


def fail_out(msg: str = "") -> int:
    if msg:
        print(f"  FAIL  {msg}")
        _failed.append(msg)
    print(f"\n{'=' * 60}")
    print(f"PASS {_passed} / FAIL {len(_failed)} / SKIP {len(_skipped)}")
    if _failed:
        print("실패: " + ", ".join(_failed))
    if _skipped:
        print(f"건너뜀 {len(_skipped)}건 — 확인하지 않은 것이므로 종료 코드는 0 이 아니다:")
        for name in _skipped:
            print(f"  · {name}")
        print("  → **쓰레기가 보이는 사진**을 --image 로 줘라. 검출이 0개인 사진으로는"
              " 항목·좌표 계약을 확인할 수 없다.")
    return 1 if (_failed or _skipped) else 0


if __name__ == "__main__":
    sys.exit(main())
