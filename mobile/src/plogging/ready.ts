import type { Activity } from '../api/client';

export type ReadyView =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'idle'; stale: boolean }
  | { kind: 'active'; activity: Activity; stale: boolean }
  | { kind: 'syncing'; id: string };

/** last 가 undefined 면 한 번도 받아 오지 못했다. 받아 둔 값이 있으면 실패해도 지우지 않는다. */
export function readyView({ last, failed, pendingEndId }: { last: Activity | null | undefined; failed: boolean; pendingEndId?: string | null }): ReadyView {
  // 기기에 남은 종료 기록이 서버보다 앞선다 — 새 활동을 열면 그 기록이 묻힌다
  if (pendingEndId) return { kind: 'syncing', id: pendingEndId };
  if (last === undefined) return failed ? { kind: 'error' } : { kind: 'loading' };
  return last ? { kind: 'active', activity: last, stale: failed } : { kind: 'idle', stale: failed };
}
