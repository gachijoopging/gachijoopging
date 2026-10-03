// 화면 5-2 · docs/screens/5-2-post-detail.md
import * as Crypto from 'expo-crypto';
import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Pressable, RefreshControl, ScrollView, View, type NativeScrollEvent, type NativeSyntheticEvent, type TextInput } from 'react-native';
import {
  AppHeader,
  Avatar,
  Banner,
  BottomSheet,
  Button,
  Chip,
  Dialog,
  EmptyState,
  ErrorState,
  Field,
  IconButton,
  Loading,
  Screen,
  Snackbar,
  Txt,
  pressedOpacity,
  size,
  space,
  useRipple,
} from 'design-system/src';
import { ApiError, createMockClient, type ApiClient } from '../../src/api/client';
import { clearDraft, draftFor, editDraft, requestIdFor } from '../../src/crew/comment-draft';
import { COMMENT_MAX, canSendComment } from '../../src/crew/notice';
import { PhotoPager } from '../../src/feed/PhotoPager';
import { authorLink, displayName, manageAction, photoLabel, syncLike, toggleLike, type Comment, type LikeSync, type Post, type UserBrief } from '../../src/feed/feed';
import { useBlockedUsers } from '../../src/profile/blocked-users';
import { leaveForMembership } from '../../src/feed/leave';
import { relativeTime } from '../../src/notifications/notifications';
import { useFlash } from '../../src/ui/useFlash';

type Detail = Post & { comments: Comment[]; commentsNextCursor?: string | null };
type Pending = { id: string; text: string };

const api: ApiClient = createMockClient({ delayMs: 300 });
/** 남은 글자는 이 수를 넘긴 뒤부터 보인다 (5-2 입력) */
const COUNT_FROM = 400;

export default function PostDetailScreen() {
  const { id, focus } = useLocalSearchParams<{ id: string; focus?: string }>();
  const [post, setPost] = useState<Detail | null>(null);
  const [me, setMe] = useState<{ id: string; isLeader: boolean } | null>(null);
  const blocked = useBlockedUsers(me?.id);
  const draftKey = me ? `post:${me.id}:${id}` : null;
  const [failed, setFailed] = useState(false);
  const [gone, setGone] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const liking = useRef<LikeSync | null>(null);
  const [text, setText] = useState('');
  const [pending, setPending] = useState<Pending | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [commentTarget, setCommentTarget] = useState<Comment | null>(null);
  const [confirm, setConfirm] = useState<'post' | 'comment' | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [snackbar, setSnackbar] = useFlash();
  const navigation = useNavigation();
  const input = useRef<TextInput>(null);
  const scroll = useRef<ScrollView>(null);
  // 내가 단 댓글이 그려진 뒤에 내려가야 맨 끝이 새 댓글이다
  const toEnd = useRef(false);
  const atEnd = useRef(false);
  const markAtEnd = ({ nativeEvent: { contentOffset, layoutMeasurement, contentSize } }: NativeSyntheticEvent<NativeScrollEvent>) => {
    atEnd.current = contentOffset.y + layoutMeasurement.height >= contentSize.height - space.md;
  };
  const sending = useRef(false);
  const request = useRef(0);
  const olderPending = useRef(false);
  const olderCursor = useRef<string | null>(null);
  const [olderState, setOlderState] = useState<'idle' | 'loading' | 'failed'>('idle');
  const [hasOlder, setHasOlder] = useState(false);

  useEffect(() => {
    setText(draftKey ? draftFor(draftKey).text : '');
  }, [draftKey]);

  useEffect(() => navigation.addListener('beforeRemove', (event) => {
    if (sending.current) event.preventDefault();
  }), [navigation]);

  const load = useCallback(
    async (mode: 'first' | 'pull') => {
      const generation = ++request.current;
      olderPending.current = false;
      olderCursor.current = null;
      setOlderState('idle');
      setHasOlder(false);
      if (mode === 'pull') setRefreshing(true);
      try {
        const { data } = await api.get('GET /posts/{postId}', { postId: id });
        if (generation !== request.current) return;
        setPost({ ...(data as unknown as Detail), comments: [...(data.comments as readonly Comment[])] });
        olderCursor.current = data.commentsNextCursor ?? null;
        setHasOlder(olderCursor.current != null);
        setGone(false);
        setFailed(false);
      } catch (e) {
        if (generation !== request.current) return;
        const code = e instanceof ApiError ? e.code : null;
        // 차단·나만 보기 글은 차단 여부를 알리지 않으려고 삭제와 같은 화면으로 보인다
        if (code === 'NOT_FOUND' || code === 'FORBIDDEN') setGone(true);
        else if (code === 'NO_CREW') void leaveForMembership();
        else {
          setFailed(true);
          if (mode === 'pull') setSnackbar('새로고침에 실패했어요');
        }
      } finally {
        if (generation === request.current) setRefreshing(false);
      }
    },
    [id, setSnackbar],
  );

  useEffect(() => {
    let ignore = false;
    void load('first');
    api
      .get('GET /users/me')
      .then(({ data }) => { if (!ignore) setMe({ id: data.id, isLeader: !!data.membership.crew?.isLeader }); })
      .catch(() => {});
    return () => { ignore = true; request.current += 1; };
  }, [load]);

  const loadOlder = async () => {
    const cursor = olderCursor.current;
    if (!cursor || olderPending.current) return;
    const generation = request.current;
    olderPending.current = true;
    setOlderState('loading');
    try {
      const { data } = await api.get('GET /posts/{postId}/comments', { postId: id, cursor });
      if (generation !== request.current || cursor !== olderCursor.current) return;
      setPost((previous) => {
        if (!previous) return previous;
        const ids = new Set(previous.comments.map((comment) => comment.id));
        const added = (data.items as readonly Comment[]).filter((comment) => !ids.has(comment.id));
        return { ...previous, comments: [...added, ...previous.comments] };
      });
      olderCursor.current = data.nextCursor;
      setHasOlder(data.nextCursor != null);
      setOlderState('idle');
    } catch (error) {
      if (generation !== request.current) return;
      if (error instanceof ApiError && (error.code === 'NOT_FOUND' || error.code === 'FORBIDDEN')) setGone(true);
      else if (error instanceof ApiError && error.code === 'NO_CREW') void leaveForMembership();
      else setOlderState('failed');
    } finally {
      if (generation === request.current) olderPending.current = false;
    }
  };

  useEffect(() => {
    if (focus === 'comment' && post) input.current?.focus();
  }, [focus, post]);

  const markGone = () => {
    setGone(true);
    setSnackbar('삭제된 게시물이에요');
  };

  const like = async () => {
    if (!post) return;
    // 연타해도 요청은 마지막 상태 하나로 모인다. 보내는 동안의 탭은 원하는 값만 바꾼다
    const running = liking.current;
    const st = running ?? { server: post.liked, wanted: post.liked };
    st.wanted = !st.wanted;
    setPost((p) => p && toggleLike(p));
    if (running) return;
    liking.current = st;
    try {
      await syncLike(st, (key) => api.mutate(key, { postId: id }));
    } catch (e) {
      if (e instanceof ApiError && e.code === 'NOT_FOUND') markGone();
      else {
        setPost((p) => p && (p.liked === st.server ? p : toggleLike(p)));
        setSnackbar('좋아요를 반영하지 못했어요');
      }
    } finally {
      liking.current = null;
    }
  };


  const changeText = (value: string) => {
    if (!draftKey) return;
    setText(value);
    editDraft(draftKey, value);
  };

  const send = async () => {
    if (!draftKey || sending.current || !canSendComment(text)) return;
    const requestId = requestIdFor(draftKey, Crypto.randomUUID);
    const body = text.trim();
    sending.current = true;
    setPending({ id: requestId, text: body });
    toEnd.current = true;
    try {
      const { data } = await api.mutate('POST /posts/{postId}/comments', { postId: id, id: requestId, text: body });
      const created = data as unknown as Comment;
      // 서버가 돌려준 댓글이 임시 줄보다 길 수 있어 한 번 더 내려간다
      toEnd.current = true;
      setPost((p) => p && { ...p, commentCount: p.commentCount + 1, comments: [...p.comments.filter((c) => c.id !== created.id), created] });
      clearDraft(draftKey);
      setText('');
    } catch (e) {
      if (e instanceof ApiError && e.code === 'NOT_FOUND') markGone();
      // 같은 id 로 다시 보내면 서버가 중복을 흡수한다 — 초안의 id 는 그대로 둔다
      else setSnackbar('댓글을 남기지 못했어요. 다시 시도해 주세요.');
    } finally {
      sending.current = false;
      setPending(null);
    }
  };

  const deletePost = async () => {
    setDeleting(true);
    try {
      await api.mutate('DELETE /posts/{postId}', { postId: id });
      setConfirm(null);
      // 진입한 화면(5-1·5-4·5-5·2-3)이 어디든 그 화면이 안내를 띄우도록 flash 를 얹고 돌아간다
      router.dismissTo(returnTo(navigation.getState(), '게시물을 삭제했어요'));
      // 떠나는 화면은 다시 그리지 않는다. 전환 중 재렌더가 Fabric 을 죽인다
    } catch {
      setSnackbar('삭제하지 못했어요. 다시 시도해 주세요.');
      setDeleting(false);
    }
  };

  const deleteComment = async () => {
    const target = commentTarget;
    if (!target) return;
    setDeleting(true);
    try {
      await api.mutate('DELETE /comments/{commentId}', { commentId: target.id });
      setPost((p) => p && { ...p, commentCount: Math.max(0, p.commentCount - 1), comments: p.comments.filter((c) => c.id !== target.id) });
      setConfirm(null);
      setCommentTarget(null);
    } catch {
      setSnackbar('삭제하지 못했어요. 다시 시도해 주세요.');
    } finally {
      setDeleting(false);
    }
  };

  const openAuthor = (author: UserBrief) => {
    if (authorLink(author, me?.id) === 'other') router.push({ pathname: '/users/[id]', params: { id: author.id } });
  };

  const postAction = post && me ? manageAction({ author: post.author, meId: me.id, isLeader: me.isLeader }) : null;
  const commentAction = commentTarget && me ? manageAction({ author: commentTarget.author, meId: me.id, isLeader: me.isLeader }) : null;
  const mine = !!post && post.author.id === me?.id;
  const meta = post ? [relativeTime(post.createdAt), post.visibility === 'PRIVATE' ? '나만 보기' : ''].filter(Boolean).join(' · ') : '';

  return (
    <Screen>
      <AppHeader title="게시물" onBack={() => router.back()} />

      {gone || (post && blocked.has(post.author.id)) ? (
        <EmptyState
          icon="sprout-outline"
          title="삭제된 게시물이에요"
          description="작성자가 삭제했거나 더 이상 볼 수 없는 게시물이에요."
          actionLabel="돌아가기"
          onAction={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/feed'))}
        />
      ) : !post ? (
        failed ? (
          <ErrorState title="게시물을 불러오지 못했어요" description="연결 상태를 확인하고 다시 시도해 주세요." onRetry={() => load('first')} />
        ) : (
          <Loading label="게시물을 불러오고 있어요" />
        )
      ) : (
        <>
          <ScrollView
            ref={scroll}
            style={{ flex: 1 }}
            contentContainerStyle={{ gap: space.md, paddingBottom: space.md }}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            maintainVisibleContentPosition={{ minIndexForVisible: 2 }}
            onContentSizeChange={() => {
              if (!toEnd.current) return;
              toEnd.current = false;
              atEnd.current = true;
              scroll.current?.scrollToEnd({ animated: true });
            }}
            // 끝에 있는지는 손으로 스크롤을 마쳤을 때만 잰다. 내려가는 애니메이션 중간값으로 재면 끝이 아니라고 오판한다.
            // 드래그가 시작되면 끝 추적을 푼다 — 끌어올리는 손 아래에서 키보드가 닫히며 높이가 바뀌어도 되돌려 내리지 않는다
            onScrollBeginDrag={() => { atEnd.current = false; }}
            onScrollEndDrag={markAtEnd}
            onMomentumScrollEnd={markAtEnd}
            // 큰 글자에서 비운 입력란의 안내 문구가 두 줄이 되면 목록 높이만 줄어 마지막 댓글이 가려진다.
            // 댓글을 보낸 직후 내려가던 애니메이션이 줄기 전 높이를 목표로 끝나므로, 같은 애니메이션으로 목표를 바꿔 준다
            onLayout={() => {
              if (atEnd.current) scroll.current?.scrollToEnd({ animated: true });
            }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load('pull')} />}
          >
            {failed ? <Banner tone="warn">인터넷 연결을 확인해 주세요.</Banner> : null}
            <View style={{ gap: space.md }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
                <AuthorButton author={post.author} mine={mine} onPress={() => openAuthor(post.author)}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
                    <AuthorFace author={post.author} size="md" />
                    <View style={{ flexShrink: 1 }}>
                      <Txt variant="body" bold numberOfLines={1}>{displayName(post.author)}</Txt>
                      <Txt variant="caption" tone="muted">{meta}</Txt>
                    </View>
                  </View>
                </AuthorButton>
                <View style={{ flex: 1 }} />
                {/* 권한 판별(GET /users/me)이 없으면 시트 내용을 정할 수 없어 흐리게 둔다 */}
                {post.author.withdrawn && !me?.isLeader && me ? null : (
                  <IconButton icon="dots-horizontal" label="더보기" tone="tint" disabled={!postAction} onPress={() => setMenuOpen(true)} />
                )}
              </View>

              {post.media.length > 0 ? <PhotoPager photos={post.media} label={photoLabel} /> : null}
              {post.text ? <Txt variant="body">{post.text}</Txt> : null}

              <View style={{ flexDirection: 'row', gap: space.sm }}>
                <Chip
                  label={`좋아요 ${post.likeCount}`}
                  icon={post.liked ? 'heart' : 'heart-outline'}
                  selected={post.liked}
                  accessibilityLabel={`좋아요 ${post.likeCount}, ${post.liked ? '선택됨' : '선택 안 됨'}`}
                  onPress={like}
                />
                <Chip
                  label={`댓글 ${post.commentCount}`}
                  icon="comment-outline"
                  tone="neutral"
                  accessibilityLabel={`댓글 ${post.commentCount}, 댓글 쓰기`}
                  onPress={() => input.current?.focus()}
                />
              </View>
            </View>

            <View style={{ gap: space.sm }}>
              <Txt variant="section" bold accessibilityRole="header">
                {post.commentCount > 0 ? `댓글 ${post.commentCount}` : '댓글'}
              </Txt>
              {hasOlder ? <Button label={olderState === 'failed' ? '이전 댓글 다시 시도' : '이전 댓글 더 보기'} variant="ghost" loading={olderState === 'loading'} disabled={olderState === 'loading'} onPress={loadOlder} /> : null}
              {olderState === 'failed' ? <Banner tone="warn">이전 댓글을 불러오지 못했어요. 다시 시도해 주세요.</Banner> : null}
              {post.comments.length === 0 && !pending ? (
                <Txt variant="caption" tone="muted" style={{ textAlign: 'center' }}>아직 댓글이 없어요. 첫 댓글을 남겨 보세요.</Txt>
              ) : null}
            </View>
              {post.comments.filter((c) => !blocked.has(c.author.id)).map((c) => {
                const action = me ? manageAction({ author: c.author, meId: me.id, isLeader: me.isLeader }) : null;
                return (
                  <CommentRow
                    key={c.id}
                    comment={c}
                    mine={c.author.id === me?.id}
                    onAuthor={() => openAuthor(c.author)}
                    onLongPress={
                      action
                        ? () => {
                            setCommentTarget(c);
                          }
                        : undefined
                    }
                  />
                );
              })}
              {pending && me ? (
                <CommentRow
                  comment={{ id: pending.id, text: pending.text, createdAt: new Date().toISOString(), author: { id: me.id, nickname: '나', photoUrl: null, withdrawn: false } }}
                  mine
                  sending
                  onAuthor={() => {}}
                />
              ) : null}
          </ScrollView>

          <View style={{ gap: space.xs, paddingBottom: space.md }}>
            {text.length > COUNT_FROM ? (
              <Txt
                variant="micro"
                tone={text.length >= COMMENT_MAX ? 'error' : 'faint'}
                style={{ alignSelf: 'flex-end' }}
                accessibilityLabel={`${text.length}자, ${COMMENT_MAX}자 중`}
                accessibilityLiveRegion="polite"
              >
                {`${text.length}/${COMMENT_MAX}`}
              </Txt>
            ) : null}
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: space.sm }}>
              <Field
                ref={input}
                style={{ flex: 1 }}
                placeholder="따뜻한 댓글을 남겨 주세요"
                accessibilityLabel="댓글 입력"
                value={text}
                onChangeText={changeText}
                maxLength={COMMENT_MAX}
                multiline
                maxLines={4}
                editable={!!draftKey && !pending}
              />
              <Button
                label="남기기"
                size="sm"
                loading={!!pending}
                disabled={!draftKey || !!pending || !canSendComment(text)}
                accessibilityLabel={pending ? '남기는 중' : '댓글 남기기'}
                onPress={send}
              />
            </View>
          </View>
        </>
      )}

      <BottomSheet visible={menuOpen} onClose={() => setMenuOpen(false)} title="게시물 관리">
        <View style={{ gap: space.md }}>
          <Txt variant="body" tone="muted">
            {mine
              ? '내가 쓴 게시물이에요. 삭제하면 되돌릴 수 없어요.'
              : postAction === 'delete'
                ? '크루장은 크루원의 게시물을 삭제할 수 있어요. 작성자에게 삭제 알림이 가요.'
                : '크루장에게 이 게시물을 알릴 수 있어요.'}
          </Txt>
          {postAction === 'delete' ? (
            <Button
              label="삭제하기"
              variant="danger"
              fullWidth
              onPress={() => {
                setMenuOpen(false);
                setConfirm('post');
              }}
            />
          ) : (
            <Button
              label="신고하기"
              variant="ghost"
              fullWidth
              onPress={() => {
                setMenuOpen(false);
                router.push({ pathname: '/report', params: { targetType: 'POST', targetId: id, nickname: post?.author.nickname ?? '', photoUrl: post?.author.photoUrl ?? '', text: post?.text ?? '', thumbUrl: post?.media[0]?.thumbUrl ?? '' } });
              }}
            />
          )}
        </View>
      </BottomSheet>

      <BottomSheet visible={!!commentTarget && confirm !== 'comment'} onClose={() => setCommentTarget(null)}>
        {commentAction === 'delete' ? (
          <Button label="삭제하기" variant="danger" fullWidth onPress={() => setConfirm('comment')} />
        ) : (
          <Button
            label="신고하기"
            variant="ghost"
            fullWidth
            onPress={() => {
              const target = commentTarget;
              setCommentTarget(null);
              if (target) router.push({ pathname: '/report', params: { targetType: 'COMMENT', targetId: target.id, nickname: target.author.nickname, photoUrl: target.author.photoUrl ?? '', text: target.text } });
            }}
          />
        )}
      </BottomSheet>

      <Dialog
        visible={confirm != null}
        onClose={() => {
          if (deleting) return;
          setConfirm(null);
          setCommentTarget(null);
        }}
        title={confirm === 'comment' ? '댓글을 삭제할까요?' : '게시물을 삭제할까요?'}
        actions={
          <>
            <Button
              label="남겨 두기"
              variant="ghost"
              size="md"
              disabled={deleting}
              onPress={() => {
                setConfirm(null);
                setCommentTarget(null);
              }}
            />
            <Button
              label="삭제"
              variant="danger"
              size="md"
              loading={deleting}
              disabled={deleting}
              onPress={confirm === 'comment' ? deleteComment : deletePost}
            />
          </>
        }
      >
        {confirm === 'post' ? (
          <Txt variant="body">
            {mine ? '피드에서 바로 사라지고, 알림으로 들어와도 삭제된 게시물로 보여요.' : '피드에서 바로 사라지고 작성자에게 삭제 알림이 가요.'}
          </Txt>
        ) : null}
      </Dialog>

      <Snackbar visible={snackbar != null} message={snackbar ?? ''} onDismiss={() => setSnackbar(null)} />
    </Screen>
  );
}

/** 옆 이름·부모 라벨이 이미 누구인지 읽으므로 얼굴은 장식이다 */
function AuthorFace({ author, size: s }: { author: UserBrief; size: 'sm' | 'md' }) {
  return <Avatar name={author.nickname} uri={author.photoUrl ?? undefined} size={s} withdrawn={author.withdrawn} decorative />;
}

function AuthorButton({ author, mine, onPress, children }: { author: UserBrief; mine: boolean; onPress: () => void; children: ReactNode }) {
  const ripple = useRipple();
  const label = author.withdrawn ? displayName(author) : mine ? `${author.nickname}(나)` : `${author.nickname}, 프로필 보기`;
  if (author.withdrawn || mine) {
    return (
      <View accessible accessibilityLabel={label} style={{ minHeight: size.minTouch, justifyContent: 'center', flexShrink: 1 }}>
        {children}
      </View>
    );
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      android_ripple={ripple}
      style={({ pressed }) => ({ minHeight: size.minTouch, justifyContent: 'center', flexShrink: 1, opacity: pressedOpacity(pressed) })}
    >
      {children}
    </Pressable>
  );
}

function CommentRow({
  comment,
  mine,
  sending,
  onAuthor,
  onLongPress,
}: {
  comment: Comment;
  mine: boolean;
  sending?: boolean;
  onAuthor: () => void;
  onLongPress?: () => void;
}) {
  const ripple = useRipple();
  const when = sending ? '전송 중' : relativeTime(comment.createdAt);
  return (
    <Pressable
      accessibilityLabel={`${displayName(comment.author)}, ${when}, ${comment.text}`}
      accessibilityHint={onLongPress ? '관리하려면 길게 누르기' : undefined}
      // 길게 누르기는 스크린리더로 찾기 어렵다. 같은 메뉴를 동작으로도 연다
      accessibilityActions={onLongPress ? [{ name: 'longpress', label: '댓글 관리' }] : undefined}
      onAccessibilityAction={onLongPress ? () => onLongPress() : undefined}
      onLongPress={onLongPress}
      disabled={sending || !onLongPress}
      android_ripple={onLongPress ? ripple : undefined}
      style={{ flexDirection: 'row', gap: space.sm, paddingVertical: space.sm, minHeight: size.minTouch }}
    >
      <AuthorButton author={comment.author} mine={mine} onPress={onAuthor}>
        <AuthorFace author={comment.author} size="sm" />
      </AuthorButton>
      <View style={{ flex: 1, gap: space.xs }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs }}>
          <Txt variant="caption" bold>{displayName(comment.author)}</Txt>
          <Txt variant={sending ? 'micro' : 'caption'} tone={sending ? 'faint' : 'muted'}>{`· ${when}`}</Txt>
        </View>
        <Txt variant="body">{comment.text}</Txt>
      </View>
    </Pressable>
  );
}

type NavState = { routes: { name: string; params?: object; state?: NavState }[]; index?: number } | undefined;

function returnTo(state: NavState, flash: string) {
  const routes = state?.routes ?? [];
  const prev = routes[(state?.index ?? routes.length - 1) - 1];
  if (!prev) return { pathname: '/(tabs)/feed' as const, params: { flash } };
  const tab = prev.state ? prev.state.routes[prev.state.index ?? 0] : null;
  const pathname = tab ? `/(tabs)/${tab.name === 'index' ? '' : tab.name}` : `/${prev.name}`;
  return { pathname: pathname as '/(tabs)/feed', params: { ...(tab ?? prev).params, flash } };
}
