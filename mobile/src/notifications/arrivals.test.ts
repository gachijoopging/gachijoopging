import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

const mockSocket = { handler: null as null | ((event: unknown) => void), status: null as null | ((status: unknown) => void), initial: 'connecting' as unknown, close: jest.fn() };
const mockAcquire = jest.fn(() => ({
  onNotification: (handler: (event: unknown) => void) => {
    mockSocket.handler = handler;
    return () => {};
  },
  onStatus: (listener: (status: unknown) => void) => {
    mockSocket.status = listener;
    listener(mockSocket.initial);
    return () => {};
  },
  close: mockSocket.close,
}));
jest.mock('../realtime/crew-socket', () => ({ acquireCrewSocket: () => mockAcquire() }));
let mockFocused = true;
jest.mock('expo-router', () => ({ useIsFocused: () => mockFocused }));
import { useNotificationArrivals } from './useNotificationArrivals';

function Probe({ onArrive }: { onArrive: () => void }) {
  useNotificationArrivals(onArrive);
  return null;
}

beforeEach(() => {
  mockSocket.handler = null;
  mockSocket.status = null;
  mockSocket.initial = 'connecting';
  mockFocused = true;
  mockSocket.close.mockClear();
  mockAcquire.mockClear();
});

test('NOTIFICATION 이 오면 가장 최근 콜백을 부르고, 다시 그려도 연결을 새로 잡지 않는다', () => {
  const first = jest.fn();
  const second = jest.fn();
  let tree!: ReactTestRenderer;
  act(() => { tree = create(React.createElement(Probe, { onArrive: first })); });
  act(() => tree.update(React.createElement(Probe, { onArrive: second })));
  act(() => mockSocket.handler!({ type: 'NOTIFICATION', data: { id: 501 } }));
  expect(second).toHaveBeenCalledTimes(1);
  expect(first).not.toHaveBeenCalled();
  expect(mockAcquire).toHaveBeenCalledTimes(1);
  act(() => tree.unmount());
});

test('화면이 사라지면 공유 연결의 핸들을 놓는다 — 마지막 화면이 놓아야 연결이 끊긴다', () => {
  let tree!: ReactTestRenderer;
  act(() => { tree = create(React.createElement(Probe, { onArrive: () => {} })); });
  expect(mockSocket.close).not.toHaveBeenCalled();
  act(() => tree.unmount());
  expect(mockSocket.close).toHaveBeenCalledTimes(1);
});

test('실서버 설정이 없으면(목) 소켓 없이 그냥 그린다', () => {
  mockAcquire.mockReturnValueOnce(null as never);
  let tree!: ReactTestRenderer;
  expect(() => act(() => { tree = create(React.createElement(Probe, { onArrive: () => {} })); })).not.toThrow();
  act(() => tree.unmount());
});

test('연결이 붙을 때마다(처음·재연결) 부른다 — 끊긴 사이 생긴 알림은 소켓이 다시 보내 주지 않는다', () => {
  const onArrive = jest.fn();
  let tree!: ReactTestRenderer;
  act(() => { tree = create(React.createElement(Probe, { onArrive })); });
  expect(onArrive).not.toHaveBeenCalled();
  act(() => mockSocket.status!('open'));
  expect(onArrive).toHaveBeenCalledTimes(1);
  act(() => mockSocket.status!('connecting'));
  act(() => mockSocket.status!('open'));
  expect(onArrive).toHaveBeenCalledTimes(2);
  act(() => tree.unmount());
});

test('이미 붙어 있는 연결을 받았을 때는 부르지 않는다 — 화면이 방금 스스로 받았다', () => {
  mockSocket.initial = 'open';
  const onArrive = jest.fn();
  let tree!: ReactTestRenderer;
  act(() => { tree = create(React.createElement(Probe, { onArrive })); });
  expect(onArrive).not.toHaveBeenCalled();
  act(() => tree.unmount());
});

test('화면이 포커스가 아니면 부르지 않는다 — 채팅 한 건마다 가려진 홈·모이깅이 다시 받지 않고, 돌아올 때의 재조회가 메운다', () => {
  mockFocused = false;
  const onArrive = jest.fn();
  let tree!: ReactTestRenderer;
  act(() => { tree = create(React.createElement(Probe, { onArrive })); });
  act(() => mockSocket.handler!({ type: 'NOTIFICATION', data: { id: 501 } }));
  act(() => mockSocket.status!('open'));
  expect(onArrive).not.toHaveBeenCalled();
  mockFocused = true;
  act(() => tree.update(React.createElement(Probe, { onArrive })));
  act(() => mockSocket.handler!({ type: 'NOTIFICATION', data: { id: 502 } }));
  expect(onArrive).toHaveBeenCalledTimes(1);
  expect(mockAcquire).toHaveBeenCalledTimes(1);
  act(() => tree.unmount());
});
