import { useState } from 'react';
import { Image, Pressable, View } from 'react-native';
import { Avatar, Card, Chip, Icon, Tile, Txt, pressedOpacity, radius, size, space, useRipple, useTheme } from 'design-system/src';
import { relativeTime } from '../notifications/notifications';
import { authorLink, type Post } from './feed';

const PHOTO_HEIGHT = 190;

type Props = {
  post: Post;
  meId: string | undefined;
  /** 내 게시물 탭은 전부 내 글이라 "내 글" 표시를 그리지 않는다 */
  mineTab: boolean;
  liking: boolean;
  onOpen: (focusComment?: boolean) => void;
  onAuthor: () => void;
  onLike: () => void;
};

/** 5-1 피드 카드. 작성자 줄·알약은 따로 누르고 나머지 본문 영역이 상세로 간다 */
export function PostCard({ post, meId, mineTab, liking, onOpen, onAuthor, onLike }: Props) {
  const { colors } = useTheme();
  const ripple = useRipple();
  const [photoFailed, setPhotoFailed] = useState(false);
  const link = authorLink(post.author, meId);
  const when = relativeTime(post.createdAt);
  const photos = post.media.length;

  const authorRow = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, flexShrink: 1 }}>
      {post.author.withdrawn ? (
        <View style={{ width: size.avatarMd, height: size.avatarMd, borderRadius: radius.pill, backgroundColor: colors.neutral, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="account-outline" color={colors.inkMuted} />
        </View>
      ) : (
        <Avatar name={post.author.nickname} uri={post.author.photoUrl ?? undefined} size="md" />
      )}
      <Txt variant="body" bold numberOfLines={1} style={{ flexShrink: 1 }}>{post.author.nickname}</Txt>
    </View>
  );

  const bodyLabel = [post.author.nickname, when, photos > 0 ? `사진 ${photos}장` : '', post.text, '게시물 보기']
    .filter(Boolean)
    .join(', ');

  return (
    <Card style={{ gap: space.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
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
          <View accessible accessibilityLabel={post.author.nickname} style={{ minHeight: size.minTouch, justifyContent: 'center', flexShrink: 1 }}>
            {authorRow}
          </View>
        )}
        {!mineTab && post.author.id === meId ? <Chip label="내 글" tone="neutral" /> : null}
        {post.visibility === 'PRIVATE' ? (
          <View accessible accessibilityLabel="나만 보기">
            <Chip label="나만 보기" tone="neutral" icon="lock-outline" />
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
            <Txt variant="caption" tone="green" bold>전체 보기 →</Txt>
          </Tile>
        )}
      </Pressable>

      <View style={{ flexDirection: 'row', gap: space.sm }}>
        <Chip
          label={`고마워요 ${post.likeCount}`}
          icon={post.liked ? 'heart' : 'heart-outline'}
          selected={post.liked}
          disabled={liking}
          accessibilityLabel={`고마워요 ${post.likeCount}, ${post.liked ? '눌림' : '안 눌림'}`}
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
