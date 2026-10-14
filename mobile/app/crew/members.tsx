// 화면 3-11 · docs/screens/3-11-manage-crew-members.md (3-2 크루 정보를 흡수)
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, RefreshControl, View } from 'react-native';
import {
  AppHeader,
  Avatar,
  Badge,
  Banner,
  BottomSheet,
  Button,
  Card,
  Dialog,
  ErrorState,
  IconButton,
  ListRow,
  Loading,
  Screen,
  Snackbar,
  Txt,
  space,
  useTheme,
} from 'design-system/src';
import { peek, type ApiClient } from '../../src/api/client';
import { createApiClient } from '../../src/api/config';
import type { MOCKS } from '../../src/api/mocks.generated';
import { ExportSheet } from '../../src/crew/ExportSheet';
import { LeaveCrew } from '../../src/crew/LeaveCrew';
import { CREW_CAPACITY, JOIN_POLICY_LABEL, regionName } from '../../src/crew/region';
import { memberActionOutcome, memberMenu, type MemberAction } from '../../src/crew/manage';
import { useFlash } from '../../src/ui/useFlash';
import type { Crew } from '../(tabs)/crew';

type Member = (typeof MOCKS)['GET /crew/members']['data'][number];

const api: ApiClient = createApiClient({ delayMs: 300 });

function joinedLabel(iso: string): string {
  const d = new Date(Date.parse(iso) + 9 * 60 * 60 * 1000);
  return `${d.getUTCFullYear()}년 ${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일 가입`;
}

export default function ManageCrewMembersScreen() {
  const { colors } = useTheme();
  const [members, setMembers] = useState<readonly Member[] | null>(() => peek('GET /crew/members')?.data ?? null);
  const [me, setMe] = useState<{ id: string; isLeader: boolean } | null>(null);
  const [crew, setCrew] = useState<Crew | null>(() => peek('GET /crew')?.data ?? null);
  const [failed, setFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [menuTarget, setMenuTarget] = useState<Member | null>(null);
  const [confirm, setConfirm] = useState<{ member: Member; action: MemberAction } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [snackbar, setSnackbar] = useFlash();
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async (mode: 'quiet' | 'pull') => {
    if (mode === 'pull') setRefreshing(true);
    const [listRes, crewRes, meRes] = await Promise.allSettled([
      api.get('GET /crew/members'),
      api.get('GET /crew'),
      api.get('GET /users/me'),
    ]);
    setRefreshing(false);
    if (crewRes.status === 'fulfilled') setCrew(crewRes.value.data);
    if (crewRes.status === 'fulfilled' && meRes.status === 'fulfilled') {
      setMe({ id: meRes.value.data.id, isLeader: crewRes.value.data.isLeader });
    }
    if (listRes.status === 'fulfilled') {
      setMembers(listRes.value.data);
      setFailed(false);
    } else {
      setFailed(true);
    }
  }, []);

  useFocusEffect(useCallback(() => void load('quiet'), [load]));

  const acting = useRef(false);
  const act = async () => {
    // 같은 프레임의 연속 탭은 confirm 이 비워지기 전이라 ref 로 막는다
    if (!confirm || acting.current) return;
    acting.current = true;
    const { member, action } = confirm;
    setConfirm(null);
    setBusyId(member.id);
    let error: unknown = null;
    try {
      if (action === 'delegate') await api.mutate('PUT /crew/leader', { userId: member.id });
      else await api.mutate('DELETE /crew/members/{userId}', { userId: member.id });
    } catch (e) {
      error = e;
    }
    const outcome = memberActionOutcome(action, member.nickname, error);
    setBusyId(null);
    acting.current = false;
    if (outcome.message) setSnackbar(outcome.message);
    if (outcome.next === 'removeRow') setMembers((prev) => prev?.filter((m) => m.id !== member.id) ?? prev);
    if (outcome.next === 'reload') void load('quiet');
  };

  const openMember = (id: string) =>
    id === me?.id ? router.push('/(tabs)/profile') : router.push({ pathname: '/users/[id]', params: { id } });

  const confirmTitle = !confirm
    ? ''
    : confirm.action === 'delegate'
      ? `${confirm.member.nickname} 님에게 크루장을 넘길까요?`
      : `${confirm.member.nickname} 님을 크루에서 추방할까요?`;

  return (
    <Screen scroll refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load('pull')} />}>
      <AppHeader
        title="크루 정보"
        onBack={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/crew'))}
        action={me?.isLeader ? <IconButton icon="pencil-outline" label="크루 정보 수정" onPress={() => router.push('/crew/edit')} /> : undefined}
      />

      {!members ? (
        failed ? (
          <ErrorState title="크루원을 불러오지 못했어요" onRetry={() => load('quiet')} />
        ) : (
          <Loading label="크루원을 불러오고 있어요" />
        )
      ) : (
        <>
          {failed ? <Banner tone="warn">인터넷 연결을 확인해 주세요.</Banner> : null}
          {crew ? (
            <Card style={{ alignItems: 'center', gap: space.sm }}>
              <View
                accessible
                accessibilityLabel={[crew.name, crew.intro, crew.region && regionName(crew.region), JOIN_POLICY_LABEL[crew.joinPolicy], `14일 목표 ${crew.goalCount}개`].filter(Boolean).join(', ')}
                style={{ alignItems: 'center', gap: space.sm }}
              >
                <Avatar name={crew.name} uri={crew.photoUrl ?? undefined} size="xl" />
                <Txt variant="display" style={{ textAlign: 'center' }}>{crew.name}</Txt>
                {crew.intro ? <Txt variant="body" tone="muted" style={{ textAlign: 'center' }}>{crew.intro}</Txt> : null}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
                  {crew.region ? <Txt variant="caption" tone="muted">{regionName(crew.region)}</Txt> : null}
                  <Badge label={JOIN_POLICY_LABEL[crew.joinPolicy]} tone={crew.joinPolicy === 'OPEN' ? 'lime' : 'neutral'} />
                </View>
                <Txt variant="caption" tone="muted">{`14일 목표 ${crew.goalCount}개`}</Txt>
              </View>
            </Card>
          ) : null}
          {crew && me?.isLeader ? (
            <Card style={{ paddingVertical: 0 }}>
              {/* 공개 크루는 신청이 생기지 않는다. 공개 전환 때 자동 가입되지 않은 신청(추방 이력)이 남았을 때만 보인다 */}
              {crew.joinPolicy === 'APPROVAL' || crew.pendingJoinRequests > 0 ? (
                <ListRow
                  icon="account-clock-outline"
                  title="가입 신청"
                  chevron
                  right={crew.pendingJoinRequests > 0 ? <Badge label={crew.pendingJoinRequests} tone="danger" /> : undefined}
                  accessibilityLabel={`가입 신청 ${crew.pendingJoinRequests}건`}
                  onPress={() => router.push('/crew/join-requests')}
                />
              ) : null}
              <ListRow
                icon="flag-outline"
                title="신고 처리"
                chevron
                onPress={() => router.push('/crew/reports')}
              />
              <ListRow
                icon="file-export-outline"
                title="기록 내보내기"
                divider={false}
                chevron
                accessibilityLabel="기록 내보내기, CSV"
                onPress={() => setExporting(true)}
              />
            </Card>
          ) : null}
          <Txt variant="section" accessibilityRole="header">
            {`크루원 ${members.length}/${CREW_CAPACITY}명${members.length >= CREW_CAPACITY ? ' · 정원이 찼어요' : ''}`}
          </Txt>
          <View>
            {members.map((m, i) => {
              const menu = me ? memberMenu({ meId: me.id, meIsLeader: me.isLeader, member: m }) : [];
              const joined = joinedLabel(m.joinedAt);
              return (
                <ListRow
                  key={m.id}
                  divider={i < members.length - 1}
                  title={m.nickname}
                  subtitle={`누적 ${m.totalItems}개 · ${joined}`}
                  left={<Avatar name={m.nickname} uri={m.photoUrl ?? undefined} size="md" />}
                  disabled={busyId != null}
                  accessibilityLabel={[m.nickname, m.isLeader ? '크루장' : null, `누적 ${m.totalItems}개`, joined, '프로필 보기']
                    .filter(Boolean)
                    .join(', ')}
                  onPress={() => openMember(m.id)}
                  chevron={menu.length === 0}
                  accessibilityActions={menu.length > 0 ? [{ name: 'manage', label: '관리' }] : undefined}
                  onAccessibilityAction={menu.length > 0 ? () => setMenuTarget(m) : undefined}
                  right={
                    busyId === m.id ? (
                      <ActivityIndicator color={colors.deep} />
                    ) : m.isLeader ? (
                      <Badge label="크루장" tone="deep" />
                    ) : menu.length > 0 ? (
                      <IconButton
                        icon="dots-horizontal"
                        label={`${m.nickname} 관리`}
                        disabled={busyId != null}
                        onPress={() => setMenuTarget(m)}
                      />
                    ) : undefined
                  }
                />
              );
            })}
          </View>
          {/* 크루 나가기는 크루 화면에서만 한다. 설정(5-7)은 계정만 다룬다 */}
          {crew && me ? <LeaveCrew api={api} crewName={crew.name} isLeader={me.isLeader} /> : null}
        </>
      )}

      <BottomSheet visible={menuTarget != null} onClose={() => setMenuTarget(null)} title={menuTarget?.nickname ?? ''}>
        <ListRow
          icon="crown-outline"
          title="크루장 위임"
          chevron={false}
          onPress={() => {
            setConfirm(menuTarget && { member: menuTarget, action: 'delegate' });
            setMenuTarget(null);
          }}
        />
        <ListRow
          icon="account-remove-outline"
          title="크루원 추방"
          chevron={false}
          onPress={() => {
            setConfirm(menuTarget && { member: menuTarget, action: 'kick' });
            setMenuTarget(null);
          }}
        />
      </BottomSheet>

      <Dialog
        visible={confirm != null}
        onClose={() => setConfirm(null)}
        title={confirmTitle}
        actions={
          <>
            <Button label="그대로 두기" variant="ghost" size="md" onPress={() => setConfirm(null)} />
            <Button
              label={confirm?.action === 'delegate' ? '위임' : '추방'}
              variant={confirm?.action === 'delegate' ? 'soft' : 'danger'}
              size="md"
              onPress={act}
            />
          </>
        }
      />

      <ExportSheet
        visible={exporting}
        onClose={() => setExporting(false)}
        onFailed={() => setSnackbar('CSV를 만들지 못했어요. 다시 시도해 주세요.')}
      />
      <Snackbar visible={snackbar != null} message={snackbar ?? ''} onDismiss={() => setSnackbar(null)} />
    </Screen>
  );
}
