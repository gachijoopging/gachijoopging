// 화면 1-9 · docs/screens/1-9-pending-approval.md
import { useCallback, useRef, useState } from 'react';
import { AppState, BackHandler, RefreshControl, View } from 'react-native';
import { router, useFocusEffect, useNavigation } from 'expo-router';
import { addNotificationReceivedListener, addNotificationResponseReceivedListener } from 'expo-notifications';
import { AppHeader, Banner, Button, Card, Dialog, ErrorState, Icon, IconButton, Loading, Screen, Snackbar, Txt } from 'design-system/src';
import { ApiError } from '../../src/api/client';
import { onboardingApi as api } from '../../src/api/onboarding';
import { resolvePendingRequest, type JoinRequestStatus, type MembershipStatus, type PendingRequestState } from '../../src/auth/pending-request';
import { finishOnboarding, type OnboardingNavigation } from '../../src/auth/navigation';
import { useFlash } from '../../src/ui/useFlash';

type JoinRequestData = Awaited<ReturnType<typeof api.get<'GET /crews/join-requests/mine'>>>['data'];
type JoinRequest = { id: string; crew: { name: string }; status: JoinRequestStatus };

function isJoinRequestStatus(value: string): value is JoinRequestStatus {
  return value === 'PENDING' || value === 'APPROVED' || value === 'REJECTED' || value === 'CANCELED';
}

function toJoinRequest(value: JoinRequestData): JoinRequest | undefined {
  if (!value || !isJoinRequestStatus(value.status)) return undefined;
  return { id: value.id, crew: { name: value.crew.name }, status: value.status };
}

function toMembershipStatus(value: string | undefined): MembershipStatus {
  if (value === 'PENDING' || value === 'MEMBER') return value;
  return 'NONE';
}

export default function PendingApprovalScreen() {
  const navigation = useNavigation<OnboardingNavigation>('/');
  const [request, setRequest] = useState<JoinRequest>();
  const [state, setState] = useState<PendingRequestState>();
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [cancelDialog, setCancelDialog] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [confirmingRejection, setConfirmingRejection] = useState(false);
  const [banner, setBanner] = useState<string>();
  const [flash, setFlash] = useFlash();
  const loadingRef = useRef(false);
  const hasLoadedRef = useRef(false);

  const reload = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setRefreshing(true);
    setBanner(undefined);
    if (!hasLoadedRef.current) setError(false);
    try {
      const response = await api.get('GET /crews/join-requests/mine');
      const nextRequest = toJoinRequest(response.data);
      if (nextRequest?.status === 'APPROVED') {
        setRequest(nextRequest);
        setState('confirming');
        setError(false);
        hasLoadedRef.current = true;
      }
      const me = await api.get('GET /users/me');
      const { membership } = me.data;
      const rejection = membership.status === 'NONE' ? membership.rejection : null;
      // 거절 안내는 확인하지 않은 거절(rejection)일 때만 보인다. 신청 조회는 확인한 거절도 REJECTED 로 돌려준다
      const shown: JoinRequest | undefined = nextRequest?.status === 'PENDING' || nextRequest?.status === 'APPROVED'
        ? nextRequest
        : rejection ? { id: rejection.requestId, crew: { name: rejection.crew.name }, status: 'REJECTED' } : undefined;
      const nextState = resolvePendingRequest(shown?.status, toMembershipStatus(membership.status));
      setRequest(shown);
      setState(nextState);
      hasLoadedRef.current = true;
      setError(false);
      if (nextState === 'home') finishOnboarding(navigation, '/(tabs)', { flash: '크루 가입이 승인됐어요.' });
      if (nextState === 'choice') finishOnboarding(navigation, '/crew-choice');
    } catch {
      if (hasLoadedRef.current) setBanner('인터넷 연결을 확인해 주세요.');
      else setError(true);
    } finally {
      loadingRef.current = false;
      setRefreshing(false);
    }
  }, [navigation]);

  useFocusEffect(useCallback(() => {
    void reload();
    const appStateSubscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') void reload();
    });
    const backSubscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!loadingRef.current) BackHandler.exitApp();
      return true;
    });
    const received = addNotificationReceivedListener(() => { void reload(); });
    const opened = addNotificationResponseReceivedListener(() => { void reload(); });
    return () => {
      appStateSubscription.remove();
      backSubscription.remove();
      received.remove();
      opened.remove();
    };
  }, [reload]));

  async function handleCancel() {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setCancelling(true);
    setCancelDialog(false);
    try {
      await api.mutate('DELETE /crews/join-requests/mine');
      finishOnboarding(navigation, '/crew-choice', { flash: '가입 요청을 취소했어요.' });
    } catch {
      setFlash('요청을 취소하지 못했어요. 다시 시도해 주세요.');
    } finally {
      loadingRef.current = false;
      setCancelling(false);
    }
  }

  async function confirmRejection() {
    if (loadingRef.current || !request) return;
    loadingRef.current = true;
    setConfirmingRejection(true);
    try {
      await api.mutate('POST /crews/join-requests/{requestId}/read', { requestId: request.id });
      finishOnboarding(navigation, '/crew-choice');
    } catch (e) {
      // 404 는 이미 확인했거나 처리된 것이다. 그 밖의 실패에 1-6 으로 넘기면 다음 로그인에 같은 안내가 다시 뜬다
      if (e instanceof ApiError && e.code === 'NOT_FOUND') finishOnboarding(navigation, '/crew-choice');
      else setFlash('확인하지 못했어요. 다시 시도해 주세요.');
    } finally {
      loadingRef.current = false;
      setConfirmingRejection(false);
    }
  }

  const isLoading = state === undefined && !error;
  const rejected = state === 'rejected';
  const crewName = request?.crew.name ?? '';
  const title = rejected ? '가입 신청이 승인되지 않았어요' : crewName ? `${crewName} 크루 가입 승인 대기 중입니다.` : '크루 가입 승인 대기 중입니다.';
  const busy = cancelling || confirmingRejection;

  return (
    <Screen
      scroll
      refreshControl={<RefreshControl refreshing={refreshing} enabled={state === 'pending'} onRefresh={reload} />}
    >
      <AppHeader title="가입 신청" action={<IconButton icon="cog-outline" label="설정" disabled={busy} onPress={() => router.push('/settings')} />} />
      <View
        style={{ alignItems: 'center' }}
        accessible
        accessibilityLiveRegion="polite"
        accessibilityLabel={rejected ? `${crewName} 가입 신청이 승인되지 않았어요` : title}
      >
        <Icon name={rejected ? 'close-circle-outline' : 'timer-sand'} />
        <Txt variant="title" bold style={{ textAlign: 'center' }}>{title}</Txt>
      </View>

      {isLoading ? <Loading label="신청을 확인하고 있어요" /> : null}
      {error ? <ErrorState title="신청을 불러오지 못했어요" description="네트워크 상태를 확인하고 다시 시도해 주세요." onRetry={reload} /> : null}
      {state === 'pending' && request ? (
        <>
          <Card accessible accessibilityLabel={`${crewName}, 크루장이 승인하면 크루원이 돼요`}>
            <Txt variant="title">{crewName}</Txt>
            <Txt variant="caption" tone="muted">크루장이 승인하면 크루원이 돼요</Txt>
          </Card>
          <Button label="요청 취소" accessibilityLabel={`${crewName} 가입 요청 취소`} variant="ghost" size="lg" fullWidth loading={cancelling} disabled={refreshing || cancelling} onPress={() => setCancelDialog(true)} />
          <Button label="다시 확인하기" variant="soft" size="lg" fullWidth loading={refreshing} disabled={cancelling} onPress={reload} />
          <Button
            label="내 활동 기록 보기"
            variant="ghost"
            size="lg"
            fullWidth
            accessibilityLabel="내 활동 기록 보기, 이전 크루의 내 기록 포함"
            disabled={cancelling}
            onPress={() => router.push('/records')}
          />
        </>
      ) : null}
      {state === 'confirming' ? <>
        <Banner tone="info">가입 승인을 확인하고 있어요. 소속 확인이 끝나면 홈으로 이동해요.</Banner>
        <Button label="다시 확인하기" loading={refreshing} onPress={reload} />
      </> : null}
      {banner ? <Banner tone="danger">{banner}</Banner> : null}
      {rejected && request ? (
        <>
          <Card accessible accessibilityLabel={`${crewName}, 다른 크루를 찾거나 다시 신청할 수 있어요`}>
            <Txt variant="title">{crewName}</Txt>
            <Txt variant="caption" tone="muted">다른 크루를 찾거나 다시 신청할 수 있어요</Txt>
          </Card>
          <Button label="확인" accessibilityLabel="거절 안내 확인, 크루 선택으로 이동" size="lg" fullWidth loading={confirmingRejection} disabled={confirmingRejection} onPress={confirmRejection} />
        </>
      ) : null}

      <Dialog
        visible={cancelDialog}
        onClose={() => { if (!cancelling) setCancelDialog(false); }}
        title="가입 요청을 취소할까요?"
        actions={
          <>
            <Button label="계속 기다리기" variant="ghost" size="md" disabled={cancelling} onPress={() => setCancelDialog(false)} />
            <Button label="요청 취소" variant="danger" size="md" loading={cancelling} disabled={cancelling} onPress={handleCancel} />
          </>
        }
      >
        <Txt variant="body">취소하면 다른 크루를 찾거나 만들 수 있어요. 이 크루에 들어가려면 다시 신청해야 해요.</Txt>
      </Dialog>
      <Snackbar visible={flash != null} message={flash ?? ''} onDismiss={() => setFlash(null)} />
    </Screen>
  );
}
