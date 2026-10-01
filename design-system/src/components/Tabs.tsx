import { useEffect, useRef } from 'react';
import { Animated, Pressable, View } from 'react-native';
import { radius } from '../../tokens/radius.ts';
import { space, size as sizes, navIndicatorInset } from '../../tokens/spacing.ts';
import { motion } from '../../tokens/motion.ts';
import { useTheme, useRipple, useReduceMotion, pressedOpacity, disabledOpacity, depth } from '../theme.tsx';
import { Txt } from './Text.tsx';
import { Icon, type IconName } from './Icon.tsx';
import { splitBottomNavItems } from './BottomNav.ts';

export type BottomNavItem<T extends string> = { value: T; label: string; icon: IconName };
export type BottomNavStartAction = {
  label: string;
  icon: IconName;
  onPress: () => void;
  disabled?: boolean;
};
export type BottomNavProps<T extends string> = {
  items: ReadonlyArray<BottomNavItem<T>>;
  value: T;
  onChange: (v: T) => void;
  startAction?: BottomNavStartAction;
};

/**
 * 선택 표시 알약. 새로 고른 칸에서 가운데부터 옆으로 차오릅니다(Material 내비게이션 표시와 같은 움직임).
 *
 * 절반 폭에서 시작하는 이유: 라벨은 선택되는 즉시 밝은 글자로 바뀝니다. 알약이 0 에서 자라면
 * 첫 몇 프레임 동안 밝은 글자가 밝은 트랙 위에 떠서 사라져 보입니다. 가운데 라벨은 절반 폭이면 이미 덮입니다.
 * 떠나는 칸은 바로 지웁니다 — 두 알약이 함께 보이면 선택이 둘로 읽힙니다.
 */
function SelectionPill({ on }: { on: boolean }) {
  const { colors } = useTheme();
  const reduce = useReduceMotion();
  const grow = useRef(new Animated.Value(on ? 1 : 0)).current;
  useEffect(() => {
    if (!on || reduce) return grow.setValue(on ? 1 : 0);
    Animated.spring(grow, { toValue: 1, ...motion.settle, useNativeDriver: true }).start();
  }, [on, reduce, grow]);
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        borderRadius: radius.pill,
        backgroundColor: colors.deep,
        opacity: grow.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0, 1, 1] }),
        transform: [{ scaleX: grow.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] }) }],
      }}
    />
  );
}

/**
 * 세그먼트 탭. 원본 `bg_tab_selector` — 선택은 딥 채움에 밝은 글자입니다.
 *
 * 선택 표시를 밝은 색으로 하면 흰 바탕에서 대비가 1.4:1 을 넘지 못해 WCAG SC
 * 1.4.11 의 3:1 에 닿을 수 없습니다. 그래서 채움을 어둡게 하는 것이 유일한 해법입니다.
 *
 * 탭 높이는 Material 최소 터치 영역 48 을 지킵니다. 트랙 안쪽 여백을 더하면 전체
 * 컨트롤은 56 이 됩니다.
 */
export function Tabs<T extends string>({
  items,
  value,
  onChange,
  fullWidth = false,
}: {
  items: ReadonlyArray<{ value: T; label: string }>;
  value: T;
  onChange: (v: T) => void;
  /** 화면의 내용을 통째로 바꾸는 탭은 폭을 채워 필터 칩과 위계를 가른다 */
  fullWidth?: boolean;
}) {
  const { colors } = useTheme();
  const ripple = useRipple();
  return (
    <View
      accessibilityRole="tablist"
      style={{
        flexDirection: 'row',
        gap: space.xs,
        padding: space.xs,
        borderRadius: radius.pill,
        backgroundColor: colors.track,
        alignSelf: fullWidth ? 'stretch' : 'flex-start',
      }}
    >
      {items.map((it, i) => {
        const on = it.value === value;
        return (
          <Pressable
            key={it.value}
            accessibilityRole="tab"
            accessibilityLabel={`${it.label} 탭, ${items.length}개 중 ${i + 1}번째`}
            accessibilityState={{ selected: on }}
            onPress={() => onChange(it.value)}
            android_ripple={ripple}
            style={({ pressed }) => ({
              minHeight: sizes.minTouch,
              minWidth: sizes.minTouch,
              flex: fullWidth ? 1 : undefined,
              alignItems: 'center',
              justifyContent: 'center',
              paddingHorizontal: space.lg,
              borderRadius: radius.pill,
              overflow: 'hidden',
              opacity: pressedOpacity(pressed),
            })}
          >
            <SelectionPill on={on} />
            <Txt variant="label" style={{ color: on ? colors.onDark : colors.inkMuted }}>
              {it.label}
            </Txt>
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * 하단 내비게이션. 원본 `bg_nav_item_selected` 의 인셋 규칙을 그대로 옮깁니다.
 *
 * 높이는 `height` 가 아니라 `minHeight` 입니다 — 시스템 글자 크기를 키우면 라벨이
 * 자라야 하는데, 고정 높이면 그 자리에서 잘립니다.
 */
export function BottomNav<T extends string>({
  items,
  value,
  onChange,
  startAction,
}: BottomNavProps<T>) {
  const { colors, shadows } = useTheme();
  const ripple = useRipple();
  const hasRootAction = !!startAction && (items.length === 4 || items.length === 5);
  const [leadingItems, actionItem, trailingItems] = splitBottomNavItems(items);
  const item = (it: BottomNavItem<T>) => {
    const on = it.value === value;
    const ink = on ? colors.onDark : colors.inkMuted;
    return (
      <Pressable
        key={it.value}
        accessibilityRole="tab"
        accessibilityState={{ selected: on }}
        onPress={() => onChange(it.value)}
        android_ripple={ripple}
        style={({ pressed }) => ({
          flex: 1,
          paddingVertical: navIndicatorInset.vertical,
          paddingHorizontal: navIndicatorInset.horizontal,
          borderRadius: radius.pill,
          overflow: 'hidden',
          opacity: pressedOpacity(pressed),
        })}
      >
        <View
          style={{
            flex: 1,
            minHeight: sizes.minTouch - navIndicatorInset.vertical * 2,
            alignItems: 'center',
            justifyContent: 'center',
            // 아이콘과 라벨을 한 덩어리로 읽히게 하는 광학 간격. 4 그리드 밖이 의도입니다.
            gap: 2,
            paddingVertical: space.xs,
            borderRadius: radius.pill,
          }}
        >
          <SelectionPill on={on} />
          <Icon name={it.icon} size={20} color={ink} />
          <Txt variant="micro" bold={on} style={{ color: ink }}>
            {it.label}
          </Txt>
        </View>
      </Pressable>
    );
  };

  return (
    <View
      style={{
        flexDirection: 'row',
        minHeight: sizes.bottomNavHeight,
        borderRadius: radius.pill,
        backgroundColor: colors.surface,
        alignSelf: 'stretch',
        ...depth('floating', shadows.floating),
      }}
    >
      {hasRootAction ? (
        <>
          {leadingItems.map(item)}
          <Pressable
            accessibilityRole={actionItem ? 'tab' : 'button'}
            accessibilityLabel={startAction.label}
            accessibilityState={{
              disabled: !!startAction.disabled,
              ...(actionItem ? { selected: actionItem.value === value } : {}),
            }}
            disabled={startAction.disabled}
            onPress={() => {
              if (actionItem) onChange(actionItem.value);
              startAction.onPress();
            }}
            android_ripple={ripple}
            style={({ pressed }) => ({
              width: sizes.navAction,
              minHeight: sizes.minTouch,
              alignItems: 'center',
              justifyContent: 'flex-start',
              gap: 2,
              marginTop: -sizes.navActionLift,
              opacity: startAction.disabled ? disabledOpacity : pressedOpacity(pressed),
              zIndex: 1,
            })}
          >
            <View
              style={{
                width: sizes.navAction,
                height: sizes.navAction,
                borderRadius: radius.pill,
                backgroundColor: colors.lime,
                alignItems: 'center',
                justifyContent: 'center',
                ...depth('lime', shadows.lime),
              }}
            >
              <Icon name={startAction.icon} size={24} color={colors.onLime} />
            </View>
            <Txt variant="micro" bold style={{ color: colors.ink }}>
              {startAction.label}
            </Txt>
          </Pressable>
          {trailingItems.map(item)}
        </>
      ) : items.map(item)}
    </View>
  );
}
