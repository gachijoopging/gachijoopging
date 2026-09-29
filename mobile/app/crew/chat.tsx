// 화면 3-7 · docs/screens/3-7-crew-chat.md
import * as Crypto from 'expo-crypto';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Animated,
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
  disabledOpacity,
  gradient,
  lineHeight,
  radius,
  size,
  space,
  useTheme,
} from 'design-system/src';
import { createMockClient, type ApiClient } from '../../src/api/client';
import { resolveDestination } from '../../src/auth/destination';
import { kstToday } from '../../src/crew/calendar';
import {
  CHAT_MAX,
  canSendChat,
  chatLimitNotice,
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
} from '../../src/crew/chat';
import { createMockChatSocket, type ChatSocket, type ChatSocketEvent } from '../../src/crew/chat-socket';
import { useFlash } from '../../src/ui/useFlash';

const api: ApiClient = createMockClient({ delayMs: 300 });
/** 전송 실패·다시 보내기를 목으로 보려면 dropEcho 를 켠다 */
const MOCK_SOCKET = { dropEcho: false };
const PAGE = 50;
/** 문서가 정한 말풍선 최대 너비(260dp). 화면 폭과 무관하게 한 줄 길이를 읽기 좋게 묶는다 */
const BUBBLE_MAX_WIDTH = 260;
/** 말풍선 꼬리 쪽 모서리. 둥근 반경의 1/4 로 각지게 보인다 */
const BUBBLE_TAIL_RADIUS = radius.tile / 4;
/** 상대 말풍선을 이름 열에 맞춘다 — 얼굴 폭 + 얼굴과 이름 사이 */
const AUTHOR_INDENT = size.avatarSm + space.sm;
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
  const { colors } = useTheme();
  const [me, setMe] = useState<Me | null>(null);
  const [memberCount, setMemberCount] = useState<number | null>(null);
  const [chat, setChat] = useState<ChatState>(emptyChat);
  const [phase, setPhase] = useState<'loading' | 'error' | 'ready'>('loading');
  const [olderState, setOlderState] = useState<'idle' | 'loading' | 'failed'>('idle');
  const [connected, setConnected] = useState(true);
  const [text, setText] = useState('');
  const [pill, setPill] = useState(false);
  const [reportTarget, setReportTarget] = useState<ChatItem | null>(null);
  const [snackbar, setSnackbar] = useFlash();

  const chatRef = useRef(chat);
  chatRef.current = chat;
  const textRef = useRef(text);
  const meRef = useRef(me);
  meRef.current = me;
  const socketRef = useRef<ChatSocket | null>(null);
  const listRef = useRef<FlatList<ChatRow>>(null);
  const atBottom = useRef(true);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const socketOpen = useRef(false);
  const alive = useRef(true);
  const initialScrolled = useRef(false);
  const readTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 읽음은 화면 바닥에서 본 메시지까지만 올린다
  const seenSeq = useRef(0);

  const update = useCallback((next: (s: ChatState) => ChatState) => {
    chatRef.current = next(chatRef.current);
    setChat(chatRef.current);
  }, []);

  const markRead = useCallback(() => {
    seenSeq.current = Math.max(seenSeq.current, lastSeqOf(chatRef.current.items));
    if (readTimer.current) clearTimeout(readTimer.current);
    readTimer.current = setTimeout(() => {
      readTimer.current = null;
      const lastSeq = seenSeq.current;
      if (lastSeq > 0) api.mutate('PUT /crew/chat/read', { lastSeq }).catch(() => {});
    }, READ_DEBOUNCE_MS);
  }, []);

  const transmit = useCallback(
    (id: string, body: string) => {
      clearTimeout(timers.current.get(id));
      timers.current.delete(id);
      // 끊긴 동안은 보내지 않고 전송 중으로 큐에 둔다. 실패는 연결된 채 echo 가 없을 때만이다
      if (!socketOpen.current) return;
      socketRef.current?.send({ id, text: body });
      timers.current.set(
        id,
        setTimeout(() => {
          timers.current.delete(id);
          update((s) => markFailed(s, id));
        }, SEND_TIMEOUT_MS),
      );
    },
    [update],
  );

  const onEvent = useCallback(
    (event: ChatSocketEvent) => {
      if (event.type === 'CHAT_DELETED') return update((s) => markDeleted(s, event.data.seq));
      const fromOther = event.data.author.id !== meRef.current?.author.id;
      clearTimeout(timers.current.get(event.data.id));
      timers.current.delete(event.data.id);
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
        router.replace('/start');
      }
      return;
    }
    // 추방·나가기·해산. 배너 없이 소속 상태대로 보내고 이 화면은 스택에서 지운다
    try {
      const { data } = await api.get('GET /users/me');
      if (router.canDismiss()) router.dismissAll();
      router.replace(resolveDestination(data));
    } catch {
      router.replace('/start');
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
      if (!alive.current) return;
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
        socketOpen.current = status === 'open';
        if (typeof status === 'object') return void onClosed(status.closed, socket);
        if (status === 'connecting') {
          wasConnecting = true;
          setConnected(false);
          return;
        }
        setConnected(true);
        if (!wasConnecting) return;
        wasConnecting = false;
        setSnackbar('연결이 복구됐어요.');
        fillGap().catch(() => {});
        chatRef.current.items.forEach((i) => i.status === 'sending' && transmit(i.id, i.text));
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
      alive.current = false;
      const current = meRef.current;
      if (current) saveChatSession({ meId: current.author.id, crewId: current.crewId }, chatRef.current, textRef.current);
      timers.current.forEach(clearTimeout);
      if (readTimer.current) clearTimeout(readTimer.current);
      const lastSeq = seenSeq.current;
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
    // 처음 맨 아래로 내리기 전의 0 위치에서 이전 페이지를 부르지 않는다
    if (initialScrolled.current && e.contentOffset.y < NEAR_EDGE && olderState === 'idle') void loadOlder();
  };

  const openProfile = (author: ChatMessage['author']) =>
    router.push({ pathname: '/users/[id]', params: { id: author.id } });

  const rows = me ? chatRows(chat.items, me.author.id, kstToday()) : [];
  const limitNotice = chatLimitNotice(text);
  const ready = phase === 'ready';

  const listHeader = (
    <View style={{ alignItems: 'center', gap: space.sm, paddingVertical: space.sm }}>
      {olderState === 'loading' ? <ActivityIndicator color={colors.deep} /> : null}
      {olderState === 'failed' ? (
        <Pressable accessibilityRole="button" onPress={() => void loadOlder()} style={{ minHeight: size.minTouch, justifyContent: 'center' }}>
          <Txt variant="caption" tone="muted">이전 메시지를 불러오지 못했어요 · 다시 시도</Txt>
        </Pressable>
      ) : null}
    </View>
  );

  return (
    <Screen>
      <AppHeader
        title="크루 채팅"
        subtitle={memberCount != null ? `크루원 ${memberCount}명` : ' '}
        onBack={() => router.back()}
      />
      <Fade visible={!connected}>
        <Banner tone="warn">연결 중…</Banner>
      </Fade>

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
            onContentSizeChange={() => {
              if (!atBottom.current) return;
              listRef.current?.scrollToEnd({ animated: false });
              initialScrolled.current = true;
            }}
            renderItem={({ item: row }) =>
              row.type === 'date' ? (
                <View style={{ paddingVertical: space.sm }}>
                  <CenteredChip label={row.label} />
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
        <Fade visible={pill} style={{ position: 'absolute', bottom: space.sm, alignSelf: 'center' }}>
            <Button
              label="새 메시지"
              icon="arrow-down"
              variant="soft"
              size="sm"
              accessibilityLabel="새 메시지, 맨 아래로 이동"
              onPress={scrollToBottom}
            />
        </Fade>
      </View>

      <View style={{ gap: space.xs, paddingBottom: space.md }}>
        {limitNotice ? (
          <Txt variant="micro" tone="error" style={{ alignSelf: 'flex-end' }} accessibilityLiveRegion="polite">
            {limitNotice}
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
            if (target) router.push({ pathname: '/report', params: { targetType: 'CHAT_MESSAGE', targetId: target.id, nickname: target.author.nickname, photoUrl: target.author.photoUrl ?? '', text: target.text } });
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
  const withdrawn = item.author.withdrawn;

  const bubbleShape = {
    maxWidth: BUBBLE_MAX_WIDTH,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.tile,
    ...(mine ? { borderBottomRightRadius: BUBBLE_TAIL_RADIUS } : { borderTopLeftRadius: BUBBLE_TAIL_RADIUS }),
  };
  const content = (
    <Txt variant="body" tone={mine ? 'onLime' : 'ink'}>
      {item.text}
    </Txt>
  );

  return (
    <View
      style={{
        alignItems: mine ? 'flex-end' : 'flex-start',
        gap: space.xs,
        marginTop: showAuthor ? space.sm : 0,
        paddingLeft: mine ? 0 : AUTHOR_INDENT,
      }}
    >
      {showAuthor ? (
        <Pressable
          accessibilityRole={withdrawn ? undefined : 'button'}
          accessibilityLabel={withdrawn ? item.author.nickname : `${item.author.nickname}, 프로필 보기`}
          disabled={withdrawn}
          onPress={() => onOpenProfile(item.author)}
          style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: size.minTouch, marginLeft: -AUTHOR_INDENT }}
        >
          <Avatar name={item.author.nickname} uri={item.author.photoUrl ?? undefined} size="sm" />
          <Txt variant="caption" bold>
            {item.author.nickname}
          </Txt>
        </Pressable>
      ) : null}
      <Pressable
        accessible
        accessibilityRole={failed ? 'button' : undefined}
        accessibilityLabel={label}
        accessibilityActions={reportable ? [{ name: 'longpress', label: '신고하기' }] : undefined}
        onAccessibilityAction={reportable ? () => onReport(item) : undefined}
        disabled={!failed && !reportable}
        onPress={failed ? () => onRetry(item) : undefined}
        onLongPress={reportable ? () => onReport(item) : undefined}
        style={{ opacity: failed ? disabledOpacity : 1 }}
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
          <Icon name="alert-circle" size={lineHeight.micro} color={colors.error} />
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

/** 배너·알약이 나타나고 사라질 때 짧게 페이드한다. 움직임 줄이기를 켰으면 바로 바뀐다 */
function Fade({ visible, style, children }: { visible: boolean; style?: object; children: ReactNode }) {
  const opacity = useRef(new Animated.Value(visible ? 1 : 0)).current;
  const [mounted, setMounted] = useState(visible);

  useEffect(() => {
    if (visible) setMounted(true);
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (cancelled) return;
      Animated.timing(opacity, { toValue: visible ? 1 : 0, duration: reduce ? 0 : 150, useNativeDriver: true }).start(
        ({ finished }) => finished && !visible && setMounted(false),
      );
    });
    return () => {
      cancelled = true;
    };
  }, [visible, opacity]);

  if (!mounted) return null;
  return <Animated.View style={[style, { opacity }]}>{children}</Animated.View>;
}

/** Chip 은 스스로 왼쪽에 붙는다(alignSelf). 감싼 쪽을 가운데로 둬야 가운데에 온다 */
function CenteredChip({ label }: { label: string }) {
  return (
    <View style={{ alignSelf: 'center' }}>
      <Chip label={label} tone="neutral" />
    </View>
  );
}
