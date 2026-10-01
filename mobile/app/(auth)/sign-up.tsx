// 화면 1-3 · docs/screens/1-3-sign-up.md
import { useRef, useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { AppHeader, Banner, Button, Chip, Field, Screen, Txt } from 'design-system/src';
import { onboardingApi as api } from '../../src/api/onboarding';
import { AgreementFields } from '../../src/auth/AgreementFields';
import { resolveDestination } from '../../src/auth/destination';
import { mapSignupError } from '../../src/auth/errors';
import { normalizeNickname, validateEmail, validateNickname, validatePassword } from '../../src/auth/validators';
import { clearAgreementChoices, rememberAgreementChoices, requiredAgreementsAccepted, useAgreementForm } from '../../src/auth/agreements';
import { ApiError } from '../../src/api/client';
import { rememberAccount } from '../../src/auth/account';

export default function SignUpScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nickname, setNickname] = useState('');
  const [emailError, setEmailError] = useState<string>();
  const [passwordError, setPasswordError] = useState<string>();
  const [nicknameError, setNicknameError] = useState<string>();
  const agreements = useAgreementForm(api, 'signup', true);
  const [created, setCreated] = useState(false);
  const registered = useRef(false);
  const busy = useRef(false);
  const [banner, setBanner] = useState<string>();
  const [secure, setSecure] = useState(true);
  const [loading, setLoading] = useState(false);

  const canSubmit =
    !validateEmail(email) && !validatePassword(password) && !validateNickname(nickname) && agreements.items != null && !agreements.failed && requiredAgreementsAccepted(agreements.items);

  async function handleSubmit() {
    if (busy.current || !canSubmit || !agreements.items) return;
    busy.current = true;
    setBanner(undefined);
    setLoading(true);
    try {
      if (!registered.current) {
        await api.mutate('POST /auth/signup', { email: email.trim(), password, nickname: normalizeNickname(nickname) });
        registered.current = true;
        setCreated(true);
      }
      const me = await api.get('GET /users/me');
      rememberAccount(me.data);
      rememberAgreementChoices(me.data.id, agreements.items);
      const { data } = await api.mutate('PUT /users/me/agreements', { items: agreements.items.map(({ type, version, agreed }) => ({ type, version, agreed })) });
      if (!data.complete) throw new Error('필수 동의가 완료되지 않았어요');
      clearAgreementChoices('signup');
      clearAgreementChoices(me.data.id);
      router.replace(resolveDestination(me.data));
    } catch (error) {
      const mapped = mapSignupError(error);
      setEmailError(mapped.email);
      setNicknameError(mapped.nickname);
      setBanner(mapped.banner);
      if (error instanceof ApiError && error.fields?.some((field) => field.field === 'items' && field.code === 'FORMAT')) {
        await agreements.reload();
        setBanner('약관이 변경됐어요. 새 항목을 확인해 주세요.');
      } else if (registered.current) setBanner('동의를 저장하지 못했어요. 다시 시도해 주세요.');
    } finally {
      setLoading(false);
      busy.current = false;
    }
  }

  return (
    <Screen scroll>
      <AppHeader title="회원가입" onBack={() => router.back()} backDisabled={loading} />

      <Txt variant="title" bold style={{ textAlign: 'center' }}>
        가치줍깅에 오신 걸 환영해요
      </Txt>

      <Field
        label="이메일"
        placeholder="you@example.com"
        value={email}
        onChangeText={setEmail}
        onBlur={() => setEmailError(validateEmail(email))}
        error={emailError}
        editable={!loading && !created}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="email"
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
        editable={!loading && !created}
        secureTextEntry={secure}
        autoComplete="new-password"
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
        editable={!loading && !created}
        returnKeyType="done"
        onSubmitEditing={handleSubmit}
      />

      <AgreementFields
        items={agreements.items}
        onChange={agreements.change}
        failed={agreements.failed}
        onRetry={agreements.reload}
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
          onPress={() => router.replace('/login')}
        />
      </View>
    </Screen>
  );
}
