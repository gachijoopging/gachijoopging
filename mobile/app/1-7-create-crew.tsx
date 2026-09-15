import { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { AppHeader, Banner, Button, Field, Screen, Txt } from 'design-system/src';
import { createMockClient, type ApiClient } from '../src/api/client';
import { mapCrewCreateError } from '../src/auth/errors';
import { normalizeCrewName, validateCrewName } from '../src/auth/validators';

const api: ApiClient = createMockClient({ delayMs: 300 });

export default function CreateCrewScreen() {
  const [name, setName] = useState('');
  const [nameError, setNameError] = useState<string>();
  const [banner, setBanner] = useState<string>();
  const [loading, setLoading] = useState(false);
  const canSubmit = !validateCrewName(name);

  async function handleSubmit() {
    const error = validateCrewName(name);
    setNameError(error);
    if (loading || error) return;

    setBanner(undefined);
    setLoading(true);
    try {
      await api.mutate('POST /crews', { name: normalizeCrewName(name) });
      router.replace('/(tabs)');
    } catch (error) {
      const mapped = mapCrewCreateError(error);
      setNameError(mapped.field);
      setBanner(mapped.banner);
      if (mapped.alreadyInCrew) {
        try {
          const me = await api.get('GET /users/me');
          const membershipStatus = me.data.membership?.status;
          if (membershipStatus === 'MEMBER') router.replace('/(tabs)');
          else if (membershipStatus === 'PENDING') router.replace('/1-9-pending-approval');
        } catch {
          // 이미 보인 오류 문구를 유지한다.
        }
      }
    } finally {
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
        returnKeyType="done"
        onSubmitEditing={handleSubmit}
      />
      <Txt variant="caption" tone="muted">2~20자로 입력해 주세요.</Txt>

      <Banner tone="neutral">
        크루를 만들면 내가 크루장이 돼요.{"\n"}초대 코드는 자동으로 만들어져요.{"\n"}소개·사진·목표는 나중에 정할 수 있어요.
      </Banner>
      {banner ? <Banner tone="danger">{banner}</Banner> : null}

      <View style={{ flex: 1 }} />
      <Button label="크루 만들기" variant="primary" size="lg" fullWidth loading={loading} disabled={!canSubmit} onPress={handleSubmit} />
    </Screen>
  );
}
