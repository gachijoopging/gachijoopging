import { Pressable, View, type ViewProps, type ViewStyle } from 'react-native';
import { radius } from '../../tokens/radius.ts';
import { space } from '../../tokens/spacing.ts';
import { borderWidth, type ShadowLevel } from '../../tokens/elevation.ts';
import { useTheme, useRipple, pressedOpacity, disabledOpacity, depth } from '../theme.tsx';

export type CardProps = ViewProps & {
  /** 반투명 서피스 — 사진이나 지도 위에 얹을 때 */
  translucent?: boolean;
  padded?: boolean;
  level?: ShadowLevel;
  /**
   * 주면 카드 전체가 하나의 버튼이 됩니다. 카드 안에 따로 누르는 것을 두지 마세요 —
   * 겹친 터치 영역은 스크린리더가 하나로 읽어 안쪽 조작에 닿을 수 없습니다.
   */
  onPress?: () => void;
  /** 길게 눌러 여는 동작. 스크린리더용으로는 accessibilityActions 를 함께 준다 */
  onLongPress?: () => void;
  disabled?: boolean;
};

export function Card({
  translucent = false,
  padded = true,
  level = 'card',
  onPress,
  onLongPress,
  disabled,
  style,
  children,
  accessibilityLabel,
  accessibilityActions,
  onAccessibilityAction,
  ...rest
}: CardProps) {
  const { colors, shadows } = useTheme();
  const ripple = useRipple();
  const base: ViewStyle = {
    backgroundColor: translucent ? colors.surface85 : colors.surface,
    borderRadius: radius.card,
    padding: padded ? space.lg : 0,
    // 그림자가 안 그려지는 기기에서도 층이 남도록 테두리를 항상 둡니다.
    borderWidth: borderWidth.hairline,
    borderColor: colors.border,
    ...depth(level, shadows[level]),
  };
  if (!onPress) {
    return (
      <View style={[base, style]} accessibilityLabel={accessibilityLabel} {...rest}>
        {children}
      </View>
    );
  }

  // 그림자는 바깥 틀에, 리플은 안쪽에서 모서리로 잘라야 둘 다 보입니다.
  // overflow: hidden 을 그림자와 같은 뷰에 주면 그림자까지 잘립니다.
  const { padding, ...frame } = base;
  return (
    <View style={[frame, style]} {...rest}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityState={{ disabled: !!disabled }}
        accessibilityActions={accessibilityActions}
        onAccessibilityAction={onAccessibilityAction}
        onPress={onPress}
        onLongPress={onLongPress}
        disabled={disabled}
        android_ripple={disabled ? undefined : ripple}
        style={({ pressed }) => ({
          padding,
          borderRadius: radius.card,
          overflow: 'hidden',
          opacity: disabled ? disabledOpacity : pressedOpacity(pressed),
        })}
      >
        {children}
      </Pressable>
    </View>
  );
}

export type TileTone = 'tint' | 'surface' | 'dark';

/**
 * 타일 — 카드보다 작고 정보 한 조각만 담는 블록.
 *
 * 원본 `bg_tile_round` 는 반경 20 을 직접 박아 썼습니다. 토큰 스케일에 없는
 * 값이라 올림 방향(원본 간격 규약과 같은 흡수 방향)으로 `radius.cardSm`(22)에
 * 맞췄습니다.
 */
export function Tile({
  tone = 'tint',
  padded = true,
  style,
  ...rest
}: ViewProps & { tone?: TileTone; padded?: boolean }) {
  const { colors } = useTheme();
  const fills: Record<TileTone, string> = {
    tint: colors.tint,
    surface: colors.surface,
    dark: colors.deep,
  };
  const base: ViewStyle = {
    backgroundColor: fills[tone],
    borderRadius: radius.cardSm,
    padding: padded ? space.md : 0,
  };
  return <View style={[base, style]} {...rest} />;
}
