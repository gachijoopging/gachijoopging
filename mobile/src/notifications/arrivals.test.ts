import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

const mockSocket = { handler: null as null | ((event: unknown) => void), close: jest.fn() };
const mockAcquire = jest.fn(() => ({
  onNotification: (handler: (event: unknown) => void) => {
    mockSocket.handler = handler;
    return () => {};
  },
  close: mockSocket.close,
}));
jest.mock('../realtime/crew-socket', () => ({ acquireCrewSocket: () => mockAcquire() }));
import { useNotificationArrivals } from './useNotificationArrivals';

function Probe({ onArrive }: { onArrive: () => void }) {
  useNotificationArrivals(onArrive);
  return null;
}

beforeEach(() => {
  mockSocket.handler = null;
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
