// 화면 1-7 · docs/screens/1-7-create-crew.md
import { useEffect, useRef, useState } from 'react';
import { View, type TextInput } from 'react-native';
import { router, useNavigation } from 'expo-router';
import { AppHeader, Banner, BottomSheet, Button, Card, Dialog, Field, ListRow, Screen, SelectRow, Txt, space } from 'design-system/src';
import { onboardingApi as api } from '../../src/api/onboarding';
import { mapCrewCreateError } from '../../src/auth/errors';
import { finishOnboarding, type OnboardingNavigation } from '../../src/auth/navigation';
import { usePreventBack } from '../../src/auth/usePreventBack';
import { normalizeCrewName, validateCrewName } from '../../src/auth/validators';
import { CREW_INTRO_MAX, CREW_NAME_MAX } from '../../src/crew/crew-edit';
import { REGIONS, regionName, type JoinPolicy, type Region } from '../../src/crew/region';

const POLICIES: { value: JoinPolicy; title: string; subtitle: string }[] = [
  { value: 'OPEN', title: '공개', subtitle: '승인 없이 바로 가입' },
  { value: 'APPROVAL', title: '비공개', subtitle: '크루장이 승인해야 가입' },
];

export default function CreateCrewScreen() {
  const navigation = useNavigation<OnboardingNavigation>('/');
  const [name, setName] = useState('');
  const [intro, setIntro] = useState('');
  const [region, setRegion] = useState<Region>();
  const [joinPolicy, setJoinPolicy] = useState<JoinPolicy>();
  const [nameError, setNameError] = useState<string>();
  const [banner, setBanner] = useState<string>();
  const [regionSheet, setRegionSheet] = useState(false);
  const [pendingLeave, setPendingLeave] = useState<(() => void) | null>(null);
  const [loading, setLoading] = useState(false);
  const busy = useRef(false);
  const done = useRef(false);
  const introRef = useRef<TextInput>(null);
  usePreventBack(loading);

  const dirty = !!(name || intro || region || joinPolicy);
  const introError = intro.trim().length > CREW_INTRO_MAX ? `크루 설명은 ${CREW_INTRO_MAX}자까지 입력할 수 있어요.` : undefined;
  const ready = !validateCrewName(name) && !introError && !!region && !!joinPolicy;

  useEffect(
    () =>
      navigation.addListener('beforeRemove', (e) => {
        if (done.current || !dirty) return;
        e.preventDefault();
        if (busy.current) return;
        setPendingLeave(() => () => navigation.dispatch(e.data.action));
      }),
    [navigation, dirty],
  );

  async function submit() {
    if (busy.current || !ready) return;
    busy.current = true;
    setBanner(undefined);
    setLoading(true);
    const crewName = normalizeCrewName(name);
    try {
      await api.mutate('POST /crews', { name: crewName, ...(intro.trim() ? { intro: intro.trim() } : {}), region, joinPolicy });
      done.current = true;
      finishOnboarding(navigation, '/(tabs)', { flash: `${crewName} 크루를 만들었어요.` });
      return;
    } catch (e) {
      const mapped = mapCrewCreateError(e);
      if (mapped.moved) {
        done.current = true;
        finishOnboarding(navigation, mapped.moved.to, { flash: mapped.moved.flash });
        return;
      }
      setNameError(mapped.field);
      setBanner(mapped.banner);
    }
    busy.current = false;
    setLoading(false);
  }

  return (
    <Screen scroll contentStyle={{ flexGrow: 1 }}>
      <AppHeader title="크루 만들기" onBack={() => router.back()} backDisabled={loading} />

      <Field
        label="크루 이름"
        accessibilityLabel={`크루 이름, 필수, 2자에서 ${CREW_NAME_MAX}자`}
        placeholder="예: 한강줍깅크루"
        value={name}
        onChangeText={(value) => {
          setName(value);
          if (nameError) setNameError(undefined);
        }}
        onBlur={() => setNameError(name ? validateCrewName(name) : undefined)}
        error={nameError}
        editable={!loading}
        autoFocus
        returnKeyType="next"
        submitBehavior="submit"
        onSubmitEditing={() => introRef.current?.focus()}
      />
      <Field
        ref={introRef}
        label="크루 설명 (선택)"
        accessibilityLabel={`크루 설명, 선택, ${CREW_INTRO_MAX}자까지`}
        placeholder="예: 매주 토요일 아침 여의도"
        value={intro}
        onChangeText={setIntro}
        error={introError}
        multiline
        editable={!loading}
      />

      <View style={{ gap: space.xs }}>
        <Txt variant="label">활동 지역</Txt>
        <Card style={{ paddingVertical: 0 }}>
          <ListRow
            title={region ? regionName(region) : '시·도를 골라 주세요'}
            accessibilityLabel={`활동 지역, 필수, ${region ? regionName(region) : '선택 안 됨'}`}
            disabled={loading}
            divider={false}
            onPress={() => setRegionSheet(true)}
          />
        </Card>
      </View>

      <View style={{ gap: space.xs }} accessibilityLabel="가입 방식, 필수">
        <Txt variant="label">가입 방식</Txt>
        {POLICIES.map((p) => (
          <SelectRow
            key={p.value}
            title={p.title}
            subtitle={p.subtitle}
            selected={joinPolicy === p.value}
            disabled={loading}
            onPress={() => setJoinPolicy(p.value)}
          />
        ))}
        <Txt variant="caption" tone="muted">공개·비공개 모두 크루 찾기에 나와요.</Txt>
      </View>

      <View style={{ flex: 1 }} />
      {banner ? <Banner tone="danger">{banner}</Banner> : null}
      <Button
        label="크루 만들기"
        accessibilityLabel={loading ? '만드는 중' : '크루 만들기'}
        size="lg"
        fullWidth
        loading={loading}
        disabled={!ready}
        onPress={submit}
      />

      <BottomSheet visible={regionSheet} onClose={() => setRegionSheet(false)} title="활동 지역">
        {REGIONS.map(([code, label]) => (
          <ListRow
            key={code}
            title={label}
            chevron={false}
            emphasized={code === region}
            onPress={() => {
              setRegion(code);
              setRegionSheet(false);
            }}
          />
        ))}
      </BottomSheet>

      <Dialog
        visible={pendingLeave != null}
        onClose={() => setPendingLeave(null)}
        title="크루 만들기를 그만둘까요?"
        actions={
          <>
            <Button label="계속 만들기" variant="ghost" size="md" onPress={() => setPendingLeave(null)} />
            <Button
              label="그만두기"
              variant="danger"
              size="md"
              onPress={() => {
                const leave = pendingLeave;
                setPendingLeave(null);
                done.current = true;
                leave?.();
              }}
            />
          </>
        }
      />
    </Screen>
  );
}
