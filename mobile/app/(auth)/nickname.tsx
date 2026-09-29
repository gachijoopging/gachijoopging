// 화면 1-4 · docs/screens/1-4-nickname.md
import { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { AppHeader, Banner, Button, Field, Screen, Txt, space } from 'design-system/src';
import { onboardingApi as api } from '../../src/api/onboarding';
import { AgreementFields } from '../../src/auth/AgreementFields';
import { resolveDestination } from '../../src/auth/destination';
import { mapNicknameError } from '../../src/auth/errors';
import { validateNickname } from '../../src/auth/validators';

export default function NicknameScreen() {
  const [nickname, setNickname] = useState('');
  const [nicknameError, setNicknameError] = useState<string>();
  const [terms, setTerms] = useState(false);
  const [privacy, setPrivacy] = useState(false);
  const [optional, setOptional] = useState(false);
  const [banner, setBanner] = useState<string>();
  const [loading, setLoading] = useState(false);

  const canSubmit = !validateNickname(nickname) && terms && privacy;

  async function handleSubmit() {
    if (loading || !canSubmit) return;
    setBanner(undefined);
    setLoading(true);
    try {
      await api.mutate('PATCH /users/me', { nickname: nickname.trim() });
      const me = await api.get('GET /users/me');
      router.replace(resolveDestination(me.data));
    } catch (error) {
      const mapped = mapNicknameError(error);
      setNicknameError(mapped.field);
      setBanner(mapped.banner);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Screen scroll>
      <AppHeader title="닉네임 설정" backDisabled={loading} />

      <View style={{ alignItems: 'center', gap: space.sm }}>
        <Txt variant="title" bold style={{ textAlign: 'center' }}>
          어떻게 불러 드릴까요?
        </Txt>
      </View>

      <Field
        label="닉네임"
        placeholder="2~12자"
        value={nickname}
        onChangeText={(v) => {
          setNickname(v);
          if (nicknameError) setNicknameError(undefined);
        }}
        onBlur={() => setNicknameError(validateNickname(nickname))}
        error={nicknameError}
        editable={!loading}
        returnKeyType="done"
        onSubmitEditing={handleSubmit}
      />

      <AgreementFields
        termsChecked={terms}
        onTermsChange={setTerms}
        privacyChecked={privacy}
        onPrivacyChange={setPrivacy}
        optionalChecked={optional}
        onOptionalChange={setOptional}
        disabled={loading}
      />

      {banner ? <Banner tone="danger">{banner}</Banner> : null}

      <Button label="다음" variant="primary" size="lg" fullWidth loading={loading} disabled={!canSubmit} onPress={handleSubmit} />
    </Screen>
  );
}
