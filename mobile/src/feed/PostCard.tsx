import { useState } from 'react';
import { Image, Pressable, View } from 'react-native';
import { Avatar, Card, Chip, Icon, Tile, Txt, pressedOpacity, radius, size, space, useRipple, useTheme } from 'design-system/src';
import { relativeTime } from '../notifications/notifications';
import { authorLink, displayName, type Post } from './feed';

const PHOTO_HEIGHT = size.feedPhoto;

type Props = {
  post: Post;
  meId: string | undefined;
  /** 내 게시물 탭은 전부 내 것이라 "내 게시물" 표시를 그리지 않는다 */
  mineTab: boolean;
  onOpen: (focusComment?: boolean) => void;
  onAuthor: () => void;
  onLike: () => void;
};

/** 5-1 피드 카드. 작성자 줄·알약은 따로 누르고 나머지 본문 영역이 상세로 간다 */
export function PostCard({ post, meId, mineTab, onOpen, onAuthor, onLike }: Props) {
  const { colors } = useTheme();
  const ripple = useRipple();
  const [photoFailed, setPhotoFailed] = useState(false);
  const link = authorLink(post.author, meId);
  const when = relativeTime(post.createdAt);
  const name = displayName(post.author);
  const photos = post.media.length;

  const authorRow = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, flexShrink: 1 }}>
      <Avatar name={post.author.nickname} uri={post.author.photoUrl ?? undefined} size="md" withdrawn={post.author.withdrawn} decorative />
      <Txt variant="body" bold numberOfLines={1} style={{ flexShrink: 1 }}>{name}</Txt>
    </View>
  );

  const bodyLabel = [name, when, photos > 0 ? `사진 ${photos}장` : '', post.text, '게시물 보기']
    .filter(Boolean)
    .join(', ');

  return (
    <Card style={{ gap: space.md }}>
      {/* 큰 글자에서는 표시가 이름을 덮지 않고 다음 줄로 내려간다 */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.sm }}>
        {link ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${post.author.nickname}, 프로필 보기`}
            onPress={onAuthor}
            android_ripple={ripple}
            style={({ pressed }) => ({ minHeight: size.minTouch, justifyContent: 'center', flexShrink: 1, opacity: pressedOpacity(pressed) })}
          >
            {authorRow}
          </Pressable>
        ) : (
          <View accessible accessibilityLabel={name} style={{ minHeight: size.minTouch, justifyContent: 'center', flexShrink: 1 }}>
            {authorRow}
          </View>
        )}
        {/* Chip 은 스스로 flex-start 로 붙어 줄 가운데에서 뜬다. 감싸서 줄 정렬을 따르게 한다 */}
        {!mineTab && post.author.id === meId ? (
          <View>
            <Chip label="내 게시물" tone="neutral" />
          </View>
        ) : null}
        {post.visibility === 'PRIVATE' ? (
          <View>
            <Chip label="나만 보기" tone="neutral" icon="lock-outline" accessibilityLabel="나만 보기" />
          </View>
        ) : null}
        <View style={{ flex: 1 }} />
        <Txt variant="caption" tone="muted">{when}</Txt>
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={bodyLabel}
        onPress={() => onOpen()}
        android_ripple={ripple}
        style={({ pressed }) => ({ gap: space.sm, opacity: pressedOpacity(pressed) })}
      >
        {photos > 0 ? (
          <View style={{ height: PHOTO_HEIGHT, borderRadius: radius.tile, overflow: 'hidden', backgroundColor: colors.tint, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="image-outline" size={size.iconCircleLg} color={colors.inkFaint} />
            {!photoFailed ? (
              <Image
                source={{ uri: post.media[0].thumbUrl }}
                resizeMode="cover"
                onError={() => setPhotoFailed(true)}
                style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
              />
            ) : null}
            {photos > 1 ? (
              <View style={{ position: 'absolute', right: space.sm, bottom: space.sm }}>
                <Chip label={`${photos}장`} tone="overlay" />
              </View>
            ) : null}
          </View>
        ) : null}
        {photos > 0 ? (
          post.text ? <Txt variant="body" numberOfLines={3}>{post.text}</Txt> : null
        ) : (
          <Tile style={{ gap: space.xs }}>
            <Txt variant="body" numberOfLines={3}>{post.text}</Txt>
            <Txt variant="caption" tone="green" bold>전체 보기 ›</Txt>
          </Tile>
        )}
      </Pressable>

      <View style={{ flexDirection: 'row', gap: space.sm }}>
        <Chip
          label={`좋아요 ${post.likeCount}`}
          icon={post.liked ? 'heart' : 'heart-outline'}
          selected={post.liked}
          accessibilityLabel={`좋아요 ${post.likeCount}, ${post.liked ? '눌림' : '안 눌림'}`}
          onPress={onLike}
        />
        <Chip
          label={`댓글 ${post.commentCount}`}
          icon="comment-outline"
          accessibilityLabel={`댓글 ${post.commentCount}, 댓글 쓰기`}
          onPress={() => onOpen(true)}
        />
      </View>
    </Card>
  );
}
