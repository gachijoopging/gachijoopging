import type { Activity } from '../api/client';

export type PloggingEntry = { kind: 'sheet' } | { kind: 'resume'; id: string } | { kind: 'syncing' };

/** 기기에 남은 활동. 서버보다 먼저 본다 — 오프라인으로 재실행해도 이어가야 한다 */
export type LocalActivity = { activityId: string; ended: boolean; unsynced: boolean };

/**
 * 줍깅 탭(하단 가운데 버튼)의 행선지. 처음이어도 안내 화면을 거치지 않고 지금 탭 위에 시작 시트를 띄운다.
 * 진행 중이면 무엇보다 먼저 4-3 이다.
 * 끝난 활동이 서버에 닿기 전에 새 활동을 열면 종료·줍기 순서가 섞이므로 막는다.
 */
export function ploggingEntry({ current, local }: { current: Activity | null; local?: LocalActivity | null }): PloggingEntry {
  if (local && !local.ended) return { kind: 'resume', id: local.activityId };
  if (local?.ended && local.unsynced) return { kind: 'syncing' };
  if (current) return { kind: 'resume', id: current.id };
  return { kind: 'sheet' };
}
