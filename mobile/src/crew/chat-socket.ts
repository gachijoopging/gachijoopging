import type { ChatMessage } from './chat';

/** 구독 `/user/queue/crew` 중 채팅 화면이 쓰는 두 가지 (docs/realtime.md) */
export type ChatSocketEvent = { type: 'CHAT'; data: ChatMessage } | { type: 'CHAT_DELETED'; data: { seq: number } };
export type ChatSocketStatus = 'connecting' | 'open';

export type ChatSocket = {
  /** `/app/crew/chat`. 같은 id 재전송은 서버가 흡수한다 */
  send(body: { id: string; text: string }): void;
  subscribe(onEvent: (event: ChatSocketEvent) => void): () => void;
  onStatus(listener: (status: ChatSocketStatus) => void): () => void;
  close(): void;
};

export type MockChatSocketOptions = {
  author: ChatMessage['author'];
  /** 이 뒤에 echo 한다 */
  echoDelayMs?: number;
  /** true 면 echo 를 보내지 않는다. 전송 실패·다시 보내기 UI 를 목으로 확인하는 수단 */
  dropEcho?: boolean;
  /** 이력 목의 마지막 seq. echo 는 그다음 번호를 받는다 */
  lastSeq?: number;
};

/** 백엔드 소켓(GAC-50)이 붙기 전까지 쓰는 구현. 보낸 메시지를 그대로 echo 한다 */
export function createMockChatSocket({
  author,
  echoDelayMs = 400,
  dropEcho = false,
  lastSeq = 0,
}: MockChatSocketOptions): ChatSocket {
  const handlers = new Set<(event: ChatSocketEvent) => void>();
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const echoed = new Set<string>();
  let seq = lastSeq;

  return {
    send({ id, text }) {
      if (dropEcho) return;
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
      listener('open');
      return () => {};
    },
    close() {
      timers.forEach(clearTimeout);
      handlers.clear();
    },
  };
}
