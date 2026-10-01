import assert from 'node:assert/strict';
import test from 'node:test';
import { dialogFrame } from './src/components/dialog-motion.ts';

test('대화상자는 살짝 작고 투명한 데서 제자리로 자란다', () => {
  assert.deepEqual(dialogFrame(0, false), { opacity: 0, scale: 0.96 });
  assert.deepEqual(dialogFrame(1, false), { opacity: 1, scale: 1 });
  const mid = dialogFrame(0.5, false);
  assert.ok(mid.scale > 0.96 && mid.scale < 1);
});

test('동작 줄이기를 켜면 크기는 바뀌지 않고 바로 나타난다', () => {
  assert.deepEqual(dialogFrame(0, true), { opacity: 0, scale: 1 });
  assert.equal(dialogFrame(0.5, true).scale, 1);
});
