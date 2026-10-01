import { authenticatedDestination, resolveDestination, type Me } from './destination';
import type { ApiClient } from '../api/client';
import { existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

/** 라우트 그룹 `(이름)/` 과 `index` 를 거쳐도 URL 이 같은 파일을 찾는다 */
function routeFileExists(route: string): boolean {
  const app = resolve(__dirname, '../../app');
  const groups = ['', ...readdirSync(app).filter((d) => /^\(.+\)$/.test(d)).map((d) => `/${d}`)];
  return groups.some((g) => existsSync(`${app}${g}${route}.tsx`) || existsSync(`${app}${g}${route}/index.tsx`));
}

describe('resolveDestination', () => {
  test('현재 버전 필수 동의가 없으면 크루 소속보다 재동의를 먼저 한다', async () => {
    const get = jest.fn().mockResolvedValue({ data: { complete: false } });
    const api = { get } as unknown as ApiClient;
    expect(await authenticatedDestination(api, { profileComplete: true, membership: { status: 'MEMBER' } })).toBe('/nickname');
    expect(get).toHaveBeenCalledWith('GET /users/me/agreements');
  });
  test('동의 조회 실패를 완료로 간주하지 않는다', async () => {
    const api = { get: jest.fn().mockRejectedValue(new Error('offline')) } as unknown as ApiClient;
    await expect(authenticatedDestination(api, { profileComplete: true, membership: { status: 'MEMBER' } })).rejects.toThrow('offline');
  });
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
