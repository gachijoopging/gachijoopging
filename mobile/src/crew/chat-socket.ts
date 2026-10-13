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
  reconnect(): void;
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

export type MockChatSocketOptions = {
  author: ChatMessage['author'];
  /** 이 뒤에 echo 한다 */
  echoDelayMs?: number;
  /** true 면 echo 를 보내지 않는다. 전송 실패·다시 보내기 UI 를 목으로 확인하는 수단 */
  dropEcho?: boolean;
  /** 이력 목의 마지막 seq. echo 는 그다음 번호를 받는다 */
  lastSeq?: number;
};

export type MockChatSocket = ChatSocket & {
  /** 끊김을 흉내 낸다. 코드가 없으면 백오프로 스스로 다시 붙는다 */
  simulateDrop(code?: 4401 | 4403): void;
};

/** 백엔드 소켓이 붙기 전까지 쓰는 구현. 보낸 메시지를 그대로 echo 한다 */
export function createMockChatSocket({
  author,
  echoDelayMs = 400,
  dropEcho = false,
  lastSeq = 0,
}: MockChatSocketOptions): MockChatSocket {
  const handlers = new Set<(event: ChatSocketEvent) => void>();
  const listeners = new Set<(status: ChatSocketStatus) => void>();
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const echoed = new Set<string>();
  let seq = lastSeq;
  let status: ChatSocketStatus = 'open';
  let cancelReconnect: (() => void) | null = null;

  const setStatus = (next: ChatSocketStatus) => {
    status = next;
    listeners.forEach((l) => l(next));
  };

  return {
    send({ id, text }) {
      if (dropEcho || status !== 'open') return;
      const timer = setTimeout(() => {
        timers.delete(timer);
        if (echoed.has(id)) return;
        echoed.add(id);
        const data: ChatMessage = { seq: ++seq, id, author, text, createdAt: new Date().toISOString() };
        handlers.forEach((h) => h({ type: 'CHAT', data }));
      }, echoDelayMs);
      timers.add(timer);
    },
    subscribe(onEvent) {
      handlers.add(onEvent);
      return () => handlers.delete(onEvent);
    },
    onStatus(listener) {
      listeners.add(listener);
      listener(status);
      return () => listeners.delete(listener);
    },
    reconnect() {
      cancelReconnect?.();
      setStatus('connecting');
      const timer = setTimeout(() => {
        timers.delete(timer);
        setStatus('open');
      }, 0);
      timers.add(timer);
    },
    simulateDrop(code) {
      cancelReconnect?.();
      if (code) return setStatus({ closed: code });
      setStatus('connecting');
      cancelReconnect = reconnectWithBackoff(async () => {
        setStatus('open');
        return true;
      });
    },
    close() {
      cancelReconnect?.();
      timers.forEach(clearTimeout);
      handlers.clear();
      listeners.clear();
    },
  };
}
