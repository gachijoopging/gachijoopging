package site.gachijoopging.server.global.web;

public record HealthResponse(String status) {

  static final HealthResponse UP = new HealthResponse("UP");
}
