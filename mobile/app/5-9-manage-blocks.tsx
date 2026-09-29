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

type Blocked = (typeof MOCKS)['GET /users/me/blocked']['data'][number];

const api: ApiClient = createMockClient({ delayMs: 300 });
const ROW_DESC = '차단됨 · 게시물·댓글·채팅·위치에서 숨김';

export default function ManageBlocksScreen() {
  const [list, setList] = useState<readonly Blocked[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [snackbar, setSnackbar] = useState<string | null>(null);
  const pending = useRef(new Set<string>());

  const load = useCallback(async (mode: 'quiet' | 'pull') => {
    if (mode === 'pull') setRefreshing(true);
    try {
      const { data } = await api.get('GET /users/me/blocked');
      setList(data);
      setFailed(false);
    } catch {
      setFailed(true);
      if (mode === 'pull') setSnackbar('새로고침에 실패했어요');
    } finally {
      setRefreshing(false);
    }
  }, []);

  // 5-4 에서 해제하고 돌아올 수 있다
  useFocusEffect(useCallback(() => void load('quiet'), [load]));

  const unblock = async (user: Blocked) => {
    if (!list || pending.current.has(user.id)) return;
    pending.current.add(user.id);
    const index = list.findIndex((u) => u.id === user.id);
    setList(list.filter((u) => u.id !== user.id));
    try {
      await api.mutate('DELETE /users/{userId}/block', { userId: user.id });
      setSnackbar('차단을 해제했어요');
    } catch {
      setList((prev) => {
        const next = [...(prev ?? [])];
        next.splice(index, 0, user);
        return next;
      });
      setSnackbar('차단 해제에 실패했어요. 다시 시도해 주세요.');
    } finally {
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
