const snapshot = { endedAt: '2026-09-30T00:01:00Z', durationSec: 60, pausedSec: 0, distanceM: 10, steps: null, route: [] };
import { ApiError, createMockClient, type ApiClient } from '../api/client';
import type { Op } from './outbox';
import { undoItem } from './outbox';
import { newSession } from './session';
import { isSendingItem, startTracking, syncOutbox, tick } from './tracking';

let mockStored: ReturnType<typeof import('./store')['getStored']>;
const mockMutate = jest.mocked(createMockClient().mutate);
const mockPermission = jest.fn().mockResolvedValue({ granted: true });
const mockEnabled = jest.fn().mockResolvedValue(true);
const mockStart = jest.fn().mockResolvedValue(undefined);
jest.mock('../api/client', () => {
  const client = { mutate: jest.fn().mockResolvedValue({}) };
  return { ...jest.requireActual('../api/client'), createMockClient: () => client };
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

test('전송 중 되돌린 줍기는 생성 응답 뒤 삭제한다', async () => {
  mockStored.outbox = [{ kind: 'items', activityId: 'a1', photoId: null, items: [{ id: 'i1', category: 'CAN', quantity: 1 }] }];
  const mutate = jest.fn().mockImplementationOnce(async () => {
    mockStored.outbox = undoItem(mockStored.outbox, 'a1', 'i1', isSendingItem('i1'));
  }).mockResolvedValue({});
  expect(await syncOutbox({ mutate } as unknown as ApiClient)).toBe(true);
  expect(mutate.mock.calls.map(([path]) => path)).toEqual(['POST /activities/{id}/items', 'DELETE /activities/{id}/items/{itemId}']);
  expect(mockStored.outbox).toEqual([]);
});

test('오프라인은 큐를 보존하고 연결 후 재시도한다', async () => {
  mockStored.outbox = [{ kind: 'pause', activityId: 'a1' }];
  mockNetwork.mockResolvedValue({ isConnected: false });
  expect(await syncOutbox()).toBe(false);
  expect(mockMutate).not.toHaveBeenCalled();
  mockNetwork.mockResolvedValue({ isConnected: true });
  expect(await syncOutbox()).toBe(true);
  expect(mockStored.outbox).toEqual([]);
});

test.each(['success', 'conflict'])('종료 %s 응답은 서버 합계와 스냅샷을 반영한다', async (kind) => {
  mockStored.session = newSession({ id: 'a1', startedAt: '2026-09-30T00:00:00Z', pausedSec: 0, paused: false, pausedAt: null, itemCount: 2, locationShared: false }, 'u1', 0);
  mockStored.ended = snapshot;
  mockStored.outbox = [{ kind: 'end', activityId: 'a1', body: snapshot }];
  const data = { ...snapshot, id: 'a1', status: 'ENDED', distanceM: 20, itemCount: 2, byCategory: { CAN: 2 } };
  const mutate = kind === 'conflict' ? jest.fn().mockRejectedValue(new ApiError('CONFLICT')) : jest.fn().mockResolvedValue({ data });
  const get = jest.fn().mockResolvedValue({ data });
  expect(await syncOutbox({ mutate, get } as unknown as ApiClient)).toBe(true);
  expect(mockStored.ended).toEqual(expect.objectContaining({ distanceM: 20 }));
  expect(mockStored.session?.byCategory).toEqual({ CAN: 2 });
  expect(mockStored.outbox).toEqual([]);
});

test('이미 종료됐어도 줍기 합계가 다른 상세는 완료 처리하지 않는다', async () => {
  mockStored.session = newSession({ id: 'a1', startedAt: '2026-09-30T00:00:00Z', pausedSec: 0, paused: false, pausedAt: null, itemCount: 2, locationShared: false }, 'u1', 0);
  mockStored.outbox = [{ kind: 'end', activityId: 'a1', body: snapshot }];
  const mutate = jest.fn().mockRejectedValue(new ApiError('CONFLICT'));
  const get = jest.fn().mockResolvedValue({ data: { ...snapshot, id: 'a1', status: 'ENDED', itemCount: 0, byCategory: {} } });
  expect(await syncOutbox({ mutate, get } as unknown as ApiClient)).toBe(false);
  expect(mockStored.outbox).toHaveLength(1);
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
