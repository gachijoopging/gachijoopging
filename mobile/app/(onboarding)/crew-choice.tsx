// 화면 1-6 · docs/screens/1-6-create-or-join-crew.md
import { useCallback, useRef, useState } from 'react';
import { AppState, BackHandler, View } from 'react-native';
import { router, useFocusEffect, useNavigation } from 'expo-router';
import { AppHeader, Banner, Button, Card, Icon, IconButton, Screen, Snackbar, Txt, space } from 'design-system/src';
import { useFlash } from '../../src/ui/useFlash';
import { onboardingApi as api } from '../../src/api/onboarding';
import { currentAccount } from '../../src/auth/account';
import { authenticatedDestination } from '../../src/auth/destination';
import { finishOnboarding, type OnboardingNavigation } from '../../src/auth/navigation';

function CrewChoice({
  icon,
  title,
  accessibilityLabel = title,
  onPress,
  disabled,
}: {
  icon: 'plus' | 'magnify';
  title: string;
  accessibilityLabel?: string;
  onPress: () => void;
  disabled: boolean;
}) {
  return (
    <Card accessibilityLabel={accessibilityLabel} onPress={onPress} disabled={disabled}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
        <Icon name={icon} />
        <Txt variant="section" bold style={{ flex: 1 }}>{title}</Txt>
        <Icon name="chevron-right" />
      </View>
    </Card>
  );
}

export default function CreateOrJoinCrewScreen() {
  const navigation = useNavigation<OnboardingNavigation>('/');
  const busy = useRef(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState(false);
  const [flash, setFlash] = useFlash();

  const checkMembership = useCallback(async (next?: () => void) => {
    if (busy.current) return;
    busy.current = true;
    setChecking(true);
    setError(false);
    const sentBy = currentAccount()?.id;
    try {
      const me = await api.get('GET /users/me');
      const destination = await authenticatedDestination(api, me.data);
      if (currentAccount()?.id !== sentBy) return;
      if (destination !== '/crew-choice') {
        finishOnboarding(navigation, destination);
      } else {
        next?.();
      }
    } catch {
      if (currentAccount()?.id !== sentBy) return;
      setError(true);
      next?.();
    } finally {
      busy.current = false;
      setChecking(false);
    }
  }, [navigation]);

  useFocusEffect(useCallback(() => {
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') void checkMembership();
    });
    const back = BackHandler.addEventListener('hardwareBackPress', () => {
      BackHandler.exitApp();
      return true;
    });
    return () => { appState.remove(); back.remove(); };
  }, [checkMembership]));

  return (
    <Screen scroll>
      <AppHeader title="크루 시작하기" action={<IconButton icon="cog-outline" label="설정" onPress={() => router.push('/settings')} />} />

      <View style={{ alignItems: 'center', gap: space.sm }}>
        <Txt variant="title" bold style={{ textAlign: 'center' }}>
          함께 줍는 크루를 선택해 주세요
        </Txt>
      </View>

      <CrewChoice
        icon="magnify"
        title="기존 크루에 들어가기"
        accessibilityLabel="기존 크루에 들어가기, 크루 찾기"
        disabled={checking}
        onPress={() => { void checkMembership(() => router.push('/search-crew')); }}
      />
      <CrewChoice
        icon="plus"
        title="크루 만들기"
        disabled={checking}
        onPress={() => { void checkMembership(() => router.push('/create-crew')); }}
      />

      {error ? (
        <Banner tone="danger" action={{ label: '다시 시도', onPress: () => { void checkMembership(); } }}>
          소속을 확인하지 못했어요. 네트워크 상태를 확인해 주세요.
        </Banner>
      ) : null}
      <Button
        label="내 활동 기록 보기"
        variant="ghost"
        size="lg"
        fullWidth
        accessibilityLabel="내 활동 기록 보기, 이전 크루의 내 기록 포함"
        onPress={() => router.push('/records')}
      />
      <Snackbar visible={flash != null} message={flash ?? ''} onDismiss={() => setFlash(null)} />
    </Screen>
  );
}
