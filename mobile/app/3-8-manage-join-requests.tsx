import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
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
  Loading,
  Screen,
  Snackbar,
  Txt,
  space,
  useRipple,
} from 'design-system/src';
import { ApiError, createMockClient, type ApiClient } from '../src/api/client';
import type { MOCKS } from '../src/api/mocks.generated';
import { monthDay } from '../src/crew/crew';
import { joinDecisionOutcome, type JoinDecision } from '../src/crew/manage';

type JoinRequest = (typeof MOCKS)['GET /crew/join-requests']['data'][number];

const api: ApiClient = createMockClient({ delayMs: 300 });

export default function ManageJoinRequestsScreen() {
  const [requests, setRequests] = useState<readonly JoinRequest[] | null>(null);
  const [isLeader, setIsLeader] = useState(true);
  const [failed, setFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ request: JoinRequest; decision: JoinDecision } | null>(null);
  const [snackbar, setSnackbar] = useState<string | null>(null);

  const load = useCallback(async (mode: 'quiet' | 'pull') => {
    if (mode === 'pull') setRefreshing(true);
    const [crewRes, listRes] = await Promise.allSettled([api.get('GET /crew'), api.get('GET /crew/join-requests')]);
    setRefreshing(false);
    if (crewRes.status === 'fulfilled') setIsLeader(crewRes.value.data.isLeader);
    if (listRes.status === 'fulfilled') {
      setRequests(listRes.value.data);
      setFailed(false);
    } else if (listRes.reason instanceof ApiError && listRes.reason.code === 'FORBIDDEN') {
      setIsLeader(false);
    } else {
      setFailed(true);
    }
  }, []);

  useFocusEffect(useCallback(() => void load('quiet'), [load]));

  const decide = async () => {
    if (!confirm) return;
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
    if (outcome.removeRow) setRequests((prev) => prev?.filter((r) => r.id !== request.id) ?? prev);
    setBusyId(null);
    setSnackbar(outcome.message);
  };

  const back = () => (router.canGoBack() ? router.back() : router.replace('/3-2-crew-info'));

  return (
    <Screen scroll refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load('pull')} />}>
      <AppHeader title="가입 신청 관리" onBack={back} />

      {!isLeader ? (
        <EmptyState
          icon="lock-outline"
          title="크루장만 가입 신청을 관리할 수 있어요."
          actionLabel="크루 정보로"
          onAction={() => router.replace('/3-2-crew-info')}
        />
      ) : !requests ? (
        failed ? (
          <ErrorState title="가입 신청을 불러오지 못했어요" onRetry={() => load('quiet')} />
        ) : (
          <Loading label="가입 신청을 불러오고 있어요" />
        )
      ) : requests.length === 0 ? (
        <EmptyState
          icon="account-clock-outline"
          title="대기 중인 가입 신청이 없어요"
          description="새 신청이 들어오면 여기에서 승인하거나 거절할 수 있어요."
        />
      ) : (
        <>
          <Txt variant="section" accessibilityRole="header">{`대기 중인 가입 신청 ${requests.length}건`}</Txt>
          {failed ? <Banner tone="warn">인터넷 연결을 확인해 주세요.</Banner> : null}
          {requests.map((r) => (
            <RequestRow
              key={r.id}
              request={r}
              busy={busyId === r.id}
              onDecide={(decision) => setConfirm({ request: r, decision })}
            />
          ))}
          <Banner tone="neutral">승인된 사람은 바로 크루원이 돼요.</Banner>
        </>
      )}

      <Dialog
        visible={confirm != null}
        onClose={() => setConfirm(null)}
        title={
          confirm
            ? `${confirm.request.user.nickname} 님의 가입을 ${confirm.decision === 'APPROVE' ? '승인' : '거절'}할까요?`
            : ''
        }
      >
        <Txt variant="body" tone="muted" accessibilityLiveRegion="polite">
          {confirm?.decision === 'APPROVE'
            ? '승인하면 바로 크루원이 돼요.'
            : '거절한 뒤에도 현재 유효한 초대 코드로 다시 가입 신청할 수 있어요.'}
        </Txt>
        <View style={{ flexDirection: 'row', gap: space.sm, justifyContent: 'flex-end' }}>
          <Button label="취소" variant="ghost" size="md" onPress={() => setConfirm(null)} />
          <Button
            label={confirm?.decision === 'APPROVE' ? '승인' : '거절'}
            variant={confirm?.decision === 'APPROVE' ? 'primary' : 'danger'}
            size="md"
            onPress={decide}
          />
        </View>
      </Dialog>

      <Snackbar visible={snackbar != null} message={snackbar ?? ''} onDismiss={() => setSnackbar(null)} />
    </Screen>
  );
}

function RequestRow({
  request,
  busy,
  onDecide,
}: {
  request: JoinRequest;
  busy: boolean;
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
        onPress={() => router.push({ pathname: '/5-4-user-profile', params: { id: user.id } })}
        style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 48 }}
      >
        <Avatar name={user.nickname} uri={user.photoUrl ?? undefined} size="md" />
        <View style={{ flex: 1, gap: space.xs }}>
          <Txt variant="body" bold>{user.nickname}</Txt>
          <Txt variant="caption" tone="muted">{applied}</Txt>
        </View>
      </Pressable>
      <View style={{ flexDirection: 'row', gap: space.sm, justifyContent: 'flex-end' }}>
        <Button
          label="거절"
          variant="ghost"
          size="sm"
          disabled={busy}
          accessibilityLabel={`${user.nickname} 님 가입 거절`}
          onPress={() => onDecide('REJECT')}
        />
        <Button
          label="승인"
          size="sm"
          loading={busy}
          accessibilityLabel={`${user.nickname} 님 가입 승인`}
          onPress={() => onDecide('APPROVE')}
        />
      </View>
    </Card>
  );
}
