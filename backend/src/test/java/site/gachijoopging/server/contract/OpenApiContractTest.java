package site.gachijoopging.server.contract;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.MissingNode;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.TreeMap;
import java.util.TreeSet;
import java.util.UUID;
import java.util.stream.Collectors;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.test.web.servlet.MockMvc;
import org.yaml.snakeyaml.Yaml;
import site.gachijoopging.server.global.config.WebConfig;
import site.gachijoopging.server.support.IntegrationTest;
import site.gachijoopging.server.support.TestAccounts;
import site.gachijoopging.server.support.TestAccounts.TestAccount;

@AutoConfigureMockMvc
class OpenApiContractTest extends IntegrationTest {

  private static final Path 모바일_계약 = Path.of("..", "docs", "openapi.yaml");

  private static final Map<String, String> 계약_밖_경로 =
      Map.of("GET /health", "앱이 부르지 않는다 — 서버 상태는 /actuator/health 로 본다 (docs/operations.md)");

  // 구현되면 이 표에서 지운다
  private static final Map<String, String> 미구현_연산 =
      Map.ofEntries(
          Map.entry("DELETE /users/me", "GAC-73"),
          Map.entry("GET /agreements", "GAC-82"),
          Map.entry("GET /users/me/agreements", "GAC-82"),
          Map.entry("PUT /users/me/agreements", "GAC-82"),
          Map.entry("GET /crew/posts", "GAC-91"),
          Map.entry("POST /crew/posts", "GAC-91"),
          Map.entry("GET /posts/{postId}", "GAC-91"),
          Map.entry("DELETE /posts/{postId}", "GAC-91"),
          Map.entry("PUT /posts/{postId}/like", "GAC-91"),
          Map.entry("DELETE /posts/{postId}/like", "GAC-91"),
          Map.entry("GET /crew/members/{userId}/posts", "GAC-91"),
          Map.entry("GET /posts/{postId}/comments", "GAC-92"),
          Map.entry("POST /posts/{postId}/comments", "GAC-92"),
          Map.entry("DELETE /comments/{commentId}", "GAC-92"),
          Map.entry("GET /crew/notices", "GAC-93"),
          Map.entry("POST /crew/notices", "GAC-93"),
          Map.entry("GET /notices/{noticeId}", "GAC-93"),
          Map.entry("PATCH /notices/{noticeId}", "GAC-93"),
          Map.entry("DELETE /notices/{noticeId}", "GAC-93"),
          Map.entry("POST /notices/{noticeId}/comments", "GAC-93"),
          Map.entry("DELETE /notice-comments/{commentId}", "GAC-93"),
          Map.entry("GET /notifications", "GAC-95"),
          Map.entry("POST /notifications/read", "GAC-95"),
          Map.entry("GET /notifications/unread-count", "GAC-95"),
          Map.entry("PUT /users/{userId}/follow", "GAC-95"),
          Map.entry("DELETE /users/{userId}/follow", "GAC-95"),
          Map.entry("GET /users/me/blocked", "GAC-96"),
          Map.entry("PUT /users/{userId}/block", "GAC-96"),
          Map.entry("DELETE /users/{userId}/block", "GAC-96"),
          Map.entry("POST /reports", "GAC-96"),
          Map.entry("GET /crew/reports", "GAC-96"),
          Map.entry("POST /crew/reports/{reportId}", "GAC-96"),
          Map.entry("GET /crew/export", "GAC-97"),
          Map.entry("GET /crew/chat/messages", "GAC-50"),
          Map.entry("PUT /crew/chat/read", "GAC-50"));

  private static final Map<String, String> 미구현_스키마 =
      Map.of(
          "AgreementCatalog", "GAC-82",
          "Agreements", "GAC-82",
          "Post", "GAC-91",
          "Comment", "GAC-92",
          "Notice", "GAC-93",
          "Notification", "GAC-95",
          "Report", "GAC-96",
          "ChatMessage", "GAC-50");

  private static JsonNode 산출물_문서;

  @Autowired private MockMvc mockMvc;
  @Autowired private ObjectMapper objectMapper;

  @Test
  void 서버가_서비스하는_경로는_전부_계약에_있다() throws Exception {
    Set<String> 계약 = 계약의_경로와_메서드(모바일_계약);
    Set<String> 산출물 = 산출물의_경로와_메서드();
    산출물.removeAll(계약_밖_경로.keySet());

    assertThat(산출물).isNotEmpty();
    assertThat(산출물)
        .as("openapi.yaml 에 없는 경로를 서버가 서비스하고 있다 — 계약부터 고치고 앱 팀과 합의한다 (02-conventions §15-11)")
        .allSatisfy(경로 -> assertThat(계약).contains(경로));
  }

  @Test
  void 인증된_사용자_id_가_쿼리_파라미터로_새지_않는다() throws Exception {
    JsonNode paths = 산출물().path("paths");

    List<String> 샌_것 = new ArrayList<>();
    for (Map.Entry<String, JsonNode> path : paths.properties()) {
      for (Map.Entry<String, JsonNode> method : path.getValue().properties()) {
        for (JsonNode parameter : method.getValue().path("parameters")) {
          String 이름 = parameter.path("name").asText();
          if ("query".equals(parameter.path("in").asText())
              && (이름.equals("userId") || 이름.equals("me"))) {
            샌_것.add(method.getKey() + " " + path.getKey() + " ?" + 이름);
          }
        }
      }
    }

    assertThat(샌_것).isEmpty();
  }

  @Test
  void 모바일_openapi_경로가_모두_구현되어_있다() throws Exception {
    Set<String> 빠진_것 = 계약의_경로와_메서드(모바일_계약);
    빠진_것.removeAll(산출물의_경로와_메서드());

    assertThat(빠진_것)
        .as("계약에 있는데 서버가 서비스하지 않는 연산이 미구현_연산 표와 다르다 — 구현했으면 표에서 지우고, 아니면 담당 이슈와 함께 적는다")
        .isEqualTo(new TreeSet<>(미구현_연산.keySet()));
  }

  private static final Map<String, String> 모바일_스키마_매핑 =
      Map.ofEntries(
          Map.entry("Activity", "ActivityResponse"),
          Map.entry("ActivityCard", "ActivityCardResponse"),
          Map.entry("ActivitySummary", "ActivitySummaryResponse"),
          Map.entry("Bbox", "BboxResponse"),
          Map.entry("Crew", "CrewResponse"),
          Map.entry("CrewStats", "CrewStatsResponse"),
          Map.entry("CrewSummary", "CrewSummaryResponse"),
          Map.entry("Home", "HomeResponse"),
          Map.entry("Item", "ItemResponse"),
          Map.entry("ItemInput", "ItemInput"),
          Map.entry("JoinRequest", "JoinRequestResponse"),
          Map.entry("LiveMember", "LiveMemberResponse"),
          Map.entry("Me", "MeResponse"),
          Map.entry("MediaResult", "MediaUploadResponse"),
          Map.entry("Member", "MemberResponse"),
          Map.entry("MemberProfile", "MemberProfileResponse"),
          Map.entry("MemberStats", "MemberStatsResponse"),
          Map.entry("UserBrief", "UserBriefResponse"));

  private static final Map<String, String> 모바일_대조_제외 =
      Map.of(
          "Category",
              "enum — properties 가 없어 필드·nullable 축이 성립하지 않는다."
                  + " 값은 이것을 $ref 하는 객체 스키마의 필드에서 대조된다",
          "JoinPolicy", "enum — 같은 이유",
          "Region", "enum — 같은 이유");

  @ParameterizedTest(name = "{0} ↔ {1}")
  @MethodSource("모바일_스키마_쌍")
  void 모바일_스키마가_필드_nullable_enum_타입까지_계약과_산출물에서_같다(String 계약_이름, String 산출물_이름) throws Exception {
    Map<String, Object> 계약 = 계약_스키마(모바일_계약, 계약_이름);
    JsonNode 문서 = 산출물();
    JsonNode 산출물 = 문서.path("components").path("schemas").path(산출물_이름);

    assertThat(산출물.isMissingNode()).as("산출물에 %s 스키마가 없다 — DTO 이름이 바뀌었는지 본다", 산출물_이름).isFalse();

    assertThat(산출물의_필드(산출물)).as("계약과 산출물의 %s 필드가 다르다", 계약_이름).isEqualTo(계약의_필드(계약));

    assertThat(산출물의_nullable(산출물))
        .as("계약과 산출물의 %s nullable 이 다르다 — DTO 의 @Schema(nullable = true) 를 맞춘다", 계약_이름)
        .isEqualTo(계약의_nullable(계약));

    assertThat(산출물의_enum값(산출물))
        .as("계약과 산출물의 %s enum 값이 다르다 — DTO 를 enum 타입으로 두거나 @Schema(allowableValues) 를 맞춘다", 계약_이름)
        .isEqualTo(계약의_enum값(모바일_계약, 계약_이름));

    Map<String, 필드_타입> 계약_타입 = 계약의_타입자리(모바일_계약, 계약_이름);
    Map<String, 필드_타입> 산출물_타입 = 산출물의_타입자리(문서, 산출물);

    assertThat(타입만(산출물_타입))
        .as("계약과 산출물의 %s 필드 타입이 다르다 — DTO 의 자바 타입을 계약에 맞춘다", 계약_이름)
        .isEqualTo(타입만(계약_타입));

    assertThat(format이_어긋난_자리(계약_이름, 계약_타입, 산출물_타입))
        .as("계약과 산출물의 %s format 이 다르다.%n뺀 자리와 사유:%n%s", 계약_이름, 사유_목록(format_대조_제외))
        .isEqualTo(format_제외된_자리(계약_이름));
  }

  static Stream<Arguments> 모바일_스키마_쌍() {
    return 모바일_스키마_매핑.entrySet().stream()
        .sorted(Map.Entry.comparingByKey())
        .map(e -> Arguments.of(e.getKey(), e.getValue()));
  }

  @Test
  void 모바일_계약의_모든_스키마가_대조_표에_있거나_제외되어_있다() throws Exception {
    Set<String> 다룬_것 = new TreeSet<>(모바일_스키마_매핑.keySet());
    다룬_것.addAll(모바일_대조_제외.keySet());
    다룬_것.addAll(미구현_스키마.keySet());

    assertThat(new TreeSet<>(계약_schemas(모바일_계약).keySet()))
        .as("계약에 스키마가 늘었다 — 모바일_스키마_매핑 에 대응을 적거나 모바일_대조_제외 에 사유를 적는다.%n지금 빠져 있는 것:%n%s", 제외_사유())
        .isEqualTo(다룬_것);
  }

  private static String 제외_사유() {
    return 사유_목록(모바일_대조_제외);
  }

  private static String 사유_목록(Map<String, String> 제외) {
    return 제외.entrySet().stream()
        .sorted(Map.Entry.comparingByKey())
        .map(e -> "  - " + e.getKey() + ": " + e.getValue())
        .collect(Collectors.joining(System.lineSeparator()));
  }

  @Test
  void 모바일_계약의_이름_붙은_enum_은_전부_값이_대조된다() throws Exception {
    assertThat(대조되는_이름_붙은_enum(모바일_계약, 모바일_스키마_매핑.keySet()))
        .as("모바일 계약의 이 enum 을 아무 객체 스키마도, 아무 경로도 부르지 않아 값이 대조되지 않는다")
        .isEqualTo(계약의_이름_붙은_enum(모바일_계약));
  }

  private static Set<String> 대조되는_이름_붙은_enum(Path 계약_문서, Set<String> 표의_계약_이름) throws Exception {
    Set<String> 결과 = new TreeSet<>(값이_대조되는_enum(계약_문서, 표의_계약_이름));
    구현된_경로_enum(계약_문서).stream().map(경로_enum자리::이름붙은enum).filter(Objects::nonNull).forEach(결과::add);
    return 결과;
  }

  private record 경로_enum자리(
      String 메서드, String 경로, List<String> 단계, List<String> 값, String 이름붙은enum) {

    String 연산() {
      return 메서드 + " " + 경로;
    }

    @Override
    public String toString() {
      return 연산() + " " + String.join(".", 단계).replace(".[]", "[]");
    }
  }

  private static final Set<String> 모바일_경로_enum_자리 =
      Set.of(
          "GET /crew/posts ?scope",
          "GET /crew/stats ?range",
          "GET /crews ?region",
          "PATCH /activities/{id}/items/{itemId} body.category",
          "PATCH /crew body.joinPolicy",
          "PATCH /crew body.region",
          "POST /crew/join-requests/{requestId} body.decision",
          "POST /crew/posts body.visibility",
          "POST /crew/reports/{reportId} body.result",
          "POST /crews body.joinPolicy",
          "POST /crews body.region",
          "POST /media body.purpose",
          "POST /reports body.reason",
          "POST /reports body.targetType",
          "PUT /users/me/agreements body.items[].type",
          "PUT /users/me/devices body.platform",
          "PUT /users/me/social body.provider");

  static Stream<Arguments> 모바일_경로_enum() throws Exception {
    return 구현된_경로_enum(모바일_계약).stream().map(Arguments::of);
  }

  private static List<경로_enum자리> 구현된_경로_enum(Path 계약_문서) throws Exception {
    return 계약의_경로_enum(계약_문서).stream().filter(자리 -> !미구현_연산.containsKey(자리.연산())).toList();
  }

  @ParameterizedTest(name = "{0}")
  @MethodSource("모바일_경로_enum")
  void 모바일_경로의_enum_값이_계약과_산출물에서_같다(경로_enum자리 자리) throws Exception {
    assertThat(산출물의_경로_enum값(WebConfig.API_BASE_PATH, 자리))
        .as("계약과 산출물의 %s enum 값이 다르다 — 파라미터·DTO 를 enum 타입으로 두거나 @Schema(allowableValues) 를 맞춘다", 자리)
        .isEqualTo(자리.값());
  }

  @Test
  void 모바일_계약의_경로_enum_자리가_전부_대조된다() throws Exception {
    assertThat(경로_enum_자리이름(모바일_계약))
        .as("모바일 계약의 경로 enum 자리가 달라졌다 — 모바일_경로_enum_자리 를 맞춘다")
        .isEqualTo(new TreeSet<>(모바일_경로_enum_자리));
  }

  private static Set<String> 경로_enum_자리이름(Path 계약_문서) throws Exception {
    return 계약의_경로_enum(계약_문서).stream()
        .map(경로_enum자리::toString)
        .collect(Collectors.toCollection(TreeSet::new));
  }

  @SuppressWarnings("unchecked")
  private static List<경로_enum자리> 계약의_경로_enum(Path 계약_문서) throws Exception {
    Map<String, Object> 문서 = 계약_문서_전체(계약_문서);
    List<경로_enum자리> 결과 = new ArrayList<>();
    ((Map<String, Map<String, Object>>) 문서.get("paths"))
        .forEach(
            (경로, 항목) ->
                항목.forEach(
                    (키, 값) -> {
                      if (HTTP_메서드인가(키)) {
                        경로_연산을_걷는다(문서, 키.toUpperCase(), 경로, (Map<String, Object>) 값, 결과);
                      }
                    }));
    결과.sort(Comparator.comparing(경로_enum자리::toString));
    return List.copyOf(결과);
  }

  @SuppressWarnings("unchecked")
  private static void 경로_연산을_걷는다(
      Map<String, Object> 문서, String 메서드, String 경로, Map<String, Object> 연산, List<경로_enum자리> 결과) {
    for (Object 항목 : (List<Object>) 연산.getOrDefault("parameters", List.of())) {
      Map<String, Object> 파라미터 = 계약_참조를_푼다(문서, (Map<String, Object>) 항목);
      스키마를_걷는다(
          문서,
          (Map<String, Object>) 파라미터.get("schema"),
          List.of("?" + 파라미터.get("name")),
          메서드,
          경로,
          결과);
    }
    Map<String, Object> 요청 = (Map<String, Object>) 연산.get("requestBody");
    if (요청 != null) {
      스키마를_걷는다(문서, 계약의_본문_스키마(요청), List.of("body"), 메서드, 경로, 결과);
    }
    ((Map<String, Object>) 연산.getOrDefault("responses", Map.of()))
        .forEach(
            (코드, 응답) ->
                스키마를_걷는다(
                    문서,
                    계약의_본문_스키마(계약_참조를_푼다(문서, (Map<String, Object>) 응답)),
                    List.of(코드),
                    메서드,
                    경로,
                    결과));
  }

  @SuppressWarnings("unchecked")
  private static Map<String, Object> 계약의_본문_스키마(Map<String, Object> 블록) {
    Map<String, Map<String, Object>> content = (Map<String, Map<String, Object>>) 블록.get("content");
    if (content == null || content.isEmpty()) {
      return null;
    }
    return (Map<String, Object>) content.values().iterator().next().get("schema");
  }

  @SuppressWarnings("unchecked")
  private static void 스키마를_걷는다(
      Map<String, Object> 문서,
      Map<String, Object> 스키마,
      List<String> 단계,
      String 메서드,
      String 경로,
      List<경로_enum자리> 결과) {
    if (스키마 == null) {
      return;
    }
    if (스키마.get("$ref") instanceof String ref) {
      Map<String, Object> 대상 = 문서에서_찾는다(문서, ref);
      if (대상.get("enum") instanceof List<?> 값) {
        결과.add(new 경로_enum자리(메서드, 경로, 단계, 계약의_enum_목록(값), ref.substring(ref.lastIndexOf('/') + 1)));
      }
      return;
    }
    if (스키마.get("enum") instanceof List<?> 값) {
      결과.add(new 경로_enum자리(메서드, 경로, 단계, 계약의_enum_목록(값), null));
      return;
    }
    ((Map<String, Map<String, Object>>) 스키마.getOrDefault("properties", Map.of()))
        .forEach((필드, 속성) -> 스키마를_걷는다(문서, 속성, 단계에_더한다(단계, 필드), 메서드, 경로, 결과));
    스키마를_걷는다(문서, (Map<String, Object>) 스키마.get("items"), 단계에_더한다(단계, "[]"), 메서드, 경로, 결과);
    for (Object 조각 : (List<Object>) 스키마.getOrDefault("allOf", List.of())) {
      스키마를_걷는다(문서, (Map<String, Object>) 조각, 단계, 메서드, 경로, 결과);
    }
  }

  private static List<String> 계약의_enum_목록(List<?> 값) {
    return 값.stream().map(String::valueOf).filter(항목 -> !"null".equals(항목)).toList();
  }

  private static List<String> 단계에_더한다(List<String> 단계, String 칸) {
    return Stream.concat(단계.stream(), Stream.of(칸)).toList();
  }

  private static Map<String, Object> 계약_참조를_푼다(Map<String, Object> 문서, Map<String, Object> 노드) {
    return 노드.get("$ref") instanceof String ref ? 문서에서_찾는다(문서, ref) : 노드;
  }

  @SuppressWarnings("unchecked")
  private static Map<String, Object> 문서에서_찾는다(Map<String, Object> 문서, String ref) {
    Map<String, Object> 현재 = 문서;
    for (String 칸 : ref.substring("#/".length()).split("/")) {
      현재 = (Map<String, Object>) 현재.get(칸);
    }
    return 현재;
  }

  @SuppressWarnings("unchecked")
  private static Map<String, Object> 계약_문서_전체(Path 계약_문서) throws Exception {
    try (var reader = Files.newBufferedReader(계약_문서)) {
      return (Map<String, Object>) new Yaml().load(reader);
    }
  }

  private List<String> 산출물의_경로_enum값(String 접두사, 경로_enum자리 자리) throws Exception {
    JsonNode 산출물 = 산출물();
    JsonNode 연산 = 산출물.path("paths").path(접두사 + 자리.경로()).path(자리.메서드().toLowerCase());
    List<String> 단계 = 자리.단계();
    String 앵커 = 단계.get(0);
    JsonNode 노드;
    if (앵커.startsWith("?")) {
      노드 = 산출물의_파라미터_스키마(연산, 앵커.substring(1));
    } else if ("body".equals(앵커) && multipart_필드인가(연산, 단계)) {
      노드 = 산출물의_파라미터_스키마(연산, 단계.get(1));
      단계 = List.of(앵커);
    } else if ("body".equals(앵커)) {
      노드 = 산출물의_본문_스키마(연산.path("requestBody"));
    } else {
      노드 = 산출물의_본문_스키마(연산.path("responses").path(앵커));
    }
    for (String 칸 : 단계.subList(1, 단계.size())) {
      JsonNode 푼_것 = 산출물_참조를_푼다(산출물, 노드);
      노드 = "[]".equals(칸) ? 푼_것.path("items") : 푼_것.path("properties").path(칸);
    }
    List<String> 결과 = new ArrayList<>();
    산출물_참조를_푼다(산출물, 노드).path("enum").forEach(항목 -> 결과.add(항목.asText()));
    return List.copyOf(결과);
  }

  // springdoc 은 multipart 본문의 @RequestParam 필드를 query 파라미터로 그린다 (POST /media)
  private static boolean multipart_필드인가(JsonNode 연산, List<String> 단계) {
    return 단계.size() == 2 && !산출물의_파라미터_스키마(연산, 단계.get(1)).isMissingNode();
  }

  private static JsonNode 산출물_참조를_푼다(JsonNode 산출물, JsonNode 노드) {
    JsonNode 현재 = 노드;
    while (현재.path("$ref").isTextual()) {
      String ref = 현재.path("$ref").asText();
      현재 = 산출물.path("components").path("schemas").path(ref.substring(ref.lastIndexOf('/') + 1));
    }
    return 현재;
  }

  private static JsonNode 산출물의_파라미터_스키마(JsonNode 연산, String 이름) {
    for (JsonNode 파라미터 : 연산.path("parameters")) {
      if (이름.equals(파라미터.path("name").asText())) {
        return 파라미터.path("schema");
      }
    }
    return MissingNode.getInstance();
  }

  private static JsonNode 산출물의_본문_스키마(JsonNode 블록) {
    for (Map.Entry<String, JsonNode> 미디어 : 블록.path("content").properties()) {
      return 미디어.getValue().path("schema");
    }
    return MissingNode.getInstance();
  }

  private static Set<String> 계약의_이름_붙은_enum(Path 계약_문서) throws Exception {
    Set<String> 결과 = new TreeSet<>();
    계약_schemas(계약_문서)
        .forEach(
            (이름, 스키마) -> {
              if (스키마.containsKey("enum")) {
                결과.add(이름);
              }
            });
    return 결과;
  }

  private static Set<String> 값이_대조되는_enum(Path 계약_문서, Set<String> 표의_계약_이름) throws Exception {
    Map<String, Map<String, Object>> schemas = 계약_schemas(계약_문서);
    Set<String> 이름_붙은_enum = 계약의_이름_붙은_enum(계약_문서);

    Set<String> 결과 = new TreeSet<>();
    for (String 이름 : 표의_계약_이름) {
      계약_스키마의_properties(allOf_를_펼친다(schemas, schemas.get(이름)))
          .values()
          .forEach(속성 -> 결과.addAll(계약_속성이_부르는_이름(속성)));
    }
    결과.retainAll(이름_붙은_enum);
    return 결과;
  }

  @SuppressWarnings("unchecked")
  private static Set<String> 계약_속성이_부르는_이름(Map<String, Object> 속성) {
    Set<String> 결과 = new TreeSet<>();
    if (속성.get("$ref") instanceof String ref) {
      결과.add(ref.substring(ref.lastIndexOf('/') + 1));
    }
    if (속성.get("allOf") instanceof List<?> 조각들) {
      조각들.forEach(조각 -> 결과.addAll(계약_속성이_부르는_이름((Map<String, Object>) 조각)));
    }
    return 결과;
  }

  @SuppressWarnings("unchecked")
  private static Map<String, Map<String, Object>> 계약_스키마의_properties(Map<String, Object> 스키마) {
    return (Map<String, Map<String, Object>>) 스키마.get("properties");
  }

  private static Set<String> 계약의_필드(Map<String, Object> 스키마) {
    return new TreeSet<>(계약_스키마의_properties(스키마).keySet());
  }

  private static Set<String> 계약의_nullable(Map<String, Object> 스키마) {
    Set<String> 결과 = new TreeSet<>();
    계약_스키마의_properties(스키마)
        .forEach(
            (이름, 속성) -> {
              if (Boolean.TRUE.equals(속성.get("nullable"))) {
                결과.add(이름);
              }
            });
    return 결과;
  }

  private static Map<String, List<String>> 계약의_enum값(Path 계약_문서, String 이름) throws Exception {
    Map<String, Map<String, Object>> schemas = 계약_schemas(계약_문서);
    Map<String, List<String>> 결과 = new TreeMap<>();
    계약_스키마의_properties(allOf_를_펼친다(schemas, schemas.get(이름)))
        .forEach(
            (필드, 속성) -> {
              Map<String, Object> 대상 = 계약_속성이_가리키는_스키마(schemas, 속성, "enum");
              if (대상.get("enum") instanceof List<?> 값) {
                결과.put(필드, 값.stream().map(String::valueOf).toList());
              }
            });
    return 결과;
  }

  @SuppressWarnings("unchecked")
  private static Map<String, Object> 계약_속성이_가리키는_스키마(
      Map<String, Map<String, Object>> schemas, Map<String, Object> 속성, String 찾는_키) {
    if (속성.get("$ref") instanceof String ref) {
      return 계약_속성이_가리키는_스키마(schemas, schemas.get(ref.substring(ref.lastIndexOf('/') + 1)), 찾는_키);
    }
    if (속성.get("allOf") instanceof List<?> 조각들) {
      for (Object 조각 : 조각들) {
        Map<String, Object> 대상 = 계약_속성이_가리키는_스키마(schemas, (Map<String, Object>) 조각, 찾는_키);
        if (대상.containsKey(찾는_키)) {
          return 대상;
        }
      }
    }
    return 속성;
  }

  private static Map<String, List<String>> 산출물의_enum값(JsonNode 스키마) {
    Map<String, List<String>> 결과 = new TreeMap<>();
    for (Map.Entry<String, JsonNode> 속성 : 스키마.path("properties").properties()) {
      JsonNode 값 = 속성.getValue().path("enum");
      if (값.isArray()) {
        List<String> 목록 = new ArrayList<>();
        값.forEach(항목 -> 목록.add(항목.asText()));
        결과.put(속성.getKey(), List.copyOf(목록));
      }
    }
    return 결과;
  }

  private record 필드_타입(String 타입, String format) {}

  private static final Set<String> 자바_숫자_폭 = Set.of("int32", "int64", "float", "double");

  private static final Set<String> 자바_타입이_말하지_않는_format = Set.of("uuid", "uri", "email");

  private static final Map<String, String> format_대조_제외 =
      Map.of(
          "Activity.id", "계약이 format: uuid 를 빠뜨렸다 — DTO 는 UUID 다 (계약 수정은 앱과 같은 PR 이어야 한다)",
          "ActivityCard.id", "같은 이유",
          "Item.photoId", "같은 이유");

  private static Map<String, 필드_타입> 계약의_타입자리(Path 계약_문서, String 이름) throws Exception {
    Map<String, Map<String, Object>> schemas = 계약_schemas(계약_문서);
    Map<String, 필드_타입> 결과 = new TreeMap<>();
    계약_스키마의_properties(allOf_를_펼친다(schemas, schemas.get(이름)))
        .forEach((필드, 속성) -> 계약_타입자리를_걷는다(schemas, 속성, 필드, 결과));
    return 결과;
  }

  @SuppressWarnings("unchecked")
  private static void 계약_타입자리를_걷는다(
      Map<String, Map<String, Object>> schemas,
      Map<String, Object> 속성,
      String 자리,
      Map<String, 필드_타입> 결과) {
    Map<String, Object> 정의 = 계약_속성이_가리키는_스키마(schemas, 속성, "type");
    결과.put(자리, new 필드_타입(타입_이름(정의.get("type")), (String) 정의.get("format")));
    if (정의.get("items") instanceof Map<?, ?> items) {
      계약_타입자리를_걷는다(schemas, (Map<String, Object>) items, 자리 + "[]", 결과);
    }
  }

  private static Map<String, 필드_타입> 산출물의_타입자리(JsonNode 산출물, JsonNode 스키마) {
    Map<String, 필드_타입> 결과 = new TreeMap<>();
    for (Map.Entry<String, JsonNode> 속성 : 스키마.path("properties").properties()) {
      산출물_타입자리를_걷는다(산출물, 속성.getValue(), 속성.getKey(), 결과);
    }
    return 결과;
  }

  private static void 산출물_타입자리를_걷는다(JsonNode 산출물, JsonNode 노드, String 자리, Map<String, 필드_타입> 결과) {
    JsonNode 정의 = 산출물_참조를_푼다(산출물, 노드);
    결과.put(자리, new 필드_타입(타입_이름(정의.path("type")), 정의.path("format").textValue()));
    if (정의.has("items")) {
      산출물_타입자리를_걷는다(산출물, 정의.path("items"), 자리 + "[]", 결과);
    }
  }

  private static String 타입_이름(Object 타입) {
    if (타입 instanceof String 하나) {
      return "null".equals(하나) ? null : 하나;
    }
    if (타입 instanceof List<?> 목록) {
      for (Object 항목 : 목록) {
        if (!"null".equals(항목)) {
          return String.valueOf(항목);
        }
      }
    }
    return null;
  }

  private static String 타입_이름(JsonNode 타입) {
    if (타입.isTextual()) {
      return "null".equals(타입.asText()) ? null : 타입.asText();
    }
    for (JsonNode 항목 : 타입) {
      if (!"null".equals(항목.asText())) {
        return 항목.asText();
      }
    }
    return null;
  }

  private static Map<String, String> 타입만(Map<String, 필드_타입> 자리) {
    Map<String, String> 결과 = new TreeMap<>();
    자리.forEach((이름, 값) -> 결과.put(이름, 값.타입()));
    return 결과;
  }

  private static Set<String> format이_어긋난_자리(
      String 계약_이름, Map<String, 필드_타입> 계약, Map<String, 필드_타입> 산출물) {
    Set<String> 결과 = new TreeSet<>();
    계약.forEach(
        (자리, 계약값) -> {
          필드_타입 산출물값 = 산출물.get(자리);
          if (산출물값 == null || Objects.equals(계약값.format(), 산출물값.format())) {
            return;
          }
          boolean 숫자_폭 = 계약값.format() == null && 자바_숫자_폭.contains(산출물값.format());
          boolean 문자열_의미 = 산출물값.format() == null && 자바_타입이_말하지_않는_format.contains(계약값.format());
          if (!숫자_폭 && !문자열_의미) {
            결과.add(계약_이름 + "." + 자리);
          }
        });
    return 결과;
  }

  private static Set<String> format_제외된_자리(String 계약_이름) {
    return format_대조_제외.keySet().stream()
        .filter(자리 -> 자리.startsWith(계약_이름 + "."))
        .collect(Collectors.toCollection(TreeSet::new));
  }

  private static Set<String> 산출물의_필드(JsonNode 스키마) {
    Set<String> 결과 = new TreeSet<>();
    for (Map.Entry<String, JsonNode> 속성 : 스키마.path("properties").properties()) {
      결과.add(속성.getKey());
    }
    return 결과;
  }

  private static Set<String> 산출물의_nullable(JsonNode 스키마) {
    Set<String> 결과 = new TreeSet<>();
    for (Map.Entry<String, JsonNode> 속성 : 스키마.path("properties").properties()) {
      if (속성.getValue().path("nullable").asBoolean() || null_을_포함하는_타입인가(속성.getValue())) {
        결과.add(속성.getKey());
      }
    }
    return 결과;
  }

  private static boolean null_을_포함하는_타입인가(JsonNode 속성) {
    JsonNode 타입 = 속성.path("type");
    if (타입.isTextual()) {
      return "null".equals(타입.asText());
    }
    for (JsonNode 항목 : 타입) {
      if ("null".equals(항목.asText())) {
        return true;
      }
    }
    return false;
  }

  @SuppressWarnings("unchecked")
  private static Map<String, Object> 계약_스키마(Path 계약_문서, String 이름) throws Exception {
    Map<String, Map<String, Object>> schemas = 계약_schemas(계약_문서);
    return allOf_를_펼친다(schemas, schemas.get(이름));
  }

  @SuppressWarnings("unchecked")
  private static Map<String, Map<String, Object>> 계약_schemas(Path 계약_문서) throws Exception {
    try (var reader = Files.newBufferedReader(계약_문서)) {
      Map<String, Object> 문서 = new Yaml().load(reader);
      Map<String, Object> components = (Map<String, Object>) 문서.get("components");
      return (Map<String, Map<String, Object>>) components.get("schemas");
    }
  }

  @SuppressWarnings("unchecked")
  private static Map<String, Object> allOf_를_펼친다(
      Map<String, Map<String, Object>> schemas, Map<String, Object> 스키마) {
    List<Map<String, Object>> 조각들 = (List<Map<String, Object>>) 스키마.get("allOf");
    if (조각들 == null) {
      return 스키마;
    }
    Map<String, Object> 병합 = new LinkedHashMap<>();
    for (Map<String, Object> 조각 : 조각들) {
      String ref = (String) 조각.get("$ref");
      Map<String, Object> 대상 =
          ref == null
              ? 조각
              : allOf_를_펼친다(schemas, schemas.get(ref.substring(ref.lastIndexOf('/') + 1)));
      Map<String, Object> properties = (Map<String, Object>) 대상.get("properties");
      if (properties != null) {
        병합.putAll(properties);
      }
    }
    return Map.of("properties", 병합);
  }

  // 산출물은 인증 뒤에 있고, 토큰의 사용자가 DB 에 있어야 인증된다
  private JsonNode 산출물() throws Exception {
    if (산출물_문서 == null) {
      TestAccount 계정 = TestAccounts.가입한다(mockMvc, "contract-" + UUID.randomUUID() + "@test.io");
      String 본문 =
          mockMvc
              .perform(get("/v3/api-docs").header("Authorization", 계정.bearer()))
              .andExpect(status().isOk())
              .andReturn()
              .getResponse()
              .getContentAsString();
      산출물_문서 = objectMapper.readTree(본문);
    }
    return 산출물_문서;
  }

  private Set<String> 산출물의_경로와_메서드() throws Exception {
    Set<String> 결과 = new TreeSet<>();
    for (Map.Entry<String, JsonNode> path : 산출물().path("paths").properties()) {
      경로_떼기(path.getKey(), WebConfig.API_BASE_PATH)
          .ifPresent(
              경로 -> {
                for (Map.Entry<String, JsonNode> method : path.getValue().properties()) {
                  결과.add(method.getKey().toUpperCase() + " " + 경로);
                }
              });
    }
    return 결과;
  }

  @SuppressWarnings("unchecked")
  private static Map<String, Map<String, Object>> 계약_paths(Path 계약_문서) throws Exception {
    try (var reader = Files.newBufferedReader(계약_문서)) {
      Map<String, Object> 문서 = new Yaml().load(reader);
      return (Map<String, Map<String, Object>>) 문서.get("paths");
    }
  }

  private static Set<String> 계약의_경로와_메서드(Path 계약_문서) throws Exception {
    Set<String> 결과 = new TreeSet<>();
    계약_paths(계약_문서)
        .forEach(
            (경로, 메서드들) ->
                메서드들.keySet().stream()
                    .filter(OpenApiContractTest::HTTP_메서드인가)
                    .forEach(method -> 결과.add(method.toUpperCase() + " " + 경로)));
    return 결과;
  }

  private static boolean HTTP_메서드인가(String key) {
    return Set.of("get", "post", "put", "patch", "delete", "head", "options").contains(key);
  }

  private static Optional<String> 경로_떼기(String 산출물_경로, String 접두사) {
    return 산출물_경로.startsWith(접두사) ? Optional.of(산출물_경로.substring(접두사.length())) : Optional.empty();
  }
}
