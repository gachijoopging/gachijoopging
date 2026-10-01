import React from 'react';
import NotificationsScreen from '../../app/notifications';
const { act, create } = require('react-test-renderer');
const mockGet = jest.fn();
let mockFocus: () => void;
jest.mock('expo-router', () => ({ router: {}, useFocusEffect: (callback: () => void) => { mockFocus = callback; require('react').useEffect(callback, [callback]); } }));
jest.mock('expo-notifications', () => ({ getPermissionsAsync: async () => ({ granted: true }) }));
jest.mock('../api/client', () => ({ createMockClient: () => ({ get: (...args: unknown[]) => mockGet(...args) }) }));
jest.mock('design-system/src', () => new Proxy({ space: {} }, { get: (target, key) => key in target ? target[key as keyof typeof target] : String(key) }));

test('신고 처리에서 돌아오면 알림 화면의 대기 건수를 다시 받는다', async () => {
  let pendingReports = 1;
  mockGet.mockImplementation((key: string) => Promise.resolve({ data: key === 'GET /notifications' ? { items: [], pending: { reports: pendingReports, joinRequests: 0 } } : key === 'GET /users/me' ? { membership: { status: 'MEMBER' } } : { count: 0 } }));
  let tree: ReturnType<typeof create>;
  await act(async () => { tree = create(React.createElement(NotificationsScreen)); });
  try {
    expect(tree.root.findAllByType('ListRow').some((row: any) => row.props.title.includes('신고 1건'))).toBe(true);
    pendingReports = 0;
    await act(async () => mockFocus());
    expect(tree.root.findAllByType('ListRow')).toHaveLength(0);
    expect(mockGet.mock.calls.filter(([key]) => key === 'GET /notifications')).toHaveLength(2);
  } finally { act(() => tree.unmount()); }
});
