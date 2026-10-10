import { ApiError } from '../api/client';

/** 1-2 로그인. INVALID_CREDENTIALS 는 계정 없음/비밀번호 오류를 가르지 않는다 */
export function loginErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === 'INVALID_CREDENTIALS') return '이메일 또는 비밀번호가 올바르지 않아요.';
    if (error.code === 'RATE_LIMITED') return '시도가 너무 많아요. 잠시 후 다시 시도해 주세요.';
  }
  return '로그인에 실패했어요. 잠시 후 다시 시도해 주세요.';
}

export type SignupFieldErrors = { email?: string; nickname?: string; banner?: string };

/** 1-3 회원가입. 대상 필드를 모르는 422 는 닉네임 오류로 단정하지 않고 배너로 표시한다 */
export function mapSignupError(error: unknown): SignupFieldErrors {
  if (error instanceof ApiError) {
    if (error.code === 'EMAIL_TAKEN') return { email: '이미 가입된 이메일이에요. 로그인해 주세요.' };
    if (error.code === 'NICKNAME_TAKEN') {
      return { nickname: '이미 사용 중인 닉네임이에요. 다른 이름을 입력해 주세요.' };
    }
    if (error.code === 'VALIDATION') {
      const errors: SignupFieldErrors = {};
      for (const field of error.fields ?? []) {
        if (field.field === 'email') errors.email = '이메일 형식이 올바르지 않아요. @와 도메인을 확인해 주세요.';
        if (field.field === 'nickname') errors.nickname = '닉네임은 2자에서 12자여야 해요.';
      }
      if (Object.keys(errors).length > 0) return errors;
    }
  }
  return { banner: '가입하지 못했어요. 다시 시도해 주세요.' };
}

export type NicknameFieldError = { field?: string; banner?: string };

/** 1-4 닉네임 저장(PATCH /users/me) */
export function mapNicknameError(error: unknown): NicknameFieldError {
  if (error instanceof ApiError && error.code === 'NICKNAME_TAKEN') {
    return { field: '이미 사용 중인 닉네임이에요. 다른 이름을 입력해 주세요.' };
  }
  return { banner: '저장하지 못했어요. 다시 시도해 주세요.' };
}

/** 소속·대기 상태가 화면이 알던 것과 달라 다른 화면으로 보내야 하는 오류 */
export type MembershipMoved = { flash: string; to: '/(tabs)' | '/pending-approval' };

function membershipMoved(error: ApiError, pendingFlash: string): MembershipMoved | undefined {
  if (error.code === 'ALREADY_IN_CREW') return { flash: '이미 크루에 소속돼 있어요.', to: '/(tabs)' };
  if (error.code === 'JOIN_REQUEST_PENDING') return { flash: pendingFlash, to: '/pending-approval' };
  return undefined;
}

export type CrewCreateError = { field?: string; banner?: string; moved?: MembershipMoved };

/** 1-7 크루 만들기 */
export function mapCrewCreateError(error: unknown): CrewCreateError {
  if (error instanceof ApiError) {
    const moved = membershipMoved(error, '승인 대기 중인 가입 요청이 있어요. 요청을 취소한 뒤 만들 수 있어요.');
    if (moved) return { moved };
    if (error.code === 'CREW_NAME_TAKEN') return { field: '이미 사용 중인 크루 이름이에요.' };
    if (error.code === 'VALIDATION') return { field: '크루 이름을 다시 확인해 주세요.' };
  }
  return { banner: '크루를 만들지 못했어요. 네트워크 상태를 확인하고 다시 시도해 주세요.' };
}

export type JoinError = { banner?: string; blocked?: boolean; gone?: boolean; refresh?: boolean; moved?: MembershipMoved };

/** 1-8 가입 확인 시트. blocked 면 가입 버튼을 끈다 */
export function mapJoinError(error: unknown): JoinError {
  if (error instanceof ApiError) {
    const moved = membershipMoved(error, '승인 대기 중인 가입 요청이 있어요.');
    if (moved) return { moved };
    if (error.code === 'CREW_FULL') return { banner: '정원(50명)이 차서 가입할 수 없어요. 자리가 생기면 다시 신청할 수 있어요.', blocked: true, refresh: true };
    if (error.code === 'EXPELLED_FROM_CREW') return { banner: '이 크루에서 내보내져 다시 가입할 수 없어요.', blocked: true };
    if (error.code === 'NOT_FOUND') return { gone: true, refresh: true };
  }
  return { banner: '가입하지 못했어요. 네트워크 상태를 확인하고 다시 시도해 주세요.' };
}

/** 1-5 A 재설정 메일 발송 — 서버는 항상 204 라 실패는 네트워크·서버 오류뿐이다 */
export function resetRequestErrorMessage(): string {
  return '메일 발송에 실패했어요. 잠시 후 다시 시도해 주세요.';
}

export type ResetConfirmError = { code?: string; banner?: string };

/** 1-5 B 코드로 새 비밀번호 설정 */
export function mapResetConfirmError(error: unknown): ResetConfirmError {
  if (error instanceof ApiError && error.code === 'VALIDATION') {
    const hasCodeField = error.fields?.some((f) => f.field === 'code');
    if (hasCodeField) {
      return { code: '코드가 만료되었거나 올바르지 않아요. 재설정 메일을 다시 요청해 주세요.' };
    }
  }
  return { banner: '문제가 발생했어요. 입력을 확인하고 다시 시도해 주세요.' };
}
