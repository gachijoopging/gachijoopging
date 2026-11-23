import { useSyncExternalStore } from 'react';
import { getStored, subscribe } from './store';

/** 기기에 진행 중(종료 전) 활동이 남아 있는지. 탭 바의 줍깅 버튼 점이 본다 */
export function useActiveSession(): boolean {
  return useSyncExternalStore(subscribe, () => {
    const { session, ended } = getStored();
    return !!session && !ended;
  });
}
