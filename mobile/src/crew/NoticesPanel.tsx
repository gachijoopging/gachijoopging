import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { Banner, Button, Card, EmptyState, ErrorState, Icon, ListRow, Loading, Txt, space } from 'design-system/src';
import { createMockClient, type ApiClient } from '../api/client';
import type { MOCKS } from '../api/mocks.generated';
import { monthDay } from './crew';

type Notice = (typeof MOCKS)['GET /crew/notices']['data']['items'][number];

const api: ApiClient = createMockClient({ delayMs: 300 });

/** 모이깅의 공지 패널(3-5). 쓰기는 크루장만 */
export function NoticesPanel({ isLeader, refreshKey }: { isLeader: boolean; refreshKey: number }) {
  const [notices, setNotices] = useState<readonly Notice[] | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    try {
      setNotices((await api.get('GET /crew/notices')).data.items);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, []);

  // 작성·삭제하고 돌아오면 첫 페이지부터 다시 받는다
  useFocusEffect(useCallback(() => void load(), [load]));
  // 탭을 바꿔 새로 붙을 때는 위의 첫 조회로 충분하다. 붙은 뒤 바뀐 refreshKey 만 다시 받는다
  const mountedKey = useRef(refreshKey);
  useEffect(() => {
    if (refreshKey !== mountedKey.current) void load();
  }, [refreshKey, load]);

  const open = (id: string) => router.push({ pathname: '/crew/notices/[id]', params: { id } });
  const write = () => router.push('/crew/notices/edit');
  const meta = (n: Notice) => `댓글 ${n.commentCount}개, ${monthDay(n.createdAt)}`;

  if (!notices) {
    return failed ? <ErrorState title="공지를 불러오지 못했어요" onRetry={() => void load()} /> : <Loading label="공지를 불러오고 있어요" />;
  }

  return (
    <View style={{ gap: space.md }}>
      {isLeader && notices.length > 0 ? (
        <Button label="공지 쓰기" icon="plus" size="sm" variant="soft" style={{ alignSelf: 'flex-end' }} accessibilityLabel="공지 쓰기, 크루장만 가능" onPress={write} />
      ) : null}
      {failed ? <Banner tone="warn">인터넷 연결을 확인해 주세요.</Banner> : null}
      {notices.length === 0 ? (
        <EmptyState icon="bullhorn-outline" title="아직 공지가 없어요" actionLabel={isLeader ? '공지 쓰기' : undefined} onAction={isLeader ? write : undefined} />
      ) : (
        notices.map((n) =>
          n.pinned ? (
            <Card key={n.id} onPress={() => open(n.id)} accessibilityLabel={`최신 공지, ${n.title}, ${meta(n)}`}>
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
        )
      )}
      {/* ponytail: nextCursor 로 다음 장 받기는 목이 한 장뿐이라 백엔드 연결 때 붙인다 */}
    </View>
  );
}
