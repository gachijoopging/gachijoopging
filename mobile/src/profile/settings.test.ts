jest.mock('../api/media', () => ({ mediaFile: async (uri: string) => ({ uri, name: 'photo.jpg', type: 'image/jpeg' }) }));
import React from 'react';
import SettingsScreen from '../../app/settings/index';
import EditProfileScreen from '../../app/settings/profile';

const { act, create } = require('react-test-renderer');
const mockGet = jest.fn();
const mockMutate = jest.fn();
const mockForget = jest.fn();
const mockRemember = jest.fn();
const mockDismiss = jest.fn();
let mockUploadId = 0;
let mockOffline = false;
let mockStored = { session: null, ended: null, outbox: [] as unknown[] };
jest.mock('../api/client', () => ({ ApiError: class extends Error {}, createMockClient: () => ({ get: (...args: unknown[]) => mockGet(...args), mutate: (...args: unknown[]) => mockMutate(...args) }) }));
jest.mock('expo-router', () => ({ router: { replace: jest.fn(), push: jest.fn(), back: jest.fn(), dismissTo: (...args: unknown[]) => mockDismiss(...args) }, useFocusEffect: (fn: () => void) => require('react').useEffect(fn, [fn]), useNavigation: () => ({ addListener: () => () => {}, dispatch: jest.fn() }) }));
jest.mock('expo-crypto', () => ({ randomUUID: () => `upload-${++mockUploadId}` }));
jest.mock('expo-image-picker', () => ({ launchImageLibraryAsync: async () => ({ canceled: false, assets: [{ uri: 'file:///profile.jpg' }] }) }));
jest.mock('../auth/usePreventBack', () => ({ usePreventBack: jest.fn() }));
jest.mock('expo-constants', () => ({ default: { expoConfig: {} } }));
jest.mock('expo-network', () => ({ useNetworkState: () => ({ isConnected: !mockOffline }) }));
jest.mock('../activity/store', () => ({ getStored: () => mockStored, loadLastAccount: () => mockStored, loadAccount: jest.fn() }));
jest.mock('../auth/account', () => ({ currentAccount: () => ({ id: 'u1' }), rememberAccount: (...args: unknown[]) => mockRemember(...args), forgetAccount: () => mockForget() }));
jest.mock('design-system/src', () => new Proxy({ space: {}, size: {}, borderWidth: {}, radius: {}, useTheme: () => ({ colors: {} }), pressedOpacity: () => 1, useRipple: () => undefined }, { get: (target, key) => key === 'Dialog' ? (props: any) => require('react').createElement('Dialog', props, props.children, props.actions) : key in target ? target[key as keyof typeof target] : String(key) }));

let tree: ReturnType<typeof create>;
const user = { id: 'u1', nickname: '테스터', intro: '', photoUrl: null, hasPassword: true, membership: { status: 'MEMBER', crew: { name: '크루', isLeader: false } }, settings: { shareLocationDefault: false, notifyActivityStart: false } };
beforeEach(() => {
  mockOffline = false;
  mockUploadId = 0;
  mockStored = { session: null, ended: null, outbox: [] };
  mockGet.mockReset().mockImplementation((key: string) => Promise.resolve({ data: key === 'GET /users/me' ? user : null }));
  mockMutate.mockReset().mockResolvedValue(undefined);
  mockForget.mockClear(); mockRemember.mockClear(); mockDismiss.mockClear();
});
afterEach(() => { if (tree) act(() => tree.unmount()); });
const row = (title: string) => tree.root.findAll((node: any) => (node.type === 'ListRow' && node.props.title === title) || (node.props.accessibilityRole === 'switch' && node.props.accessibilityLabel === title && node.props.onPress))[0];
const button = (label: string) => tree.root.findAllByType('Button').find((node: any) => node.props.label === label);
async function mount() { await act(async () => { tree = create(React.createElement(SettingsScreen)); }); }

test('서로 다른 설정의 동시 토글이 앞선 변경을 덮어쓰지 않는다', async () => {
  let finish!: () => void;
  mockMutate.mockImplementation(() => new Promise<void>((resolve) => { finish = resolve; }));
  await mount();
  await act(async () => { void row('위치 공유 기본값').props.onPress(); void row('활동 시작 알림').props.onPress(); });
  expect(['위치 공유 기본값', '활동 시작 알림'].map((title) => row(title).props.accessibilityState.checked)).toEqual([true, true]);
  expect(mockMutate).toHaveBeenCalledTimes(2);
  await act(async () => { void row('활동 시작 알림').props.onPress(); });
  expect(mockMutate).toHaveBeenCalledTimes(2);
  await act(async () => finish());
});

test('오프라인 토글은 되돌리고 서버 요청을 보내지 않는다', async () => {
  mockOffline = true;
  await mount();
  await act(async () => row('위치 공유 기본값').props.onPress());
  expect(row('위치 공유 기본값').props.accessibilityState.checked).toBe(false);
  expect(mockMutate).not.toHaveBeenCalled();
});

test('재실행 뒤 복구된 큐가 남으면 로그아웃과 계정 삭제를 막는다', async () => {
  mockStored.outbox = [{ kind: 'end' }];
  await mount();
  await act(async () => row('로그아웃').props.onPress());
  expect(tree.root.findAllByType('Dialog').some((node: any) => node.props.visible && node.props.title === '먼저 활동 종료와 동기화를 완료해 주세요')).toBe(true);
  expect(mockForget).not.toHaveBeenCalled();
  expect(mockMutate).not.toHaveBeenCalled();
});

test('로그아웃 요청이 실패해도 사전 검증 완료 후 로컬 계정을 해제한다', async () => {
  mockMutate.mockRejectedValue(new Error('network'));
  await mount();
  await act(async () => row('로그아웃').props.onPress());
  await act(async () => button('로그아웃').props.onPress());
  expect(mockForget).toHaveBeenCalledTimes(1);
  expect(mockDismiss).toHaveBeenCalledWith('/start');
});

test('프로필 사진 업로드 응답이 유실돼도 같은 업로드 id로 재시도한다', async () => {
  mockMutate.mockRejectedValueOnce(new Error('lost response')).mockResolvedValue({ data: { mediaId: 'm1' } });
  await act(async () => { tree = create(React.createElement(EditProfileScreen)); });
  await act(async () => row('앨범에서 선택').props.onPress());
  await act(async () => button('저장').props.onPress());
  await act(async () => button('저장').props.onPress());
  const uploads = mockMutate.mock.calls.filter(([key]) => key === 'POST /media');
  expect(uploads).toHaveLength(2);
  expect(uploads.map(([, body]) => body.get('mediaId'))).toEqual(['upload-1', 'upload-1']);
});

test('크루가 없거나 승인 대기여도 설정에 머물러 계정 행만 보이고 로그아웃할 수 있다', async () => {
  const { router } = require('expo-router');
  for (const status of ['NONE', 'PENDING']) {
    router.replace.mockClear();
    mockGet.mockImplementation((key: string) => Promise.resolve({ data: key === 'GET /users/me' ? { ...user, membership: { status, crew: null } } : null }));
    await mount();
    expect(router.replace).not.toHaveBeenCalled();
    expect(row('크루 나가기')).toBeUndefined();
    expect(row('위치 공유 기본값')).toBeUndefined();
    expect(row('로그아웃')).toBeDefined();
    expect(row('회원 탈퇴')).toBeDefined();
    act(() => tree.unmount());
  }
  await mount();
  await act(async () => row('로그아웃').props.onPress());
  await act(async () => button('로그아웃')!.props.onPress());
  expect(mockForget).toHaveBeenCalled();
  expect(mockDismiss).toHaveBeenCalledWith('/start');
});

test('동기화가 남아 막혔을 때 줍깅 탭으로 바로 갈 수 있다', async () => {
  const { router } = require('expo-router');
  mockStored = { session: null, ended: null, outbox: [{ kind: 'end', activityId: 'a1' }] };
  await mount();
  await act(async () => row('로그아웃').props.onPress());
  const dialog = tree.root.findAll((n: any) => n.type === 'Dialog' && n.props.visible)[0];
  expect(dialog.props.title).toBe('먼저 활동 종료와 동기화를 완료해 주세요');
  expect(button('확인')).toBeUndefined();
  await act(async () => button('줍깅 탭으로 이동')!.props.onPress());
  // 이미 있는 탭으로 돌아간다. 탭을 하나 더 쌓으면 줍깅에서 뒤로가 설정으로 돌아온다
  expect(mockDismiss).toHaveBeenCalledWith('/(tabs)/plogging');
  expect(router.replace).not.toHaveBeenCalled();
  expect(button('닫기')).toBeDefined();
});
