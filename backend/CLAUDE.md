# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## 명령

```bash
./gradlew build              # 컴파일 + 테스트 + jacoco
./gradlew test                # 테스트만
./gradlew compileJava -q      # 컴파일만, 에러를 빨리 보고 싶을 때
```

단일 테스트: `./gradlew test --tests "site.gachijoopging.server.domain.auth.AuthSignupLoginTest"`.

`@Tag("docker")` 가 붙은 통합 테스트(`support/IntegrationTest`)는 Testcontainers 로 PostgreSQL 을
띄운다 — 로컬에 Docker Desktop 이 떠 있어야 통과한다. 안 떠 있으면 그 테스트만 건너뛴다는
가정으로 실패를 읽지 않는다.

## 지금 상태 — 빌드가 깨져 있다

`compileJava` 부터 실패한다 (2026-09-10 기준). ADR-0004 대로 `global`·`auth`·`media` 만
이관했는데, 이관된 코드가 이관되지 않은 도메인을 참조한다:

- `domain/auth/**` → `domain.user.domain.service` · `domain.user.dto` (없음)
- `domain/media/**` → `domain.activity.domain.entity.Category` (없음)

이 레포에서 처음 여는 작업은 이 둘(`user` 도메인, `activity.Category`)을 세워 빌드를 초록으로
만드는 것이다. 그 전까지는 다른 도메인 작업도 컴파일이 안 돼 검증할 수 없다.

## 구조

`domain/<도메인>/{api,application,domain,infrastructure}` — `api` 는 컨트롤러, `application` 은
유스케이스 조립(`@Transactional` 없음), `domain` 은 Entity·도메인 서비스·정책, `infrastructure` 는
영속성(`infrastructure.persistence`)·외부 클라이언트(`infrastructure.client`). `global/` 은
도메인에 안 속한 공통(보안·에러·설정).

`test/.../architecture/ArchitectureTest.java` 가 이 레이어링과 도메인 간 격리(타 도메인
infrastructure 주입 금지·타 도메인 엔티티를 필드로 안 씀)를 ArchUnit 으로 강제한다 — 위반하는
의존 방향을 추가하기 전에 이 테스트부터 본다.

## 지켜야 하는 규칙

코드 스타일(Lombok·생성자 주입·Entity/DTO 분리·`/crew` 경로 규칙 등)은 루트 `CLAUDE.md` §backend
를 본다. 여기는 그 위에 backend 안에서만 참인 것만 적는다.

- 코드 규약 상세는 `backend/docs/02-conventions.md` — 옛 `docs/백엔드/02-conventions.md` 를 그대로 가져온 것이라 손대지 않는다
- 이미 적용된 Flyway migration 은 주석도 checksum 에 들어간다. 손대지 않는다
