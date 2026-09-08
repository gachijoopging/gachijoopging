"""TACO 원본 이미지·주석 다운로드 — ⑨ 데이터셋 빌드의 첫 단계.

`annotations.json` 의 bbox 좌표는 **원본 픽셀 기준**이다. 저장된 파일 해상도가 주석과
어긋나면 라벨이 전부 틀어지는데 **에러 없이 조용히 틀린다.** 그래서 받은 직후 크기를
대조하고, 어긋나면 파일을 남기지 않는다.

이어받기 가능 — 이미 있고 크기가 맞으면 건너뛴다. 실패분만 다시 받으려면 그냥 재실행한다.

    uv run python scripts/download_taco.py

**Flickr 가 레이트 리밋을 건다.** 워커 8개로 1500장을 한 번에 훑었더니 **HTTP 429 가 485건**
났다. 워커를 늘리면 더 심해진다 — 기본값 4 이하로 두고 실패 수가 0 이 될 때까지 재실행한다.
총량은 약 6.5GB(1500장, 장당 중앙 4.4MB).

429 를 만나면 **짧게(기본 5초) 두 번만 시도하고 다음 파일로 넘어간다.** 오래 기다려 한
파일을 살리는 것보다 목록을 여러 번 빠르게 훑는 쪽이 더 많이 받는다 — 근거는 `BACKOFF_429`
주석. `--backoff-429` 로 조절한다. 그래서 **재실행이 예외가 아니라 정상 절차**다.

> **AhnLab V3 를 끄고 받는다.** 켜져 있으면 "네트워크에서 받아 디스크에 다량 기록"이
> 랜섬웨어 행위 휴리스틱에 걸려 **프로세스가 10장쯤마다 트레이스백 없이 죽는다.**
> 파이썬 예외가 아니라 외부 종료라 원인이 안 보인다.

주의: `flickr_url` 은 확장자가 `.png` 인 것이 1034건이지만 **내용은 전부 JPEG** 다.
TACO 의 `file_name`(`.jpg`)을 그대로 쓰는 것이 맞다. 그리고 레포의
`detector/taco_config/map_*.csv`(64행)는 이 주석(60종)과 다르니 기준표로 쓰지 않는다.
"""

from __future__ import annotations

import argparse
import json
import time
import urllib.error
import urllib.request
from collections import Counter
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

from PIL import Image

ANN_URL = "https://raw.githubusercontent.com/pedropro/TACO/master/data/annotations.json"
UA = {"User-Agent": "Mozilla/5.0"}
DEFAULT_OUT = Path(__file__).resolve().parents[1] / "datasets" / "taco"

# 429(레이트 리밋) 전용 재시도. 다른 오류는 아래 `retries` 를 그대로 쓴다.
#
# **원래는 45초에서 시작해 5회까지 늘렸는데(45+90+135+180+225 = 파일당 11.25분) 그게
# 역효과였다.** 실측 (08-03): 워커 2개로 55분 동안 16장. 이 스크립트는 1500장을 **목록
# 순서대로** 훑기 때문에 앞쪽 파일에서 11분씩 잡히면 뒤쪽에는 도달하지 못한다. 오래
# 기다려서 한 파일을 살리는 것보다, **빨리 포기하고 목록 끝까지 간 다음 다시 훑는 쪽**이
# 그때그때 안 막힌 파일을 더 많이 주워 온다 — 어차피 이어받기가 되므로 재실행이 싸다.
#
# 0 으로 두지 않는 이유: 쉬지 않고 초당 여러 건을 던지면 스로틀이 더 깊어진다.
BACKOFF_429 = 5
RETRIES_429 = 2


def fetch(url: str, timeout: int = 60) -> bytes:
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=timeout) as r:
        return r.read()


def size_of(path: Path) -> tuple[int, int] | None:
    """EXIF Orientation 을 적용한 크기. 없으면 None.

    **TACO 주석은 EXIF 적용 후(정방향) 크기로 기록돼 있다.** 실측: `batch_11` 등
    Orientation=6 이미지는 파일이 가로(4128×2322)로 저장돼 있는데 주석은 세로(2322×4128)다.
    저장 크기로 대조하면 멀쩡한 이미지를 불일치로 버리고, 저장 크기로 좌표를 정규화하면
    bbox 가 전치돼 **에러 없이 조용히 틀어진다.**
    """
    try:
        with Image.open(path) as im:
            w, h = im.size
            # 5~8 은 90도 회전이 섞인 방향값이라 가로·세로가 바뀐다 (ultralytics exif_size 와 동일)
            return (h, w) if im.getexif().get(274, 1) in (5, 6, 7, 8) else (w, h)
    except Exception:
        return None


def fallback_1024_url(entry: dict) -> str | None:
    """`flickr_640_url` 의 secret 으로 `_b`(장변 1024) URL 을 만든다.

    원본(`_o`)이 영구 거부되는 사진이 있다 — batch_8·9 의 127장 (실측 2026-08-03).
    크기 접미사마다 secret 이 다르므로 원본 URL 로는 만들 수 없고 640 URL 에서 파생한다.
    `_h`(1600)·`_k`(2048)는 그 사진들에서 **410 Gone** 이라 1024 가 받을 수 있는 최대다.
    """
    url = entry.get("flickr_640_url")
    if not url or not url.endswith("_z.jpg"):
        return None
    return url[: -len("_z.jpg")] + "_b.jpg"


def aspect_ok(got: tuple[int, int], want: tuple[int, int], tol: float = 0.01) -> bool:
    """비율이 같은가 — 대체본은 해상도가 다르므로 크기 대조를 이것으로 바꾼다.

    YOLO 라벨은 정규화 0~1 값이라 해상도와 무관하다. 통상적인 비율(4:3·3:2·16:9 및 그
    세로 버전)에서는 전치되면 비율이 뒤집혀 이 검사에 확실히 걸린다.

    **다만 거의 정사각형인 사진의 전치는 못 잡는다.** 전치는 비율 `r = W/H` 를 `1/r` 로
    뒤집는데, `r ≈ 1` 이면 `1/r ≈ r` 이라 `abs(1/r - r)` 가 tol 보다 작아져 버린다.
    `tol=0.01` 로 풀면 `r` 이 대략 [0.995, 1.005] 구간일 때 전치돼도 이 검사를 통과한다.
    (실측 2026-08-03: 현재 대체본 127장의 비율은 0.456~2.193 이고, 여유를 둔 0.95~1.05
    구간에 드는 것이 0건이라 지금은 위험하지 않다. 다른 배치·다른 데이터셋에 재사용할
    때는 이 한계를 다시 확인해야 한다.)
    """
    return abs(got[0] / got[1] - want[0] / want[1]) < tol


def download_one(
    entry: dict,
    out: Path,
    retries: int = 5,
    backoff_429: int = BACKOFF_429,
    fallback: bool = False,
    substituted: frozenset[str] = frozenset(),
) -> tuple[str, str, str]:
    """(상태, 파일명, 메시지). 상태 = ok | skip | substituted | mismatch | fail"""
    name = entry["file_name"]
    dst = out / "images" / name
    wh = (entry["width"], entry["height"])
    existing = size_of(dst) if dst.exists() else None
    # 대체본은 크기가 주석과 다르다 — 목록에 있고 비율이 맞으면 받은 것으로 본다.
    # 이 분기가 없으면 대체본을 매 실행마다 다시 받는다.
    if existing == wh or (existing and name in substituted and aspect_ok(existing, wh)):
        return "skip", name, ""

    dst.parent.mkdir(parents=True, exist_ok=True)
    tmp = dst.with_name(dst.name + ".part")
    last = ""
    for attempt in range(retries):
        try:
            tmp.write_bytes(fetch(entry["flickr_url"]))
            got = size_of(tmp)
            if got != wh:
                tmp.unlink(missing_ok=True)
                return "mismatch", name, f"주석 {wh} vs 파일 {got}"
            tmp.replace(dst)
            return "ok", name, ""
        except urllib.error.HTTPError as e:
            last = f"HTTPError: HTTP Error {e.code}: {e.reason}"
            if e.code == 429:
                # 빨리 포기하고 다음 파일로 넘어간다 — 근거는 위 BACKOFF_429 주석.
                if attempt + 1 >= RETRIES_429:
                    break
                time.sleep(backoff_429 * (attempt + 1))
            else:
                time.sleep(2 * (attempt + 1))
        except Exception as e:  # 연결 끊김은 간헐적이라 짧은 재시도로 대부분 복구된다
            last = f"{type(e).__name__}: {e}"
            time.sleep(2 * (attempt + 1))

    # 원본이 거부되면 장변 1024 대체본을 받는다 (--fallback-1024).
    if fallback:
        url = fallback_1024_url(entry)
        if url:
            try:
                tmp.write_bytes(fetch(url))
                got = size_of(tmp)
                if got and aspect_ok(got, wh):
                    tmp.replace(dst)
                    return "substituted", name, f"{got[0]}x{got[1]} (주석 {wh[0]}x{wh[1]})"
                tmp.unlink(missing_ok=True)
                return "mismatch", name, f"대체본 비율 불일치 {got} vs 주석 {wh}"
            except Exception as e:
                last = f"{last} · 대체본도 실패: {type(e).__name__}: {e}"
    tmp.unlink(missing_ok=True)
    return "fail", name, last


def main() -> int:
    ap = argparse.ArgumentParser(description="TACO 원본 이미지·주석 다운로드")
    ap.add_argument("--out", type=Path, default=DEFAULT_OUT, help=f"기본 {DEFAULT_OUT}")
    ap.add_argument("--workers", type=int, default=4, help="늘리면 Flickr 차단이 심해진다")
    ap.add_argument("--backoff-429", type=int, default=BACKOFF_429,
                    help=f"429 재시도 간격(초). 기본 {BACKOFF_429}. 올리면 한 파일을 더 오래 "
                         f"붙잡고, 내리면 목록을 더 빨리 훑는다")
    ap.add_argument("--fallback-1024", action="store_true",
                    help="원본이 거부되면 장변 1024 대체본을 받는다. 화질이 낮으므로 "
                         "받은 목록을 substituted.txt 에 남긴다")
    args = ap.parse_args()

    args.out.mkdir(parents=True, exist_ok=True)
    ann = args.out / "annotations.json"
    if not ann.exists():
        print("주석 다운로드…", flush=True)
        ann.write_bytes(fetch(ANN_URL))
    images = json.loads(ann.read_text(encoding="utf-8"))["images"]
    print(f"이미지 {len(images)}장 · 워커 {args.workers} · 저장 {args.out}", flush=True)

    sub_path = args.out / "substituted.txt"
    substituted: dict[str, str] = {}
    if sub_path.exists():
        for line in sub_path.read_text(encoding="utf-8").splitlines():
            if line.strip():
                parts = line.split("\t")
                substituted[parts[0]] = parts[1] if len(parts) > 1 else ""
        print(f"기존 대체본 {len(substituted)}장 (substituted.txt)", flush=True)

    def save_substituted() -> None:
        """대체본 목록을 **즉시** 쓴다.

        완료 후에 한 번만 쓰면 프로세스가 끝까지 못 갈 때 기록이 사라지는데, 그러면
        `build_dataset.py` 가 디스크의 대체본을 **크기 불일치로 보고 버린다** — 파일은
        있는데 데이터셋에서 빠지고 이유가 안 보인다. 127장짜리 작은 파일이라 매번 써도 싸다.
        """
        sub_path.write_text(
            "\n".join(f"{n}\t{m}" for n, m in sorted(substituted.items())) + "\n",
            encoding="utf-8",
        )

    counts: Counter[str] = Counter()
    problems: list[tuple[str, str, str]] = []
    t0 = time.monotonic()
    with ThreadPoolExecutor(args.workers) as ex:
        futures = [
            ex.submit(download_one, e, args.out, backoff_429=args.backoff_429,
                      fallback=args.fallback_1024, substituted=frozenset(substituted))
            for e in images
        ]
        for done, fut in enumerate(as_completed(futures), 1):
            status, name, msg = fut.result()
            counts[status] += 1
            if status in ("fail", "mismatch"):
                problems.append((status, name, msg))
            if status == "substituted":
                substituted[name] = msg
                save_substituted()
            if done % 50 == 0 or done == len(images):
                print(
                    f"  {done}/{len(images)}  받음 {counts['ok']} 건너뜀 {counts['skip']} "
                    f"실패 {counts['fail']} 불일치 {counts['mismatch']} "
                    f"· {(time.monotonic() - t0) / 60:.1f}분",
                    flush=True,
                )

    total_mb = sum(p.stat().st_size for p in (args.out / "images").rglob("*.jpg")) / 1e6
    print(
        f"\n완료 — 받음 {counts['ok']} · 건너뜀 {counts['skip']} · 실패 {counts['fail']} "
        f"· 해상도 불일치 {counts['mismatch']} · 대체본 {counts['substituted']} "
        f"· 총 {total_mb / 1000:.1f}GB",
        flush=True,
    )
    if substituted:
        save_substituted()
        print(f"대체본 {len(substituted)}장 → {sub_path}  (장변 1024 · 원본이 거부된 것)",
              flush=True)
    log = args.out / "problems.txt"
    if problems:
        log.write_text("\n".join(f"{s}\t{n}\t{m}" for s, n, m in problems), encoding="utf-8")
        print(f"문제 {len(problems)}건 → {log}. 재실행하면 실패분만 다시 받는다.", flush=True)
        return 1
    # 성공한 실행이 옛 실패 기록을 남기면 이번 실행이 성공인지 실패인지 파일만 봐서는
    # 알 수 없다 — 실패가 0 이면 지운다.
    log.unlink(missing_ok=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
