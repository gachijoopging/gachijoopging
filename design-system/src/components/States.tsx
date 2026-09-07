import type { ReactNode } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { radius } from '../../tokens/radius.ts';
import { space } from '../../tokens/spacing.ts';
import { borderWidth } from '../../tokens/elevation.ts';
import { useTheme } from '../theme.tsx';
import { Txt } from './Text.tsx';
import { Icon, type IconName } from './Icon.tsx';
import { Button } from './Button.tsx';

/**
 * 점선 상자. 원본 `bg_dashed_box` — 아직 채워지지 않은 자리를 나타냅니다.
 *
 * RN 은 대시 길이·간격을 지정할 수 없어서 원본의 8/5 패턴은 재현되지 않습니다.
 * 플랫폼이 정한 대시로 그려집니다. 정확한 패턴이 필요하면 react-native-svg 가
 * 필요한데, 그만한 값어치는 없다고 보고 넘어갑니다.
 */
export function DashedBox({ children }: { children: ReactNode }) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        borderWidth: borderWidth.focus,
        borderStyle: 'dashed',
        borderColor: colors.borderDotted,
        borderRadius: radius.card,
        backgroundColor: colors.surface70,
        padding: space.xl,
        alignItems: 'center',
        gap: space.md,
        alignSelf: 'stretch',
      }}
    >
      {children}
    </View>
  );
}

/** 불러오는 중. 화면 전체를 덮지 말고 바뀌는 영역에만 두세요. */
export function Loading({ label = '불러오는 중' }: { label?: string }) {
  const { colors } = useTheme();
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      style={{ alignItems: 'center', gap: space.md, paddingVertical: space['3xl'] }}
    >
      <ActivityIndicator color={colors.deep} />
      <Txt variant="caption" tone="hint">
        {label}
      </Txt>
    </View>
  );
}

/**
 * 빈 상태. 왜 비어 있는지와 다음에 뭘 할 수 있는지를 함께 말합니다 —
 * "데이터가 없습니다" 로 끝내면 사용자가 할 일이 없어집니다.
 */
export function EmptyState({
  icon = 'inbox-outline',
  title,
  description,
  actionLabel,
  onAction,
}: {
  icon?: IconName;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const { colors } = useTheme();
  return (
    <DashedBox>
      <Icon name={icon} size={34} color={colors.inkHint} />
      <Txt variant="section" bold style={{ textAlign: 'center' }}>
        {title}
      </Txt>
      {description ? (
        <Txt variant="caption" tone="hint" style={{ textAlign: 'center' }}>
          {description}
        </Txt>
      ) : null}
      {actionLabel && onAction ? (
        <Button label={actionLabel} size="md" onPress={onAction} />
      ) : null}
    </DashedBox>
  );
}

/**
 * 오류 상태. 무엇이 잘못됐는지와 어떻게 되돌리는지를 말합니다.
 * 사과문이나 기술 용어(`500`, `timeout`)를 그대로 노출하지 마세요.
 */
export function ErrorState({
  title = '불러오지 못했어요',
  description = '연결 상태를 확인하고 다시 시도해 주세요.',
  onRetry,
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
}) {
  const { colors } = useTheme();
  return (
    <View
      accessibilityRole="alert"
      style={{
        alignItems: 'center',
        gap: space.md,
        padding: space.xl,
        borderRadius: radius.card,
        backgroundColor: colors.dangerBg,
        alignSelf: 'stretch',
      }}
    >
      <Icon name="cloud-off-outline" size={34} color={colors.dangerInk} />
      <Txt variant="section" bold style={{ color: colors.dangerInk, textAlign: 'center' }}>
        {title}
      </Txt>
      <Txt variant="caption" style={{ color: colors.dangerInk, textAlign: 'center' }}>
        {description}
      </Txt>
      {onRetry ? <Button label="다시 시도" variant="soft" size="md" onPress={onRetry} /> : null}
    </View>
  );
}
