import { createContext, useContext, type ReactNode } from 'react';
import { Platform, useColorScheme, type PressableAndroidRippleConfig } from 'react-native';
import { light, dark, type Palette } from '../tokens/colors.ts';
import { shadow, androidElevation, type ShadowLevel } from '../tokens/elevation.ts';

export type Scheme = 'light' | 'dark';

export type Theme = {
  scheme: Scheme;
  colors: Palette;
  shadows: Record<ShadowLevel, string>;
};

const themes: Record<Scheme, Theme> = {
  light: { scheme: 'light', colors: light, shadows: shadow.light },
  dark: { scheme: 'dark', colors: dark, shadows: shadow.dark },
};

const ThemeContext = createContext<Theme>(themes.light);

/**
 * `scheme` 을 주면 그 팔레트로 고정하고, 주지 않으면 기기 설정을 따릅니다.
 * 카탈로그처럼 한 화면에 두 테마를 나란히 놓을 때 고정 모드를 씁니다.
 */
export function ThemeProvider({
  scheme,
  children,
}: {
  scheme?: Scheme;
  children: ReactNode;
}) {
  const system = useColorScheme();
  const resolved: Scheme = scheme ?? (system === 'dark' ? 'dark' : 'light');
  return <ThemeContext value={themes[resolved]}>{children}</ThemeContext>;
}

export function useTheme(): Theme {
  return useContext(ThemeContext);
}

/**
 * Android 터치 리플.
 *
 * Material 은 누른 지점에서 퍼지는 리플을 요구합니다. 불투명도만 바꾸는 피드백은
 * iOS 관용구라, 안드로이드에서 쓰면 "안드로이드 옷을 입은 iOS 앱"으로 읽힙니다.
 * iOS 에서는 `null` 이라 Pressable 이 알아서 무시하고, 그쪽은 불투명도로 답합니다.
 *
 * `borderless` 는 아이콘 버튼처럼 경계 밖으로 퍼져야 자연스러운 원형 컨트롤에 씁니다.
 */
export function useRipple(
  color?: string,
  borderless = false,
): PressableAndroidRippleConfig | undefined {
  const { colors } = useTheme();
  if (Platform.OS !== 'android') return undefined;
  return {
    color: color ?? colors.ripple,
    borderless,
    foreground: !borderless,
  };
}

/** iOS 및 리플이 없는 곳에서 쓰는 눌림 표현. 안드로이드는 리플이 대신합니다. */
export function pressedOpacity(pressed: boolean): number {
  if (Platform.OS === 'android') return 1;
  return pressed ? 0.85 : 1;
}

/**
 * 비활성 조작의 불투명도. 색을 따로 두지 않고 흐리게만 해서, 어떤 채움 위에서도
 * "원래 무엇이었는지"는 읽히되 누를 수 없다는 것이 보이게 합니다.
 */
export const disabledOpacity = 0.55;

/**
 * Android 8.1(API 27) 이하에서는 `boxShadow` 가 아무것도 그리지 않습니다.
 * 그 구간에서만 검정 elevation 으로 대신합니다 — 둘을 함께 주면 그림자가
 * 두 번 그려지므로 반드시 배타적으로 씁니다.
 */
export function depth(level: ShadowLevel, boxShadow: string) {
  if (Platform.OS === 'android' && Number(Platform.Version) < 28) {
    return { elevation: androidElevation[level] };
  }
  return { boxShadow };
}
