#!/bin/sh
# 죽은 것을 알린다. 서버의 /opt/gachijoopging 에서 cron 이 부른다.
#
#   ./watch.sh              살아 있나 (5분마다)
#   ./watch.sh --limits     ADR-0005 재검토 조건 (하루 한 번)
#
# 이것은 두 겹 중 안쪽이다. 서버가 통째로 꺼지면 이 스크립트도 같이 죽으므로
# 바깥에서 찌르는 쪽(.github/workflows/watch.yml)이 따로 있어야 한다.
#
# set -e 아래에서 `[ 조건 ] && 명령` 을 쓰지 않는다. 조건이 거짓이면 그 줄이 0 이 아닌 값을
# 돌려주고 스크립트가 거기서 끝난다 — 감시가 조용히 멈추는 가장 흔한 방식이다.
set -eu
cd "$(dirname "$0")"

ENV_FILE=.env
STATE=.watch-state
FAILS_TO_ALERT=2   # 연속 2회. 1회로 하면 배포 중 재기동마다 알림이 온다

read_env() { sed -n "s/^$1=//p" "$ENV_FILE" | sed 's/\$\$/$/g'; }

HOOK=$(read_env MM_WEBHOOK_URL)
PUBLIC=$(read_env PUBLIC_BASE_URL)
AI=$(read_env AI_BASE_URL)

# 웹훅을 인자로 받지 않는다 — 그러면 ps 목록에 남는다. .env 에서만 읽는다.
notify() {
  if [ -z "$HOOK" ]; then
    echo "MM_WEBHOOK_URL 이 없다 — 알리지 못한다: $1" >&2
    return 0
  fi
  body=$(printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g')
  # username·icon_emoji 를 실어 보내지 않는다 — 이 워크스페이스는 override 가 꺼져 있어
  # 무시되고 웹훅 주인 이름으로 나간다. 보낸 사람 대신 머리말 이모지로 구별한다.
  printf '{"text":"%s"}' "$body" \
    | curl -sS -f -X POST -H 'Content-Type: application/json' -d @- "$HOOK" >/dev/null
}

# 상태 파일은 "이름 연속실패횟수" 다. 바뀌는 순간에만 알린다 —
# 죽어 있는 동안 5분마다 쏘면 알림을 무시하는 습관이 생기고, 그러면 감시가 없는 것보다 나쁘다.
prev_fails() {
  if [ -f "$STATE" ]; then awk -v k="$1" '$1==k{print $2}' "$STATE"; fi
}

NEW_STATE=$(mktemp)
trap 'rm -f "$NEW_STATE"' EXIT

record() {
  name=$1; ok=$2; label=$3
  before=$(prev_fails "$name")
  before=${before:-0}

  if [ "$ok" = yes ]; then
    now=0
    if [ "$before" -ge "$FAILS_TO_ALERT" ]; then
      notify ":white_check_mark: **$label 복구** — $PUBLIC"
    fi
  else
    now=$((before + 1))
    if [ "$now" -eq "$FAILS_TO_ALERT" ]; then
      notify ":rotating_light: **$label 응답 없음** ($now회 연속) — $PUBLIC"
    fi
  fi

  printf '%s %s\n' "$name" "$now" >> "$NEW_STATE"
  if [ "$ok" = yes ]; then r=OK; else r=FAIL; fi
  printf '  %-8s %-4s (연속실패 %s)\n' "$name" "$r" "$now"
}

# ── ADR-0005 재검토 조건 ───────────────────────────────────────────
# 넘으면 서버 구성을 다시 논의한다(ADR-0005 §결과). 장애가 아니라 신호라 하루 한 번만 본다.
if [ "${1:-}" = "--limits" ]; then
  MEDIA=$(read_env MEDIA_ROOT)
  used=$(df --output=pcent "$MEDIA" | tail -1 | tr -dc '0-9')
  echo "디스크 ${used}% / 한계 50%"
  if [ "$used" -ge 50 ]; then
    notify ":warning: **디스크 ${used}%** — ADR-0005 재검토 조건(50%)을 넘었다"
  fi

  PW=$(read_env DATABASE_PASSWORD)
  U=$(read_env DATABASE_USER)
  H=$(read_env DATABASE_URL | sed 's|^jdbc:postgresql://||; s|[:/].*||')
  # session mode(5432)는 상한 15 라 백엔드가 거의 다 쓴다. 상한이 따로인 6543 으로 들어간다.
  #
  # 실패를 0 으로 대신하지 않는다. 비밀번호가 바뀌었거나 pooler 에 못 닿으면 "0MB" 가 되고,
  # 한계 검사는 영원히 통과하며, 아무도 그것을 모른다 — 이 파일 머리가 경고한 바로 그 모양이다.
  mb=$(docker run --rm -e PGPASSWORD="$PW" postgres:17-alpine psql -h "$H" -p 6543 -U "$U" \
       -d postgres -tAc "select (pg_database_size('postgres')/1024/1024)::int" 2>/dev/null || true)
  mb=$(printf '%s' "$mb" | tr -dc '0-9')

  if [ -z "$mb" ]; then
    echo "DB 크기를 읽지 못했다" >&2
    notify ":warning: **DB 크기를 읽지 못했다** — 자격이나 pooler 를 본다. 한계 검사가 돌지 않는다."
  else
    echo "DB ${mb}MB / 한계 400MB"
    if [ "$mb" -ge 400 ]; then
      notify ":warning: **DB ${mb}MB** — ADR-0005 재검토 조건(400MB)을 넘었다"
    fi
  fi
  exit 0
fi

# ── 살아 있나 ──────────────────────────────────────────────────────
echo "점검 $(date -Is)"

# compose 가 10초마다 돌리는 healthcheck 결과를 읽는다. 따로 찌르면 같은 일을 두 번 한다.
# 컨테이너 이름을 박지 않는다 — compose 의 이름 규칙이 바뀌면 조용히 none 이 된다(deploy.sh 와 같은 방식).
health() {
  id=$(docker compose ps -q "$1" 2>/dev/null)
  if [ -z "$id" ]; then echo none; else
    docker inspect -f '{{.State.Health.Status}}' "$id" 2>/dev/null || echo none
  fi
}

if [ "$(health backend)" = healthy ]; then
  record backend yes "백엔드"
  backend_ok=yes
else
  record backend no "백엔드"
  backend_ok=no
fi

if [ "$(health redis)" = healthy ]; then
  record redis yes "Redis"
else
  record redis no "Redis"
fi

# 소켓은 토큰 없이 401 이면 정상이다 — Spring 까지 닿았다는 뜻이다.
# 백엔드가 죽으면 Nginx 가 502 를, 네트워크가 끊기면 000 을 준다.
code=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 10 \
  -H 'Connection: Upgrade' -H 'Upgrade: websocket' -H 'Sec-WebSocket-Version: 13' \
  -H 'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==' "$PUBLIC/api/v1/ws" 2>/dev/null || echo 000)
if [ "$code" = 401 ]; then
  record socket yes "소켓"
elif [ "$backend_ok" = no ] && [ "$code" = 502 ]; then
  # 백엔드가 죽어서 생긴 502 다. 원인이 하나인데 알림이 둘 가면 읽는 사람이 둘 다 흘려 보게 된다.
  # 상태는 그대로 넘겨 복구 때 중복 알림도 생기지 않게 한다.
  prev=$(prev_fails socket); printf 'socket %s\n' "${prev:-0}" >> "$NEW_STATE"
  echo "  socket   SKIP (백엔드가 죽어서 생긴 502)"
else
  record socket no "소켓(HTTP $code)"
fi

# AI 는 담당자 노트북 + 터널이라 주소가 아직 없을 수 있다.
# 그때는 알리지 않는다 — 연결 전이라는 것을 5분마다 쏘면 그게 소음이다.
if [ -z "$AI" ]; then
  echo "  ai       건너뜀 (AI_BASE_URL 이 비어 있다)"
elif curl -sS -f -o /dev/null --max-time 10 "$AI/healthz" 2>/dev/null; then
  record ai yes "AI 서버"
else
  record ai no "AI 서버"
fi

mv "$NEW_STATE" "$STATE"
trap - EXIT
