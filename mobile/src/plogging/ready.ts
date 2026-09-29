import type { Activity } from '../api/client';

export type ReadyView =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'idle'; stale: boolean }
  | { kind: 'active'; activity: Activity; stale: boolean };

/** last 가 undefined 면 한 번도 받아 오지 못했다. 받아 둔 값이 있으면 실패해도 지우지 않는다. */
export function readyView({ last, failed }: { last: Activity | null | undefined; failed: boolean }): ReadyView {
  if (last === undefined) return failed ? { kind: 'error' } : { kind: 'loading' };
  return last ? { kind: 'active', activity: last, stale: failed } : { kind: 'idle', stale: failed };
}
