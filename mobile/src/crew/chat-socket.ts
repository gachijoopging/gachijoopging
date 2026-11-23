import { reconnectDelayMs, type ChatMessage } from './chat';

/** 구독 `/user/queue/crew` 중 채팅 화면이 쓰는 두 가지 (docs/realtime.md) */
export type ChatSocketEvent = { type: 'CHAT'; data: ChatMessage } | { type: 'CHAT_DELETED'; data: { seq: number } };
/**
 * closed 는 소켓이 스스로 다시 붙지 않는 끊김이다. 화면은 사유만 보고 이동한다.
 * 4401 로그인 필요 — 소켓이 토큰 갱신까지 해 보고 실패해 이미 로그아웃했다. 화면은 다시 갱신하지 않고 로그인으로 보낸다
 * 4403 소속 없음 → 소속 상태를 다시 본다
 */
export type ChatSocketStatus = 'connecting' | 'open' | { closed: 4401 | 4403 };

export type ChatSocket = {
  /** `/app/crew/chat`. 같은 id 재전송은 서버가 흡수한다 */
  send(body: { id: string; text: string }): void;
  subscribe(onEvent: (event: ChatSocketEvent) => void): () => void;
  /** 등록 즉시 현재 상태를 한 번 알린다 */
  onStatus(listener: (status: ChatSocketStatus) => void): () => void;
  close(): void;
};

/** connect 가 true 를 돌려줄 때까지 1·2·4·8…최대 30초 간격으로 다시 시도한다. 돌려준 함수로 멈춘다 */
export function reconnectWithBackoff(connect: () => Promise<boolean>): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let cancelled = false;
  const attempt = (n: number) => {
    timer = setTimeout(async () => {
      if (cancelled) return;
      let ok = false;
      try {
        ok = await connect();
      } catch {
        // 네트워크 예외도 실패 한 번으로 치고 다음 간격에 다시 붙는다
      }
      if (!ok && !cancelled) attempt(n + 1);
    }, reconnectDelayMs(n));
  };
  attempt(0);
  return () => {
    cancelled = true;
    if (timer) clearTimeout(timer);
  };
}
