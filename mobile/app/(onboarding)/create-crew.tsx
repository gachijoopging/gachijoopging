// 화면 1-7 · docs/screens/1-7-create-crew.md
import { useRef, useState } from 'react';
import { View } from 'react-native';
import { router, useNavigation } from 'expo-router';
import { AppHeader, Banner, Button, Field, Screen } from 'design-system/src';
import { onboardingApi as api } from '../../src/api/onboarding';
import { mapCrewCreateError } from '../../src/auth/errors';
import { normalizeCrewName, validateCrewName } from '../../src/auth/validators';
import { finishOnboarding, type OnboardingNavigation } from '../../src/auth/navigation';
import { usePreventBack } from '../../src/auth/usePreventBack';

export default function CreateCrewScreen() {
  const navigation = useNavigation<OnboardingNavigation>('/');
  const [name, setName] = useState('');
  const [nameError, setNameError] = useState<string>();
  const [banner, setBanner] = useState<string>();
  const [loading, setLoading] = useState(false);
  const busy = useRef(false);
  usePreventBack(loading);
  const canSubmit = !validateCrewName(name);

  async function handleSubmit() {
    const error = validateCrewName(name);
    setNameError(error);
    if (busy.current || error) return;
    busy.current = true;

    setBanner(undefined);
    setLoading(true);
    try {
      await api.mutate('POST /crews', { name: normalizeCrewName(name) });
      finishOnboarding(navigation, '/(tabs)');
    } catch (error) {
      const mapped = mapCrewCreateError(error);
      setNameError(mapped.field);
      setBanner(mapped.banner);
      if (mapped.alreadyInCrew) {
        try {
          const me = await api.get('GET /users/me');
          const membershipStatus = me.data.membership?.status;
          if (membershipStatus === 'MEMBER') finishOnboarding(navigation, '/(tabs)');
          else if (membershipStatus === 'PENDING') finishOnboarding(navigation, '/pending-approval');
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
    <Screen scroll>
      <AppHeader title="새 크루 만들기" onBack={() => router.back()} backDisabled={loading} />

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
        onSubmitEditing={handleSubmit}
      />
      {banner ? <Banner tone="danger">{banner}</Banner> : null}

      <View style={{ flex: 1 }} />
      <Button label="크루 만들기" variant="primary" size="lg" fullWidth loading={loading} disabled={!canSubmit} onPress={handleSubmit} />
    </Screen>
  );
}
