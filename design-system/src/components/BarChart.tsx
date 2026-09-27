import { View } from 'react-native';
import { radius } from '../../tokens/radius.ts';
import { space } from '../../tokens/spacing.ts';
import { useTheme } from '../theme.tsx';

export type BarChartProps = {
  values: readonly number[];
  /** 막대 하나씩이 아니라 요약 한 문장으로 읽힌다 (예: "이번 주, 총 1,430개") */
  accessibilityLabel: string;
  height?: number;
};

/**
 * 기간별 막대. 값 크기만 보여 주는 추이라 축·눈금이 없고, 정확한 수는 옆 지표가 말합니다.
 * 0인 날도 자리를 비우지 않고 트랙 색 바닥을 남겨 "쉰 날"로 읽히게 합니다.
 */
export function BarChart({ values, accessibilityLabel, height = 72 }: BarChartProps) {
  const { colors } = useTheme();
  const max = Math.max(1, ...values);
  const floor = 3;
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel}
      style={{ height, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-around', gap: space.xs }}
    >
      {values.map((value, i) => (
        <View
          key={i}
          style={{
            flex: 1,
            // 막대가 적은 기간(주 초·월 초)에 알약처럼 부풀지 않게 폭을 막는다
            maxWidth: space['2xl'],
            height: value > 0 ? Math.max(floor, (value / max) * height) : floor,
            borderRadius: radius.pill,
            backgroundColor: value > 0 ? colors.deep : colors.track,
          }}
        />
      ))}
    </View>
  );
}
