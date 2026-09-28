import { memo } from 'react';
import { View, type ViewStyle } from 'react-native';
import { radius } from '../../tokens/radius.ts';
import { space } from '../../tokens/spacing.ts';
import { fixedContainerFontScaleCap } from '../../tokens/typography.ts';
import { useTheme } from '../theme.tsx';
import { Txt } from './Text.tsx';

/**
 * 읽지 않음 · 진행 중을 나타내는 점.
 *
 * 점은 글자 없이 상태만 전하는 비텍스트 UI 라 배경 위 3:1 이 필요합니다(SC 1.4.11).
 * 오렌지는 밝은 서피스 위 2.18:1 이라 점으로 쓸 수 없습니다.
 * `onDeep` 은 선택된 달력 칸처럼 deep 채움 위에, `onLime` 은 라임 채움 위에 얹힐 때 씁니다.
 * `ink` 는 옅은 라임처럼 deep 이 3:1 에 못 미치는 바탕 위에 씁니다.
 */
function DotBase({
  tone = 'deep',
  size = 8,
}: {
  tone?: 'deep' | 'danger' | 'onDeep' | 'onLime' | 'ink';
  size?: number;
}) {
  const { colors } = useTheme();
  const fills = { deep: colors.deep, danger: colors.error, onDeep: colors.onDark, onLime: colors.onLime, ink: colors.ink };
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: fills[tone],
      }}
    />
  );
}

export const Dot = memo(DotBase);

export type BadgeTone = 'deep' | 'lime' | 'danger' | 'neutral' | 'warn';

/**
 * 숫자·짧은 라벨 배지. 아바타 모서리나 탭 위에 얹습니다.
 *
 * 아바타 모서리에 붙는 크기라 자랄 자리가 없어서, 여기서만 글자 배율 상한을 둡니다.
 * 배지가 단독으로 정보를 전달하는 자리에는 쓰지 마세요 — 큰 배율에서 잘립니다.
 */
function BadgeBase({
  label,
  tone = 'danger',
  style,
}: {
  label: string | number;
  tone?: BadgeTone;
  style?: ViewStyle;
}) {
  const { colors } = useTheme();
  const tones: Record<BadgeTone, { bg: string; ink: string }> = {
    deep: { bg: colors.deep, ink: colors.onDark },
    lime: { bg: colors.lime, ink: colors.onLime },
    // 야간에는 error 가 밝아져 흰 글자가 2.53:1 로 무너집니다. onError 가 테마별로
    // 뒤집히므로 white 를 직접 쓰지 않습니다.
    danger: { bg: colors.error, ink: colors.onError },
    neutral: { bg: colors.neutral, ink: colors.neutralInk },
    warn: { bg: colors.warnBg, ink: colors.warnInk },
  };
  const t = tones[tone];
  return (
    <View
      style={[
        {
          minWidth: 20,
          paddingHorizontal: space.xs + 2,
          // 12 글자를 20 높이 알약에 맞추는 광학 여백. 4 그리드로 올리면 배지가 칩처럼 커집니다.
          paddingVertical: 1,
          borderRadius: radius.pill,
          backgroundColor: t.bg,
          alignItems: 'center',
          justifyContent: 'center',
        },
        style,
      ]}
    >
      <Txt
        variant="micro"
        bold
        maxFontSizeMultiplier={fixedContainerFontScaleCap}
        style={{ color: t.ink }}
      >
        {label}
      </Txt>
    </View>
  );
}

export const Badge = memo(BadgeBase);
