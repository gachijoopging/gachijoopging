"""화면설계서 한 장을 검사한다: 요소 표의 계약 필드·경로가 openapi.yaml 에, 컴포넌트가 design-system 에 있는지.
사용: python docs/screens/check.py docs/screens/2-1-home.md"""
import re, sys, pathlib

ROOT = pathlib.Path(__file__).resolve().parents[2]
OPENAPI = (ROOT / "docs/openapi.yaml").read_text(encoding="utf-8")
INDEX = (ROOT / "design-system/src/index.ts").read_text(encoding="utf-8")
EXPORTED = set(re.findall(r"export \{([^}]+)\}", INDEX.replace("\n", " ")))
COMPONENTS = {n.strip().split(" as ")[-1] for grp in EXPORTED for n in grp.split(",") if n.strip()}
PATHS = set(re.findall(r"^  (/[^:\s]+):", OPENAPI, re.M))
FIELDS = set(re.findall(r"^\s+([a-zA-Z][a-zA-Z0-9]*):", OPENAPI, re.M))


def check(path: pathlib.Path) -> int:
    text = path.read_text(encoding="utf-8")
    m = re.search(r"## 요소\n(.*?)\n## ", text, re.S)
    if not m:
        print(f"{path}: '## 요소' 표가 없다"); return 1
    errors = 0
    base_line = text[: m.start()].count("\n") + 2
    for i, row in enumerate(m.group(1).splitlines()):
        if not row.startswith("|") or set(row) <= set("|- "):
            continue
        cells = [c.strip() for c in row.strip("|").split("|")]
        if len(cells) < 5 or cells[0] == "구역":
            continue
        for tok in re.findall(r"`([^`]+)`", cells[2]):
            if re.match(r"^(GET|POST|PUT|PATCH|DELETE)? ?/", tok):
                p = tok.split(" ")[-1]
                if p not in PATHS: errors += 1; print(f"{path}:{base_line+i}: 계약에 없는 경로 {p}")
            elif tok.split(".")[-1] not in FIELDS and not tok.startswith(("GET", "POST", "PUT", "PATCH", "DELETE")):
                errors += 1; print(f"{path}:{base_line+i}: 계약에 없는 필드 {tok}")
        for tok in re.findall(r"`([A-Za-z]+)`", cells[3]):
            if tok not in COMPONENTS and tok != "신규":
                errors += 1; print(f"{path}:{base_line+i}: design-system 에 없는 컴포넌트 {tok}")
    print(f"{path}: {'ok' if errors == 0 else f'{errors} errors'}")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(max(check(pathlib.Path(p)) for p in sys.argv[1:]))
