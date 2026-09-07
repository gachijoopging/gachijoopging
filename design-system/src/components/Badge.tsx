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
 * `accent` 는 브랜드의 유일한 채도 대비 색(오렌지)입니다. 원본 규약대로
 * "사용자 본인의 성취·진행" 에만 씁니다 — 한 화면에 한 번을 넘기면 강조로 읽히지
 * 않습니다. 그 외에는 `deep` 을 쓰세요.
 */
function DotBase({
  tone = 'accent',
  size = 8,
}: {
  tone?: 'accent' | 'deep' | 'danger';
  size?: number;
}) {
  const { colors } = useTheme();
  const fills = { accent: colors.orange, deep: colors.deep, danger: colors.error };
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

export type BadgeTone = 'deep' | 'lime' | 'danger' | 'neutral';

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
  };
  const t = tones[tone];
  return (
    <View
      style={[
        {
          minWidth: 20,
          paddingHorizontal: space.xs + 2,
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
