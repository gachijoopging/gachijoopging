import { useState } from 'react';
import { Image, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { AppHeader, Banner, Button, Chip, Field, Screen, Snackbar, Txt, space } from 'design-system/src';
import { createMockClient, type ApiClient } from '../src/api/client';
import { resolveDestination } from '../src/auth/destination';
import { loginErrorMessage } from '../src/auth/errors';
import { LinkText } from '../src/auth/LinkText';
import { validateEmail, validatePassword } from '../src/auth/validators';

const wordmark = require('../../design-system/assets/logo-wordmark.png');

const api: ApiClient = createMockClient({ delayMs: 300 });

export default function LoginScreen() {
  const params = useLocalSearchParams<{ justReset?: string }>();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emailError, setEmailError] = useState<string>();
  const [passwordError, setPasswordError] = useState<string>();
  const [banner, setBanner] = useState<string>();
  const [secure, setSecure] = useState(true);
  const [loading, setLoading] = useState(false);
  const [resetSnackbar, setResetSnackbar] = useState(params.justReset === '1');

  async function handleSubmit() {
    if (loading) return;
    const emailErr = validateEmail(email);
    const passwordErr = validatePassword(password);
    setEmailError(emailErr);
    setPasswordError(passwordErr);
    if (emailErr || passwordErr) return;

    setBanner(undefined);
    setLoading(true);
    try {
      await api.mutate('POST /auth/login', { email: email.trim(), password });
      try {
        const me = await api.get('GET /users/me');
        router.replace(resolveDestination(me.data));
      } catch {
        setBanner('내 정보를 불러오지 못했어요. 다시 시도해 주세요.');
      }
    } catch (error) {
      setBanner(loginErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  function goToReset() {
    const emailErr = validateEmail(email);
    router.push(emailErr ? '/1-5-reset-password' : { pathname: '/1-5-reset-password', params: { email: email.trim() } });
  }

  return (
    <Screen scroll>
      <AppHeader title="이메일 로그인" subtitle="기존 계정" onBack={() => router.back()} backDisabled={loading} />

      <View style={{ alignItems: 'center', gap: space.sm }}>
        <Image source={wordmark} accessibilityLabel="가치줍깅" resizeMode="contain" style={{ width: 190, aspectRatio: 840 / 301 }} />
        <Txt variant="title" bold style={{ textAlign: 'center' }}>
          다시 만나서 반가워요
        </Txt>
        <Txt variant="body" tone="muted" style={{ textAlign: 'center' }}>
          가입한 이메일로 로그인하고{'\n'}오늘의 줍깅을 이어가요.
        </Txt>
      </View>

      <Field
        label="이메일"
        placeholder="you@example.com"
        value={email}
        onChangeText={(v) => {
          setEmail(v);
          if (emailError) setEmailError(undefined);
        }}
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
        onChangeText={(v) => {
          setPassword(v);
          if (passwordError) setPasswordError(undefined);
        }}
        error={passwordError}
        editable={!loading}
        secureTextEntry={secure}
        textContentType="password"
        returnKeyType="done"
        onSubmitEditing={handleSubmit}
        endAdornment={
          <Chip label={secure ? '보기' : '숨기기'} tone="neutral" onPress={loading ? undefined : () => setSecure((v) => !v)} />
        }
      />

      {banner ? <Banner tone="danger">{banner}</Banner> : null}

      <Button label="로그인" variant="primary" size="lg" fullWidth loading={loading} onPress={handleSubmit} />

      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: space.lg }}>
        <LinkText label="비밀번호를 잊으셨나요?" tone="muted" disabled={loading} onPress={goToReset} />
        <LinkText label="회원가입" bold disabled={loading} onPress={() => router.push('/1-3-sign-up')} />
      </View>

      <Snackbar
        visible={resetSnackbar}
        message="비밀번호를 변경했어요. 다시 로그인해 주세요."
        onDismiss={() => setResetSnackbar(false)}
      />
    </Screen>
  );
}
