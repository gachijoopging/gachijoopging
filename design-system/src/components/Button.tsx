import {
  ActivityIndicator,
  Pressable,
  View,
  type PressableProps,
  type ViewStyle,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { gradient } from '../../tokens/colors.ts';
import { radius } from '../../tokens/radius.ts';
import { space, size as sizes } from '../../tokens/spacing.ts';
import { borderWidth } from '../../tokens/elevation.ts';
import { useTheme, useRipple, pressedOpacity, disabledOpacity, depth } from '../theme.tsx';
import { Txt, type TextVariant } from './Text.tsx';
import { Icon, type IconName } from './Icon.tsx';

export type ButtonVariant = 'primary' | 'soft' | 'kakao' | 'ghost' | 'deep' | 'danger' | 'ghostDanger' | 'translucent';
export type ButtonSize = 'lg' | 'md' | 'sm';

/**
 * `sm` 은 본문 흐름에 박히는 작은 알약이라 보이는 높이가 48 보다 작습니다.
 * 그래서 `hitSlop` 으로 누를 수 있는 영역만 48 로 넓힙니다 — Material 은 보이는
 * 크기가 아니라 터치 영역에 48 을 요구합니다.
 */
const SIZES: Record<
  ButtonSize,
  { pv: number; ph: number; text: TextVariant; icon: number; minHeight: number; slop: number }
> = {
  lg: { pv: space.lg, ph: space['2xl'], text: 'subtitle', icon: 20, minHeight: sizes.minTouch, slop: 0 },
  md: { pv: space.md, ph: space.xl, text: 'bodyLg', icon: 18, minHeight: sizes.minTouch, slop: 0 },
  sm: { pv: space.xs, ph: space.md, text: 'body', icon: 15, minHeight: 0, slop: 10 },
};

export type ButtonProps = Omit<PressableProps, 'style' | 'children'> & {
  label: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: IconName;
  loading?: boolean;
  fullWidth?: boolean;
  style?: ViewStyle;
};

export function Button({
  label,
  variant = 'primary',
  size = 'lg',
  icon,
  loading = false,
  fullWidth = false,
  disabled,
  style,
  ...rest
}: ButtonProps) {
  const { colors } = useTheme();
  const ripple = useRipple();
  const s = SIZES[size];
  const off = disabled || loading;

  const shell: ViewStyle = {
    minHeight: s.minHeight,
    paddingVertical: s.pv,
    paddingHorizontal: s.ph,
    borderRadius: variant === 'soft' ? radius.field : radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: space.sm,
    alignSelf: fullWidth ? 'stretch' : 'flex-start',
    opacity: disabled ? disabledOpacity : 1,
  };

  const fill: Record<ButtonVariant, ViewStyle> = {
    primary: {},
    soft: { backgroundColor: colors.softChip },
    kakao: { backgroundColor: colors.kakao },
    ghost: {
      backgroundColor: colors.transparent,
      borderWidth: borderWidth.hairline,
      // border 는 카드 층 신호용(배경 위 1.01:1)이라 채움 없는 버튼의 경계로는 안 보인다
      borderColor: colors.inkHint,
    },
    deep: { backgroundColor: colors.deep },
    danger: { backgroundColor: colors.error },
    ghostDanger: {
      backgroundColor: colors.transparent,
      borderWidth: borderWidth.hairline,
      borderColor: colors.error,
    },
    translucent: { backgroundColor: colors.surface85 },
  };

  const inkFor: Record<ButtonVariant, string> = {
    primary: colors.onLime,
    soft: colors.ink,
    kakao: colors.kakaoInk,
    ghost: colors.ink,
    deep: colors.onDark,
    danger: colors.onError,
    ghostDanger: colors.error,
    translucent: colors.ink,
  };
  // 원본에는 비활성 드로어블이 없습니다(bg_button_cta 가 존재하지 않는 파일을
  // 가리킵니다). track 채움 + muted 잉크로 새로 정의합니다.
  // hint 잉크는 야간 track 위에서 4.37:1 로 본문 하한을 못 넘겨서 한 단계 올렸습니다.
  const ink = off && variant === 'primary' ? colors.inkMuted : inkFor[variant];

  const inner = (
    <>
      {loading ? (
        <ActivityIndicator size="small" color={ink} />
      ) : icon ? (
        <Icon name={icon} size={s.icon} color={ink} />
      ) : null}
      <Txt variant={s.text} bold style={{ color: ink }}>
        {label}
      </Txt>
    </>
  );

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!off, busy: loading }}
      disabled={off}
      hitSlop={s.slop}
      android_ripple={ripple}
      style={({ pressed }) => [
        {
          opacity: off ? 1 : pressedOpacity(pressed),
          borderRadius: variant === 'soft' ? radius.field : radius.pill,
          overflow: 'hidden',
        },
        fullWidth && { alignSelf: 'stretch' },
        style,
      ]}
      {...rest}
    >
      {variant === 'primary' ? (
        <LinearGradient
          colors={off ? [colors.track, colors.track] : gradient.primary.colors}
          start={gradient.primary.start}
          end={gradient.primary.end}
          style={shell}
        >
          {inner}
        </LinearGradient>
      ) : (
        <View style={[shell, fill[variant]]}>
          {inner}
        </View>
      )}
    </Pressable>
  );
}

/**
 * 촬영 버튼. 원본 `bg_capture_fab` — 원형에 라임→노랑 그라데이션,
 * 서피스 색 테두리로 배경에서 떼어냅니다.
 */
export function CaptureButton({
  onPress,
  disabled,
}: {
  onPress?: () => void;
  disabled?: boolean;
}) {
  const { colors, shadows } = useTheme();
  const ripple = useRipple(undefined, true);
  const d = sizes.captureFab;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="촬영"
      disabled={disabled}
      onPress={onPress}
      android_ripple={disabled ? undefined : ripple}
      style={({ pressed }) => ({
        width: d,
        height: d,
        borderRadius: d / 2,
        borderWidth: sizes.captureRing,
        borderColor: colors.surface,
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        opacity: disabled ? disabledOpacity : pressedOpacity(pressed),
        ...depth('lime', shadows.lime),
      })}
    >
      <LinearGradient
        colors={gradient.primary.colors}
        start={gradient.primary.start}
        end={gradient.primary.end}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
      />
      <Icon name="camera" size={30} color={colors.onLime} />
    </Pressable>
  );
}
