import { useState, type ReactNode } from 'react';
import { TextInput, View, type TextInputProps, type ViewStyle } from 'react-native';
import { radius } from '../../tokens/radius.ts';
import { space, size as sizes } from '../../tokens/spacing.ts';
import { borderWidth } from '../../tokens/elevation.ts';
import { fontSize, lineHeight, fontFamily } from '../../tokens/typography.ts';
import { useTheme } from '../theme.tsx';
import { Txt } from './Text.tsx';

export type FieldProps = Omit<TextInputProps, 'style'> & {
  label?: string;
  /** 문자열이면 그대로 오류 문구로 보여주고 테두리를 오류색으로 바꿉니다 */
  error?: string;
  hint?: string;
  multiline?: boolean;
  endAdornment?: ReactNode;
  style?: ViewStyle;
};

/**
 * 입력창. 원본 `bg_input_multiline` · `bg_input_error` 기준으로 테두리 2 를 씁니다.
 *
 * 원본은 여러 줄에 `radius_tile`(18), 오류에 `radius_field`(16)를 써서 같은 입력창이
 * 상태에 따라 모서리가 바뀌었습니다. 상태는 색으로만 말하는 게 맞아서 여기서는
 * `radius.field` 로 통일했습니다.
 */
export function Field({
  label,
  error,
  hint,
  multiline = false,
  endAdornment,
  editable = true,
  style,
  onFocus,
  onBlur,
  ...rest
}: FieldProps) {
  const { colors } = useTheme();
  const [focused, setFocused] = useState(false);

  const borderColor = error
    ? colors.error
    : focused
      ? colors.deep
      : colors.border;

  const box: ViewStyle = {
    backgroundColor: editable ? colors.surface : colors.neutral,
    borderRadius: radius.field,
    borderWidth: borderWidth.focus,
    borderColor,
    paddingHorizontal: space.lg,
    paddingVertical: multiline ? space.md : 0,
    minHeight: multiline ? 96 : sizes.iconButton,
    justifyContent: 'center',
    flexDirection: 'row',
    alignItems: multiline ? 'flex-start' : 'center',
  };

  return (
    <View style={[{ gap: space.xs, alignSelf: 'stretch' }, style]}>
      {label ? (
        <Txt variant="label" tone="muted">
          {label}
        </Txt>
      ) : null}
      <View style={box}>
        <TextInput
          editable={editable}
          multiline={multiline}
          placeholderTextColor={colors.inkHint}
          accessibilityLabel={label}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          style={{
            color: colors.ink,
            fontFamily: fontFamily.regular,
            fontSize: fontSize.bodyLg,
            lineHeight: lineHeight.bodyLg,
            textAlignVertical: multiline ? 'top' : 'center',
            minHeight: multiline ? 72 : undefined,
            paddingVertical: 0,
            flex: 1,
          }}
          {...rest}
        />
        {endAdornment ? <View style={{ marginLeft: space.sm }}>{endAdornment}</View> : null}
      </View>
      {error ? (
        <Txt variant="caption" tone="error">
          {error}
        </Txt>
      ) : hint ? (
        <Txt variant="caption" tone="hint">
          {hint}
        </Txt>
      ) : null}
    </View>
  );
}
