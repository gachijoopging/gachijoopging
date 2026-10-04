// 화면 1-1 · docs/screens/1-1-start.md
import { useRef, useState } from 'react';
import { Image, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useNavigation } from 'expo-router';
import { Banner, Button, LinkText, Screen, Snackbar, Txt, radius, space, useTheme, size, WORDMARK_RATIO } from 'design-system/src';
import { useFlash } from '../../src/ui/useFlash';
import { onboardingApi as api } from '../../src/api/onboarding';
import { completeSignIn } from '../../src/auth/complete-sign-in';
import type { OnboardingNavigation } from '../../src/auth/navigation';
import { usePreventBack } from '../../src/auth/usePreventBack';

const bg = require('../../../design-system/assets/legacy/start-bg.png');
const wordmark = require('../../../design-system/assets/logo-wordmark.png');

/** 워드마크 뒤 광원 지름. 워드마크(270)보다 넉넉히 커야 은은하게 번지는 것처럼 보인다 */
const GLOW_SIZE = size.wordmarkGlow;

type Provider = 'kakao' | 'google';

export default function StartScreen() {
  const { colors } = useTheme();
  const [loadingProvider, setLoadingProvider] = useState<Provider | null>(null);
  const [socialError, setSocialError] = useState<'auth' | 'me' | null>(null);
  const busy = loadingProvider !== null;
  const [flash, setFlash] = useFlash();
  const navigation = useNavigation<OnboardingNavigation>('/');
  // 인증이 끝난 뒤 내 정보만 실패하면 토큰은 살아 있다 — 같은 제공자를 다시 누르면 인증을 반복하지 않는다.
  // 다른 제공자를 고르면 새로 인증한다
  const authenticated = useRef<Provider | null>(null);
  usePreventBack(busy);

  async function handleSocial(provider: Provider) {
    setSocialError(null);
    setLoadingProvider(provider);
    try {
      if (authenticated.current !== provider) {
        authenticated.current = null;
        // 제공자 SDK 연동은 별도 작업이다. 여기서는 토큰을 받아 온 뒤라고 가정하고 이어간다.
        await api.mutate(provider === 'kakao' ? 'POST /auth/kakao' : 'POST /auth/google', {
          token: 'mock-provider-token',
        });
        authenticated.current = provider;
      }
      await completeSignIn(api, navigation);
      // 떠나는 화면은 다시 그리지 않는다. 전환 중 재렌더가 Fabric 을 죽인다
      return;
    } catch {
      setSocialError(authenticated.current ? 'me' : 'auth');
    }
    setLoadingProvider(null);
  }

  return (
    <View style={{ flex: 1 }}>
      <Image source={bg} resizeMode="cover" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
      <LinearGradient
        colors={[colors.transparent, colors.inkShadow]}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
      />
      <Screen edges={['top', 'bottom', 'left', 'right']} scroll contentStyle={{ flexGrow: 1 }} style={{ backgroundColor: colors.transparent }}>
        <View style={{ flex: 1, minHeight: '100%', justifyContent: 'space-between' }}>
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.lg }}>
            <View style={{ alignItems: 'center', justifyContent: 'center' }}>
              <View
                style={{
                  position: 'absolute',
                  width: GLOW_SIZE,
                  height: GLOW_SIZE,
                  borderRadius: radius.pill,
                  backgroundColor: colors.lime28,
                }}
              />
              <Image
                source={wordmark}
                accessibilityLabel="가치줍깅"
                resizeMode="contain"
                style={{ width: size.wordmarkLg, height: size.wordmarkLg * WORDMARK_RATIO }}
              />
            </View>
            <Txt variant="bodyLg" bold tone="onPhoto" style={{ textAlign: 'center' }}>
              크루와 함께 걸으며 줍는 사람들.{'\n'}기록하고, 나누고, 응원해요.
            </Txt>
          </View>

          <View style={{ gap: space.md }}>
            {socialError ? (
              <Banner tone="danger">
                {socialError === 'me' ? '내 정보를 불러오지 못했어요. 다시 시도해 주세요.' : '소셜 로그인에 실패했어요. 네트워크 상태를 확인하고 다시 시도해 주세요.'}
              </Banner>
            ) : null}
            <Button
              label="카카오로 시작하기"
              variant="kakao"
              size="lg"
              fullWidth
              loading={loadingProvider === 'kakao'}
              disabled={busy}
              onPress={() => handleSocial('kakao')}
            />
            <Button
              label="구글로 시작하기"
              // 사진 위라 테두리만 있는 버튼은 글자가 묻힌다. 이메일 버튼과 같은 반투명 바탕을 쓴다
              variant="translucent"
              size="lg"
              icon="google"
              fullWidth
              loading={loadingProvider === 'google'}
              disabled={busy}
              onPress={() => handleSocial('google')}
            />
            <Button
              label="이메일로 로그인"
              variant="translucent"
              size="lg"
              icon="email-outline"
              fullWidth
              disabled={busy}
              onPress={() => router.push('/login')}
            />
            <LinkText
              label="처음이신가요?"
              tone="onPhoto"
              disabled={busy}
              accessibilityLabel="처음이신가요? 회원가입으로 이동"
              onPress={() => router.push('/sign-up')}
              style={{ alignSelf: 'center' }}
            />
          </View>
        </View>
        <Snackbar visible={flash != null} message={flash ?? ''} onDismiss={() => setFlash(null)} />
      </Screen>
    </View>
  );
}
