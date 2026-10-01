import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Linking, PermissionsAndroid, Pressable, View } from 'react-native';
import * as Crypto from 'expo-crypto';
import { File, Paths } from 'expo-file-system';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import {
  Appear,
  Banner,
  BottomSheet,
  Button,
  Icon,
  Loading,
  Switch,
  Tile,
  Txt,
  disabledOpacity,
  pressedOpacity,
  radius,
  size,
  space,
  useRipple,
  useTheme,
} from 'design-system/src';
import type { ApiClient } from '../api/client';
import { getPermissionMode, requestPreciseLocation, type PermissionMode } from '../auth/location-permission';
import { askNotificationsOnce } from './notify-permission';
import { startActivity, type StartResult } from './start';

// 재설치하면 지워져 한 번 더 묻는다. OS 도 재설치 때 권한을 초기화하니 맞는 동작이다
const notifyAsked = new File(Paths.document, 'notification-permission-asked');

/** 4-2 활동 시작 시트. 여는 순간에는 서버를 부르지 않는다 — 요청은 시작 버튼의 POST /activities 하나다. */
export function StartSheet({
  api,
  visible,
  shareLocationDefault,
  onClose,
  onClosed,
  onDone,
}: {
  api: ApiClient;
  visible: boolean;
  shareLocationDefault: boolean;
  onClose: () => void;
  /** 내려가는 움직임까지 끝난 뒤. 다음 화면은 여기서 띄운다 */
  onClosed: () => void;
  onDone: (result: Exclude<StartResult, { kind: 'failed' }>) => void;
}) {
  const { colors } = useTheme();
  const ripple = useRipple();
  const [share, setShare] = useState(shareLocationDefault);
  const [starting, setStarting] = useState(false);
  const [failed, setFailed] = useState(false);
  const busy = useRef(false);
  const location = useLocationPermission(visible);
  const permission = location.mode;
  const granted = permission === 'granted';
  const located = useFirstFix(visible && granted);
  // 응답만 잃고 다시 누른 경우 같은 UUID 라야 서버가 200 으로 같은 활동을 돌려준다
  const activityId = useRef('');

  // 닫힐 때 되돌린다. 열면서 되돌리면 첫 프레임에 지난 값이 보였다가 뒤집힌다
  useEffect(() => {
    if (visible) {
      activityId.current = Crypto.randomUUID();
      return;
    }
    setShare(shareLocationDefault);
    setFailed(false);
  }, [visible, shareLocationDefault]);

  async function start() {
    if (busy.current) return;
    busy.current = true;
    setStarting(true);
    setFailed(false);
    try {
      // 시트가 열린 사이 OS 설정에서 위치를 끌 수 있다. 시작하지 않고 시트 안 안내로 돌아간다
      if ((await location.refresh()) !== 'granted') return;
      await askNotificationsOnce({
        get: Notifications.getPermissionsAsync,
        request: Notifications.requestPermissionsAsync,
        wasAsked: () => notifyAsked.exists,
        markAsked: () => notifyAsked.create({ overwrite: true }),
      });
      const result = await startActivity(api, {
        id: activityId.current,
        startedAt: new Date().toISOString(),
        locationShared: share,
      });
      if (result.kind === 'failed') setFailed(true);
      else onDone(result);
    } finally {
      busy.current = false;
      setStarting(false);
    }
  }

  return (
    <BottomSheet visible={visible} onClose={onClose} onClosed={onClosed} dismissible={!starting} title={permission === 'loading' ? '활동 시작' : granted ? '활동을 시작할까요?' : '위치 권한이 필요해요'}>
      {permission === 'loading' ? (
        <Loading label="위치 권한을 확인하고 있어요" />
      ) : granted ? <>
      <Pressable
        accessibilityRole="switch"
        accessibilityLabel="크루원에게 위치 공유"
        accessibilityState={{ checked: share, disabled: starting }}
        disabled={starting}
        onPress={() => setShare((v) => !v)}
        android_ripple={ripple}
        style={({ pressed }) => ({
          borderRadius: radius.cardSm,
          overflow: 'hidden',
          opacity: starting ? disabledOpacity : pressedOpacity(pressed),
        })}
      >
        <Tile>
          <View pointerEvents="none" importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
            <Switch label="크루원에게 위치 공유" value={share} onValueChange={() => {}} disabled={starting} />
          </View>
        </Tile>
      </Pressable>

      <View style={{ gap: space.sm }}>
        <View
          accessible
          accessibilityLabel={located ? '위치 준비됨' : '위치를 잡고 있어요'}
          accessibilityLiveRegion="polite"
          style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}
        >
          <Icon name="crosshairs-gps" size={size.iconInline} color={located ? colors.greenStrong : colors.inkHint} />
          <Appear key={String(located)} visible rise={0}>
            <Txt variant="caption" tone={located ? 'green' : 'hint'}>{located ? '위치 준비됨' : '위치를 잡고 있어요…'}</Txt>
          </Appear>
        </View>
        {/* ponytail: Health Connect 연동 전이라 "지원 안 됨" 경로만 보인다. 연동은 걸음수 이슈에서 */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
          <Icon name="walk" size={size.iconInline} color={colors.inkHint} />
          <Txt variant="caption" tone="hint">걸음수 측정 안 됨</Txt>
        </View>
      </View>

      {/* 시트 안의 스낵바는 시작 버튼을 덮어 바로 다시 누를 수 없게 된다 */}
      {failed ? (
        <Txt variant="caption" tone="error" accessibilityLiveRegion="polite">
          활동을 시작하지 못했어요. 잠시 후 다시 시도해 주세요.
        </Txt>
      ) : null}

      <Button
        label="줍깅 시작"
        size="lg"
        fullWidth
        loading={starting}
        onPress={start}
        accessibilityLabel={starting ? '시작 중' : '줍깅 시작'}
      />
      </> : (
        <LocationPermissionPanel mode={permission} request={location.request} />
      )}
    </BottomSheet>
  );
}

/** 시트가 열려 있는 동안만 위치를 받아 첫 점이 들어왔는지만 본다. 시작을 막는 데 쓰지 않는다. */
function useFirstFix(active: boolean) {
  const [located, setLocated] = useState(false);
  useEffect(() => {
    if (!active) return;
    let sub: Location.LocationSubscription | undefined;
    let cancelled = false;
    Location.watchPositionAsync({ accuracy: Location.Accuracy.High }, () => setLocated(true))
      .then((s) => (cancelled ? s.remove() : (sub = s)))
      .catch(() => {});
    return () => {
      cancelled = true;
      sub?.remove();
      setLocated(false);
    };
  }, [active]);
  return located;
}

const SETTINGS_PATH = '기기 설정 > 앱 > 가치줍깅 > 권한에서 위치를 켜 주세요.';

/**
 * 시트가 열려 있는 동안 정확한 위치 권한을 본다. 설정 앱에서 돌아오면 다시 확인한다.
 * 닫힌 뒤 늦게 도착한 결과는 버린다. 다음에 열 때의 확인을 낡은 값이 덮지 않게 한다
 */
function useLocationPermission(active: boolean) {
  const [mode, setMode] = useState<PermissionMode>('loading');
  const opening = useRef(0);
  const apply = useCallback((at: number, next: PermissionMode) => {
    if (at !== opening.current) return;
    // "다시 묻지 않음" 뒤에는 OS 가 요청 창을 띄우지 않는다. 허용될 때까지 설정 안내를 유지한다
    setMode((current) => (current === 'settings' && next !== 'granted' ? current : next));
  }, []);
  const refresh = useCallback(async (): Promise<PermissionMode> => {
    const at = opening.current;
    const next = await getPermissionMode().catch((): PermissionMode => 'settings');
    apply(at, next);
    return next;
  }, [apply]);
  const request = useCallback(async () => {
    const at = opening.current;
    try {
      const result = await requestPreciseLocation();
      if (result === PermissionsAndroid.RESULTS.GRANTED) apply(at, 'granted');
      else if (result === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN) apply(at, 'settings');
      else apply(at, await getPermissionMode());
      return true;
    } catch {
      apply(at, 'settings');
      return false;
    }
  }, [apply]);
  useEffect(() => {
    opening.current += 1;
    setMode('loading');
    if (!active) return;
    void refresh();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refresh();
    });
    return () => sub.remove();
  }, [active, refresh]);
  return { mode, refresh, request };
}

/** 정확한 위치가 없을 때 시작 버튼 자리에 놓는다. 경로 필터가 정확한 위치를 전제한다 */
function LocationPermissionPanel({ mode, request }: { mode: PermissionMode; request: () => Promise<boolean> }) {
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState(false);
  const toSettings = mode === 'settings';

  async function allow() {
    if (asking) return;
    setError(false);
    if (toSettings) {
      try {
        await Linking.openSettings();
      } catch {
        setError(true);
      }
      return;
    }
    setAsking(true);
    const ok = await request();
    setError(!ok);
    setAsking(false);
  }

  return (
    <>
      <Txt variant="body" accessibilityLiveRegion="polite">활동 경로와 거리를 기록하는 데 써요. 위치 공유를 켜면 크루원에게 내 위치를 보여 줘요.</Txt>
      {mode === 'approximate' ? <Banner tone="warn">활동 경로를 기록하려면 정확한 위치가 필요해요.</Banner> : null}
      {toSettings ? <Banner tone="warn">설정에서 위치 권한을 켜 주세요.</Banner> : null}
      {error ? <Banner tone="danger">{SETTINGS_PATH}</Banner> : null}
      <Button
        label={toSettings ? '설정으로 이동' : '위치 권한 허용'}
        size="lg"
        fullWidth
        loading={asking}
        onPress={allow}
        accessibilityLabel={toSettings ? '설정으로 이동, 기기 설정 앱이 열려요' : '위치 권한 허용'}
      />
    </>
  );
}
