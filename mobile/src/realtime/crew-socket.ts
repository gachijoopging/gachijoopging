import { signOut } from '../api/client';
import { apiConfig, createApiClient } from '../api/config';
import { getTokens } from '../api/tokens';
import { createStompSocket, type LiveBody, type StompSocket } from './stomp';

const api = createApiClient();

/** 소켓이 닫혀 있을 때의 같은 보고. HTTP 는 활동 id 를 경로에 싣는다 */
const postLive = ({ activityId, ...rest }: LiveBody) => api.mutate('POST /activities/{id}/live', { id: activityId, ...rest });

type Entry = { socket: StompSocket; holders: number };
let shared: Entry | null = null;

function open(): Entry {
  const entry: Entry = {
    socket: createStompSocket({
      url: apiConfig.wsUrl,
      getToken: async () => (await getTokens())?.accessToken ?? null,
      refresh: () => api.mutate('POST /auth/refresh'),
      signOut,
      postLive,
    }),
    holders: 0,
  };
  // 스스로 다시 붙지 않는 끊김(4401·4403)이면 놓는다. 다음에 여는 화면은 새 토큰·새 소속으로 새로 붙는다
  entry.socket.onStatus((status) => {
    if (typeof status === 'object' && shared === entry) shared = null;
  });
  return entry;
}

/**
 * 연결은 앱 전체에 하나다(docs/realtime.md §연결). 화면마다 핸들을 받고, 핸들의 close 는 그 화면이 단 구독만 떼어 낸다.
 * 마지막 핸들이 닫히면 연결을 끊는다. 실서버 설정이 없으면 null — 화면은 목으로 돈다
 */
export function acquireCrewSocket(): StompSocket | null {
  if (!apiConfig.real || !apiConfig.wsUrl) return null;
  const entry = (shared ??= open());
  entry.holders += 1;
  const { socket } = entry;
  const unsubscribes: (() => void)[] = [];
  const track = (unsubscribe: () => void) => {
    unsubscribes.push(unsubscribe);
    return unsubscribe;
  };
  let released = false;
  return {
    send: (body) => socket.send(body),
    sendLive: (body) => socket.sendLive(body),
    subscribe: (handler) => track(socket.subscribe(handler)),
    onLive: (handler) => track(socket.onLive(handler)),
    onStatus: (listener) => track(socket.onStatus(listener)),
    close() {
      if (released) return;
      released = true;
      unsubscribes.forEach((unsubscribe) => unsubscribe());
      entry.holders -= 1;
      if (entry.holders > 0) return;
      if (shared === entry) shared = null;
      socket.close();
    },
  };
}

/** 활동 중 위치를 올린다. 화면이 연결을 쥐고 있으면 소켓으로(끊겨 있으면 HTTP 로), 아니면 HTTP 로 */
export function reportLive(body: LiveBody): Promise<unknown> {
  if (!shared) return postLive(body);
  shared.socket.sendLive(body);
  return Promise.resolve();
}
