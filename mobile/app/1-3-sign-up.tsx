import { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { AppHeader, Banner, Button, Chip, Field, Screen, Txt } from 'design-system/src';
import { onboardingApi as api } from '../src/api/onboarding';
import { AgreementFields } from '../src/auth/AgreementFields';
import { resolveDestination } from '../src/auth/destination';
import { mapSignupError } from '../src/auth/errors';
import { validateEmail, validateNickname, validatePassword } from '../src/auth/validators';

export default function SignUpScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nickname, setNickname] = useState('');
  const [emailError, setEmailError] = useState<string>();
  const [passwordError, setPasswordError] = useState<string>();
  const [nicknameError, setNicknameError] = useState<string>();
  const [terms, setTerms] = useState(false);
  const [privacy, setPrivacy] = useState(false);
  const [optional, setOptional] = useState(false);
  const [banner, setBanner] = useState<string>();
  const [secure, setSecure] = useState(true);
  const [loading, setLoading] = useState(false);

  const canSubmit =
    !validateEmail(email) && !validatePassword(password) && !validateNickname(nickname) && terms && privacy;

  async function handleSubmit() {
    if (loading || !canSubmit) return;
    setBanner(undefined);
    setLoading(true);
    try {
      await api.mutate('POST /auth/signup', { email: email.trim(), password, nickname: nickname.trim() });
      try {
        const me = await api.get('GET /users/me');
        router.replace(resolveDestination(me.data));
      } catch {
        setBanner('내 정보를 불러오지 못했어요. 다시 시도해 주세요.');
      }
    } catch (error) {
      const mapped = mapSignupError(error);
      setEmailError(mapped.email);
      setNicknameError(mapped.nickname);
      setBanner(mapped.banner);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Screen scroll>
      <AppHeader title="회원가입" onBack={() => router.back()} backDisabled={loading} />

      <Txt variant="title" bold style={{ textAlign: 'center' }}>
        가치줍깅에 오신 걸 환영해요
      </Txt>
      <Txt variant="body" tone="muted" style={{ textAlign: 'center' }}>
        이메일·비밀번호·닉네임을 입력해 주세요
      </Txt>

      <Field
        label="이메일"
        placeholder="you@example.com"
        value={email}
        onChangeText={setEmail}
        onBlur={() => setEmailError(validateEmail(email))}
        error={emailError}
        editable={!loading}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        textContentType="emailAddress"
        returnKeyType="next"
      />

      <Field
        label="비밀번호"
        placeholder="8자 이상"
        value={password}
        onChangeText={setPassword}
        onBlur={() => setPasswordError(validatePassword(password))}
        error={passwordError}
        editable={!loading}
        secureTextEntry={secure}
        textContentType="newPassword"
        returnKeyType="next"
        endAdornment={<Chip label={secure ? '보기' : '숨기기'} tone="neutral" onPress={loading ? undefined : () => setSecure((v) => !v)} />}
      />

      <Field
        label="닉네임"
        placeholder="2~12자"
        value={nickname}
        onChangeText={setNickname}
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

      <Button
        label="회원가입"
        variant="primary"
        size="lg"
        fullWidth
        loading={loading}
        disabled={!canSubmit}
        onPress={handleSubmit}
      />

      <View style={{ alignItems: 'center' }}>
        <Button
          label="이미 계정이 있어요 · 로그인"
          variant="ghost"
          disabled={loading}
          onPress={() => router.replace('/1-2-login')}
        />
      </View>
    </Screen>
  );
}
