import { useRef, useState } from 'react';
import { Keyboard, View } from 'react-native';
import { router, useNavigation } from 'expo-router';
import { AppHeader, Avatar, Banner, Button, Card, Chip, Field, Screen, Txt, space } from 'design-system/src';
import { ApiError } from '../src/api/client';
import { onboardingApi as api } from '../src/api/onboarding';
import { normalizeInviteCode, validateInviteCode } from '../src/auth/validators';
import { resolveDestination } from '../src/auth/destination';
import { finishOnboarding, type OnboardingNavigation } from '../src/auth/navigation';
import { usePreventBack } from '../src/auth/usePreventBack';

type Stage = 'input' | 'preview';
type CrewPreview = Awaited<ReturnType<typeof api.get<'GET /crews/preview'>>>['data'];

export default function EnterInviteCodeScreen() {
  const navigation = useNavigation<OnboardingNavigation>('/');
  const [stage, setStage] = useState<Stage>('input');
  const [inviteCode, setInviteCode] = useState('');
  const [codeError, setCodeError] = useState<string>();
  const [preview, setPreview] = useState<CrewPreview>();
  const [banner, setBanner] = useState<string>();
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const busy = useRef(false);
  usePreventBack(loading);

  async function handleVerify() {
    const error = validateInviteCode(inviteCode);
    setCodeError(error);
    if (busy.current || error) return;
    busy.current = true;

    setBanner(undefined);
    setLoading(true);
    try {
      const response = await api.get('GET /crews/preview', { inviteCode: normalizeInviteCode(inviteCode) });
      setPreview(response.data);
      setExpanded(false);
      setStage('preview');
      Keyboard.dismiss();
    } catch (error) {
      if (error instanceof ApiError && error.code === 'NOT_FOUND') {
        setCodeError('초대 코드를 찾을 수 없어요. 코드를 다시 확인해 주세요.');
      } else if (error instanceof ApiError && error.code === 'VALIDATION') {
        setCodeError('초대 코드 형식이 올바르지 않아요.');
      } else {
        setBanner('초대를 확인하지 못했어요. 네트워크 상태를 확인하고 다시 시도해 주세요.');
      }
    } finally {
      busy.current = false;
      setLoading(false);
    }
  }

  async function handleJoin() {
    if (busy.current || !preview) return;
    busy.current = true;

    setBanner(undefined);
    setLoading(true);
    try {
      await api.mutate('POST /crews/join-requests', { inviteCode: normalizeInviteCode(inviteCode) });
      finishOnboarding(navigation, '/1-9-pending-approval');
    } catch (error) {
      if (error instanceof ApiError && error.code === 'NOT_FOUND') {
        setStage('input');
        setCodeError('초대 코드를 찾을 수 없어요. 코드를 다시 확인해 주세요.');
      } else if (error instanceof ApiError && error.code === 'ALREADY_IN_CREW') {
        setBanner('이미 크루에 소속돼 있어요.');
        try {
          const me = await api.get('GET /users/me');
          if (me.data.membership?.status !== 'NONE') finishOnboarding(navigation, resolveDestination(me.data));
        } catch {
          setBanner('소속을 확인하지 못했어요. 다시 시도해 주세요.');
        }
      } else if (error instanceof ApiError && error.code === 'VALIDATION') {
        setStage('input');
        setCodeError('초대 코드 형식이 올바르지 않아요.');
      } else {
        setBanner('초대를 확인하지 못했어요. 네트워크 상태를 확인하고 다시 시도해 주세요.');
      }
    } finally {
      busy.current = false;
      setLoading(false);
    }
  }

  function handleOtherCode() {
    if (loading) return;
    setStage('input');
    setBanner(undefined);
    setCodeError(undefined);
  }

  const isPreview = stage === 'preview' && preview;
  const title = isPreview ? '이 크루가 맞나요?' : '초대 코드를 입력해 주세요';
  const description = isPreview ? '크루장이 승인하면 크루원이 돼요.' : '크루장에게 받은 코드로 크루를 찾아요.';

  return (
    <Screen scroll>
      <AppHeader title="크루 가입하기" onBack={loading ? undefined : () => router.back()} backDisabled={loading} />

      <View style={{ alignItems: 'center', gap: space.sm }}>
        <Chip label="🌱 크루 가입하기" tone="deep" />
        <Txt variant="title" bold style={{ textAlign: 'center' }}>
          {title}
        </Txt>
        <Txt variant="body" tone="muted" style={{ textAlign: 'center' }}>
          {description}
        </Txt>
      </View>

      {isPreview ? (
        <Card accessible accessibilityLabel={`${preview.name}, 크루원 ${preview.memberCount}명, 크루장 ${preview.leader.nickname}, 초대 코드 ${normalizeInviteCode(inviteCode)}`}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
            <Avatar name={preview.name} uri={preview.photoUrl ?? undefined} size="lg" />
            <View style={{ flex: 1 }}>
              <Txt variant="section" bold>{preview.name}</Txt>
              <Txt variant="caption" tone="muted">크루원 {preview.memberCount}명</Txt>
            </View>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
            <Avatar name={preview.leader.nickname} uri={preview.leader.photoUrl ?? undefined} size="sm" />
            <Txt variant="caption">크루장 {preview.leader.nickname}</Txt>
          </View>
          {preview.intro ? <>
            <Txt variant="caption" tone="muted" numberOfLines={expanded ? undefined : 2}>{preview.intro}</Txt>
            <Button label={expanded ? '소개 접기' : '소개 더 보기'} variant="ghost" size="md" onPress={() => setExpanded(!expanded)} />
          </> : null}
          <Txt variant="caption" tone="muted">초대 코드 {normalizeInviteCode(inviteCode)}</Txt>
        </Card>
      ) : (
        <Field
          label="초대 코드"
          placeholder="예: HG-7K2P"
          value={inviteCode}
          onChangeText={(value: string) => {
            setInviteCode(value);
            if (codeError) setCodeError(undefined);
          }}
          onBlur={() => setCodeError(validateInviteCode(inviteCode))}
          error={codeError}
          editable={!loading}
          autoFocus
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="done"
          onSubmitEditing={handleVerify}
        />
      )}

      {banner ? <Banner tone="danger">{banner}</Banner> : null}
      <Button
        label={isPreview ? '가입 신청' : '크루 확인'}
        variant="primary"
        size="lg"
        fullWidth
        loading={loading}
        disabled={!isPreview && !!validateInviteCode(inviteCode)}
        onPress={isPreview ? handleJoin : handleVerify}
      />
      {isPreview ? <Button label="다른 코드 입력" variant="ghost" disabled={loading} onPress={handleOtherCode} /> : null}
    </Screen>
  );
}
