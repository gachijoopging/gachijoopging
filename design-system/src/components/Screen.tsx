import type { ReactElement, ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  type RefreshControlProps,
  View,
  useWindowDimensions,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import { screen, space } from '../../tokens/spacing.ts';
import { useTheme } from '../theme.tsx';

/**
 * 화면 바깥 껍데기. 플랫폼 계약이 전부 여기 모입니다.
 *
 *   1. 안전 영역 — 상태바 · 노치 · 제스처 바. Expo SDK 54+ 는 안드로이드에서
 *      edge-to-edge 가 기본이라, 이걸 안 쓰면 콘텐츠가 시스템 바 아래로 들어갑니다.
 *   2. 키보드 — 두 플랫폼 모두 padding 으로 키보드 높이만큼 비킵니다. RN 0.86
 *      안드로이드는 항상 edge-to-edge 라 adjustResize 가 창을 줄이지 않습니다.
 *   3. 최대 폭 — 태블릿에서 입력창과 버튼이 화면 끝까지 늘어나지 않게 막습니다.
 *      Material 은 확장 폭에서 폰 레이아웃을 그대로 늘리지 말라고 합니다.
 *
 * 화면은 전부 이걸로 감쌉니다. 직접 SafeAreaView 를 쓰지 마세요 — 규칙이 흩어집니다.
 */

/** 본문이 읽기 좋게 유지되는 최대 폭. 이 위로는 여백이 늘어납니다. */
export const CONTENT_MAX_WIDTH = 640;

export type ScreenProps = {
  children: ReactNode;
  /** 내용이 길어 스크롤이 필요하면 true. 목록 화면은 List 를 쓰세요 */
  scroll?: boolean;
  refreshControl?: ReactElement<RefreshControlProps>;
  /**
   * 안전 영역을 적용할 변. 하단 내비가 있는 화면은 'bottom' 을 빼고
   * 내비 쪽에서 처리합니다.
   */
  edges?: readonly Edge[];
  /** 좌우 화면 여백을 끕니다. 전체 폭 배너나 지도에 씁니다 */
  bleed?: boolean;
  style?: ViewStyle;
  contentStyle?: ViewStyle;
};

export function Screen({
  children,
  scroll = false,
  refreshControl,
  edges = ['top', 'bottom', 'left', 'right'],
  bleed = false,
  style,
  contentStyle,
}: ScreenProps) {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const gutter = Math.max(screen.horizontal, (width - CONTENT_MAX_WIDTH) / 2);

  const inner: ViewStyle = {
    paddingHorizontal: bleed ? 0 : gutter,
    paddingTop: screen.top,
    gap: space.md,
  };

  const body = scroll ? (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={[inner, { paddingBottom: screen.scrollBottom }, contentStyle]}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
      refreshControl={refreshControl}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[{ flex: 1 }, inner, contentStyle]}>{children}</View>
  );

  return (
    <SafeAreaView edges={edges} style={[{ flex: 1, backgroundColor: colors.bg }, style]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        {body}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
