import { router, useFocusEffect } from 'expo-router';
import { File, Paths } from 'expo-file-system';
import { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, Pressable, RefreshControl, View } from 'react-native';
import {
  BottomSheet,
  Banner,
  Button,
  Chip,
  Dot,
  EmptyState,
  ErrorState,
  IconButton,
  Loading,
  Screen,
  Snackbar,
  Tabs,
  Txt,
  disabledOpacity,
  pressedOpacity,
  radius,
  size,
  space,
  useRipple,
  useTheme,
} from 'design-system/src';
import { ApiError, createMockClient, type ApiClient } from '../../src/api/client';
import { canGoNextMonth, isFutureDate, kstToday, monthGrid, shiftMonth } from '../../src/crew/calendar';
import { PostCard } from '../../src/feed/PostCard';
import { beforeLabel, emptyCopy, syncLike, toggleLike, type FeedScope, type LikeSync, type Post } from '../../src/feed/feed';
import { leaveForMembership } from '../../src/feed/leave';
import { useFlash } from '../../src/ui/useFlash';
import { useBlockedUsers } from '../../src/profile/blocked-users';

const api: ApiClient = createMockClient({ delayMs: 300 });
const SCOPES: { value: FeedScope; label: string }[] = [
  { value: 'CREW', label: '전체' },
  { value: 'MINE', label: '내 게시물' },
];
const WEEK = ['일', '월', '화', '수', '목', '금', '토'];

const scopeFile = new File(Paths.document, 'feed-scope');
let lastScope: FeedScope = 'CREW';
try {
  if (scopeFile.exists && scopeFile.textSync() === 'MINE') lastScope = 'MINE';
} catch {}

type Page = { items: Post[]; nextCursor: string | null };

export default function FeedScreen() {
  const today = kstToday();
  const [scope, setScopeState] = useState<FeedScope>(lastScope);
  const [before, setBefore] = useState<string | null>(null);
  const [page, setPage] = useState<Page | null>(null);
  const [meId, setMeId] = useState<string>();
  const blocked = useBlockedUsers(meId);
  const [failed, setFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [moreState, setMoreState] = useState<'idle' | 'loading' | 'failed'>('idle');
  const liking = useRef(new Map<string, LikeSync>());
  const [pickerOpen, setPickerOpen] = useState(false);
  const [snackbar, setSnackbar] = useFlash();
  const listRef = useRef<FlatList<Post>>(null);
  const request = useRef(0);
  const firstPageSize = useRef(0);

  const load = useCallback(
    async (mode: 'first' | 'pull' | 'quiet') => {
      const id = ++request.current;
      setMoreState('idle');
      if (mode === 'first') {
        setPage(null);
        firstPageSize.current = 0;
      }
      if (mode === 'pull') setRefreshing(true);
      try {
        const { data } = await api.get('GET /crew/posts', { scope, before, limit: 20 });
        if (id !== request.current) return;
        const first = [...data.items] as Post[];
        const previousFirstSize = firstPageSize.current;
        firstPageSize.current = first.length;
        setPage((previous) => {
          if (mode !== 'quiet' || !previous) return { items: first, nextCursor: data.nextCursor };
          const ids = new Set(first.map((post) => post.id));
          const tail = previous.items.slice(previousFirstSize).filter((post) => !ids.has(post.id));
          return { items: [...first, ...tail], nextCursor: tail.length ? previous.nextCursor : data.nextCursor };
        });
        setFailed(false);
        setMoreState('idle');
      } catch (e) {
        if (id !== request.current) return;
        if (e instanceof ApiError && e.code === 'NO_CREW') return void leaveForMembership();
        setFailed(true);
        if (mode === 'pull') setSnackbar('새로고침에 실패했어요');
      } finally {
        if (id === request.current) setRefreshing(false);
      }
    },
    [scope, before, setSnackbar],
  );

  useEffect(() => {
    void load('first');
  }, [load]);

  // 5-2 에서 지운 글·5-4 에서 차단한 사람·바뀐 수를 돌아올 때 맞춘다. 스크롤은 그대로 둔다
  const mounted = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (mounted.current) void load('quiet');
      mounted.current = true;
    }, [load]),
  );

  // 5-6 에서 올리고 돌아오면 flash 가 붙어 온다 — 그때만 맨 위로
  useEffect(() => {
    if (snackbar === '게시물을 올렸어요') listRef.current?.scrollToOffset({ offset: 0, animated: true });
  }, [snackbar]);

  useEffect(() => {
    api.get('GET /users/me').then(({ data }) => setMeId(data.id)).catch(() => {});
  }, []);

  const setScope = (s: FeedScope) => {
    lastScope = s;
    try {
      scopeFile.write(s);
    } catch {
      setSnackbar('선택한 탭을 저장하지 못했어요');
    }
    setScopeState(s);
  };

  const loadMore = async () => {
    if (!page?.nextCursor || moreState === 'loading') return;
    const generation = request.current;
    const cursor = page.nextCursor;
    setMoreState('loading');
    try {
      const { data } = await api.get('GET /crew/posts', { scope, before, cursor, limit: 20 });
      if (generation !== request.current) return;
      setPage((p) => {
        if (!p || p.nextCursor !== cursor) return p;
        const ids = new Set(p.items.map((post) => post.id));
        return { items: [...p.items, ...(data.items as readonly Post[]).filter((post) => !ids.has(post.id))], nextCursor: data.nextCursor };
      });
      setMoreState('idle');
    } catch {
      if (generation !== request.current) return;
      setMoreState('failed');
    }
  };

  const updatePost = (id: string, fn: (p: Post) => Post) =>
    setPage((p) => p && { ...p, items: p.items.map((it) => (it.id === id ? fn(it) : it)) });

  const like = async (post: Post) => {
    // 연타해도 요청은 마지막 상태 하나로 모인다. 보내는 동안의 탭은 원하는 값만 바꾼다
    const running = liking.current.get(post.id);
    const st = running ?? { server: post.liked, wanted: post.liked };
    st.wanted = !st.wanted;
    updatePost(post.id, toggleLike);
    if (running) return;
    liking.current.set(post.id, st);
    try {
      await syncLike(st, (key) => api.mutate(key, { postId: post.id }));
    } catch (e) {
      if (e instanceof ApiError && e.code === 'NOT_FOUND') {
        setPage((p) => p && { ...p, items: p.items.filter((it) => it.id !== post.id) });
        setSnackbar('삭제된 게시물이에요');
      } else {
        updatePost(post.id, (p) => (p.liked === st.server ? p : toggleLike(p)));
        setSnackbar('좋아요를 반영하지 못했어요');
      }
    } finally {
      liking.current.delete(post.id);
    }
  };


  const openAuthor = (post: Post) =>
    post.author.id === meId ? router.push('/(tabs)/profile') : router.push({ pathname: '/users/[id]', params: { id: post.author.id } });

  const openPost = (post: Post, focusComment?: boolean) =>
    router.push({ pathname: '/posts/[id]', params: { id: post.id, ...(focusComment ? { focus: 'comment' } : {}) } });

  const write = () => router.push('/posts/new');
  const empty = emptyCopy(scope, before != null);
  const pill = before ? beforeLabel(before, today) : null;

  return (
    <Screen edges={['top', 'left', 'right']}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        <Txt variant="display" accessibilityRole="header" style={{ flex: 1 }}>피드</Txt>
        <View>
          <IconButton
            icon="calendar-month-outline"
            label={pill ? `날짜로 찾기, ${pill.replace(' 이전', ' 이전 보는 중')}` : '날짜로 찾기'}
            onPress={() => setPickerOpen(true)}
          />
          {pill ? (
            <View style={{ position: 'absolute', top: space.sm, right: space.sm }} pointerEvents="none">
              <Dot />
            </View>
          ) : null}
        </View>
        <Button label="글쓰기" icon="plus" size="sm" accessibilityLabel="글쓰기" onPress={write} />
      </View>

      <View style={{ gap: space.sm, paddingVertical: space.sm }}>
        <Tabs items={SCOPES} value={scope} onChange={setScope} fullWidth />
        {pill ? (
          <View style={{ alignSelf: 'flex-start' }}>
            <Chip label={pill} tone="neutral" icon="close" iconEnd accessibilityLabel={`${pill}, 필터 지우기`} onPress={() => setBefore(null)} />
          </View>
        ) : null}
        {page && failed ? <Banner tone="warn">인터넷 연결을 확인해 주세요.</Banner> : null}
      </View>

      {!page ? (
        failed ? (
          <ErrorState title="게시물을 불러오지 못했어요" description="연결 상태를 확인하고 다시 시도해 주세요." onRetry={() => load('first')} />
        ) : (
          <Loading label="게시물을 불러오고 있어요" />
        )
      ) : (
        <FlatList
          ref={listRef}
          data={page.items.filter((post) => !blocked.has(post.author.id))}
          keyExtractor={(p) => p.id}
          contentContainerStyle={{ gap: space.md, paddingBottom: space['3xl'], flexGrow: 1 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load('pull')} />}
          onEndReached={loadMore}
          onEndReachedThreshold={0.5}
          renderItem={({ item }) => (
            <PostCard
              post={item}
              meId={meId}
              mineTab={scope === 'MINE'}
              onOpen={(focus) => openPost(item, focus)}
              onAuthor={() => openAuthor(item)}
              onLike={() => like(item)}
            />
          )}
          ListEmptyComponent={
            <EmptyState
              icon="sprout-outline"
              title={empty.title}
              description={empty.description}
              actionLabel={empty.write ? '글쓰기' : undefined}
              onAction={empty.write ? write : undefined}
            />
          }
          ListFooterComponent={
            moreState === 'loading' ? (
              <Loading label="게시물을 불러오고 있어요" />
            ) : moreState === 'failed' ? (
              <Button label="다시 시도" variant="ghost" size="sm" onPress={loadMore} style={{ alignSelf: 'center' }} />
            ) : null
          }
        />
      )}

      <DatePickSheet
        visible={pickerOpen}
        today={today}
        value={before}
        onClose={() => setPickerOpen(false)}
        onPick={(d) => {
          setPickerOpen(false);
          setBefore(d);
        }}
      />

      <Snackbar visible={snackbar != null} message={snackbar ?? ''} onDismiss={() => setSnackbar(null)} />
    </Screen>
  );
}

function DatePickSheet({
  visible,
  today,
  value,
  onClose,
  onPick,
}: {
  visible: boolean;
  today: string;
  value: string | null;
  onClose: () => void;
  onPick: (date: string | null) => void;
}) {
  const [month, setMonth] = useState((value ?? today).slice(0, 7));
  const [selected, setSelected] = useState(value ?? today);

  useEffect(() => {
    if (!visible) return;
    setMonth((value ?? today).slice(0, 7));
    setSelected(value ?? today);
  }, [visible, value, today]);

  const [year, m] = month.split('-').map(Number);
  const weeks = (() => {
    const cells = monthGrid(month, []);
    return Array.from({ length: 6 }, (_, w) => cells.slice(w * 7, w * 7 + 7)).filter((wk) => wk.some((c) => c.inMonth));
  })();

  return (
    <BottomSheet visible={visible} onClose={onClose} title="날짜로 찾기">
      <View style={{ gap: space.sm }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <IconButton icon="chevron-left" label="이전 달" onPress={() => setMonth(shiftMonth(month, -1))} />
          <Txt variant="section" bold>{`${year}년 ${m}월`}</Txt>
          <IconButton icon="chevron-right" label="다음 달" disabled={!canGoNextMonth(month, today)} onPress={() => setMonth(shiftMonth(month, 1))} />
        </View>
        <View style={{ flexDirection: 'row' }} importantForAccessibility="no-hide-descendants">
          {WEEK.map((w) => (
            <Txt key={w} variant="caption" tone="muted" style={{ flex: 1, textAlign: 'center' }}>{w}</Txt>
          ))}
        </View>
        {weeks.map((wk) => (
          <View key={wk[0].date} style={{ flexDirection: 'row' }}>
            {wk.map((c) =>
              c.inMonth ? (
                <DayButton
                  key={c.date}
                  date={c.date}
                  selected={c.date === selected}
                  future={isFutureDate(c.date, today)}
                  onPress={() => setSelected(c.date)}
                />
              ) : (
                <View key={c.date} style={{ flex: 1, minHeight: size.minTouch }} />
              ),
            )}
          </View>
        ))}
        <Button label="이 날 이전 보기" fullWidth onPress={() => onPick(selected)} />
        {value ? <Button label="필터 지우기" variant="ghost" fullWidth onPress={() => onPick(null)} /> : null}
      </View>
    </BottomSheet>
  );
}

function DayButton({ date, selected, future, onPress }: { date: string; selected: boolean; future: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  const ripple = useRipple();
  const [, mm, dd] = date.split('-').map(Number);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${mm}월 ${dd}일${future ? ', 선택할 수 없음' : ''}`}
      accessibilityState={{ selected, disabled: future }}
      disabled={future}
      onPress={onPress}
      android_ripple={ripple}
      style={({ pressed }) => ({ flex: 1, minHeight: size.minTouch, padding: space.xs / 2, opacity: future ? disabledOpacity : pressedOpacity(pressed) })}
    >
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: radius.field, backgroundColor: selected ? colors.deep : undefined }}>
        <Txt variant="body" tone={selected ? 'onDark' : 'ink'}>{dd}</Txt>
      </View>
    </Pressable>
  );
}
