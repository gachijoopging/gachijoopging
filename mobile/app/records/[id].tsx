// 화면 5-3 · docs/screens/5-3-activity-record-detail.md
import Constants from 'expo-constants';
import { File, Paths } from 'expo-file-system';
import { useNetworkState } from 'expo-network';
import { router, useFocusEffect, useLocalSearchParams, useNavigation } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';
import {
  AppHeader,
  Banner,
  BottomSheet,
  Button,
  Card,
  Chip,
  Dialog,
  EmptyState,
  ErrorState,
  IconButton,
  Loading,
  MetricSplit,
  NumberStepper,
  Screen,
  Snackbar,
  Switch,
  Tile,
  Txt,
  radius,
  size,
  space,
} from 'design-system/src';
import { KakaoMapView } from '../../modules/kakao-map';
import { ApiError, createMockClient, type ApiClient } from '../../src/api/client';
import { CATEGORY_LABEL, type Category } from '../../src/category';
import {
  categoryChips,
  changedItems,
  formatDuration,
  kstDateTime,
  metricsLabel,
  routeToPath,
  QUANTITY_MAX,
  type EditableItem,
} from '../../src/feed/activity-detail';
import { PhotoPager } from '../../src/feed/PhotoPager';
import { formatDistance } from '../../src/format';
import { useFlash } from '../../src/ui/useFlash';
import { ShareCard, useShareImage } from '../../src/activity/ShareCard';
import { currentAccount, rememberAccount } from '../../src/auth/account';

/** docs/openapi.yaml 의 Activity. 목 example 은 리터럴이라 그대로 쓰면 타입이 좁다 */
type Item = EditableItem & { photoId: string | null; source: 'AI' | 'MANUAL' };
type Detail = {
  id: string;
  user: { id: string; nickname: string };
  status: 'IN_PROGRESS' | 'ENDED';
  startedAt: string;
  endedAt: string;
  pausedSec: number;
  durationSec: number;
  distanceM: number;
  steps: number | null;
  locationShared: boolean;
  itemCount: number;
  byCategory: Partial<Record<string, number>>;
  route: readonly (readonly number[])[] | null;
  photos: readonly { id: string; url: string; thumbUrl: string }[];
  items: readonly Item[];
};

const api: ApiClient = createMockClient({ delayMs: 300 });
const CATEGORIES = Object.keys(CATEGORY_LABEL) as Category[];

export default function ActivityDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const navigation = useNavigation();
  const [activity, setActivity] = useState<Detail | null>(null);
  const [me, setMe] = useState<{ id: string; hasCrew: boolean } | null>(null);
  const [failed, setFailed] = useState(false);
  const [gone, setGone] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [includeRoute, setIncludeRoute] = useState(false);
  const [mapFailed, setMapFailed] = useState(false);
  const [sharing, setSharing] = useState(false);
  const shareImage = useShareImage();
  const [snackbar, setSnackbar] = useFlash();
  const appKey = Constants.expoConfig?.extra?.kakaoNativeAppKey ?? '';
  const network = useNetworkState();
  const offline = network.isConnected === false || network.isInternetReachable === false;
  const [editingBusy, setEditingBusy] = useState(false);
  const deleteFinished = useRef(false);
  useEffect(() => navigation.addListener('beforeRemove', (event) => {
    if (editingBusy || (deleting && !deleteFinished.current)) event.preventDefault();
  }), [navigation, editingBusy, deleting]);

  const load = useCallback(async () => {
    try {
      const account = offline ? currentAccount() : rememberAccount((await api.get('GET /users/me')).data);
      setMe(account);
      if (!account) { setActivity(null); setFailed(true); return; }
      const cache = new File(Paths.document, `activity-detail-${account.id}-${id}.json`);
      if (offline) {
        if (cache.exists) {
          const cached = JSON.parse(cache.textSync());
          if (cached.id === id) setActivity(cached);
        }
        setFailed(true);
        return;
      }
      const { data } = await api.get('GET /activities/{id}', { id });
      setActivity(data as unknown as Detail);
      setFailed(false);
      try { cache.write(JSON.stringify(data)); } catch {}
    } catch (e) {
      const code = e instanceof ApiError ? e.code : null;
      if (code === 'NOT_FOUND' || code === 'FORBIDDEN') setGone(true);
      else setFailed(true);
    }
  }, [id, offline]);

  // 재진입·수정 완료 때마다 합계를 다시 받는다 (당겨서 새로고침은 없다)
  useFocusEffect(useCallback(() => void load(), [load]));

  const own = !!activity && !!me && activity.user.id === me.id;
  const ended = activity?.status === 'ENDED';

  const deleteActivity = async () => {
    if (offline) return;
    deleteFinished.current = false;
    setDeleting(true);
    try {
      await api.mutate('DELETE /activities/{id}', { id });
      if (me) {
        const cache = new File(Paths.document, `activity-detail-${me.id}-${id}.json`);
        if (cache.exists) cache.delete();
      }
      setConfirmDelete(false);
      deleteFinished.current = true;
      navigation.goBack();
    } catch {
      setSnackbar('삭제하지 못했어요. 다시 시도해 주세요.');
    } finally {
      setDeleting(false);
    }
  };

  const share = async () => {
    if (!activity || offline || sharing) return;
    setSharing(true);
    try {
      const imageUri = await shareImage.capture();
      router.push({ pathname: '/posts/new', params: { imageUri } });
    } catch { setSnackbar('공유 이미지를 만들지 못했어요. 다시 시도해 주세요.'); }
    finally { setSharing(false); }
  };

  const path = activity && (own || activity.locationShared) ? routeToPath(activity.route) : [];

  return (
    <Screen>
      <AppHeader
        title="활동 기록 상세"
        backDisabled={editingBusy || deleting}
        onBack={() => router.back()}
        action={own && ended ? <IconButton icon="dots-horizontal" label="활동 기록 관리" disabled={offline} onPress={() => setMenuOpen(true)} /> : undefined}
      />

      {gone ? (
        <EmptyState
          icon="map-marker-off-outline"
          title="삭제되었거나 볼 수 없는 기록이에요"
          actionLabel="돌아가기"
          onAction={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))}
        />
      ) : !activity ? (
        failed ? (
          <ErrorState title="활동 기록을 불러오지 못했어요" onRetry={load} />
        ) : (
          <Loading label="활동 기록을 불러오고 있어요" />
        )
      ) : (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ gap: space.lg, paddingBottom: space['3xl'] }}>
          {failed ? <Banner tone="warn">인터넷 연결을 확인해 주세요.</Banner> : null}
          {offline ? <Banner tone="warn">수정·삭제·공유하려면 인터넷에 연결해 주세요.</Banner> : null}

          <View style={{ gap: space.sm }}>
            <Txt variant="body">{kstDateTime(activity.startedAt)}</Txt>
            <View
              accessible
              accessibilityLabel={path.length >= 2 ? '활동 경로 지도' : '경로 없음'}
              style={{ height: size.mapFrame, borderRadius: radius.card, overflow: 'hidden' }}
            >
              {path.length >= 2 && appKey && !mapFailed ? (
                <KakaoMapView appKey={appKey} center={path[0]} segments={[path]} onMapError={() => setMapFailed(true)} style={{ flex: 1 }} />
              ) : (
                <Tile style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                  <Txt variant="caption" tone="muted">{path.length >= 2 ? '지도를 불러오지 못했어요' : '경로 없음'}</Txt>
                </Tile>
              )}
            </View>
          </View>

          <Card>
            <MetricSplit
              divider="dashed"
              accessibilityLabel={metricsLabel(activity)}
              items={[
                { value: `${activity.itemCount}개`, label: '줍기' },
                { value: formatDuration(activity.durationSec), label: '활동 시간' },
                { value: formatDistance(activity.distanceM), label: '이동 거리' },
                // 미측정(null)은 0걸음과 다르다 — 칸 자체를 뺀다
                ...(activity.steps != null ? [{ value: activity.steps.toLocaleString('ko-KR'), label: '걸음' }] : []),
              ]}
            />
          </Card>

          <View style={{ gap: space.sm }}>
            <Txt variant="section" bold accessibilityRole="header">줍기 항목</Txt>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
              {categoryChips(activity.byCategory).map((c) => (
                <Chip key={c} label={c} tone="neutral" />
              ))}
            </View>
            {own && ended ? (
              <Button label="줍기 목록 수정" variant="ghost" icon="pencil-outline" disabled={offline} onPress={() => setEditOpen(true)} style={{ alignSelf: 'flex-start' }} />
            ) : null}
          </View>

          <View style={{ gap: space.sm }}>
            <Txt variant="section" bold accessibilityRole="header">활동 사진 모음</Txt>
            {activity.photos.length > 0 ? (
              <PhotoPager photos={activity.photos} label={(i, n) => `전체 ${n}장 중 ${i + 1}번째 사진`} />
            ) : (
              <Txt variant="body" tone="muted">이 기록에는 활동 사진이 없어요.</Txt>
            )}
          </View>

          {!activity.locationShared ? (
            <Banner tone="neutral">경로를 크루원에게 공유하지 않은 활동이에요</Banner>
          ) : null}

          {own && ended && me?.hasCrew ? <>
            <Switch label="공유 이미지에 경로 포함" value={includeRoute} onValueChange={setIncludeRoute} disabled={offline || sharing} />
            <Button label="피드에 공유하기" fullWidth disabled={offline || sharing} loading={sharing} onPress={share} />
          </> : null}
        </ScrollView>
      )}

      <BottomSheet visible={menuOpen} onClose={() => setMenuOpen(false)} title="활동 기록 관리">
        <Button
          label="삭제하기"
          variant="danger"
          fullWidth
          onPress={() => {
            setMenuOpen(false);
            setConfirmDelete(true);
          }}
        />
      </BottomSheet>

      <Dialog
        visible={confirmDelete}
        onClose={() => !deleting && setConfirmDelete(false)}
        title="활동 기록을 삭제할까요?"
        actions={
          <>
            <Button label="기록 남기기" variant="ghost" size="md" disabled={deleting} onPress={() => setConfirmDelete(false)} />
            <Button label="삭제" variant="danger" size="md" loading={deleting} disabled={deleting} onPress={deleteActivity} />
          </>
        }
      >
        <Txt variant="body">줍기·시간·거리와 활동 사진이 삭제돼요. 이미 게시한 이미지는 남아요.</Txt>
      </Dialog>

      {activity && own && ended ? (
        <ShareCard
          cardRef={shareImage.ref}
          includeRoute={includeRoute}
          data={{
            startedAt: activity.startedAt,
            endedAt: activity.endedAt ?? activity.startedAt,
            durationSec: activity.durationSec,
            pausedSec: activity.pausedSec,
            distanceM: activity.distanceM,
            steps: activity.steps,
            itemCount: activity.itemCount,
            segments: path.length >= 2 ? [path] : [],
          }}
        />
      ) : null}

      {activity ? (
        <ItemsSheet
          visible={editOpen}
          activityId={activity.id}
          items={activity.items}
          onClose={() => setEditOpen(false)}
          offline={offline}
          onChanged={() => void load()}
          onBusy={setEditingBusy}
          onSaved={() => {
            setEditOpen(false);
            void load();
          }}
        />
      ) : null}

      <Snackbar visible={snackbar != null} message={snackbar ?? ''} onDismiss={() => setSnackbar(null)} />
    </Screen>
  );
}

function ItemsSheet({
  visible,
  activityId,
  items,
  onClose,
  onSaved,
  onChanged,
  offline,
  onBusy,
}: {
  visible: boolean;
  activityId: string;
  items: readonly Item[];
  onClose: () => void;
  onSaved: () => void;
  onChanged: () => void;
  offline: boolean;
  onBusy: (busy: boolean) => void;
}) {
  const [saved, setSaved] = useState<EditableItem[]>([]);
  const [edited, setEdited] = useState<EditableItem[]>([]);
  const [busy, setBusyState] = useState(false);
  const setBusy = (value: boolean) => { setBusyState(value); onBusy(value); };
  const [error, setError] = useState<string | null>(null);
  const [removeTarget, setRemoveTarget] = useState<string | null>(null);
  const [invalid, setInvalid] = useState<ReadonlySet<string>>(new Set());
  const initialized = useRef<string | null>(null);

  useEffect(() => {
    if (initialized.current === activityId) return;
    initialized.current = activityId;
    const base = items.map(({ id, category, quantity }) => ({ id, category, quantity }));
    setSaved(base);
    setEdited(base);
    setError(null);
    setInvalid(new Set());
  }, [activityId, items]);

  const patch = (id: string, change: Partial<EditableItem>) =>
    setEdited((list) => list.map((it) => (it.id === id ? { ...it, ...change } : it)));

  const save = async () => {
    if (offline || invalid.size > 0 || busy) return;
    setBusy(true);
    setError(null);
    // 순서대로 보내고, 성공한 항목은 기준에 반영해 재시도 때 다시 보내지 않는다
    for (const item of changedItems(saved, edited)) {
      try {
        await api.mutate('PATCH /activities/{id}/items/{itemId}', { id: activityId, itemId: item.id, category: item.category, quantity: item.quantity });
        setSaved((list) => list.map((s) => (s.id === item.id ? item : s)));
      } catch {
        setError('일부 항목을 저장하지 못했어요. 다시 시도해 주세요.');
        onChanged();
        setBusy(false);
        return;
      }
    }
    setBusy(false);
    onSaved();
  };

  const remove = async (itemId: string) => {
    if (offline || busy) return;
    setBusy(true);
    setError(null);
    try {
      await api.mutate('DELETE /activities/{id}/items/{itemId}', { id: activityId, itemId });
      setSaved((l) => l.filter((i) => i.id !== itemId));
      setEdited((l) => l.filter((i) => i.id !== itemId));
      setRemoveTarget(null);
      setInvalid((current) => { const next = new Set(current); next.delete(itemId); return next; });
      onChanged();
    } catch {
      setError('항목을 삭제하지 못했어요. 다시 시도해 주세요.');
    } finally {
      setBusy(false);
    }
  };

  const source = (id: string) => items.find((i) => i.id === id)?.source === 'AI' ? 'AI' : '직접';

  return (
    <BottomSheet visible={visible} onClose={onClose} title="줍기 항목 수정" dismissible={!busy}>
      <View style={{ gap: space.lg }}>
        {error ? (
          <View accessibilityLiveRegion="polite">
            <Banner tone="danger">{error}</Banner>
          </View>
        ) : null}
        {edited.length === 0 ? (
          <EmptyState title="아직 담긴 항목이 없어요" />
        ) : (
          edited.map((it, n) => (
            <View key={it.id} style={{ gap: space.sm }}>
              <Txt variant="caption" tone="muted">{`항목 ${n + 1} · ${source(it.id)}`}</Txt>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }} accessibilityRole="radiogroup">
                {CATEGORIES.map((c) => (
                  <Chip
                    key={c}
                    label={CATEGORY_LABEL[c]}
                    selected={it.category === c}
                    accessibilityRole="radio"
                    disabled={busy || offline}
                    accessibilityLabel={`항목 ${n + 1} 카테고리, ${CATEGORY_LABEL[c]}`}
                    onPress={() => patch(it.id, { category: c })}
                  />
                ))}
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
                <View style={{ flex: 1 }}>
                  <NumberStepper
                    label={`항목 ${n + 1} 수량`}
                    value={it.quantity}
                    min={1}
                    max={QUANTITY_MAX}
                    disabled={busy || offline}
                    onValidityChange={(valid) => setInvalid((current) => {
                      if (valid === !current.has(it.id)) return current;
                      const next = new Set(current);
                      if (valid) next.delete(it.id); else next.add(it.id);
                      return next;
                    })}
                    onChange={(quantity) => patch(it.id, { quantity })}
                  />
                </View>
                <Button label="삭제" variant="danger" size="sm" disabled={busy || offline} accessibilityLabel={`항목 ${n + 1} 삭제`} onPress={() => setRemoveTarget(it.id)} />
              </View>
            </View>
          ))
        )}
      </View>
      <View style={{ flexDirection: 'row', gap: space.sm }}>
        <Button label="닫기" variant="ghost" disabled={busy} onPress={onClose} style={{ flex: 1 }} />
        <Button label={error ? '다시 시도' : '저장'} loading={busy} disabled={busy || offline || invalid.size > 0 || changedItems(saved, edited).length === 0} onPress={save} style={{ flex: 1 }} />
      </View>

      <Dialog
        visible={removeTarget != null}
        onClose={() => !busy && setRemoveTarget(null)}
        title="이 항목을 삭제할까요?"
        actions={
          <>
            <Button label="항목 남기기" variant="ghost" size="md" disabled={busy} onPress={() => setRemoveTarget(null)} />
            <Button label="삭제" variant="danger" size="md" loading={busy} disabled={busy || offline} onPress={() => removeTarget && remove(removeTarget)} />
          </>
        }
      >
        <Txt variant="body">이 활동의 줍기 개수에서 빠져요.</Txt>
      </Dialog>
    </BottomSheet>
  );
}
