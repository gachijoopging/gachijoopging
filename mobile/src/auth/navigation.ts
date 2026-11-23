import type { NativeStackNavigationProp } from 'expo-router';
import type { Destination } from './destination';

export type OnboardingNavigation = NativeStackNavigationProp<Record<string, object | undefined>>;

/** reset 은 URL 이 아니라 app/ 아래 등록 이름을 받는다. 그룹 폴더가 이름에 들어간다 */
export const ROUTE_NAME: Record<Destination, string> = {
  '/nickname': '(auth)/nickname',
  '/crew-choice': '(onboarding)/crew-choice',
  '/pending-approval': '(onboarding)/pending-approval',
  '/(tabs)': '(tabs)',
};

export function finishOnboarding(navigation: Pick<OnboardingNavigation, 'reset'>, destination: Destination, params?: { flash: string }) {
  // 탭은 내비게이터라 파라미터를 받는 쪽이 첫 탭(홈) 화면이어야 스낵바가 뜬다
  const routeParams = destination === '/(tabs)' && params ? { screen: 'index', params } : params;
  navigation.reset({ index: 0, routes: [{ name: ROUTE_NAME[destination], params: routeParams }] });
}
