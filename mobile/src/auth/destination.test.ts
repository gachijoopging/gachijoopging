import { resolveDestination, type Me } from './destination';

describe('resolveDestination', () => {
  test('닉네임 미완료면 닉네임 화면부터', () => {
    const me: Me = { profileComplete: false, membership: { status: 'MEMBER' } };
    expect(resolveDestination(me)).toBe('/1-4-nickname');
  });

  test('소속 없음(NONE)이면 크루 만들기/가입하기로', () => {
    const me: Me = { profileComplete: true, membership: { status: 'NONE' } };
    expect(resolveDestination(me)).toBe('/1-6-crew-onboarding');
  });

  test('승인 대기(PENDING)면 승인 대기 화면으로', () => {
    const me: Me = { profileComplete: true, membership: { status: 'PENDING' } };
    expect(resolveDestination(me)).toBe('/1-9-pending');
  });

  test('크루원(MEMBER)이면 탭으로', () => {
    const me: Me = { profileComplete: true, membership: { status: 'MEMBER' } };
    expect(resolveDestination(me)).toBe('/(tabs)');
  });

  test('membership 이 없으면 NONE 과 동일하게 취급한다', () => {
    const me: Me = { profileComplete: true };
    expect(resolveDestination(me)).toBe('/1-6-crew-onboarding');
  });
});
