// 화면 4-3 · docs/screens/4-3-activity-in-progress.md
import Constants from 'expo-constants';
import { AndroidHaptics, performAndroidHapticsAsync } from 'expo-haptics';
import { useKeepAwake } from 'expo-keep-awake';
import * as Linking from 'expo-linking';
import * as Location from 'expo-location';
import { useNetworkState } from 'expo-network';
import { router, useFocusEffect, useIsFocused, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Appear,
  Banner,
  Button,
  CaptureButton,
  Card,
  Chip,
  Dialog,
  Dot,
  IconButton,
  IconCircle,
  MetricSplit,
  Screen,
  Snackbar,
  Txt,
  depth,
  radius,
  size,
  space,
  useReduceMotion,
  useRipple,
  useTheme,
} from 'design-system/src';
import { KakaoMapView } from '../../../modules/kakao-map';
import { createMockClient, type ApiClient } from '../../../src/api/client';
import type { MOCKS } from '../../../src/api/mocks.generated';
import { enqueue } from '../../../src/activity/outbox';
import { QuickPickupSheet } from '../../../src/activity/QuickPickupSheet';
import {
  bannerFor,
  displayDistance,
  elapsedSec,
  endBody,
  gpsStatus,
  metricsLabel,
  newSession,
  pause,
  restartLine,
  resume,
  type BannerKind,
  type Session,
} from '../../../src/activity/session';
import { getStored, loadAccount, loadLastAccount, subscribe, updateStored } from '../../../src/activity/store';
import { startTracking, stopTracking, syncOutbox, tick } from '../../../src/activity/tracking';
import { formatClock, formatDistance } from '../../../src/format';
import { crewMarkers } from '../../../src/live/live';
import { useBlockedUsers } from '../../../src/profile/blocked-users';
import { useFlash } from '../../../src/ui/useFlash';

type Member = (typeof MOCKS)['GET /crew/live']['data'][number];

const api: ApiClient = createMockClient({ delayMs: 300 });
const BUBBLE_MS = 3_000;
const LOCATION_CHECK_MS = 5_000;

// 칩은 상태 한 마디만 보인다. 무엇이 이어지는지는 스크린리더 이름(detail)으로 들려준다
const BANNER_TEXT: Record<Exclude<BannerKind, 'locationOff'>, { text: string; detail?: string; tone: 'info' | 'warn' | 'surface'; icon?: 'wifi-off' | 'crosshairs-gps' | 'signal-off' | 'pause' }> = {
  offline: { text: '오프라인', detail: '기록은 계속돼요. 연결되면 보내요', tone: 'warn', icon: 'wifi-off' },
  connecting: { text: '연결 중…', tone: 'info' },
  searching: { text: '위치를 찾고 있어요', tone: 'info', icon: 'crosshairs-gps' },
  unstable: { text: 'GPS 불안정', detail: '경로 정확도가 낮을 수 있어요', tone: 'warn', icon: 'signal-off' },
  paused: { text: '일시정지 중', tone: 'surface', icon: 'pause' },
};

export default function ActivityInProgressScreen() {
  const focused = useIsFocused();
  useKeepAwake();
  const { id, flash, startedAt, shared, quick } = useLocalSearchParams<{ id: string; flash?: string; startedAt?: string; shared?: string; quick?: string }>();
  const { colors, shadows } = useTheme();
  const insets = useSafeAreaInsets();

  const reduceMotion = useReduceMotion();
  const appKey: string = Constants.expoConfig?.extra?.kakaoNativeAppKey ?? '';
  const network = useNetworkState();
  const offline = network.isConnected === false || network.isInternetReachable === false;

  const [session, setSession] = useState<Session | null>(() => {
    const st = getStored();
    return st.session?.activityId === id && !st.ended ? st.session : null;
  });
  const [myId, setMyId] = useState<string | null>(null);
  const blocked = useBlockedUsers(myId);
  const [now, setNow] = useState(Date.now());
  const [members, setMembers] = useState<readonly Member[] | null>(null);
  const [unreadChat, setUnreadChat] = useState(false);
  const [follow, setFollow] = useState(true);
  const [mapFailed, setMapFailed] = useState(!appKey);
  const [bubbleId, setBubbleId] = useState<string | null>(null);
  const [locationOff, setLocationOff] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [ending, setEnding] = useState(false);
  const [endFailed, setEndFailed] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const [snackbar, setSnackbar] = useFlash();
  const bubbleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 4-4 가 오프라인이라 빠른 줍기로 보냈다
  useEffect(() => {
    if (flash) setSnackbar(flash);
    if (quick) setQuickOpen(true);
  }, [flash, quick, setSnackbar]);

  // 계정을 열고, 기기에 이 활동이 없으면 시작 시트가 넘긴 값이나 서버의 진행 중 활동으로 만든다
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const local = loadLastAccount();
      const me = await api.get('GET /users/me').catch(() => null);
      const userId = me?.data.id ?? local?.session?.userId;
      if (cancelled || !userId) return;
      setMyId(userId);
      const stored = loadAccount(userId);
      if (stored.session?.activityId === id && stored.ended) {
        // 종료 대기 중인 활동을 진행 중으로 다시 열지 않는다
        router.replace({ pathname: '/activity/[id]/summary', params: { id } });
        return;
      }
      if (stored.session?.activityId !== id) {
        const t = Date.now();
        const fresh = startedAt
          ? newSession({ id, startedAt, pausedSec: 0, paused: false, pausedAt: null, itemCount: 0, locationShared: shared === 'true' }, userId, t)
          : await api
              .get('GET /activities/current')
              .then(({ data }) => (data?.id === id ? { ...newSession(data, userId, t), distanceM: data.distanceM } : null))
              .catch(() => 'failed' as const);
        if (cancelled) return;
        // 조회가 실패한 것은 끝난 것이 아니다. 4-1 이 다시 받아 이어가게 한다
        if (fresh === 'failed') return router.replace({ pathname: '/(tabs)/plogging', params: { flash: '활동을 불러오지 못했어요. 다시 시도해 주세요' } });
        // 서버에 이 활동이 없다 — 다른 기기에서 끝냈다. 0 지표 화면에 남기지 않는다
        if (!fresh) return router.replace({ pathname: '/(tabs)/plogging', params: { flash: '활동이 이미 끝났어요' } });
        updateStored((st) => ({ ...st, session: fresh, ended: null }));
      }
      setSession(getStored().session);
      await startTracking();
      void syncOutbox();
    })();
    return () => {
      cancelled = true;
    };
  }, [id, startedAt, shared]);

  useEffect(
    () =>
      subscribe((st) => {
        if (st.session?.activityId === id && !st.ended) setSession(st.session);
      }),
    [id],
  );

  useEffect(() => {
    const timer = setInterval(() => {
      const t = Date.now();
      setNow(t);
      tick(t);
    }, 1_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!offline) void syncOutbox();
  }, [offline]);

  // 활동 중 권한 회수·OS 위치 끔을 알아챈다. 돌아오면 새 선부터 긋는다
  useEffect(() => {
    const check = async () => {
      const [perm, services] = await Promise.all([
        Location.getForegroundPermissionsAsync().catch(() => null),
        Location.hasServicesEnabledAsync().catch(() => true),
      ]);
      const off = !perm?.granted || !services;
      if (off) {
        updateStored((st) => st.session?.here
          ? { ...st, session: { ...restartLine(st.session, Date.now()), here: null } }
          : st);
      }
      setLocationOff((was) => {
        if (was && !off) {
          updateStored((st) => (st.session ? { ...st, session: restartLine(st.session, Date.now()) } : st));
          void startTracking();
        }
        return off;
      });
    };
    void check();
    const timer = setInterval(check, LOCATION_CHECK_MS);
    return () => clearInterval(timer);
  }, []);

  // 돌아올 때마다 크루원을 조용히 다시 받는다. 실패하면 "–" 로 두고 다음 복귀에 다시 받는다
  useFocusEffect(
    useCallback(() => {
      api
        .get('GET /crew/live')
        .then(({ data }) => setMembers(data))
        .catch(() => setMembers(null));
      api
        .get('GET /crew')
        .then(({ data }) => setUnreadChat(data.unreadChat > 0))
        .catch(() => {});
    }, []),
  );

  // 앱이 앞에 올 때마다 추적을 다시 요청한다. 포그라운드 서비스는 앱이 앞에 있을 때만 시작되므로,
  // 뒤에서 들어와 첫 시작을 놓쳤거나 시스템이 서비스를 내린 뒤에도 여기서 되살아난다
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void startTracking();
    });
    return () => sub.remove();
  }, []);

  useEffect(() => () => {
    if (bubbleTimer.current) clearTimeout(bubbleTimer.current);
  }, []);

  const others = members?.filter((m) => m.user.id !== myId && !blocked.has(m.user.id)) ?? null;
  const markers = others ? crewMarkers([...others]) : [];
  const bubble = others?.find((m) => m.user.id === bubbleId) ?? null;

  const openBubble = (memberId: string) => {
    if (bubbleTimer.current) clearTimeout(bubbleTimer.current);
    if (bubbleId === memberId) return setBubbleId(null);
    setBubbleId(memberId);
    bubbleTimer.current = setTimeout(() => setBubbleId(null), BUBBLE_MS);
  };

  const togglePause = () => {
    updateStored((st) => {
      if (!st.session) return st;
      const t = Date.now();
      const next = st.session.paused ? resume(st.session, t) : pause(st.session, t);
      return { ...st, session: next, outbox: enqueue(st.outbox, { kind: next.paused ? 'pause' : 'resume', activityId: next.activityId }) };
    });
    void syncOutbox();
  };

  const end = async () => {
    if (ending || !session) return;
    setEnding(true);
    setEndFailed(false);
    try {
      updateStored((st) =>
        {
          if (!st.session) return st;
          const body = endBody(st.session, Date.now());
          return { ...st, ended: body, outbox: enqueue(st.outbox, { kind: 'end', activityId: st.session.activityId, body }) };
        },
      );
    } catch {
      // 디스크에 못 남기면 추적을 끄지 않는다 — 여기서 넘어가면 기록을 잃는다
      setEnding(false);
      setEndFailed(true);
      return;
    }
    // 기록이 기기에 남은 뒤에만 알린다. API 30 미만은 Confirm 이 없어 조용히 넘어간다
    performAndroidHapticsAsync(AndroidHaptics.Confirm).catch(() => {});
    setConfirmEnd(false);
    await stopTracking();
    router.replace({ pathname: '/activity/[id]/summary', params: { id } });
    void syncOutbox();
  };

  const status = session ? gpsStatus(session, now) : 'searching';
  const banner = bannerFor({ locationOff, offline, connecting: false, gps: status, paused: !!session?.paused });
  const paused = !!session?.paused;
  const here = session?.here ?? null;

  const metrics = session
    ? [
        { value: String(session.itemCount), label: '줍기 개수' },
        { value: formatClock(elapsedSec(session, now)), label: '활동 시간', muted: paused },
        { value: formatDistance(displayDistance(session)), label: '이동 거리', muted: paused },
        { value: session.steps == null ? '측정 안 됨' : session.steps.toLocaleString('ko-KR'), label: '걸음', muted: paused },
      ]
    : [
        { value: '0', label: '줍기 개수' },
        { value: '00:00', label: '활동 시간' },
        { value: '0m', label: '이동 거리' },
        { value: '측정 안 됨', label: '걸음' },
      ];

  // 지도는 상태바 밑까지 채우고, 위에 뜨는 것만 안전 영역을 지킨다
  const floating = { backgroundColor: colors.surface, ...depth('floating', shadows.floating) };

  return (
    <Screen bleed edges={['left', 'right']} contentStyle={{ paddingTop: 0 }}>
      {/* 지도 타일은 다크 모드에서도 밝다. 위에 다른 화면이 올라오면 거둬 그 화면이 테마를 따르게 한다 */}
      {focused ? <StatusBar style="dark" /> : null}
      <View style={{ flex: 1 }}>
        <View
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.neutral }}
          accessible
          accessibilityLabel={`지도, 내 경로와 활동 중인 크루원 ${markers.length}명`}
          accessibilityHint={markers.length ? '크루원 정보는 동작 메뉴에서 들을 수 있어요' : undefined}
          // 크루원 마커는 네이티브 라벨이라 스크린리더가 닿지 못한다. 지도에 크루원별 동작을 달아 말풍선을 연다
          accessibilityActions={others?.filter((m) => m.locationShared && m.location).map((m) => ({ name: m.user.id, label: `${m.user.nickname} 정보 듣기` }))}
          onAccessibilityAction={(e) => openBubble(e.nativeEvent.actionName)}
        >
          {mapFailed ? (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
              <Txt variant="caption" tone="muted">지도를 불러오지 못했어요</Txt>
            </View>
          ) : (
            <KakaoMapView
              appKey={appKey}
              animateCamera={!reduceMotion}
              center={follow && here ? { latitude: here.latitude, longitude: here.longitude } : undefined}
              segments={session?.segments ?? []}
              myLocation={here}
              markers={markers}
              onMarkerPress={(e) => openBubble(e.nativeEvent.id)}
              onUserGesture={() => setFollow(false)}
              onMapError={() => setMapFailed(true)}
              style={{ flex: 1 }}
            />
          )}
        </View>

        <View pointerEvents="box-none" style={{ paddingHorizontal: space.lg, paddingTop: insets.top + space.md, gap: space.sm }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' }}>
            <Chip
              tone={session?.locationShared === false ? 'neutral' : 'lime'}
              icon={session?.locationShared === false ? 'map-marker-off' : 'map-marker-radius'}
              label={session?.locationShared === false ? '위치 공유 꺼짐' : '위치 공유 중'}
            />
            <Chip
              tone="surface"
              icon="account-group"
              label={others ? `크루원 ${others.length}` : '크루원'}
              accessibilityLabel={others ? `활동 중인 크루원 ${others.length}명, 목록 보기` : '활동 중인 크루원 목록 보기'}
              onPress={() => router.push('/crew/live')}
            />
            <View style={{ flex: 1 }} />
            <Button label="활동 종료" variant="danger" size="sm" onPress={() => setConfirmEnd(true)} disabled={ending} />
          </View>

          <Card>
            <MetricSplit items={metrics} divider="dashed" accessibilityLabel={session ? metricsLabel(session, now) : '기록을 불러오고 있어요'} />
          </Card>

          <Appear visible={!!banner} rise={0} pointerEvents="box-none" replayKey={banner ?? undefined}>
            {banner === 'locationOff' ? (
              <Banner
                tone="danger"
                action={{ label: '설정 열기', accessibilityLabel: '위치 설정 열기', onPress: () => void Linking.openSettings() }}
              >
                위치가 꺼져 있어요. 거리와 경로를 기록할 수 없어요
              </Banner>
            ) : banner ? (
              <View accessibilityLiveRegion="polite" style={{ alignSelf: 'flex-start' }}>
                <Chip
                  tone={BANNER_TEXT[banner].tone}
                  icon={BANNER_TEXT[banner].icon}
                  label={BANNER_TEXT[banner].text}
                  accessibilityLabel={[BANNER_TEXT[banner].text, BANNER_TEXT[banner].detail].filter(Boolean).join(', ')}
                />
              </View>
            ) : null}
          </Appear>

          <Appear visible={!!bubble} rise={space.xs} style={{ alignSelf: 'center' }}>
            {bubble ? (
              <Card>
                <Txt
                  variant="label"
                  accessibilityLiveRegion="polite"
                  accessibilityLabel={[bubble.user.nickname, bubble.paused ? '일시정지 중' : null, formatDistance(bubble.distanceM).replace('km', '킬로미터').replace(/m$/, '미터'), `${bubble.itemCount}개`].filter(Boolean).join(', ')}
                >
                  {[bubble.user.nickname, bubble.paused ? '일시정지 중' : null, formatDistance(bubble.distanceM), `${bubble.itemCount}개`].filter(Boolean).join(' · ')}
                </Txt>
              </Card>
            ) : null}
          </Appear>
        </View>

        <View style={{ flex: 1 }} pointerEvents="box-none" />

        <View pointerEvents="box-none" style={{ paddingHorizontal: space.lg, gap: space.sm }}>
          <View pointerEvents="box-none" style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}>
            <Chip
              tone="surface"
              icon="delete-outline"
              label={`줍기 ${session?.itemCount ?? 0}개`}
              accessibilityLabel={`줍기 ${session?.itemCount ?? 0}개, 빠른 줍기 열기`}
              onPress={() => setQuickOpen(true)}
            />
            {!follow && here ? (
              <View style={{ ...floating, borderRadius: size.iconButton / 2 }}>
                <IconButton icon="crosshairs-gps" label="내 위치로 이동" tone="surface" onPress={() => setFollow(true)} />
              </View>
            ) : null}
          </View>

          <View
            style={{
              ...floating,
              borderRadius: radius.pill,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingHorizontal: space.xl,
              paddingVertical: space.sm,
              marginBottom: insets.bottom + space.sm,
            }}
          >
            <BarAction
              icon="chat-outline"
              label="채팅"
              accessibilityLabel={unreadChat ? '크루 채팅, 읽지 않은 메시지 있음' : '크루 채팅'}
              dot={unreadChat}
              onPress={() => router.push('/crew/chat')}
            />
            <View style={{ alignItems: 'center', marginTop: -(size.captureFab / 2) }}>
              <CaptureButton accessibilityLabel="쓰레기 촬영" onPress={() => router.push({ pathname: '/activity/[id]/photo', params: { id } })} />
              <Txt variant="label" importantForAccessibility="no">쓰레기 촬영</Txt>
            </View>
            <BarAction
              icon={paused ? 'play' : 'pause'}
              tone={paused ? 'lime' : 'neutral'}
              label={paused ? '재개' : '일시정지'}
              accessibilityLabel={paused ? '재개' : '일시정지'}
              onPress={togglePause}
            />
          </View>
        </View>
      </View>

      <Dialog
        visible={confirmEnd}
        onClose={() => !ending && setConfirmEnd(false)}
        title="활동을 종료할까요?"
        actions={
          <>
            <Button label="계속 줍기" variant="ghost" size="md" onPress={() => setConfirmEnd(false)} disabled={ending} />
            <Button label="종료하기" variant="danger" size="md" loading={ending} disabled={ending} onPress={end} />
          </>
        }
      >
        <Txt variant="body">지금까지 주운 기록이 저장돼요. 종료 후에는 이어서 담을 수 없어요.</Txt>
        {endFailed ? <Banner tone="danger">기록을 저장하지 못했어요. 다시 시도해 주세요.</Banner> : null}
      </Dialog>

      <QuickPickupSheet visible={quickOpen} onClose={() => setQuickOpen(false)} session={session} />

      <Snackbar visible={snackbar != null} message={snackbar ?? ''} onDismiss={() => setSnackbar(null)} />
    </Screen>
  );
}

function BarAction({
  icon,
  tone = 'neutral',
  label,
  accessibilityLabel,
  dot,
  onPress,
}: {
  icon: 'chat-outline' | 'pause' | 'play';
  tone?: 'neutral' | 'lime';
  label: string;
  accessibilityLabel: string;
  dot?: boolean;
  onPress: () => void;
}) {
  const ripple = useRipple(undefined, true);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      android_ripple={ripple}
      style={{ alignItems: 'center', gap: space.xs, minWidth: size.minTouch }}
    >
      <View>
        {/* 일시정지 ↔ 재개가 바뀐 것을 제자리 페이드로 알린다 */}
        <Appear visible rise={0} replayKey={icon}>
          <IconCircle icon={icon} tone={tone} size="lg" />
        </Appear>
        {dot ? (
          <View style={{ position: 'absolute', top: 0, right: 0 }}>
            <Dot />
          </View>
        ) : null}
      </View>
      <Txt variant="micro">{label}</Txt>
    </Pressable>
  );
}
