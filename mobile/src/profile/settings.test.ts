jest.mock('../api/media', () => ({ mediaFile: async (uri: string) => ({ uri, name: 'photo.jpg', type: 'image/jpeg' }) }));
import React from 'react';
import SettingsScreen from '../../app/settings/index';
import { ApiError } from '../api/client';
import EditProfileScreen from '../../app/settings/profile';

const { act, create } = require('react-test-renderer');
const mockGet = jest.fn();
const mockMutate = jest.fn();
const mockForget = jest.fn();
const mockRemember = jest.fn();
const mockDismiss = jest.fn();
let mockUploadId = 0;
let mockOffline = false;
const mockToken = jest.fn();
let mockStored = { session: null, ended: null, outbox: [] as unknown[] };
jest.mock('../api/client', () => ({ ApiError: class extends Error { code: string; constructor(code: string) { super(code); this.code = code; } }, createMockClient: () => ({ get: (...args: unknown[]) => mockGet(...args), mutate: (...args: unknown[]) => mockMutate(...args) }) }));
jest.mock('expo-router', () => ({ router: { replace: jest.fn(), push: jest.fn(), back: jest.fn(), dismissTo: (...args: unknown[]) => mockDismiss(...args) }, useFocusEffect: (fn: () => void) => require('react').useEffect(fn, [fn]), useNavigation: () => ({ addListener: () => () => {}, dispatch: jest.fn() }) }));
jest.mock('expo-crypto', () => ({ randomUUID: () => `upload-${++mockUploadId}` }));
jest.mock('expo-image-picker', () => ({ launchImageLibraryAsync: async () => ({ canceled: false, assets: [{ uri: 'file:///profile.jpg' }] }) }));
jest.mock('../auth/social', () => ({ PROVIDER_KEY: { kakao: 'KAKAO', google: 'GOOGLE' }, providerToken: (...args: unknown[]) => mockToken(...args) }));
jest.mock('../auth/usePreventBack', () => ({ usePreventBack: jest.fn() }));
jest.mock('expo-constants', () => ({ default: { expoConfig: {} } }));
jest.mock('expo-network', () => ({ useNetworkState: () => ({ isConnected: !mockOffline }) }));
jest.mock('../activity/store', () => ({ getStored: () => mockStored, loadLastAccount: () => mockStored, loadAccount: jest.fn() }));
jest.mock('../auth/account', () => ({ currentAccount: () => ({ id: 'u1' }), rememberAccount: (...args: unknown[]) => mockRemember(...args), forgetAccount: () => mockForget() }));
jest.mock('design-system/src', () => new Proxy({ space: {}, size: {}, borderWidth: {}, radius: {}, useTheme: () => ({ colors: {} }), pressedOpacity: () => 1, useRipple: () => undefined }, { get: (target, key) => key === 'Dialog' ? (props: any) => require('react').createElement('Dialog', props, props.children, props.actions) : key in target ? target[key as keyof typeof target] : String(key) }));

let tree: ReturnType<typeof create>;
const user = { id: 'u1', nickname: '테스터', intro: '', photoUrl: null, hasPassword: true, membership: { status: 'MEMBER', crew: { name: '크루', isLeader: false } }, settings: { shareLocationDefault: false, notifyActivityStart: false } };
const agreements = { complete: true, items: [{ type: 'MARKETING', version: '2026-10', required: false, url: 'https://example.test/marketing', agreed: true, agreedAt: '2026-10-10T00:00:00Z' }] };

beforeEach(() => {
  mockOffline = false;
  mockUploadId = 0;
  mockStored = { session: null, ended: null, outbox: [] };
  mockGet.mockReset().mockImplementation((key: string) => Promise.resolve({ data: key === 'GET /users/me' ? user : key === 'GET /users/me/agreements' ? agreements : null }));
  mockMutate.mockReset().mockResolvedValue(undefined);
  mockToken.mockReset().mockResolvedValue('provider-token');
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

test('크루가 없거나 승인 대기면 로그아웃·회원 탈퇴만 보이고 로그아웃할 수 있다', async () => {
  const { router } = require('expo-router');
  for (const status of ['NONE', 'PENDING']) {
    router.replace.mockClear();
    mockGet.mockImplementation((key: string) => Promise.resolve({ data: key === 'GET /users/me' ? { ...user, membership: { status, crew: null } } : key === 'GET /users/me/agreements' ? agreements : null }));
    await mount();
    expect(router.replace).not.toHaveBeenCalled();
    expect(row('크루 나가기')).toBeUndefined();
    expect(row('위치 공유 기본값')).toBeUndefined();
    for (const hidden of ['프로필 수정', '마케팅 정보 수신', '차단 관리', '비밀번호 재설정']) expect(row(hidden)).toBeUndefined();
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

test('승인 대기 중에 탈퇴하면 기다리던 가입 신청도 취소된다고 알린다', async () => {
  mockGet.mockImplementation((key: string) => Promise.resolve({ data: key === 'GET /users/me' ? { ...user, membership: { status: 'PENDING', crew: null } } : key === 'GET /users/me/agreements' ? agreements : null }));
  await mount();
  await act(async () => row('회원 탈퇴').props.onPress());
  const dialog = tree.root.findAllByType('Dialog').find((node: any) => node.props.visible);
  const body = dialog.findAllByType('Txt').map((node: any) => node.props.children).join('');
  expect(body).toContain('기다리던 가입 신청도 취소돼요.');
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

test('크루 나가기가 실패하면 확인 버튼이 다시 눌린다', async () => {
  mockMutate.mockImplementation((key: string) => key === 'POST /crew/leave' ? Promise.reject(new Error('network')) : Promise.resolve(undefined));
  await mount();
  await act(async () => row('크루 나가기').props.onPress());
  await act(async () => button('나가기').props.onPress());
  expect(mockDismiss).not.toHaveBeenCalled();
  expect(button('나가기')?.props.loading).toBe(false);
});

test('마케팅 정보 수신을 끄면 MARKETING 한 항목만 PUT /users/me/agreements 로 보낸다', async () => {
  await mount();
  expect(row('마케팅 정보 수신').props.accessibilityState.checked).toBe(true);
  await act(async () => { row('마케팅 정보 수신').props.onPress(); });
  expect(row('마케팅 정보 수신').props.accessibilityState.checked).toBe(false);
  expect(mockMutate).toHaveBeenCalledWith('PUT /users/me/agreements', { items: [{ type: 'MARKETING', version: '2026-10', agreed: false }] });
});

test('마케팅 저장이 실패하면 스위치를 되돌린다', async () => {
  mockMutate.mockRejectedValue(new Error('500'));
  await mount();
  await act(async () => { row('마케팅 정보 수신').props.onPress(); });
  expect(row('마케팅 정보 수신').props.accessibilityState.checked).toBe(true);
});

test('동의 목록 조회가 실패해도 설정 화면은 뜨고 마케팅 행만 숨긴다', async () => {
  mockGet.mockImplementation((key: string) => key === 'GET /users/me/agreements' ? Promise.reject(new Error('500')) : Promise.resolve({ data: key === 'GET /users/me' ? user : null }));
  await mount();
  expect(row('마케팅 정보 수신')).toBeUndefined();
  expect(row('로그아웃')).toBeDefined();
});

test('마케팅 저장이 422 면 되돌리고 동의 목록을 다시 받는다', async () => {
  mockMutate.mockRejectedValue(new ApiError('VALIDATION'));
  await mount();
  mockGet.mockClear();
  await act(async () => { row('마케팅 정보 수신').props.onPress(); });
  expect(row('마케팅 정보 수신').props.accessibilityState.checked).toBe(true);
  expect(mockGet).toHaveBeenCalledWith('GET /users/me/agreements');
});

const snackbar = () => tree.root.findAllByType('Snackbar' as any)[0].props;
// design-system 목은 ListRow 를 문자열 노드로 그려 right 안의 요소가 트리에 없다. right prop 을 직접 본다
const socialRight = (name: string) => tree.root.findAll((n: any) => n.type === 'ListRow' && n.props.title === name)[0]?.props.right;
const linkButton = (name: string) => { const r = socialRight(name); return r?.props.accessibilityLabel === `${name} 계정 연결하기` ? r : undefined; };
const linkedChip = (name: string) => { const r = socialRight(name); return r?.props.accessibilityLabel === `${name} 연결됨` ? r : undefined; };
function withUser(patch: object) {
  mockGet.mockImplementation((key: string) => Promise.resolve({ data: key === 'GET /users/me' ? { ...user, ...patch } : key === 'GET /users/me/agreements' ? agreements : null }));
}

test('이메일 계정이 카카오를 연결하면 토큰을 PUT /users/me/social 로 보내고 연결됨으로 바꾼다', async () => {
  withUser({ linked: { kakao: false, google: false } });
  await mount();
  expect(linkButton('카카오').props.variant).toBe('kakao');
  await act(async () => linkButton('카카오').props.onPress());
  expect(mockToken).toHaveBeenCalledWith('kakao');
  expect(mockMutate).toHaveBeenCalledWith('PUT /users/me/social', { provider: 'KAKAO', token: 'provider-token' });
  expect(linkButton('카카오')).toBeUndefined();
  expect(linkedChip('카카오')).toBeDefined();
  expect(snackbar()).toMatchObject({ visible: true, message: '카카오 계정을 연결했어요. 이제 카카오로도 로그인할 수 있어요.' });
});

test('이미 연결된 제공자는 연결 버튼 대신 연결됨으로 보인다', async () => {
  withUser({ linked: { kakao: false, google: true } });
  await mount();
  expect(linkedChip('구글')).toBeDefined();
  expect(linkButton('구글')).toBeUndefined();
  expect(linkButton('카카오').props.onPress).toEqual(expect.any(Function));
});

test('다른 계정에 연결된 소셜 계정이면(409) 어느 계정인지 말하지 않고 안내한다', async () => {
  withUser({ linked: { kakao: false, google: false } });
  mockMutate.mockRejectedValueOnce(new ApiError('CONFLICT'));
  await mount();
  await act(async () => linkButton('구글').props.onPress());
  expect(snackbar()).toMatchObject({ visible: true, message: '이 구글 계정은 연결할 수 없어요. 다른 계정으로 시도해 주세요.' });
  expect(linkedChip('구글')).toBeUndefined();
});

test('연결 요청이 실패하면 다시 시도하라고 안내하고, 제공자 창을 닫으면 아무것도 보내지 않는다', async () => {
  withUser({ linked: { kakao: false, google: false } });
  mockToken.mockResolvedValueOnce(null);
  await mount();
  await act(async () => linkButton('카카오').props.onPress());
  expect(mockMutate).not.toHaveBeenCalled();
  expect(snackbar().visible).toBe(false);
  mockMutate.mockRejectedValueOnce(new ApiError('INTERNAL'));
  await act(async () => linkButton('카카오').props.onPress());
  expect(snackbar().message).toBe('카카오 계정을 연결하지 못했어요. 다시 시도해 주세요.');
});

test('소셜로 가입한 계정에는 로그인 연결 카드가 없다', async () => {
  withUser({ hasPassword: false, linked: { kakao: true, google: false } });
  await mount();
  expect(linkButton('구글')).toBeUndefined();
  expect(linkedChip('카카오')).toBeUndefined();
});
