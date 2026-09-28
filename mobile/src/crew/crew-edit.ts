export const CREW_NAME_MIN = 2;
export const CREW_NAME_MAX = 20;
export const CREW_INTRO_MAX = 200;

type CrewFields = { name: string; intro: string; goalCount: number };
/** photoMediaId — undefined: 사진 그대로 · null: 삭제 · 문자열: 새로 올린 사진 */
export type CrewForm = CrewFields & { photoMediaId?: string | null };
export type CrewPatch = Partial<CrewFields & { photoMediaId: string | null }>;

const cleanName = (name: string) => name.replace(/\n/g, '').trim();

export function crewFormErrors(form: CrewForm): Partial<Record<keyof CrewFields, string>> {
  const errors: Partial<Record<keyof CrewFields, string>> = {};
  const name = cleanName(form.name);
  if (name.length < CREW_NAME_MIN || name.length > CREW_NAME_MAX) errors.name = '크루 이름은 2~20자로 입력해 주세요.';
  if (form.intro.trim().length > CREW_INTRO_MAX) errors.intro = '소개는 200자까지 입력할 수 있어요.';
  if (!(form.goalCount >= 1)) errors.goalCount = '목표는 1개 이상이어야 해요.';
  return errors;
}

/** 저장할 것이 없거나 입력이 유효하지 않으면 null — 저장 버튼을 끈다 */
export function crewPatch(original: CrewFields, form: CrewForm): CrewPatch | null {
  if (Object.keys(crewFormErrors(form)).length > 0) return null;
  const patch: CrewPatch = {};
  const name = cleanName(form.name);
  const intro = form.intro.trim();
  if (name !== original.name) patch.name = name;
  if (intro !== original.intro) patch.intro = intro;
  if (form.goalCount !== original.goalCount) patch.goalCount = form.goalCount;
  if (form.photoMediaId !== undefined) patch.photoMediaId = form.photoMediaId;
  return Object.keys(patch).length > 0 ? patch : null;
}
