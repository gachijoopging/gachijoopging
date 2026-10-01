// 화면 4-7 · docs/screens/4-7-activity-summary.md
import Constants from 'expo-constants';
import { useNetworkState } from 'expo-network';
import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, ScrollView, View, findNodeHandle, type Text } from 'react-native';
import {
  Appear,
  Banner,
  Button,
  Card,
  Chip,
  Dialog,
  Icon,
  MetricSplit,
  Screen,
  Snackbar,
  Spinner,
  Switch,
  Tile,
  Txt,
  radius,
  size,
  space,
  useTheme,
} from 'design-system/src';
import { KakaoMapView } from '../../../modules/kakao-map';
import { createMockClient, type ApiClient } from '../../../src/api/client';
import { CATEGORY_ICON, CATEGORY_LABEL } from '../../../src/category';
import { formatDistance } from '../../../src/format';
import { byCategoryChips, summaryDuration, summaryMeta, summaryMetaSpoken } from '../../../src/activity/pickup';
import { getStored, loadLastAccount, subscribe, updateStored, type Stored } from '../../../src/activity/store';
import { applyEndedActivity, syncOutbox } from '../../../src/activity/tracking';
import { ShareCard, useShareImage } from '../../../src/activity/ShareCard';

const api: ApiClient = createMockClient({ delayMs: 300 });

type Phase = 'saving' | 'saved' | 'offline' | 'error';

export default function ActivitySummaryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const navigation = useNavigation();
  const { colors } = useTheme();
  const appKey: string = Constants.expoConfig?.extra?.kakaoNativeAppKey ?? '';
  const network = useNetworkState();
  const offline = network.isConnected === false || network.isInternetReachable === false;
  const [stored, setStored] = useState<Stored>(() => loadLastAccount() ?? getStored());
  const [failed, setFailed] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [includeRoute, setIncludeRoute] = useState(false);
  const [mapFailed, setMapFailed] = useState(!appKey);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [snackbar, setSnackbar] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const share = useShareImage();
  const titleRef = useRef<Text>(null);

  useEffect(() => subscribe(setStored), []);
  useEffect(() => {
    if (stored.ended === true && stored.session?.activityId === id) {
      void api.get('GET /activities/{id}', { id }).then(({ data }) => applyEndedActivity(id, data)).catch(() => setSnackbar('기록을 불러오지 못했어요. 연결 후 다시 열어 주세요.'));
    }
  }, [id, stored.ended, stored.session?.activityId]);

  // 열리는 순간 제목부터 읽힌다 — 4-3 에서 넘어왔다는 것을 알린다
  useEffect(() => {
    const node = findNodeHandle(titleRef.current);
    if (node) AccessibilityInfo.setAccessibilityFocus(node);
  }, []);

  const session = stored.session?.activityId === id ? stored.session : null;
  const snapshot = session && typeof stored.ended === 'object' ? stored.ended : null;
  // 종료 요청이 큐에서 빠졌으면 서버가 받았다
  const pending = stored.outbox.some((op) => op.kind === 'end' && op.activityId === id);
  const phase: Phase = !pending ? 'saved' : offline ? 'offline' : failed && !syncing ? 'error' : 'saving';

  const sync = useCallback(async () => {
    setSyncing(true);
    const ok = await syncOutbox();
    setFailed(!ok);
    setSyncing(false);
  }, []);

  useEffect(() => {
    if (!offline) void sync();
  }, [offline, sync]);

  const leave = () => {
    // 서버에 다 닿았을 때만 기기 기록을 비운다 — 아니면 다음 연결 때 큐가 다시 보낸다
    updateStored((st) => (st.outbox.length === 0 && st.session?.activityId === id ? { session: null, ended: null, outbox: [] } : st));
    router.replace('/(tabs)');
  };

  useEffect(
    () =>
      navigation.addListener('beforeRemove', (e) => {
        if (e.data.action.type !== 'GO_BACK' && e.data.action.type !== 'POP') return;
        e.preventDefault();
        leave();
      }),
    // leave 는 id 만 본다
    [navigation, id],
  );

  const remove = async () => {
    setDeleting(true);
    try {
      await api.mutate('DELETE /activities/{id}', { id });
      setConfirmDelete(false);
      leave();
    } catch {
      setDeleting(false);
      setSnackbar('기록을 지우지 못했어요. 다시 시도해 주세요.');
    }
  };

  if (!session || !snapshot) {
    return (
      <Screen>
        <Txt variant="title" accessibilityRole="header" accessibilityLabel="오늘의 줍깅 정리">오늘의 줍깅 정리 🌱</Txt>
        <Banner tone="warn" action={{ label: '닫기', onPress: leave }}>이 활동의 기록을 기기에서 찾지 못했어요.</Banner>
      </Screen>
    );
  }

  const chips = byCategoryChips(session.byCategory);
  const route = session.segments.flat();
  const meta = summaryMeta({ startedAt: session.startedAt, endedAt: snapshot.endedAt, pausedSec: snapshot.pausedSec, steps: snapshot.steps });
  const distance = formatDistance(snapshot.distanceM);
  const duration = summaryDuration(snapshot.durationSec);
  const openShare = async () => {
    if (sharing) return;
    setSharing(true);
    try {
      const imageUri = await share.capture();
      router.push({ pathname: '/posts/new', params: { imageUri } });
    } catch {
      setSnackbar('공유 이미지를 만들지 못했어요. 다시 시도해 주세요.');
    } finally {
      setSharing(false);
    }
  };

  const title = { saving: '기록을 저장하고 있어요…', saved: '기록을 저장했어요. 피드에 공유할까요?', offline: '기록을 기기에 저장했어요', error: '기록을 저장하지 못했어요' }[phase];

  return (
    <Screen>
      <Txt ref={titleRef} variant="title" accessibilityRole="header" accessibilityLabel="오늘의 줍깅 정리">오늘의 줍깅 정리 🌱</Txt>
      <ScrollView contentContainerStyle={{ gap: space.md, paddingBottom: space.xl }}>
        <Txt
          variant="caption"
          bold
          accessibilityLabel={summaryMetaSpoken({ startedAt: session.startedAt, endedAt: snapshot.endedAt, pausedSec: snapshot.pausedSec, steps: snapshot.steps })}
        >
          {meta}
        </Txt>

        {route.length === 0 ? (
          // 경로가 없으면 큰 빈 지도 틀 대신 한 줄로 알린다
          <Tile tone="surface" style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: size.minTouch }}>
            <Icon name="map-marker-off" size={size.iconCard} color={colors.inkMuted} />
            <Txt variant="caption" tone="muted">경로가 기록되지 않았어요</Txt>
          </Tile>
        ) : (
          <View
            style={{ height: size.mapFrame, borderRadius: radius.card, overflow: 'hidden', backgroundColor: colors.neutral }}
            accessible
            accessibilityLabel={`이동 경로 지도, ${distance.replace('km', '킬로미터').replace(/m$/, '미터')}`}
            pointerEvents="none"
          >
            {mapFailed ? (
              <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                <Txt variant="caption" tone="muted">지도를 불러오지 못했어요</Txt>
              </View>
            ) : (
              <KakaoMapView appKey={appKey} center={route[Math.floor(route.length / 2)]} segments={session.segments} onMapError={() => setMapFailed(true)} style={{ flex: 1 }} />
            )}
            <View style={{ position: 'absolute', top: space.md, left: space.md }}>
              <Chip tone="neutral" icon="map-marker-outline" label="이동 경로" />
            </View>
          </View>
        )}

        <Card>
          <MetricSplit
            divider="dashed"
            items={[
              { value: String(session.itemCount), label: '줍기 개수', spoken: `줍기 개수 ${session.itemCount}개` },
              { value: duration, label: '활동 시간', spoken: `활동 시간 ${duration}` },
              { value: distance, label: '이동 거리', spoken: `이동 거리 ${distance}` },
            ]}
          />
        </Card>

        {session.itemCount > 0 ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
            {chips.map(({ category, count }) => (
              <Chip
                key={category}
                tone="neutral"
                icon={CATEGORY_ICON[category]}
                label={`${CATEGORY_LABEL[category]} ${count}`}
                accessibilityLabel={`${CATEGORY_LABEL[category]} ${count}개`}
              />
            ))}
          </View>
        ) : (
          <Banner tone="info">줍기 기록 없이 활동만 저장돼요. 활동 시간과 이동 거리도 소중한 기록이에요.</Banner>
        )}

        <Appear visible={phase === 'offline'} rise={0}>
          <View accessibilityLiveRegion="polite" style={{ alignSelf: 'flex-start' }}>
            <Chip tone="warn" icon="wifi-off" label="동기화 대기 중 · 연결되면 자동 업로드돼요" />
          </View>
        </Appear>

        <Card style={{ gap: space.md }}>
          {/* 저장 상태가 바뀌면 문구가 제자리에서 흐려졌다 바뀐다 */}
          <Appear visible rise={0} replayKey={phase}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }} accessibilityLiveRegion="polite">
              {phase === 'saving' ? <Spinner /> : null}
              {phase === 'saved' ? <Icon name="check" size={size.iconCard} color={colors.greenStrong} /> : null}
              <Txt variant="section" bold tone={phase === 'error' ? 'error' : 'ink'} style={{ flex: 1 }}>{title}</Txt>
            </View>
          </Appear>
          {phase === 'error' ? (
            <Txt variant="caption" bold>다시 시도하면 지금 보이는 기록을 그대로 올려요.</Txt>
          ) : phase !== 'saved' ? (
            <Txt variant="caption" bold>동기화가 끝나야 피드에 공유할 수 있어요.</Txt>
          ) : null}

          <Tile tone="tint">
            <Switch label="공유 이미지에 경로 포함" value={includeRoute} onValueChange={setIncludeRoute} />
          </Tile>

          <View style={{ flexDirection: 'row', gap: space.sm }}>
            <View style={{ flex: 1 }}>
              <Button label="공유 안 함" accessibilityLabel="공유 안 함, 닫기" variant="ghost" size="md" fullWidth onPress={leave} />
            </View>
            <View style={{ flex: 1 }}>
              {phase === 'error' ? (
                <Button label="다시 시도" size="md" fullWidth onPress={sync} />
              ) : (
                <Button
                  label="공유하기"
                  accessibilityLabel="공유하기, 게시물 작성으로 이동"
                  accessibilityHint={phase === 'saved' ? undefined : '기록 저장이 끝나면 쓸 수 있어요'}
                  size="md"
                  fullWidth
                  loading={sharing}
                  disabled={phase !== 'saved' || sharing}
                  onPress={openShare}
                />
              )}
            </View>
          </View>

          <Appear visible={phase === 'saved'} rise={0}>
            <Button label="이 기록 지우기" variant="ghostDanger" size="md" fullWidth onPress={() => setConfirmDelete(true)} />
          </Appear>
        </Card>
      </ScrollView>

      <ShareCard
        cardRef={share.ref}
        includeRoute={includeRoute}
        data={{
          startedAt: session.startedAt,
          endedAt: snapshot.endedAt,
          durationSec: snapshot.durationSec,
          pausedSec: snapshot.pausedSec,
          distanceM: snapshot.distanceM,
          steps: snapshot.steps,
          itemCount: session.itemCount,
          segments: session.segments,
        }}
      />

      <Dialog
        visible={confirmDelete}
        onClose={() => !deleting && setConfirmDelete(false)}
        title="이 기록을 지울까요?"
        actions={
          <>
            <Button label="기록 남기기" variant="ghost" size="md" disabled={deleting} onPress={() => setConfirmDelete(false)} />
            <Button label="지우기" variant="danger" size="md" loading={deleting} disabled={deleting} onPress={remove} />
          </>
        }
      >
        <Txt variant="body">지운 기록은 되돌릴 수 없어요. 크루 합산에서도 빠져요.</Txt>
      </Dialog>

      <Snackbar visible={snackbar != null} message={snackbar ?? ''} onDismiss={() => setSnackbar(null)} />
    </Screen>
  );
}
