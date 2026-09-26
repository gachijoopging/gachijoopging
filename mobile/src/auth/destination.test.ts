import { resolveDestination, type Me } from './destination';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

describe('resolveDestination', () => {
  test('온보딩 분기가 가리키는 화면 파일이 존재한다', () => {
    for (const status of ['NONE', 'PENDING'] as const) {
      const route = resolveDestination({ profileComplete: true, membership: { status } });
      expect(existsSync(resolve(__dirname, '../..', `app${route}.tsx`))).toBe(true);
    }
  });
  test('닉네임 미완료면 닉네임 화면부터', () => {
    const me: Me = { profileComplete: false, membership: { status: 'MEMBER' } };
    expect(resolveDestination(me)).toBe('/1-4-nickname');
  });

  test('소속 없음(NONE)이면 크루 만들기/가입하기로', () => {
    const me: Me = { profileComplete: true, membership: { status: 'NONE' } };
    expect(resolveDestination(me)).toBe('/1-6-create-or-join-crew');
  });

  test('승인 대기(PENDING)면 승인 대기 화면으로', () => {
    const me: Me = { profileComplete: true, membership: { status: 'PENDING' } };
    expect(resolveDestination(me)).toBe('/1-9-pending-approval');
  });

  test('크루원(MEMBER)이면 탭으로', () => {
    const me: Me = { profileComplete: true, membership: { status: 'MEMBER' } };
    expect(resolveDestination(me)).toBe('/(tabs)');
  });

  test('membership 이 없으면 NONE 과 동일하게 취급한다', () => {
    const me: Me = { profileComplete: true };
    expect(resolveDestination(me)).toBe('/1-6-create-or-join-crew');
  });
});
