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
    // 끊긴 사이 생긴 알림은 소켓이 다시 보내 주지 않는다. 받는 순간 이미 붙어 있던 연결은 화면이 방금 스스로 받았으니 건너뛴다
    let registered = false;
    socket.onStatus((status) => {
      if (registered && status === 'open') latest.current();
    });
    registered = true;
    return () => socket.close();
  }, []);
}
