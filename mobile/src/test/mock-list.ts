import { createElement, isValidElement, type ComponentType, type ReactElement, type ReactNode } from 'react';

type Slot = ComponentType | ReactElement | null | undefined;
const slot = (s: Slot): ReactNode => (s == null ? null : isValidElement(s) ? s : createElement(s as ComponentType));

/**
 * design-system 의 `List`(FlatList) 대역. 화면 테스트는 design-system 을 Proxy 로 갈아 끼우므로
 * 그대로 두면 항목이 그려지지 않는다. FlatList 처럼 머리·항목·빈 상태·꼬리를 그리고 props 는 그대로 둔다
 */
export function MockList(props: {
  data?: readonly unknown[] | null;
  renderItem?: (info: { item: unknown; index: number }) => ReactNode;
  keyExtractor?: (item: unknown, index: number) => string;
  ListHeaderComponent?: Slot;
  ListFooterComponent?: Slot;
  empty?: ReactElement;
  loading?: boolean;
}) {
  const data = props.data ?? [];
  const items = data.map((item, index) =>
    createElement('ListItem', { key: props.keyExtractor ? props.keyExtractor(item, index) : String(index) }, props.renderItem?.({ item, index })),
  );
  return createElement(
    'List',
    props,
    slot(props.ListHeaderComponent),
    data.length === 0 && !props.loading ? props.empty ?? null : items,
    slot(props.ListFooterComponent),
  );
}
