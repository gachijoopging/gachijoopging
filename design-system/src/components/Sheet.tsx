import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, Dimensions, KeyboardAvoidingView, Modal, PanResponder, Pressable, View } from 'react-native';
import { radius } from '../../tokens/radius.ts';
import { space, screen, size as sizes } from '../../tokens/spacing.ts';
import { motion, projectedDistance, rubberband } from '../../tokens/motion.ts';
import { useTheme, useReduceMotion, depth } from '../theme.tsx';
import { Txt } from './Text.tsx';

/**
 * 바텀시트. 원본 `bg_sheet`(위 모서리만 30) + `bg_sheet_handle` + `bg_scrim`.
 *
 * 스크림을 눌러 닫는 경로를 항상 둡니다 — 안드로이드는 뒤로가기가 있지만
 * iOS 에는 없어서, 이게 없으면 닫을 방법이 사라집니다.
 *
 * 시트 위치 하나(`y`)가 시트와 스크림을 함께 움직입니다. 그래서 손잡이를 끌면 스크림이
 * 손가락을 따라 옅어지고, 닫히는 도중에 다시 잡아도 그 자리에서 이어집니다.
 * 놓을 때는 놓은 자리가 아니라 속도로 미끄러질 곳을 보고 닫을지 정합니다.
 */
export function BottomSheet({
  visible,
  onClose,
  title,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
}) {
  const { colors, shadows } = useTheme();
  const reduce = useReduceMotion();
  const [mounted, setMounted] = useState(visible);
  const height = useRef(Dimensions.get('window').height);
  // 스크림 보간은 렌더에 묶여 있어 잰 높이가 바뀌면 다시 그려야 한다
  const [measured, setMeasured] = useState(height.current);
  const y = useRef(new Animated.Value(height.current)).current;
  const offset = useRef(0);
  const grabbedAt = useRef(0);
  const releaseVelocity = useRef(0);
  const live = useRef({ visible, onClose });
  live.current = { visible, onClose };

  // 부르는 쪽은 닫으면서 대상을 비운다(title 이 '' 가 되는 식). 내려가는 동안 내용이 무너지지 않게 쥔다
  const shown = useRef({ title, children });
  if (visible) shown.current = { title, children };

  useEffect(() => {
    const listener = y.addListener(({ value }) => (offset.current = value));
    return () => y.removeListener(listener);
  }, [y]);

  useEffect(() => {
    if (visible) setMounted(true);
    const to = visible ? 0 : height.current;
    if (reduce) {
      y.setValue(to);
      if (!visible) setMounted(false);
      return;
    }
    const velocity = releaseVelocity.current;
    releaseVelocity.current = 0;
    Animated.spring(y, {
      toValue: to,
      velocity,
      ...(velocity ? motion.fling : motion.sheet),
      useNativeDriver: true,
    }).start(({ finished }) => finished && !visible && setMounted(false));
  }, [visible, reduce, y]);

  const drag = useRef(
    PanResponder.create({
      // 손잡이·제목 줄에는 누를 것이 없어 닿는 순간 잡는다. 안드로이드 Modal 안에서는 움직임으로
      // 잡겠다는 협상(onMoveShouldSet)이 불리지 않아, 기다리면 끌기가 영영 시작되지 않는다
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        y.stopAnimation();
        grabbedAt.current = offset.current;
        y.setOffset(grabbedAt.current);
        y.setValue(0);
      },
      onPanResponderMove: (_, g) => {
        const next = grabbedAt.current + g.dy;
        // 위로는 더 열 곳이 없다. 딱 멈추지 않고 저항만 커진다
        y.setValue(next < 0 ? rubberband(next, height.current) - grabbedAt.current : g.dy);
      },
      onPanResponderRelease: (_, g) => settle(g.vy),
      onPanResponderTerminate: (_, g) => settle(g.vy),
    }),
  ).current;

  function settle(vy: number) {
    y.flattenOffset();
    const landing = offset.current + projectedDistance(vy);
    if (landing > height.current / 2) {
      releaseVelocity.current = vy;
      live.current.onClose();
      // 부르는 쪽이 닫지 않기로 했으면(처리 중 등) 제자리로 돌아온다
      requestAnimationFrame(() => {
        if (live.current.visible) springBack(vy);
      });
      return;
    }
    springBack(vy);
  }

  function springBack(vy: number) {
    releaseVelocity.current = 0;
    Animated.spring(y, { toValue: 0, velocity: vy, ...motion.fling, useNativeDriver: true }).start();
  }

  const scrimOpacity = y.interpolate({
    inputRange: [0, measured],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });

  return (
    <Modal
      visible={mounted}
      transparent
      animationType="none"
      // 스크림이 상태바까지 덮지 않으면 시트가 뜬 상태에서 상단만 원래 화면이
      // 비쳐 보입니다. 안드로이드는 이 값을 줘야 창이 시스템 바 밑으로 확장됩니다.
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onClose}
    >
      {/* 반투명 시스템 바를 쓰는 Modal 창은 안드로이드에서도 키보드에 맞춰 줄지 않아,
          Screen 과 달리 두 플랫폼 모두 padding 으로 시트를 키보드 위로 올린다 */}
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Animated.View
          pointerEvents="none"
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.scrim, opacity: scrimOpacity }}
        />
        <Pressable
          accessibilityLabel="닫기"
          onPress={onClose}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
        />
        <Animated.View
          // 닫히는 중에는 쥐고 있는 옛 내용이 눌리지 않게 막는다
          pointerEvents={visible ? 'auto' : 'none'}
          onLayout={(e) => {
            height.current = e.nativeEvent.layout.height;
            setMeasured(height.current);
          }}
          style={{
            backgroundColor: colors.surface,
            borderTopLeftRadius: radius.sheet,
            borderTopRightRadius: radius.sheet,
            paddingHorizontal: screen.horizontal,
            paddingBottom: space['3xl'],
            gap: space.lg,
            transform: [{ translateY: y }],
            ...depth('overlay', shadows.overlay),
          }}
        >
          {/* 그리는 속성이 없는 View 는 안드로이드에서 네이티브 계층에서 빠진다(view flattening). 그러면
              손잡이와 제목 사이를 잡은 터치가 이 View 를 거치지 않아 끌기가 시작되지 않는다 */}
          <View collapsable={false} {...drag.panHandlers} style={{ paddingTop: space.md, gap: space.lg }}>
            <View
              style={{
                width: sizes.sheetHandleWidth,
                height: sizes.sheetHandleHeight,
                borderRadius: radius.pill,
                backgroundColor: colors.handle,
                alignSelf: 'center',
              }}
            />
            {shown.current.title ? <Txt variant="title">{shown.current.title}</Txt> : null}
          </View>
          {shown.current.children}
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/** 가운데 뜨는 대화상자. 중단이 꼭 필요한 확인에만 씁니다. */
export function Dialog({
  visible,
  onClose,
  title,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  const { colors, shadows } = useTheme();
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onClose}
    >
      <Pressable
        accessibilityLabel="닫기"
        onPress={onClose}
        style={{
          flex: 1,
          backgroundColor: colors.scrim,
          alignItems: 'center',
          justifyContent: 'center',
          padding: screen.horizontal,
        }}
      >
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={{
            backgroundColor: colors.surface,
            borderRadius: radius.card,
            padding: space.xl,
            gap: space.md,
            alignSelf: 'stretch',
            maxWidth: 420,
            ...depth('overlay', shadows.overlay),
          }}
        >
          <Txt variant="title">{title}</Txt>
          {children}
        </Pressable>
      </Pressable>
    </Modal>
  );
}
