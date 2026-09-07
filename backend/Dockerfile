########################################################################
# 가치줍깅 — Spring Boot 이미지 (⑥ 인프라·배포)
#
# ※ 모노레포 구조상 backend/ 가 정본입니다 (deploy/ 아래 사본은 없습니다).
#
# 빌드는 GitLab CI(.gitlab-ci.yml의 backend:image)에서만 하고 EC2는 pull만
# 합니다 (결정 27) — 4 vCPU에서 Gradle 빌드를 돌리면 서비스 응답이 함께
# 느려집니다.
########################################################################

# ── 1단계: 빌드 ────────────────────────────────────────────────────
FROM gradle:8.10-jdk21 AS build
WORKDIR /src

# BuildKit 캐시 마운트로 의존성을 재사용한다.
COPY . .
RUN --mount=type=cache,target=/home/gradle/.gradle \
    gradle bootJar --no-daemon -x test

# ── 2단계: 레이어 분해 ─────────────────────────────────────────────
# fat jar를 통째로 한 레이어에 두면 코드 한 줄만 바뀌어도 60MB를 다시
# pull한다. 의존성/애플리케이션을 나누면 배포마다 바뀌는 건 수 MB뿐이다.
#
# jarmode=tools는 Boot 3.3+의 권장 방식이고 구 layertools를 대체한다.
# 산출물 구조가 다르다 — application/ 안에 "얇은" application.jar가 들어가고
# 그게 나머지 디렉터리를 참조하므로, 실행도 JarLauncher가 아니라
# `java -jar application.jar`가 된다 (아래 ENTRYPOINT). 이 레이아웃이라야
# 향후 CDS/AOT 캐시를 붙일 수 있다.
#
# 원본 jar를 application.jar로 먼저 rename하는 이유: 추출되는 얇은 jar가
# 원본 파일명을 그대로 물려받기 때문에, 이름을 고정해야 ENTRYPOINT가 고정된다.
FROM eclipse-temurin:21-jre-jammy AS extract
WORKDIR /work
COPY --from=build /src/build/libs/*.jar application.jar
RUN java -Djarmode=tools -jar application.jar extract --layers --destination extracted

# ── 3단계: 런타임 ──────────────────────────────────────────────────
FROM eclipse-temurin:21-jre-jammy
WORKDIR /app

# curl은 compose healthcheck가 /actuator/health/readiness를 폴링하는 데
# 필요하다 (결정 27 — 배포 스크립트가 이 상태로 upstream 전환 시점을 정한다).
# temurin JRE 이미지에는 기본 포함되지 않으므로 반드시 설치해야 하고,
# 없으면 healthcheck가 영원히 unhealthy라 배포가 항상 실패한다.
RUN apt-get update \
 && apt-get install -y --no-install-recommends curl tzdata \
 && rm -rf /var/lib/apt/lists/*

# 시간은 전부 ISO-8601 UTC로 다룬다 (API 공통 규약).
ENV TZ=UTC

# 루트로 돌리지 않는다.
# ⚠️ 호스트의 /data/uploads 소유자를 이 UID로 맞춰야 사진 저장이 된다:
#     sudo mkdir -p /data/uploads/deleted && sudo chown -R 10001:10001 /data/uploads
#   안 하면 업로드가 전부 permission denied로 실패한다 (초기 설정 체크리스트 ⑥).
RUN groupadd -g 10001 app && useradd -u 10001 -g app -s /usr/sbin/nologin app
USER 10001:10001

COPY --from=extract --chown=10001:10001 /work/extracted/dependencies/          ./
COPY --from=extract --chown=10001:10001 /work/extracted/spring-boot-loader/    ./
COPY --from=extract --chown=10001:10001 /work/extracted/snapshot-dependencies/ ./
COPY --from=extract --chown=10001:10001 /work/extracted/application/           ./

EXPOSE 8080

# exec 형식이어야 JVM이 PID 1로 떠서 SIGTERM을 직접 받는다.
# shell 형식으로 쓰면 sh가 PID 1이 되어 신호를 전달하지 않고, 그러면
# 배포 시 STOMP close frame을 보낼 기회 없이 죽는다 (결정 45의 능동 drain).
#
# ※ graceful shutdown은 Boot 3.x에서 기본 활성이다 — 따로 켤 필요가 없고,
#   끄려면 server.shutdown=immediate를 명시해야 한다. 대신 유예 시간
#   spring.lifecycle.timeout-per-shutdown-phase(기본 30s)를 compose의
#   stop_grace_period와 맞춰야 한다 (compose에서 45s로 주입).
ENTRYPOINT ["java", "-jar", "application.jar"]
