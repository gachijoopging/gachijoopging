import { useEffect, useRef } from 'react';
import { acquireCrewSocket } from '../realtime/crew-socket';

/** 앱이 앞에 있을 때 알림이 생기면 부른다. 백그라운드는 푸시가, 연결 끊김(4401·4403)은 채팅·크루원 화면이 맡는다 */
export function useNotificationArrivals(onArrive: () => void): void {
  const latest = useRef(onArrive);
  latest.current = onArrive;

  useEffect(() => {
    const socket = acquireCrewSocket();
    if (!socket) return;
    socket.onNotification(() => latest.current());
    return () => socket.close();
  }, []);
}
