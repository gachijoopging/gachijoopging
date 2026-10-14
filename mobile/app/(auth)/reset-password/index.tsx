// 화면 1-5 · docs/screens/1-5-reset-password.md
import { useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { AppHeader, Banner, Button, Field, Icon, LinkText, Screen, Snackbar, Txt, space } from 'design-system/src';
import { type ApiClient } from '../../../src/api/client';
import { createApiClient } from '../../../src/api/config';
import { mapResetConfirmError, resetRequestErrorMessage } from '../../../src/auth/errors';
import { validateEmail, validatePassword } from '../../../src/auth/validators';

const api: ApiClient = createApiClient({ delayMs: 300 });

export default function ResetPasswordScreen() {
  const params = useLocalSearchParams<{ email?: string }>();
  const [email, setEmail] = useState(params.email ?? '');
  const [emailError, setEmailError] = useState<string>();
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [resending, setResending] = useState(false);
  const [formBanner, setFormBanner] = useState<string>();
  const [snackbar, setSnackbar] = useState(false);

  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [codeError, setCodeError] = useState<string>();
  const [passwordError, setPasswordError] = useState<string>();
  const [confirmError, setConfirmError] = useState<string>();
  const [secure, setSecure] = useState(true);
  const [changing, setChanging] = useState(false);

  const busy = sending || resending || changing;
  const canChange = /^\d{6}$/.test(code.trim()) && !validatePassword(password) && confirm === password;

  async function send() {
    setFormBanner(undefined);
    setSending(true);
    try {
      await api.mutate('POST /auth/password-reset', { email: email.trim() });
      setSent(true);
    } catch {
      setFormBanner(resetRequestErrorMessage());
    } finally {
      setSending(false);
    }
  }

  function handleSubmit() {
    if (busy) return;
    const err = validateEmail(email);
    setEmailError(err);
    if (err) return;
    send();
  }

  async function handleResend() {
    if (busy) return;
    setResending(true);
    try {
      await api.mutate('POST /auth/password-reset', { email: email.trim() });
      // 새 코드가 나가면 지난 코드의 오류는 더 이상 맞지 않는다
      setCode('');
      setCodeError(undefined);
      setFormBanner(undefined);
    } catch {
      // 계정이 있는지 드러내지 않도록 결과와 무관하게 같은 안내를 보인다
    } finally {
      setSnackbar(true);
      setResending(false);
    }
  }

  async function handleChange() {
    if (busy || !canChange) return;
    setFormBanner(undefined);
    setCodeError(undefined);
    setConfirmError(undefined);
    setChanging(true);
    try {
      await api.mutate('POST /auth/password-reset/confirm', { email: email.trim(), code: code.trim(), newPassword: password });
      router.replace({ pathname: '/login', params: { justReset: '1' } });
      // 떠나는 화면은 다시 그리지 않는다. 전환 중 재렌더가 Fabric 을 죽인다
      return;
    } catch (error) {
      const mapped = mapResetConfirmError(error);
      setCodeError(mapped.code);
      setFormBanner(mapped.banner);
    }
    setChanging(false);
  }

  return (
    <Screen scroll>
      <AppHeader title="비밀번호 재설정" subtitle="계정 복구" onBack={() => router.back()} backDisabled={busy} />

      {sent ? (
        <>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
            <Icon name="email-outline" />
            <View style={{ flex: 1, gap: space.xs }}>
              <Txt variant="section" bold>메일로 받은 코드를 입력해 주세요</Txt>
              <Txt variant="caption" tone="muted">{email.trim()} 계정이 있으면 6자리 코드를 보냈어요. 10분 동안 쓸 수 있어요.</Txt>
            </View>
          </View>
          <LinkText
            label="이메일 바꾸기"
            tone="muted"
            disabled={busy}
            onPress={() => {
              setSent(false);
              setCode('');
              setCodeError(undefined);
              setPassword('');
              setConfirm('');
              setPasswordError(undefined);
              setConfirmError(undefined);
              setFormBanner(undefined);
            }}
          />

          <Field
            label="인증 코드"
            maxLength={6}
            placeholder="6자리 숫자"
            value={code}
            onChangeText={(v) => {
              setCode(v);
              if (codeError) setCodeError(undefined);
            }}
            error={codeError}
            editable={!changing}
            keyboardType="number-pad"
            autoComplete="one-time-code"
            textContentType="oneTimeCode"
            returnKeyType="next"
          />

          <Field
            label="새 비밀번호"
            placeholder="8자 이상"
            value={password}
            onChangeText={(v) => {
              setPassword(v);
              if (passwordError) setPasswordError(undefined);
            }}
            onBlur={() => setPasswordError(validatePassword(password))}
            error={passwordError}
            editable={!changing}
            secureTextEntry={secure}
            autoComplete="new-password"
            textContentType="newPassword"
            returnKeyType="next"
          />

          <Button label={secure ? '비밀번호 보기' : '비밀번호 숨기기'} variant="ghost" size="sm" disabled={changing} onPress={() => setSecure((v) => !v)} />

          <Field
            label="새 비밀번호 확인"
            placeholder="비밀번호를 한 번 더 입력"
            value={confirm}
            onChangeText={(v) => {
              setConfirm(v);
              if (confirmError) setConfirmError(undefined);
            }}
            onBlur={() => setConfirmError(confirm.length > 0 && confirm !== password ? '비밀번호가 서로 달라요.' : undefined)}
            error={confirmError}
            editable={!changing}
            secureTextEntry={secure}
            autoComplete="new-password"
            textContentType="newPassword"
            returnKeyType="done"
            onSubmitEditing={handleChange}
          />

          {formBanner ? <Banner tone="danger">{formBanner}</Banner> : null}

          <Button label="비밀번호 변경" variant="primary" size="lg" fullWidth loading={changing} disabled={!canChange || resending} onPress={handleChange} />
          <Button label="메일 다시 보내기" variant="ghost" size="md" loading={resending} disabled={busy} onPress={handleResend} />
        </>
      ) : (
        <>
          <Txt variant="display" style={{ textAlign: 'center' }}>
            가입한 이메일을 알려 주세요
          </Txt>

          <Field
            label="이메일"
            placeholder="you@example.com"
            value={email}
            onChangeText={(v) => {
              setEmail(v);
              if (emailError) setEmailError(undefined);
            }}
            error={emailError}
            editable={!busy}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            textContentType="emailAddress"
            returnKeyType="done"
            onSubmitEditing={handleSubmit}
          />

          {formBanner ? <Banner tone="danger">{formBanner}</Banner> : null}

          <Button
            label="재설정 메일 보내기"
            variant="primary"
            size="lg"
            fullWidth
            loading={sending}
            disabled={!!validateEmail(email)}
            onPress={handleSubmit}
          />
        </>
      )}

      <Snackbar visible={snackbar} message="메일을 다시 보냈어요" onDismiss={() => setSnackbar(false)} />
    </Screen>
  );
}
