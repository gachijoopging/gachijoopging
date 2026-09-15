import { useEffect, useRef, useState } from 'react';
import { AppState, BackHandler, RefreshControl, View } from 'react-native';
import { router } from 'expo-router';
import { AppHeader, Banner, Button, Card, Dialog, EmptyState, ErrorState, Icon, Loading, Screen, Txt } from 'design-system/src';
import { createMockClient, type ApiClient } from '../src/api/client';
import { resolvePendingRequest, type JoinRequestStatus, type MembershipStatus, type PendingRequestState } from '../src/auth/pending-request';

const api: ApiClient = createMockClient({ delayMs: 300 });

type JoinRequestData = Awaited<ReturnType<typeof api.get<'GET /crews/join-requests/mine'>>>['data'];
type JoinRequest = { crew: { name: string }; status: JoinRequestStatus };

function isJoinRequestStatus(value: string): value is JoinRequestStatus {
  return value === 'PENDING' || value === 'APPROVED' || value === 'REJECTED' || value === 'CANCELED';
}

function toJoinRequest(value: JoinRequestData): JoinRequest | undefined {
  if (!value || !isJoinRequestStatus(value.status)) return undefined;
  return { crew: { name: value.crew.name }, status: value.status };
}

function toMembershipStatus(value: string | undefined): MembershipStatus {
  if (value === 'PENDING' || value === 'MEMBER') return value;
  return 'NONE';
}

export default function PendingApprovalScreen() {
  const [request, setRequest] = useState<JoinRequest>();
  const [state, setState] = useState<PendingRequestState>();
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [cancelDialog, setCancelDialog] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [banner, setBanner] = useState<string>();
  const loadingRef = useRef(false);
  const hasLoadedRef = useRef(false);

  async function reload() {
    if (loadingRef.current || cancelling) return;
    loadingRef.current = true;
    setRefreshing(true);
    if (!hasLoadedRef.current) setError(false);
    try {
      const response = await api.get('GET /crews/join-requests/mine');
      const nextRequest = toJoinRequest(response.data);
      let membershipStatus: MembershipStatus = 'NONE';
      if (nextRequest?.status === 'APPROVED') {
        const me = await api.get('GET /users/me');
        membershipStatus = toMembershipStatus(me.data.membership?.status);
      }
      const nextState = resolvePendingRequest(nextRequest?.status, membershipStatus);
      setRequest(nextRequest);
      setState(nextState);
      hasLoadedRef.current = true;
      if (nextState === 'home') router.replace('/(tabs)');
    } catch {
      if (hasLoadedRef.current) setBanner('인터넷 연결을 확인해 주세요.');
      else setError(true);
    } finally {
      loadingRef.current = false;
      setRefreshing(false);
    }
  }

  useEffect(() => {
    void reload();
    const appStateSubscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') void reload();
    });
    const backSubscription = BackHandler.addEventListener('hardwareBackPress', () => {
      BackHandler.exitApp();
      return true;
    });
    return () => {
      appStateSubscription.remove();
      backSubscription.remove();
    };
  }, []);

  async function handleCancel() {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setCancelling(true);
    setCancelDialog(false);
    try {
      await api.mutate('DELETE /crews/join-requests/mine');
      router.replace('/1-6-create-or-join-crew');
    } catch {
      setBanner('신청을 취소하지 못했어요. 다시 시도해 주세요.');
    } finally {
      loadingRef.current = false;
      setCancelling(false);
    }
  }

  const isLoading = state === undefined && !error;

  return (
    <Screen scroll refreshControl={<RefreshControl refreshing={refreshing} onRefresh={reload} />}>
      <AppHeader title="가입 신청" onBack={() => BackHandler.exitApp()} backDisabled={refreshing || cancelling} />
      <View style={{ alignItems: 'center' }}>
        <Icon name="timer-sand" size="lg" />
        <Txt variant="title" bold>크루장 승인을 기다리고 있어요</Txt>
      </View>

      {isLoading ? <Loading label="신청을 확인하고 있어요" /> : null}
      {error ? <ErrorState title="신청을 불러오지 못했어요." description="네트워크 상태를 확인하고 다시 시도해 주세요." onRetry={reload} /> : null}
      {state === 'pending' && request ? (
        <>
          <Card accessible accessibilityLabel={`${request.crew.name}, 가입 신청을 보냈어요`}>
            <Txt variant="title">{request.crew.name}</Txt>
            <Txt variant="caption" tone="muted">가입 신청을 보냈어요</Txt>
          </Card>
          <Banner tone="neutral">크루장이 승인하면 크루원이 돼요.{"\n"}앱을 닫아도 신청은 그대로 남아요.</Banner>
          {banner ? <Banner tone="danger">{banner}</Banner> : null}
          <Button label="신청 취소" variant="ghost" size="lg" fullWidth loading={cancelling} disabled={refreshing || cancelling} onPress={() => setCancelDialog(true)} />
          <Button label="승인 상태 확인" variant="secondary" size="lg" fullWidth loading={refreshing} disabled={cancelling} onPress={reload} />
        </>
      ) : null}
      {state === 'rejected' ? <EmptyState icon="close-circle-outline" title="가입 신청이 승인되지 않았어요." description="유효한 초대 코드로 다시 신청하거나 다른 크루를 선택할 수 있어요." actionLabel="크루 선택하기" onAction={() => router.replace('/1-6-create-or-join-crew')} /> : null}
      {state === 'empty' ? <EmptyState title="가입 신청이 없어요." description="크루를 만들거나 초대 코드로 가입해 보세요." actionLabel="크루 선택하기" onAction={() => router.replace('/1-6-create-or-join-crew')} /> : null}

      <Dialog visible={cancelDialog} onClose={() => { if (!cancelling) setCancelDialog(false); }} title="가입 신청을 취소할까요?">
        <Txt variant="body">{request?.crew.name}에 다시 가입하려면 초대 코드를 입력해야 해요.</Txt>
        <Button label="계속 기다리기" variant="ghost" disabled={cancelling} onPress={() => setCancelDialog(false)} />
        <Button label="신청 취소" variant="primary" loading={cancelling} disabled={cancelling} onPress={handleCancel} />
      </Dialog>
    </Screen>
  );
}
