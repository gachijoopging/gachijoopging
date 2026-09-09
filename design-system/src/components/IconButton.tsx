import { Pressable, type PressableProps, type ViewStyle } from 'react-native';
import { radius } from '../../tokens/radius.ts';
import { size as sizes } from '../../tokens/spacing.ts';
import { useRipple, useTheme, pressedOpacity } from '../theme.tsx';
import { Icon, type IconName } from './Icon.tsx';

export type IconButtonVariant = 'plain' | 'surface' | 'tint' | 'lime' | 'translucent';

export type IconButtonProps = Omit<PressableProps, 'children' | 'style'> & {
  icon: IconName;
  label: string;
  variant?: IconButtonVariant;
  style?: ViewStyle;
};

export function IconButton({
  icon,
  label,
  variant = 'plain',
  disabled,
  style,
  ...rest
}: IconButtonProps) {
  const { colors } = useTheme();
  const ripple = useRipple(undefined, true);
  const background: Record<IconButtonVariant, string> = {
    plain: colors.transparent,
    surface: colors.surface,
    tint: colors.tint,
    lime: colors.lime,
    translucent: colors.surface85,
  };
  const iconColor = variant === 'lime' ? colors.onLime : colors.ink;

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
          backgroundColor: background[variant],
          opacity: disabled ? 0.55 : pressedOpacity(pressed),
        },
        style,
      ]}
      {...rest}
    >
      <Icon name={icon} size={24} color={iconColor} />
    </Pressable>
  );
}
