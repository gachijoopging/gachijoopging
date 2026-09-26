import { View } from 'react-native';
import { space } from '../../tokens/spacing.ts';
import { borderWidth } from '../../tokens/elevation.ts';
import { useTheme } from '../theme.tsx';
import { Txt } from './Text.tsx';

export type MetricItem = {
  value: string;
  label: string;
  /** 지금 멈춰 있는 값 — 일시정지 중인 활동 시간·거리처럼 */
  muted?: boolean;
};

export type MetricSplitProps = {
  /** 2~4칸. 값은 화면이 단위까지 붙여 문자열로 넘깁니다 ("3.1km", "42분") */
  items: ReadonlyArray<MetricItem>;
  divider?: 'none' | 'dashed';
  /** 칸을 하나씩 읽으면 "27, 개수, 42분, 시간…" 으로 흩어집니다. 한 문장으로 묶어 주세요 */
  accessibilityLabel: string;
};

const DASHES = 5;

/**
 * 균등 N분할 수치 요약. 원본 `view_record_metrics` · `view_metric_row`.
 * 테두리나 채움이 없어 `Card`·`Tile` 안에 넣어 씁니다.
 *
 * 세로 점선은 View 로 직접 그립니다. 안드로이드는 한쪽 테두리에만 `borderStyle: 'dashed'`
 * 를 주면 실선으로 그립니다.
 */
export function MetricSplit({ items, divider = 'none', accessibilityLabel }: MetricSplitProps) {
  const { colors } = useTheme();
  return (
    <View
      accessible
      accessibilityLabel={accessibilityLabel}
      style={{ flexDirection: 'row', alignItems: 'stretch', alignSelf: 'stretch' }}
    >
      {items.map((it, i) => (
        <View key={it.label} style={{ flex: 1, flexDirection: 'row' }}>
          {i > 0 && divider === 'dashed' ? (
            <View style={{ justifyContent: 'space-between', paddingVertical: space.xs }}>
              {Array.from({ length: DASHES }, (_, k) => (
                <View
                  key={k}
                  style={{ width: borderWidth.hairline, height: space.xs, backgroundColor: colors.borderDotted }}
                />
              ))}
            </View>
          ) : null}
          <View style={{ flex: 1, alignItems: 'center', gap: space.xs }}>
            <Txt variant="metric" bold tone={it.muted ? 'muted' : 'ink'}>
              {it.value}
            </Txt>
            <Txt variant="caption" tone="muted">
              {it.label}
            </Txt>
          </View>
        </View>
      ))}
    </View>
  );
}
