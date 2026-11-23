import type { Href } from 'expo-router';
import { resolveDestination, type Me } from '../auth/destination';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

export function relativeTime(createdAt: string, now: Date = new Date()): string {
  const then = new Date(createdAt);
  const diff = now.getTime() - then.getTime();
  if (diff < MINUTE) return '방금';
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)}분 전`;
  if (diff < 24 * HOUR) return `${Math.floor(diff / HOUR)}시간 전`;
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  if (then.toDateString() === yesterday.toDateString()) return '어제';
  const md = `${then.getMonth() + 1}월 ${then.getDate()}일`;
  return then.getFullYear() === now.getFullYear()
    ? md
    : `${then.getFullYear()}.${then.getMonth() + 1}.${then.getDate()}`;
}

type Target = { type: string; id: string | null };
/** 알림을 누르면 갈 곳. 라우트 파일과 어긋나면 typed routes 가 컴파일에서 잡는다 */
export type NotificationDestination = Href;

/** null 이면 이동하지 않고 알림 목록에 남는다 */
export function notificationDestination(
  item: { type: string; target: Target },
  membership: Me['membership'],
): NotificationDestination | null {
  const { type, id } = item.target;
  switch (type) {
    case 'JOIN_REQUESTS':
      return { pathname: '/crew/join-requests' };
    case 'REPORTS':
      return id ? { pathname: '/crew/reports', params: { id } } : null;
    case 'NOTICE':
      return id ? { pathname: '/crew/notices/[id]', params: { id } } : null;
    case 'POST':
      return id ? { pathname: '/posts/[id]', params: { id } } : null;
    case 'CHAT':
      return { pathname: '/crew/chat' };
    case 'LIVE':
      return { pathname: '/crew/live' };
    case 'MEMBERS':
      return { pathname: '/crew/members' };
    case 'CREW':
      // 승인·거절 알림은 지금 소속으로 간다. 미확인 거절이면 1-9 거절 안내, 이미 확인했으면 1-6
      return { pathname: resolveDestination({ profileComplete: true, membership }) };
    default:
      return null;
  }
}

/** unreadCount 가 null 이면 `GET /notifications/unread-count` 가 실패한 것이다 */
export type ReadState<T extends { id: number; unread: boolean }> = { items: T[]; unreadCount: number | null };

export function markRead<T extends { id: number; unread: boolean }>(state: ReadState<T>, id: number): ReadState<T> {
  const target = state.items.find((i) => i.id === id);
  if (!target?.unread) return state;
  return {
    items: state.items.map((i) => (i.id === id ? { ...i, unread: false } : i)),
    unreadCount: state.unreadCount == null ? null : Math.max(0, state.unreadCount - 1),
  };
}

/** 읽음 요청이 실패했을 때. 이미 안 읽음이면 수를 두 번 올리지 않는다 */
export function markUnread<T extends { id: number; unread: boolean }>(state: ReadState<T>, id: number): ReadState<T> {
  const target = state.items.find((i) => i.id === id);
  if (!target || target.unread) return state;
  return {
    items: state.items.map((i) => (i.id === id ? { ...i, unread: true } : i)),
    unreadCount: state.unreadCount == null ? null : state.unreadCount + 1,
  };
}

export function markAllRead<T extends { id: number; unread: boolean }>(state: ReadState<T>): ReadState<T> {
  return { items: state.items.map((i) => ({ ...i, unread: false })), unreadCount: 0 };
}
