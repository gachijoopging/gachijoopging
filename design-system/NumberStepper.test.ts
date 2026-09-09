import assert from 'node:assert/strict';
import test from 'node:test';
import { clampStepperValue } from './src/components/NumberStepper.ts';

test('clampStepperValue keeps a step inside its supplied bounds', () => {
  assert.equal(clampStepperValue(1, -1, 1, 8), 1);
  assert.equal(clampStepperValue(8, 1, 1, 8), 8);
  assert.equal(clampStepperValue(4, 1, 1, 8), 5);
});
