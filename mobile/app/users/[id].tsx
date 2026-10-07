// 화면 5-4 · docs/screens/5-4-user-profile.md
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshControl, View } from 'react-native';
import {
  AppHeader,
  Avatar,
  Badge,
  Banner,
  BottomSheet,
  Button,
  Dialog,
  EmptyState,
  ErrorState,
  IconButton,
  LinkText,
  ListRow,
  Loading,
  Screen,
  Snackbar,
  Tabs,
  Txt,
  space,
} from 'design-system/src';
import { ApiError, createMockClient, forget, peek, type ApiClient } from '../../src/api/client';
import type { MOCKS } from '../../src/api/mocks.generated';
import { ActivityCalendar, StatsTile, usePaged, type ActivityCard, type Post } from '../../src/profile/ProfileParts';
import { ProfileTabList } from '../../src/profile/ProfileTabList';
import { INTRO_FOLD, safetyRows, type SafetyRow } from '../../src/profile/profile';
import { setUserBlocked } from '../../src/profile/blocked-users';

type Profile = Omit<(typeof MOCKS)['GET /crew/members/{userId}']['data'], 'isLeader' | 'following' | 'blocked' | 'activeDays'> & {
  isLeader: boolean;
  following: boolean;
  blocked: boolean;
  activeDays: readonly string[];
};
type Tab = 'records' | 'posts';
type Confirm = 'block' | 'kick' | 'delegate';

const api: ApiClient = createMockClient({ delayMs: 300 });
const TABS: { value: Tab; label: string }[] = [
  { value: 'records', label: '기록' },
  { value: 'posts', label: '게시물' },
];

function joinedLabel(iso: string): string {
  const d = new Date(Date.parse(iso) + 9 * 60 * 60 * 1000);
  return `${d.getUTCFullYear()}년 ${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일 가입`;
}

const ROW: Record<SafetyRow, { title: string; subtitle: string; icon: 'flag-outline' | 'block-helper' | 'account-remove-outline' | 'crown-outline' | 'account-check-outline' }> = {
  report: { title: '신고하기', subtitle: '부적절한 행동을 알려 주세요', icon: 'flag-outline' },
  block: { title: '차단하기', subtitle: '내 게시물, 댓글, 채팅, 위치 화면에서 바로 숨겨져요', icon: 'block-helper' },
  unblock: { title: '차단 해제', subtitle: '다시 내 화면에 보여요', icon: 'account-check-outline' },
  kick: { title: '크루원 추방', subtitle: '크루에서 내보내요. 활동 기록은 남아요', icon: 'account-remove-outline' },
  delegate: { title: '크루장 위임', subtitle: '이 크루원이 크루장이 되고, 나는 일반 크루원이 돼요', icon: 'crown-outline' },
};

const CONFIRM: Record<Confirm, { title: (n: string) => string; body: string; action: string; done: (n: string) => string; fail: string }> = {
  block: {
    title: (n) => `${n}님을 차단할까요?`,
    body: '차단하면 내 게시물, 댓글, 채팅, 위치 화면에서 이 크루원이 보이지 않아요. 크루 소속은 그대로예요.',
    action: '차단',
    done: (n) => `${n}님을 차단했어요`,
    fail: '차단에 실패했어요',
  },
  kick: {
    title: (n) => `${n}님을 크루에서 추방할까요?`,
    body: '추방해도 활동 기록은 개인 기록과 크루 합산에 남아요. 미처리 사용자 신고가 함께 해결되고 신고자에게 결과를 알려요. 현재 유효한 초대 코드로 다시 가입 신청할 수 있어요.',
    action: '추방',
    done: (n) => `${n}님을 추방했어요`,
    fail: '추방에 실패했어요',
  },
  delegate: {
    title: (n) => `${n}님에게 크루장을 넘길까요?`,
    body: '위임하면 나는 크루장 권한을 잃고 일반 크루원이 돼요. 크루장만 할 수 있는 일은 새 크루장이 맡아요.',
    action: '위임',
    done: () => '크루장을 위임했어요',
    fail: '위임에 실패했어요',
  },
};

export default function UserProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [profile, setProfile] = useState<Profile | null>(() => peek('GET /crew/members/{userId}', { userId: id })?.data ?? null);
  const [failed, setFailed] = useState(false);
  const [gone, setGone] = useState(false);
  const [viewerIsLeader, setViewerIsLeader] = useState(false);
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('records');
  const [refreshing, setRefreshing] = useState(false);
  const [introOpen, setIntroOpen] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [busy, setBusy] = useState(false);
  const [following, setFollowing] = useState(() => peek('GET /crew/members/{userId}', { userId: id })?.data.following ?? false);
  const [snackbar, setSnackbar] = useState<string | null>(null);
  const memberId = useRef(id);
  memberId.current = id;
  const profileRequest = useRef(0);
  const shownId = useRef(id);
  useEffect(() => {
    // 처음 그릴 때는 기억한 프로필을 그대로 둔다. 다른 사람으로 바뀔 때만 앞사람 화면을 지운다
    if (shownId.current === id) return;
    shownId.current = id;
    const cached = peek('GET /crew/members/{userId}', { userId: id })?.data ?? null;
    setProfile(cached);
    setFollowing(cached?.following ?? false);
    setGone(false);
    setFailed(false);
    setSheet(false);
    setConfirm(null);
  }, [id]);

  const records = usePaged<ActivityCard>(async (cursor) => (await api.get('GET /crew/members/{userId}/activities', { userId: id, cursor })).data, id);
  const posts = usePaged<Post>(async (cursor) => (await api.get('GET /crew/members/{userId}/posts', { userId: id, cursor })).data, id);

  const loadProfile = useCallback(async () => {
    const request = ++profileRequest.current;
    try {
      const { data } = await api.get('GET /crew/members/{userId}', { userId: id });
      if (memberId.current !== id || request !== profileRequest.current) return true;
      setProfile(data);
      setGone(false);
      setFollowing(data.following);
      setFailed(false);
      return true;
    } catch (e) {
      if (memberId.current !== id || request !== profileRequest.current) return true;
      if (e instanceof ApiError && e.code === 'NOT_FOUND') setGone(true);
      else setFailed(true);
      return false;
    }
  }, [id]);

  useEffect(() => {
    let ignore = false;
    api
      .get('GET /users/me')
      .then(({ data }) => {
        if (ignore) return;
        setViewerId(data.id);
        // 자기 자신이면 5-4 를 스택에 남기지 않고 내 정보로 바꾼다
        if (data.id === id) return router.replace('/(tabs)/profile');
        setViewerIsLeader(!!data.membership.crew?.isLeader);
      })
      .catch(() => {});
    return () => { ignore = true; };
  }, [id]);

  const tabRef = useRef(tab);
  tabRef.current = tab;
  const reloadRecords = records.reload;
  const reloadPosts = posts.reload;
  const reloadAll = useCallback(
    () => Promise.all([loadProfile(), tabRef.current === 'records' ? reloadRecords() : reloadPosts()]),
    [loadProfile, reloadRecords, reloadPosts],
  );
  useFocusEffect(useCallback(() => void reloadAll(), [reloadAll]));

  const postsAsked = useRef<string | null>(null);
  useEffect(() => {
    if (tab === 'posts' && postsAsked.current !== id) {
      postsAsked.current = id;
      void reloadPosts();
    }
  }, [tab, id, reloadPosts]);

  const pull = async () => {
    setRefreshing(true);
    const results = await reloadAll();
    setRefreshing(false);
    if (results.includes(false)) setSnackbar('새로고침에 실패했어요');
  };

  const toggleFollow = async () => {
    if (busy || !profile) return;
    setBusy(true);
    const next = !following;
    try {
      await api.mutate(next ? 'PUT /users/{userId}/follow' : 'DELETE /users/{userId}/follow', { userId: id });
      setFollowing(next);
    } catch {
      setSnackbar(next ? '팔로우에 실패했어요' : '팔로우 해제에 실패했어요');
    } finally {
      setBusy(false);
    }
  };

  const unblock = async () => {
    if (busy || !profile || !viewerId) return;
    setSheet(false);
    setBusy(true);
    try {
      await api.mutate('DELETE /users/{userId}/block', { userId: id });
      forget('GET /crew/members/{userId}', { userId: id });
      setUserBlocked(viewerId, id, false);
      setProfile({ ...profile, blocked: false });
      setSnackbar('차단을 해제했어요');
    } catch {
      setSnackbar('차단 해제에 실패했어요');
    } finally {
      setBusy(false);
    }
  };

  const run = async (action: Confirm) => {
    if (busy || !profile || !viewerId) return;
    setBusy(true);
    try {
      if (action === 'block') await api.mutate('PUT /users/{userId}/block', { userId: id });
      else if (action === 'kick') await api.mutate('DELETE /crew/members/{userId}', { userId: id });
      else await api.mutate('PUT /crew/leader', { userId: id });
      forget('GET /crew/members/{userId}', { userId: id });
      setConfirm(null);
      setSheet(false);
      const message = CONFIRM[action].done(profile.nickname);
      if (action === 'kick') return router.back();
      if (action === 'block') {
        setUserBlocked(viewerId, id, true);
        setProfile({ ...profile, blocked: true });
      }
      if (action === 'delegate') {
        setProfile({ ...profile, isLeader: true });
        setViewerIsLeader(false);
      }
      setSnackbar(message);
    } catch {
      setConfirm(null);
      setSnackbar(CONFIRM[action].fail);
    }
    // 내보내기는 위에서 떠났다. 떠나는 화면은 다시 그리지 않는다 — 전환 중 재렌더가 Fabric 을 죽인다
    setBusy(false);
  };

  const pick = (row: SafetyRow) => {
    if (row === 'report') {
      setSheet(false);
      return router.push({ pathname: '/report', params: { targetType: 'USER', targetId: id, nickname: profile?.nickname ?? '', photoUrl: profile?.photoUrl ?? '' } });
    }
    if (row === 'unblock') return void unblock();
    setSheet(false);
    setConfirm(row);
  };

  const name = profile?.nickname ?? '';

  return (
    <Screen>
      <AppHeader
        title={name}
        onBack={() => router.back()}
        action={
          profile && !profile.withdrawn ? (
            <IconButton icon="dots-horizontal" label={viewerIsLeader ? '크루원 관리' : '신고 또는 차단'} onPress={() => setSheet(true)} />
          ) : undefined
        }
      />

      {gone ? (
        <EmptyState
          icon="account-off-outline"
          title="프로필을 찾을 수 없어요"
          description="삭제되었거나 볼 수 없는 계정이에요."
          actionLabel="돌아가기"
          onAction={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))}
        />
      ) : !profile ? (
        failed ? <ErrorState title="프로필을 불러오지 못했어요" onRetry={loadProfile} /> : <Loading label="프로필을 불러오고 있어요" />
      ) : (
        <ProfileTabList
          tab={tab}
          header={
            <>
                {failed ? <Banner tone="warn">인터넷 연결을 확인해 주세요.</Banner> : null}

                <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
                  <Avatar name={profile.nickname} uri={profile.photoUrl ?? undefined} size="lg" decorative />
                  <View style={{ flex: 1, gap: space.xs }}>
                    <View
                      accessible
                      accessibilityLabel={profile.isLeader ? `${profile.nickname}, 크루장` : profile.nickname}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}
                    >
                      <Txt variant="title" bold numberOfLines={1} style={{ flexShrink: 1 }}>{profile.nickname}</Txt>
                      {profile.isLeader ? <Badge label="크루장" tone="deep" /> : null}
                    </View>
                    {profile.intro ? (
                      <>
                        <Txt variant="caption" numberOfLines={introOpen ? undefined : 2}>{profile.intro}</Txt>
                        {profile.intro.length > INTRO_FOLD ? (
                          <LinkText label={introOpen ? '접기' : '더 보기'} tone="muted" onPress={() => setIntroOpen((o) => !o)} style={{ alignSelf: 'flex-start' }} />
                        ) : null}
                      </>
                    ) : null}
                    <Txt variant="micro" tone="muted">{joinedLabel(profile.joinedAt)}</Txt>
                  </View>
                </View>

                {!profile.blocked && !profile.withdrawn ? (
                  <View style={{ gap: space.xs, alignItems: 'flex-start' }}>
                    <Button
                      label={following ? '팔로우 중' : '팔로우'}
                      variant={following ? 'soft' : 'primary'}
                      size="sm"
                      loading={busy}
                      accessibilityLabel={following ? '팔로우 중, 해제하려면 두 번 탭' : '팔로우'}
                      onPress={toggleFollow}
                    />
                    <Txt variant="micro" tone="muted">활동을 시작하면 알려 드려요</Txt>
                  </View>
                ) : null}

                {profile.blocked ? (
                  <Banner tone="danger" action={{ label: '차단 해제', onPress: unblock }}>
                    차단한 크루원이에요. 내 게시물, 댓글, 채팅, 위치 화면에서 보이지 않아요.
                  </Banner>
                ) : null}

                <StatsTile stats={profile} />
                <Tabs items={TABS} value={tab} onChange={setTab} fullWidth />
              {tab === 'records' && !profile.blocked ? <ActivityCalendar activeDays={profile.activeDays} /> : null}
            </>
          }
          records={records}
          posts={posts}
          onOpenRecord={(activityId) => router.push({ pathname: '/records/[id]', params: { id: activityId } })}
          onOpenPost={(postId) => router.push({ pathname: '/posts/[id]', params: { id: postId } })}
          recordsEmpty={{ description: `${name}님이 첫 활동을 시작하면 여기 쌓여요.` }}
          postsEmptyDescription={`${name}님이 크루에 올린 게시물이 여기 모여요.`}
          hidden={profile.blocked ? <EmptyState icon="eye-off-outline" title="차단한 크루원의 개인 콘텐츠는 숨겨져요" /> : undefined}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={pull} />}
        />
      )}

      <BottomSheet visible={sheet} onClose={() => setSheet(false)} title={`${name}님`}>
        {profile
          ? safetyRows({ viewerIsLeader, blocked: profile.blocked }).map((row) => (
              <ListRow
                key={row}
                icon={ROW[row].icon}
                title={ROW[row].title}
                subtitle={ROW[row].subtitle}
                tone={row === 'kick' ? 'danger' : undefined}
                chevron={false}
                accessibilityLabel={`${ROW[row].title}, ${ROW[row].subtitle}`}
                onPress={() => pick(row)}
              />
            ))
          : null}
      </BottomSheet>

      <Dialog
        visible={confirm != null}
        onClose={() => !busy && setConfirm(null)}
        title={confirm ? CONFIRM[confirm].title(name) : ''}
        actions={
          <>
            <Button label="그대로 두기" variant="ghost" size="md" disabled={busy} onPress={() => setConfirm(null)} />
            {confirm ? <Button label={CONFIRM[confirm].action} variant="danger" size="md" loading={busy} onPress={() => run(confirm)} /> : null}
          </>
        }
      >
        {confirm ? <Txt variant="body">{CONFIRM[confirm].body}</Txt> : null}
      </Dialog>

      <Snackbar visible={snackbar != null} message={snackbar ?? ''} onDismiss={() => setSnackbar(null)} />
    </Screen>
  );
}
