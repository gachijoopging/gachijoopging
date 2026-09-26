import type { NativeStackNavigationProp } from 'expo-router';
import type { Destination } from './destination';

export type OnboardingNavigation = NativeStackNavigationProp<Record<string, undefined>>;

export function finishOnboarding(navigation: Pick<OnboardingNavigation, 'reset'>, destination: Destination) {
  navigation.reset({ index: 0, routes: [{ name: destination.slice(1) }] });
}
