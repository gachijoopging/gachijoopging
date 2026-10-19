#!/bin/sh
# 빈 Ubuntu 24.04 를 가치줍깅 서버로 만든다. 서버에서 돌린다.
#
# ADR-0005 가 "첫 사용자를 받기 전에 깨끗한 서버를 새로 만들어 교체한다" 를 조건으로 달았다.
# 그 조건은 구축이 재현 가능할 때만 성립하므로, 손으로 한 것을 전부 여기 적는다.
#
# 여러 번 돌려도 안전하다 — 이미 돼 있으면 건너뛴다.
#
#   ssh -i <키>.pem ubuntu@<고정 IP>
#   curl -fsSL -o provision.sh https://raw.githubusercontent.com/gachijoopging/gachijoopging/dev/infra/provision.sh \
#     && sh provision.sh
#   (또는 저장소를 받아서) sh infra/provision.sh
#
# 고정 IP 와 방화벽(22·80·443)은 Lightsail 콘솔 작업이라 여기서 하지 못한다.
# 절차는 docs/operations.md §구성.
set -eu

SWAP_SIZE=2G
SWAP_FILE=/swapfile
APP_DIR=/opt/gachijoopging
MEDIA_DIR=/data/uploads
WATCH_LOG=/var/log/gachijoopging-watch.log
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

# ── 로그 보존 ──────────────────────────────────────────────────────
# 컨테이너 로그는 journald 로 보낸다(docker-compose.yml 의 logging). 개인정보처리방침 §2 가
# 접속 로그를 "3개월 보관한 뒤 지운다" 고 약속했는데, 도커 기본(json-file)은 크기로만 잘라
# 기간을 지키지 못하고 컨테이너를 다시 만들면 로그가 통째로 사라진다.
# 파일을 하루 단위로 끊어야 90일이 하루 오차로 지켜진다 — 기본(한 달)이면 넉 달까지 남는다.
# 용량 상한은 디스크를 지키는 안전판이다. 지금 양으로는 90일보다 먼저 닿지 않는다.
log "로그 보존"
JOURNAL_CONF=/etc/systemd/journald.conf.d/gachijoopging.conf
JOURNAL_WANT=$(printf '%s\n' '[Journal]' 'Storage=persistent' 'MaxRetentionSec=90day' 'MaxFileSec=1day' 'SystemMaxUse=4G')
if [ "$(cat "$JOURNAL_CONF" 2>/dev/null)" = "$JOURNAL_WANT" ]; then
  echo "이미 있다: $JOURNAL_CONF"
else
  sudo mkdir -p "$(dirname "$JOURNAL_CONF")"
  printf '%s\n' "$JOURNAL_WANT" | sudo tee "$JOURNAL_CONF" >/dev/null
  sudo systemctl restart systemd-journald
  echo "넣었다: $JOURNAL_CONF (90일 · 하루 단위 · 상한 4G)"
fi

# ── 디렉터리 ───────────────────────────────────────────────────────
log "디렉터리"
# nginx/ 가 없으면 deploy.yml 의 scp 가 "dest open: Failure" 로 죽는다 — 첫 배포가 깨진다.
sudo mkdir -p "$APP_DIR/nginx" "$MEDIA_DIR/deleted"
sudo chown -R "$(id -un):$(id -gn)" "$APP_DIR"
# 사진 디렉터리만 컨테이너 UID 소유다. 호스트 사용자로 두면 업로드가 permission denied 로 실패한다.
sudo chown -R "$APP_UID:$APP_UID" "$MEDIA_DIR"
echo "$APP_DIR · $MEDIA_DIR (소유자 $APP_UID)"

# ── 배포 키 ────────────────────────────────────────────────────────
# CI(deploy.yml)가 이 키로 붙는다. 없으면 배포가 안 되는데, 그 사실이
# 첫 머지 때까지 드러나지 않는다. 공개키라 인자로 받아도 안전하다.
#
#   DEPLOY_PUBKEY="ssh-ed25519 AAAA... github-actions-deploy" sh infra/provision.sh
log "배포 키"
if [ -z "${DEPLOY_PUBKEY:-}" ]; then
  echo "DEPLOY_PUBKEY 가 없다 — 건너뛴다. CI 배포를 쓰려면 나중에 넣는다"
else
  # 칸 수만 보면 개인키를 잘못 붙여 넣어도 통과해 authorized_keys 에 기록된다. ssh-keygen 이 읽어야 공개키다.
  # 지문으로 비교하면 주석이 다르거나 앞에 옵션(no-pty ...)이 붙은 기존 줄도 같은 키로 알아본다.
  fp=$(printf '%s\n' "$DEPLOY_PUBKEY" | ssh-keygen -lf - 2>/dev/null | awk '{print $2}')
  if [ -z "$fp" ]; then
    echo "DEPLOY_PUBKEY 가 공개키가 아니다 — 'ssh-ed25519 AAAA... [주석]' 를 넣는다" >&2
    exit 1
  fi
  if ssh-keygen -lf "$HOME/.ssh/authorized_keys" 2>/dev/null | awk '{print $2}' | grep -qxF "$fp"; then
    echo "이미 있다"
  else
    mkdir -p "$HOME/.ssh" && chmod 700 "$HOME/.ssh"
    printf '%s\n' "$DEPLOY_PUBKEY" >> "$HOME/.ssh/authorized_keys"
    chmod 600 "$HOME/.ssh/authorized_keys"
    echo "넣었다"
  fi
fi

# ── 감시 ───────────────────────────────────────────────────────────
# watch.sh 는 deploy.yml 이 올린다. 여기서는 그것을 부를 cron 과 로그 자리만 만든다.
# 이것이 빠지면 새 서버에서 감시가 조용히 사라지는데, 감시가 없어진 것은
# 아무도 알려 주지 않으므로 가장 늦게 발견된다.
log "감시 cron"
# 로그는 ubuntu 가 써야 한다. /var/log 는 root 소유라 미리 만들어 주지 않으면 cron 이 조용히 실패한다.
# 이미 있으면 건드리지 않는다 — install 은 있는 파일을 비워서, 장애를 조사하던 중에 다시 돌리면
# 증거가 사라진다.
if [ -f "$WATCH_LOG" ]; then
  echo "로그 이미 있다: $WATCH_LOG"
else
  sudo install -o "$(id -un)" -g "$(id -gn)" -m 644 /dev/null "$WATCH_LOG"
  echo "로그 만들었다: $WATCH_LOG"
fi
( crontab -l 2>/dev/null | grep -v 'watch\.sh' || true
  printf '%s\n' \
    "*/5 * * * * cd $APP_DIR && ./watch.sh >> $WATCH_LOG 2>&1" \
    "10 0 * * * cd $APP_DIR && ./watch.sh --limits >> $WATCH_LOG 2>&1"
) | crontab -
crontab -l | grep 'watch\.sh'

# ── 확인 ───────────────────────────────────────────────────────────
log "결과"
free -h | sed -n '1p;3p'
df -h / | sed -n '1p;2p'
docker --version
docker compose version
echo ""
echo "다음: $APP_DIR 에 infra/docker-compose.yml 과 .env 를 올린다 (GAC-107)."
