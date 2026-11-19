import React from 'react';
import NotificationsScreen from '../../app/notifications';
const { act, create } = require('react-test-renderer');
const mockGet = jest.fn();
let mockFocus: () => void;
jest.mock('expo-router', () => ({ router: {}, useIsFocused: () => true, useFocusEffect: (callback: () => void) => { mockFocus = callback; require('react').useEffect(callback, [callback]); } }));
let mockArrive: () => void;
jest.mock('../realtime/crew-socket', () => ({ acquireCrewSocket: () => ({ onNotification: (handler: () => void) => { mockArrive = handler; return () => {}; }, onStatus: () => () => {}, close: () => {} }) }));
jest.mock('expo-notifications', () => ({ getPermissionsAsync: async () => ({ granted: true }) }));
jest.mock('../api/client', () => ({ createHttpClient: () => ({ get: (...args: unknown[]) => mockGet(...args) }) }));
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

test('안 읽은 알림은 점 색만이 아니라 굵은 제목으로도 구분한다', async () => {
  const item = (id: string, unread: boolean) => ({ id, type: 'NOTICE', title: id, detail: null, unread, createdAt: '2026-09-30T00:00:00Z', target: null });
  mockGet.mockImplementation((key: string) => Promise.resolve({ data: key === 'GET /notifications' ? { items: [item('새 공지', true), item('지난 공지', false)], pending: { reports: 0, joinRequests: 0 } } : key === 'GET /users/me' ? { membership: { status: 'MEMBER' } } : { count: 1 } }));
  let tree: ReturnType<typeof create>;
  await act(async () => { tree = create(React.createElement(NotificationsScreen)); });
  try {
    const row = (title: string) => tree.root.findAllByType('ListRow').find((r: any) => r.props.title === title);
    expect(row('새 공지').props.emphasized).toBe(true);
    expect(row('지난 공지').props.emphasized).toBeFalsy();
  } finally { act(() => tree.unmount()); }
});

test('알림 도착으로 다시 받다 실패하면 목록을 그대로 두고 연결 배너도 띄우지 않는다', async () => {
  const item = { id: 'n1', type: 'NOTICE', title: '새 공지', detail: null, unread: true, createdAt: '2026-09-30T00:00:00Z', target: null };
  let offline = false;
  mockGet.mockImplementation((key: string) => offline ? Promise.reject(new Error('offline')) : Promise.resolve({ data: key === 'GET /notifications' ? { items: [item], pending: { reports: 0, joinRequests: 0 } } : key === 'GET /users/me' ? { membership: { status: 'MEMBER' } } : { count: 1 } }));
  let tree: ReturnType<typeof create>;
  await act(async () => { tree = create(React.createElement(NotificationsScreen)); });
  try {
    offline = true;
    await act(async () => mockArrive());
    expect(tree.root.findAllByType('ListRow')).toHaveLength(1);
    expect(tree.root.findAllByType('Banner')).toHaveLength(0);
    expect(tree.root.findAllByType('ErrorState')).toHaveLength(0);
  } finally { act(() => tree.unmount()); }
});

test('첫 조회가 끝나기 전에 알림 도착 재조회가 겹쳐 실패하면 다시 시도할 수 있는 오류 상태를 보인다 — 로딩에 멈추면 안 된다', async () => {
  let hang = true;
  mockGet.mockImplementation(() => hang ? new Promise(() => {}) : Promise.reject(new Error('offline')));
  let tree: ReturnType<typeof create>;
  await act(async () => { tree = create(React.createElement(NotificationsScreen)); });
  try {
    hang = false;
    await act(async () => mockArrive());
    expect(tree.root.findAllByType('ErrorState')).toHaveLength(1);
  } finally { act(() => tree.unmount()); }
});
