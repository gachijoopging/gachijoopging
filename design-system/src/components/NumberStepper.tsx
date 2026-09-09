import { View } from 'react-native';
import { space } from '../../tokens/spacing.ts';
import { Field } from './Input.tsx';
import { IconButton } from './IconButton.tsx';
import { clampStepperValue } from './NumberStepper.ts';

export type NumberStepperProps = {
  label: string;
  value: number;
  min: number;
  max?: number;
  onChange: (value: number) => void;
  disabled?: boolean;
};

export function NumberStepper({ label, value, min, max, onChange, disabled }: NumberStepperProps) {
  const decrementDisabled = !!disabled || value <= min;
  const incrementDisabled = !!disabled || (max !== undefined && value >= max);
  const changeBy = (amount: number) => {
    const next = clampStepperValue(value, amount, min, max);
    if (next !== value) onChange(next);
  };

  return (
    <Field
      label={label}
      value={String(value)}
      editable={false}
      endAdornment={(
        <View style={{ flexDirection: 'row', gap: space.xs }}>
          <IconButton icon="minus" label={`${label} 줄이기`} onPress={() => changeBy(-1)} disabled={decrementDisabled} variant="surface" />
          <IconButton icon="plus" label={`${label} 늘리기`} onPress={() => changeBy(1)} disabled={incrementDisabled} variant="surface" />
        </View>
      )}
    />
  );
}
