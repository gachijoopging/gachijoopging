export function clampStepperValue(value: number, amount: number, min: number, max?: number): number {
  return Math.max(min, Math.min(max ?? Number.POSITIVE_INFINITY, value + amount));
}

export function parseStepperInput(value: string, min: number, max?: number): number | undefined {
  if (!/^\d+$/.test(value)) return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= min && (max === undefined || parsed <= max)
    ? parsed
    : undefined;
}
