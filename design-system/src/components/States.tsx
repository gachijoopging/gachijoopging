import { useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, Image, View, type ImageSourcePropType } from 'react-native';
import { radius } from '../../tokens/radius.ts';
import { size, space } from '../../tokens/spacing.ts';
import { borderWidth } from '../../tokens/elevation.ts';
import { LOADING_SHOW_AFTER_MS } from '../../tokens/motion.ts';
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

/** 글자 옆에 서는 작은 진행 표시. 옆 글자가 무엇을 하는지 말하므로 읽지 않습니다 */
export function Spinner() {
  const { colors } = useTheme();
  return <ActivityIndicator size="small" color={colors.deep} importantForAccessibility="no-hide-descendants" />;
}

/** 불러오는 중. 화면 전체를 덮지 말고 바뀌는 영역에만 두세요. */
export function Loading({ label = '불러오는 중' }: { label?: string }) {
  const { colors } = useTheme();
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setShown(true), LOADING_SHOW_AFTER_MS);
    return () => clearTimeout(timer);
  }, []);
  // 짧은 불러오기에는 같은 높이의 빈 자리만 둔다. 나타날 때 아래 내용이 밀리지 않는다
  return (
    <View
      accessibilityRole={shown ? 'progressbar' : undefined}
      accessibilityLabel={shown ? label : undefined}
      importantForAccessibility={shown ? 'auto' : 'no-hide-descendants'}
      style={{ alignItems: 'center', gap: space.md, paddingVertical: space['3xl'], opacity: shown ? 1 : 0 }}
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
  image,
  title,
  description,
  actionLabel,
  onAction,
}: {
  icon?: IconName;
  /** 캐릭터 그림. 있으면 아이콘 대신 그린다 */
  image?: ImageSourcePropType;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const { colors } = useTheme();
  return (
    <DashedBox>
      {image ? (
        <Image source={image} accessible={false} resizeMode="contain" style={{ width: size.character, height: size.character }} />
      ) : (
        <Icon name={icon} size={34} color={colors.inkHint} />
      )}
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
  actionLabel = '다시 시도',
  icon = 'cloud-off-outline',
}: {
  title?: string;
  /** null 이면 설명 줄을 그리지 않습니다. 기본값은 연결 문제 안내입니다 */
  description?: string | null;
  onRetry?: () => void;
  /** 연결이 아닌 이유(권한 등)로 막혔을 때 바꿉니다 */
  icon?: IconName;
  /** 권한 거부처럼 다시 시도가 아니라 다른 화면으로 보내야 할 때 바꿉니다 */
  actionLabel?: string;
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
      <Icon name={icon} size={34} color={colors.dangerInk} />
      <Txt variant="section" bold style={{ color: colors.dangerInk, textAlign: 'center' }}>
        {title}
      </Txt>
      {description ? (
        <Txt variant="caption" style={{ color: colors.dangerInk, textAlign: 'center' }}>
          {description}
        </Txt>
      ) : null}
      {onRetry ? <Button label={actionLabel} variant="soft" size="md" onPress={onRetry} /> : null}
    </View>
  );
}
