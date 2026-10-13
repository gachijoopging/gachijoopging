# 소켓 계약

HTTP 계약(`openapi.yaml`)이 다루지 않는 실시간 두 가지 — **크루 채팅** 과 **활동 중인 크루원 위치** — 의 메시지 규약이다.
연결은 하나다. 크루당 채널 하나에 채팅과 위치가 함께 흐른다.

## 연결

```
wss://www.gachijoopging.site/api/v1/ws?token=<accessToken>
```

- 프로토콜은 **STOMP over WebSocket**. Spring 의 기본이고 RN 은 `@stomp/stompjs` 를 쓴다
- 인증은 쿼리의 accessToken. 만료면 연결 거절(코드 4401). 앱은 refresh 뒤 재연결
- 구독 대상은 서버가 정한다. 클라이언트는 `/user/queue/crew` 하나만 구독하면 자기 크루의 채팅·위치가 온다. 크루 id 를 클라이언트가 고르지 않는다(한 사람 한 크루)
- 소속이 없거나 추방되면 서버가 연결을 끊는다(코드 4403). 앱은 `GET /users/me` 로 상태를 다시 본다

## 서버 → 앱 (구독 `/user/queue/crew`)

모든 메시지는 `{ "type": …, "data": … }`.

| type | 언제 | data |
|---|---|---|
| `CHAT` | 크루원이 메시지를 보냄 | `ChatMessage` (openapi 와 같은 모양: seq · id · author · text · createdAt) |
| `CHAT_DELETED` | 크루장이 신고 처리로 지움 | `{ seq }` |
| `LIVE_STARTED` | 크루원이 활동 시작 | `LiveMember` |
| `LIVE_UPDATE` | 위치·거리·개수 갱신 | `{ userId, locationShared, location: {lng,lat} \| null, distanceM, itemCount, elapsedSec, paused }` |
| `LIVE_ENDED` | 활동 종료 | `{ userId, activityId }` |
| `NOTIFICATION` | 알림 생성 (푸시와 별개로 앱이 켜져 있을 때 배지 갱신용) | `Notification` |

- 서버의 `locationShared`는 활동 저장값이다. false면 "위치를 공유하지 않아요", true이며 `location=null`이면 "위치 확인 중". 지도 마커는 공유 중이고 실제 좌표가 있을 때만 그린다.
- `LIVE_UPDATE` 는 서버가 **크루원당 최대 5초에 한 번** 으로 묶어 보낸다. 앱이 더 자주 올려도 마지막 값만 나간다
- 조회자는 활동 중일 필요 없다. 좌표는 대상이 `IN_PROGRESS && locationShared`인 경우만 제공하며 종료 대상은 제거한다. 위치 공유를 끈 사람의 `location` 은 `null`. 거리·개수는 그대로 온다(활동 중인 크루원 목록 2-2 에 쓰인다)
- 차단은 한 방향으로 차단자의 개인 채팅·위치 수신에서 대상만 걸러낸다(HTTP와 동일). 공식 공지와 필요한 크루장 관리 알림은 유지한다. 차단 직후 앱의 기존 개인 채팅·위치 표시도 제거한다

## 앱 → 서버 (전송 `/app/crew/...`)

| destination | 언제 | body |
|---|---|---|
| `/app/crew/chat` | 메시지 보내기 | `{ id: uuid, text }` — text 최대 500자. id 는 앱 생성, 같은 id 재전송은 흡수 |
| `/app/crew/live` | 활동 중 위치 | `{ activityId, location: {lng,lat} \| null, distanceM, itemCount, elapsedSec, paused }` |

- `/app/crew/live` 는 **필터를 통과한 점만** 보낸다(기능범위 "위치 품질"). 앱이 5초 간격으로 보낸다. 일시정지 중에도 보낸다(`paused: true`). 위치 공유·줍기는 유지하되 거리·시간·걸음수 누적은 멈춘다. 재실행 시 HTTP Activity의 `paused`·`pausedAt`과 계정별 로컬 상태로 복원한다
- 위치 공유를 끈 활동은 `location: null` 로 보낸다. 거리·개수는 보낸다
- 채팅 발신은 HTTP 가 없다. 소켓이 끊긴 동안 보낸 메시지는 앱이 큐에 두고 재연결 뒤 순서대로 보낸다

## 끊김과 이어받기

- 앱은 지수 백오프(1·2·4·8·최대 30초)로 재연결한다. 화면에는 "연결 중" 배너
- 재연결 뒤 채팅은 `GET /crew/chat/messages?afterSeq=<마지막 seq>` 로 빈 구간을 채운다 (`beforeSeq` 의 반대 방향)
- 재연결 뒤 위치는 `GET /crew/live` 로 전체를 다시 받는다. 소켓은 이후 변경만 준다
- 활동 중 앱이 배경으로 가도 소켓은 유지한다. OS 가 끊으면 포그라운드 서비스가 위치를 HTTP 로 대신 올린다: `POST /activities/{id}/live` (같은 body). 이 경로는 배경 전용이라 openapi 에 그렇게 적는다

## 옛 계약과 다른 점

- 채팅 폴링 `GET /meets/{id}/messages` 는 없다
- 무전(LiveKit) 관련 메시지는 없다
- 방(meet) 구독이 크루 구독으로 바뀌고, 클라이언트가 구독 경로에 id 를 넣지 않는다
