import { router } from 'expo-router';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { File, Paths } from 'expo-file-system';
import { useNetworkState } from 'expo-network';
import { Snackbar, size, space } from 'design-system/src';
import { createMockClient, type ApiClient } from '../api/client';
import { useLocationGate } from '../auth/useLocationGate';
import { getStored, loadAccount, loadLastAccount } from '../activity/store';
import { syncOutbox } from '../activity/tracking';
import { ploggingEntry } from './entry';
import { StartSheet } from './StartSheet';
import type { StartResult } from './start';

const api: ApiClient = createMockClient({ delayMs: 300 });
const onboardedFlag = new File(Paths.document, 'plogging-onboarded');

type Launcher = {
  /** 하단 가운데 줍깅 버튼. 처음이면 4-1, 진행 중이면 4-3, 그 밖에는 지금 탭 위에 시작 시트 */
  enter: () => void;
  /** 위치 권한을 확인하고 시작 시트를 연다 */
  start: () => void;
  /** 4-1 온보딩을 봤다. 다음부터 줍깅 버튼은 4-1 을 거치지 않는다 */
  markOnboarded: () => void;
};

const LauncherContext = createContext<Launcher | null>(null);

export function usePloggingLauncher(): Launcher {
  const launcher = useContext(LauncherContext);
  if (!launcher) throw new Error('PloggingLauncher 밖에서 불렀다');
  return launcher;
}

const resume = (id: string, params: { flash?: string; startedAt?: string; shared?: string } = {}) =>
  router.push({ pathname: '/4-3-activity-in-progress', params: { id, ...params } });

/** 시작 시트는 어느 탭 위에서든 뜨므로 탭 레이아웃이 한 벌만 가진다. */
export function PloggingLauncher({ children }: { children: ReactNode }) {
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
  const requireLocation = useLocationGate();

  useEffect(() => {
    loadLastAccount();
    api
      .get('GET /users/me')
      .then((me) => {
        loadAccount(me.data.id);
        // 지난 실행에서 못 보낸 줍기·종료가 있으면 앱을 켤 때 이어서 보낸다
        void syncOutbox();
        setShareDefault(me.data.settings.shareLocationDefault);
      })
      .catch(() => {});
  }, []);

  const start = useCallback(() => {
    const { session, ended, outbox } = loadLastAccount() ?? getStored();
    const entry = ploggingEntry({
      onboarded: true,
      current: null,
      local: session ? { activityId: session.activityId, ended: !!ended, unsynced: outbox.length > 0 } : null,
    });
    if (entry.kind === 'resume') return resume(entry.id);
    if (entry.kind === 'syncing') {
      setSyncing(true);
      void syncOutbox();
      return;
    }
    requireLocation(() => setOpen(true));
  }, [requireLocation]);

  const enter = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      // 조회에 실패하면 없는 것으로 보고 시트를 연다. 실제로 진행 중이면 시작 요청이 409 로 그 활동을 찾아 준다
      const current = await api.get('GET /activities/current').then((r) => r.data).catch(() => null);
      const { session, ended, outbox } = getStored();
      const local = session ? { activityId: session.activityId, ended: !!ended, unsynced: outbox.length > 0 } : null;
      const entry = ploggingEntry({ onboarded: onboardedFlag.exists, current, local });
      if (entry.kind === 'resume') resume(entry.id);
      else if (entry.kind === 'syncing') {
        setSyncing(true);
        void syncOutbox();
      }
      else if (entry.kind === 'onboarding') router.navigate('/(tabs)/plogging');
      else start();
    } finally {
      busy.current = false;
    }
  }, [start]);

  const markOnboarded = useCallback(() => {
    if (!onboardedFlag.exists) onboardedFlag.create();
  }, []);

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

  const value = useMemo(() => ({ enter: () => void enter(), start, markOnboarded }), [enter, start, markOnboarded]);

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
        onLocationRevoked={() => closeThen(start)}
        onDone={onDone}
      />
      {/* 하단 내비 위에 띄운다 */}
      <View pointerEvents="box-none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: size.bottomNavHeight + space.md * 2 }}>
        <Snackbar
          visible={noCrew}
          message="크루에 소속돼야 활동을 시작할 수 있어요"
          actionLabel="크루 찾기"
          onAction={() => { setNoCrew(false); router.replace('/1-6-create-or-join-crew'); }}
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
