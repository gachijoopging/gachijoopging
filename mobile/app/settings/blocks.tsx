// 화면 5-9 · docs/screens/5-9-manage-blocks.md
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshControl, View } from 'react-native';
import {
  AppHeader,
  Avatar,
  Banner,
  Button,
  EmptyState,
  ErrorState,
  List,
  ListRow,
  Loading,
  Screen,
  Snackbar,
  borderWidth,
  radius,
  space,
  useTheme,
} from 'design-system/src';
import { createMockClient, type ApiClient } from '../../src/api/client';
import type { MOCKS } from '../../src/api/mocks.generated';
import { blockedUsers, reconcileBlockedUsers, setUserBlocked } from '../../src/profile/blocked-users';
import { currentAccount } from '../../src/auth/account';

type Blocked = (typeof MOCKS)['GET /users/me/blocked']['data']['items'][number];

const api: ApiClient = createMockClient({ delayMs: 300 });
const ROW_DESC = '차단됨, 게시물, 댓글, 채팅, 위치에서 숨김';

export default function ManageBlocksScreen() {
  const { colors } = useTheme();
  const [list, setList] = useState<readonly Blocked[] | null>(null);
  const [total, setTotal] = useState(0);
  const [failed, setFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [snackbar, setSnackbar] = useState<string | null>(null);
  const pending = useRef(new Set<string>());
  const listRef = useRef(list);
  listRef.current = list;
  const generation = useRef(0);
  const viewerId = useRef(currentAccount()?.id ?? null);

  const cursor = useRef<string | null>(null);
  const loadingMore = useRef(false);
  const pageIds = useRef<string[]>([]);
  const cacheSnapshot = useRef<ReadonlySet<string> | null>(null);
  const [moreState, setMoreState] = useState<'idle' | 'loading' | 'failed'>('idle');
  useEffect(() => () => { generation.current += 1; }, []);

  const load = useCallback(async (mode: 'quiet' | 'pull') => {
    if (pending.current.size) return;
    const request = ++generation.current;
    cursor.current = null;
    loadingMore.current = false;
    setMoreState('idle');
    if (mode === 'pull') setRefreshing(true);
    try {
      if (!viewerId.current) viewerId.current = (await api.get('GET /users/me')).data.id;
      const accountId = viewerId.current;
      const previous = blockedUsers(accountId);
      const { data } = await api.get('GET /users/me/blocked');
      if (request !== generation.current) return;
      setList(data.items);
      setTotal(data.total);
      cursor.current = data.nextCursor;
      pageIds.current = data.items.map((user) => user.id);
      cacheSnapshot.current = null;
      if (blockedUsers(accountId) === previous) {
        reconcileBlockedUsers(accountId, pageIds.current, previous, data.nextCursor == null);
        cacheSnapshot.current = blockedUsers(accountId);
      }
      setFailed(false);
    } catch {
      if (request !== generation.current) return;
      setFailed(true);
      if (mode === 'pull') setSnackbar('새로고침에 실패했어요');
    } finally {
      if (request === generation.current) setRefreshing(false);
    }
  }, []);

  // 5-4 에서 해제하고 돌아올 수 있다
  useFocusEffect(useCallback(() => void load('quiet'), [load]));

  const loadMore = async () => {
    const next = cursor.current;
    if (!next || loadingMore.current || pending.current.size) return;
    const request = generation.current;
    loadingMore.current = true;
    setMoreState('loading');
    try {
      const { data } = await api.get('GET /users/me/blocked', { cursor: next });
      if (request !== generation.current || cursor.current !== next) return;
      setList((previous) => {
        const ids = new Set(previous?.map((user) => user.id));
        return [...(previous ?? []), ...data.items.filter((user) => !ids.has(user.id))];
      });
      pageIds.current = [...new Set([...pageIds.current, ...data.items.map((user) => user.id)])];
      const accountId = viewerId.current;
      const expected = cacheSnapshot.current;
      if (accountId && expected && blockedUsers(accountId) === expected) {
        reconcileBlockedUsers(accountId, pageIds.current, expected, data.nextCursor == null);
        cacheSnapshot.current = blockedUsers(accountId);
      }
      cursor.current = data.nextCursor;
      setTotal(data.total);
      setMoreState('idle');
    } catch {
      if (request === generation.current) setMoreState('failed');
    } finally {
      if (request === generation.current) loadingMore.current = false;
    }
  };

  const unblock = async (user: Blocked) => {
    if (!listRef.current || pending.current.has(user.id)) return;
    const original = listRef.current;
    const index = original.findIndex((u) => u.id === user.id);
    const preceding = original.slice(0, index).map((u) => u.id);
    const following = original.slice(index + 1).map((u) => u.id);
    generation.current += 1;
    loadingMore.current = false;
    cacheSnapshot.current = null;
    setMoreState('idle');
    setRefreshing(false);
    pending.current.add(user.id);
    setList((prev) => prev?.filter((u) => u.id !== user.id) ?? prev);
    try {
      await api.mutate('DELETE /users/{userId}/block', { userId: user.id });
      if (viewerId.current) setUserBlocked(viewerId.current, user.id, false);
      setTotal((n) => Math.max(0, n - 1));
      setSnackbar('차단을 해제했어요');
    } catch {
      setList((prev) => {
        const next = [...(prev ?? [])];
        if (next.some((u) => u.id === user.id)) return next;
        const after = next.findIndex((u) => following.includes(u.id));
        let before = -1;
        next.forEach((u, i) => { if (preceding.includes(u.id)) before = i; });
        next.splice(after >= 0 ? after : before >= 0 ? before + 1 : Math.min(index, next.length), 0, user);
        return next;
      });
      setSnackbar('차단 해제에 실패했어요. 다시 시도해 주세요.');
    } finally {
      generation.current += 1;
      setRefreshing(false);
      pending.current.delete(user.id);
    }
  };

  return (
    <Screen>
      <AppHeader title="차단 관리" subtitle={list ? `차단 ${total}명` : undefined} onBack={() => router.back()} />

      {!list ? (
        failed ? <ErrorState title="차단 목록을 불러오지 못했어요" onRetry={() => load('quiet')} /> : <Loading label="차단 목록을 불러오고 있어요" />
      ) : (
        <List
          data={list}
          keyExtractor={(u) => u.id}
          // 실패한 다음 장은 끝에 닿을 때마다 다시 부르지 않는다. 다시 시도 버튼으로만 부른다
          onEndReached={() => { if (moreState !== 'failed') void loadMore(); }}
          onEndReachedThreshold={0.5}
          refreshControl={<RefreshControl refreshing={refreshing} enabled={pending.current.size === 0} onRefresh={() => load('pull')} />}
          ListHeaderComponent={failed ? <View style={{ paddingBottom: space.md }}><Banner tone="warn">인터넷 연결을 확인해 주세요.</Banner></View> : null}
          empty={<EmptyState icon="account-cancel-outline" title="차단한 크루원이 없어요" description="차단하면 내 게시물, 댓글, 채팅, 위치 화면에서 그 사람이 숨겨져요." />}
          renderItem={({ item: u, index: i }) => (
            // 한 장의 카드처럼 보이도록 첫 행과 끝 행만 둥글린다
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                paddingHorizontal: space.md,
                backgroundColor: colors.surface,
                // 다른 카드 목록과 같은 가장자리. 행 사이 선은 ListRow 가 긋는다
                borderWidth: borderWidth.hairline,
                borderTopWidth: i === 0 ? borderWidth.hairline : 0,
                borderBottomWidth: i === list.length - 1 ? borderWidth.hairline : 0,
                borderColor: colors.border,
                borderTopLeftRadius: i === 0 ? radius.card : 0,
                borderTopRightRadius: i === 0 ? radius.card : 0,
                borderBottomLeftRadius: i === list.length - 1 ? radius.card : 0,
                borderBottomRightRadius: i === list.length - 1 ? radius.card : 0,
              }}
            >
              <View style={{ flex: 1 }}>
                <ListRow
                  title={u.nickname}
                  subtitle={ROW_DESC}
                  left={<Avatar name={u.nickname} uri={u.photoUrl ?? undefined} size="sm" withdrawn={u.withdrawn} decorative />}
                  divider={i < list.length - 1}
                  chevron={false}
                  accessibilityLabel={u.withdrawn ? `${u.nickname}, 차단됨` : `${u.nickname}, 차단됨, 게시물, 댓글, 채팅, 위치에서 숨김, 프로필 보기`}
                  onPress={u.withdrawn ? undefined : () => router.push({ pathname: '/users/[id]', params: { id: u.id } })}
                />
              </View>
              <Button label="차단 해제" variant="ghost" size="sm" accessibilityLabel={`차단 해제, ${u.nickname}님`} onPress={() => unblock(u)} />
            </View>
          )}
          ListFooterComponent={
            <View style={{ paddingTop: space.md }}>
              {moreState === 'loading' ? <Loading label="차단 목록을 더 불러오고 있어요" /> : moreState === 'failed' ? <Button label="다시 시도" variant="ghost" onPress={loadMore} /> : cursor.current ? <Button label="더 불러오기" variant="ghost" disabled={pending.current.size > 0} onPress={loadMore} /> : null}
            </View>
          }
        />
      )}
      <Snackbar visible={snackbar != null} message={snackbar ?? ''} onDismiss={() => setSnackbar(null)} />
    </Screen>
  );
}
