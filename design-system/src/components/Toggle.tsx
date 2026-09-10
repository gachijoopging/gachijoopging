import { Pressable, Switch as RNSwitch, View, type SwitchProps as RNSwitchProps, type ViewStyle } from 'react-native';
import { radius } from '../../tokens/radius.ts';
import { size as sizes, space } from '../../tokens/spacing.ts';
import { borderWidth } from '../../tokens/elevation.ts';
import { pressedOpacity, useRipple, useTheme } from '../theme.tsx';
import { Icon } from './Icon.tsx';
import { Txt } from './Text.tsx';

export type SwitchProps = Omit<RNSwitchProps, 'disabled' | 'onValueChange' | 'value'> & {
  label: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
  style?: ViewStyle;
};

export function Switch({ label, value, onValueChange, disabled, style, ...rest }: SwitchProps) {
  const { colors } = useTheme();
  return (
    <View style={[{ minHeight: sizes.minTouch, flexDirection: 'row', alignItems: 'center', gap: space.md }, style]}>
      <Txt variant="bodyLg" style={{ flex: 1 }}>{label}</Txt>
      <RNSwitch
        accessibilityLabel={label}
        accessibilityState={{ disabled: !!disabled, checked: value }}
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        trackColor={{ false: colors.track, true: colors.lime }}
        thumbColor={value ? colors.onLime : colors.surface}
        ios_backgroundColor={colors.track}
        {...rest}
      />
    </View>
  );
}

export type CheckboxProps = {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  style?: ViewStyle;
};

export function Checkbox({ label, checked, onChange, disabled, style }: CheckboxProps) {
  const { colors } = useTheme();
  const ripple = useRipple();
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={label}
      accessibilityState={{ checked, disabled: !!disabled }}
      disabled={disabled}
      onPress={() => onChange(!checked)}
      android_ripple={disabled ? undefined : ripple}
      style={({ pressed }) => [
        {
          minHeight: sizes.minTouch,
          flexDirection: 'row',
          alignItems: 'center',
          gap: space.sm,
          opacity: disabled ? 0.55 : pressedOpacity(pressed),
        },
        style,
      ]}
    >
      <View
        style={{
          width: 24,
          height: 24,
          borderRadius: radius.field / 2,
          borderWidth: borderWidth.focus,
          borderColor: checked ? colors.deep : colors.inkHint,
          backgroundColor: checked ? colors.deep : colors.transparent,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {checked ? <Icon name="check" size={16} color={colors.onDark} /> : null}
      </View>
      <Txt variant="body">{label}</Txt>
    </Pressable>
  );
}
