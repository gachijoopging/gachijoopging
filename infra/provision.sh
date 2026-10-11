#!/bin/sh
# 빈 Ubuntu 24.04 를 가치줍깅 서버로 만든다. 서버에서 돌린다.
#
# ADR-0005 가 "첫 사용자를 받기 전에 깨끗한 서버를 새로 만들어 교체한다" 를 조건으로 달았다.
# 그 조건은 구축이 재현 가능할 때만 성립하므로, 손으로 한 것을 전부 여기 적는다.
#
# 여러 번 돌려도 안전하다 — 이미 돼 있으면 건너뛴다.
#
#   ssh -i <키>.pem ubuntu@<고정 IP>
#   curl -fsSL https://raw.githubusercontent.com/djm030/gachijoopging/dev/infra/provision.sh | sh
#   (또는 저장소를 받아서) sh infra/provision.sh
#
# 고정 IP 와 방화벽(22·80·443)은 Lightsail 콘솔 작업이라 여기서 하지 못한다.
# 절차는 docs/operations.md §구성.
set -eu

SWAP_SIZE=2G
SWAP_FILE=/swapfile
APP_DIR=/opt/gachijoopging
MEDIA_DIR=/data/uploads
# backend/Dockerfile 이 만드는 비루트 사용자. 호스트 쪽 소유자를 맞추지 않으면 업로드가 전부 막힌다.
APP_UID=10001

log() { printf '\n=== %s\n' "$1"; }

# ── 스왑 ───────────────────────────────────────────────────────────
# 2GB 번들에 JVM 을 올리면 빌드·배포 중에 순간적으로 치솟는다. 스왑이 없으면
# 리눅스가 가장 큰 프로세스 — 즉 백엔드 — 를 죽인다(OOM Killer).
log "스왑"
if [ -f "$SWAP_FILE" ]; then
  echo "이미 있다: $SWAP_FILE"
else
  sudo fallocate -l "$SWAP_SIZE" "$SWAP_FILE"
  sudo chmod 600 "$SWAP_FILE"
  sudo mkswap "$SWAP_FILE" >/dev/null
  sudo swapon "$SWAP_FILE"
  echo "만들었다: $SWAP_FILE ($SWAP_SIZE)"
fi
if grep -q "^$SWAP_FILE " /etc/fstab; then
  echo "fstab 등록돼 있다"
else
  echo "$SWAP_FILE none swap sw 0 0" | sudo tee -a /etc/fstab >/dev/null
  echo "fstab 에 등록했다 — 재부팅 후에도 유지된다"
fi

# ── 도커 ───────────────────────────────────────────────────────────
# apt 기본 docker.io 를 쓰지 않는다. 버전이 낮고 docker compose 가 들어 있지 않다.
log "도커"
if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
  echo "이미 있다: $(docker --version) · $(docker compose version)"
else
  export DEBIAN_FRONTEND=noninteractive NEEDRESTART_MODE=a
  sudo apt-get update -qq
  sudo install -m 0755 -d /etc/apt/keyrings
  sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  sudo chmod a+r /etc/apt/keyrings/docker.asc
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
    | sudo tee /etc/apt/sources.list.d/docker.list >/dev/null
  sudo apt-get update -qq
  sudo apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin >/dev/null
  echo "설치했다: $(docker --version)"
fi

log "docker 그룹"
if id -nG "$(id -un)" | tr ' ' '\n' | grep -qx docker; then
  echo "이미 들어 있다"
else
  sudo usermod -aG docker "$(id -un)"
  echo "넣었다 — 다시 로그인해야 sudo 없이 docker 를 쓴다"
fi

# ── 디렉터리 ───────────────────────────────────────────────────────
log "디렉터리"
sudo mkdir -p "$APP_DIR" "$MEDIA_DIR/deleted"
sudo chown -R "$(id -un):$(id -gn)" "$APP_DIR"
# 사진 디렉터리만 컨테이너 UID 소유다. 호스트 사용자로 두면 업로드가 permission denied 로 실패한다.
sudo chown -R "$APP_UID:$APP_UID" "$MEDIA_DIR"
echo "$APP_DIR · $MEDIA_DIR (소유자 $APP_UID)"

# ── 확인 ───────────────────────────────────────────────────────────
log "결과"
free -h | sed -n '1p;3p'
df -h / | sed -n '1p;2p'
docker --version
docker compose version
echo ""
echo "다음: $APP_DIR 에 infra/docker-compose.yml 과 .env 를 올린다 (GAC-107)."
