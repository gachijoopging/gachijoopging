// 화면 1-5 · docs/screens/1-5-reset-password.md
import { useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { AppHeader, Banner, Button, Field, Screen, Txt } from 'design-system/src';
import { createMockClient, type ApiClient } from '../../../src/api/client';
import { validatePassword } from '../../../src/auth/validators';
import { mapResetConfirmError } from '../../../src/auth/errors';

const api: ApiClient = createMockClient({ delayMs: 300 });

export default function ResetPasswordConfirmScreen() {
  const params = useLocalSearchParams<{ email?: string }>();
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [codeError, setCodeError] = useState<string>();
  const [passwordError, setPasswordError] = useState<string>();
  const [confirmError, setConfirmError] = useState<string>();
  const [banner, setBanner] = useState<string>();
  const [secure, setSecure] = useState(true);
  const [loading, setLoading] = useState(false);

  const canSubmit = /^\d{6}$/.test(code.trim()) && !validatePassword(password) && confirm === password;

  async function handleSubmit() {
    if (loading || !canSubmit) return;
    setBanner(undefined);
    setCodeError(undefined);
    setConfirmError(undefined);
    setLoading(true);
    try {
      await api.mutate('POST /auth/password-reset/confirm', {
        email: (params.email ?? '').trim(),
        code: code.trim(),
        newPassword: password,
      });
      router.replace({ pathname: '/login', params: { justReset: '1' } });
    } catch (error) {
      const mapped = mapResetConfirmError(error);
      setCodeError(mapped.code);
      setBanner(mapped.banner);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Screen scroll>
      <AppHeader title="새 비밀번호 설정" onBack={() => router.back()} backDisabled={loading} />

      <Txt variant="display" style={{ textAlign: 'center' }}>
        새로 사용할 비밀번호를 입력해 주세요
      </Txt>

      <Field
        label="인증 코드"
        maxLength={6}
        placeholder="메일로 받은 코드"
        value={code}
        onChangeText={(v) => {
          setCode(v);
          if (codeError) setCodeError(undefined);
        }}
        error={codeError}
        editable={!loading}
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
        onBlur={() => setPasswordError(validatePassword(password))}
        error={passwordError}
        editable={!loading}
        secureTextEntry={secure}
        autoComplete="new-password"
        textContentType="newPassword"
        returnKeyType="next"
      />

      <Button label={secure ? '보기' : '숨기기'} variant="ghost" size="sm" disabled={loading} onPress={() => setSecure((v) => !v)} />

      <Field
        label="비밀번호 확인"
        placeholder="비밀번호를 한 번 더 입력"
        value={confirm}
        onChangeText={(v) => {
          setConfirm(v);
          if (confirmError) setConfirmError(undefined);
        }}
        onBlur={() => setConfirmError(confirm.length > 0 && confirm !== password ? '비밀번호가 서로 달라요.' : undefined)}
        error={confirmError}
        editable={!loading}
        secureTextEntry={secure}
        autoComplete="new-password"
        textContentType="newPassword"
        returnKeyType="done"
        onSubmitEditing={handleSubmit}
      />

      {banner ? <Banner tone="danger">{banner}</Banner> : null}

      <Button
        label="비밀번호 변경"
        variant="primary"
        size="lg"
        fullWidth
        loading={loading}
        disabled={!canSubmit}
        onPress={handleSubmit}
      />
    </Screen>
  );
}
