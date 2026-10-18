import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Image, RefreshControl, View } from 'react-native';
import { Banner, Button, Card, Chip, ErrorState, Loading, MetricSplit, Screen, Snackbar, Txt, characterEmpty, size, space } from 'design-system/src';
import { getStored, loadLastAccount, subscribe, type Stored } from '../../src/activity/store';
import { syncOutbox } from '../../src/activity/tracking';
import { type Activity, type ApiClient } from '../../src/api/client';
import { createApiClient } from '../../src/api/config';
import { usePloggingLauncher } from '../../src/plogging/PloggingLauncher';
import { readyView } from '../../src/plogging/ready';
import { activityMetrics, activitySummaryLabel } from '../../src/plogging/start';
import { useFlash } from '../../src/ui/useFlash';

const api: ApiClient = createApiClient({ delayMs: 300 });


/** 4-1. 줍깅 버튼은 이 화면을 거치지 않고 시트를 띄운다. 설정·빈 기록의 "줍깅 시작" 링크가 닿는 자리다 */
export default function PloggingScreen() {
  const [last, setLast] = useState<Activity | null | undefined>(undefined);
  const [failed, setFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const plogging = usePloggingLauncher();
  const [snackbar, setSnackbar] = useFlash();
  const [stored, setStored] = useState<Stored>(() => loadLastAccount() ?? getStored());
  useEffect(() => subscribe(setStored), []);
  const pendingEndId = stored.ended && stored.session ? stored.session.activityId : null;

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

  useFocusEffect(useCallback(() => void load(), [load]));

  const view = readyView({ last, failed, pendingEndId });
  const now = Date.now();
  const resume = (id: string) => router.push({ pathname: '/activity/[id]', params: { id } });

  return (
    <Screen scroll edges={['top', 'left', 'right']} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />}>
      <Txt variant="display">줍깅</Txt>
      {'stale' in view && view.stale ? <Banner tone="warn">인터넷 연결을 확인해 주세요.</Banner> : null}

      {view.kind === 'loading' ? <Loading label="활동을 확인하고 있어요" /> : null}
      {view.kind === 'error' ? <ErrorState title="활동 상태를 불러오지 못했어요" onRetry={() => load()} /> : null}

      {view.kind === 'idle' ? (
        <>
          <View accessible accessibilityLabel="줍깅 대기, 지금 주운 것을 기록해 보세요" style={{ alignItems: 'center', gap: space.sm }}>
            <Image source={characterEmpty.activity} resizeMode="contain" style={{ width: size.character, height: size.character }} />
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

      {view.kind === 'syncing' ? (
        <>
          <Banner tone="warn">이전 기록 동기화 대기 중이에요. 저장이 끝나야 새 활동을 시작할 수 있어요.</Banner>
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            <View style={{ flex: 1 }}>
              <Button label="요약 보기" variant="ghost" fullWidth onPress={() => router.push({ pathname: '/activity/[id]/summary', params: { id: view.id } })} />
            </View>
            <View style={{ flex: 1 }}>
              <Button label="다시 시도" fullWidth onPress={() => void syncOutbox()} />
            </View>
          </View>
        </>
      ) : null}

      <Snackbar visible={snackbar != null} message={snackbar ?? ''} onDismiss={() => setSnackbar(null)} />
    </Screen>
  );
}
