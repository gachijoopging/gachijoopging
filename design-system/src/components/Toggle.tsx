import { Pressable, Switch as RNSwitch, View, type SwitchProps as RNSwitchProps, type ViewStyle } from 'react-native';
import { radius } from '../../tokens/radius.ts';
import { size as sizes, space } from '../../tokens/spacing.ts';
import { borderWidth } from '../../tokens/elevation.ts';
import { disabledOpacity, pressedOpacity, useRipple, useTheme } from '../theme.tsx';
import { Icon } from './Icon.tsx';
import { Txt } from './Text.tsx';

export type SwitchProps = Omit<RNSwitchProps, 'disabled' | 'onValueChange' | 'value'> & {
  label: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
  style?: ViewStyle;
  /** 행 제목이 이미 이름을 보일 때. 스크린리더에는 label 이 그대로 읽힙니다 */
  hideLabel?: boolean;
};

/**
 * 라벨이 붙은 스위치. 켜고 끄는 즉시 반영되는 설정에 씁니다 — 제출 버튼을 눌러야
 * 반영되는 값이면 `Checkbox` 가 맞습니다.
 * 켬 트랙은 라임, 손잡이는 onLime 이라 라임 단독의 낮은 대비를 손잡이가 보강합니다.
 */
export function Switch({ label, value, onValueChange, disabled, style, hideLabel, ...rest }: SwitchProps) {
  const { colors } = useTheme();
  return (
    <View style={[{ minHeight: sizes.minTouch, flexDirection: 'row', alignItems: 'center', gap: space.md }, style]}>
      {hideLabel ? null : <Txt variant="bodyLg" style={{ flex: 1 }}>{label}</Txt>}
      <RNSwitch
        accessibilityLabel={label}
        accessibilityState={{ disabled: !!disabled, checked: value }}
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        trackColor={{ false: colors.track, true: colors.lime }}
        // 꺼짐 손잡이가 밝으면 밝은 트랙·바탕에 묻혀 상태가 안 보인다
        thumbColor={value ? colors.onLime : colors.inkFaint}
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

/**
 * 체크박스. 상자와 라벨을 합친 행 전체가 누르는 영역(48)이라 상자는 24 로 작아도 됩니다.
 * 체크 상태는 deep 채움으로만 말합니다 — 라임은 밝은 서피스 위에서 구분되지 않습니다.
 */
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
          opacity: disabled ? disabledOpacity : pressedOpacity(pressed),
        },
        style,
      ]}
    >
      <View
        style={{
          width: sizes.checkbox,
          height: sizes.checkbox,
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
