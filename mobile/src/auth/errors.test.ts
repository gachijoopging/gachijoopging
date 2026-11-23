import { ApiError } from '../api/client';
import {
  loginErrorMessage,
  mapCrewCreateError,
  mapJoinError,
  mapNicknameError,
  mapResetConfirmError,
  mapSignupError,
  resetRequestErrorMessage,
} from './errors';

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

describe('mapCrewCreateError', () => {
  test('ALREADY_IN_CREW 는 안내 뒤 홈으로', () => {
    expect(mapCrewCreateError(new ApiError('ALREADY_IN_CREW'))).toEqual({ moved: { flash: '이미 크루에 소속돼 있어요.', to: '/(tabs)' } });
  });

  test('JOIN_REQUEST_PENDING 은 안내 뒤 승인 대기로', () => {
    expect(mapCrewCreateError(new ApiError('JOIN_REQUEST_PENDING'))).toEqual({
      moved: { flash: '승인 대기 중인 가입 요청이 있어요. 요청을 취소한 뒤 만들 수 있어요.', to: '/pending-approval' },
    });
  });

  test('CREW_NAME_TAKEN 은 이름 필드 아래 중복 안내로', () => {
    expect(mapCrewCreateError(new ApiError('CREW_NAME_TAKEN'))).toEqual({ field: '이미 사용 중인 크루 이름이에요.' });
  });

  test('VALIDATION 은 이름 필드 오류로', () => {
    expect(mapCrewCreateError(new ApiError('VALIDATION'))).toEqual({
      field: '크루 이름을 다시 확인해 주세요.',
    });
  });

  test('그 외 실패는 일반 배너로', () => {
    expect(mapCrewCreateError(new Error('network'))).toEqual({
      banner: '크루를 만들지 못했어요. 네트워크 상태를 확인하고 다시 시도해 주세요.',
    });
  });
});

describe('mapJoinError', () => {
  test('정원이 차면 시트 안에 알리고 버튼을 끈 뒤 결과를 다시 부른다', () => {
    expect(mapJoinError(new ApiError('CREW_FULL'))).toEqual({
      banner: '정원(50명)이 차서 가입할 수 없어요. 자리가 생기면 다시 신청할 수 있어요.',
      blocked: true,
      refresh: true,
    });
  });

  test('추방된 크루는 다시 가입할 수 없다', () => {
    expect(mapJoinError(new ApiError('EXPELLED_FROM_CREW'))).toEqual({ banner: '이 크루에서 내보내져 다시 가입할 수 없어요.', blocked: true });
  });

  test('사라진 크루는 시트를 닫고 결과를 다시 부른다', () => {
    expect(mapJoinError(new ApiError('NOT_FOUND'))).toEqual({ gone: true, refresh: true });
  });

  test('다른 기기에서 신청했으면 승인 대기로', () => {
    expect(mapJoinError(new ApiError('JOIN_REQUEST_PENDING'))).toEqual({ moved: { flash: '승인 대기 중인 가입 요청이 있어요.', to: '/pending-approval' } });
  });

  test('그 외 실패는 시트 안 배너로, 버튼은 남긴다', () => {
    expect(mapJoinError(new Error('network'))).toEqual({ banner: '가입하지 못했어요. 네트워크 상태를 확인하고 다시 시도해 주세요.' });
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
