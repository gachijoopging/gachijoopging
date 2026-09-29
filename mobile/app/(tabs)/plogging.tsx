import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Image, RefreshControl, View } from 'react-native';
import { Banner, Button, Card, Chip, ErrorState, Loading, MetricSplit, Screen, Txt, size, space } from 'design-system/src';
import { createMockClient, type Activity, type ApiClient } from '../../src/api/client';
import { usePloggingLauncher } from '../../src/plogging/PloggingLauncher';
import { readyView } from '../../src/plogging/ready';
import { activityMetrics, activitySummaryLabel } from '../../src/plogging/start';

const api: ApiClient = createMockClient({ delayMs: 300 });

// ponytail: 대기 그림이 정해지기 전까지 홈과 같은 새싹 한 장
const sprout = require('../../../design-system/assets/character/sprout.png');

/** 4-1. 줍깅 버튼을 처음 누른 사람에게만 보이는 온보딩이다. 그 뒤로 줍깅 버튼은 이 화면을 거치지 않는다. */
export default function PloggingScreen() {
  const [last, setLast] = useState<Activity | null | undefined>(undefined);
  const [failed, setFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const plogging = usePloggingLauncher();

  const load = useCallback(async (pull = false) => {
    if (pull) setRefreshing(true);
    try {
      const res = await api.get('GET /activities/current');
      setLast(res.data);
      setFailed(false);
    } catch {
      setFailed(true);
    } finally {
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    plogging.markOnboarded();
    void load();
  }, [load, plogging]));

  const view = readyView({ last, failed });
  const now = Date.now();
  const resume = (id: string) => router.push({ pathname: '/4-3-activity-in-progress', params: { id } });

  return (
    <Screen scroll refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />}>
      <Txt variant="display">줍깅</Txt>
      {'stale' in view && view.stale ? <Banner tone="warn">인터넷 연결을 확인해 주세요.</Banner> : null}

      {view.kind === 'loading' ? <Loading label="활동을 확인하고 있어요" /> : null}
      {view.kind === 'error' ? <ErrorState title="활동 상태를 불러오지 못했어요" onRetry={() => load()} /> : null}

      {view.kind === 'idle' ? (
        <>
          <View accessible accessibilityLabel="줍깅 대기, 지금 주운 것을 기록해 보세요" style={{ alignItems: 'center', gap: space.sm }}>
            <Image source={sprout} resizeMode="contain" style={{ width: size.character, height: size.character }} />
            <Txt variant="section" bold>지금 주운 것을 기록해 보세요.</Txt>
          </View>
          <Button label="줍깅 시작" size="lg" fullWidth onPress={plogging.start} />
        </>
      ) : null}

      {view.kind === 'active' ? (
        <>
          <Txt variant="section" bold>활동을 이어갈까요?</Txt>
          <Card style={{ gap: space.md }}>
            <MetricSplit
              items={activityMetrics(view.activity, now)}
              divider="dashed"
              accessibilityLabel={activitySummaryLabel(view.activity, now)}
            />
            <View style={{ flexDirection: 'row', gap: space.sm }} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
              {view.activity.paused ? <Chip label="일시정지 중" icon="pause" tone="neutral" /> : null}
              <Chip label={view.activity.locationShared ? '위치 공유 중' : '위치 공유 끔'} icon="map-marker-outline" />
            </View>
          </Card>
          <Button label="활동 이어가기" size="lg" fullWidth onPress={() => resume(view.activity.id)} />
        </>
      ) : null}
    </Screen>
  );
}
