import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, RefreshControl, View } from 'react-native';
import {
  AppHeader,
  Avatar,
  Badge,
  Banner,
  BottomSheet,
  Button,
  Chip,
  Dialog,
  ErrorState,
  IconButton,
  LinkText,
  ListRow,
  Loading,
  Screen,
  Snackbar,
  Tabs,
  Txt,
  pressedOpacity,
  radius,
  space,
  useRipple,
} from 'design-system/src';
import { ApiError, type ApiClient } from '../api/client';
import { createApiClient } from '../api/config';
import { leaveForMembership } from '../feed/leave';
import { useFlash } from '../ui/useFlash';
import { INTRO_FOLD } from './profile';
import { StatsTile, usePaged, type ActivityCard, type Post, type Stats } from './ProfileParts';
import { ProfileTabList } from './ProfileTabList';

type Me = { id: string; nickname: string; intro: string; photoUrl: string | null; crew: { name: string; isLeader: boolean } | null };
type Tab = 'records' | 'posts';

const api: ApiClient = createApiClient({ delayMs: 300 });
const TABS: { value: Tab; label: string }[] = [
  { value: 'records', label: '기록' },
  { value: 'posts', label: '게시물' },
];

/**
 * 5-5 내 정보. recordsOnly 는 크루 소속이 없을 때 1-6 에서 들어오는 "내 활동 기록" —
 * 누적과 기록만 남기고 크루에 딸린 요소(프로필 수정·설정·크루 알약·게시물 탭)를 숨긴다.
 */
export function MyProfile({ recordsOnly = false }: { recordsOnly?: boolean }) {
  const [me, setMe] = useState<Me | null>(null);
  const [meFailed, setMeFailed] = useState(false);
  const [stats, setStats] = useState<Stats | null>(null);
  const [statsFailed, setStatsFailed] = useState(false);
  const [tab, setTab] = useState<Tab>('records');
  const [refreshing, setRefreshing] = useState(false);
  const [introOpen, setIntroOpen] = useState(false);
  const [menuFor, setMenuFor] = useState<ActivityCard | null>(null);
  const [deleting, setDeleting] = useState<ActivityCard | null>(null);
  const [busy, setBusy] = useState(false);
  const [snackbar, setSnackbar] = useFlash();
  const ripple = useRipple();

  const records = usePaged<ActivityCard>(async (cursor) => (await api.get('GET /users/me/activities', { cursor })).data);
  const posts = usePaged<Post>(async (cursor) => {
    try {
      return (await api.get('GET /crew/members/{userId}/posts', { userId: me?.id, cursor })).data;
    } catch (e) {
      if (e instanceof ApiError && e.code === 'NO_CREW') void leaveForMembership();
      throw e;
    }
  }, me?.id);

  const loadMe = useCallback(async () => {
    try {
      const { data } = await api.get('GET /users/me');
      setMe({ id: data.id, nickname: data.nickname, intro: data.intro, photoUrl: data.photoUrl, crew: data.membership.crew });
      setMeFailed(false);
      return true;
    } catch {
      setMeFailed(true);
      return false;
    }
  }, []);

  const loadStats = useCallback(async () => {
    try {
      const { data } = await api.get('GET /users/me/stats');
      setStats(data);
      setStatsFailed(false);
      return true;
    } catch {
      setStatsFailed(true);
      return false;
    }
  }, []);

  const tabRef = useRef(tab);
  tabRef.current = tab;
  const reloadRecords = records.reload;
  const reloadPosts = posts.reload;
  const reloadAll = useCallback(
    () =>
      Promise.all([
        recordsOnly ? true : loadMe(),
        loadStats(),
        tabRef.current === 'records' ? reloadRecords() : reloadPosts(),
      ]),
    [recordsOnly, loadMe, loadStats, reloadRecords, reloadPosts],
  );

  // 프로필을 고치거나 기록을 지우고 돌아오는 길이라 돌아올 때마다 조용히 다시 받는다
  useFocusEffect(useCallback(() => void reloadAll(), [reloadAll]));

  const postsAsked = useRef<string | null>(null);
  const meId = me?.id;
  useEffect(() => {
    if (tab === 'posts' && meId && postsAsked.current !== meId) {
      postsAsked.current = meId;
      void reloadPosts();
    }
  }, [tab, meId, reloadPosts]);

  const pull = async () => {
    setRefreshing(true);
    const results = await reloadAll();
    setRefreshing(false);
    if (results.includes(false)) setSnackbar('새로고침에 실패했어요');
  };

  const deleteRecord = async () => {
    if (!deleting || busy) return;
    setBusy(true);
    try {
      await api.mutate('DELETE /activities/{id}', { id: deleting.id });
      records.remove(deleting.id);
      void loadStats();
      setSnackbar('기록을 삭제했어요');
    } catch {
      setSnackbar('삭제에 실패했어요');
    } finally {
      setBusy(false);
      setDeleting(null);
    }
  };

  const offline = (meFailed && !!me) || (records.failed && !!records.items);

  // 탭 화면은 하단 안전 영역을 탭 바가 맡는다
  return (
    <Screen edges={recordsOnly ? undefined : ['top', 'left', 'right']}>
      {recordsOnly ? (
        <AppHeader title="내 활동 기록" onBack={() => (router.canGoBack() ? router.back() : router.replace('/crew-choice'))} />
      ) : (
        <AppHeader
          title="내 정보"
          action={<IconButton icon="cog-outline" label="설정" onPress={() => router.push('/settings')} />}
        />
      )}
      {offline ? <Banner tone="warn">인터넷 연결을 확인해 주세요.</Banner> : null}

      <ProfileTabList
        tab={tab}
        header={
          <>
            {recordsOnly ? null : !me ? (
              meFailed ? (
                <ErrorState title="프로필을 불러오지 못했어요" onRetry={loadMe} />
              ) : (
                <Loading label="프로필을 불러오고 있어요" />
              )
            ) : (
              <View style={{ gap: space.sm }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="프로필 사진, 프로필 수정으로 이동"
                    android_ripple={ripple}
                    onPress={() => router.push('/settings/profile')}
                    style={({ pressed }) => ({ borderRadius: radius.pill, overflow: 'hidden', opacity: pressedOpacity(pressed) })}
                  >
                    <Avatar name={me.nickname} uri={me.photoUrl ?? undefined} size="lg" decorative />
                  </Pressable>
                  <View style={{ flex: 1, gap: space.xs }}>
                    <View
                      accessible
                      accessibilityLabel={me.crew?.isLeader ? `${me.nickname}, 크루장` : me.nickname}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}
                    >
                      <Txt variant="title" bold numberOfLines={1} style={{ flexShrink: 1 }}>{me.nickname}</Txt>
                      {me.crew?.isLeader ? <Badge label="크루장" tone="deep" /> : null}
                    </View>
                    <Txt variant="caption" tone={me.intro ? 'ink' : 'hint'} numberOfLines={introOpen ? undefined : 2}>
                      {me.intro || '소개를 적어 보세요'}
                    </Txt>
                    {me.intro.length > INTRO_FOLD ? (
                      <LinkText label={introOpen ? '접기' : '더 보기'} tone="muted" onPress={() => setIntroOpen((o) => !o)} style={{ alignSelf: 'flex-start' }} />
                    ) : null}
                  </View>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm }}>
                  {me.crew ? (
                    <Chip
                      label={me.crew.name}
                      icon="chevron-right"
                      iconEnd
                      accessibilityLabel={`${me.crew.name}, 크루 정보 보기`}
                      onPress={() => router.push('/crew/members')}
                    />
                  ) : <View />}
                  <Button label="프로필 수정" size="sm" onPress={() => router.push('/settings/profile')} />
                </View>
              </View>
            )}

            <StatsTile stats={stats} />
            {statsFailed && !stats ? (
              <LinkText label="누적 수치를 불러오지 못했어요 다시 시도" tone="muted" onPress={loadStats} />
            ) : null}

            {recordsOnly ? null : <Tabs items={TABS} value={tab} onChange={setTab} fullWidth />}
          </>
        }
        records={records}
        posts={posts}
        onOpenRecord={(id) => router.push({ pathname: '/records/[id]', params: { id } })}
        onMenu={setMenuFor}
        onOpenPost={(id) => router.push({ pathname: '/posts/[id]', params: { id } })}
        recordsEmpty={{ description: '첫 줍깅을 시작하면 줍기, 시간, 거리가 여기에 쌓여요.', onStart: recordsOnly ? undefined : () => router.push('/(tabs)/plogging') }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={pull} />}
      />

      <BottomSheet visible={menuFor != null} onClose={() => setMenuFor(null)} title="활동 기록">
        <ListRow
          icon="delete-outline"
          title="삭제하기"
          tone="danger"
          chevron={false}
          onPress={() => {
            setDeleting(menuFor);
            setMenuFor(null);
          }}
        />
      </BottomSheet>

      <Dialog
        visible={deleting != null}
        onClose={() => !busy && setDeleting(null)}
        title="활동 기록을 삭제할까요?"
        actions={
          <>
            <Button label="기록 남기기" variant="ghost" size="md" disabled={busy} onPress={() => setDeleting(null)} />
            <Button label="삭제" variant="danger" size="md" loading={busy} onPress={deleteRecord} />
          </>
        }
      >
        <Txt variant="body">줍기·시간·거리와 활동 사진이 모두 삭제돼요. 되돌릴 수 없어요.</Txt>
      </Dialog>

      <Snackbar visible={snackbar != null} message={snackbar ?? ''} onDismiss={() => setSnackbar(null)} />
    </Screen>
  );
}
