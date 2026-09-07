import { memo } from 'react';
import { Pressable, View, type ViewStyle } from 'react-native';
import { radius } from '../../tokens/radius.ts';
import { space, size as sizes } from '../../tokens/spacing.ts';
import { borderWidth } from '../../tokens/elevation.ts';
import { useTheme, useRipple, pressedOpacity } from '../theme.tsx';
import { Txt } from './Text.tsx';
import { Icon, type IconName } from './Icon.tsx';

/**
 * 칩. 원본 드로어블 9종(`bg_chip_*`)을 tone 하나로 접었습니다.
 *
 * `selected` 는 원본 `bg_chip_selector` 의 선택 상태 — 딥 채움에 밝은 글자입니다.
 * 흰 바탕 위 밝은 색은 구조적으로 3:1 에 닿을 수 없어서, 선택 표시는 반드시
 * 어두운 채움이어야 합니다.
 *
 * 칩은 시각적으로 32 높이지만, 누를 수 있을 때는 hitSlop 으로 터치 영역을 48 로
 * 넓힙니다 — 칩을 48 로 키우면 나란히 놓았을 때 알약이 아니라 버튼으로 읽힙니다.
 */
export type ChipTone =
  | 'lime'
  | 'soft'
  | 'surface'
  | 'neutral'
  | 'info'
  | 'warn'
  | 'danger';

export type ChipProps = {
  label: string;
  tone?: ChipTone;
  icon?: IconName;
  selected?: boolean;
  onPress?: () => void;
};

const VISUAL_HEIGHT = 32;
const SLOP = (sizes.minTouch - VISUAL_HEIGHT) / 2;

function ChipBase({ label, tone = 'soft', icon, selected, onPress }: ChipProps) {
  const { colors } = useTheme();
  const ripple = useRipple();

  const tones: Record<ChipTone, { bg: string; ink: string; border?: string }> = {
    lime: { bg: colors.lime, ink: colors.onLime },
    soft: { bg: colors.softChip, ink: colors.ink },
    surface: { bg: colors.surface, ink: colors.ink, border: colors.border },
    neutral: { bg: colors.neutral, ink: colors.neutralInk },
    info: { bg: colors.infoBg, ink: colors.infoInk },
    warn: { bg: colors.warnBg, ink: colors.warnInk },
    danger: { bg: colors.dangerBg, ink: colors.dangerInk },
  };

  const t = selected ? { bg: colors.deep, ink: colors.onDark } : tones[tone];

  const shell: ViewStyle = {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
    minHeight: VISUAL_HEIGHT,
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    backgroundColor: t.bg,
    borderWidth: t.border ? borderWidth.hairline : 0,
    borderColor: t.border,
    alignSelf: 'flex-start',
  };

  const body = (
    <>
      {icon ? <Icon name={icon} size={15} color={t.ink} /> : null}
      <Txt variant="label" style={{ color: t.ink }}>
        {label}
      </Txt>
    </>
  );

  if (!onPress) return <View style={shell}>{body}</View>;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      onPress={onPress}
      hitSlop={{ top: SLOP, bottom: SLOP, left: space.xs, right: space.xs }}
      android_ripple={ripple}
      style={({ pressed }) => [
        shell,
        { opacity: pressedOpacity(pressed), overflow: 'hidden' },
      ]}
    >
      {body}
    </Pressable>
  );
}

export const Chip = memo(ChipBase);
