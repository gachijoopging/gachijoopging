import { File, Paths } from 'expo-file-system';
import { router } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useCallback, useEffect, useState } from 'react';
import { RefreshControl, View } from 'react-native';
import {
  AppHeader,
  Avatar,
  Badge,
  Banner,
  BarChart,
  BottomSheet,
  Button,
  Card,
  Chip,
  EmptyState,
  ErrorState,
  Field,
  ListRow,
  Loading,
  MetricSplit,
  Screen,
  Snackbar,
  Txt,
  space,
} from 'design-system/src';
import { createMockClient, type ApiClient } from '../src/api/client';
import type { MOCKS } from '../src/api/mocks.generated';
import { exportFileName, exportRangeError, fetchCrewCsv, formatDateInput } from '../src/crew/export';
import { RANGE_LABEL, categoryChips, seriesSummary, totalsLabel, withCommas, type StatsRange } from '../src/crew/records';
import { formatDistance, formatElapsed } from '../src/format';

type Stats = (typeof MOCKS)['GET /crew/stats']['data'];

const api: ApiClient = createMockClient({ delayMs: 300 });
const RANGES: StatsRange[] = ['WEEK', 'MONTH', 'ALL'];
const RANGE_CHIP: Record<StatsRange, string> = { WEEK: '이번 주', MONTH: '이번 달', ALL: '전체' };

export default function CrewRecordsScreen() {
  const [range, setRange] = useState<StatsRange>('WEEK');
  const [stats, setStats] = useState<Stats | null>(null);
  const [failed, setFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [me, setMe] = useState<{ id: string; isLeader: boolean } | null>(null);
  const [exporting, setExporting] = useState(false);
  const [snackbar, setSnackbar] = useState<string | null>(null);

  const load = useCallback(async (r: StatsRange, mode: 'first' | 'pull') => {
    if (mode === 'pull') setRefreshing(true);
    try {
      setStats((await api.get('GET /crew/stats', { range: r })).data);
      setFailed(false);
    } catch {
      setFailed(true);
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    api
      .get('GET /users/me')
      .then(({ data }) => setMe({ id: data.id, isLeader: !!data.membership.crew?.isLeader }))
      .catch(() => {});
  }, []);

  useEffect(() => {
    setStats(null);
    void load(range, 'first');
  }, [range, load]);

  const activities: number | undefined = stats?.totals.activities;
  const empty = activities === 0;

  return (
    <Screen scroll refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(range, 'pull')} />}>
      <AppHeader title="크루 기록" onBack={() => router.back()} />

      <View style={{ flexDirection: 'row', gap: space.sm }}>
        {RANGES.map((r) => (
          <Chip
            key={r}
            label={RANGE_CHIP[r]}
            selected={r === range}
            accessibilityLabel={r === range ? `${RANGE_CHIP[r]}, 선택됨` : RANGE_CHIP[r]}
            onPress={() => setRange(r)}
          />
        ))}
      </View>

      {!stats ? (
        failed ? (
          <ErrorState title="크루 기록을 불러오지 못했어요" onRetry={() => load(range, 'first')} />
        ) : (
          <Loading label="크루 기록을 불러오고 있어요" />
        )
      ) : (
        <>
          {failed ? <Banner tone="warn">인터넷 연결을 확인해 주세요.</Banner> : null}

          <Card style={{ gap: space.sm }}>
            <BarChart
              values={stats.series.map((s) => s.items)}
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
                  const mine = row.user.id === me?.id;
                  const distance = formatDistance(row.distanceM);
                  return (
                    <ListRow
                      key={row.user.id}
                      title={`${row.rank}  ${row.user.nickname}`}
                      subtitle={`${withCommas(row.items)}개 · ${distance}`}
                      left={<Avatar name={row.user.nickname} uri={row.user.photoUrl ?? undefined} size="sm" />}
                      right={mine ? <Badge label="나" tone="deep" /> : undefined}
                      chevron
                      accessibilityLabel={`${row.rank}위, ${row.user.nickname}, ${row.items}개, ${distance.replace(/km$/, '킬로미터')}, 프로필 보기`}
                      onPress={() =>
                        mine
                          ? router.push('/(tabs)/profile')
                          : router.push({ pathname: '/5-4-user-profile', params: { id: row.user.id } })
                      }
                    />
                  );
                })}
              </View>
            </>
          )}

          {me?.isLeader ? (
            <Button
              label="CSV 내보내기"
              size="lg"
              icon="download"
              fullWidth
              accessibilityLabel="CSV 내보내기, 크루장만 가능"
              onPress={() => setExporting(true)}
            />
          ) : null}
        </>
      )}

      <ExportSheet
        visible={exporting}
        onClose={() => setExporting(false)}
        onFailed={() => setSnackbar('CSV를 만들지 못했어요. 다시 시도해 주세요.')}
      />
      <Snackbar visible={snackbar != null} message={snackbar ?? ''} onDismiss={() => setSnackbar(null)} />
    </Screen>
  );
}

function ExportSheet({ visible, onClose, onFailed }: { visible: boolean; onClose: () => void; onFailed: () => void }) {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const invalid = exportRangeError(from, to);
    setError(invalid);
    if (invalid) return;
    setBusy(true);
    try {
      const file = new File(Paths.cache, exportFileName(from, to));
      file.write(await fetchCrewCsv(from, to));
      await Sharing.shareAsync(file.uri, { mimeType: 'text/csv', dialogTitle: '기록 내보내기' });
      onClose();
    } catch {
      onFailed();
    } finally {
      setBusy(false);
    }
  };

  return (
    <BottomSheet visible={visible} onClose={busy ? () => {} : onClose} title="기록 내보내기">
      <View style={{ gap: space.md }}>
        <Field label="시작일" placeholder="2026-09-01" value={from} onChangeText={(v) => setFrom(formatDateInput(v))} keyboardType="number-pad" maxLength={10} editable={!busy} />
        <Field label="종료일" placeholder="2026-09-30" value={to} onChangeText={(v) => setTo(formatDateInput(v))} keyboardType="number-pad" maxLength={10} editable={!busy} error={error ?? undefined} />
        <Txt variant="caption" tone="muted">활동 한 회가 한 행으로 내려받아져요.</Txt>
        <View style={{ flexDirection: 'row', gap: space.sm, justifyContent: 'flex-end' }}>
          <Button label="취소" variant="ghost" size="md" onPress={onClose} />
          <Button label="CSV 내보내기" size="md" loading={busy} disabled={busy} onPress={submit} />
        </View>
      </View>
    </BottomSheet>
  );
}
