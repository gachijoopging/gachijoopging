jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { extra: { apiBaseUrl: 'https://api.test/api/v1', wsUrl: 'wss://api.test/api/v1/ws' } } } }));
jest.mock('expo-file-system', () => ({ Paths: { document: 'documents' }, File: class {
  get exists() { return false; }
  write() {}
  delete() {}
} }));
jest.mock('expo-secure-store', () => ({ getItemAsync: async () => null, setItemAsync: async () => {}, deleteItemAsync: async () => {} }));
jest.mock('./stomp', () => ({ createStompSocket: jest.fn() }));
import type { ChatSocketStatus } from '../crew/chat-socket';
import { createStompSocket, type LiveBody, type StompSocket } from './stomp';

process.env.EXPO_PUBLIC_API_MODE = 'real';
const { acquireCrewSocket, reportLive } = require('./crew-socket') as typeof import('./crew-socket');

type Fake = StompSocket & { setStatus(status: ChatSocketStatus): void; unsubscribed: jest.Mock };

function fakeSocket(): Fake {
  const statusListeners = new Set<(status: ChatSocketStatus) => void>();
  const unsubscribed = jest.fn();
  return {
    send: jest.fn(),
    sendLive: jest.fn(),
    subscribe: jest.fn(() => unsubscribed),
    onLive: jest.fn(() => unsubscribed),
    onStatus: jest.fn((listener) => {
      statusListeners.add(listener);
      listener('connecting');
      return () => statusListeners.delete(listener);
    }),
    close: jest.fn(),
    setStatus: (status) => statusListeners.forEach((l) => l(status)),
    unsubscribed,
  };
}

const created: Fake[] = [];
const fetch = jest.fn(async (_url: string, _init?: RequestInit) => ({ ok: true, status: 204, text: async () => '' }));
beforeEach(() => {
  created.length = 0;
  (createStompSocket as jest.Mock).mockReset().mockImplementation(() => {
    const socket = fakeSocket();
    created.push(socket);
    return socket;
  });
  fetch.mockClear();
  globalThis.fetch = fetch as unknown as typeof globalThis.fetch;
});

const body: LiveBody = { activityId: 'a1', location: { lng: 126.93, lat: 37.52 }, distanceM: 120, itemCount: 2, elapsedSec: 60, paused: false };

test('화면 둘이 받아도 연결은 하나이고, 마지막 화면이 닫을 때만 끊는다', () => {
  const chat = acquireCrewSocket()!;
  const live = acquireCrewSocket()!;
  expect(created).toHaveLength(1);
  expect(createStompSocket).toHaveBeenCalledWith(expect.objectContaining({ url: 'wss://api.test/api/v1/ws' }));
  chat.close();
  chat.close();
  expect(created[0].close).not.toHaveBeenCalled();
  live.close();
  expect(created[0].close).toHaveBeenCalledTimes(1);
});

test('닫은 화면이 단 구독만 떼어 내고 남은 화면의 구독은 둔다', () => {
  const chat = acquireCrewSocket()!;
  const live = acquireCrewSocket()!;
  chat.subscribe(() => {});
  chat.onStatus(() => {});
  chat.close();
  expect(created[0].unsubscribed).toHaveBeenCalledTimes(1);
  live.close();
});

test('4403 으로 닫힌 연결은 놓고, 다음 화면은 새로 붙는다', () => {
  const first = acquireCrewSocket()!;
  created[0].setStatus({ closed: 4403 });
  const next = acquireCrewSocket()!;
  expect(created).toHaveLength(2);
  first.close();
  expect(created[1].close).not.toHaveBeenCalled();
  next.close();
  expect(created[1].close).toHaveBeenCalledTimes(1);
});

test('화면이 연결을 쥐고 있으면 위치를 소켓으로, 아니면 HTTP 로 올린다 — HTTP 는 활동 id 를 경로에 싣는다', async () => {
  await reportLive(body);
  expect(fetch).toHaveBeenCalledTimes(1);
  const [url, init] = fetch.mock.calls[0];
  expect(`${init?.method} ${url}`).toBe('POST https://api.test/api/v1/activities/a1/live');
  expect(JSON.parse(String(init?.body))).toEqual({ location: body.location, distanceM: 120, itemCount: 2, elapsedSec: 60, paused: false });

  const screen = acquireCrewSocket()!;
  await reportLive(body);
  expect(created[0].sendLive).toHaveBeenCalledWith(body);
  expect(fetch).toHaveBeenCalledTimes(1);
  screen.close();
});

test('실서버 설정이 없으면 소켓을 만들지 않는다 — 화면은 목으로 돈다', () => {
  jest.isolateModules(() => {
    process.env.EXPO_PUBLIC_API_MODE = 'mock';
    const mock = require('./crew-socket') as typeof import('./crew-socket');
    expect(mock.acquireCrewSocket()).toBeNull();
    process.env.EXPO_PUBLIC_API_MODE = 'real';
  });
  expect(createStompSocket).not.toHaveBeenCalled();
});
