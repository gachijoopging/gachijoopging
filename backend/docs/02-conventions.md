# 백엔드 코딩 컨벤션 — 모놀리스 v1

> 우선순위: **openapi.yaml 계약 > 이 문서 > 개인 취향.** 도메인 배치·소유 테이블·담당 경로는 `01-구조.md`.
> 이 문서와 어긋나는 코드를 발견하면 고치는 쪽이 아니라 **먼저 PR 코멘트로 합의**한다.

## 1. 포맷과 주석

Spotless(googleJavaFormat)가 정답이다. `./gradlew spotlessApply` 로 끝. 들여쓰기·줄바꿈·
import 순서를 리뷰에서 언급하지 않는다.

**주석은 "왜" 만 적는다.**

- ❌ **How 금지** — 코드가 어떻게 도는지는 이름과 구조로 드러낸다. 코드를 우리말로 옮긴
  주석은 지운다.
- ❌ **변경 이력·버전·티켓 ID 금지** — 코드 주석에 남기지 않는다. 그것들이 갈 곳은 문서·테스트·
  커밋 메시지다. (현재 `backend/src` 에 티켓 ID 주석은 0 건이다. 다시 늘리지 않는다.)
- ✅ **복잡한 정책의 이유** — 왜 이 숫자인지, 왜 이 순서인지.
- ✅ **외부의 결함·제약** — 라이브러리 버그, DB 동작, 하드웨어 한계처럼 코드만 봐서는
  알 수 없는 것. `build.gradle` 의 Testcontainers 버전 주석이 좋은 예다.

판단 기준은 주석의 **언어가 아니라 정보의 종류**다. How·changelog 주석은 한국어든 영어든
똑같이 금지다. 기존 주석은 그 파일을 고칠 때 이 기준으로 함께 정리한다.

**이미 적용된 Flyway 마이그레이션은 SQL 주석도 체크섬에 들어간다** — 내용도 주석도 고치지
않는다(§13). 같은 기준을 새 마이그레이션에 적용한다.

## 2. 네이밍

| 대상 | 규칙 | 예 |
|---|---|---|
| 패키지 | 소문자 단수형 | `domain.activity`, `domain.post` |
| 컨트롤러 | `{도메인}Controller` — 기본 도메인당 1개, 300줄 넘으면 리소스 단위 분리 | `ActivityController` |
| 서비스 | `{도메인}Service` — 자기 도메인 데이터·트랜잭션 경계 | `UserService`, `CrewService` |
| 파사드 | `{도메인}Facade` — 응답 조립·외부 호출 → 저장. 명령·조회 구분은 메서드 이름으로 한다. 필요한 곳만 만들고, **그 경로를 담당하는 도메인의 `facade/`** 에 둔다 | `MediaFacade`, `AuthFacade` |
| 정리 작업 | `{대상}CleanupJob` — 스케줄러가 부르는 것. `service/` | `RefreshTokenCleanupJob` |
| 정책·계산기 | 상태도 트랜잭션도 없는 규칙. 접미사를 강제하지 않고 하는 일로 이름 짓는다. `service/` | `OpaqueToken`, `MediaSignedUrl`, `MediaImageValidator` |
| 도메인 이벤트 | `{사건}Event` + `{사건}Listener`. `event/` | `MediaQuarantineEvent`, `MediaQuarantineListener` |
| 리포지토리 | `{엔티티}Repository` — Spring Data 인터페이스. `repository/` | `ActivityPhotoRepository` |
| 조회 전용 리포지토리 | `{대상}QueryRepository` — QueryDSL·native·JdbcClient 로 짠 조회 전용. **이쪽이 기본이다** | `ActivityQueryRepository` |
| Spring Data 확장 | `{엔티티}RepositoryCustom` + `{엔티티}RepositoryImpl` — **같은 인터페이스로 파생 쿼리와 QueryDSL 을 같이 노출해야 할 때만.** 현재는 없다 | `PostRepositoryCustom` |
| 조회 결과 row | `{대상}Row` — projection 전용 record. 리포지토리 옆 | `ChatMessageRow` |
| 공통 조건식 | `{개념}Predicates` — 여러 도메인이 쓰는 QueryDSL 조건을 소유 도메인의 `query/` 에 한 벌 | `BlockPredicates.notBlockedWith(me)` |
| 엔티티 | 접미사 없는 명사 | `Activity`, `RefreshToken` |
| 요청 DTO | `{동작}{대상}Request` | `StartActivityRequest`, `CreateCrewRequest` |
| 응답 DTO | `{대상}Response` — openapi 스키마명과 최대한 일치 | `ActivitySummaryResponse`, `MeResponse` |
| 외부 클라이언트 | `{대상}Client` | `KakaoAuthClient`, `AiInferenceClient` |
| DB | snake_case. 리소스 테이블은 복수형, 연결·불가산 명칭은 `docs/ERD.md` 정본 사용 | `activity_items`, `crew_members`, `post_media`, `media` |
| 테스트 메서드 | 한글 허용 — 시나리오가 읽히게 | `void 차단_상대의_글은_피드에서_빠진다()` |

JSON 필드명은 openapi.yaml 이 정본이다 — camelCase, 철자 하나도 바꾸지 않는다
(이상해 보여도 그대로).

## 3. 레이어 책임

패키지 배치와 의존 방향은 `01-구조.md` §3·§5 가 정본이다. 여기는 각 자리가 **무엇을 하고
무엇을 하지 않는지**만 적는다.

- **`controller/`** — 경로·바인딩·Bean Validation·`@CurrentUser` 추출, 아래 계층 호출,
  `ApiResponse` 로 감싸 반환. **비즈니스 로직·조건 분기를 두지 않는다.**
  파사드가 있는 경로는 파사드를, 없으면 서비스를 부른다. **엔티티를 모른다** — 응답은 feature 루트 `dto/`. (entity 패키지의 enum 은 예외 — 쿼리 파라미터 바인딩에 쓴다)
- **`dto/`** (feature 루트) — 요청·응답·도메인 간 전달 record. 엔티티 → dto 변환은 정적 팩토리
  `from(entity)`. 리포지토리 projection 과 타 도메인 읽기 계약이 여기 닿으므로 controller 아래에
  두지 않는다.
- **`facade/`** — 여러 도메인의 서비스를 모아 응답 DTO 를 만들거나, 외부 HTTP 를 트랜잭션
  앞에 두른다. **`@Transactional` 을 붙이지 않는다**(§10) — 트랜잭션은 서비스가 연다.
  파사드는 파사드를 주입하지 않고 **엔티티도 모른다**(ArchUnit L2b) — 서비스가 dto 를 반환한다.
  **쓰기 리포지토리는 직접 부르지 않는다** — 쓰기는 서비스를
  거친다. 단 **같은 도메인의 읽기 전용 `XxxQueryRepository` 는 직접 주입해도 된다**
  — 조회 결과를 서비스가 그대로 전달만 하는 메서드를 억지로 만드는 것보다 낫다.
  읽기라 트랜잭션 없이도 안전하다.
- **`service/XxxCleanupJob`** — `@Scheduled` 가 부르는 정리 작업. 자기 데이터의
  bulk 삭제라 트랜잭션을 열며, 그래서 `facade/` 가 아니라 서비스 옆이다.
- **`service/`(`XxxService`)** — **트랜잭션 경계**, 비즈니스 규칙, 권한 검사
  (소유자·크루장·크루원), 타 도메인 **서비스** 호출. 타 도메인 서비스 주입은
  `01-구조.md` §4 의 관계만, 순환하면 기동이 실패한다(§12). **HttpServletRequest·ResponseEntity 등 웹 타입을 모른다.**
  `controller`·`facade`·`client` 도 모른다(ArchUnit L2·L3).
- **정책·계산기** (`service/` 안) — 상태도 트랜잭션도 없는 규칙. 스프링 빈이어도 좋지만
  **아무것도 주입하지 않거나 설정값만 받는다.** 리포지토리를 주입하기 시작했으면 그건 서비스다.
  폴더를 따로 두지 않는다 — 서비스와 같은 의존 규칙을 지키므로 나눌 이유가 없다.
- **`entity/`** — JPA 엔티티. 도메인 밖으로 나가지 않는다(§4).
- **`repository/`** — 단순 조회는 Spring Data 파생 쿼리, 조건이 조합되거나
  도메인을 넘어 JOIN 하면 **QueryDSL `XxxQueryRepository`**, PostGIS 함수처럼 QueryDSL 로
  표현하기 번거로운 것은 native `@Query`, CSV 내보내기 같은 스트리밍은 `JdbcClient`.
  타 도메인 테이블은 **읽기만**, 결과는 필요한 컬럼만 골라 내 dto 로 받는다(§12 R2).
  **비즈니스 판단을 두지 않는다** (쿼리 조건은 OK, "차단이면 어떻게" 는 서비스 몫).
  Redis 같은 다른 **저장소** 어댑터도 여기 둔다 — `client/` 에 두면 서비스가 쓸 수 없다(L3).
- **`client/`** — 외부 HTTP(RestClient)·스토리지·AI. 응답을 우리 dto 로 변환해서
  반환. 재시도·타임아웃은 클라이언트 안에서 끝낸다 — 호출부로 새 나가지 않게.
  **서비스는 이것을 모른다.** 부르는 것은 `facade/` 와 `event/` 의 커밋 후 리스너뿐이다 — 둘 다 트랜잭션 밖이다.
- **`event/`** — 도메인 이벤트 record 와 `@TransactionalEventListener(AFTER_COMMIT)` 리스너(§10 나).
- **`query/`** — 타 도메인이 재사용하는 QueryDSL `BooleanExpression` 만. 도메인이 밖에 공개하는
  읽기 계약이라 안쪽으로 내리지 않는다.

## 4. DTO · 엔티티

- DTO 는 전부 **record**. 변환은 정적 팩토리 `from(entity)` / `of(...)`.
- **엔티티는 도메인 내부까지만.** service 의 public 메서드는 dto(또는 원시값)를 반환한다.
  타 도메인에 넘길 때도 dto — entity 가 도메인 밖으로 나가는 순간 R2(§12)가 무너진다.
- 엔티티 Lombok 기본은 `@Getter` + `@NoArgsConstructor(access = PROTECTED)`.
  **`@Setter`·`@Data`·`@ToString`·`@EqualsAndHashCode` 금지.** 상태 변경은 의도가 드러나는
  메서드로 (`refreshToken.revoke(now)`, `item.reclassify(category)`).
- **`@Builder` 는 좁힌 private 생성자에만 붙인다.** 생성자는 두 가지를 한다.
  1. **생성 시점에 정할 수 없는 필드를 파라미터에서 뺀다.** 새 글은 삭제된 상태로 태어날 수
     없으므로 `deletedAt` 은 파라미터가 아니다. `createdAt`·`updatedAt` 은 `now` 하나로 묶어
     서로 어긋날 수 없게 한다.
  2. **남은 필수값을 검증한다.** `requireNonNull` 로 이름과 함께 던진다.

  ```java
  @Builder
  private Post(UUID id, UUID crewId, UUID authorId, String text,
               PostVisibility visibility, Instant now) {
    this.id = requireNonNull(id, "id");
    this.crewId = requireNonNull(crewId, "crewId");
    this.authorId = requireNonNull(authorId, "authorId");
    this.text = requireNonNull(text, "text");
    this.visibility = requireNonNull(visibility, "visibility");
    this.createdAt = now;
    this.updatedAt = now;
    // deletedAt 은 파라미터가 아니다
  }
  ```

  **전체 필드를 받는 생성자를 두지 않는다.** JPA 는 `@NoArgsConstructor(PROTECTED)` 로 만들고
  필드에 리플렉션으로 값을 넣으므로, 전체 필드 생성자는 오직 Builder 때문에 존재한다. 좁히면
  잃는 것이 없다.

  **정적 팩토리로 바꾸지 않는다.** 파라미터가 많은 엔티티에서 위치 인자는 같은 타입 두 개를
  바꿔 넣어도 컴파일된다(UUID 가 흔하다). Builder 의 이름 있는 인자가 그것을 막아 준다 —
  좁힌 생성자가 "빠뜨림" 을, Builder 가 "뒤바뀜" 을 각각 막는 조합이다.
- 연관 매핑은 **같은 도메인 안에서만**, 전부 `LAZY`. 도메인 경계를 넘으면 UUID 컬럼.
  (현재 매핑된 연관관계는 하나도 없다. 전부 UUID 참조다.)
- 스프링 빈은 **생성자 주입만**. 필드 `@Autowired` 금지.
  - 순수하게 `final` 의존성만 대입하는 생성자면 `@RequiredArgsConstructor`.
  - 검증·변환·초기화 순서가 필요하면 **명시적 생성자를 유지한다.**
    `MediaSignedUrl` 이 그 예다 — 생성자에서 `baseUrl` 끝의 슬래시를 다듬어 `origin` 에 담는다.
    이런 생성자를 Lombok 으로 바꾸면 그 처리가 갈 곳이 없어진다.

## 5. 응답 규약

- 성공은 전부 `ApiResponse<T>` — 직렬화하면 `{"data": …}`.
- 목록은 `CursorPage<T>` — `{items, nextCursor}`. nextCursor 는 다음 페이지가 없으면 null.
- **배열 예외** (크루원 목록 `/crew/members` · 활동 중인 크루원 `/crew/live` · 알림의 크루장 처리 대기)
  는 `ApiResponse<List<T>>` — data 에 배열이 바로 온다. 목록은 `openapi.yaml` 머리말이 정본이다.
  새 목록 API 는 예외를 늘리지 않는다.
- 시간은 `Instant` → ISO-8601 `Z` 고정. Jackson 전역 설정(global/config)이 보장하므로
  개별 `@JsonFormat` 을 붙이지 않는다.
- 필드 부재 vs null: 명세가 "키 자체를 내려주지 않는다" 고 한 곳(예: 오류 봉투의 `fields`)만
  그 필드에 `@JsonInclude(NON_NULL)`. 그 외에는 null 을 그대로 내려보낸다 — 전역 NON_NULL 금지
  (명세의 nullable 필드들이 사라져 버린다).

## 6. 에러 처리

- 코드 목록의 정본은 `openapi.yaml` 의 `components.responses.Error` 다. 늘리려면 openapi 부터
  고친다. `ErrorCode` enum 은 도메인을 세우며 이 목록에 맞춘다:

  | code | HTTP | 비고 |
  |---|---|---|
  | TOKEN_EXPIRED | 401 | 앱이 refresh 후 1회 재시도 |
  | INVALID_CREDENTIALS | 401 | 계정 존재 여부 비노출 — 없는 계정도 이 코드 |
  | FORBIDDEN | 403 | 크루장 전용 경로를 크루원이 부름 등 |
  | NO_CREW | 403 | `/crew/...` 를 소속 크루 없이 부름 |
  | LEADER_MUST_DELEGATE | 403 | 크루장이 위임 없이 나가려 함 |
  | NOT_FOUND | 404 | |
  | CONFLICT | 409 | |
  | EMAIL_TAKEN | 409 | 이메일 중복 |
  | NICKNAME_TAKEN | 409 | 닉네임 중복 |
  | CREW_NAME_TAKEN | 409 | 크루 이름 중복 |
  | ALREADY_IN_CREW | 409 | 이미 다른 크루 소속 |
  | VALIDATION | 422 | 앱은 재시도 금지 |
  | RATE_LIMITED | 429 | Retry-After 헤더 필수 |
  | INTERNAL | 500 | |

  계약에 없는 코드가 enum 에 둘 남아 있다 — `METHOD_NOT_ALLOWED`(405, 프레임워크가 내는 응답)와
  `MEET_FULL`(옛 모임 기능).

- 던지는 쪽은 `throw new BusinessException(ErrorCode.NOT_FOUND, "activity " + id)` 하나로
  통일. **도메인별 예외 클래스를 만들지 않는다** — 코드 enum 으로 충분하다.
- 받는 쪽은 `GlobalExceptionHandler`(@RestControllerAdvice) 한 곳. Bean Validation 실패
  (MethodArgumentNotValid·ConstraintViolation)와 enum 바인딩 실패 → VALIDATION 422,
  나머지 미처리 예외 → INTERNAL 500 + error 로그.
- message 는 개발자용 한 줄(한국어 OK).
- requestId: `RequestIdFilter` 가 요청마다 UUID 생성 → MDC(`requestId`) → 모든 로그 라인과
  에러 봉투에 같은 값. 컨트롤러·서비스는 이 값을 만질 일이 없다.

## 7. 검증

- 명세의 입력 상한을 **Bean Validation 으로 요청 DTO 에** 건다: 게시물 1000자 · 댓글 500자 ·
  채팅 500자 · 소개 200자 · 닉네임 2~12자 · 크루 이름 2~20자 · 공지 제목 100자·본문 3000자 ·
  신고 메모 500자 · 거리·시간·걸음수 ≥ 0. 값의 정본은 `openapi.yaml` 이다. 초과는 **자르지 말고 422**.
- `limit` 은 기본 20·최대 50, 51 이상이면 422 (조용히 clamp 하지 않는다 — 앱 버그를 숨기게 된다).
- 교차 필드 검증(endedAt ≥ startedAt 등)은 service 에서 하고 VALIDATION 으로 던진다.

## 8. 멱등 — 패턴 하나로 통일

앱 생성 UUID 리소스(미디어·활동·줍기·게시물·댓글·공지·채팅·신고)는 같은 id 재전송을
200 으로 흡수한다. 구현은 항상 이 순서다:

```java
// 리포지토리 — 충돌을 DB 가 조용히 삼킨다. 예외가 없으니 트랜잭션이 살아 있다.
@Modifying
@Query(value = """
    INSERT INTO posts (id, author_id, text, visibility, created_at)
    VALUES (:id, :authorId, :text, :visibility, :now)
    ON CONFLICT (id) DO NOTHING
    """, nativeQuery = true)
int insertIfAbsent(@Param("id") UUID id, /* … */);

// 서비스
int inserted = postRepository.insertIfAbsent(request.id(), me, /* … */);
if (inserted == 0) {                       // 이미 있다 = 재전송
  return getPost(request.id(), me);                // 흡수 — 200 (같은 서비스의 조회)
}
// 자식 행(post_media 등)은 inserted == 1 일 때만 저장한다
```

**`try { save } catch (DataIntegrityViolationException)` 로 쓰지 않는다.** PostgreSQL 은
문장 하나가 에러를 내면 트랜잭션 전체를 abort 상태로 만들어(`25P02`) catch 이후의 재조회
SELECT 까지 거부하고, 스프링도 rollback-only 를 마킹해 커밋 시 `UnexpectedRollbackException`
이 난다. 즉 흡수하려던 동시 요청이 그대로 500 이 된다 — **경합이 실제로 날 때만** 터지므로
개발 중에는 멀쩡해 보인다. `ON CONFLICT DO NOTHING` 은 애초에 예외를 만들지 않는다.

native INSERT 는 영속성 컨텍스트를 우회하므로, 같은 트랜잭션에서 그 행을 엔티티로 다시
읽어야 하면 `@Modifying(clearAutomatically = true)` 를 쓰거나 조회를 `facade/` 로 미룬다.

**예외:**

- **`POST /media`** — 응답의 `inference` 는 저장하지 않는 값이라(`docs/ERD.md` media)
  기존 행을 그대로 돌려주면 채울 원천이 없다. 재전송에도 **파일이 다시 실려 오므로**,
  media 행 INSERT 와 스토리지 업로드만 건너뛰고 **AI 추론은 매번 실행**해
  `MediaUploadResult.inference` 를 채운다. 멱등의 목적은 사진이 두 벌 생기지 않는 것이지
  추론을 아끼는 게 아니다 — 여기서 기존 값을 못 준다고 `UNAVAILABLE` 을 내려보내면
  앱은 "AI 서버 장애·재시도 금지" 로 읽어 사용자를 영구 수동 입력으로 밀어낸다.

## 9. 커서 페이지네이션

- keyset 방식: `(created_at, id)` DESC 복합 정렬, `WHERE (created_at, id) < (기준)`.
  OFFSET 페이지네이션 금지 — 새 글이 끼어들면 중복·누락이 난다.
- 커서 문자열은 `base64url("{epochMicros}:{uuid}")`. **불투명 계약** — 앱은 해석하지 않으므로
  서버는 형식을 언제든 바꿀 수 있다. 인코딩·디코딩은 global/response 의 유틸 한 곳에만 둔다.
- **시각은 마이크로초로 싣는다.** `created_at` 이 `timestamptz` 라 DB 해상도가 마이크로초인데
  커서를 밀리초로 자르면, 같은 밀리초 안에서 마이크로초만 다른 행이 위 `WHERE` 의 두 갈래를
  **모두** 탈락해(`< 기준` 도 `= 기준` 도 거짓) 페이지에서 조용히 사라진다. 예외가 나지 않아
  간헐적인 테스트 실패로만 드러난다.
- 채팅(`/crew/chat/messages`)만 의도적 예외 — `seq` 커서 `beforeSeq`·`afterSeq`
  (`docs/realtime.md`).

## 10. 트랜잭션

- 경계는 **서비스의 public 메서드**. 조회는 `@Transactional(readOnly = true)`.
  **파사드에는 `@Transactional` 을 붙이지 않는다** — 파사드가 트랜잭션을 열면 그 안에서
  외부 HTTP 를 부르게 되고, 아래 규칙이 무너진다.
- 타 도메인 서비스 호출은 기본 전파(REQUIRED)로 같은 트랜잭션에 합류한다 — 명세가 "같은
  트랜잭션에서" 라고 못 박은 것(활동 종료와 `crew_daily_stats` 적립 등)이 자연히 보장된다.
- **트랜잭션 안에서 외부 HTTP 를 부르지 않는다** (AI 서버·FCM·카카오·구글·스토리지).
  커넥션을 물고 수 초를 기다리게 되고, 실패해도 롤백해 줄 수 없다. 방향은 둘뿐이다:

**(가) 외부 호출 → 저장** — 파사드 `XxxFacade` 가 외부를 부르고, 결과를 **파라미터로**
서비스에 넘긴다. 서비스의 트랜잭션은 그때 처음 열린다:

```java
@Service                                   // ← @Transactional 없음
@RequiredArgsConstructor
public class MediaFacade {
  private final MediaStorage storage;                // client
  private final AiInferenceClient aiInferenceClient; // client
  private final MediaService mediaService;           // 서비스

  private MediaUploadResponse fresh(UUID me, UUID mediaId, byte[] file) {
    storage.store(objectKey, file);                                   // 트랜잭션 밖
    InferenceResponse inference = aiInferenceClient.infer(file);      // 트랜잭션 밖
    return response(mediaService.create(mediaId, me, objectKey, thumbKey), inference);
    //                ↑ 여기서 트랜잭션 시작·종료
  }
}
```

원자성이 필요한 쓰기는 언제나 서비스 메서드 **하나** 안에 있어야 한다.

> ⚠️ **같은 클래스 안에서 자기 메서드를 부르며 `@Transactional` 을 붙이지 않는다.**
> 프록시가 어노테이션을 무시해 저장이 문장 단위로 쪼개진다 — 컴파일도 되고 동작도 하므로
> **조용히 원자성만 사라진다.** 트랜잭션을 나누려면 반드시 다른 빈(서비스)으로 뺀다.

같은 모양이 소셜 로그인(`AuthFacade` — 토큰 검증 → 계정 생성)에 반복된다.

**Redis 도 같은 규칙을 받는다.** 활동 중 위치(`live_locations`)는 지금 테이블이고, 갱신이
잦아 Redis 로 옮길 수 있다(`docs/ERD.md`). 옮기면 Redis 조회는 트랜잭션 밖에서 먼저 하고 그
결과를 Postgres 쿼리에 넘긴다. Redis 만 건드리는 저장에는 `@Transactional` 을 붙이지 않는다.

**(나) 저장 → 커밋 후 발송** — 알림이 대표 사례다. notifications INSERT 는 본 트랜잭션,
FCM 발송은 `@TransactionalEventListener(phase = AFTER_COMMIT)`. 푸시가 유실돼도 알림 목록에는
남는다.

## 11. 로깅

- **로거는 Lombok `@Slf4j` 로 만든다.** `private static final Logger log =
  LoggerFactory.getLogger(...)` 를 손으로 쓰지 않는다 — 클래스 이름을 잘못 넣어도 컴파일되고,
  클래스를 옮기면 로거 이름만 옛 패키지에 남는다.
- slf4j + `{}` 파라미터. 문자열 결합·`System.out`·`e.printStackTrace()` 금지.
- 5xx 로 이어지는 예외는 error + 스택트레이스, 4xx 는 warn 한 줄 (스택트레이스 없이 —
  VALIDATION 422 가 콘솔을 도배하면 진짜 에러가 묻힌다).
- 로그에 이메일·좌표·토큰·본문 텍스트를 남기지 않는다. id 로만 말한다.

## 12. 테스트

| 종류 | 도구 | 범위 | 도는 곳 |
|---|---|---|---|
| 단위 | JUnit5 + Mockito, Spring 없이 | service 비즈니스 규칙 — 머지 게이트의 본체 | `test` |
| 리포지토리·통합 | `@SpringBootTest` + Testcontainers(PostGIS + Redis) | 쿼리·마이그레이션·멱등 동시성 | `@Tag("docker")` — `test` 에서는 제외, `dockerTest` 로 돈다 |
| 계약 | SpringDoc 산출물 ↔ `docs/openapi.yaml` 대조 | 경로와 메서드 누락 | `dockerTest` |
| 구조 | ArchUnit | 아래 — 레이어 `L0~L4` · 경계 `R2~R4` | `test` |
| 커버리지 | JaCoCo | 목표 80% — 서비스·도메인 규칙 중심. 설정·DTO·생성 코드는 의미 없다 | `jacocoTestReport` |

**커버리지는 `test` 와 `dockerTest` 를 합산해야 한다.** 둘이 나뉘어 있어(위) exec 파일도
둘로 나온다. 한쪽만 읽으면 통합 테스트로만 덮이는 코드 — PostGIS 쿼리·advisory lock·멱등
동시성 — 이 전부 0% 로 나온다. `build.gradle` 의 `jacocoTestReport` 가 `build/jacoco/*.exec`
를 전부 모으는 이유다. 로컬에서 숫자를 보려면 `./gradlew test dockerTest jacocoTestReport`
순으로 돌린다. **`test` 만 돌리고 리포트를 읽으면 미달로 보인다.**

게이트는 아직 걸지 않았다. CI 가 생겨 `test` 와 `dockerTest` 를 다른 잡으로 돌리면, 게이트를
한쪽에만 걸었을 때 합산 전 수치로 거짓 미달이 난다 — 두 잡의 exec 를 모은 뒤 건다.
CI 는 아직 없다(`docs/conventions.md` §CI).

### "통과했다" 고 말하기 전에

**PR 을 올리거나 검증을 보고할 때는 `--rerun-tasks --no-build-cache` 로 한 번 더 돌린다.**

Gradle 캐시는 `BUILD SUCCESSFUL` 을 아무것도 실행하지 않고 내준다. 워크트리를 옮겨 다니면
다른 워크트리가 올린 캐시를 읽어 `:test FROM-CACHE` 로 끝난다 — **실패가 아니라 성공으로
보이므로 눈치채기 어렵다.**

판별은 **실행 시간**이다. backend 의 `test` + `dockerTest` 는 Testcontainers 를 띄우므로
1분은 넘게 걸린다. 같은 명령이 10여 초에 끝났으면 안 돈 것이다.

로그의 `BUILD SUCCESSFUL` 대신 **`build/test-results/**/*.xml` 의 `tests`·`failures` 를
세는 편이 확실하다.** 그 XML 은 "마지막으로 실제 실행된 것" 의 기록이라, 방금 돌리지 않았어도
남아 있다 — 그래서 XML 만 봐도 안 되고, 실행 시간과 함께 봐야 한다.

구조·계약 검사는 각각 **한 클래스**다. 같은 목적의 테스트가 두 벌 들어와 한쪽만 도는 일이
실제로 있었다.

| 검사 | 클래스 | 도는 곳 |
|---|---|---|
| 구조 | `server/architecture/ArchitectureTest` | `./gradlew test` |
| 계약 | `server/contract/OpenApiContractTest` | `./gradlew dockerTest` — `IntegrationTest` 를 상속해 `@Tag("docker")` 다 |

> ⚠️ **계약 검사는 `./gradlew test` 로 돌지 않는다.** `test` 는 `excludeTags 'docker'` 다.
> `backend` 를 바꿨으면 로컬에서 `./gradlew test dockerTest` 를 둘 다 돌린다.

계약 검사의 역방향("계약의 경로가 전부 구현됐는가")도 켜져 있다. `OpenApiContractTest` 에
`@Disabled` 는 하나도 없다 — 계약에 경로를 더하고 구현하지 않으면 여기서 걸린다.

> ⚠️ `OpenApiContractTest` 는 아직 `docs/openapi-admin.yaml` 도 읽는다. 관리자 웹은 범위 밖이라
> 그 파일이 이 저장소에 없어 관련 검사가 실패한다 — 테스트에서 관리자 계약을 걷어 낼 대상이다.

> 다시 `@Disabled` 를 쓸 일이 생기면 **클래스가 아니라 메서드에 건다.** 클래스에 걸면 같은
> 클래스의 라이브 검사까지 스킵되고, 스킵된 테스트는 통과로 보인다.

규칙은 **레이어(L)** 와 **경계(R)** 두 묶음이다. 레이어는 도메인 **안**의 의존 방향을,
경계는 도메인 **사이**와 global 을 본다. 규칙마다의 이유는 `01-구조.md` §5, 여기는 테스트 코드다.

```java
String CONTROLLER = "..domain.*.controller..";
String FACADE     = "..domain.*.facade..";
String SERVICE    = "..domain.*.service..";
String REPOSITORY = "..domain.*.repository..";
String ENTITY     = "..domain.*.entity..";
String CLIENT     = "..domain.*.client..";
String EVENT      = "..domain.*.event..";

// L0 — repository 가 있는 도메인은 controller 도 있다 (아래 주의 참고)
// L1 — controller 는 repository 를 직접 부르지 않는다 / 엔티티를 노출하지 않는다
noClasses().that().resideInAPackage(CONTROLLER).should().dependOnClassesThat().resideInAPackage(REPOSITORY);
noClasses().that().resideInAPackage(CONTROLLER).should().dependOnClassesThat().resideInAPackage(ENTITY);
// L2 — 안쪽은 바깥을 모른다 / L2b — facade 는 엔티티를 모른다
noClasses().that().resideInAnyPackage(SERVICE, ENTITY)
    .should().dependOnClassesThat().resideInAnyPackage(CONTROLLER, FACADE);
noClasses().that().resideInAPackage(FACADE).should().dependOnClassesThat().resideInAPackage(ENTITY);
// L3 — client 는 트랜잭션 밖(facade·커밋 후 event 리스너)에서만 부른다 (§10)
classes().that().resideInAPackage(CLIENT)
    .should().onlyHaveDependentClassesThat().resideInAnyPackage(FACADE, EVENT, CLIENT);
// L3b — entity 는 repository·client 를 모른다
noClasses().that().resideInAPackage(ENTITY)
    .should().dependOnClassesThat().resideInAnyPackage(REPOSITORY, CLIENT);
// L4 — repository·client 는 controller 를 모른다
noClasses().that().resideInAnyPackage(REPOSITORY, CLIENT)
    .should().dependOnClassesThat().resideInAPackage(CONTROLLER);

// R2 — 타 도메인의 repository·client·entity 에 손대지 않는다.
//      필드뿐 아니라 지역변수·파라미터·반환 타입까지 본다 — 들고 다니기만 해도 경계가 무너진다.
//      도메인 이름을 하드코딩하지 않고 domain.<X> 세그먼트를 뽑아 비교한다 (새 도메인이 생겨도 안 고친다).
//      두 가지는 위반이 아니다: QueryDSL 이 엔티티 옆에 만드는 Q 클래스, 엔티티 패키지의 enum.
classes().that().resideInAPackage("..domain..").should(notReachIntoOtherDomain("repository"));
classes().that().resideInAPackage("..domain..").should(notReachIntoOtherDomain("client"));
classes().that().resideInAPackage("..domain..").should(notReachIntoOtherDomain("entity"));
// R3 — global 은 domain 을 모른다
noClasses().that().resideInAPackage("..global..")
    .should().dependOnClassesThat().resideInAPackage("..domain..");
// R4 — facade 는 facade 를 주입하지 않고 트랜잭션도 열지 않는다 (§10).
//      @Transactional 은 보통 **메서드**에 붙으므로 noMethods 로도 함께 검사한다 —
//      noClasses().should().beAnnotatedWith() 는 클래스 레벨만 본다.
noClasses().that().resideInAPackage(FACADE)
    .should().dependOnClassesThat().resideInAPackage(FACADE);
noClasses().that().resideInAPackage(FACADE).should().beAnnotatedWith(Transactional.class);
noMethods().that().areDeclaredInClassesThat().resideInAPackage(FACADE)
    .should().beAnnotatedWith(Transactional.class);
```

> ⚠️ **ArchUnit 은 바이트코드에 남는 의존만 본다.** 메서드 **지역 변수**의 제네릭
> (`List<Crew>`)과 람다 안의 참조는 타입 소거로 사라져 어떤 규칙으로도 잡히지
> 않는다. 필드·파라미터·반환 타입·메서드 호출은 잡힌다. 그래서 L1 이 초록이어도
> "컨트롤러 지역 변수에 엔티티가 없다" 는 보장은 아니다 — 그 구간은 리뷰 몫이다(§15).

> ⚠️ **`allowEmptyShould(true)` 를 붙이지 않는다.** 규칙이 패키지 **이름**으로 매칭하므로,
> 패키지를 옮기면 매칭 0 건이 되고 이 옵션이 켜져 있으면 **실패 없이 초록으로 통과한다.**
> 경계를 강화하려던 리팩터링이 경계 검사기를 껍데기로 만드는 경로가 이것이다. 붙이지 않으면
> ArchUnit 이 "검사 대상이 없다" 로 실패해 준다. `L0` 은 같은 사고를 한 번 더 막는 장치다 —
> `repository` 를 가진 도메인이 실제로 있는지, 그 도메인이 `controller` 도 갖는지 직접 센다.

**R4 는 클래스 이름이 아니라 패키지로 판정한다.** 예전에는 `haveSimpleNameEndingWith(
"QueryService")` 로 봤는데, 이름 규칙은 새 클래스가 규칙을 우회하기 쉽다 — `CrewAssembler`
같은 이름을 지으면 그냥 빠져나간다. `facade/` 에 두는 것이 곧 파사드라는 선언이다.

**서비스 그래프의 순환은 ArchUnit 으로 검사하지 않는다** — 생성자 주입 순환은 Spring
기동 자체를 `BeanCurrentlyInCreationException` 으로 실패시키므로, 컨텍스트를 띄우는 통합
테스트 하나가 이미 그 역할을 한다. 규칙이 아니라 증상으로 잡히는 쪽이 확실하다.

> ⚠️ **`slices().beFreeOfCycles()` 를 추가하지 않는다.** R2 는 타 도메인의 enum·Q클래스·dto
> 공유와 조회 JOIN 을 허용한다(예: `media` 의 `AiInferenceClient` 가 `activity` 의 `Category`
> enum 을 쓴다). 그래서 패키지 순환은 생기는 것이 정상이고, 이 규칙은 빨간불이 될 수밖에 없다.
> 막아야 하는 빈 주입 순환은 위대로 기동 실패로 잡힌다.

- 시간이 걸린 로직(주간 통계·토큰 만료)은 `Clock` 을 주입받아 테스트에서
  고정한다. `Instant.now()` 직접 호출 금지 — `clock` 경유.

## 13. DB 마이그레이션

- Flyway `V{번호}__{설명}.sql` (번호는 정수 증가, 설명은 영문 소문자 스네이크).
  예: `V2__add_notice_pins.sql`.
- **적용된 마이그레이션 파일은 수정 금지** — 고칠 게 있으면 다음 번호로.
- JPA `ddl-auto: validate` 고정. 스키마의 정본은 마이그레이션이고 `docs/ERD.md` 가 설명서다 —
  테이블을 바꾸면 둘 다 바꾼다.

## 14. 설정

- **의존성은 `gradle.lockfile` 로 잠근다.** 런타임 좌표가 300 개를 넘어 잠금이 없으면 같은
  커밋이 시점에 따라 다른 트리로 빌드된다. 의존성을 바꿨으면
  `./gradlew dependencies --write-locks` 를 돌리고 **lockfile 을 diff 에 포함해 올린다** —
  전이 의존성이 무엇을 끌고 왔는지 리뷰에서 보이는 유일한 자리다.
- `application.yml` + 프로필 `local` / `prod`(운영. yml 에 따로 절은 없고 `@Profile` 로 빈을 고른다 — 예: 메일 발송). 시크릿(DB 비밀번호·Redis 비밀번호·JWT 개인키·
  카카오·구글 키·FCM 키)은 전부 환경변수 — yml 에 값을 적지 않는다. 키 목록은 `docs/operations.md`.
- Redis 는 로컬 개발에서도 필요하다 — Postgres 와 함께 띄운다(`local` 프로필이 가리키는 주소).
  Testcontainers 통합 테스트도 Redis 컨테이너를 함께 띄운다.
- 매직 넘버가 된 정책 수치(토큰 수명, 서명 URL 6시간, 일일 업로드 한도, 외부 호출 타임아웃)는
  `@ConfigurationProperties` 로 모아 yml 에 둔다 —
  코드 곳곳에 숫자가 흩어지면 명세 변경 시 하나를 놓친다.

## 15. 리뷰 등급과 금지 목록

리뷰 지적에는 등급을 붙인다. 등급이 없으면 "고쳐 주세요" 가 막는 것인지 제안인지 사람마다
다르게 읽는다.

| 등급 | 뜻 | 처리 |
|---|---|---|
| **CRITICAL** | 보안 결함·데이터 유실·**계약 파괴** | **머지 차단.** 고치기 전엔 승인하지 않는다 |
| **HIGH** | 버그이거나 아래 금지 목록에 해당 | 머지 전 수정. 예외를 두려면 PR 에 근거를 남긴다 |
| **MEDIUM** | 유지보수성 — 책임 과다·중복·이름 | 고치면 좋다. 다음 PR 로 미뤄도 된다 |
| **LOW** | 취향·사소한 제안 | 선택. Spotless 가 잡는 포맷은 아예 언급하지 않는다(§1) |

**계약 파괴가 CRITICAL 인 이유** — `openapi.yaml` 의 필드를 더하거나 철자·`nullable` 을 바꾸면
앱의 파싱이 깨진다. 서버는 200 을 내려보내므로 로그에도 안 남고, 사용자 화면에서만 빈다.

### 보안 리뷰 트리거 — 여기 닿으면 멈추고 점검한다

아래를 건드리는 변경은 리뷰를 통과시키기 전에 별도로 본다.

- 인증·인가 (`global/security`, `AuthService`, 크루장 대조 `crews.leader_id`)
- 사용자 입력이 쿼리에 닿는 경로 — 특히 native SQL 과 `JdbcClient` 의 동적 SQL
- 파일 경로·업로드 (`media` 도메인, `app.media.root` 아래 쓰기)
- 외부 시스템 호출 (`client/`)
- 서명·해시·토큰 (`MediaSignedUrl`, `OpaqueToken`, 크루 초대 코드, JWT)
- 개인정보가 응답이나 로그에 실리는 곳

점검 항목은 §14 의 시크릿 규칙, §11 의 로그 금지 항목, 그리고 파라미터 바인딩 사용 여부다.

### 금지 목록 — 걸리면 HIGH 이상

1. 엔티티에 `@Setter`·`@Data` / `controller` 에서 `repository` 직접 호출 (L1) /
   서비스가 `client` 참조 (L3) / **타 도메인 테이블에 쓰기·타 도메인
   repository·client 주입·타 도메인 엔티티를 필드나 반환 타입으로 사용** (R2 — 조회 JOIN 은 허용)
2. 엔티티를 컨트롤러 응답으로 반환 (L1) — `controller` 는 `entity` 를 모른다
3. 전역 `@JsonInclude(NON_NULL)` (§5)
4. OFFSET 페이지네이션 (§9)
5. 트랜잭션 안 외부 HTTP / 파사드에 `@Transactional` / **같은 클래스 자기호출에 붙인
   `@Transactional`** (§10)
6. 멱등을 `try { save } catch (DataIntegrityViolationException)` 으로 구현 (§8)
7. `Instant.now()`·`LocalDate.now()` 직접 호출 — `Clock` 주입 (§12)
8. 적용된 Flyway 파일 수정 (§13)
9. 시크릿·정책 수치 하드코딩 (§14)
10. `Optional.get()` — `orElseThrow(() -> new BusinessException(NOT_FOUND, …))` 로
11. 명세에 없는 응답 필드 추가·철자 변경 — openapi.yaml 부터 고치고 앱 팀과 합의.
    **필드의 `nullable` 변경도 같다** — 소비자의 타입이 바뀐다
