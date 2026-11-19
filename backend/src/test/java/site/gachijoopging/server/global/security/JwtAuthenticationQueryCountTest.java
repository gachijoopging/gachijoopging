package site.gachijoopging.server.global.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static site.gachijoopging.server.support.TestAccounts.가입한다;

import jakarta.persistence.EntityManagerFactory;
import org.hibernate.SessionFactory;
import org.hibernate.stat.Statistics;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.http.HttpHeaders;
import org.springframework.test.web.servlet.MockMvc;
import site.gachijoopging.server.domain.user.entity.User;
import site.gachijoopging.server.support.IntegrationTest;
import site.gachijoopging.server.support.TestAccounts.TestAccount;

@AutoConfigureMockMvc
class JwtAuthenticationQueryCountTest extends IntegrationTest {

  // 컨트롤러가 DB 를 읽지 않아, 이 요청이 낸 SQL 은 전부 인증 단계의 것이다
  private static final String DB_를_읽지_않는_경로 = "/api/v1/health";

  @Autowired private MockMvc mockMvc;
  @Autowired private EntityManagerFactory entityManagerFactory;

  @Test
  void 인증된_요청_하나는_인증_단계에서_users_를_한_번만_읽는다() throws Exception {
    TestAccount 나 = 가입한다(mockMvc, "auth-query-count@test.io");
    Statistics 통계 = entityManagerFactory.unwrap(SessionFactory.class).getStatistics();
    boolean 원래_설정 = 통계.isStatisticsEnabled();
    // 설정으로 켜면 컨텍스트가 하나 더 떠서 테스트 Postgres 의 max_connections 를 넘는다
    통계.setStatisticsEnabled(true);
    try {
      통계.clear();

      mockMvc
          .perform(get(DB_를_읽지_않는_경로).header(HttpHeaders.AUTHORIZATION, 나.bearer()))
          .andExpect(status().isOk());

      // 엔티티 로드 수만 세면 같은 행을 다른 쿼리(존재 확인·프로젝션)로 한 번 더 읽는 것을 놓친다
      assertThat(통계.getPrepareStatementCount()).as("인증 단계가 낸 SQL 수").isEqualTo(1);
      assertThat(통계.getEntityStatistics(User.class.getName()).getLoadCount())
          .as("그 SQL 이 읽은 users 행 수")
          .isEqualTo(1);
    } finally {
      통계.setStatisticsEnabled(원래_설정);
    }
  }
}
