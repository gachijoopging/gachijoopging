import { Pressable, type PressableProps, type ViewStyle } from 'react-native';
import { radius } from '../../tokens/radius.ts';
import { size as sizes } from '../../tokens/spacing.ts';
import { useRipple, useTheme, pressedOpacity, disabledOpacity } from '../theme.tsx';
import { Icon, type IconName } from './Icon.tsx';

/** 채움 색만 바뀌고 모양은 같으므로 `tone` 입니다 (모양이 바뀌면 `variant`). */
export type IconButtonTone = 'plain' | 'surface' | 'tint' | 'lime' | 'translucent';

export type IconButtonProps = Omit<PressableProps, 'children' | 'style'> & {
  icon: IconName;
  label: string;
  tone?: IconButtonTone;
  style?: ViewStyle;
};

/**
 * 아이콘만으로 동작하는 원형 버튼. 글자가 없어 스크린리더가 읽을 것이 없으므로
 * `label` 을 필수로 받습니다. 보이는 원은 46 이지만 누르는 영역은 48 이고,
 * 리플은 원 밖으로 퍼지는 borderless 입니다 — 원형 컨트롤의 Material 관용구.
 */
export function IconButton({
  icon,
  label,
  tone = 'plain',
  disabled,
  style,
  ...rest
}: IconButtonProps) {
  const { colors } = useTheme();
  const ripple = useRipple(undefined, true);
  const background: Record<IconButtonTone, string> = {
    plain: colors.transparent,
    surface: colors.surface,
    tint: colors.tint,
    lime: colors.lime,
    translucent: colors.surface85,
  };
  const iconColor = tone === 'lime' ? colors.onLime : colors.ink;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      android_ripple={disabled ? undefined : ripple}
      style={({ pressed }) => [
        {
          width: sizes.iconButton,
          minHeight: sizes.iconButton,
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: radius.pill,
          backgroundColor: background[tone],
          opacity: disabled ? disabledOpacity : pressedOpacity(pressed),
        },
        style,
      ]}
      {...rest}
    >
      <Icon name={icon} size={24} color={iconColor} />
    </Pressable>
  );
}
