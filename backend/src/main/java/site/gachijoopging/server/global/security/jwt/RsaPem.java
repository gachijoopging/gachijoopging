package site.gachijoopging.server.global.security.jwt;

import java.security.KeyFactory;
import java.security.interfaces.RSAPrivateKey;
import java.security.interfaces.RSAPublicKey;
import java.security.spec.PKCS8EncodedKeySpec;
import java.security.spec.X509EncodedKeySpec;
import java.util.Base64;

final class RsaPem {

  private RsaPem() {}

  static RSAPrivateKey privateKey(String pem) {
    try {
      return (RSAPrivateKey)
          KeyFactory.getInstance("RSA")
              .generatePrivate(new PKCS8EncodedKeySpec(der(pem, "PRIVATE KEY")));
    } catch (Exception e) {
      throw new IllegalStateException("JWT 개인키 PEM 을 읽지 못했다", e);
    }
  }

  static RSAPublicKey publicKey(String pem) {
    try {
      return (RSAPublicKey)
          KeyFactory.getInstance("RSA")
              .generatePublic(new X509EncodedKeySpec(der(pem, "PUBLIC KEY")));
    } catch (Exception e) {
      throw new IllegalStateException("JWT 공개키 PEM 을 읽지 못했다", e);
    }
  }

  private static byte[] der(String pem, String label) {
    String base64 =
        pem.replace("\\n", "\n")
            .replace("-----BEGIN " + label + "-----", "")
            .replace("-----END " + label + "-----", "")
            .replaceAll("\\s", "");
    return Base64.getDecoder().decode(base64);
  }
}
