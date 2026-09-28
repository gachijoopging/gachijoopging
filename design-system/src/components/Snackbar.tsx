import { useEffect, useRef } from 'react';
import { Animated, Pressable, View, AccessibilityInfo } from 'react-native';
import { radius } from '../../tokens/radius.ts';
import { space, screen, size as sizes } from '../../tokens/spacing.ts';
import { borderWidth } from '../../tokens/elevation.ts';
import { useTheme, useRipple, depth } from '../theme.tsx';
import { Txt } from './Text.tsx';

/**
 * 스낵바. 되돌릴 수 있는 결과를 알리는 일시적 피드백입니다.
 *
 * Material 은 이런 알림에 스낵바를 쓰고, 대화상자는 "반드시 중단해야 하는 결정"에만
 * 씁니다. 저장됨 · 삭제됨 · 전송됨 같은 결과를 대화상자로 띄우면 사용자가 확인
 * 버튼을 누르는 일만 늘어납니다.
 *
 * 시스템의 '애니메이션 제거' 설정을 켠 사용자에게는 페이드 없이 즉시 나타납니다.
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
  const opacity = useRef(new Animated.Value(0)).current;
  const reduceMotion = useRef(false);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then((v) => {
      reduceMotion.current = v;
    });
  }, []);

  useEffect(() => {
    Animated.timing(opacity, {
      toValue: visible ? 1 : 0,
      duration: reduceMotion.current ? 0 : 180,
      useNativeDriver: true,
    }).start();
    if (!visible || !onDismiss) return;
    const t = setTimeout(onDismiss, duration);
    return () => clearTimeout(t);
  }, [visible, duration, onDismiss, opacity]);

  useEffect(() => {
    if (visible) AccessibilityInfo.announceForAccessibility(message);
  }, [visible, message]);

  if (!visible) return null;

  return (
    <Animated.View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        left: screen.horizontal,
        right: screen.horizontal,
        // Screen 이 이미 아래 안전 영역을 비워 둔다. 여기서 또 더하면 제스처 바만큼 떠 보인다
        bottom: space.lg,
        opacity,
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
          {message}
        </Txt>
        {actionLabel && onAction ? (
          <Pressable
            accessibilityRole="button"
            onPress={onAction}
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
    </Animated.View>
  );
}
