import { useRef } from 'react';
import { View } from 'react-native';
import { captureRef } from 'react-native-view-shot';
import { Txt, radius, size, space, useTheme } from 'design-system/src';
import type { LatLng } from '../../modules/kakao-map';
import { summaryMeta } from './pickup';
import { routeStrokes, shareLines } from './share';

export type ShareData = {
  startedAt: string;
  endedAt: string;
  durationSec: number;
  pausedSec: number;
  distanceM: number;
  steps: number | null;
  itemCount: number;
  segments: readonly LatLng[][];
};

/** 공유 이미지 한 변. 피드 사진 틀이 정사각이라 정사각으로 만든다 */
const SIDE = 1080 / 3;
const ROUTE_HEIGHT = SIDE / 2;

/** 화면 밖에 그려 둔 카드를 PNG 로 떠 5-6 에 첫 사진으로 넘긴다 */
export function useShareImage() {
  const ref = useRef<View>(null);
  const capture = () => captureRef(ref, { format: 'png', quality: 1, result: 'tmpfile' });
  return { ref, capture };
}

/** 캡처 전용. 화면에는 보이지 않고 스크린리더도 읽지 않는다 */
export function ShareCard({ cardRef, data, includeRoute }: { cardRef: React.RefObject<View | null>; data: ShareData; includeRoute: boolean }) {
  const { colors } = useTheme();
  const strokes = includeRoute ? routeStrokes(data.segments, SIDE - space.xl * 2, ROUTE_HEIGHT) : [];
  const line = size.routeStroke;
  return (
    <View pointerEvents="none" importantForAccessibility="no-hide-descendants" style={{ position: 'absolute', left: -SIDE * 4, top: 0 }}>
      <View
        ref={cardRef}
        collapsable={false}
        style={{ width: SIDE, minHeight: SIDE, padding: space.xl, gap: space.md, backgroundColor: colors.bg, borderRadius: radius.card, justifyContent: 'space-between' }}
      >
        <View style={{ gap: space.xs }}>
          <Txt variant="label" bold>가치줍깅</Txt>
          <Txt variant="caption" tone="muted">
            {summaryMeta({ startedAt: data.startedAt, endedAt: data.endedAt, pausedSec: data.pausedSec, steps: null })}
          </Txt>
        </View>
        {strokes.length ? (
          <View style={{ height: ROUTE_HEIGHT }}>
            {strokes.map((s, i) => (
              <View
                key={i}
                style={{
                  position: 'absolute',
                  left: s.x,
                  top: s.y - line / 2,
                  width: s.length,
                  height: line,
                  borderRadius: line / 2,
                  backgroundColor: colors.deep,
                  transformOrigin: 'left center',
                  transform: [{ rotate: `${s.angle}rad` }],
                }}
              />
            ))}
          </View>
        ) : null}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: space.sm }}>
          {shareLines(data).map((l) => (
            <View key={l.label} style={{ width: '50%' }}>
              <Txt variant="metric">{l.value}</Txt>
              <Txt variant="micro" tone="muted">{l.label}</Txt>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}
