import assert from 'node:assert/strict';
import test from 'node:test';
import { dragAfterSlop, DRAG_SLOP } from './tokens/motion.ts';

test('손가락이 10px 안에서 떨리면 시트를 움직이지 않는다', () => {
  assert.equal(DRAG_SLOP, 10);
  assert.equal(dragAfterSlop(0), 0);
  assert.equal(dragAfterSlop(6), 0);
  assert.equal(dragAfterSlop(-10), 0);
});

test('문턱을 넘으면 넘은 만큼만 따라가 시작할 때 튀지 않는다', () => {
  assert.equal(dragAfterSlop(11), 1);
  assert.equal(dragAfterSlop(40), 30);
  assert.equal(dragAfterSlop(-25), -15);
});
