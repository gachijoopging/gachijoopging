import { CATEGORY_LABEL, type Category } from '../category';
import { formatDistance, formatElapsed } from '../format';

export function categoryChips(byCategory: Partial<Record<Category, number>>): { label: string; count: number }[] {
  return (Object.entries(byCategory) as [Category, number][])
    .filter(([, count]) => count > 0)
    .sort(([, a], [, b]) => b - a)
    .map(([category, count]) => ({ label: CATEGORY_LABEL[category], count }));
}

export type StatsRange = 'WEEK' | 'MONTH' | 'ALL';

export const RANGE_LABEL: Record<StatsRange, string> = { WEEK: '이번 주', MONTH: '이번 달', ALL: '전체 기간' };

export const withCommas = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

export function seriesSummary(range: StatsRange, items: number): string {
  return `${RANGE_LABEL[range]}, 총 ${withCommas(items)}개`;
}

type Totals = { items: number; distanceM: number; durationSec: number; activities: number };

export function spokenDistance(distanceM: number): string {
  return formatDistance(distanceM).replace(/km$/, '킬로미터').replace(/m$/, '미터');
}

export function totalsLabel({ items, distanceM, durationSec, activities }: Totals): string {
  return `${withCommas(items)}개, ${spokenDistance(distanceM)}, ${formatElapsed(durationSec)}, 활동 ${activities}회`;
}

type Point = { date: string; items: number };

const WEEKDAYS = ['월', '화', '수', '목', '금', '토', '일'];
const MONTH_TICKS = new Set([1, 8, 15, 22, 29]);

/**
 * 막대를 기간의 달력 자리에 놓는다. 받은 날만 늘어놓으면 주 초에는 막대 두세 개가 카드 폭에
 * 흩어져 무슨 요일인지 알 수 없다. 오늘까지 기록이 없는 날은 0(바닥), 아직 오지 않은 날은 null(빈칸).
 * 날짜는 시각 없는 KST 'YYYY-MM-DD' 라 UTC 자정으로 두고 계산한다.
 */
export function chartSlots(
  range: StatsRange,
  series: readonly Point[],
  today: string,
): { values: (number | null)[]; labels: string[] } {
  if (range === 'ALL') {
    const step = Math.ceil(series.length / 6);
    return {
      values: series.map((p) => p.items),
      labels: series.map((p, i) => (i % step === 0 ? `${Number(p.date.slice(5, 7))}월` : '')),
    };
  }
  const byDate = new Map(series.map((p) => [p.date, p.items]));
  const [y, m, d] = today.split('-').map(Number);
  const todayMs = Date.UTC(y, m - 1, d);
  const startMs =
    range === 'WEEK'
      ? todayMs - ((new Date(todayMs).getUTCDay() + 6) % 7) * DAY_MS
      : Date.UTC(y, m - 1, 1);
  const count = range === 'WEEK' ? 7 : new Date(Date.UTC(y, m, 0)).getUTCDate();
  const values: (number | null)[] = [];
  const labels: string[] = [];
  for (let i = 0; i < count; i++) {
    const ms = startMs + i * DAY_MS;
    const date = new Date(ms).toISOString().slice(0, 10);
    values.push(ms > todayMs ? null : (byDate.get(date) ?? 0));
    labels.push(range === 'WEEK' ? WEEKDAYS[i] : MONTH_TICKS.has(i + 1) ? String(i + 1) : '');
  }
  return { values, labels };
}

const DAY_MS = 24 * 60 * 60 * 1000;
