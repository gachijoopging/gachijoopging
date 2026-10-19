# 운영

Lightsail VM 한 대 + Supabase Postgres + 담당자 맥의 AI 서버.

## 구성

VM 한 대에 docker compose 로 컨테이너 셋을 띄운다 — 백엔드(Spring)·Redis·Nginx. 근거는 ADR-0005.
옛 EC2 구성(blue/green·Postgres 컨테이너·LiveKit·모니터링)은 가져오지 않았다.

| | |
|---|---|
| 호스트 | AWS Lightsail 서울 · 2GB 번들(2 vCPU · 60GB SSD · 전송량 3TB) · Ubuntu 24.04 LTS |
| 대수 | **운영 한 대뿐이다. 스테이징을 두지 않는다**(ADR-0005). 첫 사용자를 받기 전에 `infra/` 스크립트로 한 번 새로 만들어 교체한다 |
| 고정 IP | 번들에 포함. 붙여 두지 않으면 재시작마다 주소가 바뀐다 |
| 스왑 | 2GB(`/swapfile`). 없으면 램이 찰 때 OOM Killer 가 가장 큰 프로세스 — 즉 백엔드 — 를 죽인다 |
| 공개 주소 | `www.gachijoopging.site`(apex 는 301 이라 쓰지 않는다) |
| 입구 | Nginx 가 443 을 잡고 `/api/v1/...` 를 백엔드로, 사진을 디스크에서 직접 보낸다. 채팅·위치가 STOMP 소켓(`realtime.md`)이라 WebSocket 업그레이드를 통과시킨다 |
| DB | Supabase Postgres(PostGIS) · 서울 (ADR-0001). **PostgreSQL 17.11 · PostGIS 3.3** |
| AI | 담당자 M4 Mac mini(MPS) + ngrok 터널. 서버에 올리지 않는다 (`ai/README.md` §8) |

### 서버를 새로 만들 때

콘솔에서 하는 것과 스크립트가 하는 것이 나뉜다. 콘솔 작업은 자동화할 수 없어 여기 적는다.

**Lightsail 콘솔**

| | |
|---|---|
| 리전 | Seoul (ap-northeast-2). Supabase 와 같은 리전이라 DB 왕복이 짧다 |
| 블루프린트 | **OS Only → Ubuntu 24.04 LTS**. Apps+OS 를 고르면 Bitnami 가 80·443 을 미리 잡아 우리 Nginx 와 겹친다 |
| 번들 | $12 (2 vCPU · 2GB · 60GB SSD · 전송량 3TB). 1GB 짜리는 Spring Boot 하나로 찬다 |
| 고정 IP | `Networking` → `Attach static IP`. **안 붙이면 재시작마다 주소가 바뀌어 DNS 가 깨진다** |
| 방화벽 | `IPv4 Firewall` 에 **443 을 직접 추가**한다. 22·80 은 기본으로 열려 있다 |

**그다음 서버에서**

```sh
# 받기와 실행을 나눈다. curl | sh 로 이으면 받기가 실패해도 sh 가 빈 입력을 받고 성공으로 끝난다.
curl -fsSL -o provision.sh https://raw.githubusercontent.com/gachijoopging/gachijoopging/dev/infra/provision.sh \
  && DEPLOY_PUBKEY="ssh-ed25519 AAAA... github-actions-deploy" sh provision.sh
```

스왑·도커·디렉터리·배포 키를 만든다. 여러 번 돌려도 안전하다 — 이미 돼 있으면 건너뛴다.

`DEPLOY_PUBKEY` 는 CI(`deploy.yml`)가 붙는 **공개키**다(비밀이 아니다. 짝이 되는 개인키가
`SSH_PRIVATE_KEY` 시크릿이다). 안 넣으면 배포가 안 되는데 **그 사실이 첫 머지 때까지 드러나지 않는다.**

### 서버를 교체할 때

ADR-0005 가 "첫 사용자 전에 한 번 새로 만들어 교체한다" 고 정했다. 교체 뒤에 또 바꾸면 그 사이 쌓인
**사진**(디스크의 유일한 상태)을 옮겨야 하므로 한 번에 끝낸다.

도메인이 옛 서버를 보는 동안 새 서버를 끝까지 세워 두고, **옮기는 것을 마지막에 몰아서** 끊기는 시간을
줄인다. 아래 순서가 그렇게 짜여 있다.

| | | 어디서 |
|---|---|---|
| 1 | 새 인스턴스 생성 + `provision.sh` (위) | 콘솔 → 서버 |
| 2 | `infra/dev-env.ps1 -Target ubuntu@<임시 IP>` 로 `.env` 올리기. 새 서버엔 `.env` 가 없으므로 `IMAGE_TAG` 는 비어서 올라간다 — 정상이다 | 로컬 |
| 3 | **`deploy.yml` 의 "설정 올리기" 가 보내는 것을 전부** 올린다 — 목록은 그쪽이 정본이다. 여기 옮겨 적지 않는다 | 로컬 |
| 4 | `IMAGE_TAG` 를 옛 서버 값으로 적고 **`redis`·`backend` 만** 띄워 healthy 를 본다. 풀을 줄여서 띄운다(아래) | 서버 |
| 5 | 새 서버의 호스트 키를 읽어 `.github/workflows/deploy.yml` 의 `known_hosts` 를 바꾼다(아래) | 서버 → 로컬 |
| 6 | 고정 IP 를 **새 인스턴스로 옮긴다**(콘솔 `Networking` → `분리` → `연결`). 새로 만들지 않는다 | 콘솔 |
| 7 | 바깥에서 keyscan 해 5번 값과 대조하고, 로컬 `known_hosts` 를 지운다(아래) | 로컬 |
| 8 | 인증서 최초 발급(§HTTPS) | 서버 |
| 9 | `docker compose up -d` — 이제 `nginx`·`certbot` 까지 올라온다 | 서버 |
| 10 | 사진이 있으면 옛 서버에서 받아 온다(아래). 6번 뒤라 새 업로드는 이미 새 서버로 온다 | 서버 |
| 11 | 옛 인스턴스를 **중지**하고, 아래 ⚠️ 대로 남은 세션을 끊은 뒤 백엔드를 다시 만든다. 4번의 풀 제한도 여기서 지운다 | 콘솔 → 서버 |
| 12 | 확인 뒤 옛 인스턴스는 **스냅샷 하나 남기고 삭제**한다. 중지만 하면 과금이 계속된다 | 콘솔 |

**3번에서 빠뜨린 것은 조용히 망가진다.** `legal/` 이 비면 docker 가 빈 디렉터리를 만들어 물리므로
다음 배포까지 약관 3종이 404 이고 — 가입 동의를 받을 수 없다 — `watch.sh` 가 없으면 cron 이 5분마다
실패하는데 그 실패는 로그에만 남는다. 둘 다 아무도 알려 주지 않는다.

**10번 사진은 옛 서버를 끄기 전에 옮긴다.** 고정 IP 를 뗀 옛 서버에는 콘솔에 새로 뜨는 임시 IP 로 붙는다.
받는 쪽 `/data/uploads` 는 백엔드(UID 10001) 소유라 ubuntu 로는 쓸 수 없고, `rsync -a` 의 소유자 유지는
받는 쪽이 root 일 때만 된다. 그래서 양쪽 모두 `sudo` 로 돈다.

```sh
# 새 서버에서. 옛 서버 키는 로컬의 Lightsail 키를 잠깐 올려 쓰고 끝나면 지운다
# 키는 절대 경로로 쓴다. sudo 아래의 ssh 는 ~ 를 root 의 홈(/root)으로 펼친다.
# root 의 known_hosts 에는 옛 서버가 없어서 처음에 호스트 키를 묻는다 — 콘솔의 옛 서버 IP 가 맞으면 yes.
sudo rsync -a -e "ssh -i /home/ubuntu/old-key.pem" --rsync-path="sudo rsync" \
  ubuntu@<옛 서버 임시 IP>:/data/uploads/ /data/uploads/
sudo find /data/uploads ! -uid 10001 | head    # 아무것도 안 나와야 한다
```

**4번이 순서의 핵심이다.** 도메인을 옮기기 전에 백엔드가 뜨는 것을 봐 두면, 새 IP 에서 DB·Redis 에
닿는지를 사이트가 내려간 상태에서 디버깅하지 않아도 된다. 8080 은 외부에 열려 있지 않으므로
(§열린 포트) 컨테이너 망 안에서 확인한다.

```sh
# 옛 백엔드가 아직 커넥션을 쥐고 있다. 기본 풀(10)로 띄우면 상한 15 를 넘는다 — 아래 ⚠️ 와 같은 사고다.
# 셸에 붙여 주면 안 된다. 그것은 compose 가 ${...} 를 채울 때만 쓰이고 컨테이너까지 가지 않는다
# (backend 의 environment: 에는 로그 패턴 하나뿐이다). .env 에 적어야 닿는다.
#
# 앞에 \n 을 붙이는 것은 .env 가 줄바꿈 없이 끝나는 경우를 막기 위해서다. 그러면 이 줄이 마지막 키
# 뒤에 그대로 붙어 그 키의 값이 깨지고, 풀 제한도 안 걸린다.
printf '\nSPRING_DATASOURCE_HIKARI_MAXIMUM_POOL_SIZE=3\n' >> .env
docker compose up -d redis backend

docker run --rm --network gachijoopging_default curlimages/curl \
  -sS -o /dev/null -w '%{http_code}\n' http://backend:8080/actuator/health
```

이 줄은 교체 중에만 쓴다. **11번에서 지운다** — 남겨 두면 운영이 커넥션 3개로 돈다.
세션을 끊기 전에 지워 두면 백엔드를 한 번만 다시 만들면 된다.

```sh
sed -i '/^SPRING_DATASOURCE_HIKARI_MAXIMUM_POOL_SIZE=/d' .env
#   ... 여기서 아래 ⚠️ 의 pg_terminate_backend ...
docker compose up -d --force-recreate backend
```

사이에 `dev-env.ps1` 로 `.env` 를 다시 올리면 이 줄은 사라진다. 교체 중에만 쓰는 값이라 그래도 된다.

> ⚠️ **4번의 healthy 를 그대로 믿지 않는다.** Hikari 는 기동에 커넥션 하나만 열어 보고 통과시킨 뒤
> 나머지를 뒤에서 채운다. 그래서 풀을 안 줄이고 띄우면 **healthy 가 먼저 뜨고 몇 분 뒤에 죽는다.**
> 교체 때 실제로 그랬다 — 4번이 15초 만에 healthy 였고, 8분 뒤 운영이 503 이 됐다.

**5번을 빠뜨리면 다음 `main` 머지가 깨진다.** `deploy.yml` 은 호스트 키를 박아 두는데(keyscan 은 아무
키나 믿는다는 뜻이라 안 쓴다), 인스턴스를 바꾸면 그 키가 바뀐다. 고정 IP 를 옮겨도 키는 새 기계 것이다.

5번에서는 **새 서버에 직접 물어본다.** 이때 고정 IP 는 아직 옛 서버를 가리키므로 그쪽으로 keyscan 하면
당연히 다른 값이 나온다 — 대조는 7번에서 한다.

```sh
# 5번 — 임시 IP 로 붙어서 읽는다. 이 값을 deploy.yml 에 적는다
ssh ubuntu@<새 서버 임시 IP> 'cat /etc/ssh/ssh_host_ed25519_key.pub'

# 7번 — 고정 IP 를 옮긴 뒤. 5번 값과 같아야 중간자가 아니다
ssh-keyscan -t ed25519 13.125.10.7
ssh-keygen -R 13.125.10.7      # 로컬 known_hosts 의 옛 항목을 지운다
```

7번에서 `REMOTE HOST IDENTIFICATION HAS CHANGED` 경고가 뜨는 것은 **정상이다.** 같은 IP 가 다른 기계를
가리키게 됐으니 경고가 맞다. 위 두 값이 같은 것을 확인하고 지운다.

> ⚠️ **`deploy.yml` 변경은 `main` 에 들어가야 효과가 난다.** 배포 워크플로는 `main` 의 파일로 돈다.
> 교체 PR 을 `dev` 에만 머지해 두고 `main` 반영을 미루면, 그 사이 배포가 옛 키로 시도돼 실패한다.

> ⚠️ **8번(인증서)을 6번(고정 IP 이동)보다 먼저 하지 않는다.** 고정 IP 가 아직 옛 서버를 가리키는 동안 발급을 시도하면
> acme 챌린지가 옛 서버로 가서 실패한다. 걸리는 제한은 둘이고 성격이 다르다 —
> **실패한 검증**은 호스트명당 **시간당 5회**(여기 먼저 걸린다), **같은 이름 조합의 재발급**은
> **주당 5회**다. 교체로 다시 받는 것은 뒤쪽에 들어가므로, 시행착오로 앞쪽을 태우면 한 시간을 기다린다.

> ⚠️ **옛 서버를 끈다고 DB 커넥션이 돌아오지 않는다.** Supabase pooler 는 session mode(5432)라
> 클라이언트 하나가 커넥션 하나를 끝까지 쥐는데, 호스트가 갑자기 죽으면 pooler 는 TCP 타임아웃까지
> 그것을 모른다. 상한이 **15** 라 옛 백엔드의 커넥션만으로 다 차고, 새 백엔드는 Flyway 단계에서
> `(EMAXCONNSESSION) max clients reached in session mode` 로 죽는다. 교체 때 실제로 13분을 잡아먹었다.
>
> 직결(`db.<ref>.supabase.co`)은 **IPv6 전용**이라 닿지 않는다. transaction mode(**6543**)로 들어가
> 남은 세션을 끊는다 — 이쪽은 상한이 따로다.
>
> ```sh
> PW=$(sed -n 's/^DATABASE_PASSWORD=//p' .env | sed 's/\$\$/$/g')   # $$ 를 푸는 이유는 §배포
> U=$(sed -n 's/^DATABASE_USER=//p' .env)
> # 호스트를 박아 두면 리전을 옮겼을 때 엉뚱한 곳을 보고도 통과한다. §DB 와 같은 이유다.
> H=$(sed -n 's|^DATABASE_URL=jdbc:postgresql://||p' .env | sed 's|[:/].*||')
> docker run --rm -e PGPASSWORD="$PW" postgres:17-alpine \
>   psql -h "$H" -p 6543 -U "$U" -d postgres -c \
>   "select pg_terminate_backend(pid) from pg_stat_activity
>    where usename='postgres' and application_name='PostgreSQL JDBC Driver' and state='idle';"
> docker compose up -d --force-recreate backend    # 교체 중이면 풀 제한을 먼저 지우고 여기서 한 번만
> ```
>
> 평소 배포는 이 문제를 겪지 않는다. 컨테이너가 정상 종료하면서 커넥션을 닫기 때문이다.
> **호스트가 통째로 죽거나 멈출 때만** 나온다 — 즉 장애 복구 때 다시 만난다.

### HTTPS

Nginx 가 443 을 잡고 `/api/v1/...` 를 **경로 그대로** 백엔드로 넘긴다. 백엔드가 `WebConfig` 의
`addPathPrefix` 로 모든 컨트롤러에 `/api/v1` 을 스스로 붙이기 때문이다.

> ⚠️ **여기서 접두사를 떼면 안 된다.** `rewrite` 로 떼면 백엔드가 핸들러를 찾지 못하고, 그러면
> `anyRequest().authenticated()` 에 걸려 **API 전체가 401** 이 된다. 토큰 없는 요청과 응답이 같아
> 드러나지 않고, `/actuator/health` 는 별도 location 이라 헬스체크도 초록으로 남는다. 사흘 걸렸다.

| 주소 | |
|---|---|
| `http://...` | 301 → `https://www.gachijoopging.site` |
| `https://gachijoopging.site` | 301 → `www` (apex 는 쓰지 않는다) |
| `https://www.gachijoopging.site/api/v1/...` | 백엔드 |
| `.../api/v1/ws` | STOMP 소켓. 유휴 타임아웃 1시간 — 기본 60초면 조용한 구간에서 끊긴다 |
| `.../actuator/health` | 헬스체크만 연다. `/actuator` 전체를 열면 prometheus 지표가 같이 공개된다 |

**upstream 을 변수로 쓴다.** `proxy_pass http://backend:8080` 처럼 고정 이름으로 적으면 Nginx 가
**시작할 때** 이름을 해석하고, 백엔드가 아직 없으면 아예 뜨지 않는다. `resolver` + `set $upstream` 이면
요청할 때 해석하므로 백엔드가 재시작돼 IP 가 바뀌어도 reload 가 필요 없다.

**최초 발급은 손으로 한 번.** 80 이 비어 있을 때 standalone 으로 받는다.

```sh
sudo docker run --rm -p 80:80 \
  -v gachijoopging_certbot-conf:/etc/letsencrypt -v gachijoopging_certbot-www:/var/www/certbot \
  certbot/certbot certonly --standalone \
  -d www.gachijoopging.site -d gachijoopging.site \
  --register-unsafely-without-email --agree-tos --no-eff-email
```

그다음부터는 compose 의 `certbot` 컨테이너가 12시간마다 webroot 로 갱신하고, `nginx` 가 6시간마다
설정을 다시 읽는다. 인증서가 갱신돼도 Nginx 는 스스로 알지 못하기 때문이다.

**이메일을 등록하지 않는다.** Let's Encrypt 는 2025-06-04 로 만료 경고 메일 발송을 끝냈고 보관하던
주소도 지웠다([공지](https://letsencrypt.org/2025/06/26/expiration-notification-service-has-ended.html)).
주소를 넣어도 받는 것이 없으므로 넣지 않는다 — 플래그 이름이 `unsafely` 인 것은 알림이 있던 시절의 흔적이다.

> ⚠️ 그래서 **만료를 알려 주는 외부 장치가 없다.** 자동 갱신이 조용히 실패하면 만료일에 브라우저가
> 사이트를 막는다. 남은 날짜를 직접 재서 알리는 것은 §감시 쪽 일이다.

## 로컬 기동

```powershell
powershell -ExecutionPolicy Bypass -File infra\dev-keys.ps1   # 최초 1회
docker compose -f infra/docker-compose.dev.yml up -d
curl http://localhost:8080/actuator/health                     # {"status":"UP"}
```

`dev-keys.ps1` 은 JWT 키 한 쌍을 만들어 루트 `.env` 에 넣는다. 백엔드는 그 키가 없으면 기동에서 죽는다 —
`application.yml` 이 기본값을 일부러 두지 않았다. 기본값이 있으면 운영에 키를 깜빡해도 서버가 떠 버리고,
그러면 누구나 공개된 그 키로 남의 토큰을 위조한다.

운영과 다른 점이 둘이다.

| | 로컬(`docker-compose.dev.yml`) | 운영(`docker-compose.yml`) |
|---|---|---|
| DB | **PostGIS 컨테이너**(PG16 · PostGIS 3.4) | Supabase (서버 밖, **PG17** · PostGIS 3.3) |

⚠️ **로컬과 운영의 Postgres 메이저 버전이 다르다.** Supabase 가 17 을 주는데 로컬 이미지는 16 이다.
마이그레이션이 로컬에서만 통과하는 일이 생길 수 있다. 로컬을 `postgis/postgis:17-3.4` 로 올리는 것이
맞지만, 지금은 Docker Hub 에서 그 이미지를 받지 못해(네트워크) 검증을 못 했다. 받을 수 있게 되면 바꾼다.
| 이미지 | 그 자리에서 빌드 | 레지스트리에서 태그로 가져옴 |

로컬에 DB 컨테이너를 두는 이유는 스테이징이 없기 때문이다(ADR-0005). 로컬이 Supabase 를 보면 각자 PC 가
운영 DB 를 만지게 되고, Flyway 마이그레이션을 깨뜨려 보며 고치는 일이 불가능해진다.
`postgis/postgis` 이미지라야 한다 — `V1__init.sql` 첫 줄이 `CREATE EXTENSION postgis` 다.

**호스트 포트가 표준이 아니다** — Postgres `15432`, Redis `16379`. 다른 프로젝트의 컨테이너가 5432·6379 를
쓰고 있으면 기동이 막혀서 비켜 놓았다. 컨테이너끼리는 내부 포트로 통신하므로 영향이 없다.
백엔드만 IDE 에서 띄울 때는 `SPRING_DATASOURCE_URL`·`SPRING_DATA_REDIS_PORT` 로 알려준다.

## 배포

스테이징이 없다(ADR-0005). 서버는 운영 한 대뿐이다.

| 언제 | 무엇이 일어나나 |
|---|---|
| `dev` 머지 | CI 가 돌고, 이미지를 만들어 레지스트리에 올린다. **배포하지 않는다** |
| `main` 머지 | 그 태그를 운영에 배포한다. **다시 빌드하지 않는다** |

다시 빌드하면 그 사이 바뀐 의존성이 섞여, CI 가 검증한 것과 다른 물건이 운영에 올라간다. 롤백은 직전
`IMAGE_TAG` 로 되돌리는 한 명령이다.

그래서 **환경에 따라 달라지는 값은 이미지에 굽지 않는다.** 주소·자격증명은 전부 `infra/.env` 로 주입한다.
`application.yml` 에서 `${PUBLIC_BASE_URL:...}` 처럼 쓰인 것이 그 모양이고, 콜론 뒤는 값이 없을 때의
기본값일 뿐이다. 키 1:1 대조는 GAC-99.

| 무엇 | 어디 |
|---|---|
| `dev` 머지 → 이미지 | `.github/workflows/build.yml` → `yydd12/gachijoopging-backend:<커밋 SHA>` |
| `main` 머지 → 배포 | `.github/workflows/deploy.yml` → 서버에서 `infra/deploy.sh` |
| 서버의 파일 | `/opt/gachijoopging/` 에 `docker-compose.yml`·`nginx/nginx.conf`·`deploy.sh`·`.env`. 저장소를 두지 않는다 — deploy.yml 이 배포마다 올린다 |

**배포할 태그는 머지 커밋의 두 번째 부모다.** `dev → main` 은 merge commit 이라(`conventions.md`) `main`
머리 SHA 로 만든 이미지는 없다. 이미지가 있는 것은 머지 당시 `dev` 머리, 즉 `git rev-parse HEAD^2` 다.
그 태그가 레지스트리에 없으면 deploy 는 **멈춘다.** 대신 빌드해서 메우면 CI 가 검증하지 않은 물건이 올라간다.

`build.yml` 에 경로 필터를 걸지 않은 것도 같은 이유다 — 문서만 바뀐 커밋에 이미지가 없으면, 그 커밋이
머리인 채로 머지됐을 때 배포할 태그가 사라진다.

> ⚠️ **`infra/.env` 의 `$` 는 `$$` 로 적는다.** compose 는 `env_file` 값도 보간한다. 비밀번호가
> `pa$$w0rd` 인데 그대로 적으면 컨테이너는 `pa$w0rd` 를 받고, Flyway 가
> `password authentication failed` 로 죽는다. 같은 파일을 `docker run --env-file` 로 쓰면 보간하지
> 않으므로 **그쪽에서는 통과한다** — 그래서 "psql 은 붙는데 백엔드만 안 붙는" 모양으로 나타난다.

### 롤백

Actions → **deploy** → Run workflow → 태그를 **비우고** 실행. 직전 태그(`/opt/gachijoopging/.image-tag.prev`)로
되돌린다. 서버에서 직접 하려면:

```sh
cd /opt/gachijoopging && ./deploy.sh            # 직전 태그로
cd /opt/gachijoopging && ./deploy.sh <태그>      # 특정 태그로
```

`deploy.sh` 는 기동을 3분까지 기다린다. healthy 가 안 되면 **스스로 직전 태그로 되돌리고** 실패로 끝난다.
안 기다리면 깨진 배포가 초록으로 끝난다.

필요한 GitHub Secret 은 §시크릿 에 있다. 여기 옮겨 적지 않는다 — 한쪽이 반드시 낡는다.

## 약관 전문

| 주소 | |
|---|---|
| `/terms` · `/privacy` · `/marketing` | Nginx 가 디스크에서 직접 보낸다. 백엔드를 거치지 않는다 |

앱 1-3 가입 화면이 `GET /agreements` 가 주는 `url` 을 `Linking.openURL` 로 연다. 전문이 안 열리면
**동의를 받을 수 없다.** 그래서 백엔드·DB 와 무관하게 서는 경로에 뒀고, 페이지도 외부 폰트·스크립트를
쓰지 않는다.

**정본은 `docs/legal/*.md` 이고 서빙되는 HTML 은 파생물이다.** 전문을 고치면 변환기를 돌려 결과물을
같이 커밋한다. 손으로 HTML 만 고치면 전문과 갈라지는데, 갈라진 쪽이 사용자에게 보이는 쪽이다.

```sh
node infra/legal/build.mjs            # docs/legal/*.md → infra/legal/*.html
node infra/legal/build.mjs --check    # 어긋나면 1 로 끝난다 — legal.yml 이 매 PR 에서 돌린다
```

배포 때 변환하지 않는다. 변환이 깨지면 배포가 통째로 막히기 때문이다. `deploy.yml` 은 만들어진 HTML 을
`/opt/gachijoopging/legal/` 로 올리기만 하고, compose 가 그 디렉터리를 `nginx` 에 읽기 전용으로 물린다.

> 전문의 빈칸(문의 이메일·리전)은 채워져 있다. 국외 이전 범위는 `docs/legal/privacy.md` §4 가 정본이다.

## 미디어

사진은 오브젝트 스토리지가 아니라 **VM 로컬 디스크**에 두고 Nginx 가 직접 보낸다(결정 33·ADR-0005).
백엔드를 거치지 않으므로 사진 트래픽이 JVM 스레드를 쓰지 않는다.

| | |
|---|---|
| 저장 경로 | `/data/uploads/<yyyy>/<MM>/<mediaId>.jpg` · 섬네일은 `_thumb` 접미사 |
| 공개 경로 | `https://www.gachijoopging.site/media/<yyyy>/<MM>/<mediaId>.jpg?s=<서명>&e=<만료>` |
| 유지 | compose 가 호스트 `${MEDIA_ROOT}` 를 바인드한다. 컨테이너를 다시 만들어도 남는다 |
| 소유자 | 호스트 쪽이 **UID 10001** — `backend/Dockerfile` 의 비루트 사용자다. 안 맞으면 업로드가 전부 permission denied |
| 격리 | `/media/deleted/` 는 서명이 맞아도 403. 신고로 내린 사진이 URL 하나로 다시 살아나지 않게 |

### 서명

만료 6시간(`app.media.signed-url-ttl`). 만드는 쪽은 백엔드 `MediaSignedUrl`, 검증하는 쪽은 Nginx
`secure_link_md5` 다. **식이 한 글자만 달라도 모든 사진이 403 이 되고, 그 사실은 배포한 뒤에야 드러난다.**

```
raw = <만료><uri> <MEDIA_SECURE_LINK_SECRET>      ← uri 와 비밀 사이에 공백 한 칸
서명 = base64url(MD5(raw)) · 패딩 없음
```

Nginx 설정 파일은 그대로 쓰이지 않는다. 컨테이너가 `envsubst` 로 `${MEDIA_SECURE_LINK_SECRET}` 와
`${MEDIA_ROOT}` **둘만** 바꿔 `/etc/nginx/nginx.conf` 를 만든다. 이름을 넘기지 않은 `$host`·`$uri` 는
그대로 남는다. 이미지의 기본 템플릿 기능(`/etc/nginx/templates`)은 명령이 `nginx` 로 시작할 때만 도는데
우리 `command` 는 `sh` 로 감싸므로 건너뛴다 — 그래서 직접 부른다.

> ⚠️ **`.env` 값에 CR 이 들어가면 안 된다.** Windows 에서 `openssl ... | tr -d '\n'` 은 CR 을 남긴다.
> 비밀 끝에 CR 하나가 붙으면 Nginx 쪽 서명과 어긋나 **유효한 서명까지 403** 이 된다. `tr -d '\r\n'` 으로 만든다.

### 크기 상한

세 곳이 같은 사진을 두고 서로 다른 한도를 본다. 바깥부터 안쪽으로 느슨→빡빡해야 우리 오류 봉투가 나간다.

| | 값 | 왜 |
|---|---|---|
| Nginx `client_max_body_size` | 22m | 여기가 작으면 Nginx 가 먼저 끊어 422 봉투가 못 나간다 |
| Spring `max-request-size` | 22MB | multipart 경계 포함 |
| `MediaImageValidator` | 20MB | **계약상 한도.** 422 + 오류 봉투를 내는 유일한 곳 |

## Redis

**지금 쓰는 곳은 레이트리밋 하나다**(`global/ratelimit` · `AuthFacade`). 로그인 10회/이메일,
50회/IP, 재설정 메일 10회/IP·60초/이메일 — 전부 TTL 이 걸린 카운터다. `docs/realtime.md` 의 소켓은
아직 코드에 없고, STOMP 브로커 릴레이·채팅 pub/sub 도 들어오지 않았다.

| | |
|---|---|
| 비밀번호 | `REDIS_PASSWORD` 필수. compose 가 `--requirepass` 로 건다 |
| 메모리 | `maxmemory 128mb` · `allkeys-lru`. 실사용은 1MB 남짓이라 100배 여유다 |
| 영속 | **없다.** `--save ""` 로 스냅샷을 끄고 볼륨도 두지 않는다 |
| 포트 | 바깥에 열지 않는다. 백엔드만 compose 네트워크 안에서 붙는다 |

### 비밀번호가 틀리면 조용히 망가진다

`RateLimiter` 는 **fail-open** 이다 — Redis 가 죽거나 `NOAUTH` 를 돌려주면 예외를 삼키고 요청을
통과시킨다(WARN 로그만). 로그인은 계속 되지만 **횟수 제한만 사라진다.** 기동도 성공하고 헬스체크도
초록이라 눈에 띄지 않는다.

그래서 `redis-cli PING` 만으로는 확인이 안 된다. 그건 `redis-cli` 가 붙었다는 뜻일 뿐이다.
**레이트리밋이 실제로 걸리는지**를 본다 — 같은 이메일로 틀린 비밀번호를 11번 보내면 11번째가 429 다.

```sh
for i in $(seq 1 11); do
  curl -s -o /dev/null -w "%{http_code} " -X POST https://www.gachijoopging.site/api/v1/auth/login \
    -H 'Content-Type: application/json' -d '{"email":"probe@example.com","password":"wrong"}'
done
# 401 ×10 뒤 429 가 나와야 한다. 전부 401 이면 Redis 에 못 붙고 있는 것이다
```

### 스냅샷을 끈 이유

들어 있는 것이 TTL 걸린 카운터뿐이라 재시작 뒤까지 살아남을 가치가 없다. 반대로 비용은 있다 —
2GB 한 대에 JVM 이 같이 사는데 `BGSAVE` 는 fork 로 순간 RSS 를 키우고, 그때 죽는 것은 OOM Killer
기준 가장 큰 프로세스, 즉 백엔드다. 잃는 것은 "재시작 시점에 쌓여 있던 카운터가 0 으로 돌아가
공격자가 창을 한 번 리셋할 수 있다" 뿐이다.

나중에 pub/sub 이나 세션이 들어오면 그때 다시 본다.

### 로컬은 비밀번호를 걸지 않는다

`infra/docker-compose.dev.yml` 과 Testcontainers(`IntegrationTest`)는 그대로 둔다. 로컬에 지킬 것이
없고, 팀 전원이 `.env` 를 하나씩 더 채워야 하는 값이 늘기 때문이다. `application.yml` 의
`${REDIS_PASSWORD:}` 가 기본값을 비워 두는 이유가 이것이다.

## 시크릿

비밀값이 사는 곳은 **둘뿐**이다. 셋째 장소를 만들지 않는다.

| 어디 | 무엇 | 누가 읽나 |
|---|---|---|
| **GitHub Secrets** | CI·배포가 쓰는 것 | 워크플로 |
| **서버 `/opt/gachijoopging/.env`** (0600) | 백엔드·Nginx 가 쓰는 운영 값 | 컨테이너 |

저장소에는 이름만 둔다 — 키 목록은 아래 표와 `infra/.env.example`, 값은 어디에도 커밋하지 않는다.

### GitHub Secrets

워크플로가 `${{ secrets.NAME }}` 으로 부르는 이름과 1:1 이다. 여기 없는 이름을 워크플로가 부르면
**조용히 빈 값**이 들어간다 — CI 가 실패하지 않고 엉뚱하게 동작한다.

| 이름 | 쓰는 곳 | 무엇 |
|---|---|---|
| `DOCKERHUB_TOKEN` | `build.yml` · `deploy.yml` | Docker Hub **액세스 토큰**(Read & Write). 계정 비밀번호를 쓰지 않는다 — 비밀번호는 결제·삭제까지 열어 준다 |
| `SSH_PRIVATE_KEY` | `deploy.yml` | 배포 전용 키. Lightsail 기본 키와 **다른 것**을 쓴다. 그래야 CI 접근만 따로 끊을 수 있다 |
| `MM_WEBHOOK_URL` | `pr-review-sla.yml` | Mattermost 웹훅 |

아이디(`yydd12`)와 서버 IP 는 **시크릿이 아니다.** DNS 를 찍으면 나오는 값이고, 가리면 로그가 `***` 가 돼
어디로 배포됐는지 못 본다. 가릴 것만 가린다.

앱 서명 APK 를 CI 에서 만들게 되면(GAC-112) 아래가 더 들어간다. 키 파일은 **base64 로 넣고 워크플로가
파일로 푼다** — Secrets 에 바이너리를 그대로 넣지 못한다.

```
ANDROID_KEYSTORE_BASE64      release.jks 를 base64 로
ANDROID_KEYSTORE_PASSWORD
ANDROID_KEY_ALIAS
ANDROID_KEY_PASSWORD
```

이름은 §앱 서명 의 환경 변수와 맞춘다(`ANDROID_KEYSTORE_PATH` 는 워크들로가 푼 파일 경로를 넣는다).

### 서버 `.env` 를 올릴 때

**손으로 `scp` 하지 않는다.** `infra/dev-env.ps1` 을 쓴다.

```powershell
powershell -ExecutionPolicy Bypass -File infra\dev-env.ps1 -DryRun   # 검사만
powershell -ExecutionPolicy Bypass -File infra\dev-env.ps1           # 올린다
```

올리기 전에 네 가지를 막는다. 전부 **배포가 끝난 뒤에야 드러나는** 종류다.

| 막는 것 | 안 막으면 |
|---|---|
| CR | `docker compose` 는 통과시키고 Spring 만 `Missing key encoding` 으로 죽는다. 값 끝의 CR 한 글자면 서명·PEM 이 조용히 어긋난다 |
| BOM | 첫 키 이름이 `﻿KEY` 가 돼 아무도 못 읽는다 |
| 필수 키 공란 | `application.yml` 이 기본값 없이 읽는 것들(`DATABASE_*`·`JWT_*`·`MEDIA_SECURE_LINK_SECRET`·`REDIS_*`). 기동에서 죽는다 |
| 홀로 있는 `$` | compose 가 `env_file` 값도 보간한다. `pa$$w0rd` 가 `pa$w0rd` 가 돼 한 글자 사라진다 |

**`IMAGE_TAG` 는 덮어쓰지 않는다.** 서버가 관리하는 값이라(`deploy.sh` 가 갱신한다) 통째로 올리면
다음 배포가 깨진다. 스크립트가 서버 값을 읽어 끼워 넣는다.

값은 **파일로만** 옮긴다. 쉘 히스토리에 남지 않는다.

올린 뒤에는 컨테이너를 **다시 만들어야** 반영된다. `docker compose restart` 는 같은 컨테이너를 다시
띄울 뿐이라 `env_file` 을 읽지 않는다.

```sh
cd /opt/gachijoopging && docker compose up -d --force-recreate backend
```

### 회전

| 무엇 | 어떻게 |
|---|---|
| JWT 서명 키 | 새 키를 `JWT_ACTIVE_KID`·`JWT_PRIVATE_KEY_PEM`·`JWT_PUBLIC_KEY_PEM` 에, **옛 공개키를** `JWT_PREVIOUS_KID`·`JWT_PREVIOUS_PUBLIC_KEY_PEM` 에 남긴다. 그래야 이미 나간 토큰이 만료까지 산다 |
| `REDIS_PASSWORD` · `MEDIA_SECURE_LINK_SECRET` | 새 값으로 바꾸고 `up -d --force-recreate`. 미디어 비밀을 바꾸면 **이미 나간 사진 URL 이 전부 403** 이 된다(TTL 6시간) |
| `DOCKERHUB_TOKEN` · `SSH_PRIVATE_KEY` | Docker Hub·서버 `authorized_keys` 에서 옛 것을 지우고 새로 등록한다. 지우기 전에 새 것으로 한 번 돌려 본다 |
| `DATABASE_PASSWORD` | Supabase 콘솔에서 바꾸고 올린다. `$` 가 들어가면 `$$` 로 적는다 |

**터미널·대화·이슈에 값이 노출되면 그 값은 죽은 것으로 본다.** 지웠는지와 무관하게 회전한다.

## 보안

**두 겹인 것은 열린 포트와 DB 뿐이다** — 포트는 Lightsail 방화벽과 compose, DB 는 클라이언트 URL 과
Supabase Enforce SSL. 나머지는 한 겹이거나 그보다 약하고, 어디가 그런지 아래에 적는다.
이 절을 읽고 다른 확인을 건너뛰지 않게 하려는 것이다.

### 열린 포트

바깥에 보이는 것은 **22·80·443 뿐**이다.

| | |
|---|---|
| 백엔드 8080 | **호스트에 내지 않는다.** Nginx 가 compose 네트워크로 `backend:8080` 에 붙고, healthcheck 는 컨테이너 안에서 `localhost` 를 본다. 되살리면 Nginx 를 우회해 **`/actuator/prometheus` 가 인증 없이** 열리고, **`X-Real-IP` 를 위조**해 `login:ip:` 카운터를 피할 수 있다 |
| Redis 6379 | 같다. `--requirepass` 까지 걸려 있다(§Redis) |
| AI · DB | 이 서버에 없다. AI 는 담당자 맥, DB 는 Supabase |

서버 안에서:

```sh
sudo ss -tlnp | grep 8080          # 아무것도 안 나와야 한다
```

compose 가 8080 을 publish 하지 않으므로 **무언가 보이면 누가 `ports:` 를 되살린 것이다.**

밖에서는 전 포트를 센다. 주소는 §구성 의 공개 주소를 쓴다 — 서버를 새로 만들면 IP 가 바뀐다.

```sh
nmap -Pn -p- www.gachijoopging.site
```

`nmap` 이 없으면 아래로 대신하되 **범위를 좁힌다.** 위 표가 닫혀 있어야 한다고 적은 8080·6379 를
반드시 포함한다 — 빼면 누가 `ports:` 를 되살려도 이 확인이 그냥 통과한다.

```sh
H=www.gachijoopging.site
p() { timeout 3 bash -c "echo > /dev/tcp/$H/$1" 2>/dev/null && echo "$1"; }
export H; export -f p
{ seq 1 1024; echo 6379; echo 8080; } | xargs -P 100 -I{} bash -c 'p {}' | sort -n
# → 22 · 80 · 443 (약 40초)
```

> ⚠️ **전 범위(1-65535)를 이 루프로 돌리지 않는다.** 팀 전원 Windows 인데 Git Bash 의 `fork` 가 매우
> 느려, `-P 600` 으로 돌렸다가 `fork: retry: Resource temporarily unavailable` 로 죽고 그 사이
> 노트북이 멈췄다. 전 범위가 필요하면 `nmap` 을 쓴다.
>
> 병렬을 더 올리거나 타임아웃을 줄이지 않는다. `-P 200`·`timeout 1` 로 돌렸더니 **열려 있는 22 가
> 누락됐다** — 부하에 밀려 시간초과한 것을 "닫힘" 으로 읽는다.
>
> `export -f p H` 로 쓰지 않는다. `-f` 는 **이름 전부를 함수로 취급**해 `H` 는 export 되지 않고,
> 자식 bash 에서 `$H` 가 비어 `/dev/tcp//22` 가 된다 — 아무 포트도 안 나오는데 원인이 안 보인다.

> 닫힌 것만 나오면 **방법을 먼저 의심한다.** 사내망이 바깥 포트를 막고 있으면 전부 닫힌 것으로 보인다.
> 22·80·443 이 열린 것으로 나와야 측정이 유효하다.

### SSH

키만 받는다. 서버 기본값이 이미 그렇고, 바꾸지 않았다.

```
passwordauthentication no
kbdinteractiveauthentication no
permitemptypasswords no
permitrootlogin without-password     # 키로만. 비밀번호로는 못 들어온다
```

CI 는 **배포 전용 키**로 붙는다. Lightsail 기본 키와 다른 것이라 CI 접근만 따로 끊을 수 있다(§시크릿).

### CORS 를 열지 않는다

**설정이 없는 것이 맞는 상태다.** `SecurityConfig` 에 `.cors(...)` 가 없어 `Access-Control-Allow-*`
헤더가 아예 나가지 않고, 브라우저가 알아서 교차 출처 읽기를 막는다. 막는 곳은 이 한 겹뿐이다 —
`.cors(...)` 를 누가 넣는 순간 사라진다.

```sh
curl -sD - -o /dev/null https://www.gachijoopging.site/api/v1/crews \
  -H 'Origin: https://evil.example.com' | grep -i 'access-control' || echo "CORS 헤더 없음"
```

열 이유가 없다 — 앱(React Native)은 브라우저가 아니라 Origin 검사를 받지 않고, 관리자 웹·크루 웹은
범위 밖이며(`feature-scope.md`), AI 서버는 사진 URL 을 읽지 않는다(백엔드가 multipart 로 직접 보낸다).
**웹에서 쓸 일이 생기면 그때 Origin 을 하나씩 허용한다.** 미리 열어 두지 않는다.

### rate limit 운영값

**제한이 걸린 곳은 둘뿐이다** — 로그인(`POST /auth/login`)과 재설정 메일 요청(`POST /auth/password-reset`).
`AuthFacade` 가 `RateLimiter` 를 거는 자리가 그 둘이다.

아래 **인증 경로에는 제한이 없다.** `SecurityConfig` 가 `/api/v1/auth/**` 를 `permitAll` 하므로
인증도 없다 — 이 표를 보고 "auth 는 막혀 있다" 고 읽지 않는다.

```
POST /auth/signup                 가입. 무제한
POST /auth/kakao · /auth/google   소셜. 무제한 (토큰 검증은 외부 호출이다)
POST /auth/refresh                무제한
POST /auth/logout                 무제한
```

`POST /auth/password-reset/confirm` 은 `RateLimiter` 가 아니라 **코드 5회 오답이면 폐기**로 막는다
(`app.password-reset.max-attempts`). 종류가 다르다.

백엔드 설정이고 `.env` 로 주입하지 않는다 — 환경마다 다를 값이 아니다. 정본은 `application.yml`.

| 키 | 지금 값 | 거는 곳 | 왜 |
|---|---|---|---|
| `app.login-rate-limit.window` · `.per-email` · `.per-ip` | 10m · 10 · 50 | `/auth/login` | 이메일 기준은 한 계정 대입, IP 기준은 여러 계정 대입을 막는다 |
| `app.password-reset.resend-interval` | 60s | `/auth/password-reset` | 같은 이메일로 메일을 연타하지 못하게 |
| `app.password-reset.per-ip-limit` · `.per-ip-window` | 10 · 1h | `/auth/password-reset` | 한 IP 가 여러 이메일로 메일을 뿌리는 것을 막는다 |
| `app.password-reset.max-attempts` | 5 | `/auth/password-reset/confirm` | 코드 오답 5회면 폐기. RateLimiter 가 아니다 |

위치 전송(`/app/crew/live`)에도 제한을 두지 않는다. 5초마다 보내는 것이 정상 동작이고(`realtime.md`),
여기에 제한을 걸면 **정상 사용자가 먼저 막힌다.**

**IP 기준 제한은 위조할 수 있다.** `AuthController.clientIp()` 가 `X-Real-IP` 를 검증 없이 믿는다.
지금은 Nginx 만 그 헤더를 쓰고 8080 이 바깥에 없어 닿지 못하지만, 그 전제가 깨지면(위 표 "백엔드 8080")
IP 카운터는 의미가 없어진다.

**제한은 0겹이 될 수 있다.** `RateLimiter` 는 fail-open 이라 Redis 에 못 붙으면 로그인은 되고 제한만
사라진다. 확인 방법은 §Redis 에 있다 — 여기 옮겨 적지 않는다.

> ⚠️ 그 확인 루프는 `login:ip:` 카운터(50/10m)도 함께 쓴다. **공용 IP(SSAFY 처럼 한 NAT 뒤)에서
> 다섯 번 돌리면 같은 망의 모든 사람이 10분간 429 를 받는다.** 핫스팟 등 개인 회선에서 돌린다.

### DB — 두 겹

| | |
|---|---|
| 클라이언트 | `DATABASE_URL` 에 `?sslmode=require`. 백엔드가 TLS 가 아니면 붙지 않는다 |
| 서버 | Supabase **Enforce SSL**. 평문으로 들어오는 접속을 거부한다 |

둘 다 확인한다. **서버 쪽은 상태가 바뀔 수 있으니 결과만 믿지 말고 다시 돌린다.**

```sh
# ① 클라이언트 겹 — 운영 .env 에 붙어 있나
grep -o 'sslmode=[a-z-]*' /opt/gachijoopging/.env

# ② 서버 겹 — 평문이 거부되나. disable 이 실패해야 켜져 있는 것이다
#
# mktemp 는 처음부터 0600 으로 만든다. `> /tmp/e` 는 umask(보통 0644)로 먼저 만들어져
# chmod 전까지 남에게 읽히고, 중간에 끊기면 비밀번호가 든 평문 파일이 그대로 남는다.
# trap 을 거는 이유도 그것이다.
E=$(mktemp) && trap 'rm -f "$E"' EXIT
sed 's/\$\$/$/g' /opt/gachijoopging/.env > "$E"

# 호스트는 백엔드가 실제로 붙는 곳에서 꺼낸다. 박아 두면 프로젝트를 옮겼을 때
# 백엔드와 다른 엔드포인트를 검사하고도 통과한다.
H=$(sed -n 's|^DATABASE_URL=jdbc:postgresql://||p' "$E" | sed 's|[:/].*||')

for m in disable prefer require; do
  printf 'sslmode=%-8s → ' "$m"
  docker run --rm --env-file "$E" postgres:16-alpine sh -c \
    "PGPASSWORD=\$DATABASE_PASSWORD psql \"host=$H port=5432 user=\$DATABASE_USER dbname=postgres sslmode=$m\" -tAc 'select 1'" 2>&1 | tail -1
done
```

`.env` 를 그대로 `--env-file` 로 넘기지 않고 `$$` 를 먼저 푸는 이유는 §배포 에 있다.

2026-10-14 결과:

```
sslmode=disable  → FATAL: (ESSLREQUIRED) SSL connection is required for user: postgres
sslmode=prefer   → 1
sslmode=require  → 1
```

> **`?sslmode=require` 를 떨어뜨려도 평문이 되지는 않는다.** pgjdbc 기본값 `prefer` 는 TLS 를 먼저
> 시도하고, 서버가 거부할 때만 평문으로 떨어진다. 잃는 것은 평문이 아니라 **보장**이다 — 그리고 그 떨어짐은
> 조용하다. 그래서 두 겹을 둔다. Enforce SSL 을 켜기 전에는 `sslmode=disable` 로 평문 접속이 실제로 됐다.

**네트워크 제한**(서버 IP 만 허용)은 유료 플랜 기능이라 걸지 못했다. 플랜을 올리면 §구성 의 고정 IP 를 넣는다.

## 감시

헬스체크와 바깥에서 찌르는 것, 둘을 함께 쓴다. 서버가 통째로 꺼지면 자기 자신에게 묻는 헬스체크도 같이
죽어서 아무도 모르기 때문이다.

| 층 | 무엇 | 주기 | 잡는 것 |
|---|---|---|---|
| 서버 안 | `infra/watch.sh` (cron) | 5분 | 백엔드·Redis·소켓·AI 가 죽음 |
| 서버 안 | `infra/watch.sh --limits` (cron) | 하루 1회 | ADR-0005 재검토 조건(디스크·DB) |
| 바깥 | `.github/workflows/watch.yml` | 5분 | **전원·네트워크가 통째로 나감** · 인증서 만료 |
| 알림 | 둘 다 Mattermost 수신 웹훅 | — | — |

바깥쪽이 따로 있는 이유가 핵심이다. **서버가 꺼지면 `watch.sh` 도 같이 죽어서 아무 말도 못 한다.**
그러면 조용한 것이 정상처럼 보인다. 그래서 우리 서버 밖에서 도는 것이 하나 있어야 한다.

외부 감시 서비스(UptimeRobot 등) 대신 GitHub Actions 를 쓴다 — 가입에 이메일이 필요 없고 공개 레포라
분(minute)이 무료다. 대신 스케줄이 밀려 5분이 10~20분이 될 수 있다. 분 단위 정확도가 필요해지면 그때 옮긴다.

> ⚠️ **스케줄 워크플로는 기본 브랜치(`dev`)에서만 돈다.** 브랜치에 올려 둔 것만으로는 아무 일도 일어나지
> 않고, `workflow_dispatch` 로 손으로 돌리는 것도 안 된다.

### 알림 규칙

**연속 2회 실패에 1번, 복구에 1번. 그 사이 반복은 없다.**

| | |
|---|---|
| 1회로 알리면 | 배포 중 재기동(약 25초)마다 울린다 |
| 죽어 있는 동안 계속 알리면 | 알림을 무시하는 습관이 생긴다 — **그러면 감시가 없는 것보다 나쁘다.** 있다고 믿는데 안 보기 때문이다 |

상태는 `/opt/gachijoopging/.watch-state` 에 "이름 연속실패횟수" 로 남는다. 바뀌는 순간에만 보낸다.

소켓은 토큰 없이 **401 이면 정상**이다 — Spring 까지 닿았다는 뜻이다. 백엔드가 죽으면 Nginx 가 502 를,
네트워크가 끊기면 000 을 준다. AI 는 `AI_BASE_URL` 이 비어 있으면 건너뛴다. 아직 연결 전이라는 것을
5분마다 쏘면 그게 소음이다.

`watch.sh` 는 백엔드를 따로 찌르지 않는다. compose 가 이미 10초마다 healthcheck 를 돌리므로
`docker inspect` 로 그 결과를 읽는다 — 같은 일을 두 번 하지 않는다.

> Mattermost 의 username override 는 이 워크스페이스에서 꺼져 있다. 보낸 사람은 웹훅 주인 이름으로
> 나가고, 구별은 머리말 이모지(🚨 다운 · ✅ 복구 · ⚠️ 한계)로 한다.

**Prometheus·Grafana 는 되살리지 않는다.** 옛 구성에 있었고 `application.yml` 에 아직
`/actuator/prometheus` 노출이 남아 있지만, 3명이 쓰는 규모에서 그래프를 보는 사람이 없다. 수집기만
나중에 붙이면 되도록 노출은 그대로 둔다.

## 로그

컨테이너 로그는 전부 호스트 **journald** 로 간다(`docker-compose.yml` 의 `x-logging`). Nginx 접속 로그도
stdout 이라 같은 곳에 쌓인다. 수집 서비스(Loki·CloudWatch)는 넣지 않는다 — 필요해지면 ADR.

| 보존 | 값 | 어디에 |
|---|---|---|
| 기간 | **90일** 뒤 지운다 — 개인정보처리방침 §2 "접속 로그 3개월" | `/etc/systemd/journald.conf.d/gachijoopging.conf` `MaxRetentionSec=90day` |
| 단위 | 하루. 기본(한 달)이면 넉 달까지 남는다 | 같은 파일 `MaxFileSec=1day` |
| 용량 | 4G 상한. 디스크를 지키는 안전판이고 지금 양으로는 90일보다 먼저 닿지 않는다 | 같은 파일 `SystemMaxUse=4G` |

설정 파일은 `provision.sh` §로그 보존이 만든다. 이미 있는 서버에는 `provision.sh` 를 한 번 더 돌린다 — 여러 번 돌려도 안전하다.
compose 의 `logging` 은 배포 때 컨테이너를 다시 만들어야 걸린다.

```sh
docker compose logs --tail 100 backend                            # 지금 컨테이너
sudo journalctl -t gachijoopging-backend-1 --since "2026-10-19 14:00"   # 재배포 전 컨테이너까지
sudo journalctl -t gachijoopging-nginx-1 --since -1h               # 접속 로그
docker inspect -f '{{.HostConfig.LogConfig}}' gachijoopging-backend-1  # {journald map[tag:...]}
sudo journalctl --disk-usage
```

**앱 오류의 `requestId` 로 찾기.** 오류 봉투의 `requestId` 가 백엔드 로그 줄마다 `[...]` 로 찍힌다
(compose 의 `LOGGING_PATTERN_LEVEL`). 4xx 는 `GlobalExceptionHandler` 가 WARN 한 줄을 남긴다.

```sh
sudo journalctl -t gachijoopging-backend-1 --since -1d | grep <requestId>
```

**로그에 토큰·이메일·좌표를 남기지 않는다**(§개인정보). 레이트리밋 키는 이메일을 해시해 넣고, 재설정 코드를
찍는 `LoggingPasswordResetMailSender` 는 `prod` 에서 꺼진다. 접속 로그에 남는 쿼리스트링에도 좌표·토큰이 없다
(`openapi.yaml` 의 query 파라미터는 범위·커서·검색어뿐).
**어긋난 곳이 하나 있다** — `SmtpPasswordResetMailSender` 가 발송 실패 때 받는 사람 이메일을 평문으로 찍는다. backend 쪽에서 고친다.

## 장애 대응

알림이 왔을 때 무엇부터 보는지. **먼저 고치지 말고 먼저 본다** — 되돌릴 수 없는 것부터 피한다.

| 알림 | 먼저 볼 것 |
|---|---|
| 🚨 백엔드 응답 없음 | `docker compose logs --tail 50 backend`. DB·Redis 자격이나 Flyway 에서 죽는 일이 많다 |
| 🚨 소켓 `HTTP 502` | 백엔드가 죽은 것이다. 위와 같다 — 소켓만 따로 깨지는 경우는 드물다 |
| 🚨 소켓 `HTTP 401` 아닌 4xx | Nginx 설정이 바뀌었다. **`/api/v1` 접두사를 떼지 않았는지** 본다(§HTTPS) |
| 🚨 바깥에서 안 보인다 | 서버 전원·Lightsail 방화벽·DNS. `ssh` 가 되는지부터 본다 |
| 🚨 Redis 응답 없음 | `REDIS_PASSWORD` 불일치가 가장 흔하다(§Redis). rate limit 이 조용히 열린 상태다 |
| ⚠️ 인증서 N일 남음 | `docker compose logs certbot`. 갱신이 멈춘 것이다 |
| ⚠️ 디스크·DB 한계 | 장애가 아니라 **신호**다. ADR-0005 를 다시 연다 |

```sh
ssh ubuntu@13.125.10.7
cd /opt/gachijoopging
docker compose ps                      # 뭐가 죽었나
docker compose logs --tail 50 backend  # 왜 죽었나
sudo journalctl -t gachijoopging-backend-1 --since -2h | tail -50  # 재배포로 바뀌기 전 컨테이너까지 — §로그
./watch.sh                             # 지금도 죽어 있나
tail -50 /var/log/gachijoopging-watch.log
```

되돌리는 것은 `./deploy.sh` (인자 없이) 로 직전 태그로 간다 — §롤백.

> ⚠️ **호스트가 통째로 죽었다 살아났으면 DB 커넥션이 안 돌아온다.** Supabase pooler 가 죽은 세션을
> 쥔 채로 상한을 채운다. 끊는 방법은 §서버를 교체할 때 의 ⚠️ 에 있다.

## `.env` 키

실물은 서버의 `/opt/gachijoopging/.env` 한 곳. 저장소에는 `infra/.env.example` 만.
(`deploy.sh`·`watch.sh`·`dev-env.ps1` 이 모두 이 경로를 쓴다. 서버에 `infra/` 디렉터리는 없다.)

**이 표 · `infra/.env.example` · 백엔드가 `${...}` 로 읽는 이름 셋이 1:1 이어야 한다.** 어긋나면 기동에서
죽는다. 읽는 쪽(백엔드)에 없는 키를 표에 두지 않고, 표에 없는 키를 백엔드가 읽지 않게 한다.

| 키 | 읽는 쪽 | 용도 |
|---|---|---|
| `DOCKERHUB_USER` · `IMAGE_TAG` | 배포 스크립트 | 이미지 좌표. `IMAGE_TAG` 는 deploy.sh 가 갱신 |
| `PUBLIC_BASE_URL` | 백엔드 | 서명 URL·메일 링크의 기준 |
| `MM_WEBHOOK_URL` | `watch.sh` | 서버가 죽은 것을 알릴 Mattermost 수신 웹훅. 루트 `.env` 의 같은 이름과 값이 같아도 되지만 역할이 다르다 — 그쪽은 각자의 로컬 알림이고 이쪽은 **서버가 스스로** 보내는 것이다. 비면 감시는 돌되 알리지 못한다 |
| `DATABASE_URL` · `DATABASE_USER` · `DATABASE_PASSWORD` | 백엔드 | Supabase 접속. 옛 `POSTGRES_*` 는 컨테이너용이라 없어진다 |
| `REDIS_HOST` · `REDIS_PORT` · `REDIS_PASSWORD` | 백엔드 | 레이트리밋(`global/ratelimit`). 운영은 비밀번호 필수 — 없으면 백엔드가 `NOAUTH` 를 맞고 제한이 **조용히** 꺼진다 |
| `JWT_ACTIVE_KID` · `JWT_PRIVATE_KEY_PEM` · `JWT_PUBLIC_KEY_PEM` · `JWT_PREVIOUS_*` | 백엔드 | 토큰 서명. kid 회전용 이전 키 |
| `KAKAO_APP_ID` · `GOOGLE_CLIENT_ID` | 백엔드 | 소셜 토큰 검증 |
| `MEDIA_ROOT` · `MEDIA_SECURE_LINK_SECRET` | 백엔드 · Nginx | 사진 보관 경로와 서명 URL. `MEDIA_ROOT` 는 컨테이너 안 경로이고 compose 가 볼륨으로 디스크에 잇는다 |
| `MAIL_USERNAME` · `MAIL_PASSWORD` | 백엔드 | 비밀번호 재설정 메일 |
| `FCM_CREDENTIALS` | 백엔드 | 푸시 |
| `DEMO_SEED_ENABLED` · `DEMO_MEMBER_EMAIL` · `DEMO_MEMBER_PASSWORD` · `DEMO_GUEST_EMAIL` · `DEMO_GUEST_PASSWORD` | 백엔드 | 데모 시드. 스테이징이 없어(ADR-0005) 운영에서 이 플래그로만 켠다. 자세한 것은 §데모 계정 |
| `AI_BASE_URL` · `AI_SECRET` | 백엔드 | AI 서버. `ai/.env` 의 `NGROK_DOMAIN`·`AI_SECRET` 과 짝이다 — `AI_SECRET` 이 다르면 호출이 전부 401 인데 백엔드가 401 을 `UNAVAILABLE` 로 내려 "AI 서버 다운" 과 구별되지 않는다 |
| `AGREEMENTS_VERSION` · `TERMS_URL` · `PRIVACY_URL` · `MARKETING_URL` | **아직 없음** | 현재 동의 버전과 공개 전문 URL. 계약(`openapi.yaml` `/agreements`)과 테이블(`user_agreements`)은 있지만 **백엔드가 아직 읽지 않는다** — 동의 API 를 구현할 때 들어온다. 전문 정본은 `docs/legal/`, 버전은 각 문서 머리의 값(지금 `2026-10`). 주소는 `https://www.gachijoopging.site/{terms,privacy,marketing}` 이고 Nginx 가 직접 보낸다 — §약관 전문 |

없어지는 키: `LIVEKIT_*` · `GRAFANA_ADMIN_PASSWORD` · `ADMIN_WEB_TAG` · `POSTGRES_*` ·
`KAKAO_REST_API_KEY`(auth 를 계약 기준으로 다시 쓰면서 카카오 좌표 조회가 빠졌다).

푸시(FCM)는 Firebase 프로젝트 `gachi-joopging`, Android 패키지 `site.gachijoopging.app` 으로 등록돼 있다. `google-services.json` 은 Firebase 콘솔에서 내려받는다.

`.env` 를 고칠 때는 **바이너리로 다룬다.** PEM 값에 CR 이 섞이면 docker compose 는 통과시키고 Spring 만 `Missing key encoding` 으로 죽는다. Windows 편집기로 열지 않고 `infra/dev-env.ps1` 로 올린다(§시크릿).

## `mobile/.env` 키 (앱)

위 표는 서버(`infra/.env`)다. 앱은 별도이며 각자 로컬에만 둔다 — `.gitignore` 가 막는다.

| 키 | 용도 |
|---|---|
| `KAKAO_NATIVE_APP_KEY` | 카카오맵 SDK 초기화. 없으면 지도 화면이 안내 배너만 띄운다 |
| `API_BASE_URL` | 실서버 HTTP 기준 주소. 예 `https://www.gachijoopging.site/api/v1` |
| `WS_URL` | 실서버 소켓 주소. 예 `wss://www.gachijoopging.site/api/v1/ws` |
| `EXPO_PUBLIC_API_MODE` | `real` 이고 `API_BASE_URL` 이 있을 때만 실서버로 붙는다. 그 밖에는 목(openapi example) |

카카오 개발자 콘솔 → 앱 설정 → 플랫폼 → Android 에 **패키지명과 키 해시**가 등록돼 있어야 지도가 뜬다.
없으면 `MapAuthException(401): Unauthorized` 가 난다.

**키 해시는 APK 에서 직접 뽑는다.** `~/.android/debug.keystore` 가 아니다 — `expo prebuild` 가
`mobile/android/app/debug.keystore` 를 따로 만들기 때문에 둘의 해시가 다르다.

```bash
apksigner verify --print-certs <apk> | grep SHA-1
# 나온 hex 를 base64 로: python -c "import base64,binascii;print(base64.b64encode(binascii.unhexlify('<hex>')).decode())"
```

값은 `.env` 에 따옴표 없이 넣는다. `KEY='abc'` 로 적으면 따옴표까지 값으로 읽혀 401 이 난다.

## 데모 계정

데모 크루·계정은 `DemoSeedRunner`(`backend/.../seed/`)가 넣는다. 스테이징을 두지 않아(ADR-0005) 서버에서 플래그로만 켠다. **기본은 꺼짐**이고, 다시 돌려도 중복을 만들지 않는다(고정 id, 있으면 건너뜀). 자격 값은 팀 채널로만 주고받는다.

| 키 | 읽는 쪽 | 용도 |
|---|---|---|
| `DEMO_SEED_ENABLED` | 백엔드 | `true` 일 때만 러너가 뜬다. 켜면 아래 넷이 모두 있어야 기동한다 |
| `DEMO_MEMBER_EMAIL` · `DEMO_MEMBER_PASSWORD` | 백엔드 | 계정 ① — 데모 크루(공개·서울) 크루원. 데모 E2E 1단계(3-1 부터) |
| `DEMO_GUEST_EMAIL` · `DEMO_GUEST_PASSWORD` | 백엔드 | 계정 ② — 소속·추방 이력 없음, 과거 활동 2건. 2단계(1-8 공개 크루 가입부터). 순회마다 **크루 나가기**로 되돌린다 — 추방하면 같은 크루에 다시 가입할 수 없다 |

넣는 것: 데모 크루(크루장 + 크루원 3, 지난 7일 활동 6건·`crew_daily_stats`·게시물 2·공지 1·채팅 3), 비공개 크루(크루장 1). 크루장·크루원 계정은 로그인 수단이 없다.

- 시드의 이메일·닉네임·크루 이름을 이미 다른 행이 쓰고 있으면 시드 전체를 건너뛰고 경고만 남긴다. 기동은 막지 않는다
- 처음 실행한 시각과 자격 값이 고정된다. 이후 `DEMO_*` 를 바꿔도 반영되지 않는다 — 비밀번호는 앱의 비밀번호 재설정으로 바꾼다
- "지난 7일" 활동은 첫 실행 시각 기준이라 일주일 뒤에는 홈 카드가 빈다. 데모 직전에 다시 시드한다:
  1. `backend/src/main/resources/seed/demo-reset.sql` 을 DB 에 실행한다. 데모 크루 두 개와 거기 딸린 활동·통계·피드·공지·채팅·신청·크루원을 지운다. 계정은 남긴다 — 동의·비밀번호가 유지된다
  2. `DEMO_SEED_ENABLED=true` 로 서버를 재기동한다
- 활동만 골라 지우지 않는다. `crew_daily_stats` 가 남아 재시드 때 통계가 두 배가 된다

## 개인정보

- 위치 경로(`activities.route`)와 실시간 위치(`live_locations`)는 위치 정보다. 실시간 위치는 활동 종료 때 즉시 지운다
- 회원 탈퇴 때 개인 활동 상세(경로·사진 포함)를 지운다. 크루 합산은 `crew_daily_stats` 에 남는다(`ERD.md`)
- 사진은 서명 URL 로만 노출한다. 공개 버킷을 만들지 않는다
- 로그에 토큰·이메일·좌표를 남기지 않는다

## 스토어

- Android: `release.jks` 와 비밀번호는 저장소 밖(`local.properties`). 잃으면 덮어설치가 불가능하다. 자세한 것은 아래 §앱 서명
- iOS: 1차 범위 밖. 넣을 때 Apple 개발자 계정·서명·TestFlight 절차를 여기에 적는다

## 앱 서명

릴리스 APK 는 모두 같은 키(`release.jks`)로 서명한다. 카카오맵·Firebase 가 `site.gachijoopging.app` 과 이 키의 해시로
앱을 대조하므로, 키가 다르면 지도가 `MapAuthException(401)` 로 안 뜨고 옛 APK 위에 덮어설치도 안 된다.

- 키 파일과 비밀번호는 **팀 비밀 보관소**에서 받는다. 저장소에 넣지 않는다(`.gitignore` 의 `*.jks`·`*.keystore`)
- `mobile/plugins/with-release-signing.js` 가 아래 순서로 읽는다. 둘 다 없으면 debug 키로 서명된다 — 빌드는 되지만 카카오맵이 안 뜬다

| 환경 변수 (배포 채널·CI) | `mobile/local.properties` (로컬) | 값 |
|---|---|---|
| `ANDROID_KEYSTORE_PATH` | `RELEASE_STORE_FILE` | 키 파일 경로. 상대 경로는 `mobile/` 기준 (예 `release.jks`). 절대 경로는 `C:/keys/release.jks` 처럼 `/` 로 쓴다. `local.properties` 에서 `\` 는 이스케이프 문자다 |
| `ANDROID_KEYSTORE_PASSWORD` | `RELEASE_STORE_PASSWORD` | 저장소 비밀번호 |
| `ANDROID_KEY_ALIAS` | `RELEASE_KEY_ALIAS` | 키 별칭 |
| `ANDROID_KEY_PASSWORD` | `RELEASE_KEY_PASSWORD` | 키 비밀번호. 없으면 저장소 비밀번호 |

키 지문(공개값, 콘솔 등록용):

```
SHA-1   A3:57:14:98:05:50:8B:BF:62:87:67:52:C9:15:2A:C2:01:CD:4F:1E
SHA-256 73:E7:E6:0D:7E:7B:AE:18:55:88:D1:E4:5A:25:F8:85:84:1A:01:58:66:37:25:B6:04:CB:9D:BF:FE:6C:0C:EA
카카오 키 해시 o1cUmAVQi79ih2dSyRUqwgHNTx4=
```

새로 받은 APK 가 이 키로 서명됐는지는 `apksigner verify --print-certs <apk>` 의 SHA-1 로 확인한다.
