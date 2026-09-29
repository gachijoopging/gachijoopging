import { useEffect, useRef, useState } from 'react';
import { Animated, View } from 'react-native';
import { motion } from '../../tokens/motion.ts';
import { space, size } from '../../tokens/spacing.ts';
import { Field } from './Input.tsx';
import { IconButton } from './IconButton.tsx';
import { useReduceMotion } from '../theme.tsx';
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
  /** −/+ 의 읽는 이름. 기본은 "{label} 줄이기" · "{label} 늘리기" */
  decrementLabel?: string;
  incrementLabel?: string;
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
  decrementLabel = `${label} 줄이기`,
  incrementLabel = `${label} 늘리기`,
}: NumberStepperProps) {
  // 2열 카드처럼 좁으면 −/+ 를 입력칸 안에 두면 숫자 자리가 사라진다. 글자·터치 영역을 줄이지 않고 다음 줄로 내린다.
  // 재기 전(null)엔 그리지 않는다 — 칸 안에 그렸다가 아래로 내려가며 튄다
  const [narrow, setNarrow] = useState<boolean | null>(null);
  const reduce = useReduceMotion();
  const bump = useRef(new Animated.Value(1)).current;
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
    const before = currentValue.current;
    commit(clampStepperValue(currentValue.current, amount, min, max));
    // 누를 때마다 값이 바뀌었다는 것을 살짝 커졌다 돌아오는 것으로 알린다
    if (currentValue.current !== before && !reduce) {
      bump.setValue(1.04);
      Animated.spring(bump, { toValue: 1, ...motion.settle, useNativeDriver: true }).start();
    }
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
      <IconButton icon="minus" label={decrementLabel} disabled={decrementDisabled} tone="surface" {...buttonProps(-1)} />
      <IconButton icon="plus" label={incrementLabel} disabled={incrementDisabled} tone="surface" {...buttonProps(1)} />
    </View>
  );

  return (
    <View onLayout={(e) => setNarrow(e.nativeEvent.layout.width < NARROW_WIDTH)} style={{ gap: space.xs, opacity: narrow === null ? 0 : 1 }}>
      <Animated.View style={{ transform: [{ scale: bump }] }}>
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
          endAdornment={narrow === false ? buttons : undefined}
        />
      </Animated.View>
      {narrow ? buttons : null}
    </View>
  );
}
