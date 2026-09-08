package site.gachijoopging.server.global.client;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withBadRequest;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

class KakaoLocalClientTest {

  private static final String 역삼_응답 =
      """
      {"meta":{"total_count":2},"documents":[
        {"region_type":"B","code":"1168010100","address_name":"서울특별시 강남구 역삼동",
         "region_1depth_name":"서울특별시","region_2depth_name":"강남구",
         "region_3depth_name":"역삼동","region_4depth_name":"","x":127.033,"y":37.495},
        {"region_type":"H","code":"1168064000","address_name":"서울특별시 강남구 역삼1동",
         "region_1depth_name":"서울특별시","region_2depth_name":"강남구",
         "region_3depth_name":"역삼1동","region_4depth_name":"","x":127.033,"y":37.495}]}
      """;

  private static final String 역삼공원_검색_응답 =
      """
      {"documents":[
        {"address_name":"서울 강남구 역삼동 635-1","category_name":"여행 > 공원 > 도시근린공원",
         "distance":"515","id":"10657560","phone":"","place_name":"역삼문화공원",
         "place_url":"http://place.map.kakao.com/10657560","road_address_name":"",
         "x":"127.03041938929663","y":"37.50133927181133"},
        {"address_name":"서울 강남구 역삼동 635-1","category_group_code":"PK6",
         "category_name":"교통,수송 > 교통시설 > 주차장 > 공영주차장","distance":"535",
         "id":"929596423","place_name":"역삼문화공원 제1호공영주차장",
         "road_address_name":"서울 강남구 테헤란로7길 21",
         "x":"127.029943906495","y":"37.5000924010043"}],
       "meta":{"is_end":false,"pageable_count":27,"total_count":27}}
      """;

  private static final String 검색_결과_없음 =
      """
      {"documents":[],"meta":{"is_end":true,"pageable_count":0,"total_count":0}}
      """;

  private static final String 서비스_지역_아님 =
      """
      {"code":-2,"msg":"The input parameter value is not in the service area"}
      """;

  private MockRestServiceServer 카카오;
  private KakaoLocalClient client;

  @BeforeEach
  void setUp() {
    RestClient.Builder builder = RestClient.builder();
    카카오 = MockRestServiceServer.bindTo(builder).build();
    client =
        new KakaoLocalClient(
            builder
                .baseUrl("https://dapi.kakao.com")
                .defaultHeader("Authorization", "KakaoAK 테스트-REST-키")
                .build());
  }

  @Test
  void 경도를_x_위도를_y_로_보낸다() {
    카카오.expect(
            requestTo(
                "https://dapi.kakao.com/v2/local/geo/coord2regioncode.json?x=127.0364&y=37.5006"))
        .andRespond(withSuccess(역삼_응답, MediaType.APPLICATION_JSON));

    client.findRegion(37.5006, 127.0364);

    카카오.verify();
  }

  @Test
  void REST_키를_KakaoAK_헤더로_보낸다() {
    카카오.expect(header("Authorization", "KakaoAK 테스트-REST-키"))
        .andRespond(withSuccess(역삼_응답, MediaType.APPLICATION_JSON));

    client.findRegion(37.5006, 127.0364);

    카카오.verify();
  }

  @Test
  void 법정동이_아니라_행정동을_고른다() {
    카카오.expect(requestTo(org.hamcrest.Matchers.containsString("coord2regioncode")))
        .andRespond(withSuccess(역삼_응답, MediaType.APPLICATION_JSON));

    Optional<KakaoRegion> 동네 = client.findRegion(37.5006, 127.0364);

    assertThat(동네).contains(new KakaoRegion("1168064000", "서울특별시 강남구 역삼1동"));
  }

  @Test
  void 서비스_지역이_아니면_빈_값이다() {
    카카오.expect(requestTo(org.hamcrest.Matchers.containsString("coord2regioncode")))
        .andRespond(withBadRequest().body(서비스_지역_아님).contentType(MediaType.APPLICATION_JSON));

    Optional<KakaoRegion> 동네 = client.findRegion(0, 0);

    assertThat(동네).isEmpty();
  }

  @Test
  void 좌표를_주면_경도를_x_위도를_y_로_보낸다() {
    카카오.expect(
            requestTo(
                "https://dapi.kakao.com/v2/local/search/keyword.json"
                    + "?query=%EC%97%AD%EC%82%BC%EA%B3%B5%EC%9B%90&x=127.036&y=37.5&size=10"))
        .andRespond(withSuccess(역삼공원_검색_응답, MediaType.APPLICATION_JSON));

    client.searchPlaces("역삼공원", 37.5, 127.036);

    카카오.verify();
  }

  @Test
  void 좌표가_없으면_좌표_파라미터를_빼고_보낸다() {
    카카오.expect(
            requestTo(
                "https://dapi.kakao.com/v2/local/search/keyword.json"
                    + "?query=%EC%97%AD%EC%82%BC%EA%B3%B5%EC%9B%90&size=10"))
        .andRespond(withSuccess(역삼공원_검색_응답, MediaType.APPLICATION_JSON));

    client.searchPlaces("역삼공원", null, null);

    카카오.verify();
  }

  @Test
  void 장소의_이름과_좌표를_뽑는다() {
    카카오.expect(requestTo(org.hamcrest.Matchers.containsString("search/keyword")))
        .andRespond(withSuccess(역삼공원_검색_응답, MediaType.APPLICATION_JSON));

    java.util.List<KakaoPlace> 장소 = client.searchPlaces("역삼공원", 37.5, 127.036);

    assertThat(장소)
        .containsExactly(
            new KakaoPlace("역삼문화공원", 37.50133927181133, 127.03041938929663),
            new KakaoPlace("역삼문화공원 제1호공영주차장", 37.5000924010043, 127.029943906495));
  }

  @Test
  void 결과가_없으면_빈_목록이다() {
    카카오.expect(requestTo(org.hamcrest.Matchers.containsString("search/keyword")))
        .andRespond(withSuccess(검색_결과_없음, MediaType.APPLICATION_JSON));

    assertThat(client.searchPlaces("없는장소", null, null)).isEmpty();
  }
}
