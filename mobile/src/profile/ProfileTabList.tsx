import type { ReactElement } from 'react';
import { View, type RefreshControlProps } from 'react-native';
import { EmptyState, ErrorState, LinkText, List, Loading, characterEmpty, space } from 'design-system/src';
import { ActivityCardView, PostTile, type ActivityCard, type Post } from './ProfileParts';

type Page<T> = {
  items: readonly T[] | null;
  failed: boolean;
  moreFailed: boolean;
  loadingMore: boolean;
  reload: () => void;
  loadMore: () => void;
};

const POST_COLUMNS = 3;

/**
 * 프로필의 기록·게시물 탭 본문. 프로필 머리를 목록 머리로 얹어 한 번에 스크롤하고,
 * 끝에 닿으면 지금 탭의 다음 장을 부른다. 게시물은 세 칸 격자다
 */
export function ProfileTabList({
  tab,
  header,
  records,
  posts,
  onOpenRecord,
  onMenu,
  onOpenPost,
  recordsEmpty = { description: '첫 줍깅을 시작하면 줍기, 시간, 거리가 여기에 쌓여요.' },
  postsEmptyDescription = '올린 게시물이 여기에 모여요. 나만 보기로 올린 것도 나에게는 보여요.',
  hidden,
  refreshControl,
}: {
  tab: 'records' | 'posts';
  header: ReactElement | null;
  records: Page<ActivityCard>;
  posts: Page<Post>;
  onOpenRecord: (id: string) => void;
  onMenu?: (card: ActivityCard) => void;
  onOpenPost: (id: string) => void;
  recordsEmpty?: { description: string; onStart?: () => void };
  postsEmptyDescription?: string;
  /** 차단한 사람처럼 본문을 보여 주지 않을 때 목록 대신 놓는다 */
  hidden?: ReactElement;
  refreshControl?: ReactElement<RefreshControlProps>;
}) {
  const page: Page<ActivityCard> | Page<Post> = tab === 'records' ? records : posts;
  const what = tab === 'records' ? '활동 기록' : '게시물';

  const empty = hidden ?? (
    !page.items ? (
      page.failed ? <ErrorState title={`${what}을 불러오지 못했어요`} onRetry={page.reload} /> : <Loading label={`${what}을 불러오고 있어요`} />
    ) : tab === 'records' ? (
      <EmptyState
        image={characterEmpty.activity}
        title="아직 활동 기록이 없어요"
        description={recordsEmpty.description}
        actionLabel={recordsEmpty.onStart ? '줍깅 시작하러 가기' : undefined}
        onAction={recordsEmpty.onStart}
      />
    ) : (
      <EmptyState image={characterEmpty.post} title="아직 올린 게시물이 없어요" description={postsEmptyDescription} />
    )
  );

  const footer = hidden ? null : page.loadingMore ? (
    <Loading label={`${what}을 불러오고 있어요`} />
  ) : page.moreFailed ? (
    <LinkText label="다시 시도" tone="muted" onPress={page.loadMore} />
  ) : null;

  return (
    <List
      // 열 수가 다른 목록은 FlatList 가 그 자리에서 바꾸지 못한다. 탭마다 새로 만들어 스크롤이 맨 위로 돌아간다
      key={tab}
      data={hidden ? [] : ((page.items ?? []) as readonly (ActivityCard | Post)[])}
      keyExtractor={(item) => item.id}
      numColumns={tab === 'posts' ? POST_COLUMNS : 1}
      gap={tab === 'records' ? space.md : 0}
      onEndReached={() => {
        // 실패한 다음 장은 끝에 닿을 때마다 다시 부르지 않는다. 다시 시도로만 부른다
        if (!hidden && page.items && !page.failed && !page.moreFailed) page.loadMore();
      }}
      onEndReachedThreshold={0.5}
      refreshControl={refreshControl}
      ListHeaderComponent={header ? <View style={{ gap: space.md, paddingBottom: space.md }}>{header}</View> : null}
      empty={empty}
      renderItem={({ item }) =>
        tab === 'records' ? (
          <ActivityCardView
            card={item as ActivityCard}
            onPress={() => onOpenRecord(item.id)}
            onMenu={onMenu ? () => onMenu(item as ActivityCard) : undefined}
          />
        ) : (
          <PostTile post={item as Post} onOpen={onOpenPost} />
        )
      }
      ListFooterComponent={footer}
    />
  );
}
