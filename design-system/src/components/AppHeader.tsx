import type { ReactNode } from 'react';
import { View, type ViewStyle } from 'react-native';
import { space, size as sizes } from '../../tokens/spacing.ts';
import { Txt } from './Text.tsx';
import { IconButton } from './IconButton.tsx';

export type AppHeaderProps = {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  backDisabled?: boolean;
  action?: ReactNode;
  style?: ViewStyle;
};

/**
 * 서브 화면 헤더. 뒤로 · 제목 · 선택 액션 세 슬롯만 둡니다 — 화면마다 헤더를 직접
 * 짜면 뒤로 버튼 크기와 제목 위계가 조금씩 어긋납니다.
 * 제목은 `header` 역할이라 TalkBack 의 제목 단위 이동에 걸립니다.
 * 요청 중처럼 뒤로 가면 안 되는 동안은 `backDisabled` 로 버튼을 비활성으로 알립니다
 * (숨기면 화면 구조가 흔들립니다).
 */
export function AppHeader({ title, subtitle, onBack, backDisabled, action, style }: AppHeaderProps) {
  return (
    <View
      style={[
        { minHeight: sizes.appBar, flexDirection: 'row', alignItems: 'center', gap: space.sm },
        style,
      ]}
    >
      {onBack ? <IconButton icon="arrow-left" label="뒤로 가기" tone="surface" onPress={onBack} disabled={backDisabled} /> : null}
      <View style={{ flex: 1, gap: subtitle ? space.xs : 0 }}>
        <Txt variant="title" bold accessibilityRole="header">
          {title}
        </Txt>
        {subtitle ? <Txt variant="caption" tone="muted">{subtitle}</Txt> : null}
      </View>
      {action}
    </View>
  );
}
