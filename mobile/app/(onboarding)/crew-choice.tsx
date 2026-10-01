// 화면 1-6 · docs/screens/1-6-create-or-join-crew.md
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, BackHandler, View } from 'react-native';
import { router, useFocusEffect, useNavigation } from 'expo-router';
import { AppHeader, Banner, BottomSheet, Button, Card, Field, Icon, IconButton, Screen, Snackbar, Txt, space } from 'design-system/src';
import { useFlash } from '../../src/ui/useFlash';
import { onboardingApi as api } from '../../src/api/onboarding';
import { authenticatedDestination } from '../../src/auth/destination';
import { mapCrewCreateError } from '../../src/auth/errors';
import { normalizeCrewName, validateCrewName } from '../../src/auth/validators';
import { finishOnboarding, type OnboardingNavigation } from '../../src/auth/navigation';

function CrewChoice({
  icon,
  title,
  onPress,
  disabled,
}: {
  icon: 'plus' | 'key-outline';
  title: string;
  onPress: () => void;
  disabled: boolean;
}) {
  return (
    <Card accessibilityLabel={title} onPress={onPress} disabled={disabled}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
        <Icon name={icon} />
        <Txt variant="section" bold style={{ flex: 1 }}>{title}</Txt>
        <Icon name="chevron-right" />
      </View>
    </Card>
  );
}

export default function CreateOrJoinCrewScreen() {
  const navigation = useNavigation<OnboardingNavigation>('/');
  const busy = useRef(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState(false);
  const [flash, setFlash] = useFlash();
  const [creating, setCreating] = useState(false);
  // 시트가 다 내려간 뒤에 넘어간다. 내려가는 중에 화면을 바꾸면 시트가 다음 화면 위에 겹친다
  const afterClose = useRef<'/(tabs)' | '/pending-approval' | null>(null);

  const checkMembership = useCallback(async (next?: () => void) => {
    if (busy.current) return;
    busy.current = true;
    setChecking(true);
    setError(false);
    try {
      const me = await api.get('GET /users/me');
      const destination = await authenticatedDestination(api, me.data);
      if (destination !== '/crew-choice') {
        finishOnboarding(navigation, destination);
      } else {
        next?.();
      }
    } catch {
      setError(true);
      next?.();
    } finally {
      busy.current = false;
      setChecking(false);
    }
  }, [navigation]);

  useFocusEffect(useCallback(() => {
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') void checkMembership();
    });
    const back = BackHandler.addEventListener('hardwareBackPress', () => {
      BackHandler.exitApp();
      return true;
    });
    return () => { appState.remove(); back.remove(); };
  }, [checkMembership]));

  return (
    <Screen scroll>
      <AppHeader title="크루 시작하기" action={<IconButton icon="cog-outline" label="설정" onPress={() => router.push('/settings')} />} />

      <View style={{ alignItems: 'center', gap: space.sm }}>
        <Txt variant="title" bold style={{ textAlign: 'center' }}>
          함께 줍는 크루를 선택해 주세요
        </Txt>
      </View>

      <CrewChoice
        icon="plus"
        title="새 크루 만들기"
        disabled={checking}
        onPress={() => { void checkMembership(() => setCreating(true)); }}
      />
      <CrewChoice
        icon="key-outline"
        title="초대 코드로 가입하기"
        disabled={checking}
        onPress={() => { void checkMembership(() => router.push('/enter-invite-code')); }}
      />

      {error ? (
        <Banner tone="danger" action={{ label: '다시 시도', onPress: () => { void checkMembership(); } }}>
          소속을 확인하지 못했어요. 네트워크 상태를 확인해 주세요.
        </Banner>
      ) : null}
      <Button
        label="내 활동 기록 보기"
        variant="ghost"
        size="lg"
        fullWidth
        accessibilityLabel="내 활동 기록 보기, 이전 크루의 내 기록 포함"
        onPress={() => router.push('/records')}
      />
      <CreateCrewSheet
        visible={creating}
        onClose={() => setCreating(false)}
        onDone={(destination) => { afterClose.current = destination; setCreating(false); }}
        onClosed={() => {
          const destination = afterClose.current;
          afterClose.current = null;
          if (destination) finishOnboarding(navigation, destination);
        }}
      />
      <Snackbar visible={flash != null} message={flash ?? ''} onDismiss={() => setFlash(null)} />
    </Screen>
  );
}

/** 이름 하나만 받는 크루 만들기. 전체 화면을 따로 두지 않는다 (docs/screens/1-6) */
function CreateCrewSheet({ visible, onClose, onDone, onClosed }: {
  visible: boolean;
  onClose: () => void;
  onDone: (destination: '/(tabs)' | '/pending-approval') => void;
  onClosed: () => void;
}) {
  const [name, setName] = useState('');
  const [nameError, setNameError] = useState<string>();
  const [banner, setBanner] = useState<string>();
  const [loading, setLoading] = useState(false);
  const busy = useRef(false);

  // 다시 열 때 지난번 오류가 남아 있지 않게 한다. 입력한 이름은 남긴다
  useEffect(() => {
    if (visible) return;
    setNameError(undefined);
    setBanner(undefined);
  }, [visible]);

  async function submit() {
    const invalid = validateCrewName(name);
    setNameError(invalid);
    if (busy.current || invalid) return;
    busy.current = true;
    setBanner(undefined);
    setLoading(true);
    try {
      await api.mutate('POST /crews', { name: normalizeCrewName(name) });
      onDone('/(tabs)');
    } catch (e) {
      const mapped = mapCrewCreateError(e);
      setNameError(mapped.field);
      setBanner(mapped.banner);
      if (mapped.alreadyInCrew) {
        try {
          const status = (await api.get('GET /users/me')).data.membership?.status;
          if (status === 'MEMBER') onDone('/(tabs)');
          else if (status === 'PENDING') onDone('/pending-approval');
        } catch {
          setBanner('소속을 확인하지 못했어요. 네트워크 상태를 확인하고 다시 시도해 주세요.');
        }
      }
    } finally {
      busy.current = false;
      setLoading(false);
    }
  }

  return (
    <BottomSheet visible={visible} onClose={onClose} onClosed={onClosed} dismissible={!loading} title="새 크루 만들기">
      <Field
        label="크루 이름"
        placeholder="예: 한강줍깅크루"
        value={name}
        onChangeText={(value) => {
          setName(value);
          if (nameError) setNameError(undefined);
        }}
        onBlur={() => setNameError(validateCrewName(name))}
        error={nameError}
        editable={!loading}
        autoFocus
        returnKeyType="done"
        onSubmitEditing={submit}
      />
      {banner ? <Banner tone="danger">{banner}</Banner> : null}
      <Button label="크루 만들기" variant="primary" size="lg" fullWidth loading={loading} disabled={!!validateCrewName(name)} onPress={submit} />
    </BottomSheet>
  );
}
