import { useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { AppHeader, Banner, Button, Field, Icon, Screen, Snackbar, Txt, radius, size, space, useTheme } from 'design-system/src';
import { createMockClient, type ApiClient } from '../src/api/client';
import { resetRequestErrorMessage } from '../src/auth/errors';
import { validateEmail } from '../src/auth/validators';

const api: ApiClient = createMockClient({ delayMs: 300 });

export default function ResetPasswordRequestScreen() {
  const { colors } = useTheme();
  const params = useLocalSearchParams<{ email?: string }>();
  const [email, setEmail] = useState(params.email ?? '');
  const [emailError, setEmailError] = useState<string>();
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [resending, setResending] = useState(false);
  const [formBanner, setFormBanner] = useState<string>();
  const [snackbar, setSnackbar] = useState(false);
  const busy = sending || resending;

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
      setSnackbar(true);
    } catch {
      setSnackbar(true);
    } finally {
      setResending(false);
    }
  }

  return (
    <Screen scroll>
      <AppHeader title="비밀번호 재설정" subtitle="계정 복구" onBack={() => router.back()} backDisabled={busy} />

      {sent ? (
        <View style={{ alignItems: 'center', gap: space.lg, paddingTop: space.xl }}>
          <View
            style={{
              width: size.avatarLg,
              height: size.avatarLg,
              borderRadius: radius.pill,
              backgroundColor: colors.surface,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon name="email-outline" size={30} />
          </View>
          <Txt variant="subtitle" bold style={{ textAlign: 'center' }}>
            재설정 요청을 접수했어요
          </Txt>
          <Txt variant="body" tone="muted" style={{ textAlign: 'center' }}>
            요청을 접수했어요. {email.trim()} 계정이 있으면 메일을 확인해 주세요.
          </Txt>
          <Button
            label="코드 입력하기"
            variant="primary"
            size="md"
            onPress={() => router.push({ pathname: '/1-5-reset-password-confirm', params: { email: email.trim() } })}
          />
          <Button label="메일 다시 보내기" variant="ghost" size="md" loading={resending} disabled={busy} onPress={handleResend} />
        </View>
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
