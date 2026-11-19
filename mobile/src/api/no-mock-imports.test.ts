import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(__dirname, '..', '..');
const sources = (dir: string) =>
  (readdirSync(join(root, dir), { recursive: true }) as string[])
    .filter((file) => /\.tsx?$/.test(file) && !/\.test\.ts$/.test(file))
    .map((file) => join(dir, file).replace(/\\/g, '/'));

test('앱 코드는 목 데이터와 목 클라이언트를 가져오지 않는다 — example 이 번들에 실려 실서버 응답처럼 보이면 안 된다', () => {
  const offenders = [...sources('app'), ...sources('src')].filter((file) => /mocks\.generated|test-support/.test(readFileSync(join(root, file), 'utf8')));
  expect(offenders).toEqual([]);
});
