import { markAllRead, markRead, markUnread, notificationDestination, relativeTime } from './notifications';

/** 기기 시간대 기준 2026-09-27 12:00 */
const NOW = new Date(2026, 8, 27, 12, 0);
const at = (...args: [number, number, number, number, number]) => new Date(...args).toISOString();

describe('알림 상대 시각', () => {
  test('1분 안은 방금', () => {
    expect(relativeTime(new Date(NOW.getTime() - 30_000).toISOString(), NOW)).toBe('방금');
  });

  test('60분 안은 N분 전', () => {
    expect(relativeTime(at(2026, 8, 27, 11, 55), NOW)).toBe('5분 전');
  });

  test('24시간 안은 N시간 전', () => {
    expect(relativeTime(at(2026, 8, 27, 9, 0), NOW)).toBe('3시간 전');
  });

  test('24시간이 지났고 날짜가 어제면 어제', () => {
    expect(relativeTime(at(2026, 8, 26, 8, 0), NOW)).toBe('어제');
  });

  test('그보다 전이면 M월 D일', () => {
    expect(relativeTime(at(2026, 8, 7, 17, 30), NOW)).toBe('9월 7일');
  });

  test('해가 다르면 YYYY.M.D', () => {
    expect(relativeTime(at(2025, 11, 31, 23, 0), NOW)).toBe('2025.12.31');
  });
});

describe('알림을 누르면 가는 곳', () => {
  const item = (type: string, targetType: string, id: string | null = 'x1') => ({ type, target: { type: targetType, id } });

  test.each([
    ['JOIN_REQUEST', 'JOIN_REQUESTS', { pathname: '/crew/join-requests' }],
    ['REPORT', 'REPORTS', { pathname: '/crew/reports', params: { id: 'x1' } }],
    ['NOTICE', 'NOTICE', { pathname: '/crew/notices/[id]', params: { id: 'x1' } }],
    ['COMMENT', 'POST', { pathname: '/posts/[id]', params: { id: 'x1' } }],
    ['CHAT', 'CHAT', { pathname: '/crew/chat' }],
    ['ACTIVITY_STARTED', 'LIVE', { pathname: '/crew/live' }],
  ])('%s 는 대상 화면으로 간다', (type, targetType, expected) => {
    expect(notificationDestination(item(type, targetType), 'MEMBER')).toEqual(expected);
  });

  test('가입 승인은 크루원이면 홈, 아니면 크루 선택으로 간다', () => {
    expect(notificationDestination(item('JOIN_APPROVED', 'CREW'), 'MEMBER')).toEqual({ pathname: '/(tabs)' });
    expect(notificationDestination(item('JOIN_APPROVED', 'CREW'), 'NONE')).toEqual({ pathname: '/crew-choice' });
  });

  test('가입 거절은 비소속이면 거절 안내, 이미 가입했으면 홈으로 간다', () => {
    expect(notificationDestination(item('JOIN_REJECTED', 'CREW'), 'NONE')).toEqual({ pathname: '/pending-approval' });
    expect(notificationDestination(item('JOIN_REJECTED', 'CREW'), 'MEMBER')).toEqual({ pathname: '/(tabs)' });
  });

  test('게시물 삭제·신고 처리 결과는 이동하지 않고 목록에 남는다', () => {
    expect(notificationDestination(item('POST_REMOVED', 'POST', null), 'MEMBER')).toBeNull();
    expect(notificationDestination(item('REPORT_RESOLVED', 'NOTIFICATIONS'), 'MEMBER')).toBeNull();
  });
});

describe('읽음 처리', () => {
  const state = {
    items: [
      { id: 501, unread: true },
      { id: 500, unread: false },
      { id: 499, unread: true },
    ],
    unreadCount: 3,
  };

  test('안 읽은 항목 하나를 읽으면 점이 꺼지고 안 읽음 수가 1 준다', () => {
    const next = markRead(state, 501);
    expect(next.items[0].unread).toBe(false);
    expect(next.unreadCount).toBe(2);
  });

  test('이미 읽은 항목은 수를 줄이지 않는다', () => {
    expect(markRead(state, 500).unreadCount).toBe(3);
  });

  test('안 읽음 수를 못 받았으면 모르는 채로 둔다', () => {
    expect(markRead({ ...state, unreadCount: null }, 501).unreadCount).toBeNull();
  });

  test('읽음 요청이 실패하면 그 항목만 안 읽음으로 되돌린다', () => {
    const next = markUnread(markRead(markRead(state, 501), 499), 501);
    expect(next.items.map((i) => i.unread)).toEqual([true, false, false]);
    expect(next.unreadCount).toBe(2);
  });

  test('이미 안 읽음이면 되돌릴 때 수를 올리지 않는다', () => {
    expect(markUnread(state, 501)).toBe(state);
  });

  test('모두 읽음은 점을 전부 끄고 수를 0 으로', () => {
    const next = markAllRead(state);
    expect(next.items.every((i) => !i.unread)).toBe(true);
    expect(next.unreadCount).toBe(0);
  });

  test('실패하면 되돌릴 수 있게 원래 상태를 바꾸지 않는다', () => {
    markRead(state, 501);
    markAllRead(state);
    expect(state.items[0].unread).toBe(true);
    expect(state.unreadCount).toBe(3);
  });
});
