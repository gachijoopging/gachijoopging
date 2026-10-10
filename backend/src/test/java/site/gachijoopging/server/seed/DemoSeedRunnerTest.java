package site.gachijoopging.server.seed;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Duration;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.core.io.ClassPathResource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import site.gachijoopging.server.support.IntegrationTest;

@AutoConfigureMockMvc
@TestPropertySource(
    properties = {
      "app.seed.demo.enabled=true",
      "app.seed.demo.member-email=demo-member@test.io",
      "app.seed.demo.member-password=demo-member-pw",
      "app.seed.demo.guest-email=demo-guest@test.io",
      "app.seed.demo.guest-password=demo-guest-pw"
    })
class DemoSeedRunnerTest extends IntegrationTest {

  @Autowired private DemoSeedRunner runner;
  @Autowired private JdbcTemplate jdbcTemplate;
  @Autowired private MockMvc mockMvc;
  @Autowired private JdbcClient jdbcClient;
  @Autowired private PasswordEncoder passwordEncoder;
  @Autowired private Clock clock;

  @Test
  void 다시_돌려도_크루와_계정과_데이터가_늘지_않는다() {
    String 개수 =
        """
        SELECT (SELECT count(*) FROM crews WHERE name IN (?, ?))
          || '/' || (SELECT count(*) FROM users WHERE email IN ('demo-member@test.io', 'demo-guest@test.io'))
          || '/' || (SELECT count(*) FROM crew_members WHERE crew_id = ?)
          || '/' || (SELECT count(*) FROM activities WHERE crew_id IN (?, ?))
          || '/' || (SELECT count(*) FROM activity_items i JOIN activities a ON a.id = i.activity_id WHERE a.crew_id IN (?, ?))
          || '/' || (SELECT count(*) FROM chat_messages WHERE crew_id = ?)
        """;
    Object[] 인자 = {
      DemoSeedRunner.DEMO_CREW_NAME,
      DemoSeedRunner.APPROVAL_CREW_NAME,
      DemoSeedRunner.id("crew:demo"),
      DemoSeedRunner.id("crew:demo"),
      DemoSeedRunner.id("crew:approval"),
      DemoSeedRunner.id("crew:demo"),
      DemoSeedRunner.id("crew:approval"),
      DemoSeedRunner.id("crew:demo")
    };
    String 기동_직후 = jdbcTemplate.queryForObject(개수, String.class, 인자);

    runner.run(null);
    runner.run(null);

    assertThat(기동_직후).startsWith("2/2/4/8/");
    assertThat(jdbcTemplate.queryForObject(개수, String.class, 인자)).isEqualTo(기동_직후);
  }

  @Test
  void 다음_날_다시_돌려도_크루_통계는_활동_합계와_같다() {
    String 대조 =
        """
        SELECT (SELECT coalesce(sum(item_count), 0) || '/' || coalesce(sum(activity_count), 0)
                FROM crew_daily_stats WHERE crew_id = ?)
          || '=' || (SELECT coalesce(sum(item_count), 0) || '/' || count(*)
                     FROM activities WHERE crew_id = ?)
        """;
    UUID 데모_크루 = DemoSeedRunner.id("crew:demo");

    new DemoSeedRunner(
            jdbcClient,
            passwordEncoder,
            Clock.offset(clock, Duration.ofDays(1)),
            "demo-member@test.io",
            "demo-member-pw",
            "demo-guest@test.io",
            "demo-guest-pw")
        .run(null);

    String 결과 = jdbcTemplate.queryForObject(대조, String.class, 데모_크루, 데모_크루);
    String[] 양쪽 = 결과.split("=");
    assertThat(양쪽[0]).isEqualTo(양쪽[1]);
  }

  @Test
  void 리셋_SQL_뒤_다시_돌리면_데모_상태로_돌아가고_통계가_두_배가_되지_않는다() throws Exception {
    UUID 데모_크루 = DemoSeedRunner.id("crew:demo");
    UUID 게스트 = DemoSeedRunner.id("user:guest");
    jdbcTemplate.update(
        "INSERT INTO crew_members (crew_id, user_id, joined_at) VALUES (?, ?, now())", 데모_크루, 게스트);
    jdbcTemplate.update(
        "INSERT INTO crew_join_requests (id, crew_id, user_id, status, created_at, decided_at)"
            + " VALUES (?, ?, ?, 'APPROVED', now(), now())",
        UUID.randomUUID(),
        데모_크루,
        게스트);

    jdbcTemplate.execute(
        new String(
            new ClassPathResource("seed/demo-reset.sql").getInputStream().readAllBytes(),
            StandardCharsets.UTF_8));
    runner.run(null);

    assertThat(
            jdbcTemplate.queryForObject(
                "SELECT count(*) FROM crew_members WHERE crew_id = ?", Integer.class, 데모_크루))
        .isEqualTo(4);
    assertThat(
            jdbcTemplate.queryForObject(
                "SELECT count(*) FROM users WHERE id = ?", Integer.class, 게스트))
        .isEqualTo(1);
    assertThat(
            jdbcTemplate.queryForObject(
                "SELECT (SELECT sum(item_count) FROM crew_daily_stats WHERE crew_id = ?)"
                    + " = (SELECT sum(item_count) FROM activities WHERE crew_id = ?)",
                Boolean.class,
                데모_크루,
                데모_크루))
        .isTrue();
  }

  @Test
  void 소속_계정은_MEMBER_이고_미소속_계정은_NONE_이며_데모_크루를_검색한다() throws Exception {
    mockMvc
        .perform(
            get("/api/v1/users/me")
                .header(HttpHeaders.AUTHORIZATION, 로그인("demo-member@test.io", "demo-member-pw")))
        .andExpect(jsonPath("$.data.membership.status").value("MEMBER"))
        .andExpect(jsonPath("$.data.membership.crew.name").value(DemoSeedRunner.DEMO_CREW_NAME));

    String 게스트 = 로그인("demo-guest@test.io", "demo-guest-pw");
    mockMvc
        .perform(get("/api/v1/users/me").header(HttpHeaders.AUTHORIZATION, 게스트))
        .andExpect(jsonPath("$.data.membership.status").value("NONE"));
    mockMvc
        .perform(
            get("/api/v1/crews")
                .param("query", DemoSeedRunner.DEMO_CREW_NAME)
                .header(HttpHeaders.AUTHORIZATION, 게스트))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data.items[0].name").value(DemoSeedRunner.DEMO_CREW_NAME))
        .andExpect(jsonPath("$.data.items[0].joinPolicy").value("OPEN"))
        .andExpect(jsonPath("$.data.items[0].memberCount").value(4));
  }

  private String 로그인(String 이메일, String 비밀번호) throws Exception {
    String 응답 =
        mockMvc
            .perform(
                post("/api/v1/auth/login")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content("{\"email\":\"%s\",\"password\":\"%s\"}".formatted(이메일, 비밀번호)))
            .andExpect(status().isOk())
            .andReturn()
            .getResponse()
            .getContentAsString();
    return "Bearer " + JsonPath.read(응답, "$.data.accessToken");
  }
}
