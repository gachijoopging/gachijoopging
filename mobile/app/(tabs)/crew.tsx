import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, RefreshControl, View } from 'react-native';
import {
  Avatar,
  Badge,
  Banner,
  Card,
  Dot,
  ErrorState,
  Icon,
  IconButton,
  ListRow,
  Loading,
  Screen,
  Tile,
  Txt,
  pressedOpacity,
  space,
  useRipple,
  type IconName,
} from 'design-system/src';
import { createMockClient, type ApiClient } from '../../src/api/client';
import type { MOCKS } from '../../src/api/mocks.generated';
import { monthDay } from '../../src/crew/crew';

type CrewData = (typeof MOCKS)['GET /crew']['data'];
export type Crew = Omit<CrewData, 'pinnedNotice'> & { pinnedNotice: CrewData['pinnedNotice'] | null };

const api: ApiClient = createMockClient({ delayMs: 300 });

export default function CrewScreen() {
  const [crew, setCrew] = useState<Crew | null>(null);
  const [unread, setUnread] = useState(0);
  const [failed, setFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

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
    <Screen scroll refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load('pull')} />}>
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
            style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}
          >
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
          </Card>

          {failed ? <Banner tone="warn">인터넷 연결을 확인해 주세요.</Banner> : null}

          <View style={{ flexDirection: 'row', gap: space.sm }}>
            <Shortcut icon="bullhorn-outline" label="공지" onPress={() => router.push('/3-5-notices')} />
            <Shortcut
              icon="chat-outline"
              label="채팅"
              dot={crew.unreadChat > 0}
              accessibilityLabel={crew.unreadChat > 0 ? `채팅, 안 읽은 메시지 ${crew.unreadChat}개` : '채팅'}
              onPress={() => router.push('/3-7-crew-chat')}
            />
            <Shortcut icon="chart-box-outline" label="크루 기록" onPress={() => router.push('/3-4-crew-records')} />
            <Shortcut icon="calendar-month-outline" label="활동 달력" onPress={() => router.push('/3-9-activity-calendar')} />
          </View>

          {crew.pinnedNotice ? (
            <ListRow
              icon="pin"
              title={crew.pinnedNotice.title}
              subtitle={monthDay(crew.pinnedNotice.createdAt)}
              chevron
              accessibilityLabel={`최신 공지, ${crew.pinnedNotice.title}`}
              onPress={() => router.push({ pathname: '/3-6-notice-detail', params: { id: crew.pinnedNotice!.id } })}
            />
          ) : (
            <ListRow icon="pin" title="아직 공지가 없어요" chevron={false} />
          )}
        </>
      ) : failed ? (
        <ErrorState title="크루를 불러오지 못했어요" onRetry={() => load('quiet')} />
      ) : (
        <Loading label="크루를 불러오고 있어요" />
      )}
    </Screen>
  );
}

function Shortcut({
  icon,
  label,
  dot,
  accessibilityLabel,
  onPress,
}: {
  icon: IconName;
  label: string;
  dot?: boolean;
  accessibilityLabel?: string;
  onPress: () => void;
}) {
  const ripple = useRipple();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      onPress={onPress}
      android_ripple={ripple}
      style={({ pressed }) => ({ flex: 1, opacity: ripple ? 1 : pressedOpacity(pressed) })}
    >
      <Tile style={{ alignItems: 'center', gap: space.xs, minHeight: 72, justifyContent: 'center' }}>
        <View>
          <Icon name={icon} />
          {dot ? (
            <View style={{ position: 'absolute', top: -2, right: -6 }}>
              <Dot tone="deep" size={7} />
            </View>
          ) : null}
        </View>
        <Txt variant="caption">{label}</Txt>
      </Tile>
    </Pressable>
  );
}
