// 화면 2-2 · docs/screens/2-2-active-crew-members.md
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import {
  AppHeader,
  Avatar,
  Badge,
  Banner,
  Button,
  Card,
  Dot,
  EmptyState,
  ErrorState,
  IconButton,
  ListRow,
  Loading,
  Screen,
  Txt,
  radius,
  size,
  space,
} from 'design-system/src';
import { KakaoMapView } from '../../modules/kakao-map';
import { createMockClient, type ApiClient } from '../../src/api/client';
import { MOCKS } from '../../src/api/mocks.generated';
import { formatDistance, formatElapsed } from '../../src/format';
import { crewMarkers, locationShareLabel } from '../../src/live/live';
import { useBlockedUsers } from '../../src/profile/blocked-users';

type Member = (typeof MOCKS)['GET /crew/live']['data'][number];

const api: ApiClient = createMockClient({ delayMs: 300 });

const progress = (m: Member) => `${formatDistance(m.distanceM)} · ${formatElapsed(m.elapsedSec)} · ${m.itemCount}개`;

export default function ActiveCrewMembersScreen() {
  const appKey = Constants.expoConfig?.extra?.kakaoNativeAppKey ?? '';
  const [allMembers, setMembers] = useState<readonly Member[] | null>(null);
  const [meId, setMeId] = useState<string | null>(null);
  const blocked = useBlockedUsers(meId);
  const members = allMembers?.filter((member) => !blocked.has(member.user.id)) ?? null;
  const [failed, setFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mapFailed, setMapFailed] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await api.get('GET /crew/live');
      setMembers(res.data);
      setFailed(false);
    } catch {
      setFailed(true);
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => void load(), [load]);
  useEffect(() => { void api.get('GET /users/me').then(({ data }) => setMeId(data.id)).catch(() => {}); }, []);

  const markers = members ? crewMarkers([...members]) : [];
  const selected = members?.find((m) => m.user.id === selectedId) ?? null;

  const header = (
    <AppHeader
      title="활동 중인 크루원"
      onBack={() => router.back()}
      action={<IconButton icon="refresh" label="새로고침" disabled={!members || refreshing} onPress={load} />}
    />
  );

  if (!members) {
    return (
      <Screen>
        {header}
        {failed ? <ErrorState onRetry={load} /> : <Loading label="활동 중인 크루원을 불러오고 있어요" />}
      </Screen>
    );
  }

  return (
    <Screen scroll>
      {header}
      {failed ? <Banner tone="warn">인터넷 연결을 확인해 주세요.</Banner> : null}

      {members.length === 0 ? (
        <EmptyState
          icon="account-group-outline"
          title="지금 활동 중인 크루원이 없어요"
        />
      ) : (
        <>
          <Txt variant="subtitle">지금 {members.length}명이 활동 중이에요</Txt>

          <View
            style={{ height: size.mapFrame, borderRadius: radius.card, overflow: 'hidden' }}
            accessibilityLabel="지도, 활동 중인 크루원 위치"
          >
            {markers.length === 0 ? (
              <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                <Txt variant="caption" tone="muted">공유 중인 위치가 없어요</Txt>
              </View>
            ) : mapFailed ? (
              <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                <Txt variant="caption" tone="muted">지도를 불러오지 못했어요</Txt>
              </View>
            ) : appKey ? (
              <KakaoMapView
                appKey={appKey}
                center={{ latitude: markers[0].latitude, longitude: markers[0].longitude }}
                markers={markers}
                onMarkerPress={(e) => setSelectedId(e.nativeEvent.id)}
                onMapError={() => setMapFailed(true)}
                style={{ flex: 1 }}
              />
            ) : (
              // 키 누락은 빌드 설정 문제라 사용자에게는 원인 대신 결과만 알린다
              <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.xs }}>
                <Txt variant="caption" tone="muted">지도를 쓸 수 없어요</Txt>
                {__DEV__ ? <Txt variant="caption" tone="hint">mobile/.env 의 KAKAO_NATIVE_APP_KEY 가 비어 있어요</Txt> : null}
              </View>
            )}
          </View>

          {selected ? (
            <Card style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
              <Avatar size="md" name={selected.user.nickname} uri={selected.user.photoUrl ?? undefined} />
              <View style={{ flex: 1 }}>
                <Txt variant="body" bold>{selected.user.nickname}</Txt>
                <Txt variant="caption" tone="muted">{progress(selected)}</Txt>
              </View>
              <Button
                label="프로필 보기"
                variant="ghost"
                size="sm"
                onPress={() => router.push({ pathname: '/users/[id]', params: { id: selected.user.id } })}
              />
            </Card>
          ) : null}

          <View>
            {members.map((m) => (
              <ListRow
                key={m.activityId}
                title={m.user.nickname}
                subtitle={progress(m)}
                left={
                  <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
                    <Avatar size="md" name={m.user.nickname} uri={m.user.photoUrl ?? undefined} />
                  </View>
                }
                right={
                  <View style={{ alignItems: 'flex-end', gap: space.xs }}>
                    <Badge label={m.paused ? '일시정지' : '활동 중'} tone={m.paused ? 'neutral' : 'deep'} />
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs }}>
                      {m.locationShared && m.location ? <Dot tone="deep" size={6} /> : null}
                      <Txt variant="micro" tone="muted">{locationShareLabel(m)}</Txt>
                    </View>
                  </View>
                }
                onPress={() => router.push({ pathname: '/users/[id]', params: { id: m.user.id } })}
              />
            ))}
          </View>
        </>
      )}
    </Screen>
  );
}
