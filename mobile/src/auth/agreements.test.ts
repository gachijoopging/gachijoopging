import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
const mockFiles = new Map<string, string>();
const mockGet = jest.fn();
const mockMutate = jest.fn();
let mockUserId = 'viewer';
let mockUuid = 0;
jest.mock('expo/src/winter/fetch', () => ({ fetch: jest.fn() }));
jest.mock('expo-file-system', () => ({ Paths: { document: 'documents' }, File: class {
  name: string; constructor(_directory: string, name: string) { this.name = name; }
  get exists() { return mockFiles.has(this.name); }
  textSync() { return mockFiles.get(this.name); }
  write(value: string) { mockFiles.set(this.name, value); }
  delete() { mockFiles.delete(this.name); }
} }));
jest.mock('expo-linking', () => ({ openURL: jest.fn().mockResolvedValue(undefined) }));
jest.mock('expo-crypto', () => ({ randomUUID: () => `uuid-${++mockUuid}` }));
jest.mock('../api/onboarding', () => ({ onboardingApi: { get: (...args: unknown[]) => mockGet(...args), mutate: (...args: unknown[]) => mockMutate(...args) } }));
jest.mock('../api/client', () => ({ ApiError: class extends Error { code: string; fields: unknown; constructor(mockCode: string, mockFields?: unknown) { super(mockCode); this.code = mockCode; this.fields = mockFields; } }, createMockClient: () => ({ get: (...args: unknown[]) => mockGet(...args), mutate: (...args: unknown[]) => mockMutate(...args) }) }));
const mockReset = jest.fn();
jest.mock('expo-router', () => ({ router: { replace: jest.fn(), back: jest.fn(), dismissTo: jest.fn() }, useLocalSearchParams: () => ({}), useNavigation: () => ({ reset: (...a: unknown[]) => mockReset(...a) }), useFocusEffect: (fn: () => void) => require('react').useEffect(fn, [fn]) }));
jest.mock('react-native', () => ({ View: 'View', TextInput: 'TextInput', Platform: { OS: 'android', select: (options: Record<string, unknown>) => options.android ?? options.default }, BackHandler: { addEventListener: () => ({ remove: () => {} }) } }));
jest.mock('design-system/src', () => new Proxy({ space: { sm: 8 } }, { get: (target, key) => key in target ? target[key as keyof typeof target] : String(key) }));
jest.mock('./account', () => ({ rememberAccount: jest.fn(), currentAccount: () => ({ id: mockUserId, hasCrew: true }) }));
import SignUp from '../../app/(auth)/sign-up';
import Nickname from '../../app/(auth)/nickname';
import EditNotice from '../../app/crew/notices/edit';
import { clearAgreementChoices, rememberAgreementChoices, restoreAgreementChoices, type AgreementItem } from './agreements';
const { router } = require('expo-router');
const MockApiError = require('../api/client').ApiError;
const definitions = (version = 'v1') => [
  { type: 'TERMS', version, required: true, url: 'https://example.test/terms' },
  { type: 'PRIVACY', version: 'v1', required: true, url: 'https://example.test/privacy' },
  { type: 'MARKETING', version: 'v1', required: false, url: 'https://example.test/marketing' },
];
const state = (version = 'v1') => ({ complete: false, items: definitions(version).map((item) => ({ ...item, agreed: false, agreedAt: null })) });
const me = () => ({ id: mockUserId, nickname: '기존별명', profileComplete: true, membership: { status: 'MEMBER', crew: { id: 'crew', isLeader: true } } });
let tree: ReactTestRenderer;
beforeAll(() => { (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true; });
beforeEach(() => {
  mockUserId += 'x'; mockFiles.clear(); clearAgreementChoices('signup');
  mockGet.mockReset().mockImplementation((key: string) => Promise.resolve({ data: key === 'GET /agreements' ? { items: definitions() } : key === 'GET /users/me/agreements' ? state() : me() }));
  mockMutate.mockReset().mockImplementation((key: string) => Promise.resolve(key === 'PUT /users/me/agreements' ? { data: { ...state(), complete: true } } : { data: { id: 'notice' } }));
  router.replace.mockClear();
  mockReset.mockClear();
});
afterEach(() => { act(() => tree.unmount()); });
async function mount(Component: () => React.JSX.Element) { await act(async () => { tree = create(React.createElement(Component)); }); }
async function fill(label: string, value: string) { await act(async () => tree.root.findAllByType('Field' as never).find((node) => node.props.label === label)!.props.onChangeText(value)); }
function acceptRequired() { act(() => { const boxes = tree.root.findAllByType('Checkbox' as never); boxes[0].props.onChange(true); boxes[1].props.onChange(true); }); }
async function press(label: string) { await act(async () => { await tree.root.findAllByType('Button' as never).find((node) => node.props.label === label)!.props.onPress(); }); }

test('signup loads public catalogue and retries agreement storage without recreating the account', async () => {
  mockMutate.mockImplementationOnce(() => Promise.resolve({})).mockImplementationOnce(() => Promise.reject(new Error('offline')));
  await mount(SignUp);
  await fill('이메일', 'user@example.test'); await fill('비밀번호', 'password'); await fill('닉네임', '새별명'); acceptRequired();
  await press('회원가입');
  expect(mockReset).not.toHaveBeenCalled();
  await press('회원가입');
  expect(mockMutate.mock.calls.filter(([key]) => key === 'POST /auth/signup')).toHaveLength(1);
  const puts = mockMutate.mock.calls.filter(([key]) => key === 'PUT /users/me/agreements');
  expect(puts).toHaveLength(2);
  expect(puts[1][1].items).toEqual(expect.arrayContaining([{ type: 'MARKETING', version: 'v1', agreed: false }]));
  expect(mockReset).toHaveBeenCalledWith({ index: 0, routes: [{ name: '(tabs)' }] });
  expect(mockGet).toHaveBeenCalledWith('GET /agreements');
});

test('reconsent prefills saved nickname and skips an unchanged nickname mutation', async () => {
  await mount(Nickname);
  expect(tree.root.findByType('Field' as never).props.value).toBe('기존별명');
  acceptRequired(); await press('다음');
  expect(mockMutate.mock.calls.map(([key]) => key)).toEqual(['PUT /users/me/agreements']);
  expect(mockReset).toHaveBeenCalledWith({ index: 0, routes: [{ name: '(tabs)' }] });
});

test('version refresh preserves nickname and unchanged-version choice but clears new-version consent', async () => {
  await mount(Nickname); acceptRequired(); await fill('닉네임', '바꾼별명');
  mockGet.mockImplementation((key: string) => Promise.resolve({ data: key === 'GET /users/me/agreements' ? state('v2') : me() }));
  mockMutate.mockImplementation((key: string) => key === 'PUT /users/me/agreements' ? Promise.reject(new MockApiError('VALIDATION', [{ field: 'items', code: 'FORMAT' }])) : Promise.resolve({}));
  await press('다음');
  expect(tree.root.findByType('Field' as never).props.value).toBe('바꾼별명');
  const boxes = tree.root.findAllByType('Checkbox' as never);
  expect(boxes[0].props.checked).toBe(false); expect(boxes[1].props.checked).toBe(true);
  expect(mockReset).not.toHaveBeenCalled();
});

test('missing catalogue exposes retry and prevents signup', async () => {
  mockGet.mockRejectedValue(new Error('unconfigured'));
  await mount(SignUp);
  expect(tree.root.findAllByType('Button' as never).find((node) => node.props.label === '회원가입')!.props.disabled).toBe(true);
  expect(tree.root.findByType('Banner' as never).props.action.label).toBe('다시 시도');
});

test('agreement drafts are account and version scoped', () => {
  const items = state().items as AgreementItem[];
  rememberAgreementChoices('a', items.map((item) => ({ ...item, agreed: true })));
  expect(restoreAgreementChoices('b', items).every((item) => !item.agreed)).toBe(true);
  expect(restoreAgreementChoices('a', state('v2').items as AgreementItem[])[0].agreed).toBe(false);
  act(() => { tree = create(React.createElement('View')); });
});

test('new notice retry retains its UUID across a lost response', async () => {
  await mount(EditNotice);
  await fill('제목', '새 공지'); await fill('내용', '공지 본문');
  mockMutate.mockRejectedValueOnce(new Error('lost response')).mockResolvedValueOnce({ data: { id: 'notice' } });
  await press('공지 올리기'); await press('공지 올리기');
  const requests = mockMutate.mock.calls.filter(([key]) => key === 'POST /crew/notices');
  expect(requests).toHaveLength(2);
  expect(requests[0][1].id).toBe(requests[1][1].id);
  expect(requests[0][1].id).toMatch(/^uuid-/);
});
