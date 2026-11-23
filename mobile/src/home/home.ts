import { CATEGORY_LABEL, type Category } from '../category';

type CharacterProgress = { windowDays: number; items: number; goalCount: number };

export function characterBubble({ windowDays, items, goalCount }: CharacterProgress): string {
  const left = goalCount - items;
  return `최근 ${windowDays}일 ${items}개, ${left > 0 ? `목표까지 ${left}개` : '목표 달성!'}`;
}

export function myCategorySummary(counts: Partial<Record<Category, number>>): string {
  const top = (Object.entries(counts) as [Category, number][])
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3);
  if (top.length === 0) return '아직 없어요';
  return top.map(([category, n]) => `${CATEGORY_LABEL[category]} ${n}`).join(' · ');
}
