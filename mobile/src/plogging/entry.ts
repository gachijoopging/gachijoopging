import type { Activity } from '../api/client';

export type PloggingEntry = { kind: 'onboarding' } | { kind: 'sheet' } | { kind: 'resume'; id: string };

/**
 * 줍깅 탭(하단 가운데 버튼)의 행선지. 4-1 대기 화면은 처음 한 번만 보이는 온보딩이고,
 * 그 뒤로는 거치지 않고 지금 탭 위에 시작 시트를 띄운다. 진행 중이면 무엇보다 먼저 4-3 이다.
 */
export function ploggingEntry({ onboarded, current }: { onboarded: boolean; current: Activity | null }): PloggingEntry {
  if (current) return { kind: 'resume', id: current.id };
  return onboarded ? { kind: 'sheet' } : { kind: 'onboarding' };
}
