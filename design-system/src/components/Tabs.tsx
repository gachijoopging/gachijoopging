import { Pressable, View } from 'react-native';
import { radius } from '../../tokens/radius.ts';
import { space, size as sizes, navIndicatorInset } from '../../tokens/spacing.ts';
import { useTheme, useRipple, pressedOpacity, depth } from '../theme.tsx';
import { Txt } from './Text.tsx';
import { Icon, type IconName } from './Icon.tsx';

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
}: {
  items: ReadonlyArray<{ value: T; label: string }>;
  value: T;
  onChange: (v: T) => void;
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
        alignSelf: 'flex-start',
      }}
    >
      {items.map((it) => {
        const on = it.value === value;
        return (
          <Pressable
            key={it.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            onPress={() => onChange(it.value)}
            android_ripple={ripple}
            style={({ pressed }) => ({
              minHeight: sizes.minTouch,
              minWidth: sizes.minTouch,
              alignItems: 'center',
              justifyContent: 'center',
              paddingHorizontal: space.lg,
              borderRadius: radius.pill,
              overflow: 'hidden',
              backgroundColor: on ? colors.deep : colors.transparent,
              opacity: pressedOpacity(pressed),
            })}
          >
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
}: {
  items: ReadonlyArray<{ value: T; label: string; icon: IconName }>;
  value: T;
  onChange: (v: T) => void;
}) {
  const { colors, shadows } = useTheme();
  const ripple = useRipple();
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
      {items.map((it) => {
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
                gap: 2,
                paddingVertical: space.xs,
                borderRadius: radius.pill,
                backgroundColor: on ? colors.deep : colors.transparent,
              }}
            >
              <Icon name={it.icon} size={20} color={ink} />
              <Txt variant="micro" bold={on} style={{ color: ink }}>
                {it.label}
              </Txt>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}
