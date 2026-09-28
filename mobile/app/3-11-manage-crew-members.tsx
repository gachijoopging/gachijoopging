import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, RefreshControl, View } from 'react-native';
import {
  AppHeader,
  Avatar,
  Badge,
  Banner,
  BottomSheet,
  Button,
  Dialog,
  ErrorState,
  IconButton,
  ListRow,
  Loading,
  Screen,
  Snackbar,
  Txt,
  space,
} from 'design-system/src';
import { createMockClient, type ApiClient } from '../src/api/client';
import type { MOCKS } from '../src/api/mocks.generated';
import { memberActionOutcome, memberMenu, type MemberAction } from '../src/crew/manage';

type Member = (typeof MOCKS)['GET /crew/members']['data'][number];

const api: ApiClient = createMockClient({ delayMs: 300 });

function joinedLabel(iso: string): string {
  const d = new Date(Date.parse(iso) + 9 * 60 * 60 * 1000);
  return `${d.getUTCFullYear()}년 ${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일 가입`;
}

export default function ManageCrewMembersScreen() {
  const [members, setMembers] = useState<readonly Member[] | null>(null);
  const [me, setMe] = useState<{ id: string; isLeader: boolean } | null>(null);
  const [failed, setFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [menuTarget, setMenuTarget] = useState<Member | null>(null);
  const [confirm, setConfirm] = useState<{ member: Member; action: MemberAction } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [snackbar, setSnackbar] = useState<string | null>(null);

  const load = useCallback(async (mode: 'quiet' | 'pull') => {
    if (mode === 'pull') setRefreshing(true);
    const [listRes, crewRes, meRes] = await Promise.allSettled([
      api.get('GET /crew/members'),
      api.get('GET /crew'),
      api.get('GET /users/me'),
    ]);
    setRefreshing(false);
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

  const act = async () => {
    if (!confirm) return;
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
    setBusyId(null);
    const outcome = memberActionOutcome(action, member.nickname, error);
    if (outcome.message) setSnackbar(outcome.message);
    if (outcome.next === 'removeRow') setMembers((prev) => prev?.filter((m) => m.id !== member.id) ?? prev);
    if (outcome.next === 'reload') void load('quiet');
    // 위임하면 내 역할이 바뀌므로 3-2 가 새로 받도록 돌아간다. 안내는 잠깐 보인 뒤 떠난다
    if (outcome.next === 'leave') setTimeout(() => (router.canGoBack() ? router.back() : router.replace('/3-2-crew-info')), 1200);
  };

  const openMember = (id: string) =>
    id === me?.id ? router.push('/(tabs)/profile') : router.push({ pathname: '/5-4-user-profile', params: { id } });

  return (
    <Screen scroll refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load('pull')} />}>
      <AppHeader title="크루원 관리" onBack={() => (router.canGoBack() ? router.back() : router.replace('/3-2-crew-info'))} />

      {!members ? (
        failed ? (
          <ErrorState title="크루원을 불러오지 못했어요" onRetry={() => load('quiet')} />
        ) : (
          <Loading label="크루원을 불러오고 있어요" />
        )
      ) : (
        <>
          <Txt variant="section" accessibilityRole="header">{`크루원 ${members.length}명`}</Txt>
          {failed ? <Banner tone="warn">인터넷 연결을 확인해 주세요.</Banner> : null}
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
                  right={
                    busyId === m.id ? (
                      <ActivityIndicator />
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
          {me?.isLeader ? <Banner tone="neutral">추방해도 활동 기록과 크루 합산은 남아요.</Banner> : null}
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
        title={
          !confirm
            ? ''
            : confirm.action === 'delegate'
              ? `${confirm.member.nickname} 님에게 크루장을 넘길까요?`
              : `${confirm.member.nickname} 님을 크루에서 추방할까요?`
        }
      >
        <Txt variant="body" tone="muted" accessibilityLiveRegion="polite">
          {confirm?.action === 'delegate'
            ? '위임하면 회원님은 일반 크루원이 돼요.'
            : '추방해도 활동 기록은 개인 기록과 크루 합산에 남아요. 현재 유효한 초대 코드로 다시 가입 신청할 수 있어요.'}
        </Txt>
        <View style={{ flexDirection: 'row', gap: space.sm, justifyContent: 'flex-end' }}>
          <Button label="취소" variant="ghost" size="md" onPress={() => setConfirm(null)} />
          <Button
            label={confirm?.action === 'delegate' ? '위임' : '추방'}
            variant={confirm?.action === 'delegate' ? 'primary' : 'danger'}
            size="md"
            onPress={act}
          />
        </View>
      </Dialog>

      <Snackbar visible={snackbar != null} message={snackbar ?? ''} onDismiss={() => setSnackbar(null)} />
    </Screen>
  );
}
