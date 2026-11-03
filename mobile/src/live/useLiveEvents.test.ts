import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import type { LiveEvent } from '../realtime/stomp';

const mockGet = jest.fn();
const mockLeave = jest.fn();
const mockDismiss = jest.fn();
const mockSocket = { event: (_: LiveEvent) => {}, status: (_: unknown) => {} };
jest.mock('../api/config', () => ({ createApiClient: () => ({ get: (...args: unknown[]) => mockGet(...args) }) }));
jest.mock('../feed/leave', () => ({ leaveForMembership: () => mockLeave() }));
jest.mock('expo-router', () => ({ router: { dismissTo: (...args: unknown[]) => mockDismiss(...args) } }));
jest.mock('../realtime/crew-socket', () => ({ acquireCrewSocket: () => ({
  onLive: (handler: (event: LiveEvent) => void) => { mockSocket.event = handler; },
  onStatus: (handler: (status: unknown) => void) => { mockSocket.status = handler; },
  close: () => {},
}) }));

import { useLiveEvents } from './useLiveEvents';

let tree: ReactTestRenderer;
beforeAll(() => { (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true; });
beforeEach(() => { mockGet.mockReset(); mockLeave.mockReset(); mockDismiss.mockReset(); });
afterEach(() => { act(() => tree.unmount()); });

test('조회 중 수신한 종료 이벤트를 응답 뒤에 반영한다', async () => {
  let resolve!: (value: unknown) => void;
  mockGet.mockReturnValue(new Promise((r) => { resolve = r; }));
  const calls: string[] = [];
  function Harness() {
    useLiveEvents(() => calls.push('event'), () => calls.push('snapshot'));
    return null;
  }
  await act(async () => { tree = create(React.createElement(Harness)); });
  await act(async () => { mockSocket.status('open'); });
  await act(async () => { mockSocket.event({ type: 'LIVE_ENDED', data: { userId: 'u1', activityId: 'a1' } }); });
  expect(calls).toEqual([]);
  await act(async () => { resolve({ data: [] }); });
  expect(calls).toEqual(['snapshot', 'event']);
});

test('4403 은 소속을 다시 확인하고 4401 은 로그인으로 이동한다', async () => {
  function Harness() { useLiveEvents(() => {}, () => {}); return null; }
  await act(async () => { tree = create(React.createElement(Harness)); });
  await act(async () => { mockSocket.status({ closed: 4403 }); });
  expect(mockLeave).toHaveBeenCalled();
  await act(async () => { mockSocket.status({ closed: 4401 }); });
  expect(mockDismiss).toHaveBeenCalledWith('/start');
});
