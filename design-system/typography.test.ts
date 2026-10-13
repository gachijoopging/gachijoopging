import assert from 'node:assert/strict';
import test from 'node:test';
import { fontSize, tracking } from './tokens/typography.ts';

const sizes = Object.keys(fontSize) as (keyof typeof fontSize)[];

test('큰 글자일수록 자간을 좁히고 작은 글자는 조금 띄운다', () => {
  const ordered = [...sizes].sort((a, b) => fontSize[b] - fontSize[a]);
  for (let i = 1; i < ordered.length; i++) {
    const bigger = ordered[i - 1];
    const smaller = ordered[i];
    assert.ok(tracking[bigger] <= tracking[smaller], `${bigger}(${fontSize[bigger]}) 의 자간이 ${smaller}(${fontSize[smaller]}) 보다 넓다`);
  }
  assert.ok(tracking.counter < 0, '큰 숫자는 좁힌다');
  assert.equal(tracking.body, 0, '본문은 손대지 않는다');
  assert.ok(tracking.micro > 0, '12 크기는 조금 띄운다');
});

test('자간은 글자 크기의 5% 를 넘지 않는다', () => {
  for (const v of sizes) assert.ok(Math.abs(tracking[v]) <= fontSize[v] * 0.05, `${v} 자간이 지나치다`);
});

test('재설정 코드처럼 한 글자씩 읽는 문자열의 자간은 따로 둔다', () => {
  assert.ok(tracking.code > 0);
});
