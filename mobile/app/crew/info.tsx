// 화면 3-2 · docs/screens/3-2-crew-info.md
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { RefreshControl, View } from 'react-native';
import {
  AppHeader,
  Avatar,
  Badge,
  Banner,
  Card,
  ErrorState,
  Icon,
  IconButton,
  Loading,
  Screen,
  Snackbar,
  Txt,
  space,
} from 'design-system/src';
import { createMockClient, type ApiClient } from '../../src/api/client';
import type { MOCKS } from '../../src/api/mocks.generated';
import { useFlash } from '../../src/ui/useFlash';
import type { Crew } from '../(tabs)/crew';

type Member = (typeof MOCKS)['GET /crew/members']['data'][number];

const api: ApiClient = createMockClient({ delayMs: 300 });
const PREVIEW_MEMBERS = 4;

export default function CrewInfoScreen() {
  const [crew, setCrew] = useState<Crew | null>(null);
  const [members, setMembers] = useState<readonly Member[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [snackbar, setSnackbar] = useFlash();

  const load = useCallback(async (mode: 'first' | 'pull') => {
    if (mode === 'pull') setRefreshing(true);
    const [crewRes, membersRes] = await Promise.allSettled([api.get('GET /crew'), api.get('GET /crew/members')]);
    setRefreshing(false);
    // 얼굴 미리보기는 곁가지라 실패해도 숫자만 보인다
    if (membersRes.status === 'fulfilled') setMembers(membersRes.value.data);
    if (crewRes.status === 'rejected') return setFailed(true);
    setFailed(false);
    setCrew(crewRes.value.data);
  }, []);

  // 수정·위임·추방하고 돌아오면 바뀐 정보와 내 역할을 다시 받는다
  useFocusEffect(useCallback(() => void load('first'), [load]));

  const pending = crew?.isLeader ? crew.pendingJoinRequests : 0;

  return (
    <Screen scroll refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load('pull')} />}>
      <AppHeader
        title="크루 정보"
        onBack={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/crew'))}
        action={
          crew?.isLeader ? (
            <IconButton icon="pencil-outline" label="크루 정보 수정" onPress={() => router.push('/crew/edit')} />
          ) : undefined
        }
      />

      {!crew ? (
        failed ? (
          <ErrorState title="크루 정보를 불러오지 못했어요" onRetry={() => load('first')} />
        ) : (
          <Loading label="크루 정보를 불러오고 있어요" />
        )
      ) : (
        <>
          {failed ? <Banner tone="warn">인터넷 연결을 확인해 주세요.</Banner> : null}

          <Card style={{ alignItems: 'center', gap: space.sm }}>
            <View
              accessible
              accessibilityLabel={[crew.name, crew.intro, `14일 목표 ${crew.goalCount}개`].filter(Boolean).join(', ')}
              style={{ alignItems: 'center', gap: space.sm }}
            >
              <Avatar name={crew.name} uri={crew.photoUrl ?? undefined} size="xl" />
              <Txt variant="display" style={{ textAlign: 'center' }}>{crew.name}</Txt>
              {crew.intro ? (
                <Txt variant="body" tone="muted" style={{ textAlign: 'center' }}>{crew.intro}</Txt>
              ) : null}
              <Txt variant="caption" tone="muted">{`14일 목표 ${crew.goalCount}개`}</Txt>
            </View>
          </Card>

          <Card
            onPress={() => router.push('/crew/members')}
            accessibilityLabel={[`크루원 ${crew.memberCount}명`, pending > 0 ? `가입 신청 ${pending}건` : null, '크루원 보기']
              .filter(Boolean)
              .join(', ')}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
              <View style={{ flex: 1, gap: space.sm }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
                  <Txt variant="section" bold>{`크루원 ${crew.memberCount}명`}</Txt>
                  {pending > 0 ? <Badge label={`신청 ${pending}`} tone="danger" /> : null}
                </View>
                {members?.length ? (
                  <View style={{ flexDirection: 'row' }}>
                    {members.slice(0, PREVIEW_MEMBERS).map((m, i) => (
                      <View key={m.id} style={{ marginLeft: i === 0 ? 0 : -space.sm }}>
                        <Avatar size="sm" name={m.nickname} uri={m.photoUrl ?? undefined} />
                      </View>
                    ))}
                  </View>
                ) : null}
              </View>
              <Icon name="chevron-right" />
            </View>
          </Card>
        </>
      )}

      <Snackbar visible={snackbar != null} message={snackbar ?? ''} onDismiss={() => setSnackbar(null)} />
    </Screen>
  );
}
