package site.gachijoopging.server.global.response;

public record ApiResponse<T>(T data) {

  public static <T> ApiResponse<T> of(T data) {
    return new ApiResponse<>(data);
  }
}
