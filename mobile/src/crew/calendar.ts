/** `GET /crew/calendar` 의 days 한 항목 */
export type CalendarDay = {
  date: string;
  items: number;
  activityCount: number;
  activities: readonly unknown[];
};

export type CalendarCell = { date: string; inMonth: boolean; items: number; activityCount: number };

const DAY_MS = 24 * 60 * 60 * 1000;
const isoDate = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** 달력 날짜는 시각이 없는 KST 날짜라 UTC 자정으로 두고 계산한다 */
function monthStart(month: string): Date {
  return new Date(`${month}-01T00:00:00Z`);
}

export function monthGrid(month: string, days: readonly CalendarDay[]): CalendarCell[] {
  const first = monthStart(month);
  const start = first.getTime() - first.getUTCDay() * DAY_MS;
  const byDate = new Map(days.map((d) => [d.date, d]));
  return Array.from({ length: 42 }, (_, i) => {
    const date = isoDate(start + i * DAY_MS);
    const day = byDate.get(date);
    return {
      date,
      inMonth: date.startsWith(month),
      items: day?.items ?? 0,
      activityCount: day?.activityCount ?? 0,
    };
  });
}

export type HeatLevel = 0 | 1 | 2 | 3;

/** 계약에 구간이 없어 같은 달 최대 줍기 수 대비 상대 농도로 정했다 (3-9 미결) */
export function heatLevel(items: number, maxItems: number, activityCount = items > 0 ? 1 : 0): HeatLevel {
  if (activityCount === 0) return 0;
  if (maxItems <= 0) return 1;
  return Math.max(1, Math.min(3, Math.ceil((items / maxItems) * 3))) as HeatLevel;
}

export const HEAT_OPACITY: Record<HeatLevel, number> = { 0: 0, 1: 0.3, 2: 0.6, 3: 1 };

/** 다크에서 라임은 서피스보다 훨씬 밝다. 진한 칸(2·3) 위의 밝은 ink·deep 은 1~2:1 로 사라져 어두운 onLime 으로 뒤집는다 */
export function cellMark(heat: HeatLevel, selected: boolean): 'onDark' | 'onLime' | 'ink' {
  return selected ? 'onDark' : heat >= 2 ? 'onLime' : 'ink';
}

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

export function kstToday(now: Date = new Date()): string {
  return isoDate(now.getTime() + KST_OFFSET_MS);
}

/** 계약의 날짜(from·to 등)는 KST 기준이다. UTC 시각을 그 날짜로 바꾼다 */
export function kstDate(iso: string): string {
  return isoDate(new Date(iso).getTime() + KST_OFFSET_MS);
}

export function shiftMonth(month: string, delta: number): string {
  const d = monthStart(month);
  d.setUTCMonth(d.getUTCMonth() + delta);
  return isoDate(d.getTime()).slice(0, 7);
}

export function canGoNextMonth(month: string, today: string): boolean {
  return month < today.slice(0, 7);
}

export function isFutureDate(date: string, today: string): boolean {
  return date > today;
}

export function initialDate(month: string, days: readonly CalendarDay[], today: string): string {
  const todayMs = Date.parse(today);
  const active = days.filter((d) => d.activityCount > 0).map((d) => d.date).sort();
  let best: string | null = null;
  for (const date of active) {
    // 같은 거리면 앞서 정렬된 이른 날짜를 남긴다
    if (best === null || Math.abs(Date.parse(date) - todayMs) < Math.abs(Date.parse(best) - todayMs)) best = date;
  }
  if (best) return best;
  return today.startsWith(month) ? today : `${month}-01`;
}

type DayCount = { date: string; items: number; activityCount: number };

function dateLabel(date: string): string {
  const [, m, d] = date.split('-').map(Number);
  return `${m}월 ${d}일`;
}

export function daySummary({ date, items, activityCount }: DayCount): string {
  return `${dateLabel(date)} · 활동 ${activityCount}건 · ${items}개`;
}

export function cellLabel({ date, items, activityCount }: DayCount, today: string): string {
  const parts = [dateLabel(date)];
  parts.push(activityCount > 0 ? `활동 ${activityCount}건, ${items}개` : '활동 없음');
  if (isFutureDate(date, today)) parts.push('선택할 수 없음');
  return parts.join(', ');
}
