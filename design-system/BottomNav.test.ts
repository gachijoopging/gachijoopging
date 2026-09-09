import assert from 'node:assert/strict';
import test from 'node:test';
import { splitBottomNavItems } from './src/components/BottomNav.ts';

test('splitBottomNavItems replaces the middle item in the canonical five-tab layout', () => {
  assert.deepEqual(splitBottomNavItems(['home', 'feed', 'start', 'crew', 'me']), [
    ['home', 'feed'],
    ['crew', 'me'],
  ]);
  assert.deepEqual(splitBottomNavItems(['home', 'feed', 'crew', 'me']), [
    ['home', 'feed'],
    ['crew', 'me'],
  ]);
});
