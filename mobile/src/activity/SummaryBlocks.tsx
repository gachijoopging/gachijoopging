import { useState } from 'react';
import { View } from 'react-native';
import { Card, Chip, Icon, MetricSplit, Tile, Txt, radius, size, space, useTheme } from 'design-system/src';
import { KakaoMapView, type LatLng } from '../../modules/kakao-map';
import { CATEGORY_ICON, CATEGORY_LABEL } from '../category';
import { formatDistance } from '../format';
import { formatDuration, metricsLabel } from '../feed/activity-detail';
import { byCategoryChips } from './pickup';

/** 4-7 종료 요약과 5-3 기록 상세가 같은 활동을 같은 모양으로 보이게 하는 블록들 */

/** 경로 지도. 두 점이 안 되면 빈 지도 틀 대신 한 줄로 알린다 */
export function RouteMap({ appKey, segments }: { appKey: string; segments: readonly LatLng[][] }) {
  const { colors } = useTheme();
  const [failed, setFailed] = useState(false);
  const points = segments.flat();
  if (points.length < 2) {
    return (
      <Tile tone="surface" style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: size.minTouch }}>
        <Icon name="map-marker-off" size={size.iconCard} color={colors.inkMuted} />
        <Txt variant="caption" tone="muted">경로가 기록되지 않았어요</Txt>
      </Tile>
    );
  }
  return (
    <View
      accessible
      accessibilityLabel="이동 경로 지도"
      pointerEvents="none"
      style={{ height: size.mapFrame, borderRadius: radius.card, overflow: 'hidden', backgroundColor: colors.neutral }}
    >
      {appKey && !failed ? (
        <KakaoMapView appKey={appKey} center={points[Math.floor(points.length / 2)]} segments={segments as LatLng[][]} onMapError={() => setFailed(true)} style={{ flex: 1 }} />
      ) : (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Txt variant="caption" tone="muted">지도를 불러오지 못했어요</Txt>
        </View>
      )}
      <View style={{ position: 'absolute', top: space.md, left: space.md }}>
        <Chip tone="neutral" icon="map-marker-outline" label="이동 경로" />
      </View>
    </View>
  );
}

/**
 * 줍기·시간·거리, 잰 걸음이 있으면 걸음까지.
 * steps 를 넘기지 않으면 걸음 칸을 그리지 않는다(다른 줄에서 보이는 화면). null 은 미측정이라 칸을 뺀다
 */
export function ActivityMetrics({ itemCount, durationSec, distanceM, steps }: { itemCount: number; durationSec: number; distanceM: number; steps?: number | null }) {
  const items = [
    { value: `${itemCount}개`, label: '줍기' },
    { value: formatDuration(durationSec), label: '활동 시간' },
    { value: formatDistance(distanceM), label: '이동 거리' },
    ...(steps != null ? [{ value: steps.toLocaleString('ko-KR'), label: '걸음' }] : []),
  ];
  return (
    <Card>
      <MetricSplit divider="dashed" accessibilityLabel={metricsLabel({ itemCount, durationSec, distanceM, steps: steps ?? null })} items={items} />
    </Card>
  );
}

/** 주운 종류만 아이콘과 수로. 많이 주운 것부터 */
export function CategoryChips({ byCategory }: { byCategory: Partial<Record<string, number>> }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
      {byCategoryChips(byCategory).map(({ category, count }) => (
        <Chip key={category} tone="neutral" icon={CATEGORY_ICON[category]} label={`${CATEGORY_LABEL[category]} ${count}`} accessibilityLabel={`${CATEGORY_LABEL[category]} ${count}개`} />
      ))}
    </View>
  );
}
