# 백엔드 데이터 도메인은 새로 쓴다

옛 백엔드에서 `global/`(JWT 필터·응답 봉투·커서·오류 형식)·`auth`(소셜 검증·토큰 회전·재설정 메일)·`media`(업로드·서명 URL·AI 호출과 UNAVAILABLE 폴백) 세 영역 약 2,800줄만 가져오고,
데이터 도메인(`user`·`activity`·`post`·`notification`·`safety`·`chat`·`live`)과 신규 도메인(`crew`·`notice`·`stats`)은 `docs/ERD.md`·`docs/openapi.yaml` 에서 새로 쓴다.

스키마를 V1 부터 다시 쓰기로 했는데(ADR-0002) 옛 도메인 코드의 3분의 1(Entity·QueryDSL 쿼리)이 옛 스키마에 묶여 있었고, 활동(상태 기계·일시정지·수량)·채팅(STOMP)·알림(팔로우 발송)·크루 범위 인가는 어차피 새 설계였다.
가져온 3영역은 스키마와 무관하고 새 계약이 그대로 요구하는 것이다.

## 고려한 대안

- 전체 복사 뒤 도메인마다 고치기: 약 5~7일 빠르지만 "이건 옛 것, 저건 새 것" 경계를 팀이 계속 기억해야 하고, 옛 컬럼·옛 응답을 단언하는 테스트 25,000줄을 고치는 일이 따라온다
- 전부 새로 쓰기: 가져온 3영역 2,800줄과 테스트를 같은 모양으로 다시 쓰는 낭비

## 결과

이관 직후 백엔드는 컴파일되지 않는다. `auth`→`user`(UserService·UserAccount·MeResponse) 5곳, `media`→`activity.Category` 2곳. `user` 도메인과 `Category` 를 새로 쓴 뒤 잇는다. 도메인 배치는 `backend/docs/01-구조.md`.
