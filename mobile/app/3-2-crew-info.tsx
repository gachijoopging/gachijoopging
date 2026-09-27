import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { RefreshControl, View } from 'react-native';
import {
  AppHeader,
  Avatar,
  Badge,
  Banner,
  Button,
  Card,
  Chip,
  Dot,
  ErrorState,
  ListRow,
  Loading,
  Screen,
  Txt,
  space,
} from 'design-system/src';
import { createMockClient, type ApiClient } from '../src/api/client';
import type { MOCKS } from '../src/api/mocks.generated';
import type { Crew } from './(tabs)/crew';

type Member = (typeof MOCKS)['GET /crew/members']['data'][number];

const api: ApiClient = createMockClient({ delayMs: 300 });
const PREVIEW_MEMBERS = 4;

export default function CrewInfoScreen() {
  const [crew, setCrew] = useState<Crew | null>(null);
  const [members, setMembers] = useState<readonly Member[] | null>(null);
  const [meId, setMeId] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [membersFailed, setMembersFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const loadMembers = useCallback(async () => {
    try {
      setMembers((await api.get('GET /crew/members')).data);
      setMembersFailed(false);
    } catch {
      setMembersFailed(true);
    }
  }, []);

  const load = useCallback(
    async (mode: 'first' | 'pull') => {
      if (mode === 'pull') setRefreshing(true);
      const [crewRes] = await Promise.allSettled([api.get('GET /crew'), loadMembers()]);
      setRefreshing(false);
      if (crewRes.status === 'rejected') return setFailed(true);
      setFailed(false);
      setCrew(crewRes.value.data);
    },
    [loadMembers],
  );

  useEffect(() => {
    void load('first');
    api.get('GET /users/me').then((res) => setMeId(res.data.id)).catch(() => {});
  }, [load]);

  const openMember = (id: string) =>
    id === meId ? router.push('/(tabs)/profile') : router.push({ pathname: '/5-4-user-profile', params: { id } });

  return (
    <Screen scroll refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load('pull')} />}>
      <AppHeader title="크루 정보" onBack={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/crew'))} />

      {!crew ? (
        failed ? (
          <ErrorState title="크루 정보를 불러오지 못했어요" onRetry={() => load('first')} />
        ) : (
          <Loading label="크루 정보를 불러오고 있어요" />
        )
      ) : (
        <>
          <Card style={{ gap: space.md }}>
            <View
              accessible
              accessibilityLabel={[crew.name, crew.intro || '소개가 아직 없어요', `14일 목표 ${crew.goalCount}개`].join(', ')}
              style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}
            >
              <Avatar name={crew.name} uri={crew.photoUrl ?? undefined} size="lg" />
              <View style={{ flex: 1, gap: space.xs }}>
                <Txt variant="display">{crew.name}</Txt>
                <Txt variant="caption" tone="muted">{crew.intro || '소개가 아직 없어요.'}</Txt>
              </View>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Chip label={`목표: 14일에 ${crew.goalCount}개`} tone="deep" />
              {crew.isLeader ? (
                <Button
                  label="수정"
                  variant="ghost"
                  size="sm"
                  accessibilityLabel="크루 정보 수정"
                  onPress={() => router.push('/3-10-edit-crew')}
                />
              ) : null}
            </View>
          </Card>

          {failed ? <Banner tone="warn">인터넷 연결을 확인해 주세요.</Banner> : null}

          <Card style={{ gap: space.sm }}>
            <ListRow
              title={`크루원 ${crew.memberCount}명`}
              divider={false}
              chevron
              accessibilityLabel={`크루원 ${crew.memberCount}명, 크루원 전체 보기`}
              onPress={() => router.push('/3-11-manage-crew-members')}
            />
            {membersFailed ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
                <Txt variant="caption" tone="muted" style={{ flex: 1 }}>크루원 목록을 불러오지 못했어요.</Txt>
                <Button label="다시 시도" variant="ghost" size="sm" onPress={loadMembers} />
              </View>
            ) : (
              members?.slice(0, PREVIEW_MEMBERS).map((m) => (
                <ListRow
                  key={m.id}
                  title={m.nickname}
                  left={<Avatar name={m.nickname} uri={m.photoUrl ?? undefined} size="sm" />}
                  right={m.isLeader ? <Badge label="크루장" tone="deep" /> : undefined}
                  chevron
                  accessibilityLabel={m.isLeader ? `${m.nickname} 크루장` : m.nickname}
                  onPress={() => openMember(m.id)}
                />
              ))
            )}
          </Card>

          <View>
            <Button
              label="크루 채팅 열기"
              variant="soft"
              size="lg"
              icon="chat-outline"
              fullWidth
              accessibilityLabel={crew.unreadChat > 0 ? `크루 채팅 열기, 안 읽은 메시지 ${crew.unreadChat}개` : '크루 채팅 열기'}
              onPress={() => router.push('/3-7-crew-chat')}
            />
            {crew.unreadChat > 0 ? (
              <View style={{ position: 'absolute', top: space.md, right: space.lg }} pointerEvents="none">
                <Dot />
              </View>
            ) : null}
          </View>

          <View style={{ flexDirection: 'row', gap: space.sm }}>
            <Button label="초대 코드" variant="ghost" size="md" style={{ flex: 1 }} onPress={() => router.push('/3-3-invite-code')} />
            <Button label="크루 기록" variant="ghost" size="md" style={{ flex: 1 }} onPress={() => router.push('/3-4-crew-records')} />
          </View>

          {crew.isLeader ? (
            <View style={{ flexDirection: 'row', gap: space.sm }}>
              <Button
                label={`가입 신청 ${crew.pendingJoinRequests}건`}
                size="md"
                style={{ flex: 1 }}
                accessibilityLabel={`가입 신청 관리, ${crew.pendingJoinRequests}건, 크루장`}
                onPress={() => router.push('/3-8-manage-join-requests')}
              />
              <Button
                label="크루원 관리"
                variant="ghost"
                size="md"
                style={{ flex: 1 }}
                accessibilityLabel="크루원 관리, 크루장"
                onPress={() => router.push('/3-11-manage-crew-members')}
              />
            </View>
          ) : null}

          <Button label="크루 나가기" variant="ghostDanger" size="md" onPress={() => router.push('/5-7-settings')} />
        </>
      )}
    </Screen>
  );
}
