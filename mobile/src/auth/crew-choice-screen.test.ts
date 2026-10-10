import React from 'react';
import CrewChoiceScreen from '../../app/(onboarding)/crew-choice';

const { act, create } = require('react-test-renderer');
const mockGet = jest.fn();
const mockPush = jest.fn();
jest.mock('expo/src/winter/fetch', () => ({ fetch: jest.fn() }));
jest.mock('../api/onboarding', () => ({ onboardingApi: { get: (...a: unknown[]) => mockGet(...a), mutate: jest.fn() } }));
jest.mock('./destination', () => ({ authenticatedDestination: async () => '/crew-choice' }));
jest.mock('../ui/useFlash', () => ({ useFlash: () => [null, jest.fn()] }));
jest.mock('expo-router', () => ({
  router: { push: (...a: unknown[]) => mockPush(...a), replace: jest.fn() },
  useFocusEffect: jest.fn(),
  useNavigation: () => ({ reset: jest.fn() }),
}));
jest.mock('react-native', () => ({
  View: 'View',
  AppState: { addEventListener: () => ({ remove: () => {} }) },
  BackHandler: { addEventListener: () => ({ remove: () => {} }), exitApp: jest.fn() },
}));
jest.mock('design-system/src', () => new Proxy({ space: {} }, { get: (target, key) => (key in target ? target[key as keyof typeof target] : String(key)) }));

beforeAll(() => { (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true; });
beforeEach(() => {
  mockGet.mockReset().mockResolvedValue({ data: { profileComplete: true, membership: { status: 'NONE' } } });
  mockPush.mockClear();
});

let tree: ReturnType<typeof create>;
afterEach(() => act(() => tree.unmount()));
const card = (label: string) => tree.root.findAll((n: any) => n.type === 'Card' && n.props.accessibilityLabel === label)[0];

test('두 카드는 소속을 다시 확인한 뒤 크루 찾기·크루 만들기 화면으로 간다', async () => {
  await act(async () => { tree = create(React.createElement(CrewChoiceScreen)); });
  await act(async () => card('기존 크루에 들어가기, 크루 찾기').props.onPress());
  expect(mockPush).toHaveBeenCalledWith('/search-crew');
  await act(async () => card('크루 만들기').props.onPress());
  expect(mockPush).toHaveBeenCalledWith('/create-crew');
  expect(mockGet).toHaveBeenCalledTimes(2);
});

test('내 활동 기록은 미가입자에게도 열린다', async () => {
  await act(async () => { tree = create(React.createElement(CrewChoiceScreen)); });
  const records = tree.root.findAll((n: any) => n.type === 'Button' && n.props.label === '내 활동 기록 보기')[0];
  await act(async () => records.props.onPress());
  expect(mockPush).toHaveBeenCalledWith('/records');
});

test('크루 선택 화면에서 설정으로 갈 수 있다', async () => {
  await act(async () => { tree = create(React.createElement(CrewChoiceScreen)); });
  const action = tree.root.findAll((n: any) => n.type === 'AppHeader')[0].props.action;
  expect(action?.props.label).toBe('설정');
  await act(async () => action.props.onPress());
  expect(mockPush).toHaveBeenCalledWith('/settings');
});
