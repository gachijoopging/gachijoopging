import type { ImageSourcePropType } from 'react-native';

/** 홈 크루 캐릭터 5단계. 인덱스 = stage - 1 (축 처짐 · 보통 · 신남 · 반짝 · 파티) */
export const characterStages: readonly ImageSourcePropType[] = [
  require('../assets/character/stage-1-droopy.png'),
  require('../assets/character/stage-2-normal.png'),
  require('../assets/character/stage-3-excited.png'),
  require('../assets/character/stage-4-sparkle.png'),
  require('../assets/character/stage-5-party.png'),
];

/** 빈 상태 그림. 활동 없음(4-1·5-5) · 게시물 없음(5-1·5-2·5-5) · 알림 없음(2-3) */
export const characterEmpty = {
  activity: require('../assets/character/empty-activity.png') as ImageSourcePropType,
  post: require('../assets/character/empty-post.png') as ImageSourcePropType,
  notification: require('../assets/character/empty-notification.png') as ImageSourcePropType,
};
