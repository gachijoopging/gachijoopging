package site.gachijoopging.server.contract;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.actuate.observability.AutoConfigureObservability;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.test.web.servlet.MockMvc;
import site.gachijoopging.server.global.metrics.GachijoopgingMetrics;
import site.gachijoopging.server.support.IntegrationTest;

@AutoConfigureMockMvc
@AutoConfigureObservability(tracing = false)
class MetricExposureTest extends IntegrationTest {

  @Autowired private MockMvc mockMvc;

  @Test
  void 산출물에_알람이_참조하는_지표가_전부_실린다() throws Exception {
    String 산출물 =
        mockMvc
            .perform(get("/actuator/prometheus"))
            .andExpect(status().isOk())
            .andReturn()
            .getResponse()
            .getContentAsString();

    assertThat(GachijoopgingMetrics.prometheusNames())
        .allSatisfy(
            이름 -> assertThat(산출물).as("%s 가 산출물에 없다 — 그 이름을 쓰는 알람은 조용히 발동하지 않는다", 이름).contains(이름));
  }

  @Test
  void 산출물에_http_요청_지표가_실린다() throws Exception {
    mockMvc.perform(get("/actuator/prometheus")).andExpect(status().isOk());

    String 산출물 =
        mockMvc.perform(get("/actuator/prometheus")).andReturn().getResponse().getContentAsString();

    assertThat(산출물).contains("http_server_requests_seconds_count");
  }
}
