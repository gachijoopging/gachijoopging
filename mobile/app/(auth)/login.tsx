// 화면 1-2 · docs/screens/1-2-login.md
import { useRef, useState } from 'react';
import { Image, View, type TextInput } from 'react-native';
import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import { AppHeader, Banner, Button, Chip, Field, LinkText, Screen, Snackbar, Txt, space, useTheme, size, WORDMARK_RATIO } from 'design-system/src';
import { onboardingApi as api } from '../../src/api/onboarding';
import { completeSignIn } from '../../src/auth/complete-sign-in';
import { loginErrorMessage } from '../../src/auth/errors';
import type { OnboardingNavigation } from '../../src/auth/navigation';
import { usePreventBack } from '../../src/auth/usePreventBack';
import { validateEmail, validatePassword } from '../../src/auth/validators';

const wordmark = require('../../../design-system/assets/logo-wordmark.png');
const wordmarkDark = require('../../../design-system/assets/logo-wordmark-dark.png');

export default function LoginScreen() {
  const { scheme } = useTheme();
  const params = useLocalSearchParams<{ justReset?: string }>();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emailError, setEmailError] = useState<string>();
  const [passwordError, setPasswordError] = useState<string>();
  const [banner, setBanner] = useState<string>();
  const [secure, setSecure] = useState(true);
  const [loading, setLoading] = useState(false);
  const [resetSnackbar, setResetSnackbar] = useState(params.justReset === '1');
  const navigation = useNavigation<OnboardingNavigation>('/');
  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  // 로그인은 됐는데 내 정보만 실패하면 토큰은 살아 있다 — 다시 누르면 로그인을 반복하지 않는다
  const authenticated = useRef(false);
  usePreventBack(loading);

  async function handleSubmit() {
    if (loading) return;
    const emailErr = validateEmail(email);
    const passwordErr = validatePassword(password);
    setEmailError(emailErr);
    setPasswordError(passwordErr);
    if (emailErr || passwordErr) return (emailErr ? emailRef : passwordRef).current?.focus();

    setBanner(undefined);
    setLoading(true);
    try {
      if (!authenticated.current) {
        await api.mutate('POST /auth/login', { email: email.trim(), password });
        authenticated.current = true;
      }
      await completeSignIn(api, navigation);
      // 떠나는 화면은 다시 그리지 않는다. 전환 중 재렌더가 Fabric 을 죽인다
      return;
    } catch (error) {
      setBanner(authenticated.current ? '내 정보를 불러오지 못했어요. 다시 시도해 주세요.' : loginErrorMessage(error));
    }
    setLoading(false);
  }

  function goToReset() {
    const emailErr = validateEmail(email);
    router.push(emailErr ? '/reset-password' : { pathname: '/reset-password', params: { email: email.trim() } });
  }

  return (
    <Screen scroll>
      <AppHeader title="이메일 로그인" subtitle="기존 계정" onBack={() => router.back()} backDisabled={loading} />

      <View style={{ alignItems: 'center', gap: space.sm }}>
        <Image source={scheme === 'dark' ? wordmarkDark : wordmark} accessibilityLabel="가치줍깅" resizeMode="contain" style={{ width: size.wordmarkMd, height: size.wordmarkMd * WORDMARK_RATIO }} />
        <Txt variant="title" bold style={{ textAlign: 'center' }}>
          다시 만나서 반가워요
        </Txt>
      </View>

      <Field
        ref={emailRef}
        label="이메일"
        placeholder="you@example.com"
        value={email}
        onChangeText={(v) => {
          setEmail(v);
          if (emailError) setEmailError(undefined);
          if (banner) setBanner(undefined);
        }}
        error={emailError}
        editable={!loading}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="email"
        textContentType="emailAddress"
        returnKeyType="next"
        blurOnSubmit={false}
        onSubmitEditing={() => passwordRef.current?.focus()}
      />

      <Field
        ref={passwordRef}
        label="비밀번호"
        placeholder="8자 이상"
        value={password}
        onChangeText={(v) => {
          setPassword(v);
          if (passwordError) setPasswordError(undefined);
          if (banner) setBanner(undefined);
        }}
        error={passwordError}
        editable={!loading}
        secureTextEntry={secure}
        autoComplete="current-password"
        textContentType="password"
        returnKeyType="done"
        onSubmitEditing={handleSubmit}
        endAdornment={
          <Chip label={secure ? '보기' : '숨기기'} accessibilityLabel={secure ? '비밀번호 보기' : '비밀번호 숨기기'} tone="neutral" onPress={loading ? undefined : () => setSecure((v) => !v)} />
        }
      />

      {banner ? <Banner tone="danger">{banner}</Banner> : null}

      <Button label="로그인" variant="primary" size="lg" fullWidth loading={loading} onPress={handleSubmit} />

      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: space.lg }}>
        <LinkText label="비밀번호를 잊으셨나요?" accessibilityLabel="비밀번호 재설정으로 이동" tone="muted" disabled={loading} onPress={goToReset} />
        <LinkText label="회원가입" accessibilityLabel="회원가입으로 이동" bold disabled={loading} onPress={() => router.push('/sign-up')} />
      </View>

      <Snackbar
        visible={resetSnackbar}
        message="비밀번호를 변경했어요. 다시 로그인해 주세요."
        onDismiss={() => setResetSnackbar(false)}
      />
    </Screen>
  );
}
