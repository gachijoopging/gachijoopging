import type { NativeStackNavigationProp } from 'expo-router';
import type { Destination } from './destination';

export type OnboardingNavigation = NativeStackNavigationProp<Record<string, object | undefined>>;

export function finishOnboarding(navigation: Pick<OnboardingNavigation, 'reset'>, destination: Destination, params?: { flash: string }) {
  navigation.reset({ index: 0, routes: [{ name: destination.slice(1), params }] });
}
