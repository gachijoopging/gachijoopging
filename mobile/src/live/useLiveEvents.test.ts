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
jest.mock('expo-file-system', () => ({ Paths: { document: 'documents' }, File: class { get exists() { return false; } textSync() { return '[]'; } write() {} } }));
jest.mock('../auth/account', () => ({ currentAccount: () => ({ id: 'viewer', hasCrew: true }) }));

import { setUserBlocked } from '../profile/blocked-users';
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

test('차단 목록이 바뀌면 활동 중 크루원을 다시 받는다 — 차단 중에는 종료 이벤트가 오지 않아 해제한 사람의 낡은 위치가 되살아난다', async () => {
  mockGet.mockResolvedValue({ data: [] });
  const snapshots: unknown[] = [];
  function Harness() { useLiveEvents(() => {}, (members) => snapshots.push(members)); return null; }
  await act(async () => { tree = create(React.createElement(Harness)); });
  expect(mockGet).not.toHaveBeenCalled();
  await act(async () => { setUserBlocked('viewer', 'target', true); });
  expect(mockGet.mock.calls).toEqual([['GET /crew/live']]);
  expect(snapshots).toEqual([[]]);
  await act(async () => { setUserBlocked('viewer', 'target', false); });
  expect(mockGet).toHaveBeenCalledTimes(2);
});
