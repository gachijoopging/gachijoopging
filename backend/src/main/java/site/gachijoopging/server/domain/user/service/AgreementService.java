package site.gachijoopging.server.domain.user.service;

import java.time.Clock;
import java.time.Instant;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import site.gachijoopging.server.domain.user.dto.AgreementCatalogResponse;
import site.gachijoopging.server.domain.user.dto.AgreementCatalogResponse.CatalogItem;
import site.gachijoopging.server.domain.user.dto.AgreementsResponse;
import site.gachijoopging.server.domain.user.dto.AgreementsResponse.AgreementItem;
import site.gachijoopging.server.domain.user.dto.AgreementsUpdateRequest;
import site.gachijoopging.server.domain.user.entity.AgreementType;
import site.gachijoopging.server.domain.user.entity.UserAgreement;
import site.gachijoopging.server.domain.user.repository.UserAgreementRepository;
import site.gachijoopging.server.global.error.BusinessException;
import site.gachijoopging.server.global.error.ErrorCode;
import site.gachijoopging.server.global.error.ErrorField;

@Service
@RequiredArgsConstructor
public class AgreementService {

  private static final List<ErrorField> ITEMS_FORMAT = List.of(new ErrorField("items", "FORMAT"));

  private final UserAgreementRepository userAgreementRepository;
  private final AgreementProperties properties;
  private final Clock clock;

  public AgreementCatalogResponse getCatalog() {
    requireConfigured();
    return new AgreementCatalogResponse(
        Arrays.stream(AgreementType.values())
            .map(t -> new CatalogItem(t, properties.version(), t.required(), properties.url(t)))
            .toList());
  }

  @Transactional(readOnly = true)
  public AgreementsResponse get(UUID me) {
    requireConfigured();
    Map<AgreementType, UserAgreement> current =
        userAgreementRepository.findByUserIdAndVersion(me, properties.version()).stream()
            .collect(Collectors.toMap(UserAgreement::getType, Function.identity()));

    List<AgreementItem> items =
        Arrays.stream(AgreementType.values())
            .map(
                t -> {
                  UserAgreement row = current.get(t);
                  boolean agreed = row != null && row.isAgreed();
                  return new AgreementItem(
                      t,
                      properties.version(),
                      t.required(),
                      properties.url(t),
                      agreed,
                      agreed ? row.getAgreedAt() : null);
                })
            .toList();
    boolean complete = items.stream().allMatch(i -> !i.required() || i.agreed());
    return new AgreementsResponse(complete, items);
  }

  @Transactional
  public AgreementsResponse update(UUID me, AgreementsUpdateRequest request) {
    requireConfigured();
    for (AgreementsUpdateRequest.Item item : request.items()) {
      if (!item.version().equals(properties.version())) {
        throw new BusinessException(
            ErrorCode.VALIDATION, "현재 동의 버전이 아니다: " + item.version(), ITEMS_FORMAT);
      }
      // 필수 동의를 거두는 길은 탈퇴뿐이다 — 철회는 선택 항목만
      if (item.type().required() && !item.agreed()) {
        throw new BusinessException(
            ErrorCode.VALIDATION, "필수 항목은 철회할 수 없다: " + item.type(), ITEMS_FORMAT);
      }
    }
    Instant now = clock.instant();
    for (AgreementsUpdateRequest.Item item : request.items()) {
      userAgreementRepository.upsert(me, item.type().name(), item.version(), item.agreed(), now);
    }
    return get(me);
  }

  // 설정 없이 응답하면 앱이 빈 URL 의 약관으로 가입을 마친다
  private void requireConfigured() {
    if (!properties.configured()) {
      throw new BusinessException(ErrorCode.UNAVAILABLE, "약관 버전·URL 설정이 없다");
    }
  }
}
