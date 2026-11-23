package site.gachijoopging.server.global.security.jwt;

import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.util.Base64;

final class JwtKeyFixture {

  private final String privateKeyPem;
  private final String publicKeyPem;

  private JwtKeyFixture(String privateKeyPem, String publicKeyPem) {
    this.privateKeyPem = privateKeyPem;
    this.publicKeyPem = publicKeyPem;
  }

  static JwtKeyFixture 새_키쌍() {
    try {
      KeyPairGenerator generator = KeyPairGenerator.getInstance("RSA");
      generator.initialize(2048);
      KeyPair pair = generator.generateKeyPair();
      return new JwtKeyFixture(
          pem("PRIVATE KEY", pair.getPrivate().getEncoded()),
          pem("PUBLIC KEY", pair.getPublic().getEncoded()));
    } catch (Exception e) {
      throw new IllegalStateException("테스트 키 생성 실패", e);
    }
  }

  String privateKeyPem() {
    return privateKeyPem;
  }

  String publicKeyPem() {
    return publicKeyPem;
  }

  private static String pem(String label, byte[] der) {
    return "-----BEGIN "
        + label
        + "-----\n"
        + Base64.getMimeEncoder(64, new byte[] {'\n'}).encodeToString(der)
        + "\n-----END "
        + label
        + "-----";
  }
}
