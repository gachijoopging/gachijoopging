#!/bin/sh
# 운영 DB 를 덤프한다. 서버의 /opt/gachijoopging 에서 cron 이 하루 한 번 부른다.
#
#   ./backup.sh                  덤프하고 30일 지난 덤프를 지운다
#   ./backup.sh --verify [파일]   빈 PostGIS 에 복원해 원본과 대조한다 (기본: 가장 최근 덤프)
#
# Supabase Free 플랜은 내려받을 수 있는 백업이 없다. 그래서 우리가 뜬다.
# 덤프는 이 서버 디스크에 둔다 — DB(Supabase)와 다른 곳이다. 서버와 DB 가 함께 사라지는 경우는 막지 못한다.
#
# 보관 30일은 개인정보처리방침 §6 의 약속이다("백업에 남은 사본은 30일 안에 함께 지운다").
# 실패는 여기서 알리지 않는다. watch.sh --limits 가 마지막 덤프의 나이를 본다 — cron 이 아예 안 돈
# 경우까지 잡으려면 결과를 밖에서 봐야 한다.
set -eu
cd "$(dirname "$0")"

ENV_FILE=.env
DIR=/data/backups
KEEP_DAYS=30
# 클라이언트 메이저는 서버(Supabase 17)보다 낮으면 안 된다 — pg_dump 가 거부한다.
CLIENT_IMAGE=postgres:17-alpine
# 복원 대상. 운영과 같은 메이저여야 덤프의 SET 문(예: transaction_timeout)이 통과한다.
RESTORE_IMAGE=postgis/postgis:17-3.5-alpine

read_env() { sed -n "s/^$1=//p" "$ENV_FILE" | sed 's/\$\$/$/g'; }

U=$(read_env DATABASE_USER)
PW=$(read_env DATABASE_PASSWORD)
H=$(read_env DATABASE_URL | sed 's|^jdbc:postgresql://||; s|[:/].*||')

# 대조 질의는 watch.sh 처럼 6543 으로 간다. 5432 의 상한 15 는 백엔드가 거의 다 쓴다.
src_psql() {
  docker run --rm -e PGPASSWORD="$PW" "$CLIENT_IMAGE" \
    psql -h "$H" -p 6543 -U "$U" -d postgres -tA -c "$1"
}

# 대조할 값. 원본과 복원본에 같은 질의를 던진다.
FACTS_SQL="select 'postgis', postgis_lib_version()
union all select 'flyway', (select version || ' ' || description from flyway_schema_history order by installed_rank desc limit 1)
union all select 'rows:' || table_name,
  (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from public.%I', table_name), false, true, '')))[1]::text
  from information_schema.tables
  where table_schema = 'public' and table_type = 'BASE TABLE' and table_name <> 'spatial_ref_sys'
order by 1"

if [ "${1:-}" = "--verify" ]; then
  file=${2:-$(ls -t "$DIR"/db-*.dump 2>/dev/null | head -1)}
  if [ -z "$file" ] || [ ! -f "$file" ]; then
    echo "덤프가 없다: ${file:-$DIR/db-*.dump}" >&2
    exit 1
  fi
  name=gachijoopging-restore-check
  docker rm -f "$name" >/dev/null 2>&1 || true
  # 끝나면 지운다. 개인정보가 든 복원본을 서버에 남기지 않는다.
  trap 'docker rm -f "$name" >/dev/null 2>&1 || true' EXIT
  docker run -d --name "$name" -e POSTGRES_PASSWORD=check "$RESTORE_IMAGE" >/dev/null
  i=0
  until docker exec "$name" pg_isready -U postgres -q 2>/dev/null; do
    i=$((i + 1))
    if [ "$i" -gt 60 ]; then echo "복원용 DB 가 뜨지 않는다" >&2; exit 1; fi
    sleep 1
  done
  # 이미지의 초기화 스크립트가 postgis 를 만든 뒤 한 번 재기동한다. 그 재기동이 끝나야 붙는다.
  sleep 5
  until docker exec "$name" pg_isready -U postgres -q 2>/dev/null; do sleep 1; done

  echo "복원: $file"
  start=$(date +%s)
  # 소유자·권한은 Supabase 역할이라 빈 DB 에 없다. 빼고 복원한다.
  # 오류가 나도 끝까지 간다 — 무엇이 실패했는지 전부 보고 대조로 판정한다.
  docker exec -i "$name" pg_restore -U postgres -d postgres --no-owner --no-acl < "$file" || true
  took=$(( $(date +%s) - start ))

  src=$(mktemp); dst=$(mktemp)
  trap 'docker rm -f "$name" >/dev/null 2>&1 || true; rm -f "$src" "$dst"' EXIT
  src_psql "$FACTS_SQL" > "$src"
  docker exec "$name" psql -U postgres -d postgres -tA -c "$FACTS_SQL" > "$dst"

  echo ""
  echo "원본 | 복원본"
  paste -d'|' "$src" "$dst" | awk -F'|' '{ m = ($2 == $4) ? "" : "   ← 다름"; printf "%-28s %-20s %-20s%s\n", $1, $2, $4, m }'
  echo ""
  echo "복원 ${took}초"
  # 판정은 flyway 와 표 목록만 한다.
  # 행 수는 덤프 뒤에 원본이 바뀐 만큼 다를 수 있다. postgis 판 번호는 복원 대상 이미지가 정한다 —
  # Supabase 와 같은 판의 이미지가 없으므로 살아 있는지만 본다.
  if ! grep -q '^postgis|.' "$dst"; then
    echo "복원본에 postgis 가 없다" >&2
    exit 1
  fi
  if [ "$(grep '^flyway|' "$src")" != "$(grep '^flyway|' "$dst")" ] \
    || [ "$(cut -d'|' -f1 "$src")" != "$(cut -d'|' -f1 "$dst")" ]; then
    echo "flyway 버전이나 표 목록이 다르다" >&2
    exit 1
  fi
  echo "통과 — flyway·표 목록 일치, postgis 있음"
  exit 0
fi

umask 077
mkdir -p "$DIR"
out="$DIR/db-$(date +%F).dump"
# 끝까지 쓴 것만 .dump 가 된다. 도중에 죽은 파일을 최근 덤프로 착각하지 않게 한다.
#
# public 만 뜬다. Supabase 가 관리하는 스키마(auth·storage 등)는 우리 것이 아니다.
# -n 을 주면 확장은 빠지므로 postgis 를 -e 로 따로 넣는다.
#
# 덤프는 session mode(5432)로 뜬다. transaction mode(6543)는 문장마다 커넥션이 바뀔 수 있어
# pg_dump 의 스냅샷이 깨진다. 커넥션 하나라 상한 15 에 여유가 있다.
docker run --rm --user "$(id -u):$(id -g)" -e PGPASSWORD="$PW" -v "$DIR:/out" "$CLIENT_IMAGE" \
  pg_dump -h "$H" -p 5432 -U "$U" -d postgres -n public -e postgis -Fc -f "/out/$(basename "$out").tmp"
mv "$out.tmp" "$out"
echo "$(date '+%F %T') 덤프 $(du -h "$out" | cut -f1) $out"

find "$DIR" -name 'db-*.dump' -mtime +$((KEEP_DAYS - 1)) -print -delete
find "$DIR" -name 'db-*.dump.tmp' -mtime +0 -print -delete
