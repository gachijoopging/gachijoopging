# 운영

Lightsail VM 한 대 + Supabase Postgres + 담당자 노트북의 AI 서버.

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
| AI | 담당자 GPU 노트북 + 터널. 서버에 올리지 않는다 (`ai/README.md` §8) |

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
sh infra/provision.sh
```

스왑·도커·디렉터리를 만든다. 여러 번 돌려도 안전하다 — 이미 돼 있으면 건너뛴다.

### HTTPS

Nginx 가 443 을 잡고 `/api/v1/...` 를 백엔드로 넘긴다. 백엔드는 루트에서 서비스하는데 계약의 base 가
`/api/v1` 이라(`openapi.yaml` servers) Nginx 가 `rewrite` 로 접두사를 뗀다.

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
  --email "$CERT_EMAIL" --agree-tos --no-eff-email
```

그다음부터는 compose 의 `certbot` 컨테이너가 12시간마다 webroot 로 갱신하고, `nginx` 가 6시간마다
설정을 다시 읽는다. 인증서가 갱신돼도 Nginx 는 스스로 알지 못하기 때문이다.

> ⚠️ 지금 인증서는 **이메일 없이**(`--register-unsafely-without-email`) 발급돼 있어 만료 경고 메일이
> 오지 않는다. `CERT_EMAIL` 을 정하면 위 명령으로 다시 받는다.

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

### CORS 를 열지 않는다

앱(React Native)은 브라우저가 아니라 Origin 검사를 받지 않는다. AI 서버도 사진 URL 을 읽지 않는다 —
백엔드가 multipart 로 직접 보낸다(`AiInferenceClient`). 웹에서 쓸 일이 없으므로 web origin 을
허용하지 않는다(GAC-111).

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

## 감시

헬스체크와 바깥에서 찌르는 것, 둘을 함께 쓴다. 서버가 통째로 꺼지면 자기 자신에게 묻는 헬스체크도 같이
죽어서 아무도 모르기 때문이다.

| 층 | 무엇 | 잡는 것 |
|---|---|---|
| 서버 안 | `/actuator/health`(readiness·liveness) | 백엔드 프로세스·DB 연결 |
| 바깥 | 외부 모니터링이 공개 주소를 주기적으로 호출 | 전원·네트워크·인증서 만료 |
| 알림 | `node infra/notify.mjs` 로 Mattermost | — |

**Prometheus·Grafana 는 되살리지 않는다.** 옛 구성에 있었고 `application.yml` 에 아직
`/actuator/prometheus` 노출이 남아 있지만, 3명이 쓰는 규모에서 그래프를 보는 사람이 없다. 수집기만
나중에 붙이면 되도록 노출은 그대로 둔다.

## `.env` 키

실물은 서버의 `/opt/gachijoopging/infra/.env` 한 곳. 저장소에는 `infra/.env.example` 만.

**이 표 · `infra/.env.example` · 백엔드가 `${...}` 로 읽는 이름 셋이 1:1 이어야 한다.** 어긋나면 기동에서
죽는다. 읽는 쪽(백엔드)에 없는 키를 표에 두지 않고, 표에 없는 키를 백엔드가 읽지 않게 한다.

| 키 | 읽는 쪽 | 용도 |
|---|---|---|
| `DOCKERHUB_USER` · `IMAGE_TAG` | 배포 스크립트 | 이미지 좌표. `IMAGE_TAG` 는 deploy.sh 가 갱신 |
| `PUBLIC_BASE_URL` | 백엔드 | 서명 URL·메일 링크의 기준 |
| `INVITE_BASE_URL` | 백엔드 | 초대 링크 앞부분. 카카오톡으로 공유되는 주소다 |
| `DATABASE_URL` · `DATABASE_USER` · `DATABASE_PASSWORD` | 백엔드 | Supabase 접속. 옛 `POSTGRES_*` 는 컨테이너용이라 없어진다 |
| `REDIS_HOST` · `REDIS_PORT` · `REDIS_PASSWORD` | 백엔드 | 레이트리밋(`global/ratelimit`). 운영은 비밀번호 필수 — 없으면 백엔드가 `NOAUTH` 를 맞고 제한이 **조용히** 꺼진다 |
| `JWT_ACTIVE_KID` · `JWT_PRIVATE_KEY_PEM` · `JWT_PUBLIC_KEY_PEM` · `JWT_PREVIOUS_*` | 백엔드 | 토큰 서명. kid 회전용 이전 키 |
| `KAKAO_APP_ID` · `GOOGLE_CLIENT_ID` | 백엔드 | 소셜 토큰 검증 |
| `MEDIA_ROOT` · `MEDIA_SECURE_LINK_SECRET` | 백엔드 · Nginx | 사진 보관 경로와 서명 URL. `MEDIA_ROOT` 는 컨테이너 안 경로이고 compose 가 볼륨으로 디스크에 잇는다 |
| `MAIL_USERNAME` · `MAIL_PASSWORD` | 백엔드 | 비밀번호 재설정 메일 |
| `FCM_CREDENTIALS` | 백엔드 | 푸시 |
| `AI_BASE_URL` · `AI_SECRET` | 백엔드 | AI 서버. `ai/.env` 의 `NGROK_DOMAIN`·`AI_SECRET` 과 짝이다 — `AI_SECRET` 이 다르면 호출이 전부 401 인데 백엔드가 401 을 `UNAVAILABLE` 로 내려 "AI 서버 다운" 과 구별되지 않는다 |
| `CERT_DOMAIN` · `CERT_EMAIL` | acme | 인증서 발급·갱신 |
| `AGREEMENTS_VERSION` · `TERMS_URL` · `PRIVACY_URL` · `MARKETING_URL` | **아직 없음** | 현재 동의 버전과 공개 전문 URL. 계약(`openapi.yaml` `/agreements`)과 테이블(`user_agreements`)은 있지만 **백엔드가 아직 읽지 않는다** — 동의 API 를 구현할 때 들어온다. 전문 정본은 `docs/legal/`, 버전은 각 문서 머리의 값(지금 `2026-10`). 정식 주소가 서빙되기 전까지는 `https://gachijoopging.github.io/gachijoopging-legal/{terms,privacy,marketing}` 를 넣는다. 정식 주소 전환과 전문의 빈칸(문의 이메일·리전)은 GAC-80 |

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
