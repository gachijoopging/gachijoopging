import { router } from 'expo-router';
import { EmptyState, Screen } from 'design-system/src';

/** 지운 화면으로 가는 옛 링크·알림이 남을 수 있어 영어 404 대신 이것을 보인다 */
export default function NotFoundScreen() {
  return (
    <Screen>
      <EmptyState
        icon="map-marker-question-outline"
        title="없는 화면이에요"
        actionLabel="돌아가기"
        onAction={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))}
      />
    </Screen>
  );
}
