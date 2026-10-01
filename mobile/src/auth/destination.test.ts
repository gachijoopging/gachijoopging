import { resolveDestination, type Me } from './destination';
import { existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

/** 라우트 그룹 `(이름)/` 과 `index` 를 거쳐도 URL 이 같은 파일을 찾는다 */
function routeFileExists(route: string): boolean {
  const app = resolve(__dirname, '../../app');
  const groups = ['', ...readdirSync(app).filter((d) => /^\(.+\)$/.test(d)).map((d) => `/${d}`)];
  return groups.some((g) => existsSync(`${app}${g}${route}.tsx`) || existsSync(`${app}${g}${route}/index.tsx`));
}

describe('resolveDestination', () => {
  test('온보딩 분기가 가리키는 화면 파일이 존재한다', () => {
    for (const status of ['NONE', 'PENDING'] as const) {
      const route = resolveDestination({ profileComplete: true, membership: { status } });
      expect(routeFileExists(route)).toBe(true);
    }
  });
  test('닉네임 미완료면 닉네임 화면부터', () => {
    const me: Me = { profileComplete: false, membership: { status: 'MEMBER' } };
    expect(resolveDestination(me)).toBe('/nickname');
  });

  test('소속 없음(NONE)이면 크루 만들기/가입하기로', () => {
    const me: Me = { profileComplete: true, membership: { status: 'NONE' } };
    expect(resolveDestination(me)).toBe('/crew-choice');
  });

  test('승인 대기(PENDING)면 승인 대기 화면으로', () => {
    const me: Me = { profileComplete: true, membership: { status: 'PENDING' } };
    expect(resolveDestination(me)).toBe('/pending-approval');
  });

  test('크루원(MEMBER)이면 탭으로', () => {
    const me: Me = { profileComplete: true, membership: { status: 'MEMBER' } };
    expect(resolveDestination(me)).toBe('/(tabs)');
  });

  test('membership 이 없으면 NONE 과 동일하게 취급한다', () => {
    const me: Me = { profileComplete: true };
    expect(resolveDestination(me)).toBe('/crew-choice');
  });
});
