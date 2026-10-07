// 화면 3-6 · docs/screens/3-6-notice-detail.md
import * as Crypto from 'expo-crypto';
import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
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
import { ApiError, createMockClient, peek, type ApiClient } from '../../../src/api/client';
import type { MOCKS } from '../../../src/api/mocks.generated';
import { clearDraft, draftFor, editDraft, requestIdFor } from '../../../src/crew/comment-draft';
import { monthDay } from '../../../src/crew/crew';
import { COMMENT_MAX, canSendComment, commentAction, visibleComments } from '../../../src/crew/notice';
import { leaveForMembership } from '../../../src/feed/leave';
import { useBlockedUsers } from '../../../src/profile/blocked-users';
import { useFlash } from '../../../src/ui/useFlash';

type Detail = (typeof MOCKS)['GET /notices/{noticeId}']['data'];
type Comment = { id: string; author: { id: string; nickname: string; photoUrl: string | null }; text: string; createdAt: string };

const api: ApiClient = createMockClient({ delayMs: 300 });

export default function NoticeDetailScreen() {
  const { id, flash } = useLocalSearchParams<{ id: string; flash?: string }>();
  const navigation = useNavigation();
  const [notice, setNotice] = useState<Detail | null>(() => peek('GET /notices/{noticeId}', { noticeId: id })?.data ?? null);
  const [allComments, setComments] = useState<Comment[]>([]);
  const [me, setMe] = useState<{ id: string; isLeader: boolean } | null>(null);
  const blocked = useBlockedUsers(me?.id);
  const comments = visibleComments(allComments, blocked, !!me?.isLeader);
  const [failed, setFailed] = useState(false);
  const [gone, setGone] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [text, setText] = useState(() => draftFor(id).text);
  const [sending, setSending] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [commentTarget, setCommentTarget] = useState<Comment | null>(null);
  const [commentMenuOpen, setCommentMenuOpen] = useState(false);
  const [snackbar, setSnackbar] = useFlash();

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
        else if (e instanceof ApiError && e.code === 'NO_CREW') void leaveForMembership();
        else setFailed(true);
      } finally {
        setRefreshing(false);
      }
    },
    [id],
  );

  useEffect(() => {
    void load('first');
  }, [load]);

  // 수정하고 돌아오면(flash 가 붙어 온다) 바뀐 제목·본문을 다시 받는다
  useEffect(() => {
    if (flash) void load('first');
  }, [flash, load]);

  useEffect(() => {
    api
      .get('GET /users/me')
      .then(({ data }) => setMe({ id: data.id, isLeader: !!data.membership.crew?.isLeader }))
      .catch(() => {});
  }, []);

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
      setComments((prev) => [...prev.filter((c) => c.id !== data.id), data]);
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
      // 이 화면은 사라지므로 삭제 안내는 목록이 띄운다
      router.dismissTo({ pathname: '/(tabs)/crew', params: { tab: 'notices', flash: '공지를 삭제했어요.' } });
    } catch {
      setSnackbar('공지를 삭제하지 못했어요. 다시 시도해 주세요.');
    }
  };

  const deleteComment = async (comment: Comment) => {
    setCommentMenuOpen(false);
    const before = allComments;
    setComments(before.filter((c) => c.id !== comment.id));
    try {
      await api.mutate('DELETE /notice-comments/{commentId}', { commentId: comment.id });
    } catch {
      setComments(before);
      setSnackbar('댓글을 삭제하지 못했어요. 다시 시도해 주세요.');
    }
  };

  const openAuthor = (userId: string) =>
    userId === me?.id ? router.push('/(tabs)/profile') : router.push({ pathname: '/users/[id]', params: { id: userId } });

  const cameFromNotifications = (() => {
    const { routes, index } = navigation.getState() ?? { routes: [], index: 0 };
    return routes[index - 1]?.name === 'notifications';
  })();

  const targetAction = commentTarget && me ? commentAction({ authorId: commentTarget.author.id, meId: me.id, isLeader: me.isLeader }) : null;

  return (
    <Screen>
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
          onAction={() => (router.canGoBack() ? router.back() : router.replace({ pathname: '/(tabs)/crew', params: { tab: 'notices' } }))}
        />
      ) : !notice ? (
        failed ? (
          <ErrorState title="공지를 불러오지 못했어요" onRetry={() => load('first')} />
        ) : (
          <Loading label="공지를 불러오고 있어요" />
        )
      ) : (
        <>
          {/* 댓글 입력은 목록 길이와 상관없이 바닥(키보드 위)에 고정한다 */}
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ gap: space.md, paddingBottom: space.md }}
            keyboardShouldPersistTaps="handled"
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load('pull')} />}
          >
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
                comments.map((c, i) => (
                  <ListRow
                    key={c.id}
                    divider={i < comments.length - 1}
                    title={`${c.author.nickname} · ${monthDay(c.createdAt)}`}
                    subtitle={c.text}
                    left={<Avatar name={c.author.nickname} uri={c.author.photoUrl ?? undefined} size="sm" />}
                    right={
                      <IconButton
                        icon="dots-horizontal"
                        label="댓글 메뉴"
                        disabled={sending || !me}
                        onPress={() => {
                          setCommentTarget(c);
                          setCommentMenuOpen(true);
                        }}
                      />
                    }
                    chevron={false}
                    accessibilityLabel={`${c.author.nickname}, ${monthDay(c.createdAt)}, ${c.text}, 댓글 메뉴`}
                    accessibilityActions={me ? [{ name: 'menu', label: '댓글 메뉴' }] : undefined}
                    onAccessibilityAction={() => {
                      setCommentTarget(c);
                      setCommentMenuOpen(true);
                    }}
                    onLongPress={sending || !me ? undefined : () => {
                      setCommentTarget(c);
                      setCommentMenuOpen(true);
                    }}
                    onPress={() => openAuthor(c.author.id)}
                  />
                ))
              )}
            </View>
          </ScrollView>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingBottom: space.md }}>
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
              label="남기기"
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
          title="수정하기"
          onPress={() => {
            setMenuOpen(false);
            router.push({ pathname: '/crew/notices/edit', params: { id } });
          }}
        />
        <ListRow
          icon="delete-outline"
          title="삭제하기"
          tone="danger"
          chevron={false}
          onPress={() => {
            setMenuOpen(false);
            setConfirmDelete(true);
          }}
        />
      </BottomSheet>

      <BottomSheet visible={commentMenuOpen} onClose={() => setCommentMenuOpen(false)} title="댓글">
        {targetAction === 'delete' ? (
          <ListRow icon="delete-outline" title="삭제하기" tone="danger" chevron={false} onPress={() => commentTarget && deleteComment(commentTarget)} />
        ) : (
          <ListRow
            icon="flag-outline"
            title="신고하기"
            onPress={() => {
              const target = commentTarget;
              setCommentMenuOpen(false);
              if (target) router.push({ pathname: '/report', params: { targetType: 'NOTICE_COMMENT', targetId: target.id, nickname: target.author.nickname, photoUrl: target.author.photoUrl ?? '', text: target.text } });
            }}
          />
        )}
      </BottomSheet>

      <Dialog
        visible={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="이 공지를 삭제할까요?"
        actions={
          <>
            <Button label="남겨 두기" variant="ghost" size="md" onPress={() => setConfirmDelete(false)} />
            <Button label="삭제" variant="danger" size="md" onPress={deleteNotice} />
          </>
        }
      >
        <Txt variant="body">댓글도 함께 삭제되고 되돌릴 수 없어요.</Txt>
      </Dialog>

      <Snackbar visible={snackbar != null} message={snackbar ?? ''} onDismiss={() => setSnackbar(null)} />
    </Screen>
  );
}
