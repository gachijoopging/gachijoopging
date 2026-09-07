import { View, type ViewProps, type ViewStyle } from 'react-native';
import { radius } from '../../tokens/radius.ts';
import { space } from '../../tokens/spacing.ts';
import { borderWidth, type ShadowLevel } from '../../tokens/elevation.ts';
import { useTheme, depth } from '../theme.tsx';

export type CardProps = ViewProps & {
  /** 반투명 서피스 — 사진이나 지도 위에 얹을 때 */
  translucent?: boolean;
  /** 발언 중인 참가자 카드 (원본 `bg_card_speaking`) */
  speaking?: boolean;
  padded?: boolean;
  level?: ShadowLevel;
};

export function Card({
  translucent = false,
  speaking = false,
  padded = true,
  level = 'card',
  style,
  ...rest
}: CardProps) {
  const { colors, shadows } = useTheme();
  const base: ViewStyle = {
    backgroundColor: translucent ? colors.surface85 : colors.surface,
    borderRadius: radius.card,
    padding: padded ? space.lg : 0,
    // 그림자가 안 그려지는 기기에서도 층이 남도록 테두리를 항상 둡니다.
    borderWidth: borderWidth.hairline,
    borderColor: speaking ? colors.lime : colors.border,
    ...(speaking ? { borderWidth: borderWidth.focus } : null),
    ...depth(level, shadows[level]),
  };
  return <View style={[base, style]} {...rest} />;
}

export type TileTone = 'tint' | 'surface' | 'dark';

/**
 * 타일 — 카드보다 작고 정보 한 조각만 담는 블록.
 *
 * 원본 `bg_tile_round` 는 반경 20 을 직접 박아 썼습니다. 토큰 스케일에 없는
 * 값이라 올림 방향(원본 간격 규약과 같은 흡수 방향)으로 `radius.cardSm`(22)에
 * 맞췄습니다.
 */
export function Tile({
  tone = 'tint',
  padded = true,
  style,
  ...rest
}: ViewProps & { tone?: TileTone; padded?: boolean }) {
  const { colors } = useTheme();
  const fills: Record<TileTone, string> = {
    tint: colors.tint,
    surface: colors.surface,
    dark: colors.deep,
  };
  const base: ViewStyle = {
    backgroundColor: fills[tone],
    borderRadius: radius.cardSm,
    padding: padded ? space.md : 0,
  };
  return <View style={[base, style]} {...rest} />;
}
