import * as Crypto from 'expo-crypto';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  FlatList,
  Pressable,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import {
  AppHeader,
  Avatar,
  Banner,
  BottomSheet,
  Button,
  Chip,
  ErrorState,
  Field,
  Icon,
  IconButton,
  ListRow,
  Loading,
  Screen,
  Snackbar,
  Txt,
  gradient,
  radius,
  space,
  useTheme,
} from 'design-system/src';
import { createMockClient, type ApiClient } from '../src/api/client';
import { resolveDestination } from '../src/auth/destination';
import { kstToday } from '../src/crew/calendar';
import {
  CHAT_MAX,
  canSendChat,
  charCounter,
  chatRows,
  chatSession,
  chatTime,
  emptyChat,
  enqueue,
  markDeleted,
  markFailed,
  mergeHistory,
  receive,
  retry,
  saveChatSession,
  type ChatItem,
  type ChatMessage,
  type ChatRow,
  type ChatState,
} from '../src/crew/chat';
import { createMockChatSocket, type ChatSocket, type ChatSocketEvent } from '../src/crew/chat-socket';

const api: ApiClient = createMockClient({ delayMs: 300 });
/** 전송 실패·다시 보내기를 목으로 보려면 dropEcho 를 켠다 */
const MOCK_SOCKET = { dropEcho: false };
const PAGE = 50;
// 전송 실패 판정 시간은 3-7 문서의 미결(운영 파라미터)이다. 확정되면 이 값만 바꾼다
const SEND_TIMEOUT_MS = 10_000;
const READ_DEBOUNCE_MS = 1000;
const NEAR_EDGE = 80;

type Me = { author: ChatMessage['author']; isLeader: boolean; crewId: string };

const lastSeqOf = (items: readonly ChatItem[]) =>
  items.reduce((max, i) => (i.status === 'sent' && i.seq > max ? i.seq : max), 0);
const firstSeqOf = (items: readonly ChatItem[]) => items.find((i) => i.status === 'sent')?.seq;
/** "오후 3:24" → "오후 3시 24분" */
const spokenTime = (iso: string) => chatTime(iso).replace(/:0?(\d+)/, '시 $1분');

export default function CrewChatScreen() {
  const [me, setMe] = useState<Me | null>(null);
  const [memberCount, setMemberCount] = useState<number | null>(null);
  const [chat, setChat] = useState<ChatState>(emptyChat);
  const [phase, setPhase] = useState<'loading' | 'error' | 'ready'>('loading');
  const [olderState, setOlderState] = useState<'idle' | 'loading' | 'failed'>('idle');
  const [connected, setConnected] = useState(true);
  const [text, setText] = useState('');
  const [pill, setPill] = useState(false);
  const [reportTarget, setReportTarget] = useState<ChatItem | null>(null);
  const [snackbar, setSnackbar] = useState<string | null>(null);

  const chatRef = useRef(chat);
  chatRef.current = chat;
  const textRef = useRef(text);
  const meRef = useRef(me);
  meRef.current = me;
  const socketRef = useRef<ChatSocket | null>(null);
  const listRef = useRef<FlatList<ChatRow>>(null);
  const atBottom = useRef(true);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  const readTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const update = useCallback((next: (s: ChatState) => ChatState) => {
    chatRef.current = next(chatRef.current);
    setChat(chatRef.current);
  }, []);

  const markRead = useCallback(() => {
    if (readTimer.current) clearTimeout(readTimer.current);
    readTimer.current = setTimeout(() => {
      readTimer.current = null;
      const lastSeq = lastSeqOf(chatRef.current.items);
      if (lastSeq > 0) api.mutate('PUT /crew/chat/read', { lastSeq }).catch(() => {});
    }, READ_DEBOUNCE_MS);
  }, []);

  const transmit = useCallback(
    (id: string, body: string) => {
      socketRef.current?.send({ id, text: body });
      const timer = setTimeout(() => {
        timers.current.delete(timer);
        update((s) => markFailed(s, id));
      }, SEND_TIMEOUT_MS);
      timers.current.add(timer);
    },
    [update],
  );

  const onEvent = useCallback(
    (event: ChatSocketEvent) => {
      if (event.type === 'CHAT_DELETED') return update((s) => markDeleted(s, event.data.seq));
      const fromOther = event.data.author.id !== meRef.current?.author.id;
      update((s) => receive(s, event.data));
      if (!fromOther) return;
      if (atBottom.current) markRead();
      else {
        setPill(true);
        AccessibilityInfo.announceForAccessibility('새 메시지가 도착했어요');
      }
    },
    [markRead, update],
  );

  const fillGap = useCallback(async () => {
    for (;;) {
      const afterSeq = lastSeqOf(chatRef.current.items);
      const { data } = await api.get('GET /crew/chat/messages', { afterSeq, limit: PAGE });
      update((s) => mergeHistory(s, 'after', data));
      if (!data.hasMore || !data.items.length) return;
    }
  }, [update]);

  const onClosed = useCallback(async (code: 4401 | 4403, socket: ChatSocket) => {
    if (code === 4401) {
      // 배너는 "연결 중…" 그대로. 갱신이 실패하면 재로그인으로 가되 초안·미전송 큐는 떠날 때 보존된다
      setConnected(false);
      try {
        await api.mutate('POST /auth/refresh');
        socket.reconnect();
      } catch {
        router.replace('/1-1-start');
      }
      return;
    }
    // 추방·나가기·해산. 배너 없이 소속 상태대로 보내고 이 화면은 스택에서 지운다
    try {
      const { data } = await api.get('GET /users/me');
      if (router.canDismiss()) router.dismissAll();
      router.replace(resolveDestination(data));
    } catch {
      router.replace('/1-1-start');
    }
  }, []);

  const load = useCallback(async () => {
    setPhase('loading');
    try {
      const [{ data: user }, { data: page }] = await Promise.all([
        api.get('GET /users/me'),
        api.get('GET /crew/chat/messages', { limit: PAGE }),
      ]);
      const crew = user.membership.crew;
      const nextMe: Me = {
        author: { id: user.id, nickname: user.nickname, photoUrl: user.photoUrl, withdrawn: false },
        isLeader: !!crew?.isLeader,
        crewId: crew?.id ?? '',
      };
      setMe(nextMe);
      const session = chatSession({ meId: nextMe.author.id, crewId: nextMe.crewId });
      update(() => session.unsent.reduce(enqueue, mergeHistory(emptyChat(), 'initial', page)));
      textRef.current = session.draft;
      setText(session.draft);

      const socket = createMockChatSocket({ ...MOCK_SOCKET, author: nextMe.author, lastSeq: lastSeqOf(chatRef.current.items) });
      socketRef.current = socket;
      socket.subscribe(onEvent);
      let wasConnecting = false;
      socket.onStatus((status) => {
        if (typeof status === 'object') return void onClosed(status.closed, socket);
        if (status === 'connecting') {
          wasConnecting = true;
          setConnected(false);
          AccessibilityInfo.announceForAccessibility('연결 중');
          return;
        }
        setConnected(true);
        if (!wasConnecting) return;
        wasConnecting = false;
        setSnackbar('연결이 복구됐어요.');
        fillGap().catch(() => {});
        chatRef.current.items.forEach((i) => i.status === 'sending' && socket.send({ id: i.id, text: i.text }));
      });
      session.unsent.forEach((i) => i.status === 'sending' && transmit(i.id, i.text));

      setPhase('ready');
      markRead();
    } catch {
      setPhase('error');
    }
  }, [fillGap, markRead, onClosed, onEvent, transmit, update]);

  useEffect(() => {
    void load();
    api.get('GET /crew').then(({ data }) => setMemberCount(data.memberCount)).catch(() => {});
  }, [load]);

  useEffect(
    () => () => {
      const current = meRef.current;
      if (current) saveChatSession({ meId: current.author.id, crewId: current.crewId }, chatRef.current, textRef.current);
      timers.current.forEach(clearTimeout);
      if (readTimer.current) clearTimeout(readTimer.current);
      const lastSeq = lastSeqOf(chatRef.current.items);
      if (lastSeq > 0) api.mutate('PUT /crew/chat/read', { lastSeq }).catch(() => {});
      socketRef.current?.close();
    },
    [],
  );

  const loadOlder = async () => {
    const beforeSeq = firstSeqOf(chatRef.current.items);
    if (olderState === 'loading' || chatRef.current.reachedStart || beforeSeq == null) return;
    setOlderState('loading');
    try {
      const { data } = await api.get('GET /crew/chat/messages', { beforeSeq, limit: PAGE });
      update((s) => mergeHistory(s, 'before', data));
      setOlderState('idle');
    } catch {
      setOlderState('failed');
    }
  };

  const changeText = (value: string) => {
    textRef.current = value;
    setText(value);
  };

  const send = () => {
    // 한 프레임 안의 연속 탭도 같은 글을 두 번 보내지 않도록 ref 에서 읽고 바로 비운다
    const body = textRef.current.trim();
    if (!me || !canSendChat(textRef.current)) return;
    changeText('');
    const id = Crypto.randomUUID();
    update((s) => enqueue(s, { id, author: me.author, text: body, createdAt: new Date().toISOString() }));
    atBottom.current = true;
    setPill(false);
    transmit(id, body);
  };

  const resend = (item: ChatItem) => {
    update((s) => retry(s, item.id));
    transmit(item.id, item.text);
  };

  const scrollToBottom = () => {
    atBottom.current = true;
    setPill(false);
    listRef.current?.scrollToEnd({ animated: true });
    markRead();
  };

  const onScroll = ({ nativeEvent: e }: NativeSyntheticEvent<NativeScrollEvent>) => {
    const bottom = e.contentSize.height - e.contentOffset.y - e.layoutMeasurement.height < NEAR_EDGE;
    if (bottom && !atBottom.current && pill) {
      setPill(false);
      markRead();
    }
    atBottom.current = bottom;
    if (e.contentOffset.y < NEAR_EDGE && olderState === 'idle') void loadOlder();
  };

  const openProfile = (author: ChatMessage['author']) =>
    router.push({ pathname: '/5-4-user-profile', params: { id: author.id } });

  const rows = me ? chatRows(chat.items, me.author.id, kstToday()) : [];
  const counter = charCounter(text);
  const ready = phase === 'ready';

  const listHeader = (
    <View style={{ alignItems: 'center', gap: space.sm, paddingVertical: space.sm }}>
      {olderState === 'loading' ? <ActivityIndicator /> : null}
      {olderState === 'failed' ? (
        <Pressable accessibilityRole="button" onPress={() => void loadOlder()} style={{ minHeight: 48, justifyContent: 'center' }}>
          <Txt variant="caption" tone="muted">이전 메시지를 불러오지 못했어요 · 다시 시도</Txt>
        </Pressable>
      ) : null}
      {chat.reachedStart ? <Chip label="크루원만 참여하는 채팅방이에요" tone="neutral" /> : null}
    </View>
  );

  return (
    <Screen>
      <AppHeader
        title="크루 채팅"
        subtitle={memberCount != null ? `크루원 ${memberCount}명` : ' '}
        onBack={() => router.back()}
      />
      {!connected ? (
        <View accessibilityLiveRegion="polite">
          <Banner tone="warn">연결 중…</Banner>
        </View>
      ) : null}

      <View style={{ flex: 1 }}>
        {phase === 'loading' ? (
          <Loading />
        ) : phase === 'error' ? (
          <ErrorState
            title="불러오지 못했어요"
            description="연결 상태를 확인하고 다시 시도해 주세요."
            onRetry={() => void load()}
          />
        ) : (
          <FlatList
            ref={listRef}
            data={rows}
            keyExtractor={(r) => r.key}
            ListHeaderComponent={listHeader}
            contentContainerStyle={{ gap: space.xs, paddingBottom: space.md }}
            maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
            keyboardDismissMode="on-drag"
            keyboardShouldPersistTaps="handled"
            onScroll={onScroll}
            scrollEventThrottle={100}
            onContentSizeChange={() => atBottom.current && listRef.current?.scrollToEnd({ animated: false })}
            renderItem={({ item: row }) =>
              row.type === 'date' ? (
                <View style={{ alignItems: 'center', paddingVertical: space.sm }}>
                  <Chip label={row.label} tone="neutral" />
                </View>
              ) : (
                <MessageRow
                  row={row}
                  onOpenProfile={openProfile}
                  onRetry={resend}
                  onReport={me && !me.isLeader ? setReportTarget : undefined}
                />
              )
            }
          />
        )}
        {pill ? (
          <View style={{ position: 'absolute', bottom: space.sm, alignSelf: 'center' }}>
            <Button
              label="새 메시지"
              icon="arrow-down"
              variant="soft"
              size="sm"
              accessibilityLabel="새 메시지, 맨 아래로 이동"
              onPress={scrollToBottom}
            />
          </View>
        ) : null}
      </View>

      <View style={{ gap: space.xs, paddingBottom: space.md, opacity: ready ? 1 : 0.5 }}>
        {counter ? (
          <Txt
            variant="micro"
            tone={counter.full ? 'error' : 'faint'}
            style={{ alignSelf: 'flex-end' }}
            accessibilityLabel={`${text.length}자, ${CHAT_MAX}자 중`}
          >
            {counter.label}
          </Txt>
        ) : null}
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: space.sm }}>
          <Field
            style={{ flex: 1 }}
            multiline
            placeholder="메시지 입력"
            accessibilityLabel="메시지 입력"
            value={text}
            onChangeText={changeText}
            maxLength={CHAT_MAX}
            editable={ready}
            maxLines={4}
          />
          <IconButton
            icon="send"
            tone="lime"
            label={ready && canSendChat(text) ? '보내기' : '보내기, 비활성'}
            disabled={!ready || !canSendChat(text)}
            onPress={send}
          />
        </View>
      </View>

      <BottomSheet visible={reportTarget != null} onClose={() => setReportTarget(null)} title="메시지">
        <ListRow
          icon="flag-outline"
          title="신고하기"
          onPress={() => {
            const target = reportTarget;
            setReportTarget(null);
            if (target) router.push({ pathname: '/6-1-report', params: { targetType: 'CHAT_MESSAGE', targetId: target.id } });
          }}
        />
      </BottomSheet>

      <Snackbar visible={snackbar != null} message={snackbar ?? ''} onDismiss={() => setSnackbar(null)} />
    </Screen>
  );
}

function MessageRow({
  row,
  onOpenProfile,
  onRetry,
  onReport,
}: {
  row: Extract<ChatRow, { type: 'message' }>;
  onOpenProfile: (author: ChatMessage['author']) => void;
  onRetry: (item: ChatItem) => void;
  onReport?: (item: ChatItem) => void;
}) {
  const { colors } = useTheme();
  const { item, mine, showAuthor, showTime } = row;
  const deleted = item.status === 'sent' && item.deleted;
  const failed = item.status === 'failed';
  const who = mine ? '나' : item.author.nickname;
  const state = item.status === 'sending' ? '전송 중' : failed ? '전송 실패, 다시 보내려면 두 번 탭' : spokenTime(item.createdAt);
  const label = deleted ? `${who}, 삭제된 메시지` : `${who}, ${item.text}, ${state}`;
  const reportable = !mine && !deleted && !item.author.withdrawn && onReport;

  const bubbleShape = {
    maxWidth: 260,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.tile,
    ...(mine ? { borderBottomRightRadius: space.xs } : { borderTopLeftRadius: space.xs }),
  };
  const content = (
    <Txt variant="body" tone={mine ? 'onLime' : 'ink'}>
      {item.text}
    </Txt>
  );

  return (
    <View style={{ alignItems: mine ? 'flex-end' : 'flex-start', gap: space.xs, marginTop: showAuthor ? space.sm : 0 }}>
      {showAuthor ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${item.author.nickname}, 프로필 보기`}
          disabled={item.author.withdrawn}
          onPress={() => onOpenProfile(item.author)}
          style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 48 }}
        >
          <Avatar name={item.author.nickname} uri={item.author.photoUrl ?? undefined} size="sm" />
          <Txt variant="caption" bold>
            {item.author.nickname}
          </Txt>
        </Pressable>
      ) : null}
      <Pressable
        accessible
        accessibilityLabel={label}
        disabled={!failed && !reportable}
        onPress={failed ? () => onRetry(item) : undefined}
        onLongPress={reportable ? () => onReport(item) : undefined}
        style={{ opacity: failed ? 0.5 : 1 }}
      >
        {deleted ? (
          <Txt variant="body" tone="faint">
            삭제된 메시지예요
          </Txt>
        ) : mine ? (
          <LinearGradient colors={gradient.primary.colors} start={gradient.primary.start} end={gradient.primary.end} style={bubbleShape}>
            {content}
          </LinearGradient>
        ) : (
          <View style={[bubbleShape, { backgroundColor: colors.surface }]}>{content}</View>
        )}
      </Pressable>
      {item.status === 'sending' ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs }}>
          <ActivityIndicator size="small" color={colors.inkFaint} />
          <Txt variant="micro" tone="faint">
            전송 중
          </Txt>
        </View>
      ) : failed ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs }}>
          <Icon name="alert-circle" size={14} color={colors.error} />
          <Txt variant="micro" tone="error">
            전송 실패 · 다시 보내기
          </Txt>
        </View>
      ) : showTime ? (
        <Txt variant="micro" tone="faint">
          {chatTime(item.createdAt)}
        </Txt>
      ) : null}
    </View>
  );
}
