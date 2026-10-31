// 3-11 의 크루 나가기 · docs/screens/3-11-manage-crew-members.md §크루 나가기
import { useNetworkState } from 'expo-network';
import { router } from 'expo-router';
import { useState } from 'react';
import { Button, Card, Dialog, ListRow, Snackbar, Txt } from 'design-system/src';
import { ApiError, type ApiClient } from '../api/client';
import { getStored, loadLastAccount } from '../activity/store';
import { currentAccount, rememberAccount } from '../auth/account';
import { accountGate, leaveConfirm, leaveFailure } from '../profile/profile';

type Modal = { kind: 'blocked' } | { kind: 'checkFailed' } | { kind: 'confirm'; dissolve: boolean } | { kind: 'delegate' };

export function LeaveCrew({ api, crewName, isLeader }: { api: ApiClient; crewName: string; isLeader: boolean }) {
  const [modal, setModal] = useState<Modal | null>(null);
  const [busy, setBusy] = useState(false);
  const [snackbar, setSnackbar] = useState<string | null>(null);
  const network = useNetworkState();
  const offline = network.isConnected === false || network.isInternetReachable === false;

  const ask = async () => {
    if (busy) return;
    setBusy(true);
    try {
      if (offline) throw new ApiError('OFFLINE');
      const [{ data: current }, crew] = await Promise.all([api.get('GET /activities/current'), isLeader ? api.get('GET /crew') : null]);
      const local = loadLastAccount() ?? getStored();
      // 서버가 모르는 오프라인 진행 중 활동도 막는다 — 나가면 그 기록을 잃는다
      const hasCurrentActivity = current != null || (local.session != null && !local.ended);
      if (accountGate({ hasCurrentActivity, unsyncedCount: local.outbox.length }) === 'blocked') return setModal({ kind: 'blocked' });
      setModal({ kind: 'confirm', dissolve: crew != null && leaveConfirm({ isLeader, memberCount: crew.data.memberCount }) === 'dissolve' });
    } catch {
      setModal({ kind: 'checkFailed' });
    } finally {
      setBusy(false);
    }
  };

  const leave = async () => {
    if (busy) return;
    setBusy(true);
    const sentBy = currentAccount()?.id;
    try {
      if (offline) throw new ApiError('OFFLINE');
      await api.mutate('POST /crew/leave');
      const account = currentAccount();
      setModal(null);
      if (account?.id === sentBy) {
        if (account) rememberAccount({ id: account.id, membership: { status: 'NONE' } });
        // 떠나는 화면은 다시 그리지 않는다 — 전환 중 재렌더가 Fabric 을 죽인다
        return router.dismissTo({ pathname: '/crew-choice', params: { flash: '크루를 나갔어요.' } });
      }
    } catch (e) {
      const outcome = leaveFailure(e);
      if (outcome === 'delegate') setModal({ kind: 'delegate' });
      else if (outcome === 'blocked') setModal({ kind: 'blocked' });
      else setSnackbar('나가지 못했어요. 다시 시도해 주세요.');
    }
    setBusy(false);
  };

  const confirm = modal?.kind === 'confirm' ? modal : null;

  return (
    <>
      <Card style={{ paddingVertical: 0 }}>
        <ListRow
          title="크루 나가기"
          tone="danger"
          divider={false}
          subtitle={`${crewName}에서 나가요.`}
          accessibilityLabel={`크루 나가기, ${crewName}에서 나가기`}
          disabled={busy}
          onPress={ask}
        />
      </Card>

      <Dialog
        visible={modal?.kind === 'blocked'}
        onClose={() => setModal(null)}
        title="먼저 활동 종료와 동기화를 완료해 주세요"
        actions={
          <>
            <Button label="닫기" variant="ghost" size="md" onPress={() => setModal(null)} />
            <Button
              label="줍깅 탭으로 이동"
              size="md"
              onPress={() => {
                setModal(null);
                router.dismissTo('/(tabs)/plogging');
              }}
            />
          </>
        }
      >
        <Txt variant="body">진행 중이거나 아직 저장되지 않은 기록이 있어요. 줍깅 탭에서 종료와 동기화를 완료한 뒤 다시 시도해 주세요.</Txt>
      </Dialog>

      <Dialog
        visible={modal?.kind === 'checkFailed'}
        onClose={() => setModal(null)}
        title="기록 상태를 확인하지 못했어요"
        actions={
          <>
            <Button label="닫기" variant="ghost" size="md" onPress={() => setModal(null)} />
            <Button label="다시 시도" size="md" loading={busy} onPress={ask} />
          </>
        }
      >
        <Txt variant="body">연결 상태를 확인하고 다시 시도해 주세요. 기록은 그대로 남아 있어요.</Txt>
      </Dialog>

      <Dialog
        visible={confirm != null}
        onClose={() => !busy && setModal(null)}
        title={confirm?.dissolve ? '크루를 해산하고 나갈까요?' : '크루를 나갈까요?'}
        actions={
          <>
            <Button label="돌아가기" variant="ghost" size="md" disabled={busy} onPress={() => setModal(null)} />
            <Button label={confirm?.dissolve ? '해산하고 나가기' : '나가기'} variant="danger" size="md" loading={busy} onPress={leave} />
          </>
        }
      >
        <Txt variant="body">
          {confirm?.dissolve
            ? '혼자 남은 크루장이 나가면 크루가 해산돼요. 내 활동 기록은 남아요.'
            : `${crewName}에서 나가요. 크루원 목록에서 빠지고, 활동 기록과 게시물은 그대로 남아요. 다시 들어오려면 크루 찾기에서 다시 가입해야 해요.`}
        </Txt>
      </Dialog>

      {/* 위임할 크루원 목록이 바로 위에 있다 — 다른 화면으로 보내지 않는다 */}
      <Dialog
        visible={modal?.kind === 'delegate'}
        onClose={() => setModal(null)}
        title="위임한 뒤에 나갈 수 있어요"
        actions={<Button label="확인" size="md" onPress={() => setModal(null)} />}
      >
        <Txt variant="body">크루장은 다른 크루원에게 위임한 뒤에만 크루를 나갈 수 있어요. 크루원 목록의 더보기에서 크루장을 위임해 주세요.</Txt>
      </Dialog>

      <Snackbar visible={snackbar != null} message={snackbar ?? ''} onDismiss={() => setSnackbar(null)} />
    </>
  );
}
