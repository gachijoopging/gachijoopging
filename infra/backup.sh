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
  # -v 를 빼면 컨테이너만 지워지고 익명 볼륨이 남는다. 이미지가 PGDATA 를 VOLUME 으로 선언하므로
  # 그 볼륨에 복원된 운영 DB 사본이 통째로 남는데, /data/backups 가 아니라 30일 삭제 대상도 아니다.
  docker rm -fv "$name" >/dev/null 2>&1 || true
  # 끝나면 지운다. 개인정보가 든 복원본을 서버에 남기지 않는다.
  trap 'docker rm -fv "$name" >/dev/null 2>&1 || true' EXIT
  # dash(/bin/sh)는 신호로 죽을 때 EXIT trap 을 돌리지 않는다. Ctrl-C·SSH 끊김에도 복원본을 지운다.
  trap 'exit 1' INT TERM HUP
  docker run -d --name "$name" -e POSTGRES_PASSWORD=check "$RESTORE_IMAGE" >/dev/null
  # TCP 로 묻는다. 유닉스 소켓으로 물으면 **초기화 중인 임시 서버**가 ready 를 돌려준다 —
  # postgres 엔트리포인트는 초기화 서버를 listen_addresses='' 로 띄우기 때문이다. 그때 복원을
  #시작하면 postgis 설치가 끝나며 그 서버가 내려가 복원이 중간에 끊기고, 증상은 "표 목록이
  # 다르다"로 나와 덤프가 깨진 것처럼 보인다. TCP 는 진짜 서버가 뜬 뒤에만 열린다.
  i=0
  until docker exec "$name" pg_isready -h 127.0.0.1 -U postgres -q 2>/dev/null; do
    i=$((i + 1))
    if [ "$i" -gt 60 ]; then
      echo "복원용 DB 가 뜨지 않는다" >&2
      docker logs --tail 20 "$name" >&2 || true
      exit 1
    fi
    sleep 1
  done

  # 기본 postgres DB 에는 이미지가 postgis 를 미리 깔아 둔다. 거기에 복원하면 덤프에 확장이
  # 빠져 있어도 통과한다 — 검증이 덤프가 아니라 이미지를 보게 된다. 빈 DB 를 만들어 거기에 넣는다.
  docker exec "$name" createdb -U postgres restore
  # 덤프에 CREATE SCHEMA public 이 들어 있다. 미리 지워 두면 정상 복원에 오류가 하나도 없어서
  # pg_restore 의 종료 코드만으로 판정할 수 있다 — 도중에 죽은 복원(SIGKILL)도 여기서 걸린다.
  docker exec "$name" psql -U postgres -d restore -q -c 'drop schema public'

  echo "복원: $file"
  start=$(date +%s)
  # 소유자·권한은 Supabase 역할이라 빈 DB 에 없다. 빼고 복원한다.
  if ! docker exec -i "$name" pg_restore -U postgres -d restore --no-owner --no-acl --exit-on-error < "$file"; then
    echo "복원이 끝까지 가지 못했다" >&2
    exit 1
  fi
  took=$(( $(date +%s) - start ))

  src=$(mktemp); dst=$(mktemp)
  trap 'docker rm -fv "$name" >/dev/null 2>&1 || true; rm -f "$src" "$dst"' EXIT
  src_psql "$FACTS_SQL" > "$src"
  docker exec "$name" psql -U postgres -d restore -tA -c "$FACTS_SQL" > "$dst"

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
# 수동 백업이 cron 과 겹치면 두 pg_dump 가 같은 .tmp 에 쓴다
exec 9>"$DIR/.lock"
if ! flock -n 9; then
  echo "다른 백업이 돌고 있다" >&2
  exit 1
fi

# 지우기를 덤프보다 **먼저** 한다. 맨 끝에 두면 덤프가 실패한 날 set -e 가 여기까지 오지 못해,
# pooler 장애로 사흘 실패하면 30일 넘은 덤프가 사흘 더 남는다. 개인정보처리방침 §6 의 약속이라
# 덤프 성공 여부와 독립이어야 한다.
#
# -mtime 은 나이를 하루 단위로 내림한다. 30일 전 덤프가 오늘 이 줄이 도는 시각보다 몇 초라도
# 늦게 끝났다면 31일째까지 남는다. 분 단위로 재고 1시간 여유를 둬 cron 시각이 날마다 몇 초씩
# 흔들리는 것을 흡수한다.
find "$DIR" -name 'db-*.dump' -mmin +$((KEEP_DAYS * 24 * 60 - 60)) -print -delete
find "$DIR" -name 'db-*.dump.tmp' -mtime +0 -print -delete

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
# 위의 umask 는 컨테이너 안 프로세스에 걸리지 않아 덤프가 644 로 나온다. 디렉터리가 700 이라
# 당장 새지는 않지만, 개인정보가 든 파일이 디렉터리 권한 하나에만 기대게 두지 않는다.
chmod 600 "$out"
echo "$(date '+%F %T') 덤프 $(du -h "$out" | cut -f1) $out"
