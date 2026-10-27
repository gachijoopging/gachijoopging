import { useEffect } from 'react';
import { AppState } from 'react-native';
import { Stack, useRootNavigationState, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ThemeProvider, useReduceMotion } from 'design-system/src';
import { apiConfig, createApiClient } from '../src/api/config';
import { launchDestination } from '../src/auth/launch';
import { endIfExpired } from '../src/activity/actions';

/** 실서버에서는 콜드 스타트 때 세션·소속으로 첫 화면을 고른다. 목은 로그인 없이 홈부터 보여 준다 */
function useLaunchRoute() {
  const router = useRouter();
  const mounted = !!useRootNavigationState()?.key;
  useEffect(() => {
    if (!mounted || !apiConfig.real) return;
    launchDestination(createApiClient()).then((destination) => {
      if (destination && destination !== '/(tabs)') router.replace(destination);
    });
  }, [mounted, router]);
}

/** 앱이 꺼졌거나 배경이라 24시간 시점을 놓친 활동을 콜드 스타트·복귀 때 끝낸다. 4-3 을 열지 않아도 끝나야 한다 */
function useExpiredActivityEnd() {
  useEffect(() => {
    void endIfExpired();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void endIfExpired();
    });
    return () => sub.remove();
  }, []);
}

function RootStack() {
  useLaunchRoute();
  useExpiredActivityEnd();
  const reduce = useReduceMotion();
  // 화면은 오른쪽에서 들어와 같은 길로 나간다. 새로 쓰는 작업은 시트처럼 아래에서 올라와 아래로 내려간다.
  // 동작 줄이기를 켜면 미는 움직임 대신 제자리에서 흐려졌다 선명해진다
  const compose = reduce ? 'fade' : 'slide_from_bottom';
  return (
    <Stack screenOptions={{ headerShown: false, animation: reduce ? 'fade' : 'ios_from_right' }}>
      <Stack.Screen name="posts/new" options={{ animation: compose }} />
      <Stack.Screen name="report" options={{ animation: compose }} />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <ThemeProvider>
      <StatusBar style="auto" />
      <RootStack />
    </ThemeProvider>
  );
}
