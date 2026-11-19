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

test('토큰 리스너가 넘긴 토큰은 그대로 등록하고 토큰을 다시 가져오지 않는다 — 가져오면 리스너가 또 불려 끝없이 돈다', async () => {
  await push.syncPushToken(api, 'fcm-rolled');
  expect(mutate).toHaveBeenCalledTimes(1);
  expect(mutate).toHaveBeenCalledWith('PUT /users/me/devices', { pushToken: 'fcm-rolled', platform: 'ANDROID' });
  expect(mockGetToken).not.toHaveBeenCalled();
});

test('첫 등록이 끝나기 전에 리스너가 같은 토큰을 넘겨도 한 번만 보낸다 — 토큰을 가져오면 리스너도 그 토큰으로 불린다', async () => {
  let finish = () => {};
  mutate.mockImplementationOnce(() => new Promise<undefined>((resolve) => { finish = () => resolve(undefined); }));
  const first = push.syncPushToken(api);
  await flush();
  await push.syncPushToken(api, 'fcm-1');
  finish();
  await first;
  expect(mutate).toHaveBeenCalledTimes(1);
});

const router = { push: jest.fn(), dismissTo: jest.fn() };
const tap = (data: Record<string, string>) => ({ notificationId: '500', ...data });
const flush = () => new Promise((r) => setImmediate(r));
beforeEach(() => {
  router.push.mockReset();
  router.dismissTo.mockReset();
});

test('댓글 푸시를 누르면 그 알림을 읽음 처리하고 그 게시물(5-2)로 간다', async () => {
  await push.openPush(api, tap({ type: 'COMMENT', targetType: 'POST', targetId: 'po77' }), router, '/');
  expect(mutate).toHaveBeenCalledWith('POST /notifications/read', { ids: [500] });
  expect(router.push).toHaveBeenCalledWith({ pathname: '/posts/[id]', params: { id: 'po77' } });
});

test('공개 크루 가입(CREW_JOINED) 푸시는 크루장을 크루원 화면(3-11)으로 보낸다', async () => {
  await push.openPush(api, tap({ type: 'CREW_JOINED', targetType: 'MEMBERS' }), router, '/');
  expect(router.push).toHaveBeenCalledWith({ pathname: '/crew/members' });
});

test('가입 결과(CREW) 푸시는 GET /users/me 소속 분기로 간다 — 거절을 아직 확인하지 않았으면 1-9', async () => {
  get.mockResolvedValue({ data: { profileComplete: true, membership: { status: 'NONE', rejection: { requestId: 'r1', crew: { id: 'c1', name: '줍깅' }, decidedAt: '2026-11-18T00:00:00Z' } } } });
  await push.openPush(api, tap({ type: 'JOIN_REJECTED', targetType: 'CREW' }), router, '/crew-choice');
  expect(get).toHaveBeenCalledWith('GET /users/me');
  expect(router.dismissTo).toHaveBeenCalledWith('/pending-approval');
  expect(router.push).not.toHaveBeenCalled();
});

test('1-9 에 있으면 가입 결과 푸시는 그 화면에 맡긴다 — 1-9 가 푸시를 받아 스스로 다시 읽는다', async () => {
  get.mockResolvedValue({ data: { profileComplete: true, membership: { status: 'MEMBER' } } });
  await push.openPush(api, tap({ type: 'JOIN_APPROVED', targetType: 'CREW' }), router, '/pending-approval');
  expect(router.dismissTo).not.toHaveBeenCalled();
  expect(router.push).not.toHaveBeenCalled();
});

test('대상이 없는 알림(게시물 삭제·신고 결과)은 알림 목록(2-3)에서 이유를 보게 한다', async () => {
  await push.openPush(api, tap({ type: 'POST_REMOVED', targetType: 'POST' }), router, '/');
  expect(router.push).toHaveBeenCalledWith('/notifications');
});

test('읽음 요청이 실패해도 대상 화면으로 간다', async () => {
  mutate.mockRejectedValueOnce(new Error('offline'));
  await expect(push.openPush(api, tap({ type: 'NOTICE', targetType: 'NOTICE', targetId: 'n1' }), router, '/')).resolves.toBeUndefined();
  await flush();
  expect(router.push).toHaveBeenCalledWith({ pathname: '/crew/notices/[id]', params: { id: 'n1' } });
});

test('같은 알림을 두 번 열지 않는다 — 콜드 스타트의 마지막 응답과 리스너가 같은 탭을 두 번 줄 수 있다', async () => {
  const data = tap({ type: 'COMMENT', targetType: 'POST', targetId: 'po77' });
  await push.openPush(api, data, router, '/');
  await push.openPush(api, data, router, '/posts/po77');
  expect(router.push).toHaveBeenCalledTimes(1);
});

test('우리 서버가 보낸 알림이 아니면(notificationId 없음) 아무것도 하지 않는다', async () => {
  await push.openPush(api, { type: 'COMMENT' }, router, '/');
  await push.openPush(api, undefined, router, '/');
  expect(mutate).not.toHaveBeenCalled();
  expect(router.push).not.toHaveBeenCalled();
});

test('로그아웃한 뒤 알림창에 남은 푸시를 눌러도 아무 화면도 열지 않는다 — 로그인 화면 위에 게시물이 쌓이면 안 된다', async () => {
  mockAccount = null;
  await push.openPush(api, tap({ type: 'COMMENT', targetType: 'POST', targetId: 'po77' }), router, '/start');
  expect(mutate).not.toHaveBeenCalled();
  expect(router.push).not.toHaveBeenCalled();
  expect(router.dismissTo).not.toHaveBeenCalled();
});

test('미가입자는 어떤 푸시를 눌러도 GET /users/me 소속 분기로 간다 — 알림 목록(2-3)은 크루원만 연다', async () => {
  mockAccount = { id: 'u1', hasCrew: false, since: 1 };
  get.mockResolvedValue({ data: { profileComplete: true, membership: { status: 'NONE' } } });
  await push.openPush(api, tap({ type: 'REPORT_RESOLVED', targetType: 'NOTIFICATIONS' }), router, '/crew-choice');
  expect(get).toHaveBeenCalledWith('GET /users/me');
  expect(router.dismissTo).toHaveBeenCalledTimes(1);
  expect(router.push).not.toHaveBeenCalled();
});

test('가입 결과 푸시의 GET /users/me 가 실패하면 같은 알림을 다시 눌러 열 수 있다', async () => {
  mockAccount = { id: 'u1', hasCrew: false, since: 1 };
  const data = tap({ type: 'JOIN_APPROVED', targetType: 'CREW' });
  get.mockRejectedValueOnce(new Error('offline'));
  await push.openPush(api, data, router, '/crew-choice');
  expect(router.dismissTo).not.toHaveBeenCalled();
  get.mockResolvedValue({ data: { profileComplete: true, membership: { status: 'MEMBER' } } });
  await push.openPush(api, data, router, '/crew-choice');
  expect(router.dismissTo).toHaveBeenCalledWith('/(tabs)');
});

test('1-4·1-5(/nickname) 에 있으면 어떤 푸시도 열지 않고 읽음 처리도 하지 않는다 — 필수 동의·닉네임이 끝나야 크루 화면을 연다', async () => {
  get.mockResolvedValue({ data: { profileComplete: true, membership: { status: 'MEMBER' } } });
  await push.openPush(api, tap({ notificationId: '700', type: 'COMMENT', targetType: 'POST', targetId: 'po77' }), router, '/nickname');
  await push.openPush(api, tap({ notificationId: '701', type: 'JOIN_APPROVED', targetType: 'CREW' }), router, '/nickname');
  expect(mutate).not.toHaveBeenCalled();
  expect(get).not.toHaveBeenCalled();
  expect(router.push).not.toHaveBeenCalled();
  expect(router.dismissTo).not.toHaveBeenCalled();
});
