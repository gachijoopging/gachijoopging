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

## 구조

`domain/<도메인>/{controller,facade,service,repository,entity,dto,event,client}` — `facade` 는
트랜잭션 밖에서 외부 호출·응답 조립(`@Transactional` 없음), `service` 는 트랜잭션 경계·규칙·정책,
`client` 는 외부 연동이고 `facade` 와 `event` 리스너만 부른다. `facade`·`event`·`client` 는 필요한
도메인만 둔다. `global/` 은 도메인에 안 속한 공통(보안·에러·설정). 각 자리의 책임은
`docs/02-conventions.md` §3.

`test/.../architecture/ArchitectureTest.java` 가 이 레이어링과 도메인 간 격리(타 도메인
repository·client 주입 금지·타 도메인 엔티티를 필드로 안 씀)를 ArchUnit 으로 강제한다 — 위반하는
의존 방향을 추가하기 전에 이 테스트부터 본다.

## 지켜야 하는 규칙

코드 스타일(Lombok·생성자 주입·Entity/DTO 분리·`/crew` 경로 규칙 등)은 루트 `CLAUDE.md` §backend
를 본다. 여기는 그 위에 backend 안에서만 참인 것만 적는다.

- 코드 규약 상세는 `backend/docs/02-conventions.md` — 옛 저장소에서 가져왔지만 이 레포의 정본이다. 레이어 규칙을 바꾸면 `ArchitectureTest` 와 같은 PR 에서 고친다
- 이미 적용된 Flyway migration 은 주석도 checksum 에 들어간다. 손대지 않는다
