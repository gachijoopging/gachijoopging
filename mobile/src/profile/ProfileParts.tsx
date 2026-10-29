import { useCallback, useEffect, useRef, useState } from 'react';
import { Image, Pressable, View } from 'react-native';
import {
  Card,
  Chip,
  Icon,
  IconButton,
  IconCircle,
  MetricSplit,
  Thumb,
  Tile,
  Txt,
  pressedOpacity,
  radius,
  size as sizes,
  space,
  useRipple,
  useTheme,
} from 'design-system/src';
import type { MOCKS } from '../api/mocks.generated';
import type { components } from '../api/contract.generated';
import { kstToday } from '../crew/calendar';
import { spokenDistance, withCommas } from '../crew/records';
import { formatDistance, formatElapsed } from '../format';
import { activeDaysGrid, activityTitle } from './profile';

export type ActivityCard = components['schemas']['ActivityCard'];
export type Post = (typeof MOCKS)['GET /crew/members/{userId}/posts']['data']['items'][number];
export type Stats = { totalActivities: number; totalDistanceM: number; totalItems: number };
type Page<T> = { items: readonly T[]; nextCursor: string | null };

export function statsLabel(s: Stats): string {
  return `누적 활동 ${s.totalActivities}회, 거리 ${spokenDistance(s.totalDistanceM)}, 개수 ${withCommas(s.totalItems)}개`;
}

export function StatsTile({ stats }: { stats: Stats | null }) {
  return (
    <Tile>
      <MetricSplit
        items={[
          { value: stats ? String(stats.totalActivities) : '…', label: '활동' },
          { value: stats ? formatDistance(stats.totalDistanceM) : '…', label: '거리' },
          { value: stats ? withCommas(stats.totalItems) : '…', label: '개수' },
        ]}
        accessibilityLabel={stats ? statsLabel(stats) : '누적 수치를 불러오지 못했어요'}
      />
    </Tile>
  );
}

export function ActivityCardView({ card, onPress, onMenu }: { card: ActivityCard; onPress: () => void; onMenu?: () => void }) {
  const title = activityTitle(card.startedAt);
  const empty = card.itemCount === 0;
  const label = `${title}, ${card.itemCount}개, ${formatElapsed(card.durationSec)}, ${spokenDistance(card.distanceM)}${empty ? ', 줍기 기록 없음' : ''}, 활동 기록 상세로 이동`;
  return (
    <View>
      <Card onPress={onPress} accessibilityLabel={label}>
        <View style={{ gap: space.sm }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: sizes.iconButton }}>
            {card.thumbUrl ? (
              <Thumb uri={card.thumbUrl} size="sm" />
            ) : (
              <IconCircle icon="sprout" tone="tint" size="md" />
            )}
            <Txt variant="body" bold style={{ flex: 1, marginRight: onMenu ? sizes.iconButton : 0 }}>{title}</Txt>
          </View>
          <MetricSplit
            items={[
              { value: String(card.itemCount), label: '개수' },
              { value: formatElapsed(card.durationSec), label: '시간' },
              { value: formatDistance(card.distanceM), label: '거리' },
            ]}
          />
          {empty ? <Chip label="줍기 기록 없음" tone="neutral" /> : null}
        </View>
      </Card>
      {/* 카드 전체가 한 버튼이라 안에 두면 스크린리더가 닿지 못한다. 카드 밖 형제로 겹쳐 따로 읽히게 한다 */}
      {onMenu ? (
        <View style={{ position: 'absolute', top: space.md, right: space.md }}>
          <IconButton icon="dots-horizontal" label="기록 관리" onPress={onMenu} />
        </View>
      ) : null}
    </View>
  );
}

/** 프로필 게시물 격자의 한 칸. 세 칸 격자를 이루도록 폭의 1/3 을 차지한다 */
export function PostTile({ post: p, onOpen }: { post: Post; onOpen: (id: string) => void }) {
  const { colors } = useTheme();
  const ripple = useRipple();
  const [broken, setBroken] = useState(false);
  const thumb = p.media[0]?.thumbUrl;
  const isPrivate = (p.visibility as string) === 'PRIVATE';
  const label = ['게시물', thumb ? '사진' : p.text.slice(0, 40), isPrivate ? '나만 보기' : ''].filter(Boolean).join(', ');
  return (
    <View style={{ width: '33.333%', aspectRatio: 1, padding: space.xs / 2 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        android_ripple={ripple}
        onPress={() => onOpen(p.id)}
        style={({ pressed }) => ({
          flex: 1,
          borderRadius: radius.tile,
          overflow: 'hidden',
          // tint 는 bg 를 묽힌 색이라 화면 배경 위에서는 사라진다. 기록 카드와 같은 surface 로 칸을 세운다
          backgroundColor: colors.surface,
          justifyContent: 'center',
          padding: thumb ? 0 : space.sm,
          opacity: pressedOpacity(pressed),
        })}
      >
        {thumb && !broken ? (
          <Image source={{ uri: thumb }} accessible={false} onError={() => setBroken(true)} style={{ width: '100%', height: '100%' }} />
        ) : thumb ? (
          // 사진을 못 받으면 빈 칸 대신 Thumb 과 같은 자리 표시를 둔다
          <View style={{ alignItems: 'center' }}><Icon name="image-outline" size={sizes.thumbMd / 2} color={colors.inkFaint} /></View>
        ) : (
          <Txt variant="micro" tone="muted" numberOfLines={5} style={{ textAlign: 'center' }}>{p.text}</Txt>
        )}
        {/* 칸이 손가락 두 개 폭이라 글자 칩은 본문을 덮는다. 자물쇠만 모서리에 두고 뜻은 라벨이 읽는다 */}
        {isPrivate ? (
          <View style={{ position: 'absolute', right: space.xs, top: space.xs, padding: space.xs / 2, borderRadius: radius.pill, backgroundColor: colors.photoBadge }}>
            <Icon name="lock-outline" size={14} color={colors.onPhoto} />
          </View>
        ) : null}
      </Pressable>
    </View>
  );
}

export function ActivityCalendar({ activeDays }: { activeDays: readonly string[] }) {
  const { colors } = useTheme();
  const grid = activeDaysGrid(activeDays, kstToday());
  const count = grid.flat().filter((c) => c?.active).length;
  const gap = space.xs / 2;
  // 빈 날 칸(tint)은 surface 위에서만 보인다. 카드에 얹지 않으면 활동한 날만 허공에 떠 보인다
  return (
    <Card>
      <View accessible accessibilityLabel={`최근 6개월 활동 달력, ${count}일 활동`} style={{ flexDirection: 'row', gap }}>
        {grid.map((week, w) => (
          <View key={w} style={{ flex: 1, gap }}>
            {week.map((cell, d) => (
              <View
                key={d}
                style={{
                  aspectRatio: 1,
                  borderRadius: gap,
                  // lime 은 surface 위 1.41:1 이라 칸으로 안 보인다. 카드 위 표시는 deep 으로
                  backgroundColor: cell == null ? 'transparent' : cell.active ? colors.deep : colors.tint,
                }}
              />
            ))}
          </View>
        ))}
      </View>
    </Card>
  );
}

/** 커서 목록. 끝에 닿으면 다음 장을 이어 받고, 새로고침은 첫 장부터 다시 받는다 */
export function usePaged<T extends { id: string }>(fetchPage: (cursor: string | null) => Promise<Page<T>>, key = '') {
  const [items, setItems] = useState<readonly T[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [moreFailed, setMoreFailed] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const cursor = useRef<string | null>(null);
  const generation = useRef(0);
  const activeKey = useRef(key);
  const morePending = useRef(false);
  const fetcher = useRef(fetchPage);
  fetcher.current = fetchPage;
  if (activeKey.current !== key) {
    activeKey.current = key;
    generation.current += 1;
    cursor.current = null;
    morePending.current = false;
  }
  useEffect(() => {
    setItems(null);
    setFailed(false);
    setMoreFailed(false);
    setLoadingMore(false);
  }, [key]);
  useEffect(() => () => { generation.current += 1; }, []);

  const reload = useCallback(async () => {
    const request = ++generation.current;
    cursor.current = null;
    morePending.current = false;
    setLoadingMore(false);
    setMoreFailed(false);
    try {
      const page = await fetcher.current(null);
      if (request !== generation.current) return true;
      setItems(page.items);
      cursor.current = page.nextCursor;
      setFailed(false);
      return true;
    } catch {
      if (request !== generation.current) return true;
      setFailed(true);
      return false;
    }
  }, []);

  const loadMore = useCallback(async () => {
    const next = cursor.current;
    if (!next || morePending.current) return;
    const request = generation.current;
    morePending.current = true;
    setLoadingMore(true);
    try {
      const page = await fetcher.current(next);
      if (request !== generation.current || next !== cursor.current) return;
      setItems((prev) => [...(prev ?? []), ...page.items.filter((i) => !prev?.some((p) => p.id === i.id))]);
      cursor.current = page.nextCursor;
      setMoreFailed(false);
    } catch {
      if (request === generation.current && next === cursor.current) setMoreFailed(true);
    } finally {
      if (request === generation.current) {
        morePending.current = false;
        setLoadingMore(false);
      }
    }
  }, []);

  const remove = useCallback((id: string) => setItems((prev) => prev?.filter((i) => i.id !== id) ?? prev), []);

  return { items, failed, moreFailed, loadingMore, hasMore: () => cursor.current != null, reload, loadMore, remove };
}
