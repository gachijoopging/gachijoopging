import { useCallback, useRef, useState } from 'react';
import { AppState, BackHandler, View } from 'react-native';
import { router, useFocusEffect, useNavigation } from 'expo-router';
import { AppHeader, Banner, Button, Card, Chip, Icon, Screen, Txt, space } from 'design-system/src';
import { onboardingApi as api } from '../src/api/onboarding';
import { resolveDestination } from '../src/auth/destination';
import { finishOnboarding, type OnboardingNavigation } from '../src/auth/navigation';

function CrewChoice({
  icon,
  title,
  description,
  onPress,
  disabled,
}: {
  icon: 'plus' | 'key-outline';
  title: string;
  description: string;
  onPress: () => void;
  disabled: boolean;
}) {
  return (
    <Card accessibilityLabel={`${title}, ${description}`} onPress={onPress} disabled={disabled}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
        <Icon name={icon} />
        <View style={{ flex: 1 }}>
          <Txt variant="section" bold>{title}</Txt>
          <Txt variant="caption" tone="muted">{description}</Txt>
        </View>
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

  const checkMembership = useCallback(async (next?: '/1-7-create-crew' | '/1-8-enter-invite-code') => {
    if (busy.current) return;
    busy.current = true;
    setChecking(true);
    setError(false);
    try {
      const me = await api.get('GET /users/me');
      const destination = resolveDestination(me.data);
      if (destination !== '/1-6-create-or-join-crew') {
        finishOnboarding(navigation, destination);
      } else if (next) {
        router.push(next);
      }
    } catch {
      setError(true);
      if (next) router.push(next);
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
      <AppHeader title="크루 시작하기" onBack={() => BackHandler.exitApp()} />

      <View style={{ alignItems: 'center', gap: space.sm }}>
        <Chip label="🌱 크루 시작하기" tone="deep" />
        <Txt variant="title" bold style={{ textAlign: 'center' }}>
          함께 줍는 크루를 선택해 주세요
        </Txt>
        <Txt variant="body" tone="muted" style={{ textAlign: 'center' }}>
          한 사람은 크루 하나에만 소속될 수 있어요.
        </Txt>
      </View>

      <CrewChoice
        icon="plus"
        title="새 크루 만들기"
        description="이름만 정하면 바로 시작해요"
        disabled={checking}
        onPress={() => { void checkMembership('/1-7-create-crew'); }}
      />
      <CrewChoice
        icon="key-outline"
        title="초대 코드로 가입하기"
        description="크루장에게 받은 코드를 입력해요"
        disabled={checking}
        onPress={() => { void checkMembership('/1-8-enter-invite-code'); }}
      />

      <Banner tone="neutral">크루장이 승인하면 크루원이 돼요.</Banner>
      {error ? <>
        <Banner tone="danger">소속을 확인하지 못했어요. 네트워크 상태를 확인해 주세요.</Banner>
        <Button label="다시 시도" disabled={checking} onPress={() => { void checkMembership(); }} />
      </> : null}
      <Button
        label="내 활동 기록 보기"
        variant="ghost"
        size="lg"
        fullWidth
        disabled
        accessibilityLabel="내 활동 기록 보기, 이전 크루의 내 기록 포함"
      />
    </Screen>
  );
}
