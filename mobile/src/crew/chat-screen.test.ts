import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import type { ChatSocketEvent, ChatSocketStatus } from './chat-socket';

const mockGet = jest.fn();
const mockSocket = {
  sent: [] as { id: string; text: string }[],
  emit: (_event: ChatSocketEvent) => {},
  setStatus: (_status: ChatSocketStatus) => {},
};
let mockUuid = 0;
jest.mock('expo/src/winter/fetch', () => ({ fetch: jest.fn() }));
jest.mock('expo-crypto', () => ({ randomUUID: () => `local-${++mockUuid}` }));
jest.mock('expo-linear-gradient', () => ({ LinearGradient: 'LinearGradient' }));
jest.mock('expo-router', () => ({ router: { back: jest.fn(), replace: jest.fn(), dismissTo: jest.fn(), push: jest.fn() } }));
jest.mock('react-native', () => ({
  View: 'View',
  FlatList: 'FlatList',
  Pressable: 'Pressable',
  ActivityIndicator: 'ActivityIndicator',
  AccessibilityInfo: { announceForAccessibility: () => {} },
}));
jest.mock('design-system/src', () => new Proxy(
  { space: {}, size: {}, radius: {}, useTheme: () => ({ colors: {} }) },
  { get: (target, key) => (key in target ? target[key as keyof typeof target] : String(key)) },
));
jest.mock('../api/config', () => ({ createApiClient: () => ({ get: (k: string, q: unknown) => mockGet(k, q), mutate: async () => undefined }) }));
jest.mock('../realtime/crew-socket', () => ({
  acquireCrewSocket: () => ({
    send: (body: { id: string; text: string }) => mockSocket.sent.push(body),
    subscribe: (handler: (event: ChatSocketEvent) => void) => {
      mockSocket.emit = handler;
      return () => {};
    },
    onStatus: (listener: (status: ChatSocketStatus) => void) => {
      mockSocket.setStatus = listener;
      listener('connecting');
      return () => {};
    },
    close: () => {},
  }),
}));
jest.mock('../profile/blocked-users', () => ({ useBlockedUsers: () => new Set() }));
jest.mock('../ui/useFlash', () => ({ useFlash: () => require('react').useState(null) }));
import CrewChatScreen from '../../app/crew/chat';

const me = { id: 'u1', nickname: '관열', photoUrl: null, withdrawn: false };
const other = { id: 'u2', nickname: '상혁', photoUrl: null, withdrawn: false };
const message = (seq: number, author = other, id = `m${seq}`) => ({ seq, id, author, text: `메시지 ${seq}`, createdAt: '2026-09-06T06:24:00Z' });

let tree: ReactTestRenderer;
beforeAll(() => { (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true; });
// 떠날 때 남긴 미전송 메시지는 같은 크루로 돌아오면 되살아난다. 테스트마다 다른 크루로 연다
let crewNo = 0;
beforeEach(() => {
  jest.useFakeTimers();
  const crewId = `c${++crewNo}`;
  mockSocket.sent = [];
  mockUuid = 0;
  mockGet.mockReset().mockImplementation(async (key: string) => {
    if (key === 'GET /users/me') return { data: { ...me, membership: { crew: { id: crewId, isLeader: false } } } };
    if (key === 'GET /crew') return { data: { memberCount: 3 } };
    return { data: { items: [message(1)], hasMore: false } };
  });
});
afterEach(() => {
  act(() => tree.unmount());
  jest.useRealTimers();
});

const byType = (type: string) => tree.root.findAll((n) => (n.type as unknown) === type);
const write = async (text: string) => {
  await act(async () => byType('Field')[0].props.onChangeText(text));
  await act(async () => byType('IconButton')[0].props.onPress());
};
const open = async () => {
  await act(async () => { tree = create(React.createElement(CrewChatScreen)); });
};

test('끊긴 동안 쓴 메시지는 붙은 뒤 앞 메시지의 echo 를 받고 나서 하나씩 나간다', async () => {
  await open();
  await write('첫째');
  await write('둘째');
  expect(mockSocket.sent).toEqual([]);

  await act(async () => mockSocket.setStatus('open'));
  expect(mockSocket.sent).toEqual([{ id: 'local-1', text: '첫째' }]);

  await act(async () => mockSocket.emit({ type: 'CHAT', data: { ...message(2, me, 'local-1'), text: '첫째' } }));
  expect(mockSocket.sent.map((m) => m.id)).toEqual(['local-1', 'local-2']);
});

test('echo 를 기다리던 중 끊기면 다시 붙은 뒤 같은 id 로 다시 보낸다', async () => {
  await open();
  await act(async () => mockSocket.setStatus('open'));
  await write('첫째');
  await act(async () => mockSocket.setStatus('connecting'));
  await act(async () => { jest.advanceTimersByTime(15_000); });
  await act(async () => mockSocket.setStatus('open'));
  expect(mockSocket.sent.map((m) => m.id)).toEqual(['local-1', 'local-1']);
});

test('다시 붙으면 끊기기 직전 10초 안에 받은 가장 작은 seq 부터 빈 구간을 묻고 복구를 알린다', async () => {
  await open();
  await act(async () => mockSocket.setStatus('open'));
  await act(async () => mockSocket.emit({ type: 'CHAT', data: message(5) }));
  await act(async () => mockSocket.emit({ type: 'CHAT', data: message(3) }));
  await act(async () => mockSocket.setStatus('connecting'));
  mockGet.mockClear();
  await act(async () => mockSocket.setStatus('open'));
  expect(mockGet).toHaveBeenCalledWith('GET /crew/chat/messages', { afterSeq: 3, limit: 50 });
  expect(byType('Snackbar')[0].props.message).toBe('연결이 복구됐어요.');
});

test('이력 보충이 실패해도 같은 기준으로 다시 요청한다', async () => {
  await open();
  mockGet.mockRejectedValueOnce(new Error('offline'));
  await act(async () => mockSocket.setStatus('open'));
  expect(byType('Snackbar')[0].props.message).toBe('메시지를 다시 불러오고 있어요.');
  await act(async () => mockSocket.emit({ type: 'CHAT', data: message(10) }));
  mockGet.mockClear();
  await act(async () => { jest.advanceTimersByTime(5000); });
  expect(mockGet).toHaveBeenCalledWith('GET /crew/chat/messages', { afterSeq: 1, limit: 50 });
});
