import { router } from 'expo-router';
import { EmptyState, Screen } from 'design-system/src';

/** 아직 만들지 않은 화면(3-2·5-2 등)으로 가는 링크가 먼저 생기므로 영어 404 대신 이것을 보인다 */
export default function NotFoundScreen() {
  return (
    <Screen>
      <EmptyState
        icon="hammer-wrench"
        title="준비 중인 화면이에요"
        description="곧 열어 드릴게요."
        actionLabel="돌아가기"
        onAction={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))}
      />
    </Screen>
  );
}
