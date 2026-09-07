import { View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { gradient } from '../../tokens/colors.ts';
import { radius } from '../../tokens/radius.ts';
import { useTheme } from '../theme.tsx';

/**
 * 진행바. 원본 `bg_progress_track` — 트랙 위에 주 그라데이션이 차오릅니다.
 * 기본 버튼·촬영 버튼과 같은 채움이라 "활성"의 의미가 화면 사이에서 일관됩니다.
 */
export function Progress({
  value,
  height = 10,
  label,
}: {
  /** 0 ~ 1 */
  value: number;
  height?: number;
  label?: string;
}) {
  const { colors } = useTheme();
  const pct = Math.max(0, Math.min(1, value));
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(pct * 100), text: label }}
      style={{
        height,
        borderRadius: radius.pill,
        backgroundColor: colors.track,
        overflow: 'hidden',
        alignSelf: 'stretch',
      }}
    >
      <LinearGradient
        colors={gradient.primary.colors}
        start={gradient.primary.start}
        end={gradient.primary.end}
        style={{ width: `${pct * 100}%`, height: '100%', borderRadius: radius.pill }}
      />
    </View>
  );
}
