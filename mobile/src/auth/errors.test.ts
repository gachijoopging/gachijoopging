import { ApiError } from '../api/client';
import { loginErrorMessage, mapNicknameError, mapResetConfirmError, mapSignupError, resetRequestErrorMessage } from './errors';

describe('loginErrorMessage', () => {
  test('INVALID_CREDENTIALS 는 계정 없음과 비밀번호 오류를 가르지 않는다', () => {
    expect(loginErrorMessage(new ApiError('INVALID_CREDENTIALS'))).toBe('이메일 또는 비밀번호가 올바르지 않아요.');
  });

  test('RATE_LIMITED 는 전용 문구', () => {
    expect(loginErrorMessage(new ApiError('RATE_LIMITED'))).toBe('시도가 너무 많아요. 잠시 후 다시 시도해 주세요.');
  });

  test('그 외는 일반 실패 문구', () => {
    expect(loginErrorMessage(new ApiError('INTERNAL'))).toBe('로그인에 실패했어요. 잠시 후 다시 시도해 주세요.');
    expect(loginErrorMessage(new Error('network'))).toBe('로그인에 실패했어요. 잠시 후 다시 시도해 주세요.');
  });
});

describe('mapSignupError', () => {
  test('EMAIL_TAKEN 은 이메일 필드로', () => {
    expect(mapSignupError(new ApiError('EMAIL_TAKEN'))).toEqual({ email: '이미 가입된 이메일이에요. 로그인해 주세요.' });
  });

  test('NICKNAME_TAKEN 은 닉네임 필드로', () => {
    expect(mapSignupError(new ApiError('NICKNAME_TAKEN'))).toEqual({
      nickname: '이미 사용 중인 닉네임이에요. 다른 이름을 입력해 주세요.',
    });
  });

  test('VALIDATION 은 fields 로 식별된 필드에만 오류를 붙인다', () => {
    expect(mapSignupError(new ApiError('VALIDATION', [{ field: 'nickname', code: 'TOO_SHORT' }]))).toEqual({
      nickname: '닉네임은 2자에서 12자여야 해요.',
    });
  });

  test('대상 필드를 모르는 422 는 배너로만', () => {
    expect(mapSignupError(new ApiError('VALIDATION', [{ field: 'unknown', code: 'FORMAT' }]))).toEqual({
      banner: '가입하지 못했어요. 다시 시도해 주세요.',
    });
  });

  test('그 외 실패는 배너', () => {
    expect(mapSignupError(new Error('network'))).toEqual({ banner: '가입하지 못했어요. 다시 시도해 주세요.' });
  });
});

describe('mapNicknameError', () => {
  test('NICKNAME_TAKEN 은 필드 오류로', () => {
    expect(mapNicknameError(new ApiError('NICKNAME_TAKEN'))).toEqual({
      field: '이미 사용 중인 닉네임이에요. 다른 이름을 입력해 주세요.',
    });
  });

  test('그 외는 배너', () => {
    expect(mapNicknameError(new Error('network'))).toEqual({ banner: '저장하지 못했어요. 다시 시도해 주세요.' });
  });
});

describe('resetRequestErrorMessage', () => {
  test('항상 같은 문구', () => {
    expect(resetRequestErrorMessage()).toBe('메일 발송에 실패했어요. 잠시 후 다시 시도해 주세요.');
  });
});

describe('mapResetConfirmError', () => {
  test('code 필드가 식별되면 코드 오류로', () => {
    expect(mapResetConfirmError(new ApiError('VALIDATION', [{ field: 'code', code: 'EXPIRED' }]))).toEqual({
      code: '코드가 만료되었거나 올바르지 않아요. 재설정 메일을 다시 요청해 주세요.',
    });
  });

  test('식별 불가능한 422 는 배너', () => {
    expect(mapResetConfirmError(new ApiError('VALIDATION', [{ field: 'unknown', code: 'FORMAT' }]))).toEqual({
      banner: '문제가 발생했어요. 입력을 확인하고 다시 시도해 주세요.',
    });
  });

  test('그 외 실패도 배너', () => {
    expect(mapResetConfirmError(new Error('network'))).toEqual({
      banner: '문제가 발생했어요. 입력을 확인하고 다시 시도해 주세요.',
    });
  });
});
