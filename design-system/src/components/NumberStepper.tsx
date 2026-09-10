import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { space } from '../../tokens/spacing.ts';
import { Field } from './Input.tsx';
import { IconButton } from './IconButton.tsx';
import { clampStepperValue, parseStepperInput } from './NumberStepper.ts';

export type NumberStepperProps = {
  label: string;
  value: number;
  min: number;
  max?: number;
  onChange: (value: number) => void;
  onValidityChange?: (valid: boolean) => void;
  disabled?: boolean;
};

export function NumberStepper({
  label,
  value,
  min,
  max,
  onChange,
  onValidityChange,
  disabled,
}: NumberStepperProps) {
  const [input, setInput] = useState(String(value));
  const [error, setError] = useState<string>();
  const currentValue = useRef(value);
  const repeatTimer = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const repeated = useRef(false);
  const decrementDisabled = !!disabled || currentValue.current <= min;
  const incrementDisabled = !!disabled || (max !== undefined && currentValue.current >= max);

  useEffect(() => {
    currentValue.current = value;
    setInput(String(value));
    setError(undefined);
  }, [value]);

  useEffect(() => () => {
    if (repeatTimer.current) clearInterval(repeatTimer.current);
  }, []);

  const commit = (next: number) => {
    const changed = next !== currentValue.current;
    currentValue.current = next;
    setInput(String(next));
    setError(undefined);
    onValidityChange?.(true);
    if (changed) onChange(next);
  };
  const changeBy = (amount: number) => {
    commit(clampStepperValue(currentValue.current, amount, min, max));
  };
  const stopRepeating = () => {
    if (repeatTimer.current) clearInterval(repeatTimer.current);
    repeatTimer.current = undefined;
  };
  const repeat = (amount: number) => {
    repeated.current = true;
    changeBy(amount);
    repeatTimer.current = setInterval(() => changeBy(amount), 300);
  };
  const buttonProps = (amount: number) => ({
    onPressIn: () => { repeated.current = false; },
    onLongPress: () => repeat(amount),
    delayLongPress: 300,
    onPressOut: stopRepeating,
    onPress: () => { if (!repeated.current) changeBy(amount); },
  });

  return (
    <Field
      label={label}
      value={input}
      editable={!disabled}
      keyboardType="number-pad"
      error={error}
      accessibilityLiveRegion="polite"
      onChangeText={(text) => {
        setInput(text);
        const next = parseStepperInput(text, min, max);
        if (next === undefined) {
          setError(`${max === undefined ? `${min} 이상` : `${min}~${max}`}의 정수를 입력해 주세요.`);
          onValidityChange?.(false);
        } else {
          commit(next);
        }
      }}
      endAdornment={(
        <View style={{ flexDirection: 'row', gap: space.xs }}>
          <IconButton icon="minus" label={`${label} 줄이기`} disabled={decrementDisabled} variant="surface" {...buttonProps(-1)} />
          <IconButton icon="plus" label={`${label} 늘리기`} disabled={incrementDisabled} variant="surface" {...buttonProps(1)} />
        </View>
      )}
    />
  );
}
