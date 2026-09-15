import { Pressable, type ViewStyle } from 'react-native';
import { size as sizes, useRipple, pressedOpacity, Txt, type TextTone } from 'design-system/src';

type LinkTextProps = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  tone?: TextTone;
  bold?: boolean;
  accessibilityLabel?: string;
  style?: ViewStyle;
};

/**
 * 문구 전체가 터치 영역인 링크. 1-1·1-2 처럼 버튼 모양 없이 글자만 있는 링크에 쓴다 —
 * 옛 `Gachi.Button.Link` 자리. 48dp 를 못 채우는 작은 글자라 위아래 여백을 터치 영역에 넣는다.
 */
export function LinkText({ label, onPress, disabled, tone = 'ink', bold, accessibilityLabel, style }: LinkTextProps) {
  const ripple = useRipple();
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: !!disabled }}
      onPress={onPress}
      disabled={disabled}
      android_ripple={disabled ? undefined : ripple}
      style={({ pressed }) => [
        { minHeight: sizes.minTouch, alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.55 : pressedOpacity(pressed) },
        style,
      ]}
    >
      <Txt variant="body" tone={tone} bold={bold}>
        {label}
      </Txt>
    </Pressable>
  );
}
