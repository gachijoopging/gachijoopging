import React from 'react';
import PendingApprovalScreen from '../../app/(onboarding)/pending-approval';

const { act, create } = require('react-test-renderer');
const mockGet = jest.fn();
const mockPush = jest.fn();
const mockNavigation = { reset: jest.fn() };
jest.mock('expo/src/winter/fetch', () => ({ fetch: jest.fn() }));
jest.mock('../api/client', () => ({ ApiError: class extends Error {} }));
jest.mock('../api/onboarding', () => ({ onboardingApi: { get: (...a: unknown[]) => mockGet(...a), mutate: jest.fn() } }));
jest.mock('../ui/useFlash', () => ({ useFlash: () => [null, jest.fn()] }));
jest.mock('expo-notifications', () => ({
  addNotificationReceivedListener: () => ({ remove: jest.fn() }),
  addNotificationResponseReceivedListener: () => ({ remove: jest.fn() }),
}));
jest.mock('expo-router', () => {
  const { useEffect } = require('react');
  return {
    router: { push: (...a: unknown[]) => mockPush(...a) },
    useNavigation: () => mockNavigation,
    useFocusEffect: (fn: () => () => void) => useEffect(fn, [fn]),
  };
});
jest.mock('react-native', () => ({
  View: 'View',
  RefreshControl: 'RefreshControl',
  AppState: { addEventListener: () => ({ remove: jest.fn() }) },
  BackHandler: { addEventListener: () => ({ remove: jest.fn() }), exitApp: jest.fn() },
}));
jest.mock('design-system/src', () => new Proxy({}, { get: (_, key) => String(key) }));

beforeAll(() => { (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true; });

test('승인 대기 중에도 내 활동 기록으로 갈 수 있다', async () => {
  mockGet.mockImplementation((key: string) => Promise.resolve(key === 'GET /users/me'
    ? { data: { membership: { status: 'PENDING', crew: { name: '한강줍깅크루' }, rejection: null } } }
    : { data: { id: 'jr001', crew: { name: '한강줍깅크루' }, status: 'PENDING' } }));
  let tree: ReturnType<typeof create>;
  await act(async () => { tree = create(React.createElement(PendingApprovalScreen)); });
  const records = tree!.root.findAll((n: any) => n.type === 'Button' && n.props.label === '내 활동 기록 보기')[0];
  await act(async () => records.props.onPress());
  expect(mockPush).toHaveBeenCalledWith('/records');
  act(() => tree.unmount());
});
