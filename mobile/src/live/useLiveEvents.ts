import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createApiClient } from '../api/config';
import { leaveForMembership } from '../feed/leave';
import { acquireCrewSocket } from '../realtime/crew-socket';
import type { LiveEvent } from '../realtime/stomp';
import type { CrewLive } from './live';

const api = createApiClient();

export function useLiveEvents(onEvent: (event: LiveEvent) => void, onSnapshot: (members: readonly CrewLive[]) => void) {
  const latest = useRef({ onEvent, onSnapshot });
  latest.current = { onEvent, onSnapshot };
  const pending = useRef<{ events: LiveEvent[] } | null>(null);
  const alive = useRef(false);
  const [connected, setConnected] = useState(true);

  const refresh = useCallback(async () => {
    const request = { events: [] as LiveEvent[] };
    pending.current = request;
    try {
      const { data } = await api.get('GET /crew/live');
      if (alive.current && pending.current === request) latest.current.onSnapshot(data);
    } catch (error) {
      if (pending.current === request) throw error;
    } finally {
      if (alive.current && pending.current === request) {
        pending.current = null;
        request.events.forEach((event) => latest.current.onEvent(event));
      }
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    const socket = acquireCrewSocket();
    if (!socket) return () => { alive.current = false; };
    socket.onLive((event) => {
      if (pending.current) pending.current.events.push(event);
      else latest.current.onEvent(event);
    });
    let down = true;
    socket.onStatus((status) => {
      setConnected(status === 'open');
      if (typeof status === 'object') {
        pending.current = null;
        latest.current.onSnapshot([]);
        if (status.closed === 4403) void leaveForMembership();
        else router.dismissTo('/start');
        return;
      }
      if (status !== 'open') { down = true; return; }
      if (!down) return;
      down = false;
      void refresh().catch(() => {});
    });
    return () => { alive.current = false; pending.current = null; socket.close(); };
  }, [refresh]);
  return { refresh, connected };
}
