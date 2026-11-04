package site.gachijoopging.server.domain.user.entity;

public enum AgreementType {
  TERMS(true),
  PRIVACY(true),
  MARKETING(false);

  private final boolean required;

  AgreementType(boolean required) {
    this.required = required;
  }

  public boolean required() {
    return required;
  }
}
