#!/bin/sh
# 운영 배포·롤백. 서버의 /opt/gachijoopging 에서 돈다 — deploy.yml 이 올리고 부른다.
#
# 빌드하지 않는다. CI 가 만들어 레지스트리에 올린 이미지를 태그로 바꿔 낄 뿐이다(ADR-0005·GAC-107).
#
#   ./deploy.sh <태그>   그 태그로 배포
#   ./deploy.sh          직전 태그로 되돌린다
set -eu
cd "$(dirname "$0")"

ENV_FILE=.env
PREV_FILE=.image-tag.prev

read_env() { sed -n "s/^$1=//p" "$ENV_FILE"; }

TAG=${1:-}
if [ -z "$TAG" ]; then
  [ -s "$PREV_FILE" ] || { echo "되돌릴 태그가 없다" >&2; exit 2; }
  TAG=$(cat "$PREV_FILE")
  echo "롤백 → $TAG"
fi

BEFORE=$(read_env IMAGE_TAG)
IMAGE="$(read_env DOCKERHUB_USER)/gachijoopging-backend:$TAG"

if [ "$TAG" = "$BEFORE" ]; then
  echo "이미 $TAG 다. 할 것 없다"
  exit 0
fi

# pull 만 한다. 여기서 build 하면 CI 가 검증한 것과 다른 물건이 올라간다.
docker pull "$IMAGE"

printf '%s' "$BEFORE" > "$PREV_FILE"
sed -i "s|^IMAGE_TAG=.*|IMAGE_TAG=$TAG|" "$ENV_FILE"
docker compose up -d backend

# compose 의 healthcheck 가 readiness 를 본다. 떠도 DB·Flyway 에서 죽을 수 있으므로
# 성공을 선언하기 전에 기다린다 — 안 기다리면 깨진 배포가 초록으로 끝난다.
echo "기동 기다리는 중 (최대 3분)"
i=0
while [ "$i" -lt 36 ]; do
  state=$(docker inspect -f '{{.State.Health.Status}}' "$(docker compose ps -q backend)" 2>/dev/null || echo none)
  [ "$state" = healthy ] && { echo "$TAG 배포 완료"; exit 0; }
  i=$((i + 1))
  sleep 5
done

echo "기동 실패 — 마지막 상태: ${state:-?}" >&2
docker compose logs --tail 50 backend >&2
if [ -n "$BEFORE" ]; then
  echo "되돌린다 → $BEFORE" >&2
  sed -i "s|^IMAGE_TAG=.*|IMAGE_TAG=$BEFORE|" "$ENV_FILE"
  docker compose up -d backend
fi
exit 1
