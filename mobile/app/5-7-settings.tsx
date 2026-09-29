import Constants from 'expo-constants';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import {
  AppHeader,
  Banner,
  Button,
  Card,
  Dialog,
  ErrorState,
  ListRow,
  Loading,
  Screen,
  Snackbar,
  Switch,
  Txt,
  borderWidth,
  pressedOpacity,
  size,
  space,
  useRipple,
  useTheme,
} from 'design-system/src';
import { ApiError, createMockClient, type ApiClient } from '../src/api/client';
import { accountGate, leaveConfirm, leaveFailure, lockSetting } from '../src/profile/profile';
import { getStored } from '../src/activity/store';

type Me = {
  hasPassword: boolean;
  crewName: string | null;
  isLeader: boolean;
  shareLocationDefault: boolean;
  notifyActivityStart: boolean;
};
type SettingKey = 'shareLocationDefault' | 'notifyActivityStart';
type Kind = 'leave' | 'withdraw' | 'logout';
type Modal =
  | { kind: 'blocked'; action: Kind }
  | { kind: 'confirm'; action: Kind; dissolve: boolean }
  | { kind: 'delegate' }
  | { kind: 'checkFailed'; action: Kind };

const api: ApiClient = createMockClient({ delayMs: 300 });

const CONFIRM: Record<Kind, { title: string; body: (crew: string) => string; cancel: string; ok: string }> = {
  leave: {
    title: '크루를 나갈까요?',
    body: (crew) => `${crew}에서 나가요. 크루원 목록에서 빠지고, 활동 기록과 게시물은 그대로 남아요. 다시 가입하려면 초대 코드가 필요해요.`,
    cancel: '돌아가기',
    ok: '나가기',
  },
  withdraw: {
    title: '정말 탈퇴할까요?',
    body: () => '계정과 활동 상세 기록(경로 포함)이 삭제되고 되돌릴 수 없어요. 게시물과 크루 합산 기록은 "탈퇴한 크루원" 이름으로 남아요.',
    cancel: '계속 사용하기',
    ok: '탈퇴하기',
  },
  logout: {
    title: '로그아웃할까요?',
    body: () => '이 기기에서 로그아웃돼요. 기록·크루·게시물은 그대로라 다시 로그인하면 이어서 볼 수 있어요.',
    cancel: '취소',
    ok: '로그아웃',
  },
};

const DISSOLVE = {
  title: '크루를 해산하고 나갈까요?',
  leave: '혼자 남은 크루장이 나가면 크루가 해산돼요. 내 활동 기록은 남아요.',
  withdraw: '혼자 남은 크루장이 탈퇴하면 크루가 해산되고, 계정과 활동 상세 기록(경로 포함)이 삭제돼요. 되돌릴 수 없어요.',
  ok: '해산하고 나가기',
};

const BLOCKED: Record<Kind, string> = {
  leave: '진행 중이거나 아직 저장되지 않은 기록이 있어요. 줍깅 탭에서 종료와 동기화를 완료한 뒤 다시 시도해 주세요.',
  withdraw: '진행 중인 활동이 있으면 회원 탈퇴를 할 수 없어요. 줍깅 탭에서 종료와 동기화를 완료한 뒤 다시 시도해 주세요.',
  logout: '진행 중이거나 아직 저장되지 않은 기록이 있어요. 줍깅 탭에서 종료와 동기화를 완료한 뒤 다시 시도해 주세요.',
};

export default function SettingsScreen() {
  const [me, setMe] = useState<Me | null>(null);
  const [failed, setFailed] = useState(false);
  const [modal, setModal] = useState<Modal | null>(null);
  const [busy, setBusy] = useState(false);
  const [snackbar, setSnackbar] = useState<string | null>(null);
  const sending = useRef<SettingKey[]>([]);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get('GET /users/me');
      if (data.membership.status !== 'MEMBER') return router.replace(data.membership.status === 'PENDING' ? '/1-9-pending-approval' : '/1-6-create-or-join-crew');
      setMe({
        hasPassword: data.hasPassword,
        crewName: data.membership.crew?.name ?? null,
        isLeader: !!data.membership.crew?.isLeader,
        shareLocationDefault: data.settings.shareLocationDefault,
        notifyActivityStart: data.settings.notifyActivityStart,
      });
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, []);

  // 5-8·1-5·5-9 에서 돌아오면 바뀐 설정·hasPassword 를 맞춘다
  useFocusEffect(useCallback(() => void load(), [load]));

  const toggle = async (key: SettingKey) => {
    // 보내는 동안 다시 누르면 같은 값을 두 번 보낸다 — 응답이 올 때까지 그 키만 잠근다
    const locked = lockSetting(sending.current, key);
    if (!me || !locked) return;
    sending.current = locked;
    const next = !me[key];
    setMe((m) => (m ? { ...m, [key]: next } : m));
    try {
      await api.mutate('PATCH /users/me', { [key]: next });
    } catch {
      setMe((m) => (m ? { ...m, [key]: !next } : m));
      setSnackbar('설정을 저장하지 못했어요.');
    } finally {
      sending.current = sending.current.filter((k) => k !== key);
    }
  };

  const ask = async (action: Kind) => {
    if (busy || !me) return;
    setBusy(true);
    try {
      const [{ data: current }, crew] = await Promise.all([
        api.get('GET /activities/current'),
        action === 'logout' || !me.isLeader ? null : api.get('GET /crew'),
      ]);
      const local = getStored();
      const unsyncedCount = local.outbox.length;
      // 서버가 모르는 오프라인 진행 중 활동도 막는다 — 나가면 그 기록을 잃는다
      const hasCurrentActivity = current != null || (local.session != null && !local.ended);
      if (accountGate({ hasCurrentActivity, unsyncedCount }) === 'blocked') {
        setModal({ kind: 'blocked', action });
        return;
      }
      const dissolve = crew != null && leaveConfirm({ isLeader: me.isLeader, memberCount: crew.data.memberCount }) === 'dissolve';
      setModal({ kind: 'confirm', action, dissolve });
    } catch {
      setModal({ kind: 'checkFailed', action });
    } finally {
      setBusy(false);
    }
  };

  const commit = async (action: Kind) => {
    if (busy) return;
    setBusy(true);
    try {
      if (action === 'leave') {
        await api.mutate('POST /crew/leave');
        setModal(null);
        return router.dismissTo({ pathname: '/1-6-create-or-join-crew', params: { flash: '크루를 나갔어요.' } });
      }
      if (action === 'withdraw') {
        await api.mutate('DELETE /users/me');
        setModal(null);
        return router.dismissTo({ pathname: '/1-1-start', params: { flash: '탈퇴가 완료됐어요.' } });
      }
      // 세션 종료 요청이 실패해도 이 기기의 로그아웃은 끝낸다 — 활동·큐는 위에서 이미 비어 있음을 확인했다
      await api.mutate('POST /auth/logout').catch(() => {});
      setModal(null);
      return router.dismissTo('/1-1-start');
    } catch (e) {
      const outcome = leaveFailure(e);
      if (outcome === 'delegate') setModal({ kind: 'delegate' });
      else if (outcome === 'blocked') setModal({ kind: 'blocked', action });
      else setSnackbar(action === 'leave' ? '나가지 못했어요. 다시 시도해 주세요.' : '탈퇴하지 못했어요. 다시 시도해 주세요.');
    } finally {
      setBusy(false);
    }
  };

  const version = Constants.expoConfig?.version ?? '';

  return (
    <Screen scroll>
      <AppHeader title="설정" onBack={() => router.back()} />

      {!me ? (
        failed ? <ErrorState title="내 정보를 불러오지 못했어요" onRetry={load} /> : <Loading label="내 정보를 불러오고 있어요" />
      ) : (
        <>
          {failed ? <Banner tone="warn">인터넷 연결을 확인해 주세요.</Banner> : null}
          <Card padded={false}>
            <ListRow title="프로필 수정" subtitle="닉네임과 사진을 바꿔요." onPress={() => router.push('/5-8-edit-profile')} />
            <ToggleRow
              title="위치 공유 기본값"
              subtitle="활동을 시작할 때 미리 선택돼요."
              value={me.shareLocationDefault}
              onToggle={() => toggle('shareLocationDefault')}
            />
            <ToggleRow
              title="활동 시작 알림"
              subtitle="팔로우한 크루원이 활동을 시작하면 알려줘요."
              value={me.notifyActivityStart}
              onToggle={() => toggle('notifyActivityStart')}
            />
            <ListRow title="차단 관리" divider={false} onPress={() => router.push('/5-9-manage-blocks')} />
          </Card>

          <Card padded={false}>
            <ListRow
              title="크루 나가기"
              tone="danger"
              subtitle={me.crewName ? `${me.crewName}에서 나가요.` : undefined}
              accessibilityLabel={me.crewName ? `크루 나가기, ${me.crewName}에서 나가기` : '크루 나가기'}
              disabled={busy}
              onPress={() => ask('leave')}
            />
            {me.hasPassword ? (
              <ListRow title="비밀번호 재설정" subtitle="재설정 메일을 보낼 수 있어요." onPress={() => router.push('/1-5-reset-password')} />
            ) : null}
            <ListRow title="로그아웃" disabled={busy} onPress={() => ask('logout')} />
            <ListRow title="회원 탈퇴" tone="danger" divider={false} accessibilityLabel="회원 탈퇴, 계정을 삭제해요" disabled={busy} onPress={() => ask('withdraw')} />
          </Card>
        </>
      )}

      <Txt variant="caption" tone="muted" style={{ textAlign: 'center' }}>앱 버전 {version}</Txt>

      <Dialog
        visible={modal?.kind === 'blocked'}
        onClose={() => setModal(null)}
        title="먼저 활동 종료와 동기화를 완료해 주세요"
        actions={<Button label="확인" size="md" onPress={() => setModal(null)} />}
      >
        {modal?.kind === 'blocked' ? <Txt variant="body">{BLOCKED[modal.action]}</Txt> : null}
      </Dialog>

      <Dialog
        visible={modal?.kind === 'checkFailed'}
        onClose={() => setModal(null)}
        title="기록 상태를 확인하지 못했어요"
        actions={
          <>
            <Button label="닫기" variant="ghost" size="md" onPress={() => setModal(null)} />
            <Button label="다시 시도" size="md" loading={busy} onPress={() => modal?.kind === 'checkFailed' && void ask(modal.action)} />
          </>
        }
      >
        <Txt variant="body">연결 상태를 확인하고 다시 시도해 주세요. 기록은 그대로 남아 있어요.</Txt>
      </Dialog>

      <Dialog
        visible={modal?.kind === 'confirm'}
        onClose={() => !busy && setModal(null)}
        title={modal?.kind === 'confirm' ? (modal.dissolve ? DISSOLVE.title : CONFIRM[modal.action].title) : ''}
        actions={
          modal?.kind === 'confirm' ? (
            <>
              <Button label={CONFIRM[modal.action].cancel} variant="ghost" size="md" disabled={busy} onPress={() => setModal(null)} />
              <Button
                label={modal.dissolve && modal.action === 'leave' ? DISSOLVE.ok : CONFIRM[modal.action].ok}
                variant="danger"
                size="md"
                loading={busy}
                onPress={() => commit(modal.action)}
              />
            </>
          ) : null
        }
      >
        {modal?.kind === 'confirm' ? (
          <Txt variant="body">
            {modal.dissolve
              ? modal.action === 'withdraw'
                ? DISSOLVE.withdraw
                : DISSOLVE.leave
              : CONFIRM[modal.action].body(me?.crewName ?? '')}
          </Txt>
        ) : null}
      </Dialog>

      <Dialog
        visible={modal?.kind === 'delegate'}
        onClose={() => setModal(null)}
        title="위임한 뒤에 나갈 수 있어요"
        actions={
          <>
            <Button label="닫기" variant="ghost" size="md" onPress={() => setModal(null)} />
            <Button
              label="크루원 관리로 이동"
              size="md"
              onPress={() => {
                setModal(null);
                router.push('/3-11-manage-crew-members');
              }}
            />
          </>
        }
      >
        <Txt variant="body">크루장은 다른 크루원에게 위임한 뒤에만 크루를 나갈 수 있어요.</Txt>
      </Dialog>

      <Snackbar visible={snackbar != null} message={snackbar ?? ''} onDismiss={() => setSnackbar(null)} />
    </Screen>
  );
}

/**
 * 켜고 끄는 설정 한 줄. 행 전체가 스위치 하나로 읽히게 역할·상태를 행에 두고,
 * 안의 스위치는 보이기만 한다 — 두 곳에 초점이 가면 같은 설정을 두 번 듣는다
 */
function ToggleRow({ title, subtitle, value, onToggle }: { title: string; subtitle: string; value: boolean; onToggle: () => void }) {
  const { colors } = useTheme();
  const ripple = useRipple();
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={title}
      accessibilityHint={subtitle}
      accessibilityState={{ checked: value }}
      onPress={onToggle}
      android_ripple={ripple}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.md,
        minHeight: size.iconButton,
        paddingVertical: space.md,
        borderBottomWidth: borderWidth.hairline,
        borderBottomColor: colors.border,
        opacity: pressedOpacity(pressed),
      })}
    >
      <View style={{ flex: 1, gap: 1 }}>
        <Txt variant="bodyLg">{title}</Txt>
        <Txt variant="caption" tone="hint">{subtitle}</Txt>
      </View>
      <View importantForAccessibility="no-hide-descendants">
        <Switch label={title} hideLabel value={value} onValueChange={onToggle} />
      </View>
    </Pressable>
  );
}
