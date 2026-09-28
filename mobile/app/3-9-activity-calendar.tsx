import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, RefreshControl, View } from 'react-native';
import {
  AppHeader,
  Avatar,
  Banner,
  ErrorState,
  IconButton,
  ListRow,
  Loading,
  Screen,
  Txt,
  borderWidth,
  disabledOpacity,
  pressedOpacity,
  radius,
  size,
  space,
  useRipple,
  useTheme,
} from 'design-system/src';
import { createMockClient, type ApiClient } from '../src/api/client';
import type { MOCKS } from '../src/api/mocks.generated';
import {
  canGoNextMonth,
  cellLabel,
  daySummary,
  heatLevel,
  initialDate,
  isFutureDate,
  kstToday,
  monthGrid,
  shiftMonth,
  type CalendarCell,
  type HeatLevel,
} from '../src/crew/calendar';
import { formatDistance } from '../src/format';

type MockDay = (typeof MOCKS)['GET /crew/calendar']['data']['days'][number];
/** 목의 example 은 리터럴 타입이라 수치를 number 로 넓힌다 */
type Day = Omit<MockDay, 'items' | 'activityCount' | 'activities'> & {
  items: number;
  activityCount: number;
  activities: readonly MockDay['activities'][number][];
};
type Calendar = { days: readonly Day[] };

const api: ApiClient = createMockClient({ delayMs: 300 });
const WEEK = ['일', '월', '화', '수', '목', '금', '토'];

export default function ActivityCalendarScreen() {
  const today = kstToday();
  const [month, setMonth] = useState(today.slice(0, 7));
  const [calendar, setCalendar] = useState<Calendar | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [meId, setMeId] = useState<string | null>(null);
  const latestMonth = useRef(month);

  const load = useCallback(
    async (m: string, mode: 'first' | 'pull') => {
      if (mode === 'pull') setRefreshing(true);
      try {
        const { data } = await api.get('GET /crew/calendar', { month: m });
        if (m !== latestMonth.current) return;
        setCalendar(data);
        setFailed(false);
        // 새로고침은 고른 날짜를 유지한다
        if (mode === 'first') setSelected(initialDate(m, data.days, today));
      } catch {
        if (m === latestMonth.current) setFailed(true);
      } finally {
        setRefreshing(false);
      }
    },
    [today],
  );

  useEffect(() => {
    api.get('GET /users/me').then(({ data }) => setMeId(data.id)).catch(() => {});
  }, []);

  useEffect(() => {
    latestMonth.current = month;
    setCalendar(null);
    setFailed(false);
    void load(month, 'first');
  }, [month, load]);

  const [year, monthNumber] = month.split('-').map(Number);
  const nextEnabled = canGoNextMonth(month, today);
  const day: Day | undefined = calendar?.days.find((d) => d.date === selected);

  const openUser = (id: string) =>
    id === meId ? router.push('/(tabs)/profile') : router.push({ pathname: '/5-4-user-profile', params: { id } });

  return (
    <Screen
      scroll
      refreshControl={calendar ? <RefreshControl refreshing={refreshing} onRefresh={() => load(month, 'pull')} /> : undefined}
    >
      <AppHeader title="활동 달력" onBack={() => router.back()} />

      <View
        style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.md }}
        accessibilityLabel={`${year}년 ${monthNumber}월`}
      >
        <IconButton icon="chevron-left" label="이전 달" onPress={() => setMonth(shiftMonth(month, -1))} />
        <Txt variant="section" bold>{`${year}년 ${monthNumber}월`}</Txt>
        <IconButton icon="chevron-right" label="다음 달" disabled={!nextEnabled} onPress={() => setMonth(shiftMonth(month, 1))} />
      </View>

      {!calendar ? (
        failed ? (
          <ErrorState title="활동 달력을 불러오지 못했어요" onRetry={() => load(month, 'first')} />
        ) : (
          <Loading label="활동 달력을 불러오고 있어요" />
        )
      ) : (
        <>
          {failed ? <Banner tone="warn">인터넷 연결을 확인해 주세요.</Banner> : null}
          <MonthGrid
            cells={monthGrid(month, calendar.days)}
            maxItems={Math.max(0, ...calendar.days.map((d) => d.items))}
            selected={selected}
            today={today}
            onSelect={setSelected}
          />

          {calendar.days.every((d) => d.activityCount === 0) ? (
            <Txt variant="body" tone="muted">이 달에는 활동 기록이 없어요.</Txt>
          ) : selected ? (
            <View style={{ gap: space.xs }}>
              <Txt variant="subtitle" bold>
                {daySummary(day ?? { date: selected, items: 0, activityCount: 0 })}
              </Txt>
              {!day || day.activityCount === 0 ? (
                <Txt variant="body" tone="muted">이 날에는 활동 기록이 없어요.</Txt>
              ) : day.activities.length === 0 ? (
                <Txt variant="body" tone="muted">표시할 활동 기록이 없어요.</Txt>
              ) : (
                day.activities.map((a, i) => (
                  <ListRow
                    key={a.activityId}
                    divider={i < day.activities.length - 1}
                    title={a.user.nickname}
                    subtitle={`${a.items}개 · ${formatDistance(a.distanceM)}`}
                    accessibilityLabel={`${a.user.nickname}, ${a.items}개, ${formatDistance(a.distanceM)}`}
                    left={
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`${a.user.nickname}, 프로필 보기`}
                        hitSlop={space.sm}
                        onPress={() => openUser(a.user.id)}
                      >
                        <Avatar name={a.user.nickname} uri={a.user.photoUrl ?? undefined} size="sm" />
                      </Pressable>
                    }
                    onPress={() => router.push({ pathname: '/5-3-activity-detail', params: { id: a.activityId } })}
                  />
                ))
              )}
            </View>
          ) : null}
        </>
      )}
    </Screen>
  );
}

function MonthGrid({
  cells,
  maxItems,
  selected,
  today,
  onSelect,
}: {
  cells: CalendarCell[];
  maxItems: number;
  selected: string | null;
  today: string;
  onSelect: (date: string) => void;
}) {
  const { colors } = useTheme();
  const heat: Record<HeatLevel, string> = { 0: colors.transparent, 1: colors.lime28, 2: colors.lime35, 3: colors.lime };
  const weeks = Array.from({ length: 6 }, (_, w) => cells.slice(w * 7, w * 7 + 7));

  return (
    <View style={{ gap: space.xs }}>
      <View style={{ flexDirection: 'row' }} importantForAccessibility="no-hide-descendants">
        {WEEK.map((w) => (
          <Txt key={w} variant="caption" tone="muted" style={{ flex: 1, textAlign: 'center' }}>{w}</Txt>
        ))}
      </View>
      {weeks.map((week) => (
        <View key={week[0].date} style={{ flexDirection: 'row' }}>
          {week.map((cell) => (
            <DayCell
              key={cell.date}
              cell={cell}
              fill={heat[heatLevel(cell.items, maxItems, cell.activityCount)]}
              selected={cell.date === selected}
              isToday={cell.date === today}
              future={isFutureDate(cell.date, today)}
              label={cellLabel(cell, today)}
              onPress={() => onSelect(cell.date)}
            />
          ))}
        </View>
      ))}
    </View>
  );
}

function DayCell({
  cell,
  fill,
  selected,
  isToday,
  future,
  label,
  onPress,
}: {
  cell: CalendarCell;
  fill: string;
  selected: boolean;
  isToday: boolean;
  future: boolean;
  label: string;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const ripple = useRipple();
  // 앞뒤 달 칸은 자리만 차지한다 — 그 달의 응답에 없는 날짜다
  if (!cell.inMonth) return <View style={{ flex: 1, minHeight: size.minTouch }} />;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected, disabled: future }}
      disabled={future}
      onPress={onPress}
      android_ripple={ripple}
      style={({ pressed }) => ({ flex: 1, minHeight: size.minTouch, padding: space.xs / 2, opacity: future ? disabledOpacity : pressedOpacity(pressed) })}
    >
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: radius.field,
          backgroundColor: selected ? colors.deep : fill,
          borderWidth: isToday ? borderWidth.focus : 0,
          borderColor: colors.deep,
        }}
      >
        <Txt variant="caption" tone={selected ? 'onDark' : 'ink'} bold={cell.activityCount > 0}>
          {Number(cell.date.slice(8))}
        </Txt>
      </View>
    </Pressable>
  );
}
