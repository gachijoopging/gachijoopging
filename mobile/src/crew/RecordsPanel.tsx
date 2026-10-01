import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import {
  Avatar,
  Badge,
  Banner,
  BarChart,
  Card,
  Chip,
  EmptyState,
  ErrorState,
  ListRow,
  Loading,
  MetricSplit,
  Txt,
  space,
} from 'design-system/src';
import { createMockClient, type ApiClient } from '../api/client';
import type { MOCKS } from '../api/mocks.generated';
import { RANGE_LABEL, categoryChips, chartSlots, seriesSummary, spokenDistance, totalsLabel, withCommas, type StatsRange } from './records';
import { formatDistance, formatElapsed } from '../format';
import { kstToday } from './calendar';

type Stats = (typeof MOCKS)['GET /crew/stats']['data'];

const api: ApiClient = createMockClient({ delayMs: 300 });
const RANGES: StatsRange[] = ['WEEK', 'MONTH', 'ALL'];
const RANGE_CHIP: Record<StatsRange, string> = { WEEK: '이번 주', MONTH: '이번 달', ALL: '전체' };

/** 3-1 모이깅의 기록 탭. refreshKey 가 바뀌면 보던 기간을 다시 받는다(당겨서 새로고침) */
export function RecordsPanel({ refreshKey }: { refreshKey: number }) {
  const [range, setRange] = useState<StatsRange>('WEEK');
  const [stats, setStats] = useState<Stats | null>(null);
  const [failed, setFailed] = useState(false);
  const [meId, setMeId] = useState<string | null>(null);
  const latestRange = useRef(range);

  const load = useCallback(async (r: StatsRange) => {
    try {
      const { data } = await api.get('GET /crew/stats', { range: r });
      if (r !== latestRange.current) return;
      setStats(data);
      setFailed(false);
    } catch {
      if (r === latestRange.current) setFailed(true);
    }
  }, []);

  useEffect(() => {
    api.get('GET /users/me').then(({ data }) => setMeId(data.id)).catch(() => {});
  }, []);

  useEffect(() => {
    latestRange.current = range;
    setStats(null);
    void load(range);
  }, [range, load]);

  // 탭을 바꿔 새로 붙을 때는 위의 첫 조회로 충분하다. 붙은 뒤 바뀐 refreshKey 만 다시 받는다
  const mountedKey = useRef(refreshKey);
  useEffect(() => {
    if (refreshKey !== mountedKey.current) void load(latestRange.current);
  }, [refreshKey, load]);

  const activities: number | undefined = stats?.totals.activities;
  const empty = activities === 0;

  return (
    <View style={{ gap: space.md }}>
      <View style={{ flexDirection: 'row', gap: space.sm }}>
        {RANGES.map((r) => (
          <Chip
            key={r}
            label={RANGE_CHIP[r]}
            selected={r === range}
            onPress={() => setRange(r)}
          />
        ))}
      </View>

      {!stats ? (
        failed ? (
          <ErrorState title="크루 기록을 불러오지 못했어요" onRetry={() => load(range)} />
        ) : (
          <Loading label="크루 기록을 불러오고 있어요" />
        )
      ) : (
        <>
          {failed ? <Banner tone="warn">인터넷 연결을 확인해 주세요.</Banner> : null}

          <Card style={{ gap: space.sm }}>
            <BarChart
              {...chartSlots(range, stats.series, kstToday())}
              accessibilityLabel={seriesSummary(range, stats.totals.items)}
            />
            <Txt variant="micro" tone="muted">{RANGE_LABEL[range]}</Txt>
          </Card>

          <Card>
            <MetricSplit
              items={[
                { value: `${withCommas(stats.totals.items)}개`, label: '개수' },
                { value: formatDistance(stats.totals.distanceM), label: '거리' },
                { value: formatElapsed(stats.totals.durationSec), label: '시간' },
                { value: `${stats.totals.activities}회`, label: '활동' },
              ]}
              accessibilityLabel={totalsLabel(stats.totals)}
            />
          </Card>

          {empty ? (
            <EmptyState icon="chart-box-outline" title="이 기간에는 활동 기록이 없어요" />
          ) : (
            <>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
                {categoryChips(stats.byCategory).map((c) => (
                  <Chip key={c.label} label={`${c.label} ${c.count}`} accessibilityLabel={`${c.label} ${c.count}개`} />
                ))}
              </View>

              <View>
                <Txt variant="section" bold>크루원 순위</Txt>
                {stats.ranking.map((row) => {
                  const mine = row.user.id === meId;
                  const distance = formatDistance(row.distanceM);
                  return (
                    <ListRow
                      key={row.user.id}
                      title={`${row.rank}  ${row.user.nickname}`}
                      subtitle={`${withCommas(row.items)}개 · ${distance}`}
                      left={<Avatar name={row.user.nickname} uri={row.user.photoUrl ?? undefined} size="sm" />}
                      right={mine ? <Badge label="나" tone="deep" /> : undefined}
                      chevron
                      accessibilityLabel={`${row.rank}위, ${row.user.nickname}, ${row.items}개, ${spokenDistance(row.distanceM)}, 프로필 보기`}
                      onPress={() =>
                        mine
                          ? router.push('/(tabs)/profile')
                          : router.push({ pathname: '/users/[id]', params: { id: row.user.id } })
                      }
                    />
                  );
                })}
              </View>
            </>
          )}

        </>
      )}

    </View>
  );
}

