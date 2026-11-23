import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const APP = resolve(__dirname, '../app');

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith('.tsx') ? [p] : [];
  });
}

const resolvable = (from: string, spec: string) => {
  const base = resolve(dirname(from), spec);
  return ['', '.ts', '.tsx', '/index.ts', '/index.tsx'].some((ext) => existsSync(base + ext));
};

test('화면 번호는 라우트 파일명으로 쓰지 않는다', () => {
  expect(walk(APP).filter((file) => /^\d/.test(file.split(/[\\/]/).at(-1)!))).toEqual([]);
});

/**
 * 라우트 파일을 폴더로 옮기면 `../src` 가 한 칸씩 어긋난다. tsc 는 png require 를 보지 않아
 * 번들이 뜰 때야 500 으로 드러났다 — 여기서 먼저 잡는다.
 */
describe('app/ 의 상대 경로 참조', () => {
  test.each(walk(APP).map((f) => [f.slice(APP.length + 1).replace(/\\/g, '/'), f]))('%s', (_, file) => {
    const src = readFileSync(file, 'utf8');
    const specs = [...src.matchAll(/(?:from|require\()\s*'(\.{1,2}\/[^']+)'/g)].map((m) => m[1]);
    const missing = specs.filter((s) => !resolvable(file, s));
    expect(missing).toEqual([]);
  });
});
