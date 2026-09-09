export function clampStepperValue(value: number, amount: number, min: number, max?: number): number {
  return Math.max(min, Math.min(max ?? Number.POSITIVE_INFINITY, value + amount));
}
