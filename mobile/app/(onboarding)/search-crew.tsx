// 화면 1-8 · docs/screens/1-8-search-crew.md
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, RefreshControl, View } from 'react-native';
import { router, useNavigation } from 'expo-router';
import {
  AppHeader,
  Avatar,
  Badge,
  Banner,
  BottomSheet,
  Button,
  Chip,
  EmptyState,
  ErrorState,
  Field,
  Icon,
  List,
  ListRow,
  Loading,
  Screen,
  Snackbar,
  Spinner,
  Txt,
  size,
  space,
  useRipple,
} from 'design-system/src';
import { onboardingApi as api } from '../../src/api/onboarding';
import { currentAccount, rememberAccount } from '../../src/auth/account';
import { mapJoinError } from '../../src/auth/errors';
import { finishOnboarding, type OnboardingNavigation } from '../../src/auth/navigation';
import { usePreventBack } from '../../src/auth/usePreventBack';
import { CREW_CAPACITY, JOIN_POLICY_LABEL, REGIONS, regionName, type JoinPolicy, type Region } from '../../src/crew/region';

type CrewSummary = {
  id: string;
  name: string;
  intro: string;
  photoUrl: string | null;
  region: string;
  joinPolicy: JoinPolicy;
  memberCount: number;
  leader: { nickname: string };
};
type Filter = { query?: string; region?: Region };
type Leave = { to: '/(tabs)' | '/pending-approval'; flash?: string };

const isFull = (crew: CrewSummary) => crew.memberCount >= CREW_CAPACITY;
const members = (crew: CrewSummary) => `크루원 ${crew.memberCount}/${CREW_CAPACITY}명`;

export default function SearchCrewScreen() {
  const navigation = useNavigation<OnboardingNavigation>('/');
  const [input, setInput] = useState('');
  const [filter, setFilter] = useState<Filter>({});
  const [items, setItems] = useState<CrewSummary[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [searching, setSearching] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [moreState, setMoreState] = useState<'idle' | 'loading' | 'failed'>('idle');
  const [regionSheet, setRegionSheet] = useState(false);
  const [selected, setSelected] = useState<CrewSummary | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [joining, setJoining] = useState(false);
  const [sheetBanner, setSheetBanner] = useState<string>();
  const [blocked, setBlocked] = useState(false);
  const [snackbar, setSnackbar] = useState<string | null>(null);
  const generation = useRef(0);
  const cursor = useRef<string | null>(null);
  const loaded = useRef<Filter | null>(null);
  const busy = useRef(false);
  // 시트가 다 내려간 뒤에 넘어간다. 내려가는 중에 화면을 바꾸면 시트가 다음 화면 위에 겹친다
  const afterClose = useRef<Leave | null>(null);
  const sheetShown = useRef(false);
  sheetShown.current = sheetOpen;
  usePreventBack(joining);

  // 검색 도중 다른 기기에서 가입·신청했으면 GET /crews 도 409 다. 다시 불러도 같으니 옮겨 보낸다
  const moveOn = useCallback((e: unknown) => {
    const moved = mapJoinError(e).moved;
    if (!moved) return false;
    // 가입 실패 뒤 새로고침이면 시트가 열려 있다. 시트가 다 내려간 뒤에 넘어간다
    if (sheetShown.current) {
      afterClose.current = moved;
      setSheetOpen(false);
    } else finishOnboarding(navigation, moved.to, { flash: moved.flash });
    return true;
  }, [navigation]);

  const load = useCallback(async (next: Filter, mode: 'search' | 'pull' = 'search') => {
    const request = ++generation.current;
    const prevCursor = cursor.current;
    // 이전 조건의 커서로 다음 페이지를 이어 붙이지 않도록 첫 페이지가 올 때까지 막는다
    cursor.current = null;
    if (mode === 'pull') setRefreshing(true);
    else setSearching(true);
    setMoreState('idle');
    try {
      const { data } = await api.get('GET /crews', next);
      if (request !== generation.current) return;
      setItems([...(data.items as readonly CrewSummary[])]);
      cursor.current = data.nextCursor;
      loaded.current = next;
      setFailed(false);
    } catch (e) {
      if (request !== generation.current || moveOn(e)) return;
      setFailed(true);
      // 조건을 바꾼 조회가 실패하면 이전 조건의 결과를 새 조건의 결과처럼 보이게 두지 않는다
      if (loaded.current === next) cursor.current = prevCursor;
      else setItems(null);
    } finally {
      if (request === generation.current) {
        setSearching(false);
        setRefreshing(false);
      }
    }
  }, [moveOn]);

  useEffect(() => {
    void load(filter);
  }, [load, filter]);

  const loadMore = async () => {
    const next = cursor.current;
    if (!next || moreState === 'loading') return;
    const request = generation.current;
    setMoreState('loading');
    try {
      const { data } = await api.get('GET /crews', { ...filter, cursor: next });
      if (request !== generation.current) return;
      setItems((prev) => [...(prev ?? []), ...(data.items as readonly CrewSummary[])]);
      cursor.current = data.nextCursor;
      setMoreState('idle');
    } catch (e) {
      if (request === generation.current && !moveOn(e)) setMoreState('failed');
    }
  };

  const search = () => {
    const query = input.trim() || undefined;
    if (query !== filter.query) setFilter((f) => ({ ...f, query }));
    else void load(filter);
  };

  const open = (crew: CrewSummary) => {
    setSelected(crew);
    setSheetBanner(undefined);
    setBlocked(false);
    setSheetOpen(true);
  };

  const leaveTo = (next: Leave) => {
    afterClose.current = next;
    setSheetOpen(false);
  };

  const join = async () => {
    if (!selected || busy.current || isFull(selected) || blocked) return;
    busy.current = true;
    setJoining(true);
    setSheetBanner(undefined);
    try {
      const { data } = await api.mutate('POST /crews/join-requests', { crewId: selected.id });
      const account = currentAccount();
      if (data.status === 'APPROVED' && account) rememberAccount({ id: account.id, membership: { status: 'MEMBER' } });
      // 검색 뒤 크루장이 가입 방식을 바꿨을 수 있다 — 이동은 응답의 status 를 따른다
      leaveTo(data.status === 'APPROVED'
        ? { to: '/(tabs)', flash: `${data.crew.name}에 가입했어요.` }
        : { to: '/pending-approval' });
    } catch (e) {
      const mapped = mapJoinError(e);
      if (mapped.moved) leaveTo({ to: mapped.moved.to, flash: mapped.moved.flash });
      else if (mapped.gone) {
        setSheetOpen(false);
        setSnackbar('크루를 찾을 수 없어요. 다시 검색해 주세요.');
      } else {
        setSheetBanner(mapped.banner);
        setBlocked(!!mapped.blocked);
      }
      if (mapped.refresh) void load(filter);
    } finally {
      busy.current = false;
      setJoining(false);
    }
  };

  const filtered = !!(filter.query || filter.region);
  const regionLabel = filter.region ? regionName(filter.region) : '전체';

  return (
    <Screen>
      <AppHeader title="크루 찾기" onBack={() => router.back()} backDisabled={joining} />

      <View style={{ gap: space.sm }}>
        <Field
          accessibilityLabel="크루 이름으로 찾기"
          placeholder="크루 이름으로 찾기"
          value={input}
          onChangeText={setInput}
          returnKeyType="search"
          onSubmitEditing={search}
          maxLength={20}
          editable={!joining}
        />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
          <Chip
            label={`지역: ${regionLabel}`}
            icon="chevron-down"
            iconEnd
            tone="surface"
            accessibilityLabel={filter.region ? `지역, ${regionLabel}, 바꾸기` : '지역, 전체'}
            disabled={joining}
            onPress={() => setRegionSheet(true)}
          />
          {searching && items ? <Spinner /> : null}
        </View>
      </View>

      {!items ? (
        failed ? (
          <ErrorState title="크루를 불러오지 못했어요" onRetry={() => load(filter)} />
        ) : (
          <Loading label="크루를 불러오고 있어요" />
        )
      ) : failed && items.length === 0 ? (
        <ErrorState title="크루를 불러오지 못했어요" onRetry={() => load(filter)} />
      ) : (
        <List
          data={items}
          keyExtractor={(c) => c.id}
          gap={space.sm}
          keyboardDismissMode="on-drag"
          onEndReached={() => { if (moreState !== 'failed') void loadMore(); }}
          onEndReachedThreshold={0.5}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(filter, 'pull')} />}
          ListHeaderComponent={
            <View style={{ gap: space.sm, paddingBottom: space.sm }}>
              {failed ? <Banner tone="warn">인터넷 연결을 확인해 주세요.</Banner> : null}
              <Txt variant="caption" tone="muted" accessibilityLiveRegion="polite">{`크루 ${items.length}개`}</Txt>
            </View>
          }
          empty={
            <EmptyState
              title={filtered ? '조건에 맞는 크루가 없어요' : '아직 크루가 없어요'}
              description={filtered ? '이름이나 지역을 바꿔 보거나 크루를 새로 만들어 보세요.' : undefined}
              actionLabel="크루 만들기"
              onAction={() => router.push('/create-crew')}
            />
          }
          renderItem={({ item }) => <CrewRow crew={item} disabled={joining} onPress={() => open(item)} />}
          ListFooterComponent={
            moreState === 'loading' ? <Loading label="크루를 더 불러오고 있어요" /> : moreState === 'failed' ? <Button label="다시 시도" variant="ghost" onPress={loadMore} /> : null
          }
        />
      )}

      <BottomSheet visible={regionSheet} onClose={() => setRegionSheet(false)} title="지역">
        <ListRow
          title="전체"
          chevron={false}
          emphasized={!filter.region}
          onPress={() => { setRegionSheet(false); setFilter((f) => ({ ...f, region: undefined })); }}
        />
        {REGIONS.map(([code, label]) => (
          <ListRow
            key={code}
            title={label}
            chevron={false}
            emphasized={code === filter.region}
            onPress={() => { setRegionSheet(false); setFilter((f) => ({ ...f, region: code })); }}
          />
        ))}
      </BottomSheet>

      <BottomSheet
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onClosed={() => {
          const next = afterClose.current;
          afterClose.current = null;
          if (next) finishOnboarding(navigation, next.to, next.flash ? { flash: next.flash } : undefined);
        }}
        dismissible={!joining}
        title={selected?.name ?? ''}
      >
        {selected ? <JoinSheetBody crew={selected} /> : null}
        {sheetBanner ? <Banner tone="danger">{sheetBanner}</Banner> : null}
        {selected ? (
          <Button
            label={selected.joinPolicy === 'OPEN' ? '가입하기' : '가입 신청하기'}
            accessibilityLabel={joining ? '가입 중' : `${selected.name} ${selected.joinPolicy === 'OPEN' ? '가입하기' : '가입 신청하기'}`}
            size="lg"
            fullWidth
            loading={joining}
            disabled={isFull(selected) || blocked}
            onPress={join}
          />
        ) : null}
      </BottomSheet>

      <Snackbar visible={snackbar != null} message={snackbar ?? ''} onDismiss={() => setSnackbar(null)} />
    </Screen>
  );
}

function CrewRow({ crew, disabled, onPress }: { crew: CrewSummary; disabled: boolean; onPress: () => void }) {
  const ripple = useRipple();
  const full = isFull(crew);
  const policy = JOIN_POLICY_LABEL[crew.joinPolicy];
  const third = full ? '정원이 찼어요' : crew.intro;
  const label = [crew.name, policy, regionName(crew.region), `크루원 ${crew.memberCount}명, 정원 ${CREW_CAPACITY}명`, third].filter(Boolean).join(', ');
  return (
    <Pressable
      android_ripple={ripple}
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: size.minTouch, paddingVertical: space.sm }}
    >
      <Avatar name={crew.name} uri={crew.photoUrl ?? undefined} size="md" />
      <View style={{ flex: 1, gap: space.xs }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
          <Txt variant="body" bold numberOfLines={1} style={{ flexShrink: 1 }}>{crew.name}</Txt>
          <Badge label={policy} tone={crew.joinPolicy === 'OPEN' ? 'lime' : 'neutral'} />
        </View>
        <Txt variant="caption" tone="muted">{`${regionName(crew.region)} · ${members(crew)}`}</Txt>
        {third ? <Txt variant="caption" tone="muted" numberOfLines={1}>{third}</Txt> : null}
      </View>
      <Icon name="chevron-right" />
    </Pressable>
  );
}

function JoinSheetBody({ crew }: { crew: CrewSummary }) {
  const notice = isFull(crew)
    ? `정원(${CREW_CAPACITY}명)이 차서 지금은 가입할 수 없어요. 자리가 생기면 다시 신청할 수 있어요.`
    : crew.joinPolicy === 'OPEN' ? '바로 크루원이 돼요.' : '크루장이 승인하면 크루원이 돼요.';
  return (
    <View style={{ gap: space.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
        <Avatar name={crew.name} uri={crew.photoUrl ?? undefined} size="lg" />
        <View style={{ flex: 1, gap: space.xs, alignItems: 'flex-start' }}>
          <Badge label={JOIN_POLICY_LABEL[crew.joinPolicy]} tone={crew.joinPolicy === 'OPEN' ? 'lime' : 'neutral'} />
          <Txt variant="caption" tone="muted">{`크루장 ${crew.leader.nickname} · ${members(crew)}`}</Txt>
          <Txt variant="caption" tone="muted">{regionName(crew.region)}</Txt>
        </View>
      </View>
      {crew.intro ? <Txt variant="body">{crew.intro}</Txt> : null}
      <Txt variant="body" bold accessibilityLiveRegion="polite">{notice}</Txt>
    </View>
  );
}
