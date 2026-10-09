import { Client } from '@stomp/stompjs';
import { reconnectWithBackoff, type ChatSocket, type ChatSocketEvent, type ChatSocketStatus } from '../crew/chat-socket';

/** `/app/crew/live` 와 `POST /activities/{id}/live` 가 같은 body 를 쓴다 (docs/realtime.md) */
export type LiveBody = {
  activityId: string;
  location: { lng: number; lat: number } | null;
  distanceM: number;
  itemCount: number;
  elapsedSec: number;
  paused: boolean;
};

/** 구독 `/user/queue/crew` 중 위치 세 가지. data 모양은 docs/realtime.md 표 */
export type LiveEvent =
  | { type: 'LIVE_STARTED'; data: unknown }
  | { type: 'LIVE_UPDATE'; data: { userId: string; locationShared: boolean; location: { lng: number; lat: number } | null; distanceM: number; itemCount: number; elapsedSec: number; paused: boolean } }
  | { type: 'LIVE_ENDED'; data: { userId: string; activityId: string } };

/** @stomp/stompjs Client 중 여기서 쓰는 부분. 테스트는 이 모양의 가짜를 넣는다 */
export type StompLike = {
  onConnect: () => void;
  onWebSocketClose: (event: { code: number }) => void;
  activate(): void;
  deactivate(): unknown;
  subscribe(destination: string, callback: (message: { body: string }) => void): unknown;
  publish(params: { destination: string; body: string }): void;
};

export type StompSocketOptions = {
  /** 예 wss://www.gachijoopging.site/api/v1/ws */
  url: string;
  /** 연결할 때마다 새로 읽는다. refresh 뒤 재연결은 새 토큰으로 붙어야 한다 */
  getToken: () => Promise<string | null>;
  /** 공유 refresh (api/client 의 POST /auth/refresh). 실패하면 reject */
  refresh: () => Promise<unknown>;
  /** 소켓이 닫혀 있을 때 위치를 올리는 길. OS 가 배경에서 소켓을 끊어도 위치는 끊기지 않아야 한다 */
  postLive: (body: LiveBody) => Promise<unknown>;
  createClient?: (url: string) => StompLike;
};

export type StompSocket = ChatSocket & {
  onLive(handler: (event: LiveEvent) => void): () => void;
  sendLive(body: LiveBody): void;
};

// 재연결은 reconnectWithBackoff 가 맡는다. stompjs 자체 재연결이 겹치면 백오프 간격이 깨진다
const defaultClient = (url: string): StompLike =>
  new Client({ brokerURL: url, reconnectDelay: 0, forceBinaryWSFrames: true, appendMissingNULLonIncoming: true }) as unknown as StompLike;

const CHAT_TYPES = new Set(['CHAT', 'CHAT_DELETED']);
const LIVE_TYPES = new Set(['LIVE_STARTED', 'LIVE_UPDATE', 'LIVE_ENDED']);

export function createStompSocket({ url, getToken, refresh, postLive, createClient = defaultClient }: StompSocketOptions): StompSocket {
  const chatHandlers = new Set<(event: ChatSocketEvent) => void>();
  const liveHandlers = new Set<(event: LiveEvent) => void>();
  const listeners = new Set<(status: ChatSocketStatus) => void>();
  let status: ChatSocketStatus = 'connecting';
  let client: StompLike | null = null;
  let stopBackoff: (() => void) | null = null;
  let refreshed = false;
  let closed = false;

  const setStatus = (next: ChatSocketStatus) => {
    status = next;
    listeners.forEach((l) => l(next));
  };

  const dispatch = (body: string) => {
    let message: { type?: string };
    try { message = JSON.parse(body); } catch { return; }
    if (CHAT_TYPES.has(message.type ?? '')) chatHandlers.forEach((h) => h(message as ChatSocketEvent));
    else if (LIVE_TYPES.has(message.type ?? '')) liveHandlers.forEach((h) => h(message as LiveEvent));
  };

  const onAuthClosed = (code: 4401 | 4403) => {
    if (code === 4401 && !refreshed) {
      refreshed = true;
      setStatus('connecting');
      refresh().then(() => !closed && connectNow(), () => !closed && setStatus({ closed: 4401 }));
      return;
    }
    setStatus({ closed: code });
  };

  /** 한 번 붙어 본다. 붙으면 true, 백오프를 이어야 하면 false. 4401·4403 은 백오프를 멈추고 따로 처리한다 */
  const attempt = async (): Promise<boolean> => {
    const token = await getToken().catch(() => null);
    if (closed) return true;
    const c = createClient(`${url}?token=${encodeURIComponent(token ?? '')}`);
    client = c;
    return new Promise<boolean>((resolve) => {
      let opened = false;
      c.onConnect = () => {
        opened = true;
        refreshed = false;
        c.subscribe('/user/queue/crew', (m) => dispatch(m.body));
        setStatus('open');
        resolve(true);
      };
      c.onWebSocketClose = ({ code }) => {
        if (client !== c || closed) return resolve(true);
        client = null;
        if (code === 4401 || code === 4403) {
          onAuthClosed(code);
          return resolve(true);
        }
        if (!opened) return resolve(false);
        // 붙어 있다가 끊겼다. 1초부터 백오프
        setStatus('connecting');
        stopBackoff = reconnectWithBackoff(attempt);
      };
      c.activate();
    });
  };

  /** 처음 연결과 refresh 뒤 재연결은 바로 붙어 보고, 실패하면 백오프로 넘긴다 */
  function connectNow() {
    stopBackoff?.();
    stopBackoff = null;
    if (status !== 'connecting') setStatus('connecting');
    void attempt().then((ok) => {
      if (!ok && !closed) stopBackoff = reconnectWithBackoff(attempt);
    });
  }

  connectNow();

  const publish = (destination: string, body: unknown) => client?.publish({ destination, body: JSON.stringify(body) });

  return {
    send(body) {
      if (status === 'open') publish('/app/crew/chat', body);
    },
    subscribe(onEvent) {
      chatHandlers.add(onEvent);
      return () => chatHandlers.delete(onEvent);
    },
    onLive(handler) {
      liveHandlers.add(handler);
      return () => liveHandlers.delete(handler);
    },
    sendLive(body) {
      if (status === 'open') publish('/app/crew/live', body);
      else postLive(body).catch(() => {});
    },
    onStatus(listener) {
      listeners.add(listener);
      listener(status);
      return () => listeners.delete(listener);
    },
    /** 화면이 refresh 를 마친 뒤 부른다. 여기서 또 4401 이면 다시 refresh 하지 않고 닫힘을 알린다 */
    reconnect() {
      refreshed = true;
      client?.deactivate();
      client = null;
      connectNow();
    },
    close() {
      closed = true;
      stopBackoff?.();
      client?.deactivate();
      client = null;
      chatHandlers.clear();
      liveHandlers.clear();
      listeners.clear();
    },
  };
}
