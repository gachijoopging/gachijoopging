import { crewChanged, crewFormErrors, crewPatch } from './crew-edit';

const original = { name: '한강줍깅크루', intro: '매주 토요일 아침 여의도', goalCount: 300 };
/** photoMediaId — undefined: 사진 그대로 · null: 삭제 · 문자열: 새로 올린 사진 */
const form = (overrides: Partial<typeof original> & { photoMediaId?: string | null } = {}) => ({
  ...original,
  ...overrides,
});

describe('크루 정보 입력 검증', () => {
  test('이름은 앞뒤 공백·줄바꿈을 지운 뒤 2~20자다', () => {
    expect(crewFormErrors(form({ name: ' 한 \n' })).name).toBe('크루 이름은 2~20자로 입력해 주세요.');
    expect(crewFormErrors(form({ name: '가'.repeat(21) })).name).toBe('크루 이름은 2~20자로 입력해 주세요.');
    expect(crewFormErrors(form({ name: '  한강 \n' })).name).toBeUndefined();
  });

  test('소개는 앞뒤 공백을 지운 뒤 200자까지다', () => {
    expect(crewFormErrors(form({ intro: '가'.repeat(201) })).intro).toBe('소개는 200자까지 입력할 수 있어요.');
    expect(crewFormErrors(form({ intro: ` ${'가'.repeat(200)} ` })).intro).toBeUndefined();
    expect(crewFormErrors(form({ intro: '' })).intro).toBeUndefined();
  });

  test('목표는 1개 이상이다', () => {
    expect(crewFormErrors(form({ goalCount: 0 })).goalCount).toBe('목표는 1개 이상이어야 해요.');
    expect(crewFormErrors(form({ goalCount: 1 })).goalCount).toBeUndefined();
  });
});

describe('크루 정보 저장 요청', () => {
  test('바뀐 것이 없으면 저장하지 않는다', () => {
    expect(crewPatch(original, form())).toBeNull();
    expect(crewPatch(original, form({ name: ' 한강줍깅크루 ' }))).toBeNull();
  });

  test('이름을 바꾸지 않으면 name 을 보내지 않고 바뀐 필드만 보낸다', () => {
    expect(crewPatch(original, form({ goalCount: 350 }))).toEqual({ goalCount: 350 });
  });

  test('이름·소개는 정리한 값으로 보낸다', () => {
    expect(crewPatch(original, form({ name: ' 여의도크루\n', intro: ' 일요일 ' }))).toEqual({
      name: '여의도크루',
      intro: '일요일',
    });
  });

  test('사진을 지우면 photoMediaId 를 null 로 보낸다', () => {
    expect(crewPatch(original, form({ photoMediaId: null }))).toEqual({
      photoMediaId: null,
    });
  });

  test('새 사진은 업로드한 mediaId 로 보낸다', () => {
    expect(crewPatch(original, form({ photoMediaId: 'm002' }))).toEqual({ photoMediaId: 'm002' });
  });

  test('입력이 유효하지 않으면 저장하지 않는다', () => {
    expect(crewPatch(original, form({ name: '한', goalCount: 350 }))).toBeNull();
  });
});

describe('버리기 확인이 필요한 변경', () => {
  test('앞뒤 공백만 바꿨으면 바뀐 것이 아니다', () => {
    expect(crewChanged(original, form({ name: ' 한강줍깅크루\n', intro: '매주 토요일 아침 여의도 ' }))).toBe(false);
  });

  test('유효하지 않은 값으로 바꿔도 바뀐 것이다 — 떠나면 사라지므로 묻는다', () => {
    expect(crewChanged(original, form({ name: '한' }))).toBe(true);
  });

  test('사진을 지우거나 새로 올렸으면 바뀐 것이다', () => {
    expect(crewChanged(original, form({ photoMediaId: null }))).toBe(true);
    expect(crewChanged(original, form({ photoMediaId: 'm002' }))).toBe(true);
  });
});
