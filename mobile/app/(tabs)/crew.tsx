import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { RefreshControl, View } from 'react-native';
import {
  Avatar,
  Badge,
  Banner,
  Card,
  Dot,
  ErrorState,
  Icon,
  IconButton,
  LinkText,
  ListRow,
  Loading,
  Screen,
  Tabs,
  Txt,
  borderWidth,
  space,
  useTheme,
} from 'design-system/src';
import { createMockClient, type ApiClient } from '../../src/api/client';
import type { MOCKS } from '../../src/api/mocks.generated';
import { CalendarPanel } from '../../src/crew/CalendarPanel';
import { RecordsPanel } from '../../src/crew/RecordsPanel';
import { monthDay } from '../../src/crew/crew';

type CrewData = (typeof MOCKS)['GET /crew']['data'];
export type Crew = Omit<CrewData, 'pinnedNotice'> & { pinnedNotice: CrewData['pinnedNotice'] | null };

const api: ApiClient = createMockClient({ delayMs: 300 });

type Panel = 'calendar' | 'records';
const PANELS: ReadonlyArray<{ value: Panel; label: string }> = [
  { value: 'calendar', label: '달력' },
  { value: 'records', label: '기록' },
];

export default function CrewScreen() {
  const { colors } = useTheme();
  const [crew, setCrew] = useState<Crew | null>(null);
  const [unread, setUnread] = useState(0);
  const [failed, setFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const { tab } = useLocalSearchParams<{ tab?: string }>();
  const [panel, setPanel] = useState<Panel>('calendar');
  const [refreshKey, setRefreshKey] = useState(0);

  // 홈의 "크루 기록 보기" 는 기록 탭으로 들어온다. 한 번 반영하면 지워 다음 진입은 달력부터다
  useEffect(() => {
    if (tab !== 'records') return;
    setPanel('records');
    router.setParams({ tab: undefined });
  }, [tab]);

  const load = useCallback(async (mode: 'quiet' | 'pull') => {
    if (mode === 'pull') setRefreshing(true);
    const [crewRes, homeRes] = await Promise.allSettled([api.get('GET /crew'), api.get('GET /crew/home')]);
    setRefreshing(false);
    // 알림 수를 못 받으면 점만 숨긴다
    setUnread(homeRes.status === 'fulfilled' ? homeRes.value.data.unreadNotifications : 0);
    if (crewRes.status === 'rejected') return setFailed(true);
    setFailed(false);
    setCrew(crewRes.value.data);
  }, []);

  useFocusEffect(useCallback(() => void load('quiet'), [load]));

  return (
    <Screen
      scroll
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshKey((k) => k + 1);
            void load('pull');
          }}
        />
      }
    >
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Txt variant="display" style={{ flex: 1 }}>모이깅</Txt>
        <View>
          <IconButton
            icon="bell-outline"
            label={unread > 0 ? `알림, 안 읽음 ${unread}개` : '알림'}
            onPress={() => router.push('/2-3-notifications')}
          />
          {unread > 0 ? (
            <View style={{ position: 'absolute', top: space.sm, right: space.sm }} pointerEvents="none">
              <Dot />
            </View>
          ) : null}
        </View>
      </View>

      {crew ? (
        <>
          <Card
            onPress={() => router.push('/3-2-crew-info')}
            accessibilityLabel={`${crew.name}, 크루원 ${crew.memberCount}명, 14일 목표 ${crew.goalCount}개, 크루 정보 보기`}
          >
            {/* 누르는 Card 는 style 을 바깥 틀에만 주므로 배치는 안쪽 View 에서 한다 */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
              <Avatar name={crew.name} uri={crew.photoUrl ?? undefined} size="lg" />
              <View style={{ flex: 1, gap: space.xs }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
                  <Txt variant="section" bold>{crew.name}</Txt>
                  {crew.isLeader ? <Badge label="크루장" tone="deep" /> : null}
                </View>
                <Txt variant="caption" tone="muted">
                  크루원 {crew.memberCount}명 · 목표 14일 {crew.goalCount}개
                </Txt>
              </View>
              <Icon name="chevron-right" />
            </View>
          </Card>

          {failed ? <Banner tone="warn">인터넷 연결을 확인해 주세요.</Banner> : null}

          {/* 공지·채팅은 둘 다 크루에서 오가는 글이라 한 카드로 묶는다 */}
          <Card style={{ paddingVertical: 0 }}>
          {crew.pinnedNotice ? (
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View style={{ flex: 1 }}>
                <ListRow
                  icon="pin"
                  title={crew.pinnedNotice.title}
                  subtitle={monthDay(crew.pinnedNotice.createdAt)}
                  divider={false}
                  chevron={false}
                  accessibilityLabel={`최신 공지, ${crew.pinnedNotice.title}`}
                  onPress={() => router.push({ pathname: '/3-6-notice-detail', params: { id: crew.pinnedNotice!.id } })}
                />
              </View>
              <LinkText label="전체 ›" tone="muted" accessibilityLabel="공지 전체 보기" onPress={() => router.push('/3-5-notices')} />
            </View>
          ) : (
            <ListRow icon="bullhorn-outline" title="공지" divider={false} chevron onPress={() => router.push('/3-5-notices')} />
          )}
          <View style={{ height: borderWidth.hairline, backgroundColor: colors.border }} />
          <ListRow
            icon="chat-outline"
            title="크루 채팅"
            divider={false}
            chevron
            right={crew.unreadChat > 0 ? <Dot /> : undefined}
            accessibilityLabel={crew.unreadChat > 0 ? `크루 채팅, 안 읽은 메시지 ${crew.unreadChat}개` : '크루 채팅'}
            onPress={() => router.push('/3-7-crew-chat')}
          />
          </Card>

          <Tabs items={PANELS} value={panel} onChange={setPanel} fullWidth />
          {panel === 'calendar' ? <CalendarPanel refreshKey={refreshKey} /> : <RecordsPanel refreshKey={refreshKey} />}
        </>
      ) : failed ? (
        <ErrorState title="크루를 불러오지 못했어요" onRetry={() => load('quiet')} />
      ) : (
        <Loading label="크루를 불러오고 있어요" />
      )}
    </Screen>
  );
}

