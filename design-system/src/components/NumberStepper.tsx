import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { space, size } from '../../tokens/spacing.ts';
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
  /** 바로 위에 같은 이름이 이미 보일 때. 스크린리더에는 그대로 읽힌다 */
  hideLabel?: boolean;
};

/**
 * 정수 수량 입력. −/+ 만으로는 큰 수를 넣기 어렵고, 직접 입력만으로는 한 개씩
 * 고치기 번거로워서 둘을 함께 둡니다. 길게 누르면 0.3초마다 반복합니다.
 * 범위 밖이거나 정수가 아닌 입력은 값으로 올리지 않고 `Field` 오류로 남겨,
 * 부모는 `onValidityChange` 로 제출을 막습니다.
 */
/** 입력칸 안에 −/+ 둘과 세 자리 숫자가 함께 들어가는 최소 폭 */
const NARROW_WIDTH = size.minTouch * 3 + space.xs + space.lg * 2;

export function NumberStepper({
  label,
  value,
  min,
  max,
  onChange,
  onValidityChange,
  disabled,
  hideLabel,
}: NumberStepperProps) {
  // 2열 카드처럼 좁으면 −/+ 를 입력칸 안에 두면 숫자 자리가 사라진다. 글자·터치 영역을 줄이지 않고 다음 줄로 내린다
  const [narrow, setNarrow] = useState(false);
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

  const buttons = (
    <View style={{ flexDirection: 'row', gap: space.xs }}>
      <IconButton icon="minus" label={`${label} 줄이기`} disabled={decrementDisabled} tone="surface" {...buttonProps(-1)} />
      <IconButton icon="plus" label={`${label} 늘리기`} disabled={incrementDisabled} tone="surface" {...buttonProps(1)} />
    </View>
  );

  return (
    <View onLayout={(e) => setNarrow(e.nativeEvent.layout.width < NARROW_WIDTH)} style={{ gap: space.xs }}>
      <Field
        label={hideLabel ? undefined : label}
        accessibilityLabel={label}
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
        endAdornment={narrow ? undefined : buttons}
      />
      {narrow ? buttons : null}
    </View>
  );
}
