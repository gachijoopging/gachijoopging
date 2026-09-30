import { createMockClient, type ApiClient } from '../api/client';
import type { Op } from './outbox';
import { newSession } from './session';
import { syncOutbox, tick } from './tracking';

let mockStored: ReturnType<typeof import('./store')['getStored']>;
const mockMutate = jest.mocked(createMockClient().mutate);
const mockPermission = jest.fn().mockResolvedValue({ granted: true });
const mockEnabled = jest.fn().mockResolvedValue(true);
jest.mock('../api/client', () => {
  const client = { mutate: jest.fn().mockResolvedValue({}) };
  return { createMockClient: () => client };
});
jest.mock('expo-location', () => ({
  getForegroundPermissionsAsync: (...args: unknown[]) => mockPermission(...args),
  hasServicesEnabledAsync: (...args: unknown[]) => mockEnabled(...args),
}));
jest.mock('expo-task-manager', () => ({ defineTask: jest.fn() }));
jest.mock('../../modules/tracking-notification', () => ({ updateTrackingNotification: jest.fn() }));
jest.mock('./store', () => ({
  getStored: () => mockStored,
  updateStored: (fn: (st: typeof mockStored) => typeof mockStored) => { mockStored = fn(mockStored); },
}));

beforeEach(() => {
  mockStored = { session: null, ended: false, outbox: [] };
  mockMutate.mockClear();
  mockPermission.mockResolvedValue({ granted: true });
  mockEnabled.mockResolvedValue(true);
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
