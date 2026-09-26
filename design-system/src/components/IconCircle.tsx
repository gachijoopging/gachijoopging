import { memo } from 'react';
import { View } from 'react-native';
import { size as sizes } from '../../tokens/spacing.ts';
import { useTheme } from '../theme.tsx';
import { Icon, type IconName } from './Icon.tsx';

export type IconCircleTone = 'tint' | 'neutral' | 'surface' | 'deep' | 'lime' | 'orange';
export type IconCircleSize = 'sm' | 'md' | 'lg';

const DIM: Record<IconCircleSize, { box: number; icon: number }> = {
  sm: { box: sizes.iconCircleSm, icon: 18 },
  md: { box: sizes.iconCircleMd, icon: 22 },
  lg: { box: sizes.iconCircleLg, icon: 26 },
};

/**
 * 원 배경 위의 아이콘. 원본 `bg_circle_*` — 알림 종류·홈 요약 카드·활동 하단 바처럼
 * 아이콘에 자리를 잡아 주는 곳에 씁니다. 누르는 원은 `IconButton` 입니다.
 *
 * 옆 글자가 뜻을 전하는 장식이라 기본은 스크린리더에서 숨깁니다. 아이콘만으로
 * 뜻이 있을 때만 `label` 을 주세요.
 * `orange` 는 팔레트의 유일한 악센트라 "사용자 본인의 성취" 자리에만 씁니다.
 */
function IconCircleBase({
  icon,
  tone = 'tint',
  size = 'md',
  label,
}: {
  icon: IconName;
  tone?: IconCircleTone;
  size?: IconCircleSize;
  label?: string;
}) {
  const { colors } = useTheme();
  const tones: Record<IconCircleTone, { bg: string; ink: string }> = {
    tint: { bg: colors.tint, ink: colors.ink },
    neutral: { bg: colors.neutral, ink: colors.neutralInk },
    surface: { bg: colors.surface, ink: colors.ink },
    deep: { bg: colors.deep, ink: colors.onDeep },
    lime: { bg: colors.lime, ink: colors.onLime },
    orange: { bg: colors.orange, ink: colors.onLime },
  };
  const t = tones[tone];
  const d = DIM[size];
  return (
    <View
      accessible={!!label}
      accessibilityRole={label ? 'image' : undefined}
      accessibilityLabel={label}
      importantForAccessibility={label ? 'yes' : 'no-hide-descendants'}
      style={{
        width: d.box,
        height: d.box,
        borderRadius: d.box / 2,
        backgroundColor: t.bg,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Icon name={icon} size={d.icon} color={t.ink} />
    </View>
  );
}

export const IconCircle = memo(IconCircleBase);
