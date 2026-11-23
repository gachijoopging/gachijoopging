import { useEffect, useRef } from 'react';
import { Animated, View } from 'react-native';
import { motion } from '../../tokens/motion.ts';
import { LinearGradient } from 'expo-linear-gradient';
import { gradient } from '../../tokens/colors.ts';
import { radius } from '../../tokens/radius.ts';
import { useReduceMotion, useTheme } from '../theme.tsx';

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
  const reduce = useReduceMotion();
  // 값이 계단처럼 건너뛰어도 막대는 이어서 차오른다. 폭은 네이티브 드라이버가 못 다룬다
  const fill = useRef(new Animated.Value(pct)).current;
  useEffect(() => {
    if (reduce) fill.setValue(pct);
    else Animated.spring(fill, { toValue: pct, ...motion.settle, useNativeDriver: false }).start();
  }, [pct, reduce, fill]);
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
      <Animated.View style={{ width: fill.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }), height: '100%' }}>
        <LinearGradient
          colors={gradient.primary.colors}
          start={gradient.primary.start}
          end={gradient.primary.end}
          style={{ flex: 1, borderRadius: radius.pill }}
        />
      </Animated.View>
    </View>
  );
}
