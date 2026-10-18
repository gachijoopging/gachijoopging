// 화면 5-7 · docs/screens/5-7-settings.md
import Constants from 'expo-constants';
import { useNetworkState } from 'expo-network';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import {
  AppHeader,
  Banner,
  Button,
  Card,
  Chip,
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
import { ApiError, type ApiClient } from '../../src/api/client';
import { createApiClient } from '../../src/api/config';
import { accountGate, leaveConfirm, leaveFailure } from '../../src/profile/profile';
import { getStored, loadAccount, loadLastAccount } from '../../src/activity/store';
import { forgetAccount, rememberAccount } from '../../src/auth/account';
import { PROVIDER_KEY, providerToken, type Provider } from '../../src/auth/social';

type Me = {
  hasPassword: boolean;
  /** 이메일 계정에 붙인 소셜 로그인. 연결된 제공자는 다시 연결하지 않는다 */
  linked: Record<Provider, boolean>;
  /** 크루 소속이 아니면(가입 전·승인 대기) 크루 관련 행을 숨기고 계정 행만 보인다 */
  member: boolean;
  /** 승인 대기 중. 탈퇴하면 그 신청도 취소된다 */
  pending: boolean;
  crewName: string | null;
  isLeader: boolean;
  shareLocationDefault: boolean;
  notifyActivityStart: boolean;
  /** 선택 동의. 서버 목록에 MARKETING 이 없으면 행을 그리지 않는다 */
  marketing: { version: string; agreed: boolean } | null;
};
type SettingKey = 'shareLocationDefault' | 'notifyActivityStart' | 'marketing';
type Kind = 'withdraw' | 'logout';
type Modal =
  | { kind: 'blocked'; action: Kind }
  | { kind: 'confirm'; action: Kind; dissolve: boolean }
  | { kind: 'delegate' }
  | { kind: 'checkFailed'; action: Kind };

const api: ApiClient = createApiClient({ delayMs: 300 });

const CONFIRM: Record<Kind, { title: string; body: (crew: string, pending: boolean) => string; cancel: string; ok: string }> = {
  withdraw: {
    title: '정말 탈퇴할까요?',
    body: (_, pending) => `계정과 활동 상세 기록(경로 포함)이 삭제되고 되돌릴 수 없어요. 게시물과 크루 합산 기록은 "탈퇴한 크루원" 이름으로 남아요.${pending ? ' 기다리던 가입 신청도 취소돼요.' : ''}`,
    cancel: '계속 사용하기',
    ok: '탈퇴하기',
  },
  logout: {
    title: '로그아웃할까요?',
    body: () => '이 기기에서 로그아웃돼요. 기록·크루·게시물은 그대로라 다시 로그인하면 이어서 볼 수 있어요.',
    cancel: '로그인 유지',
    ok: '로그아웃',
  },
};

const DISSOLVE = {
  title: '크루를 해산하고 탈퇴할까요?',
  withdraw: '혼자 남은 크루장이 탈퇴하면 크루가 해산되고, 계정과 활동 상세 기록(경로 포함)이 삭제돼요. 되돌릴 수 없어요.',
};

const PROVIDER_NAME: Record<Provider, string> = { kakao: '카카오', google: '구글' };

/**
 * 409 는 이 소셜 계정이 다른 가치줍깅 계정에 이미 연결된 경우다. 어느 계정인지는 말하지 않는다 —
 * 남의 소셜 계정으로 가입 여부를 떠보는 통로가 되지 않게
 */
function linkFailure(provider: Provider, error: unknown): string {
  if (error instanceof ApiError && error.code === 'CONFLICT') return `이 ${PROVIDER_NAME[provider]} 계정은 연결할 수 없어요. 다른 계정으로 시도해 주세요.`;
  return `${PROVIDER_NAME[provider]} 계정을 연결하지 못했어요. 다시 시도해 주세요.`;
}

const BLOCKED: Record<Kind, string> = {
  withdraw: '진행 중인 활동이 있으면 회원 탈퇴를 할 수 없어요. 줍깅 탭에서 종료와 동기화를 완료한 뒤 다시 시도해 주세요.',
  logout: '진행 중이거나 아직 저장되지 않은 기록이 있어요. 줍깅 탭에서 종료와 동기화를 완료한 뒤 다시 시도해 주세요.',
};

export default function SettingsScreen() {
  const [me, setMe] = useState<Me | null>(null);
  const [failed, setFailed] = useState(false);
  const [modal, setModal] = useState<Modal | null>(null);
  const [busy, setBusy] = useState(false);
  const [snackbar, setSnackbar] = useState<string | null>(null);
  const [linking, setLinking] = useState<Provider | null>(null);
  const toggling = useRef(new Set<SettingKey>());
  const [pendingSettings, setPendingSettings] = useState<ReadonlySet<SettingKey>>(new Set());
  const network = useNetworkState();
  const offline = network.isConnected === false || network.isInternetReachable === false;

  const load = useCallback(async () => {
    try {
      const { data } = await api.get('GET /users/me');
      // 동의 목록이 안 오면 마케팅 행만 숨긴다. 로그아웃·탈퇴까지 막을 이유는 없다
      const marketing = await api.get('GET /users/me/agreements').then((r) => r.data.items.find((item) => item.type === 'MARKETING')).catch(() => undefined);
      rememberAccount(data);
      loadAccount(data.id);
      setMe({
        hasPassword: data.hasPassword,
        linked: { kakao: !!data.linked?.kakao, google: !!data.linked?.google },
        member: data.membership.status === 'MEMBER',
        pending: data.membership.status === 'PENDING',
        crewName: data.membership.crew?.name ?? null,
        isLeader: !!data.membership.crew?.isLeader,
        shareLocationDefault: data.settings.shareLocationDefault,
        notifyActivityStart: data.settings.notifyActivityStart,
        marketing: marketing ? { version: marketing.version, agreed: marketing.agreed } : null,
      });
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, []);

  // 5-8·1-5·5-9 에서 돌아오면 바뀐 설정·hasPassword 를 맞춘다
  useFocusEffect(useCallback(() => void load(), [load]));

  const toggle = async (key: SettingKey) => {
    if (!me || toggling.current.has(key)) return;
    toggling.current.add(key);
    setPendingSettings(new Set(toggling.current));
    const before = key === 'marketing' ? !!me.marketing?.agreed : me[key];
    const after = key === 'marketing' ? me.marketing && { ...me.marketing, agreed: !before } : !before;
    setMe((value) => value && { ...value, [key]: after });
    try {
      if (offline) throw new ApiError('OFFLINE');
      if (key === 'marketing') {
        if (!me.marketing) return;
        await api.mutate('PUT /users/me/agreements', { items: [{ type: 'MARKETING', version: me.marketing.version, agreed: !before }] });
      } else {
        await api.mutate('PATCH /users/me', { [key]: !before });
      }
    } catch (error) {
      setMe((m) => (m ? { ...m, [key]: key === 'marketing' ? m.marketing && { ...m.marketing, agreed: before } : before } : m));
      setSnackbar('설정을 저장하지 못했어요.');
      // 약관 버전이 올라 422 면 현재 버전 항목을 다시 받아 그린다 (openapi PUT /users/me/agreements)
      if (key === 'marketing' && error instanceof ApiError && error.code === 'VALIDATION') void load();
    } finally {
      toggling.current.delete(key);
      setPendingSettings(new Set(toggling.current));
    }
  };

  const link = async (provider: Provider) => {
    if (!me || linking) return;
    setLinking(provider);
    try {
      if (offline) throw new ApiError('OFFLINE');
      const token = await providerToken(provider);
      if (token == null) return;
      await api.mutate('PUT /users/me/social', { provider: PROVIDER_KEY[provider], token });
      setMe((m) => m && { ...m, linked: { ...m.linked, [provider]: true } });
      setSnackbar(`${PROVIDER_NAME[provider]} 계정을 연결했어요. 이제 ${PROVIDER_NAME[provider]}로도 로그인할 수 있어요.`);
    } catch (error) {
      setSnackbar(linkFailure(provider, error));
    } finally {
      setLinking(null);
    }
  };

  const ask = async (action: Kind) => {
    if (busy || !me) return;
    setBusy(true);
    try {
      if (offline) throw new ApiError('OFFLINE');
      const [{ data: current }, crew] = await Promise.all([
        api.get('GET /activities/current'),
        action === 'logout' || !me.isLeader ? null : api.get('GET /crew'),
      ]);
      const local = loadLastAccount() ?? getStored();
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
      if (action === 'withdraw') {
        if (offline) throw new ApiError('OFFLINE');
        await api.mutate('DELETE /users/me');
        forgetAccount();
        setModal(null);
        return router.dismissTo({ pathname: '/start', params: { flash: '탈퇴가 완료됐어요.' } });
      }
      // 세션 종료 요청이 실패해도 이 기기의 로그아웃은 끝낸다 — 활동·큐는 위에서 이미 비어 있음을 확인했다
      await api.mutate('POST /auth/logout').catch(() => {});
      forgetAccount();
      setModal(null);
      return router.dismissTo('/start');
    } catch (e) {
      const outcome = leaveFailure(e);
      if (outcome === 'delegate') setModal({ kind: 'delegate' });
      else if (outcome === 'blocked') setModal({ kind: 'blocked', action });
      else setSnackbar('탈퇴하지 못했어요. 다시 시도해 주세요.');
    }
    // 성공하면 위에서 떠났다. 떠나는 화면은 다시 그리지 않는다 — 전환 중 재렌더가 Fabric 을 죽인다
    setBusy(false);
  };

  const version = Constants.expoConfig?.version ?? '';

  return (
    <Screen scroll>
      <AppHeader title="설정" onBack={() => router.back()} />

      {!me ? (
        failed ? <ErrorState title="내 정보를 불러오지 못했어요" onRetry={load} /> : <Loading label="내 정보를 불러오고 있어요" />
      ) : (
        <>
          {failed || offline ? <Banner tone="warn">인터넷 연결을 확인해 주세요.</Banner> : null}
          {/* 크루에 소속돼야 앱을 쓴다. 가입 전·승인 대기에는 로그아웃·회원 탈퇴만 보인다 */}
          {me.member ? <Card style={{ paddingVertical: 0 }}>
            <ListRow title="프로필 수정" subtitle="닉네임과 사진을 바꿔요." onPress={() => router.push('/settings/profile')} />
            <ToggleRow
              title="위치 공유 기본값"
              subtitle="활동을 시작할 때 미리 선택돼요."
              value={me.shareLocationDefault}
              disabled={pendingSettings.has('shareLocationDefault')}
              onToggle={() => toggle('shareLocationDefault')}
            />
            <ToggleRow
              title="활동 시작 알림"
              subtitle="팔로우한 크루원이 활동을 시작하면 알려줘요."
              value={me.notifyActivityStart}
              disabled={pendingSettings.has('notifyActivityStart')}
              onToggle={() => toggle('notifyActivityStart')}
            />
            {me.marketing ? (
              <ToggleRow
                title="마케팅 정보 수신"
                subtitle="새 기능과 이벤트 소식을 알려줘요."
                value={me.marketing.agreed}
                disabled={pendingSettings.has('marketing')}
                onToggle={() => toggle('marketing')}
              />
            ) : null}
            <ListRow title="차단 관리" divider={false} onPress={() => router.push('/settings/blocks')} />
          </Card> : null}

          {/* 소셜로 가입한 계정은 이미 그 제공자로 로그인한다. 연결은 이메일로 가입한 크루원에게만 */}
          {me.member && me.hasPassword ? (
            <Card style={{ paddingVertical: 0 }}>
              <Txt variant="label" tone="muted" style={{ paddingTop: space.md }}>로그인 연결</Txt>
              {(['kakao', 'google'] as const).map((provider, i) => (
                <SocialLinkRow
                  key={provider}
                  provider={provider}
                  linked={me.linked[provider]}
                  loading={linking === provider}
                  disabled={linking != null}
                  divider={i === 0}
                  onLink={() => link(provider)}
                />
              ))}
            </Card>
          ) : null}

          <Card style={{ paddingVertical: 0 }}>
            {me.member && me.hasPassword ? (
              <ListRow title="비밀번호 재설정" subtitle="재설정 메일을 보낼 수 있어요." onPress={() => router.push('/reset-password')} />
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
                label={CONFIRM[modal.action].ok}
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
            {modal.dissolve ? DISSOLVE.withdraw : CONFIRM[modal.action].body(me?.crewName ?? '', !!me?.pending)}
          </Txt>
        ) : null}
      </Dialog>

      <Dialog
        visible={modal?.kind === 'delegate'}
        onClose={() => setModal(null)}
        title="위임한 뒤에 탈퇴할 수 있어요"
        actions={
          <>
            <Button label="닫기" variant="ghost" size="md" onPress={() => setModal(null)} />
            <Button
              label="크루원 관리로 이동"
              size="md"
              onPress={() => {
                setModal(null);
                router.push('/crew/members');
              }}
            />
          </>
        }
      >
        <Txt variant="body">크루장은 다른 크루원에게 위임한 뒤에만 탈퇴할 수 있어요.</Txt>
      </Dialog>

      <Snackbar visible={snackbar != null} message={snackbar ?? ''} onDismiss={() => setSnackbar(null)} />
    </Screen>
  );
}

/**
 * 켜고 끄는 설정 한 줄. 행 전체가 스위치 하나로 읽히게 역할·상태를 행에 두고,
 * 안의 스위치는 보이기만 한다 — 두 곳에 초점이 가면 같은 설정을 두 번 듣는다
 */
function ToggleRow({ title, subtitle, value, onToggle, disabled }: { title: string; subtitle: string; value: boolean; onToggle: () => void; disabled: boolean }) {
  const { colors } = useTheme();
  const ripple = useRipple();
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={title}
      accessibilityHint={subtitle}
      accessibilityState={{ checked: value, disabled }}
      disabled={disabled}
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
        <Switch label={title} hideLabel value={value} disabled={disabled} onValueChange={onToggle} />
      </View>
    </Pressable>
  );
}

/**
 * 소셜 로그인 한 줄. 1-1 시작 화면의 소셜 버튼과 같은 브랜드 표시를 쓴다 — 카카오는 노랑 컨테이너(디자인 가이드 #FEE500),
 * 구글은 로고. 두 제공자를 같은 크기로 둔다(카카오 가이드: 다른 버튼보다 강조하거나 약하게 그리지 않는다)
 */
function SocialLinkRow({ provider, linked, loading, disabled, divider, onLink }: { provider: Provider; linked: boolean; loading: boolean; disabled: boolean; divider: boolean; onLink: () => void }) {
  const name = PROVIDER_NAME[provider];
  return (
    <ListRow
      title={name}
      subtitle={linked ? `${name} 계정으로도 로그인할 수 있어요.` : `연결하면 ${name}로도 로그인할 수 있어요.`}
      divider={divider}
      right={
        linked ? (
          <Chip label="연결됨" tone="soft" icon="check" accessibilityLabel={`${name} 연결됨`} />
        ) : (
          <Button
            label="연결"
            size="sm"
            variant={provider === 'kakao' ? 'kakao' : 'soft'}
            icon={provider === 'google' ? 'google' : undefined}
            loading={loading}
            disabled={disabled}
            accessibilityLabel={`${name} 계정 연결하기`}
            onPress={onLink}
          />
        )
      }
    />
  );
}