import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { Icon, Tile, Txt, borderWidth, pressedOpacity, size, space, useRipple, useTheme } from 'design-system/src';
import { CATEGORY_ICON, CATEGORY_LABEL, type Category } from '../category';

/**
 * 4-5 AI 확인과 4-6 빠른 줍기의 2열 카테고리 카드. 두 화면이 "같은 카드" 여야 해서 한 곳에 둔다.
 * 수량이 1 이상인 카드는 테두리를 진하게 해 담길 것을 표시한다.
 */
export function CategoryTile({
  category,
  aside,
  selected = false,
  headerLabel,
  press,
  children,
}: {
  category: Category;
  /** 이름 오른쪽. 4-6 은 "총 N개", 4-5 는 AI·확인 필요 칩 */
  aside?: ReactNode;
  selected?: boolean;
  /** 머리 줄을 한 문장으로 읽힐 때 ("플라스틱, 2개, 확인 필요") */
  headerLabel: string;
  /** 4-6 은 머리 줄을 누르면 하나 담고, 길게 누르면 수량을 입력한다 */
  press?: { onPress: () => void; onLongPress: () => void; longPressLabel: string };
  children?: ReactNode;
}) {
  const { colors } = useTheme();
  const ripple = useRipple();
  const header = (
    <>
      <Icon name={CATEGORY_ICON[category]} size={size.iconCard} />
      <Txt variant="label" style={{ flexShrink: 1 }}>{CATEGORY_LABEL[category]}</Txt>
      <View style={{ flex: 1 }} />
      {aside}
    </>
  );
  const row = { flexDirection: 'row', alignItems: 'center', gap: space.xs, flexWrap: 'wrap' } as const;
  return (
    <Tile
      tone="surface"
      style={{
        flexBasis: '47%',
        flexGrow: 1,
        gap: space.sm,
        borderWidth: selected ? borderWidth.focus : borderWidth.hairline,
        borderColor: selected ? colors.deep : colors.border,
      }}
    >
      {press ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={headerLabel}
          accessibilityActions={[{ name: 'activate' }, { name: 'longpress', label: press.longPressLabel }]}
          onAccessibilityAction={(e) => (e.nativeEvent.actionName === 'longpress' ? press.onLongPress() : press.onPress())}
          onPress={press.onPress}
          onLongPress={press.onLongPress}
          android_ripple={ripple}
          // 카드 어디를 눌러도 담기게 남는 높이를 머리 줄이 채운다
          style={({ pressed }) => ({ ...row, alignItems: 'flex-start', flexGrow: 1, minHeight: size.minTouch, opacity: pressedOpacity(pressed) })}
        >
          {header}
        </Pressable>
      ) : (
        <View accessible accessibilityLabel={headerLabel} style={row}>
          {header}
        </View>
      )}
      {children}
    </Tile>
  );
}
