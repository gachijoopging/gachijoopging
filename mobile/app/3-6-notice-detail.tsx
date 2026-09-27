import * as Crypto from 'expo-crypto';
import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { RefreshControl, View } from 'react-native';
import {
  AppHeader,
  Avatar,
  Badge,
  Banner,
  BottomSheet,
  Button,
  Dialog,
  EmptyState,
  ErrorState,
  Field,
  IconButton,
  ListRow,
  Loading,
  Screen,
  Snackbar,
  Txt,
  space,
} from 'design-system/src';
import { ApiError, createMockClient, type ApiClient } from '../src/api/client';
import type { MOCKS } from '../src/api/mocks.generated';
import { clearDraft, draftFor, editDraft, requestIdFor } from '../src/crew/comment-draft';
import { monthDay } from '../src/crew/crew';
import { COMMENT_MAX, canSendComment, commentAction } from '../src/crew/notice';

type Detail = (typeof MOCKS)['GET /notices/{noticeId}']['data'];
type Comment = { id: string; author: { id: string; nickname: string; photoUrl: string | null }; text: string; createdAt: string };

const api: ApiClient = createMockClient({ delayMs: 300 });

export default function NoticeDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const navigation = useNavigation();
  const [notice, setNotice] = useState<Detail | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [me, setMe] = useState<{ id: string; isLeader: boolean } | null>(null);
  const [failed, setFailed] = useState(false);
  const [gone, setGone] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [text, setText] = useState(() => draftFor(id).text);
  const [sending, setSending] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [commentTarget, setCommentTarget] = useState<Comment | null>(null);
  const [snackbar, setSnackbar] = useState<string | null>(null);

  const load = useCallback(
    async (mode: 'first' | 'pull') => {
      if (mode === 'pull') setRefreshing(true);
      try {
        const { data } = await api.get('GET /notices/{noticeId}', { noticeId: id });
        setNotice(data);
        setComments([...data.comments]);
        setFailed(false);
      } catch (e) {
        if (e instanceof ApiError && e.code === 'NOT_FOUND') setGone(true);
        else setFailed(true);
      } finally {
        setRefreshing(false);
      }
    },
    [id],
  );

  useEffect(() => {
    void load('first');
    api
      .get('GET /users/me')
      .then(({ data }) => setMe({ id: data.id, isLeader: !!data.membership.crew?.isLeader }))
      .catch(() => {});
  }, [load]);

  const changeText = (value: string) => {
    setText(value);
    editDraft(id, value);
  };

  const send = async () => {
    if (sending || !canSendComment(text)) return;
    setSending(true);
    try {
      const requestId = requestIdFor(id, Crypto.randomUUID);
      const { data } = await api.mutate('POST /notices/{noticeId}/comments', { noticeId: id, id: requestId, text });
      setComments((prev) => [...prev, data]);
      clearDraft(id);
      setText('');
    } catch {
      setSnackbar('댓글을 남기지 못했어요. 다시 시도해 주세요.');
    } finally {
      setSending(false);
    }
  };

  const deleteNotice = async () => {
    setConfirmDelete(false);
    try {
      await api.mutate('DELETE /notices/{noticeId}', { noticeId: id });
      router.back();
      // ponytail: 스낵바는 이 화면과 함께 사라진다. 3-5 에 결과를 넘기는 길이 생기면 그쪽에서 띄운다
    } catch {
      setSnackbar('공지를 삭제하지 못했어요. 다시 시도해 주세요.');
    }
  };

  const deleteComment = async (comment: Comment) => {
    setCommentTarget(null);
    const before = comments;
    setComments(before.filter((c) => c.id !== comment.id));
    try {
      await api.mutate('DELETE /notice-comments/{commentId}', { commentId: comment.id });
    } catch {
      setComments(before);
      setSnackbar('댓글을 삭제하지 못했어요. 다시 시도해 주세요.');
    }
  };

  const openAuthor = (userId: string) =>
    userId === me?.id ? router.push('/(tabs)/profile') : router.push({ pathname: '/5-4-user-profile', params: { id: userId } });

  const cameFromNotifications = (() => {
    const { routes, index } = navigation.getState() ?? { routes: [], index: 0 };
    return routes[index - 1]?.name === '2-3-notifications';
  })();

  const targetAction = commentTarget && me ? commentAction({ authorId: commentTarget.author.id, meId: me.id, isLeader: me.isLeader }) : null;

  return (
    <Screen scroll refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load('pull')} />}>
      <AppHeader
        title="공지 상세"
        onBack={() => router.back()}
        action={
          me?.isLeader && notice ? (
            <IconButton icon="dots-horizontal" label="공지 관리, 크루장만 가능" onPress={() => setMenuOpen(true)} />
          ) : undefined
        }
      />

      {gone ? (
        <EmptyState
          icon="bullhorn-outline"
          title="공지를 볼 수 없어요"
          description="삭제되었거나 더 이상 이 크루의 공지가 아니에요."
          actionLabel={cameFromNotifications ? '알림으로' : '공지 목록으로'}
          onAction={() => (router.canGoBack() ? router.back() : router.replace('/3-5-notices'))}
        />
      ) : !notice ? (
        failed ? (
          <ErrorState title="공지를 불러오지 못했어요" onRetry={() => load('first')} />
        ) : (
          <Loading label="공지를 불러오고 있어요" />
        )
      ) : (
        <>
          <View
            accessible
            accessibilityLabel={[notice.pinned ? '최신 공지' : '', notice.title, monthDay(notice.createdAt)].filter(Boolean).join(', ')}
            style={{ gap: space.xs }}
          >
            {notice.pinned ? <Badge label="최신" tone="deep" style={{ alignSelf: 'flex-start' }} /> : null}
            <Txt variant="display">{notice.title}</Txt>
            <Txt variant="caption" tone="muted">{monthDay(notice.createdAt)}</Txt>
          </View>
          {failed ? <Banner tone="warn">인터넷 연결을 확인해 주세요.</Banner> : null}
          <Txt variant="body">{notice.body}</Txt>

          <View>
            <Txt variant="section" bold>댓글 {comments.length}개</Txt>
            {comments.length === 0 ? (
              <Txt variant="caption" tone="muted">아직 댓글이 없어요.</Txt>
            ) : (
              comments.map((c) => (
                <ListRow
                  key={c.id}
                  title={c.author.nickname}
                  subtitle={c.text}
                  left={<Avatar name={c.author.nickname} uri={c.author.photoUrl ?? undefined} size="sm" />}
                  right={
                    <IconButton
                      icon="dots-horizontal"
                      label="댓글 메뉴"
                      disabled={sending || !me}
                      onPress={() => setCommentTarget(c)}
                    />
                  }
                  chevron={false}
                  accessibilityLabel={`${c.author.nickname}, ${monthDay(c.createdAt)}, ${c.text}`}
                  onPress={() => openAuthor(c.author.id)}
                />
              ))
            )}
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: space.sm }}>
            <Field
              style={{ flex: 1 }}
              placeholder="댓글을 남겨 보세요."
              accessibilityLabel={`댓글, ${COMMENT_MAX}자까지`}
              value={text}
              onChangeText={changeText}
              maxLength={COMMENT_MAX}
              editable={!sending}
              returnKeyType="send"
              onSubmitEditing={send}
            />
            <Button
              label="전송"
              size="sm"
              loading={sending}
              disabled={sending || !canSendComment(text)}
              onPress={send}
            />
          </View>
        </>
      )}

      <BottomSheet visible={menuOpen} onClose={() => setMenuOpen(false)} title="공지 관리">
        <ListRow
          icon="pencil-outline"
          title="수정"
          onPress={() => {
            setMenuOpen(false);
            router.push({ pathname: '/3-12-edit-notice', params: { id } });
          }}
        />
        <ListRow
          icon="delete-outline"
          title="삭제"
          chevron={false}
          onPress={() => {
            setMenuOpen(false);
            setConfirmDelete(true);
          }}
        />
      </BottomSheet>

      <BottomSheet visible={commentTarget != null} onClose={() => setCommentTarget(null)} title="댓글">
        {targetAction === 'delete' ? (
          <ListRow icon="delete-outline" title="삭제" chevron={false} onPress={() => commentTarget && deleteComment(commentTarget)} />
        ) : (
          <ListRow
            icon="flag-outline"
            title="신고"
            onPress={() => {
              const target = commentTarget;
              setCommentTarget(null);
              if (target) router.push({ pathname: '/6-1-report', params: { targetType: 'NOTICE_COMMENT', targetId: target.id } });
            }}
          />
        )}
      </BottomSheet>

      <Dialog visible={confirmDelete} onClose={() => setConfirmDelete(false)} title="이 공지를 삭제할까요?">
        <Txt variant="body" tone="muted">댓글도 함께 사라져요. 되돌릴 수 없어요.</Txt>
        <View style={{ flexDirection: 'row', gap: space.sm, justifyContent: 'flex-end' }}>
          <Button label="취소" variant="ghost" size="md" onPress={() => setConfirmDelete(false)} />
          <Button label="삭제" variant="danger" size="md" onPress={deleteNotice} />
        </View>
      </Dialog>

      <Snackbar visible={snackbar != null} message={snackbar ?? ''} onDismiss={() => setSnackbar(null)} />
    </Screen>
  );
}
