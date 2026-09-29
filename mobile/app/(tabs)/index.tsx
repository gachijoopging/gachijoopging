import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Image, Pressable, RefreshControl, View } from 'react-native';
import {
  Avatar,
  Button,
  Card,
  Appear,
  Chip,
  Dot,
  ErrorState,
  IconButton,
  IconCircle,
  Loading,
  Screen,
  Snackbar,
  Txt,
  pressedOpacity,
  radius,
  size,
  space,
  useRipple,
  useTheme,
} from 'design-system/src';
import { createMockClient, type ApiClient } from '../../src/api/client';
import { MOCKS } from '../../src/api/mocks.generated';
import { characterBubble, myCategorySummary } from '../../src/home/home';

type Home = (typeof MOCKS)['GET /crew/home']['data'];

const api: ApiClient = createMockClient({ delayMs: 300 });
const wordmark = require('../../../design-system/assets/logo-wordmark.png');
const wordmarkDark = require('../../../design-system/assets/logo-wordmark-dark.png');
// ponytail: 단계별 그림은 GAC-34. 그전까지 새싹 한 장에 단계 이름만 붙인다
const sprout = require('../../../design-system/assets/character/sprout.png');
const STAGE_NAME = ['축 처짐', '보통', '신남', '반짝', '파티'] as const;
const BUBBLE_MS = 3000;

export default function HomeScreen() {
  const { scheme } = useTheme();
  const [home, setHome] = useState<Home | null>(null);
  const [failed, setFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshFailed, setRefreshFailed] = useState(false);

  const load = useCallback(async (mode: 'quiet' | 'pull') => {
    if (mode === 'pull') setRefreshing(true);
    try {
      const res = await api.get('GET /crew/home');
      setHome(res.data);
      setFailed(false);
    } catch {
      setFailed(true);
      if (mode === 'pull') setRefreshFailed(true);
    } finally {
      setRefreshing(false);
    }
  }, []);

  // 탭 복귀·다른 화면에서 뒤로 올 때도 조용히 다시 받는다
  useFocusEffect(useCallback(() => void load('quiet'), [load]));

  const unread = home?.unreadNotifications ?? 0;

  return (
    <Screen scroll refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load('pull')} />}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        <View style={{ flex: 1, gap: space.xs }}>
          <Image source={scheme === 'dark' ? wordmarkDark : wordmark} accessible={false} resizeMode="contain" style={{ width: 110, height: (110 * 301) / 840 }} />
          <Txt variant="caption" tone="muted">오늘도 가볍게 한 바퀴</Txt>
        </View>
        <Chip
          label={home?.crew.name ?? ' '}
          icon="chevron-down"
          iconEnd
          accessibilityLabel={home ? `${home.crew.name}, 크루 정보 보기` : undefined}
          disabled={!home}
          onPress={() => router.push('/3-2-crew-info')}
        />
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

      {failed && home ? (
        <Card style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
          <IconCircle icon="exclamation" tone="neutral" size="sm" />
          <View style={{ flex: 1 }}>
            <Txt variant="body" bold>줍기 현황을 불러오지 못했어요</Txt>
            <Txt variant="caption" tone="muted">네트워크 연결을 확인하고 다시 시도해 주세요.</Txt>
          </View>
          <Button label="다시 시도" variant="ghost" size="sm" onPress={() => load('quiet')} />
        </Card>
      ) : null}

      {home ? <HomeCards home={home} /> : failed ? <ErrorState onRetry={() => load('quiet')} /> : <Loading />}

      <Snackbar visible={refreshFailed} message="새로고침에 실패했어요" onDismiss={() => setRefreshFailed(false)} />
    </Screen>
  );
}

function HomeCards({ home }: { home: Home }) {
  const { last7d, character, live } = home;
  return (
    <>
      <Card
        onPress={() => router.navigate({ pathname: '/(tabs)/crew', params: { tab: 'records' } })}
        accessibilityLabel={`최근 7일 우리 크루가 주운 쓰레기, ${last7d.crewItems}개, 크루 기록 보기`}
        style={{ gap: space.sm }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
          <IconCircle icon="lightning-bolt" tone="deep" size="sm" />
          <Txt variant="body">최근 7일 우리 크루가 주운 쓰레기</Txt>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}>
          <View style={{ gap: space.xs }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
              <Txt variant="counter">{last7d.crewItems}</Txt>
              <Chip label="개" />
            </View>
            <Txt variant="caption" tone="muted">크루 기록 보기 ›</Txt>
          </View>
          <View style={{ alignItems: 'center', gap: space.xs }}>
            <Sparkline values={last7d.daily} />
            <Txt variant="micro" tone="muted">최근 7일</Txt>
          </View>
        </View>
      </Card>

      <CrewCharacter character={character} />

      <View style={{ flexDirection: 'row', gap: space.md }}>
        <Card
          style={{ flex: 1, gap: space.xs }}
          onPress={() => router.push('/2-2-active-crew-members')}
          accessibilityLabel={`지금 활동 중인 크루원, ${live.count}명${live.count > 0 ? ', 목록 보기' : ''}`}
        >
          <Txt variant="caption" tone="muted">{'지금 활동 중인\n크루원'}</Txt>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Txt variant="display">{live.count}</Txt>
            <View style={{ flexDirection: 'row' }} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
              {live.users.slice(0, 3).map((u, i) => (
                <View key={u.id} style={{ marginLeft: i === 0 ? 0 : -space.sm }}>
                  <Avatar size="sm" name={u.nickname} uri={u.photoUrl ?? undefined} />
                </View>
              ))}
            </View>
          </View>
          <Txt variant="caption" bold>{live.count > 0 ? '목록 보기 ›' : '지금 뛰는 크루원이 없어요'}</Txt>
        </Card>

        <Card
          style={{ flex: 1, gap: space.xs }}
          accessible
          accessibilityLabel={`최근 7일 내가 주운 쓰레기, ${last7d.myItems}개, ${myCategorySummary(last7d.myByCategory).replaceAll(' · ', ', ')}`}
        >
          <Txt variant="caption" tone="muted">{'최근 7일\n내가 주운 쓰레기'}</Txt>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Txt variant="display">{last7d.myItems}</Txt>
            <IconCircle icon="delete-outline" tone="orange" size="sm" />
          </View>
          <Txt variant="caption" bold numberOfLines={2}>{myCategorySummary(last7d.myByCategory)}</Txt>
        </Card>
      </View>
    </>
  );
}

function Sparkline({ values }: { values: readonly number[] }) {
  const { colors } = useTheme();
  const max = Math.max(1, ...values);
  const HEIGHT = 32;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: space.xs, height: HEIGHT }} accessible={false}>
      {values.map((v, i) => (
        // 0 은 트랙 색 바닥으로 남긴다 — BarChart 와 같이 "쉰 날"로 읽혀야 데이터 막대와 헷갈리지 않는다
        <View key={i} style={{ width: 6, height: v > 0 ? Math.max(2, (v / max) * HEIGHT) : 2, borderRadius: radius.pill, backgroundColor: v > 0 ? colors.deep : colors.track }} />
      ))}
    </View>
  );
}

function CrewCharacter({ character }: { character: Home['character'] }) {
  const ripple = useRipple();
  const [bubble, setBubble] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const toggle = () => {
    clearTimeout(timer.current);
    if (bubble) return setBubble(false);
    setBubble(true);
    timer.current = setTimeout(() => setBubble(false), BUBBLE_MS);
  };
  const stageName = STAGE_NAME[character.stage - 1] ?? STAGE_NAME[0];

  return (
    <Pressable
      onPress={toggle}
      android_ripple={ripple}
      accessibilityRole="button"
      accessibilityLabel={`크루 캐릭터, ${stageName}`}
      accessibilityHint="목표 진행을 들으려면 두 번 탭"
      style={({ pressed }) => ({ alignItems: 'center', gap: space.sm, paddingVertical: space.lg, borderRadius: radius.card, overflow: 'hidden', opacity: pressedOpacity(pressed) })}
    >
      <Image source={sprout} resizeMode="contain" style={{ width: size.character, height: size.character }} />
      <Txt variant="caption" tone="muted">단계 {character.stage} · {stageName}</Txt>
      {/* 말풍선이 뜨고 질 때 아래 카드가 밀리지 않도록 캐릭터 위에 띄운다. 캐릭터 쪽(아래)에서 솟아 같은 길로 들어간다 */}
      <Appear visible={bubble} style={{ position: 'absolute', top: space.sm }}>
        <View accessibilityLiveRegion="polite">
          <Chip label={characterBubble(character)} tone="neutral" />
        </View>
      </Appear>
    </Pressable>
  );
}
