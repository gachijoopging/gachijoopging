import React from 'react';
import CrewChoiceScreen from '../../app/(onboarding)/crew-choice';

const { act, create } = require('react-test-renderer');
const mockGet = jest.fn();
const mockMutate = jest.fn();
const mockPush = jest.fn();
const mockReset = jest.fn();
jest.mock('expo/src/winter/fetch', () => ({ fetch: jest.fn() }));
jest.mock('../api/client', () => ({
  ApiError: class extends Error {
    code: string;
    constructor(mockCode: string) { super(mockCode); this.code = mockCode; }
  },
}));
jest.mock('../api/onboarding', () => ({ onboardingApi: { get: (...a: unknown[]) => mockGet(...a), mutate: (...a: unknown[]) => mockMutate(...a) } }));
jest.mock('./destination', () => ({ authenticatedDestination: async () => '/crew-choice' }));
jest.mock('../ui/useFlash', () => ({ useFlash: () => [null, jest.fn()] }));
jest.mock('expo-router', () => ({
  router: { push: (...a: unknown[]) => mockPush(...a), replace: jest.fn() },
  useFocusEffect: jest.fn(),
  useNavigation: () => ({ reset: (...a: unknown[]) => mockReset(...a) }),
}));
jest.mock('react-native', () => ({
  View: 'View',
  Platform: { OS: 'android', select: (o: Record<string, unknown>) => o.android ?? o.default },
  AppState: { addEventListener: () => ({ remove: () => {} }) },
  BackHandler: { addEventListener: () => ({ remove: () => {} }), exitApp: jest.fn() },
}));
jest.mock('design-system/src', () => new Proxy({ space: {} }, { get: (target, key) => (key in target ? target[key as keyof typeof target] : String(key)) }));

beforeAll(() => { (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true; });
beforeEach(() => {
  mockGet.mockReset().mockResolvedValue({ data: { profileComplete: true, membership: { status: 'NONE' } } });
  mockMutate.mockReset().mockResolvedValue({ data: {} });
  mockPush.mockClear();
  mockReset.mockClear();
});

let tree: ReturnType<typeof create>;
afterEach(() => act(() => tree.unmount()));
const sheet = () => tree.root.findAll((n: any) => n.type === 'BottomSheet' && n.props.title === '새 크루 만들기')[0];
const card = (label: string) => tree.root.findAll((n: any) => n.type === 'Card' && n.props.accessibilityLabel === label)[0];
const nameField = () => tree.root.findAll((n: any) => n.type === 'Field' && n.props.label === '크루 이름')[0];
const createButton = () => tree.root.findAll((n: any) => n.type === 'Button' && n.props.label === '크루 만들기')[0];

async function openSheet() {
  await act(async () => { tree = create(React.createElement(CrewChoiceScreen)); });
  await act(async () => card('새 크루 만들기').props.onPress());
}

test('새 크루 만들기는 다른 화면으로 가지 않고 시트를 열어 이름 하나로 만든 뒤 홈으로 간다', async () => {
  await openSheet();
  expect(mockPush).not.toHaveBeenCalled();
  expect(sheet().props.visible).toBe(true);
  await act(async () => nameField().props.onChangeText('  한강줍깅크루  '));
  await act(async () => createButton().props.onPress());
  expect(mockMutate).toHaveBeenCalledWith('POST /crews', { name: '한강줍깅크루' });
  expect(sheet().props.visible).toBe(false);
  expect(mockReset).not.toHaveBeenCalled();
  await act(async () => sheet().props.onClosed());
  expect(mockReset).toHaveBeenCalledWith({ index: 0, routes: [{ name: '(tabs)' }] });
});

test('시트를 닫았다 다시 열면 지난번 오류가 남아 있지 않다', async () => {
  await openSheet();
  const { ApiError } = require('../api/client');
  mockMutate.mockRejectedValueOnce(new ApiError('CREW_NAME_TAKEN'));
  await act(async () => nameField().props.onChangeText('한강줍깅크루'));
  await act(async () => createButton().props.onPress());
  await act(async () => sheet().props.onClose());
  await act(async () => card('새 크루 만들기').props.onPress());
  expect(nameField().props.error).toBeUndefined();
});

test('이미 있는 크루 이름이면 이름 칸 아래에 알리고 시트에 머문다', async () => {
  await openSheet();
  const { ApiError } = require('../api/client');
  mockMutate.mockRejectedValueOnce(new ApiError('CREW_NAME_TAKEN'));
  await act(async () => nameField().props.onChangeText('한강줍깅크루'));
  await act(async () => createButton().props.onPress());
  expect(nameField().props.error).toBe('이미 사용 중인 크루 이름이에요.');
  expect(sheet().props.visible).toBe(true);
  expect(mockReset).not.toHaveBeenCalled();
});

test('크루 선택 화면에서 설정으로 갈 수 있다', async () => {
  await act(async () => { tree = create(React.createElement(CrewChoiceScreen)); });
  const action = tree.root.findAll((n: any) => n.type === 'AppHeader')[0].props.action;
  expect(action?.props.label).toBe('설정');
  await act(async () => action.props.onPress());
  expect(mockPush).toHaveBeenCalledWith('/settings');
});
