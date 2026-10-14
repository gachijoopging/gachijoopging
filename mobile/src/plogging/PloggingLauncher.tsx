import { router } from 'expo-router';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNetworkState } from 'expo-network';
import { Snackbar, size, space } from 'design-system/src';
import { type ApiClient } from '../api/client';
import { createApiClient } from '../api/config';
import { getStored, loadLastAccount, openAccount } from '../activity/store';
import { syncOutbox } from '../activity/tracking';
import { ploggingEntry } from './entry';
import { StartSheet } from './StartSheet';
import type { StartResult } from './start';

const api: ApiClient = createApiClient({ delayMs: 300 });

type Launcher = {
  /** 하단 가운데 줍깅 버튼. 진행 중이면 4-3, 그 밖에는 지금 탭 위에 시작 시트 */
  enter: () => void;
  /** 위치 권한을 확인하고 시작 시트를 연다 */
  start: () => void;
};

const LauncherContext = createContext<Launcher | null>(null);

export function usePloggingLauncher(): Launcher {
  const launcher = useContext(LauncherContext);
  if (!launcher) throw new Error('PloggingLauncher 밖에서 불렀다');
  return launcher;
}

const resume = (id: string, params: { flash?: string; startedAt?: string; shared?: string } = {}) =>
  router.push({ pathname: '/activity/[id]', params: { id, ...params } });

/** 시작 시트는 어느 탭 위에서든 뜨므로 탭 레이아웃이 한 벌만 가진다. */
export function PloggingLauncher({ children }: { children: ReactNode }) {
  // 탭 바가 하단 안전 영역만큼 높아진다. 스낵바는 그 위에 놓는다
  const insets = useSafeAreaInsets();
  const network = useNetworkState();
  useEffect(() => {
    if (network.isConnected && network.isInternetReachable !== false) {
      loadLastAccount();
      void syncOutbox();
    }
  }, [network.isConnected, network.isInternetReachable]);
  const [open, setOpen] = useState(false);
  const [noCrew, setNoCrew] = useState(false);
  const [syncing, setSyncing] = useState(false);
  // /users/me 를 못 받으면 공유를 끈 채로 연다 — 모르는 상태에서 위치를 먼저 내보내지 않는다
  const [shareDefault, setShareDefault] = useState(false);
  const busy = useRef(false);
  // 시트는 별도 창이라 내려가는 중에 다음 화면을 띄우면 그 위에 겹친다. 다 내려간 뒤에 넘어간다
  const afterClose = useRef<(() => void) | null>(null);

  useEffect(() => {
    const me = api.get('GET /users/me');
    me.then((r) => setShareDefault(r.data.settings.shareLocationDefault)).catch(() => {});
    // 지난 실행에서 못 보낸 줍기·종료가 있으면 앱을 켤 때 이어서 보낸다.
    // 진행 중인 활동이 기기에 남아 있으면 홈을 거치지 않고 곧장 4-3 으로 — 홈이 먼저 뜨면 활동이 끝난 줄 안다
    void openAccount(() => me.then((r) => r.data.id)).then(() => {
      void syncOutbox();
      const { session, ended, outbox } = getStored();
      const local = session ? { activityId: session.activityId, ended: !!ended, unsynced: outbox.length > 0 } : null;
      const entry = ploggingEntry({ current: null, local });
      if (entry.kind === 'resume') resume(entry.id);
    });
  }, []);

  const start = useCallback(() => {
    const { session, ended, outbox } = loadLastAccount() ?? getStored();
    const entry = ploggingEntry({
      current: null,
      local: session ? { activityId: session.activityId, ended: !!ended, unsynced: outbox.length > 0 } : null,
    });
    if (entry.kind === 'resume') return resume(entry.id);
    if (entry.kind === 'syncing') {
      setSyncing(true);
      void syncOutbox();
      return;
    }
    setOpen(true);
  }, []);

  const enter = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      // 조회에 실패하면 없는 것으로 보고 시트를 연다. 실제로 진행 중이면 시작 요청이 409 로 그 활동을 찾아 준다
      const current = await api.get('GET /activities/current').then((r) => r.data).catch(() => null);
      const { session, ended, outbox } = getStored();
      const local = session ? { activityId: session.activityId, ended: !!ended, unsynced: outbox.length > 0 } : null;
      const entry = ploggingEntry({ current, local });
      if (entry.kind === 'resume') resume(entry.id);
      else if (entry.kind === 'syncing') {
        setSyncing(true);
        void syncOutbox();
      }
      else start();
    } finally {
      busy.current = false;
    }
  }, [start]);

  function closeThen(next: () => void) {
    afterClose.current = next;
    setOpen(false);
  }

  function onDone(result: Exclude<StartResult, { kind: 'failed' }>) {
    if (result.kind === 'noCrew') return closeThen(() => setNoCrew(true));
    closeThen(() =>
      resume(
        result.id,
        result.kind === 'started'
          ? { startedAt: result.startedAt, shared: String(result.locationShared) }
          : { flash: '진행 중인 활동이 있어 이어서 시작해요' },
      ),
    );
  }

  const value = useMemo(() => ({ enter: () => void enter(), start }), [enter, start]);

  return (
    <LauncherContext.Provider value={value}>
      {children}
      <StartSheet
        api={api}
        visible={open}
        shareLocationDefault={shareDefault}
        onClose={() => setOpen(false)}
        onClosed={() => {
          const next = afterClose.current;
          afterClose.current = null;
          next?.();
        }}
        onDone={onDone}
      />
      {/* 하단 내비 위에 띄운다 */}
      <View pointerEvents="box-none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: size.bottomNavHeight + Math.max(space.md, insets.bottom + space.sm) + space.md }}>
        <Snackbar
          visible={noCrew}
          message="크루에 소속돼야 활동을 시작할 수 있어요"
          actionLabel="크루 찾기"
          onAction={() => { setNoCrew(false); router.replace('/crew-choice'); }}
          onDismiss={() => setNoCrew(false)}
        />
        <Snackbar
          visible={syncing}
          message="지난 활동을 저장하고 있어요. 연결되면 새로 시작할 수 있어요"
          onDismiss={() => setSyncing(false)}
        />
      </View>
    </LauncherContext.Provider>
  );
}
