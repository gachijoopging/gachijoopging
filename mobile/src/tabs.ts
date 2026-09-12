/** 탭 5개. 가운데(줍깅)가 BottomNav 의 시작 버튼 자리다 — 순서를 바꾸면 버튼도 바뀐다. */
export const TABS = [
  { value: 'index', label: '홈', icon: 'home-outline' },
  { value: 'feed', label: '피드', icon: 'image-multiple-outline' },
  { value: 'plogging', label: '줍깅', icon: 'delete-outline' },
  { value: 'crew', label: '모이깅', icon: 'account-group-outline' },
  { value: 'profile', label: '내 정보', icon: 'account-outline' },
] as const;

export type TabValue = (typeof TABS)[number]['value'];

/** expo-router 의 라우트 이름을 탭 값으로 읽는다. 모르는 이름은 홈으로 떨어뜨린다. */
export function tabValueOf(routeName: string): TabValue {
  const hit = TABS.find((t) => t.value === routeName);
  return hit ? hit.value : 'index';
}
