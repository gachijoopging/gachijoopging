import { useEffect, useRef } from 'react';
import { acquireCrewSocket } from '../realtime/crew-socket';
import type { LiveEvent } from '../realtime/stomp';

/**
 * 화면이 떠 있는 동안 소켓 LIVE_* 를 받는다. 소켓은 이후 변경만 주므로, 붙을 때마다(처음 포함) refetch 로 전체를 다시 받는다
 * (docs/realtime.md §끊김과 이어받기). 목으로 돌 때는 아무것도 하지 않는다
 */
export function useLiveEvents(onEvent: (event: LiveEvent) => void, refetch: () => void): void {
  const latest = useRef({ onEvent, refetch });
  latest.current = { onEvent, refetch };
  useEffect(() => {
    const socket = acquireCrewSocket();
    if (!socket) return;
    socket.onLive((event) => latest.current.onEvent(event));
    let down = true;
    socket.onStatus((status) => {
      if (status !== 'open') {
        down = true;
        return;
      }
      if (!down) return;
      down = false;
      latest.current.refetch();
    });
    return () => socket.close();
  }, []);
}
