import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, type StyleProp, type ViewStyle } from 'react-native';
import { motion } from '../../tokens/motion.ts';
import { space } from '../../tokens/spacing.ts';
import { useReduceMotion } from '../theme.tsx';

/**
 * 나타났다 사라지는 것. 들어온 자리로 나갑니다 — `rise` 만큼 아래에서 올라왔으면 같은 길로 내려갑니다.
 *
 * 사라질 때는 움직임이 끝난 뒤에 떼어 냅니다. `visible` 이 false 가 되자마자 떼면
 * 퇴장이 그려지지 않습니다. 퇴장 중에 다시 true 가 되면 지금 위치에서 되돌아옵니다.
 */
export function Appear({
  visible,
  rise = space.md,
  pointerEvents,
  style,
  replayKey,
  children,
}: {
  visible: boolean;
  /** 아래에서 떠오르는 거리. 0 이면 제자리에서 흐려졌다 선명해진다 */
  rise?: number;
  pointerEvents?: 'box-none' | 'none' | 'auto';
  /** 보이는 채로 내용만 바뀔 때(문구 교체) 이 값이 바뀌면 다시 흐려졌다 선명해진다 */
  replayKey?: string | number;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  const reduce = useReduceMotion();
  const progress = useRef(new Animated.Value(visible ? 1 : 0)).current;
  const [mounted, setMounted] = useState(visible);

  useEffect(() => {
    if (visible) setMounted(true);
    if (reduce) {
      progress.setValue(visible ? 1 : 0);
      if (!visible) setMounted(false);
      return;
    }
    Animated.spring(progress, { toValue: visible ? 1 : 0, ...motion.settle, useNativeDriver: true }).start(
      ({ finished }) => finished && !visible && setMounted(false),
    );
  }, [visible, reduce, progress]);

  const firstKey = useRef(replayKey);
  useEffect(() => {
    if (replayKey === firstKey.current || !visible || reduce) return;
    firstKey.current = replayKey;
    progress.setValue(0);
    Animated.spring(progress, { toValue: 1, ...motion.settle, useNativeDriver: true }).start();
  }, [replayKey, visible, reduce, progress]);

  // 부르는 쪽은 보통 `visible` 과 함께 내용도 null 로 바꾼다. 퇴장 중에는 마지막 내용을 그려야 흐려지는 게 보인다
  const shown = useRef(children);
  if (visible) shown.current = children;

  if (!mounted) return null;
  return (
    <Animated.View
      pointerEvents={pointerEvents}
      style={[
        style,
        {
          opacity: progress,
          transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [rise, 0] }) }],
        },
      ]}
    >
      {shown.current}
    </Animated.View>
  );
}
