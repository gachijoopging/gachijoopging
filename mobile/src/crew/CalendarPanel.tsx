import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import {
  Avatar,
  Banner,
  Card,
  Dot,
  ErrorState,
  IconButton,
  ListRow,
  Loading,
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
import { createMockClient, type ApiClient } from '../api/client';
import type { MOCKS } from '../api/mocks.generated';
import {
  HEAT_OPACITY,
  canGoNextMonth,
  cellLabel,
  cellMark,
  daySummary,
  heatLevel,
  initialDate,
  isFutureDate,
  kstToday,
  monthGrid,
  shiftMonth,
  type CalendarCell,
  type HeatLevel,
} from '../crew/calendar';
import { formatDistance } from '../format';

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

/** 3-1 모이깅의 달력 탭. refreshKey 가 바뀌면 보던 달을 다시 받는다(당겨서 새로고침) */
export function CalendarPanel({ refreshKey }: { refreshKey: number }) {
  const today = kstToday();
  const [month, setMonth] = useState(today.slice(0, 7));
  const [calendar, setCalendar] = useState<Calendar | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [meId, setMeId] = useState<string | null>(null);
  const latestMonth = useRef(month);

  const load = useCallback(
    async (m: string, mode: 'first' | 'pull') => {
      try {
        const { data } = await api.get('GET /crew/calendar', { month: m });
        if (m !== latestMonth.current) return;
        setCalendar(data);
        setFailed(false);
        // 새로고침은 고른 날짜를 유지한다
        if (mode === 'first') setSelected(initialDate(m, data.days, today));
      } catch {
        if (m === latestMonth.current) setFailed(true);
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

  // 탭을 바꿔 새로 붙을 때는 위의 첫 조회로 충분하다. 붙은 뒤 바뀐 refreshKey 만 다시 받는다
  const mountedKey = useRef(refreshKey);
  useEffect(() => {
    if (refreshKey !== mountedKey.current) void load(latestMonth.current, 'pull');
  }, [refreshKey, load]);

  const [year, monthNumber] = month.split('-').map(Number);
  const nextEnabled = canGoNextMonth(month, today);
  const day: Day | undefined = calendar?.days.find((d) => d.date === selected);

  const openUser = (id: string) =>
    id === meId ? router.push('/(tabs)/profile') : router.push({ pathname: '/users/[id]', params: { id } });

  return (
    <View style={{ gap: space.md }}>
      {calendar && failed ? <Banner tone="warn">인터넷 연결을 확인해 주세요.</Banner> : null}
      {/* 월 이동은 그 달의 격자를 바꾸는 조작이라 격자와 같은 카드에 둔다 */}
      <Card style={{ gap: space.sm }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <IconButton icon="chevron-left" label="이전 달" onPress={() => setMonth(shiftMonth(month, -1))} />
          <Txt variant="section" bold accessibilityRole="header">{`${year}년 ${monthNumber}월`}</Txt>
          <IconButton icon="chevron-right" label="다음 달" disabled={!nextEnabled} onPress={() => setMonth(shiftMonth(month, 1))} />
        </View>
        {calendar ? (
          <MonthGrid
            cells={monthGrid(month, calendar.days)}
            maxItems={Math.max(0, ...calendar.days.map((d) => d.items))}
            selected={selected}
            today={today}
            onSelect={setSelected}
          />
        ) : failed ? (
          <ErrorState title="활동 달력을 불러오지 못했어요" onRetry={() => load(month, 'first')} />
        ) : (
          <Loading label="활동 달력을 불러오고 있어요" />
        )}
      </Card>

      {!calendar ? null : (
        <>

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
                    accessibilityActions={[{ name: 'profile', label: '프로필 보기' }]}
                    onAccessibilityAction={() => openUser(a.user.id)}
                    left={
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`${a.user.nickname}, 프로필 보기`}
                        hitSlop={space.md}
                        onPress={() => openUser(a.user.id)}
                      >
                        <Avatar name={a.user.nickname} uri={a.user.photoUrl ?? undefined} size="sm" />
                      </Pressable>
                    }
                    onPress={() => router.push({ pathname: '/records/[id]', params: { id: a.activityId } })}
                  />
                ))
              )}
            </View>
          ) : null}
        </>
      )}
    </View>
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
  // 격자는 늘 6주지만, 그 달 날짜가 하나도 없는 마지막 주는 빈 줄이라 그리지 않는다
  const weeks = Array.from({ length: 6 }, (_, w) => cells.slice(w * 7, w * 7 + 7)).filter((week) =>
    week.some((c) => c.inMonth),
  );

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
              heat={heatLevel(cell.items, maxItems, cell.activityCount)}
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
  heat,
  selected,
  isToday,
  future,
  label,
  onPress,
}: {
  cell: CalendarCell;
  heat: HeatLevel;
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
  const mark = cellMark(heat, selected);
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
          overflow: 'hidden',
          backgroundColor: selected ? colors.deep : undefined,
          borderWidth: isToday ? borderWidth.focus : 0,
          borderColor: colors[mark],
        }}
      >
        {!selected && heat > 0 ? (
          // 라임 한 색을 불투명도로 세 단계 나눈다. 숫자는 그 위에 있어 흐려지지 않는다
          <View style={{ position: 'absolute', inset: 0, backgroundColor: colors.lime, opacity: HEAT_OPACITY[heat] }} />
        ) : null}
        <Txt variant="caption" tone={mark} bold={cell.activityCount > 0}>
          {Number(cell.date.slice(8))}
        </Txt>
        {/* 라임 농도끼리는 대비가 1.1:1 이라 색만으로 단계를 못 읽는다(SC 1.4.1). 점 개수로 한 번 더 말한다.
            점이 없는 날도 줄 높이를 남겨 숫자 위치가 칸마다 흔들리지 않게 한다 */}
        <View style={{ flexDirection: 'row', gap: space.xs / 2, height: space.xs }}>
          {Array.from({ length: heat }, (_, i) => (
            <Dot key={i} size={space.xs} tone={mark === 'onDark' ? 'onDeep' : mark} />
          ))}
        </View>
      </View>
    </Pressable>
  );
}
