const mockAsked = new Set<string>();
jest.mock('expo-file-system', () => ({
  Paths: { document: 'documents' },
  File: class {
    mockPath: string;
    constructor(...parts: string[]) { this.mockPath = parts.join('/'); }
    get exists() { return mockAsked.has(this.mockPath); }
    create() { mockAsked.add(this.mockPath); }
  },
}));
const mockPermission = jest.fn(async () => ({ status: 'undetermined', canAskAgain: true }));
const mockRequest = jest.fn(async () => ({ status: 'granted' }));
let mockToken = 'fcm-1';
const mockGetToken = jest.fn(async () => ({ type: 'android', data: mockToken }));
jest.mock('expo-notifications', () => ({
  getPermissionsAsync: () => mockPermission(),
  requestPermissionsAsync: () => mockRequest(),
  getDevicePushTokenAsync: () => mockGetToken(),
}));
let mockAccount: { id: string; hasCrew: boolean; since?: number } | null = null;
jest.mock('../auth/account', () => ({ currentAccount: () => mockAccount }));
import type { ApiClient } from '../api/client';

const mutate = jest.fn(async (_key: string, _body?: unknown) => undefined);
const get = jest.fn();
const api = { get, mutate } as unknown as ApiClient;

let push: typeof import('./push');
beforeEach(() => {
  jest.resetModules();
  push = require('./push');
  mockAsked.clear();
  mockAccount = { id: 'u1', hasCrew: true, since: 1 };
  mockToken = 'fcm-1';
  mutate.mockReset().mockResolvedValue(undefined);
  get.mockReset();
  mockRequest.mockClear();
  mockGetToken.mockClear();
});

test('로그인돼 있으면 알림 권한을 한 번 묻고 토큰을 PUT /users/me/devices 로 등록한다', async () => {
  await push.syncPushToken(api);
  expect(mockRequest).toHaveBeenCalledTimes(1);
  expect(mutate).toHaveBeenCalledWith('PUT /users/me/devices', { pushToken: 'fcm-1', platform: 'ANDROID' });

  mockAccount = { id: 'u1', hasCrew: true, since: 2 };
  await push.syncPushToken(api);
  expect(mockRequest).toHaveBeenCalledTimes(1);
});

test('4-2 에서 이미 물었으면 로그인 뒤에도 다시 묻지 않는다 — 같은 "물었음" 기록을 쓴다', async () => {
  const { NOTIFY_ASKED_FILE } = require('../plogging/notify-permission') as typeof import('../plogging/notify-permission');
  mockAsked.add(`documents/${NOTIFY_ASKED_FILE}`);
  await push.syncPushToken(api);
  expect(mockRequest).not.toHaveBeenCalled();
  expect(mutate).toHaveBeenCalledWith('PUT /users/me/devices', { pushToken: 'fcm-1', platform: 'ANDROID' });
});

test('같은 계정·토큰은 다시 보내지 않고, 다시 로그인하거나 토큰이 바뀌면 다시 보낸다', async () => {
  await push.syncPushToken(api);
  await push.syncPushToken(api);
  expect(mutate).toHaveBeenCalledTimes(1);

  mockAccount = { id: 'u1', hasCrew: true, since: 2 };
  await push.syncPushToken(api);
  expect(mutate).toHaveBeenCalledTimes(2);

  mockToken = 'fcm-2';
  await push.syncPushToken(api);
  expect(mutate).toHaveBeenCalledTimes(3);
  expect(mutate).toHaveBeenLastCalledWith('PUT /users/me/devices', { pushToken: 'fcm-2', platform: 'ANDROID' });
});

test('로그인 전이면 묻지도 등록하지도 않는다', async () => {
  mockAccount = null;
  await push.syncPushToken(api);
  expect(mockRequest).not.toHaveBeenCalled();
  expect(mockGetToken).not.toHaveBeenCalled();
  expect(mutate).not.toHaveBeenCalled();
});

test('등록이 실패해도 던지지 않고, 다음 확인 때 다시 보낸다', async () => {
  mutate.mockRejectedValueOnce(new Error('offline'));
  await expect(push.syncPushToken(api)).resolves.toBeUndefined();
  await push.syncPushToken(api);
  expect(mutate).toHaveBeenCalledTimes(2);
});

test('토큰을 못 얻으면(FCM 설정 없음) 등록하지 않고 던지지 않는다', async () => {
  mockGetToken.mockRejectedValueOnce(new Error('no google-services.json'));
  await expect(push.syncPushToken(api)).resolves.toBeUndefined();
  expect(mutate).not.toHaveBeenCalled();
});
