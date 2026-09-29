import { useCallback, useRef, useState } from 'react';
import { Image, Pressable, View } from 'react-native';
import {
  Card,
  Chip,
  IconButton,
  IconCircle,
  MetricSplit,
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
import { kstToday } from '../crew/calendar';
import { spokenDistance, withCommas } from '../crew/records';
import { formatDistance, formatElapsed } from '../format';
import { activeDaysGrid, activityTitle } from './profile';

export type ActivityCard = (typeof MOCKS)['GET /users/me/activities']['data']['items'][number];
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
          { value: stats ? String(stats.totalActivities) : '—', label: '활동' },
          { value: stats ? formatDistance(stats.totalDistanceM) : '—', label: '거리' },
          { value: stats ? withCommas(stats.totalItems) : '—', label: '개수' },
        ]}
        accessibilityLabel={stats ? statsLabel(stats) : '누적 수치를 불러오지 못했어요'}
      />
    </Tile>
  );
}

export function ActivityCardView({ card, onPress, onDelete }: { card: ActivityCard; onPress: () => void; onDelete?: () => void }) {
  const { colors } = useTheme();
  const title = activityTitle(card.startedAt);
  const empty = card.itemCount === 0;
  const label = `${title}, ${card.itemCount}개, ${formatElapsed(card.durationSec)}, ${spokenDistance(card.distanceM)}${empty ? ', 줍기 기록 없음' : ''}, 활동 기록 상세로 이동`;
  return (
    <View>
      <Card onPress={onPress} accessibilityLabel={label}>
        <View style={{ gap: space.sm }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: sizes.iconButton }}>
            {card.thumbUrl ? (
              <Image
                source={{ uri: card.thumbUrl }}
                accessible={false}
                style={{ width: sizes.iconCircleMd, height: sizes.iconCircleMd, borderRadius: radius.pill, backgroundColor: colors.tint }}
              />
            ) : (
              <IconCircle icon="sprout" tone="tint" size="md" />
            )}
            <Txt variant="body" bold style={{ flex: 1, marginRight: onDelete ? sizes.iconButton : 0 }}>{title}</Txt>
          </View>
          <MetricSplit
            items={[
              { value: String(card.itemCount), label: '개수' },
              { value: formatElapsed(card.durationSec), label: '시간' },
              { value: formatDistance(card.distanceM), label: '거리' },
            ]}
            accessibilityLabel={label}
          />
          {empty ? <Chip label="줍기 기록 없음" tone="neutral" /> : null}
        </View>
      </Card>
      {/* 카드 전체가 한 버튼이라 안에 두면 스크린리더가 닿지 못한다. 카드 밖 형제로 겹쳐 따로 읽히게 한다 */}
      {onDelete ? (
        <View style={{ position: 'absolute', top: space.md, right: space.md }}>
          <IconButton icon="dots-horizontal" label="기록 삭제" onPress={onDelete} />
        </View>
      ) : null}
    </View>
  );
}

export function PostGrid({ posts, onOpen }: { posts: readonly Post[]; onOpen: (id: string) => void }) {
  const { colors } = useTheme();
  const ripple = useRipple();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', margin: -space.xs / 2 }}>
      {posts.map((p) => {
        const thumb = p.media[0]?.thumbUrl;
        const isPrivate = (p.visibility as string) === 'PRIVATE';
        const label = ['게시물', thumb ? '사진' : p.text.slice(0, 40), isPrivate ? '나만 보기' : ''].filter(Boolean).join(', ');
        return (
          <View key={p.id} style={{ width: '33.333%', aspectRatio: 1, padding: space.xs / 2 }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={label}
              android_ripple={ripple}
              onPress={() => onOpen(p.id)}
              style={({ pressed }) => ({
                flex: 1,
                borderRadius: radius.tile,
                overflow: 'hidden',
                backgroundColor: colors.tint,
                justifyContent: 'center',
                padding: thumb ? 0 : space.sm,
                opacity: pressedOpacity(pressed),
              })}
            >
              {thumb ? (
                <Image source={{ uri: thumb }} accessible={false} style={{ width: '100%', height: '100%' }} />
              ) : (
                <Txt variant="micro" tone="muted" numberOfLines={5} style={{ textAlign: 'center' }}>{p.text}</Txt>
              )}
              {isPrivate ? (
                <View style={{ position: 'absolute', left: space.xs, bottom: space.xs }}>
                  <Chip label="🔒 나만 보기" tone="overlay" accessibilityLabel="나만 보기" />
                </View>
              ) : null}
            </Pressable>
          </View>
        );
      })}
    </View>
  );
}

/** 26주×7일 활동 달력. 칸 하나하나는 읽지 않고 요약 한 줄로 읽힌다 */
export function ActivityCalendar({ activeDays }: { activeDays: readonly string[] }) {
  const { colors } = useTheme();
  const grid = activeDaysGrid(activeDays, kstToday());
  const count = grid.flat().filter((c) => c?.active).length;
  const gap = space.xs / 2;
  return (
    <View accessible accessibilityLabel={`최근 6개월 활동 달력, ${count}일 활동`} style={{ flexDirection: 'row', gap }}>
      {grid.map((week, w) => (
        <View key={w} style={{ flex: 1, gap }}>
          {week.map((cell, d) => (
            <View
              key={d}
              style={{
                aspectRatio: 1,
                borderRadius: gap,
                backgroundColor: cell == null ? 'transparent' : cell.active ? colors.lime : colors.tint,
              }}
            />
          ))}
        </View>
      ))}
    </View>
  );
}

/** 커서 목록. 끝에 닿으면 다음 장을 이어 받고, 새로고침은 첫 장부터 다시 받는다 */
export function usePaged<T extends { id: string }>(fetchPage: (cursor: string | null) => Promise<Page<T>>) {
  const [items, setItems] = useState<readonly T[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [moreFailed, setMoreFailed] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const cursor = useRef<string | null>(null);
  const fetcher = useRef(fetchPage);
  fetcher.current = fetchPage;

  const reload = useCallback(async () => {
    try {
      const page = await fetcher.current(null);
      setItems(page.items);
      cursor.current = page.nextCursor;
      setFailed(false);
      return true;
    } catch {
      setFailed(true);
      return false;
    }
  }, []);

  const loadMore = useCallback(async () => {
    if (!cursor.current || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await fetcher.current(cursor.current);
      setItems((prev) => [...(prev ?? []), ...page.items.filter((i) => !prev?.some((p) => p.id === i.id))]);
      cursor.current = page.nextCursor;
      setMoreFailed(false);
    } catch {
      setMoreFailed(true);
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore]);

  const remove = useCallback((id: string) => setItems((prev) => prev?.filter((i) => i.id !== id) ?? prev), []);

  return { items, failed, moreFailed, loadingMore, hasMore: () => cursor.current != null, reload, loadMore, remove };
}

/** ScrollView onScroll 에서 바닥 근처인지 */
export function nearBottom({ layoutMeasurement, contentOffset, contentSize }: {
  layoutMeasurement: { height: number };
  contentOffset: { y: number };
  contentSize: { height: number };
}): boolean {
  return layoutMeasurement.height + contentOffset.y >= contentSize.height - 200;
}
