import { useEffect, useRef, useState } from 'react';
import { Pressable, View, AccessibilityInfo } from 'react-native';
import { radius } from '../../tokens/radius.ts';
import { space, screen, size as sizes } from '../../tokens/spacing.ts';
import { borderWidth } from '../../tokens/elevation.ts';
import { useTheme, useRipple, depth } from '../theme.tsx';
import { Txt } from './Text.tsx';
import { Appear } from './Appear.tsx';

/**
 * 스낵바. 되돌릴 수 있는 결과를 알리는 일시적 피드백입니다.
 *
 * Material 은 이런 알림에 스낵바를 쓰고, 대화상자는 "반드시 중단해야 하는 결정"에만
 * 씁니다. 저장됨 · 삭제됨 · 전송됨 같은 결과를 대화상자로 띄우면 사용자가 확인
 * 버튼을 누르는 일만 늘어납니다.
 *
 * 아래에서 떠올랐다 같은 길로 내려갑니다. '애니메이션 제거' 설정이면 즉시 나타나고 사라집니다.
 */
export function Snackbar({
  visible,
  message,
  actionLabel,
  onAction,
  onDismiss,
  duration = 4000,
}: {
  visible: boolean;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  onDismiss?: () => void;
  duration?: number;
}) {
  const { colors, shadows } = useTheme();
  const ripple = useRipple();
  // 부르는 쪽은 닫을 때 message 를 비운다. 내려가는 동안 빈 상자가 보이지 않게 마지막 문구를 쥔다
  const shown = useRef(message);
  if (visible) shown.current = message;

  // 액션을 누르고 있는 동안은 사라지지 않는다. 손을 떼면 시간을 처음부터 다시 잰다
  const [held, setHeld] = useState(false);
  // 누른 채 사라지면 손 뗌이 오지 않을 수 있다. 다음 문구가 영영 남지 않게 숨을 때 푼다
  useEffect(() => {
    if (!visible) setHeld(false);
  }, [visible]);
  useEffect(() => {
    if (!visible || !onDismiss || held) return;
    const t = setTimeout(onDismiss, duration);
    return () => clearTimeout(t);
  }, [visible, duration, onDismiss, held]);

  useEffect(() => {
    if (visible) AccessibilityInfo.announceForAccessibility(message);
  }, [visible, message]);

  return (
    <Appear
      visible={visible}
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        left: screen.horizontal,
        right: screen.horizontal,
        // Screen 이 이미 아래 안전 영역을 비워 둔다. 여기서 또 더하면 제스처 바만큼 떠 보인다
        bottom: space.lg,
      }}
    >
      <View
        accessibilityLiveRegion="polite"
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: space.md,
          paddingVertical: space.md,
          paddingHorizontal: space.lg,
          borderRadius: radius.field,
          backgroundColor: colors.deep,
          ...depth('overlay', shadows.overlay),
        }}
      >
        <Txt variant="body" style={{ flex: 1, color: colors.onDark }}>
          {shown.current}
        </Txt>
        {actionLabel && onAction ? (
          <Pressable
            accessibilityRole="button"
            onPress={onAction}
            onPressIn={() => setHeld(true)}
            onPressOut={() => setHeld(false)}
            disabled={!visible}
            hitSlop={12}
            android_ripple={ripple}
            style={{
              minHeight: sizes.minTouch - space.md * 2,
              justifyContent: 'center',
              borderRadius: radius.pill,
              overflow: 'hidden',
              paddingHorizontal: space.md,
              paddingVertical: space.xs,
              // 액션을 라임으로 칠하면 야간에 deep 이 밝아져 2.1:1 이 됩니다.
              // 본문과 같은 잉크를 쓰고 굵기와 테두리로 구분합니다.
              borderWidth: borderWidth.hairline,
              borderColor: colors.onDark,
            }}
          >
            <Txt variant="label" style={{ color: colors.onDark }}>
              {actionLabel}
            </Txt>
          </Pressable>
        ) : null}
      </View>
    </Appear>
  );
}
