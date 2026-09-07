import type { ReactElement } from 'react';
import { FlatList, View, type FlatListProps } from 'react-native';
import { space } from '../../tokens/spacing.ts';
import { Loading, EmptyState } from './States.tsx';

/**
 * 목록. 피드 · 모임 · 알림처럼 길어지는 화면은 전부 이걸 씁니다.
 *
 * `ScrollView` 에 `map` 을 돌리면 화면 밖 항목까지 전부 그리고 붙잡고 있습니다.
 * 항목이 수십 개를 넘기는 순간 스크롤이 끊기고 메모리가 늘어납니다 — 그래서
 * 원형을 하나 두고, 화면마다 각자 정하지 않게 합니다.
 *
 * 로딩 · 빈 상태를 인자로 받는 이유는 목록마다 "왜 비었는지"가 다르기 때문입니다.
 * 기본 문구로 때우면 사용자가 다음에 뭘 할지 알 수 없습니다.
 */
export type ListProps<T> = Omit<
  FlatListProps<T>,
  'ListEmptyComponent' | 'ItemSeparatorComponent'
> & {
  loading?: boolean;
  /** 비었을 때 보여줄 것. 생략하면 밋밋한 기본 빈 상태가 나옵니다 */
  empty?: ReactElement;
  /** 항목 사이 간격. 구분선은 ListRow 가 스스로 그립니다 */
  gap?: number;
};

export function List<T>({ loading = false, empty, gap = 0, ...rest }: ListProps<T>) {
  return (
    <FlatList<T>
      keyboardShouldPersistTaps="handled"
      ItemSeparatorComponent={gap ? () => <View style={{ height: gap }} /> : undefined}
      ListEmptyComponent={
        loading ? (
          <Loading />
        ) : (
          (empty ?? <EmptyState title="아직 아무것도 없어요" />)
        )
      }
      contentContainerStyle={{ paddingBottom: space['3xl'], flexGrow: 1 }}
      {...rest}
    />
  );
}
