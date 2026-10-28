package site.gachijoopging.server.domain.post.controller;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import java.time.LocalDate;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import site.gachijoopging.server.domain.post.dto.CreatePostRequest;
import site.gachijoopging.server.domain.post.dto.PostDetailResponse;
import site.gachijoopging.server.domain.post.dto.PostResponse;
import site.gachijoopging.server.domain.post.dto.PostScope;
import site.gachijoopging.server.domain.post.service.PostService;
import site.gachijoopging.server.global.response.ApiResponse;
import site.gachijoopging.server.global.response.CursorPage;
import site.gachijoopging.server.global.security.CrewMembership;
import site.gachijoopging.server.global.security.CurrentCrew;
import site.gachijoopging.server.global.security.CurrentUser;

@RestController
@RequiredArgsConstructor
public class PostController {

  private final PostService postService;

  @GetMapping("/crew/posts")
  public ApiResponse<CursorPage<PostResponse>> feed(
      @CurrentUser UUID me,
      @CurrentCrew CrewMembership crew,
      @RequestParam(defaultValue = "CREW") PostScope scope,
      @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
      @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
      @RequestParam(required = false) String cursor,
      @RequestParam(defaultValue = "20") @Min(1) @Max(50) int limit) {
    return ApiResponse.of(postService.feed(me, crew, scope, from, to, cursor, limit));
  }

  @PostMapping("/crew/posts")
  @ResponseStatus(HttpStatus.CREATED)
  public ApiResponse<PostResponse> create(
      @CurrentUser UUID me,
      @CurrentCrew CrewMembership crew,
      @Valid @RequestBody CreatePostRequest request) {
    return ApiResponse.of(postService.create(me, crew, request));
  }

  @GetMapping("/posts/{postId}")
  public ApiResponse<PostDetailResponse> detail(
      @CurrentUser UUID me, @CurrentCrew CrewMembership crew, @PathVariable UUID postId) {
    return ApiResponse.of(postService.detail(me, crew, postId));
  }

  @DeleteMapping("/posts/{postId}")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  public void delete(
      @CurrentUser UUID me, @CurrentCrew CrewMembership crew, @PathVariable UUID postId) {
    postService.delete(me, crew, postId);
  }

  @PutMapping("/posts/{postId}/like")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  public void like(
      @CurrentUser UUID me, @CurrentCrew CrewMembership crew, @PathVariable UUID postId) {
    postService.like(me, crew, postId);
  }

  @DeleteMapping("/posts/{postId}/like")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  public void unlike(
      @CurrentUser UUID me, @CurrentCrew CrewMembership crew, @PathVariable UUID postId) {
    postService.unlike(me, crew, postId);
  }

  @GetMapping("/crew/members/{userId}/posts")
  public ApiResponse<CursorPage<PostResponse>> memberPosts(
      @CurrentUser UUID me,
      @CurrentCrew CrewMembership crew,
      @PathVariable UUID userId,
      @RequestParam(required = false) String cursor,
      @RequestParam(defaultValue = "20") @Min(1) @Max(50) int limit) {
    return ApiResponse.of(postService.memberPosts(me, crew, userId, cursor, limit));
  }
}
