import { CONNECT_TIMEOUT_MS, createStompSocket, type LiveBody, type StompLike } from './stomp';
import type { ChatSocketStatus } from '../crew/chat-socket';
import { ApiError, NetworkError } from '../api/errors';

type FakeClient = StompLike & { url: string; deliver?: (m: { body: string }) => void };

function setup({ refreshFails = false, refreshErrors = [], getToken }: { refreshFails?: boolean; refreshErrors?: Error[]; getToken?: () => Promise<string | null> } = {}) {
  const clients: FakeClient[] = [];
  const createClient = (url: string) => {
    const c: FakeClient = {
      url,
      onConnect: () => {},
      onWebSocketClose: () => {},
      activate: jest.fn(),
      deactivate: jest.fn(),
      subscribe: jest.fn((_d: string, cb: (m: { body: string }) => void) => { c.deliver = cb; }),
      publish: jest.fn(),
    };
    clients.push(c);
    return c;
  };
  let token = 't1';
  const refresh = jest.fn(async () => {
    const queued = refreshErrors.shift();
    if (queued) throw queued;
    if (refreshFails) throw new ApiError('TOKEN_EXPIRED', undefined, 401);
    token = 't2';
  });
  const postLive = jest.fn(async () => {});
  const signedOutAt: number[] = [];
  const statuses: ChatSocketStatus[] = [];
  const signOut = jest.fn(async () => { signedOutAt.push(statuses.length); });
  const socket = createStompSocket({ url: 'wss://x/api/v1/ws', getToken: getToken ?? (async () => token), refresh, signOut, postLive, createClient });
  socket.onStatus((s) => statuses.push(s));
  const last = () => clients[clients.length - 1];
  return { socket, clients, last, refresh, signOut, signedOutAt, postLive, statuses };
}

const flush = () => jest.advanceTimersByTimeAsync(0);

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

test('토큰을 쿼리에 실어 붙고 /user/queue/crew 하나만 구독한다', async () => {
  const { clients, last, statuses } = setup();
  await flush();
  expect(clients).toHaveLength(1);
  expect(last().url).toBe('wss://x/api/v1/ws?token=t1');
  last().onConnect();
  expect(last().subscribe).toHaveBeenCalledTimes(1);
  expect(last().subscribe).toHaveBeenCalledWith('/user/queue/crew', expect.any(Function));
  expect(statuses).toEqual(['connecting', 'open']);
});

test('채팅 구독에는 CHAT·CHAT_DELETED 만, 위치 구독에는 LIVE_* 만 간다', async () => {
  const { socket, last } = setup();
  await flush();
  last().onConnect();
  const chat = jest.fn();
  const live = jest.fn();
  socket.subscribe(chat);
  socket.onLive(live);
  const send = (type: string, data: unknown) => last().deliver!({ body: JSON.stringify({ type, data }) });
  send('CHAT', { seq: 1 });
  send('CHAT_DELETED', { seq: 1 });
  send('LIVE_UPDATE', { userId: 'u1' });
  send('NOTIFICATION', {});
  last().deliver!({ body: 'not json' });
  expect(chat.mock.calls.map(([e]) => e.type)).toEqual(['CHAT', 'CHAT_DELETED']);
  expect(live.mock.calls.map(([e]) => e.type)).toEqual(['LIVE_UPDATE']);
});

test('채팅은 /app/crew/chat, 위치는 /app/crew/live 로 보낸다', async () => {
  const { socket, last, postLive } = setup();
  await flush();
  last().onConnect();
  socket.send({ id: 'm1', text: '안녕' });
  const live: LiveBody = { activityId: 'a1', location: null, distanceM: 10, itemCount: 1, elapsedSec: 5, paused: false };
  socket.sendLive(live);
  expect(last().publish).toHaveBeenCalledWith({ destination: '/app/crew/chat', body: '{"id":"m1","text":"안녕"}' });
  expect(last().publish).toHaveBeenCalledWith({ destination: '/app/crew/live', body: JSON.stringify(live) });
  expect(postLive).not.toHaveBeenCalled();
});

test('소켓이 닫혀 있으면 위치는 HTTP 로 올리고 채팅은 보내지 않는다', async () => {
  const { socket, last, postLive } = setup();
  await flush();
  const live: LiveBody = { activityId: 'a1', location: { lng: 127, lat: 37 }, distanceM: 10, itemCount: 1, elapsedSec: 5, paused: true };
  socket.sendLive(live);
  socket.send({ id: 'm1', text: 'x' });
  expect(postLive).toHaveBeenCalledWith(live);
  expect(last().publish).not.toHaveBeenCalled();
});

test('4401 이면 refresh 뒤 새 토큰으로 바로 다시 붙는다', async () => {
  const { clients, last, refresh, statuses } = setup();
  await flush();
  last().onWebSocketClose({ code: 4401 });
  await flush();
  expect(refresh).toHaveBeenCalledTimes(1);
  expect(clients).toHaveLength(2);
  expect(last().url).toBe('wss://x/api/v1/ws?token=t2');
  last().onConnect();
  expect(statuses[statuses.length - 1]).toBe('open');
});

test('refresh 뒤에도 4401 이면 로그아웃 상태로 만든 뒤 닫힘 4401 을 알린다', async () => {
  const { last, refresh, signOut, signedOutAt, statuses } = setup();
  await flush();
  last().onWebSocketClose({ code: 4401 });
  await flush();
  last().onWebSocketClose({ code: 4401 });
  await flush();
  expect(refresh).toHaveBeenCalledTimes(1);
  expect(signOut).toHaveBeenCalledTimes(1);
  // closed 4401 은 로그인 필요다. 화면이 로그인으로 보낼 때 토큰이 이미 지워져 있어야 한다
  expect(statuses[signedOutAt[0]]).toEqual({ closed: 4401 });
});

test('4401 을 refresh 로 풀면 로그아웃하지 않는다', async () => {
  const { last, signOut } = setup();
  await flush();
  last().onWebSocketClose({ code: 4401 });
  await flush();
  last().onConnect();
  expect(signOut).not.toHaveBeenCalled();
});

test('4401 뒤 새 토큰을 기다리는 사이 옛 Client 가 늦게 열려도 버린다', async () => {
  const pending: ((token: string) => void)[] = [];
  const { socket, clients, statuses } = setup({ getToken: () => new Promise((r) => pending.push(r)) });
  await flush();
  pending[0]('t-old');
  await flush();
  clients[0].onWebSocketClose({ code: 4401 });
  await flush();
  clients[0].onConnect();
  expect(clients[0].deactivate).toHaveBeenCalled();
  expect(statuses[statuses.length - 1]).toBe('connecting');
  pending[1]('t-new');
  await flush();
  expect(clients).toHaveLength(2);
  expect(clients[1].url).toBe('wss://x/api/v1/ws?token=t-new');
  clients[1].onConnect();
  socket.send({ id: 'm1', text: 'x' });
  expect(clients[0].publish).not.toHaveBeenCalled();
  expect(clients[1].publish).toHaveBeenCalledTimes(1);
  expect(statuses[statuses.length - 1]).toBe('open');
});

test('밀려난 옛 Client 의 onConnect·close 는 상태를 바꾸지 않는다', async () => {
  const { clients, statuses } = setup();
  await flush();
  clients[0].onWebSocketClose({ code: 4401 });
  await flush();
  clients[1].onConnect();
  clients[0].onConnect();
  clients[0].onWebSocketClose({ code: 1006 });
  await jest.advanceTimersByTimeAsync(60_000);
  expect(clients[0].deactivate).toHaveBeenCalled();
  expect(clients).toHaveLength(2);
  expect(statuses[statuses.length - 1]).toBe('open');
});

test('handshake 가 멈추면 제한 시간 뒤 그 Client 를 닫고 백오프로 다시 붙는다', async () => {
  const { clients, statuses } = setup();
  await flush();
  await jest.advanceTimersByTimeAsync(CONNECT_TIMEOUT_MS - 1);
  expect(clients).toHaveLength(1);
  await jest.advanceTimersByTimeAsync(1);
  expect(clients[0].deactivate).toHaveBeenCalled();
  await jest.advanceTimersByTimeAsync(1000);
  expect(clients).toHaveLength(2);
  clients[1].onConnect();
  // 밀려난 첫 Client 가 늦게 닫혀도 지금 연결을 흔들지 않는다
  clients[0].onWebSocketClose({ code: 1006 });
  expect(statuses[statuses.length - 1]).toBe('open');
});

test('서버가 refresh 를 거절하면 로그아웃 뒤 닫힘 4401 을 알린다 — 화면이 로그인으로 보낸다', async () => {
  const { last, statuses, clients, refresh, signOut } = setup({ refreshFails: true });
  await flush();
  last().onWebSocketClose({ code: 4401 });
  await jest.advanceTimersByTimeAsync(60_000);
  expect(statuses[statuses.length - 1]).toEqual({ closed: 4401 });
  expect(signOut).toHaveBeenCalledTimes(1);
  expect(refresh).toHaveBeenCalledTimes(1);
  expect(clients).toHaveLength(1);
});

test('refresh 가 통신 실패면 connecting 을 유지하고 백오프로 refresh 부터 다시 한다', async () => {
  const { last, statuses, clients, refresh, signOut } = setup({ refreshErrors: [new NetworkError('OFFLINE'), new NetworkError('TIMEOUT')] });
  await flush();
  last().onWebSocketClose({ code: 4401 });
  await flush();
  expect(refresh).toHaveBeenCalledTimes(1);
  expect(statuses[statuses.length - 1]).toBe('connecting');
  await jest.advanceTimersByTimeAsync(1000);
  expect(refresh).toHaveBeenCalledTimes(2);
  await jest.advanceTimersByTimeAsync(2000);
  expect(refresh).toHaveBeenCalledTimes(3);
  expect(clients).toHaveLength(2);
  expect(last().url).toBe('wss://x/api/v1/ws?token=t2');
  last().onConnect();
  expect(statuses[statuses.length - 1]).toBe('open');
  expect(statuses).not.toContainEqual({ closed: 4401 });
  expect(signOut).not.toHaveBeenCalled();
});

test('refresh 백오프 중 close 하면 refresh 를 더 하지 않는다', async () => {
  const { socket, last, refresh } = setup({ refreshErrors: [new NetworkError('OFFLINE')] });
  await flush();
  last().onWebSocketClose({ code: 4401 });
  await flush();
  socket.close();
  await jest.advanceTimersByTimeAsync(60_000);
  expect(refresh).toHaveBeenCalledTimes(1);
  expect(jest.getTimerCount()).toBe(0);
});

test('4403 이면 다시 붙지 않고 닫힘 4403 을 알린다 — 화면이 소속 상태를 다시 본다', async () => {
  const { last, clients, statuses } = setup();
  await flush();
  last().onConnect();
  last().onWebSocketClose({ code: 4403 });
  await jest.advanceTimersByTimeAsync(60_000);
  expect(statuses[statuses.length - 1]).toEqual({ closed: 4403 });
  expect(clients).toHaveLength(1);
});

test('붙어 있다 끊기면 1·2·4초 간격으로 다시 붙고, 붙으면 connecting → open 을 알린다', async () => {
  const { clients, last, statuses } = setup();
  await flush();
  last().onConnect();
  last().onWebSocketClose({ code: 1006 });
  expect(statuses[statuses.length - 1]).toBe('connecting');

  const attemptsAt = async (ms: number) => { await jest.advanceTimersByTimeAsync(ms); return clients.length; };
  expect(await attemptsAt(999)).toBe(1);
  expect(await attemptsAt(1)).toBe(2);
  last().onWebSocketClose({ code: 1006 });
  expect(await attemptsAt(1999)).toBe(2);
  expect(await attemptsAt(1)).toBe(3);
  last().onWebSocketClose({ code: 1006 });
  expect(await attemptsAt(3999)).toBe(3);
  expect(await attemptsAt(1)).toBe(4);

  // 채팅 화면은 connecting 다음 open 을 받으면 afterSeq 로 빈 구간을 채운다
  last().onConnect();
  expect(statuses.slice(-2)).toEqual(['connecting', 'open']);
});

test('close 뒤에는 다시 붙지 않는다', async () => {
  const { socket, clients, last } = setup();
  await flush();
  last().onConnect();
  socket.close();
  expect(last().deactivate).toHaveBeenCalled();
  last().onWebSocketClose({ code: 1006 });
  await jest.advanceTimersByTimeAsync(60_000);
  expect(clients).toHaveLength(1);
});
