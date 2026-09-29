import { View } from 'react-native';
import { radius } from '../../tokens/radius.ts';
import { space } from '../../tokens/spacing.ts';
import { useTheme } from '../theme.tsx';
import { Txt } from './Text.tsx';

export type BarChartProps = {
  /** null 은 아직 오지 않은 칸. 막대도 바닥도 그리지 않고 자리만 둔다 */
  values: readonly (number | null)[];
  /** 칸 아래 이름. 빈 문자열인 칸은 이름 없이 자리만 둔다 */
  labels?: readonly string[];
  /** 막대 하나씩이 아니라 요약 한 문장으로 읽힌다 (예: "이번 주, 총 1,430개") */
  accessibilityLabel: string;
  height?: number;
};

/** 칸 이름은 칸보다 넓을 수 있다(한 달 30칸의 "15"). 칸 가운데에 두고 옆 칸으로 넘치게 한다 */
const LABEL_WIDTH = space['2xl'];

/**
 * 기간별 막대. 값 크기만 보여 주는 추이라 눈금이 없고, 정확한 수는 옆 지표가 말합니다.
 * 0인 날도 자리를 비우지 않고 트랙 색 바닥을 남겨 "쉰 날"로 읽히게 합니다.
 *
 * 막대 폭은 `space.md` 로 막습니다. 넓은 알약은 낮은 값에서 둥근 덩어리로 보여 막대로 읽히지 않습니다.
 */
export function BarChart({ values, labels, accessibilityLabel, height = 72 }: BarChartProps) {
  const { colors } = useTheme();
  const max = Math.max(1, ...values.map((v) => v ?? 0));
  const floor = 3;
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={accessibilityLabel} style={{ gap: space.sm }}>
      <View style={{ height, flexDirection: 'row', alignItems: 'flex-end', gap: space.xs }}>
        {values.map((value, i) => (
          <View key={i} style={{ flex: 1, alignItems: 'center' }}>
            {value == null ? null : (
              <View
                style={{
                  width: '100%',
                  maxWidth: space.md,
                  height: value > 0 ? Math.max(floor * 2, (value / max) * height) : floor,
                  borderRadius: radius.pill,
                  backgroundColor: value > 0 ? colors.deep : colors.track,
                }}
              />
            )}
          </View>
        ))}
      </View>
      {labels ? (
        <View style={{ flexDirection: 'row', gap: space.xs }}>
          {labels.map((label, i) => (
            <View key={i} style={{ flex: 1, alignItems: 'center' }}>
              {label ? (
                <Txt variant="micro" tone="hint" numberOfLines={1} style={{ width: LABEL_WIDTH, textAlign: 'center' }}>
                  {label}
                </Txt>
              ) : null}
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}
