import assert from 'node:assert/strict';
import test from 'node:test';
import { clampStepperValue, parseStepperInput } from './src/components/NumberStepper.ts';

test('clampStepperValue keeps a step inside its supplied bounds', () => {
  assert.equal(clampStepperValue(1, -1, 1, 8), 1);
  assert.equal(clampStepperValue(8, 1, 1, 8), 8);
  assert.equal(clampStepperValue(4, 1, 1, 8), 5);
});

test('parseStepperInput accepts only bounded integers', () => {
  assert.equal(parseStepperInput('12', 0), 12);
  assert.equal(parseStepperInput('', 0), undefined);
  assert.equal(parseStepperInput('-1', 0), undefined);
  assert.equal(parseStepperInput('1.5', 0), undefined);
  assert.equal(parseStepperInput('9', 0, 8), undefined);
});
