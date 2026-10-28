import { useEffect } from 'react';
import { AppState } from 'react-native';
import { Stack, useRootNavigationState, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ThemeProvider, useReduceMotion } from 'design-system/src';
import { apiConfig, createApiClient } from '../src/api/config';
import { launchDestination } from '../src/auth/launch';
import { endIfExpired } from '../src/activity/actions';
import { loadLastAccount } from '../src/activity/store';

const EXPIRY_CHECK_MS = 60_000;

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

/**
 * 24시간 시점을 놓친 활동을 콜드 스타트·복귀 때, 그리고 앱이 앞에 있는 동안 1분마다 끝낸다.
 * 4-3 을 열지 않아도, 위치가 꺼져 배경 위치 작업이 깨지 않아도 끝나야 한다
 */
function useExpiredActivityEnd() {
  const router = useRouter();
  useEffect(() => {
    const check = async () => {
      const id = loadLastAccount()?.session?.activityId;
      // 4-3 밖에서는 저장 실패를 보일 곳이 없다. 4-3 의 자동 종료가 다시 시도하고, 또 실패하면 확인창이 오류와 재시도를 보인다
      if ((await endIfExpired()) === 'saveFailed' && id) router.navigate({ pathname: '/activity/[id]', params: { id } });
    };
    void check();
    const timer = setInterval(check, EXPIRY_CHECK_MS);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void check();
    });
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, [router]);
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
