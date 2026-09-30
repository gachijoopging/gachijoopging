const snapshot = { endedAt: '2026-09-30T00:01:00Z', durationSec: 60, pausedSec: 0, distanceM: 10, steps: null, route: [] };
import { createMockClient, type ApiClient } from '../api/client';
import type { Op } from './outbox';
import { newSession } from './session';
import { startTracking, syncOutbox, tick } from './tracking';

let mockStored: ReturnType<typeof import('./store')['getStored']>;
const mockMutate = jest.mocked(createMockClient().mutate);
const mockPermission = jest.fn().mockResolvedValue({ granted: true });
const mockEnabled = jest.fn().mockResolvedValue(true);
const mockStart = jest.fn().mockResolvedValue(undefined);
jest.mock('../api/client', () => {
  const client = { mutate: jest.fn().mockResolvedValue({}) };
  return { createMockClient: () => client };
});
jest.mock('expo-location', () => ({
  Accuracy: { BestForNavigation: 6 },
  hasStartedLocationUpdatesAsync: jest.fn().mockResolvedValue(true),
  startLocationUpdatesAsync: (...args: unknown[]) => mockStart(...args),
  getForegroundPermissionsAsync: (...args: unknown[]) => mockPermission(...args),
  hasServicesEnabledAsync: (...args: unknown[]) => mockEnabled(...args),
}));
const mockNetwork = jest.fn().mockResolvedValue({ isConnected: true, isInternetReachable: true });
jest.mock('expo-network', () => ({ getNetworkStateAsync: () => mockNetwork() }));
jest.mock('expo-task-manager', () => ({ defineTask: jest.fn() }));
jest.mock('../../modules/tracking-notification', () => ({ updateTrackingNotification: jest.fn() }));
jest.mock('./store', () => ({
  getStored: () => mockStored,
  updateStored: (fn: (st: typeof mockStored) => typeof mockStored) => { mockStored = fn(mockStored); },
}));

beforeEach(() => {
  mockStored = { session: null, ended: null, outbox: [] };
  mockMutate.mockClear();
  mockPermission.mockResolvedValue({ granted: true });
  mockEnabled.mockResolvedValue(true);
  mockStart.mockClear();
  mockNetwork.mockResolvedValue({ isConnected: true, isInternetReachable: true });
});

test('작업이 등록되어 있어도 재실행에서 포그라운드 서비스를 다시 시작한다', async () => {
  mockStored.session = newSession({ id: 'a1', startedAt: '2026-09-30T00:00:00Z', pausedSec: 0, paused: false, pausedAt: null, itemCount: 0, locationShared: false }, 'u1', 0);
  expect(await startTracking()).toBe(true);
  expect(mockStart).toHaveBeenCalledWith('gachi-activity-tracking', expect.objectContaining({ foregroundService: expect.any(Object) }));
  mockStored.ended = snapshot;
  expect(await startTracking()).toBe(false);
  expect(mockStart).toHaveBeenCalledTimes(1);
});

test('빈 큐를 동기화해도 다음 동기화를 막지 않는다', async () => {
  await syncOutbox();
  mockStored.outbox = [{ kind: 'pause', activityId: 'a1' }];
  await syncOutbox();
  expect(mockMutate).toHaveBeenCalledTimes(1);
  expect(mockStored.outbox).toEqual([]);
});

test('다음 요청 실패 전에 성공한 요청을 디스크 상태에서 제거한다', async () => {
  const first: Op = { kind: 'pause', activityId: 'a1' };
  const second: Op = { kind: 'resume', activityId: 'a1' };
  mockStored.outbox = [first, second];
  const mutate = jest.fn()
    .mockImplementationOnce(async () => {})
    .mockImplementationOnce(async () => {
      expect(mockStored.outbox).toEqual([second]);
      throw new Error('offline');
    });
  await syncOutbox({ mutate } as unknown as ApiClient);
  expect(mockStored.outbox).toEqual([second]);
});

test('전송 중 추가한 종료 요청도 진행 중인 동기화가 순서대로 보낸다', async () => {
  const first: Op = { kind: 'pause', activityId: 'a1' };
  const second: Op = { kind: 'resume', activityId: 'a1' };
  mockStored.outbox = [first];
  const mutate = jest.fn().mockImplementationOnce(async () => {
    mockStored.outbox = [...mockStored.outbox, second];
  }).mockResolvedValue({});
  await syncOutbox({ mutate } as unknown as ApiClient);
  expect(mutate.mock.calls.map(([path]) => path)).toEqual(['POST /activities/{id}/pause', 'POST /activities/{id}/resume']);
  expect(mockStored.outbox).toEqual([]);
});

test.each(['permission', 'services'])('위치 %s가 꺼지면 마지막 좌표를 보내지 않는다', async (off) => {
  const session = newSession({ id: 'a1', startedAt: '2026-09-30T00:00:00Z', pausedSec: 0, paused: false, pausedAt: null, itemCount: 0, locationShared: true }, 'u1', 0);
  mockStored.session = { ...session, here: { latitude: 37, longitude: 127, accuracy: 5 } };
  if (off === 'permission') mockPermission.mockResolvedValue({ granted: false });
  else mockEnabled.mockResolvedValue(false);
  await tick(off === 'permission' ? 10_000 : 20_000);
  expect(mockMutate).toHaveBeenCalledWith('POST /activities/{id}/live', expect.objectContaining({ location: null }));
});
