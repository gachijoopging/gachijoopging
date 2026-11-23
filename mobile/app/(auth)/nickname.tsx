// 화면 1-4 · docs/screens/1-4-nickname.md
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { useNavigation } from 'expo-router';
import { AppHeader, Banner, Button, Field, Screen, Txt, space } from 'design-system/src';
import { onboardingApi as api } from '../../src/api/onboarding';
import { AgreementFields } from '../../src/auth/AgreementFields';
import { resolveDestination } from '../../src/auth/destination';
import { finishOnboarding, type OnboardingNavigation } from '../../src/auth/navigation';
import { usePreventBack } from '../../src/auth/usePreventBack';
import { mapNicknameError } from '../../src/auth/errors';
import { normalizeNickname, validateNickname } from '../../src/auth/validators';
import { clearAgreementChoices, requiredAgreementsAccepted, useAgreementForm } from '../../src/auth/agreements';
import { ApiError, type ApiResponse } from '../../src/api/client';
import { rememberAccount } from '../../src/auth/account';

export default function NicknameScreen() {
  const [nickname, setNickname] = useState('');
  const [nicknameError, setNicknameError] = useState<string>();
  const [me, setMe] = useState<ApiResponse<'GET /users/me'>['data'] | null>(null);
  const agreements = useAgreementForm(api, me?.id ?? null);
  const originalNickname = useRef('');
  const busy = useRef(false);
  const loadRequest = useRef(0);
  const [banner, setBanner] = useState<string>();
  const [loading, setLoading] = useState(false);
  const navigation = useNavigation<OnboardingNavigation>('/');
  usePreventBack(loading);

  const load = async () => {
    const request = ++loadRequest.current;
    try {
      const { data } = await api.get('GET /users/me');
      if (request !== loadRequest.current) return;
      setMe(data);
      // 소셜로 처음 들어온 계정은 닉네임이 null 이다(계약 Me.nickname nullable)
      originalNickname.current = data.nickname ?? '';
      setNickname(data.nickname ?? '');
      rememberAccount(data);
      setBanner(undefined);
    } catch { if (request === loadRequest.current) setBanner('내 정보를 불러오지 못했어요. 다시 시도해 주세요.'); }
  };
  useEffect(() => { void load(); return () => { loadRequest.current += 1; }; }, []);
  const canSubmit = !validateNickname(nickname) && me != null && agreements.items != null && !agreements.failed && requiredAgreementsAccepted(agreements.items);

  async function handleSubmit() {
    if (busy.current || !canSubmit || !me || !agreements.items) return;
    busy.current = true;
    setBanner(undefined);
    setLoading(true);
    try {
      const nextNickname = normalizeNickname(nickname);
      if (nextNickname !== originalNickname.current) {
        await api.mutate('PATCH /users/me', { nickname: nextNickname });
        originalNickname.current = nextNickname;
      }
      const { data } = await api.mutate('PUT /users/me/agreements', { items: agreements.items.map(({ type, version, agreed }) => ({ type, version, agreed })) });
      if (!data.complete) throw new Error('필수 동의가 완료되지 않았어요');
      clearAgreementChoices(me.id);
      finishOnboarding(navigation, resolveDestination({ ...me, profileComplete: true }));
      // 떠나는 화면은 다시 그리지 않는다. 전환 중 재렌더가 Fabric 을 죽인다
      return;
    } catch (error) {
      const mapped = mapNicknameError(error);
      setNicknameError(mapped.field);
      setBanner(mapped.banner);
      if (error instanceof ApiError && error.fields?.some((field) => field.field === 'items' && field.code === 'FORMAT')) {
        await agreements.reload();
        setBanner('약관이 변경됐어요. 새 항목을 확인해 주세요.');
      }
    }
    setLoading(false);
    busy.current = false;
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
        hint="2자에서 12자"
        placeholder="2~12자"
        value={nickname}
        onChangeText={(v) => {
          setNickname(v);
          if (nicknameError) setNicknameError(undefined);
        }}
        onBlur={() => setNicknameError(validateNickname(nickname))}
        error={nicknameError}
        editable={!loading && !!me}
        returnKeyType="done"
        onSubmitEditing={handleSubmit}
      />

      {!me && banner ? null : (
        <AgreementFields
          items={agreements.items}
          onChange={agreements.change}
          failed={agreements.failed}
          onRetry={agreements.reload}
          disabled={loading}
        />
      )}

      {banner ? <Banner tone="danger">{banner}</Banner> : null}
      {!me && banner ? <Button label="다시 시도" variant="ghost" onPress={load} /> : null}

      <Button label="다음" variant="primary" size="lg" fullWidth loading={loading} disabled={!canSubmit} onPress={handleSubmit} />
    </Screen>
  );
}
