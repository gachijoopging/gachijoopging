// 화면 1-1 · docs/screens/1-1-start.md
import { useState } from 'react';
import { Image, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { Banner, Button, LinkText, Screen, Snackbar, Txt, radius, space, useTheme } from 'design-system/src';
import { useFlash } from '../../src/ui/useFlash';
import { onboardingApi as api } from '../../src/api/onboarding';
import { resolveDestination } from '../../src/auth/destination';

const bg = require('../../../design-system/assets/legacy/start-bg.png');
const wordmark = require('../../../design-system/assets/logo-wordmark.png');

/** 워드마크 뒤 광원 지름. 워드마크(270)보다 넉넉히 커야 은은하게 번지는 것처럼 보인다 */
const GLOW_SIZE = 220;

type Provider = 'kakao' | 'google';

export default function StartScreen() {
  const { colors } = useTheme();
  const [loadingProvider, setLoadingProvider] = useState<Provider | null>(null);
  const [socialError, setSocialError] = useState(false);
  const busy = loadingProvider !== null;
  const [flash, setFlash] = useFlash();

  async function handleSocial(provider: Provider) {
    setSocialError(false);
    setLoadingProvider(provider);
    try {
      // 제공자 SDK 연동은 별도 작업이다. 여기서는 토큰을 받아 온 뒤라고 가정하고 이어간다.
      await api.mutate(provider === 'kakao' ? 'POST /auth/kakao' : 'POST /auth/google', {
        token: 'mock-provider-token',
      });
      const me = await api.get('GET /users/me');
      router.replace(resolveDestination(me.data));
    } catch {
      setSocialError(true);
    } finally {
      setLoadingProvider(null);
    }
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
                style={{ width: 270, height: (270 * 301) / 840 }}
              />
            </View>
            <Txt variant="bodyLg" bold tone="onPhoto" style={{ textAlign: 'center' }}>
              크루와 함께 걸으며 줍는 사람들.{'\n'}기록하고, 나누고, 응원해요.
            </Txt>
          </View>

          <View style={{ gap: space.md }}>
            {socialError ? (
              <Banner tone="danger">소셜 로그인에 실패했어요. 네트워크 상태를 확인하고 다시 시도해 주세요.</Banner>
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
              variant="ghost"
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
