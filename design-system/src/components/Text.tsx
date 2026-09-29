import type { Ref } from 'react';
import { Text as RNText, type TextProps, type TextStyle } from 'react-native';
import { fontSize, lineHeight, fontFamily } from '../../tokens/typography.ts';
import { useTheme } from '../theme.tsx';

export type TextVariant = keyof typeof fontSize;
export type TextTone =
  | 'ink'
  | 'muted'
  | 'faint'
  | 'hint'
  | 'onLime'
  | 'onDark'
  | 'onPhoto'
  | 'error'
  | 'green';

export type TextWeight = keyof typeof fontFamily;

/**
 * counter·display·title·metric 은 원본에서 굵게 씁니다.
 * label 도 원본은 Bold 였지만 12px 에서 획이 뭉개져 SemiBold 로 내렸습니다.
 */
const DEFAULT_WEIGHT: Partial<Record<TextVariant, TextWeight>> = {
  counter: 'bold',
  display: 'bold',
  title: 'bold',
  metric: 'bold',
  label: 'semibold',
};

const TABULAR: TextVariant[] = ['counter', 'display', 'metric'];

export type TxtProps = TextProps & {
  variant?: TextVariant;
  tone?: TextTone;
  /** true 는 Bold, false 는 Regular. 중간 굵기는 `weight` 로 */
  bold?: boolean;
  /** 주면 `bold` 보다 우선합니다 */
  weight?: TextWeight;
  /** 스크린리더 포커스를 옮길 때 */
  ref?: Ref<RNText>;
};

/**
 * 기본은 시스템 글자 크기를 그대로 따릅니다(상한 없음).
 *
 * 예전에는 여기서 1.4 로 잘랐는데, 그건 안전판이 아니라 저시력 사용자의 설정을
 * 무시하는 것이었습니다 — 실제로 배율 1.3 에서 이미 고정 폭 라벨이 두 줄로 쪼개졌고,
 * 상한은 그걸 막지 못했습니다. 잘리는 원인은 배율이 아니라 고정 크기입니다.
 *
 * 컨테이너를 minHeight/minWidth 로 두면 글자가 커져도 자랍니다. 정말 자랄 수 없는
 * 자리(고정 높이 배지 등)에서만 `maxFontSizeMultiplier` 를 직접 넘기세요.
 */

export function Txt({
  variant = 'body',
  tone = 'ink',
  bold,
  weight,
  style,
  ...rest
}: TxtProps) {
  const { colors } = useTheme();
  const toneColor: Record<TextTone, string> = {
    ink: colors.ink,
    muted: colors.inkMuted,
    faint: colors.inkFaint,
    hint: colors.inkHint,
    onLime: colors.onLime,
    onDark: colors.onDark,
    onPhoto: colors.onPhoto,
    error: colors.error,
    green: colors.greenStrong,
  };
  const resolved: TextWeight =
    weight ?? (bold === undefined ? DEFAULT_WEIGHT[variant] ?? 'regular' : bold ? 'bold' : 'regular');
  const base: TextStyle = {
    fontSize: fontSize[variant],
    lineHeight: lineHeight[variant],
    fontFamily: fontFamily[resolved],
    color: toneColor[tone],
    // 바뀌는 숫자가 자릿수마다 폭이 달라 좌우로 흔들리지 않게 고정폭 숫자를 쓴다
    ...(TABULAR.includes(variant) && { fontVariant: ['tabular-nums'] }),
  };
  return (
    <RNText style={[base, style]} {...rest} />
  );
}
