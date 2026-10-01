// 화면 3-8 · docs/screens/3-8-manage-join-requests.md
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, RefreshControl, View } from 'react-native';
import {
  AppHeader,
  Avatar,
  Banner,
  Button,
  Card,
  Dialog,
  EmptyState,
  ErrorState,
  List,
  Loading,
  Screen,
  Snackbar,
  Txt,
  size,
  space,
  useRipple,
} from 'design-system/src';
import { ApiError, createMockClient, type ApiClient } from '../../src/api/client';
import type { MOCKS } from '../../src/api/mocks.generated';
import { monthDay } from '../../src/crew/crew';
import { joinDecisionOutcome, type JoinDecision } from '../../src/crew/manage';

type JoinRequest = (typeof MOCKS)['GET /crew/join-requests']['data']['items'][number];

const api: ApiClient = createMockClient({ delayMs: 300 });

export default function ManageJoinRequestsScreen() {
  const [requests, setRequests] = useState<readonly JoinRequest[] | null>(null);
  const [pending, setPending] = useState(0);
  const [isLeader, setIsLeader] = useState<boolean | null>(null);
  const [failed, setFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ request: JoinRequest; decision: JoinDecision } | null>(null);
  const [snackbar, setSnackbar] = useState<string | null>(null);

  const generation = useRef(0);
  const cursor = useRef<string | null>(null);
  const loadingMore = useRef(false);
  const deciding = useRef(false);
  const [moreState, setMoreState] = useState<'idle' | 'loading' | 'failed'>('idle');
  useEffect(() => () => { generation.current += 1; }, []);

  const load = useCallback(async (mode: 'quiet' | 'pull') => {
    if (deciding.current) return;
    const request = ++generation.current;
    cursor.current = null;
    loadingMore.current = false;
    setMoreState('idle');
    if (mode === 'pull') setRefreshing(true);
    const [crewRes, listRes] = await Promise.allSettled([api.get('GET /crew'), api.get('GET /crew/join-requests')]);
    if (request !== generation.current) return;
    setRefreshing(false);
    if ((crewRes.status === 'rejected' && crewRes.reason instanceof ApiError && crewRes.reason.code === 'FORBIDDEN') ||
        (listRes.status === 'rejected' && listRes.reason instanceof ApiError && listRes.reason.code === 'FORBIDDEN')) {
      setIsLeader(false);
      return;
    }
    if (crewRes.status === 'rejected' || listRes.status === 'rejected') {
      setFailed(true);
      return;
    }
    setIsLeader(crewRes.value.data.isLeader);
    setPending(crewRes.value.data.pendingJoinRequests);
    setRequests(listRes.value.data.items);
    cursor.current = listRes.value.data.nextCursor;
    setFailed(false);
  }, []);

  useFocusEffect(useCallback(() => void load('quiet'), [load]));

  const loadMore = async () => {
    const next = cursor.current;
    if (!next || loadingMore.current || deciding.current || isLeader !== true) return;
    const request = generation.current;
    loadingMore.current = true;
    setMoreState('loading');
    try {
      const { data } = await api.get('GET /crew/join-requests', { cursor: next });
      if (request !== generation.current || cursor.current !== next) return;
      setRequests((previous) => {
        const ids = new Set(previous?.map((item) => item.id));
        return [...(previous ?? []), ...data.items.filter((item) => !ids.has(item.id))];
      });
      cursor.current = data.nextCursor;
      setMoreState('idle');
    } catch (error) {
      if (request !== generation.current) return;
      if (error instanceof ApiError && error.code === 'FORBIDDEN') setIsLeader(false);
      else setMoreState('failed');
    } finally {
      if (request === generation.current) loadingMore.current = false;
    }
  };

  const decide = async () => {
    if (!confirm || deciding.current || isLeader !== true) return;
    deciding.current = true;
    generation.current += 1;
    loadingMore.current = false;
    setMoreState('idle');
    setRefreshing(false);
    const { request, decision } = confirm;
    setConfirm(null);
    setBusyId(request.id);
    let error: unknown = null;
    try {
      await api.mutate('POST /crew/join-requests/{requestId}', { requestId: request.id, decision });
    } catch (e) {
      error = e;
    }
    const outcome = joinDecisionOutcome(decision, request.user.nickname, error);
    if (outcome.removeRow) {
      setRequests((prev) => prev?.filter((r) => r.id !== request.id) ?? prev);
      setPending((n) => Math.max(0, n - 1));
    }
    if (outcome.denied) setIsLeader(false);
    generation.current += 1;
    setBusyId(null);
    if (outcome.message) setSnackbar(outcome.message);
    deciding.current = false;
  };

  const back = () => (router.canGoBack() ? router.back() : router.replace('/crew/info'));

  const confirmTitle = confirm
    ? `${confirm.request.user.nickname} 님의 가입을 ${confirm.decision === 'APPROVE' ? '승인' : '거절'}할까요?`
    : '';

  return (
    <Screen>
      <AppHeader title="가입 신청 관리" onBack={back} />

      {isLeader === false ? (
        <ErrorState
          title="크루장만 가입 신청을 관리할 수 있어요."
          description={null}
          icon="lock-outline"
          actionLabel="크루 정보로"
          onRetry={() => router.dismissTo('/crew/info')}
        />
      ) : !requests ? (
        failed ? (
          <ErrorState title="가입 신청을 불러오지 못했어요" onRetry={() => load('quiet')} />
        ) : (
          <Loading label="가입 신청을 불러오고 있어요" />
        )
      ) : (
        <List
          data={requests}
          keyExtractor={(r) => r.id}
          gap={space.md}
          // 실패한 다음 장은 끝에 닿을 때마다 다시 부르지 않는다. 다시 시도 버튼으로만 부른다
          onEndReached={() => { if (moreState !== 'failed') void loadMore(); }}
          onEndReachedThreshold={0.5}
          refreshControl={<RefreshControl refreshing={refreshing} enabled={!busyId} onRefresh={() => load('pull')} />}
          ListHeaderComponent={
            requests.length > 0 ? (
              <View style={{ gap: space.md, paddingBottom: space.md }}>
                <Txt variant="section" accessibilityRole="header">{`대기 중인 가입 신청 ${pending}건`}</Txt>
                {failed ? <Banner tone="warn">인터넷 연결을 확인해 주세요.</Banner> : null}
              </View>
            ) : null
          }
          empty={<EmptyState icon="account-clock-outline" title="대기 중인 가입 신청이 없어요" />}
          renderItem={({ item: r }) => (
            <RequestRow
              request={r}
              busy={busyId === r.id}
              locked={busyId != null}
              onDecide={(decision) => setConfirm({ request: r, decision })}
            />
          )}
          ListFooterComponent={
            moreState === 'loading' ? <Loading label="가입 신청을 더 불러오고 있어요" /> : moreState === 'failed' ? <Button label="다시 시도" variant="ghost" onPress={loadMore} /> : cursor.current ? <Button label="더 불러오기" variant="ghost" disabled={busyId != null} onPress={loadMore} /> : null
          }
        />
      )}
      <Dialog
        visible={confirm != null}
        onClose={() => setConfirm(null)}
        title={confirmTitle}
        actions={
          <>
            <Button label="그대로 두기" variant="ghost" size="md" onPress={() => setConfirm(null)} />
            <Button
              label={confirm?.decision === 'APPROVE' ? '승인' : '거절'}
              variant={confirm?.decision === 'APPROVE' ? 'primary' : 'danger'}
              size="md"
              onPress={decide}
            />
          </>
        }
      />

      <Snackbar visible={snackbar != null} message={snackbar ?? ''} onDismiss={() => setSnackbar(null)} />
    </Screen>
  );
}

function RequestRow({
  request,
  busy,
  locked,
  onDecide,
}: {
  request: JoinRequest;
  busy: boolean;
  locked: boolean;
  onDecide: (decision: JoinDecision) => void;
}) {
  const ripple = useRipple();
  const { user } = request;
  const applied = `${monthDay(request.createdAt)} 가입 신청`;
  return (
    <Card style={{ gap: space.md }}>
      <Pressable
        android_ripple={ripple}
        accessibilityRole="button"
        accessibilityLabel={`${user.nickname}, ${applied}, 프로필 보기`}
        onPress={() => router.push({ pathname: '/users/[id]', params: { id: user.id } })}
        style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: size.minTouch }}
      >
        <Avatar name={user.nickname} uri={user.photoUrl ?? undefined} size="md" />
        <View style={{ flex: 1, gap: space.xs }}>
          <Txt variant="body" bold>{user.nickname}</Txt>
          <Txt variant="caption" tone="muted">{applied}</Txt>
        </View>
      </Pressable>
      {/* sm 버튼의 hitSlop 이 겹치지 않을 만큼 띄운다. 승인은 되돌릴 수 없어 잘못 눌리면 안 된다 */}
      <View style={{ flexDirection: 'row', gap: space.xl, justifyContent: 'flex-end' }}>
        <Button
          label="거절"
          variant="ghost"
          size="sm"
          disabled={locked}
          accessibilityLabel={`${user.nickname} 님 가입 거절`}
          onPress={() => onDecide('REJECT')}
        />
        <Button
          label="승인"
          size="sm"
          loading={busy}
          disabled={locked}
          accessibilityLabel={`${user.nickname} 님 가입 승인`}
          onPress={() => onDecide('APPROVE')}
        />
      </View>
    </Card>
  );
}
