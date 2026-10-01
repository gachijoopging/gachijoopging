import { router, useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { RefreshControl, View } from 'react-native';
import {
  AppHeader,
  Avatar,
  Banner,
  Button,
  Card,
  EmptyState,
  ErrorState,
  ListRow,
  Loading,
  Screen,
  Snackbar,
  space,
} from 'design-system/src';
import { createMockClient, type ApiClient } from '../src/api/client';
import type { MOCKS } from '../src/api/mocks.generated';
import { blockedUsers, reconcileBlockedUsers, setUserBlocked } from '../src/profile/blocked-users';
import { currentAccount } from '../src/auth/account';

type Blocked = (typeof MOCKS)['GET /users/me/blocked']['data'][number];

const api: ApiClient = createMockClient({ delayMs: 300 });
const ROW_DESC = '차단됨 · 게시물·댓글·채팅·위치에서 숨김';

export default function ManageBlocksScreen() {
  const [list, setList] = useState<readonly Blocked[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [snackbar, setSnackbar] = useState<string | null>(null);
  const pending = useRef(new Set<string>());
  const listRef = useRef(list);
  listRef.current = list;
  const generation = useRef(0);
  const viewerId = useRef(currentAccount()?.id ?? null);

  const load = useCallback(async (mode: 'quiet' | 'pull') => {
    const request = ++generation.current;
    if (mode === 'pull') setRefreshing(true);
    try {
      if (!viewerId.current) viewerId.current = (await api.get('GET /users/me')).data.id;
      const accountId = viewerId.current;
      const previous = blockedUsers(accountId);
      const { data } = await api.get('GET /users/me/blocked');
      if (request !== generation.current) return;
      setList(data.filter((user) => !pending.current.has(user.id)));
      reconcileBlockedUsers(accountId, data.map((user) => user.id), previous);
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

  const unblock = async (user: Blocked) => {
    if (!listRef.current || pending.current.has(user.id)) return;
    const original = listRef.current;
    const index = original.findIndex((u) => u.id === user.id);
    const preceding = original.slice(0, index).map((u) => u.id);
    const following = original.slice(index + 1).map((u) => u.id);
    generation.current += 1;
    setRefreshing(false);
    pending.current.add(user.id);
    setList((prev) => prev?.filter((u) => u.id !== user.id) ?? prev);
    try {
      await api.mutate('DELETE /users/{userId}/block', { userId: user.id });
      if (viewerId.current) setUserBlocked(viewerId.current, user.id, false);
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
    <Screen scroll refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load('pull')} />}>
      <AppHeader title="차단 관리" subtitle={list ? `차단 ${list.length}명` : undefined} onBack={() => router.back()} />

      {!list ? (
        failed ? <ErrorState onRetry={() => load('quiet')} /> : <Loading label="불러오는 중…" />
      ) : (
        <>
          {failed ? <Banner tone="warn">인터넷 연결을 확인해 주세요.</Banner> : null}
          {list.length === 0 ? (
            <EmptyState icon="account-cancel-outline" title="차단한 크루원이 없어요" description="차단하면 내 게시물·댓글·채팅·위치 화면에서 그 사람이 숨겨져요." />
          ) : (
            <Card padded={false}>
              {list.map((u, i) => (
                <View key={u.id} style={{ flexDirection: 'row', alignItems: 'center', paddingRight: space.md }}>
                  <View style={{ flex: 1 }}>
                    <ListRow
                      title={u.nickname}
                      subtitle={ROW_DESC}
                      left={<Avatar name={u.nickname} uri={u.photoUrl ?? undefined} size="sm" />}
                      divider={i < list.length - 1}
                      chevron={false}
                      accessibilityLabel={u.withdrawn ? `${u.nickname}, 차단됨` : `${u.nickname}, 차단됨, 게시물·댓글·채팅·위치에서 숨김, 프로필 보기`}
                      onPress={u.withdrawn ? undefined : () => router.push({ pathname: '/5-4-user-profile', params: { id: u.id } })}
                    />
                  </View>
                  <Button label="해제" variant="ghost" size="sm" accessibilityLabel={`해제, ${u.nickname}님 차단 해제`} onPress={() => unblock(u)} />
                </View>
              ))}
            </Card>
          )}
        </>
      )}

      <Snackbar visible={snackbar != null} message={snackbar ?? ''} onDismiss={() => setSnackbar(null)} />
    </Screen>
  );
}
