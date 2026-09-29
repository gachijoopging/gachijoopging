import { useEffect, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import * as Crypto from 'expo-crypto';
import { File, Paths } from 'expo-file-system';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import {
  Appear,
  BottomSheet,
  Button,
  Icon,
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
import { getPermissionMode } from '../auth/location-permission';
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
  onLocationRevoked,
  onDone,
}: {
  api: ApiClient;
  visible: boolean;
  shareLocationDefault: boolean;
  onClose: () => void;
  /** 내려가는 움직임까지 끝난 뒤. 다음 화면은 여기서 띄운다 */
  onClosed: () => void;
  /** 시트가 열린 사이 OS 설정에서 위치를 끈 경우. 부르는 쪽이 1-10 을 거쳐 다시 연다 */
  onLocationRevoked: () => void;
  onDone: (result: Exclude<StartResult, { kind: 'failed' }>) => void;
}) {
  const { colors } = useTheme();
  const ripple = useRipple();
  const [share, setShare] = useState(shareLocationDefault);
  const [starting, setStarting] = useState(false);
  const [failed, setFailed] = useState(false);
  const busy = useRef(false);
  const located = useFirstFix(visible);
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
      if ((await getPermissionMode()) !== 'granted') return onLocationRevoked();
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
    <BottomSheet visible={visible} onClose={onClose} onClosed={onClosed} dismissible={!starting} title="활동을 시작할까요?">
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
