import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { RefreshControl, View } from 'react-native';
import {
  AppHeader,
  Banner,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Icon,
  ListRow,
  Loading,
  Screen,
  Snackbar,
  Txt,
  space,
} from 'design-system/src';
import { createMockClient, type ApiClient } from '../src/api/client';
import type { MOCKS } from '../src/api/mocks.generated';
import { monthDay } from '../src/crew/crew';

type Notice = (typeof MOCKS)['GET /crew/notices']['data']['items'][number];

const api: ApiClient = createMockClient({ delayMs: 300 });

export default function NoticesScreen() {
  const [notices, setNotices] = useState<readonly Notice[] | null>(null);
  const [isLeader, setIsLeader] = useState(false);
  const [failed, setFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [snackbar, setSnackbar] = useState<string | null>(null);
  const { deleted } = useLocalSearchParams<{ deleted?: string }>();

  const load = useCallback(async (mode: 'quiet' | 'pull') => {
    if (mode === 'pull') setRefreshing(true);
    try {
      setNotices((await api.get('GET /crew/notices')).data.items);
      setFailed(false);
    } catch {
      setFailed(true);
    } finally {
      setRefreshing(false);
    }
  }, []);

  // 작성·삭제하고 돌아오면 첫 페이지부터 다시 받는다
  useFocusEffect(useCallback(() => void load('quiet'), [load]));

  useEffect(() => {
    if (!deleted) return;
    setSnackbar('공지를 삭제했어요.');
    router.setParams({ deleted: undefined });
  }, [deleted]);

  useEffect(() => {
    api.get('GET /crew').then((res) => setIsLeader(res.data.isLeader)).catch(() => {});
  }, []);

  const open = (id: string) => router.push({ pathname: '/3-6-notice-detail', params: { id } });
  const meta = (n: Notice) => `댓글 ${n.commentCount}개 · ${monthDay(n.createdAt)}`;

  return (
    <Screen scroll refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load('pull')} />}>
      <AppHeader
        title="공지"
        onBack={() => router.back()}
        action={
          isLeader ? (
            <Button
              label="작성"
              icon="plus"
              size="sm"
              accessibilityLabel="공지 작성, 크루장만 가능"
              onPress={() => router.push('/3-12-edit-notice')}
            />
          ) : undefined
        }
      />
      <Txt variant="caption" tone="muted">크루원 모두에게 알릴 내용을 확인해요.</Txt>

      {!notices ? (
        failed ? (
          <ErrorState title="공지를 불러오지 못했어요" onRetry={() => load('quiet')} />
        ) : (
          <Loading label="공지를 불러오고 있어요" />
        )
      ) : notices.length === 0 ? (
        <EmptyState
          icon="bullhorn-outline"
          title="아직 공지가 없어요"
          description="크루장이 첫 공지를 작성하면 여기에 보여요."
          actionLabel={isLeader ? '공지 작성' : undefined}
          onAction={isLeader ? () => router.push('/3-12-edit-notice') : undefined}
        />
      ) : (
        <>
          {failed ? <Banner tone="warn">인터넷 연결을 확인해 주세요.</Banner> : null}
          {notices.map((n) =>
            n.pinned ? (
              <Card
                key={n.id}
                onPress={() => open(n.id)}
                accessibilityLabel={`최신 공지, ${n.title}, 댓글 ${n.commentCount}개, ${monthDay(n.createdAt)}`}
              >
                <View style={{ gap: space.xs }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
                    <Icon name="pin" />
                    <Txt variant="section" bold style={{ flex: 1 }}>{n.title}</Txt>
                    <Icon name="chevron-right" />
                  </View>
                  <Txt variant="body" tone="muted" numberOfLines={2}>{n.preview}</Txt>
                  <Txt variant="micro" tone="muted">{meta(n)}</Txt>
                </View>
              </Card>
            ) : (
              <ListRow
                key={n.id}
                title={n.title}
                subtitle={`${n.preview}\n${meta(n)}`}
                chevron
                accessibilityLabel={`${n.title}, ${n.preview}, ${meta(n)}, 공지 상세 보기`}
                onPress={() => open(n.id)}
              />
            ),
          )}
          {/* ponytail: nextCursor 로 다음 장 받기는 목이 한 장뿐이라 백엔드 연결 때 붙인다 */}
        </>
      )}

      <Snackbar visible={snackbar != null} message={snackbar ?? ''} onDismiss={() => setSnackbar(null)} />
    </Screen>
  );
}
