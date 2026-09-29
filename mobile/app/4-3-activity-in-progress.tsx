import { router, useLocalSearchParams } from 'expo-router';
import { AppHeader, Screen, Snackbar, Txt } from 'design-system/src';
import { useFlash } from '../src/ui/useFlash';

// ponytail: 4-1 에서 들어오는 자리만 잡아 둔다. 지도·추적·위치 필터는 4-3 구현이 이 파일을 채운다
export default function ActivityInProgressScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [flash, setFlash] = useFlash();
  return (
    <Screen>
      <AppHeader title="활동 중" onBack={() => router.back()} />
      <Txt variant="body">활동 {id}</Txt>
      <Snackbar visible={!!flash} message={flash ?? ''} onDismiss={() => setFlash(null)} />
    </Screen>
  );
}
