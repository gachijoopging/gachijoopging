import {
  normalizeCrewName,
  normalizeInviteCode,
  normalizeNickname,
  validateCrewName,
  validateEmail,
  validateInviteCode,
  validateNickname,
  validatePassword,
} from './validators';

describe('validateEmail', () => {
  test('빈 값은 걸린다', () => {
    expect(validateEmail('')).toBe('이메일 형식이 올바르지 않아요. @와 도메인을 확인해 주세요.');
  });

  test('@ 나 도메인이 없으면 걸린다', () => {
    expect(validateEmail('kwan')).toBeDefined();
    expect(validateEmail('kwan@example')).toBeDefined();
  });

  test('앞뒤 공백은 무시하고 형식만 본다', () => {
    expect(validateEmail('  kwan@example.com  ')).toBeUndefined();
  });
});

describe('validatePassword', () => {
  test('8자 미만이면 걸린다', () => {
    expect(validatePassword('1234567')).toBe('비밀번호는 8자 이상이어야 해요.');
  });

  test('8자 이상이면 통과한다', () => {
    expect(validatePassword('12345678')).toBeUndefined();
  });

  test('원문을 트림하지 않는다 — 공백이 포함된 8자 이상도 통과', () => {
    expect(validatePassword(' 1234567')).toBeUndefined();
  });
});

describe('normalizeNickname', () => {
  test('줄바꿈을 지우고 앞뒤 공백을 없앤다', () => {
    expect(normalizeNickname('  관열\n')).toBe('관열');
  });
});

describe('validateNickname', () => {
  test('빈 값은 전용 문구', () => {
    expect(validateNickname('   ')).toBe('닉네임을 입력해 주세요.');
  });

  test('1자는 길이 오류', () => {
    expect(validateNickname('가')).toBe('닉네임은 2자에서 12자여야 해요.');
  });

  test('13자는 길이 오류', () => {
    expect(validateNickname('가나다라마바사아자차카타파')).toBe('닉네임은 2자에서 12자여야 해요.');
  });

  test('2~12자는 통과한다', () => {
    expect(validateNickname('관열')).toBeUndefined();
  });
});

describe('normalizeCrewName', () => {
  test('줄바꿈과 앞뒤 공백을 제거한다', () => {
    expect(normalizeCrewName(' 한강\n줍깅 ')).toBe('한강줍깅');
  });
});

describe('validateCrewName', () => {
  test('빈 값은 전용 문구', () => {
    expect(validateCrewName('   ')).toBe('크루 이름을 입력해 주세요.');
  });

  test('1자와 21자는 길이 오류', () => {
    expect(validateCrewName('가')).toBe('크루 이름은 2자 이상이어야 해요.');
    expect(validateCrewName('가'.repeat(21))).toBe('크루 이름은 20자까지 입력할 수 있어요.');
  });
});

describe('normalizeInviteCode', () => {
  test('앞뒤 공백만 제거하고 대소문자를 유지한다', () => {
    expect(normalizeInviteCode(' HG-7k2P ')).toBe('HG-7k2P');
  });
});

describe('validateInviteCode', () => {
  test('빈 값은 전용 문구', () => {
    expect(validateInviteCode(' ')).toBe('초대 코드를 입력해 주세요.');
  });
});
