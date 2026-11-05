#!/bin/sh
# 운영 .env 의 FCM_CREDENTIALS 로 FCM HTTP v1 에 직접 1건 보낸다. 백엔드를 거치지 않는다 —
# 실패했을 때 자격 문제인지 백엔드 문제인지 가르려는 것이다.
#
#   ssh <서버> sh -s < infra/fcm-check.sh              토픽 fcm-check 로 (구독자 없음 — 자격만 본다)
#   ssh <서버> sh -s -- <기기토큰> < infra/fcm-check.sh  그 기기로
#
# 200 과 함께 "name": "projects/.../messages/..." 가 나오면 자격이 살아 있다.
set -eu

ENV_FILE=${ENV_FILE:-/opt/gachijoopging/.env}
CRED=$(sed -n 's/^FCM_CREDENTIALS=//p' "$ENV_FILE" | sed 's/\$\$/$/g')
if [ -z "$CRED" ]; then
  echo "FCM_CREDENTIALS 가 비어 있다 — $ENV_FILE" >&2
  exit 1
fi
export CRED TARGET="${1:-}"

field() { python3 -c 'import json,os,sys;print(json.loads(os.environ["CRED"])[sys.argv[1]],end="")' "$1"; }
b64url() { openssl base64 -A | tr '+/' '-_' | tr -d '='; }

# mktemp 는 0600 으로 만든다. 개인키가 남에게 읽히는 틈을 두지 않는다
TMP=$(mktemp)
trap 'rm -f "$TMP"' EXIT
field private_key > "$TMP"

NOW=$(date +%s)
HEAD=$(printf '{"alg":"RS256","typ":"JWT"}' | b64url)
CLAIM=$(printf '{"iss":"%s","scope":"https://www.googleapis.com/auth/firebase.messaging","aud":"https://oauth2.googleapis.com/token","iat":%s,"exp":%s}' \
  "$(field client_email)" "$NOW" $((NOW + 600)) | b64url)
SIG=$(printf '%s.%s' "$HEAD" "$CLAIM" | openssl dgst -sha256 -sign "$TMP" | b64url)

# 자격·토큰은 명령줄 인자로 넘기지 않는다 — ps 에 보인다. printf 는 셸 내장이라 안 보인다
ACCESS=$(printf 'grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=%s.%s.%s' "$HEAD" "$CLAIM" "$SIG" \
  | curl -sS https://oauth2.googleapis.com/token -d @- \
  | python3 -c 'import json,sys;r=json.load(sys.stdin);print(r.get("access_token") or sys.exit("토큰 교환 실패: %s" % r))')

python3 -c '
import json,os
t=os.environ["TARGET"]
m={"notification":{"title":"가치줍깅","body":"FCM 자격 확인"}}
m["token" if t else "topic"]=t or "fcm-check"
print(json.dumps({"message":m}))' > "$TMP"

OUT=$(printf 'Authorization: Bearer %s\n' "$ACCESS" \
  | curl -sS -w '\nHTTP %{http_code}' -H @- -H 'Content-Type: application/json' \
      -d @"$TMP" "https://fcm.googleapis.com/v1/projects/$(field project_id)/messages:send")
echo "$OUT"
case "$OUT" in *"HTTP 200") ;; *) exit 1 ;; esac
