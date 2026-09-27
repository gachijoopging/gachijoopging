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

export function totalsLabel({ items, distanceM, durationSec, activities }: Totals): string {
  const distance = formatDistance(distanceM).replace(/km$/, '킬로미터').replace(/m$/, '미터');
  return `${withCommas(items)}개, ${distance}, ${formatElapsed(durationSec)}, 활동 ${activities}회`;
}
