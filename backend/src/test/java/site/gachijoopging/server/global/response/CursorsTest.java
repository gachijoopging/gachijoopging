package site.gachijoopging.server.global.response;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Instant;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import site.gachijoopging.server.global.error.BusinessException;
import site.gachijoopging.server.global.error.ErrorCode;

class CursorsTest {

  private static final Instant CREATED_AT = Instant.ofEpochMilli(1_700_000_000_123L);
  private static final UUID ID = UUID.fromString("0191d2c4-5f6a-7b8c-9d0e-1f2a3b4c5d6e");

  private static final Instant 마이크로초가_있는_시각 = Instant.ofEpochSecond(1_700_000_000L, 123_456_000);

  @Test
  void 인코딩한_커서를_디코딩하면_원래_값이_나온다() {
    Cursors.Cursor decoded = Cursors.decode(Cursors.encode(CREATED_AT, ID));

    assertThat(decoded.createdAt()).isEqualTo(CREATED_AT);
    assertThat(decoded.id()).isEqualTo(ID);
  }

  @Test
  void 마이크로초가_살아남는다() {
    Cursors.Cursor decoded = Cursors.decode(Cursors.encode(마이크로초가_있는_시각, ID));

    assertThat(decoded.createdAt()).isEqualTo(마이크로초가_있는_시각);
  }

  @Test
  void 커서는_URL_안전_문자만_쓴다() {
    String cursor = Cursors.encode(CREATED_AT, ID);

    assertThat(cursor).doesNotContain("+", "/", "=");
  }

  @Test
  void base64_가_아닌_커서는_VALIDATION_으로_거부한다() {
    assertThatThrownBy(() -> Cursors.decode("!!not-base64!!"))
        .isInstanceOf(BusinessException.class)
        .extracting("errorCode")
        .isEqualTo(ErrorCode.VALIDATION);
  }

  @Test
  void 형식이_어긋난_커서는_VALIDATION_으로_거부한다() {
    String 콜론이_없다 =
        java.util.Base64.getUrlEncoder()
            .withoutPadding()
            .encodeToString("1700000000123".getBytes());

    assertThatThrownBy(() -> Cursors.decode(콜론이_없다))
        .isInstanceOf(BusinessException.class)
        .extracting("errorCode")
        .isEqualTo(ErrorCode.VALIDATION);
  }

  @Test
  void bigint_커서도_왕복한다() {
    Cursors.LongCursor decoded = Cursors.decodeLong(Cursors.encode(CREATED_AT, 4_242L));

    assertThat(decoded.createdAt()).isEqualTo(CREATED_AT);
    assertThat(decoded.id()).isEqualTo(4_242L);
  }

  @Test
  void bigint_커서도_마이크로초가_살아남는다() {
    Cursors.LongCursor decoded = Cursors.decodeLong(Cursors.encode(마이크로초가_있는_시각, 4_242L));

    assertThat(decoded.createdAt()).isEqualTo(마이크로초가_있는_시각);
  }

  @Test
  void bigint_커서도_URL_안전_문자만_쓴다() {
    assertThat(Cursors.encode(CREATED_AT, Long.MAX_VALUE)).doesNotContain("+", "/", "=");
  }

  @Test
  void base64_가_아닌_bigint_커서는_VALIDATION_으로_거부한다() {
    assertThatThrownBy(() -> Cursors.decodeLong("!!not-base64!!"))
        .isInstanceOf(BusinessException.class)
        .extracting("errorCode")
        .isEqualTo(ErrorCode.VALIDATION);
  }

  @Test
  void UUID_커서를_bigint_로_읽으려_하면_VALIDATION_으로_거부한다() {
    String uuid_커서 = Cursors.encode(CREATED_AT, ID);

    assertThatThrownBy(() -> Cursors.decodeLong(uuid_커서))
        .isInstanceOf(BusinessException.class)
        .extracting("errorCode")
        .isEqualTo(ErrorCode.VALIDATION);
  }

  @Test
  void bigint_커서를_UUID_로_읽으려_하면_VALIDATION_으로_거부한다() {
    String bigint_커서 = Cursors.encode(CREATED_AT, 7L);

    assertThatThrownBy(() -> Cursors.decode(bigint_커서))
        .isInstanceOf(BusinessException.class)
        .extracting("errorCode")
        .isEqualTo(ErrorCode.VALIDATION);
  }
}
