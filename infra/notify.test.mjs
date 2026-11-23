import test from 'node:test';
import assert from 'node:assert/strict';
import { parseEnv } from './notify.mjs';

test('주석과 빈 줄을 건너뛴다', () => {
  assert.deepEqual(parseEnv('# 주석\n\nA=1\n'), { A: '1' });
});

test('URL 의 = 를 자르지 않는다', () => {
  const url = 'https://meeting.ssafy.com/hooks/abc?x=1&y=2';
  assert.equal(parseEnv(`MM_WEBHOOK_URL=${url}`).MM_WEBHOOK_URL, url);
});

test('감싼 따옴표를 벗긴다', () => {
  assert.equal(parseEnv('A="1"').A, '1');
  assert.equal(parseEnv("A='1'").A, '1');
});

test('값 안의 따옴표는 남긴다', () => {
  assert.equal(parseEnv('A=he"llo').A, 'he"llo');
});

test('빈 값은 빈 문자열이다', () => {
  assert.equal(parseEnv('MM_WEBHOOK_URL=').MM_WEBHOOK_URL, '');
});

test('CRLF 파일을 읽는다 — 팀 전원 Windows 다', () => {
  assert.deepEqual(parseEnv('A=1\r\nB=2\r\n'), { A: '1', B: '2' });
});

test('= 없는 줄과 = 로 시작하는 줄은 무시한다', () => {
  assert.deepEqual(parseEnv('쓰레기\n=5\nA=1'), { A: '1' });
});
