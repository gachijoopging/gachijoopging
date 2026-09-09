import type { ReactNode } from 'react';
import { View, type ViewStyle } from 'react-native';
import { space } from '../../tokens/spacing.ts';
import { Txt } from './Text.tsx';
import { IconButton } from './IconButton.tsx';

export type AppHeaderProps = {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  action?: ReactNode;
  style?: ViewStyle;
};

export function AppHeader({ title, subtitle, onBack, action, style }: AppHeaderProps) {
  return (
    <View
      style={[
        { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: space.sm },
        style,
      ]}
    >
      {onBack ? <IconButton icon="arrow-left" label="뒤로 가기" onPress={onBack} /> : null}
      <View style={{ flex: 1, gap: subtitle ? space.xs : 0 }}>
        <Txt variant="section" accessibilityRole="header">
          {title}
        </Txt>
        {subtitle ? <Txt variant="caption" tone="muted">{subtitle}</Txt> : null}
      </View>
      {action}
    </View>
  );
}
