import { ApiError } from '../api/client';
import { normalizeNickname, validateNickname } from '../auth/validators';

export type SafetyRow = 'report' | 'block' | 'unblock' | 'kick' | 'delegate';

/** 크루장은 신고를 처리하는 쪽이라 신고를 낼 수 없다 (권한표 "게시물·사용자 신고") */
export function safetyRows({ viewerIsLeader, blocked }: { viewerIsLeader: boolean; blocked: boolean }): SafetyRow[] {
  const block: SafetyRow = blocked ? 'unblock' : 'block';
  return viewerIsLeader ? [block, 'kick', 'delegate'] : ['report', block];
}

export type DayCell = { date: string; active: boolean } | null;

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEKS = 26;

/** 최근 26주 일요일 시작 격자. 날짜는 시각 없는 KST 'YYYY-MM-DD' 라 UTC 자정으로 두고 계산한다 */
export function activeDaysGrid(activeDays: readonly string[], today: string): DayCell[][] {
  const active = new Set(activeDays);
  const todayMs = Date.parse(`${today}T00:00:00Z`);
  const start = todayMs - (new Date(todayMs).getUTCDay() + (WEEKS - 1) * 7) * DAY_MS;
  return Array.from({ length: WEEKS }, (_, w) =>
    Array.from({ length: 7 }, (_, d) => {
      const ms = start + (w * 7 + d) * DAY_MS;
      if (ms > todayMs) return null;
      const date = new Date(ms).toISOString().slice(0, 10);
      return { date, active: active.has(date) };
    }),
  );
}

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const WEEKDAY = ['일', '월', '화', '수', '목', '금', '토'];

export function activityTitle(iso: string, now: Date = new Date()): string {
  const t = new Date(Date.parse(iso) + KST_OFFSET_MS);
  const year = new Date(now.getTime() + KST_OFFSET_MS).getUTCFullYear();
  const h = t.getUTCHours();
  const date = `${t.getUTCMonth() + 1}월 ${t.getUTCDate()}일(${WEEKDAY[t.getUTCDay()]})`;
  const time = `${h < 12 ? '오전' : '오후'} ${h % 12 || 12}:${String(t.getUTCMinutes()).padStart(2, '0')}`;
  return `${t.getUTCFullYear() === year ? '' : `${t.getUTCFullYear()}년 `}${date} ${time}`;
}

export const POST_TEXT_MAX = 1000;
export const POST_PHOTO_MAX = 10;

export function canPost({ text, photoCount }: { text: string; photoCount: number }): boolean {
  if (photoCount > POST_PHOTO_MAX || text.length > POST_TEXT_MAX) return false;
  return text.trim().length > 0 || photoCount > 0;
}

export function movePhoto<T>(list: readonly T[], index: number, delta: -1 | 1): readonly T[] {
  const to = index + delta;
  if (to < 0 || to >= list.length) return list;
  const next = [...list];
  [next[index], next[to]] = [next[to], next[index]];
  return next;
}

type Upload = { mediaId: string | null };

/** 게시를 다시 눌러도 이미 올라간 사진은 건너뛴다 */
export function photosToUpload<T extends Upload>(photos: readonly T[]): T[] {
  return photos.filter((p) => p.mediaId == null);
}

/** 한 장이라도 아직 못 올렸으면 null — 게시 요청을 보내지 않는다 */
export function readyMediaIds<T extends Upload>(photos: readonly T[]): string[] | null {
  return photos.every((p) => p.mediaId != null) ? photos.map((p) => p.mediaId as string) : null;
}

export const NICKNAME_MAX = 12;
export const INTRO_MAX = 200;

type ProfileFields = { nickname: string; intro: string };
/** photoMediaId — undefined: 사진 그대로 · null: 삭제 · 문자열: 새로 올린 사진 */
export type ProfileForm = ProfileFields & { photoMediaId?: string | null };
export type ProfilePatch = Partial<ProfileFields & { photoMediaId: string | null }>;

export function profileChanges(original: ProfileFields, form: ProfileForm): ProfilePatch {
  const patch: ProfilePatch = {};
  const nickname = normalizeNickname(form.nickname);
  const intro = form.intro.trim();
  if (nickname !== original.nickname) patch.nickname = nickname;
  if (intro !== original.intro) patch.intro = intro;
  if (form.photoMediaId !== undefined) patch.photoMediaId = form.photoMediaId;
  return patch;
}

/** 저장할 것이 없거나 닉네임이 유효하지 않으면 null — 저장 버튼을 끈다 */
export function profilePatch(original: ProfileFields, form: ProfileForm): ProfilePatch | null {
  if (validateNickname(form.nickname) || form.intro.trim().length > INTRO_MAX) return null;
  const patch = profileChanges(original, form);
  return Object.keys(patch).length > 0 ? patch : null;
}

/** 진행 중이거나 기기에 남은 미동기화 기록이 있으면 나가기·탈퇴·로그아웃을 막아 기록을 지킨다 */
export function accountGate({ hasCurrentActivity, unsyncedCount }: { hasCurrentActivity: boolean; unsyncedCount: number }): 'blocked' | 'confirm' {
  return hasCurrentActivity || unsyncedCount > 0 ? 'blocked' : 'confirm';
}

export function leaveConfirm({ isLeader, memberCount }: { isLeader: boolean; memberCount: number }): 'dissolve' | 'leave' {
  return isLeader && memberCount <= 1 ? 'dissolve' : 'leave';
}

export function leaveFailure(error: unknown): 'delegate' | 'blocked' | 'retry' {
  if (error instanceof ApiError && error.code === 'LEADER_MUST_DELEGATE') return 'delegate';
  if (error instanceof ApiError && error.code === 'CONFLICT') return 'blocked';
  return 'retry';
}
