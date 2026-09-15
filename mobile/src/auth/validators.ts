/**
 * 로그인·회원가입·닉네임 화면이 공유하는 순수 검증 함수. 화면 문서(1-2·1-3·1-4)의
 * 검증 규칙을 그대로 옮긴다 — 비밀번호는 어떤 경우에도 값을 바꾸지 않는다.
 */

export function validateEmail(value: string): string | undefined {
  const trimmed = value.trim();
  const ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
  return ok ? undefined : '이메일 형식이 올바르지 않아요. @와 도메인을 확인해 주세요.';
}

export function validatePassword(value: string): string | undefined {
  return value.length >= 8 ? undefined : '비밀번호는 8자 이상이어야 해요.';
}

/** 닉네임 저장 전 정규화. 줄바꿈 제거·앞뒤 공백 제거만 하고 그 외 문자 제한은 없다 */
export function normalizeNickname(value: string): string {
  return value.replace(/\r?\n/g, '').trim();
}

export function validateNickname(value: string): string | undefined {
  const normalized = normalizeNickname(value);
  if (normalized.length === 0) return '닉네임을 입력해 주세요.';
  if (normalized.length < 2 || normalized.length > 12) return '닉네임은 2자에서 12자여야 해요.';
  return undefined;
}

export function normalizeCrewName(value: string): string {
  return value.replace(/\r?\n/g, '').trim();
}

export function validateCrewName(value: string): string | undefined {
  const normalized = normalizeCrewName(value);
  if (normalized.length === 0) return '크루 이름을 입력해 주세요.';
  if (normalized.length < 2) return '크루 이름은 2자 이상이어야 해요.';
  if (normalized.length > 20) return '크루 이름은 20자까지 입력할 수 있어요.';
  return undefined;
}

export function normalizeInviteCode(value: string): string {
  return value.trim();
}

export function validateInviteCode(value: string): string | undefined {
  return normalizeInviteCode(value) ? undefined : '초대 코드를 입력해 주세요.';
}
