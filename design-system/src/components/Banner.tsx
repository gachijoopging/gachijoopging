import { View } from 'react-native';
import { radius } from '../../tokens/radius.ts';
import { space } from '../../tokens/spacing.ts';
import { borderWidth } from '../../tokens/elevation.ts';
import { useTheme } from '../theme.tsx';
import { Txt } from './Text.tsx';
import { Icon, type IconName } from './Icon.tsx';

/**
 * 배너. 원본 `bg_banner_info` · `bg_banner_warn` · `bg_banner_danger`.
 *
 * `info`(하늘색 H≈197°)는 브랜드 밖 색이라 "알려주는 상태" 전용입니다.
 * 액션이나 장식에 쓰면 이유 없이 튑니다.
 */
export type BannerTone = 'info' | 'warn' | 'danger';

const ICONS: Record<BannerTone, IconName> = {
  info: 'information',
  warn: 'alert',
  danger: 'alert-circle',
};

export function Banner({
  tone = 'info',
  title,
  children,
}: {
  tone?: BannerTone;
  title?: string;
  children: string;
}) {
  const { colors } = useTheme();
  const tones: Record<BannerTone, { bg: string; ink: string; border?: string }> = {
    info: { bg: colors.infoBg, ink: colors.infoInk },
    warn: { bg: colors.warnBg, ink: colors.warnInk, border: colors.warnBorder },
    danger: { bg: colors.dangerBg, ink: colors.dangerInk },
  };
  const t = tones[tone];

  return (
    <View
      accessibilityRole="alert"
      style={{
        flexDirection: 'row',
        gap: space.md,
        padding: space.lg,
        borderRadius: radius.tile,
        backgroundColor: t.bg,
        borderWidth: t.border ? borderWidth.hairline : 0,
        borderColor: t.border,
        alignSelf: 'stretch',
      }}
    >
      <Icon name={ICONS[tone]} size={20} color={t.ink} />
      <View style={{ flex: 1, gap: space.xs }}>
        {title ? (
          <Txt variant="section" bold style={{ color: t.ink }}>
            {title}
          </Txt>
        ) : null}
        <Txt variant="body" style={{ color: t.ink }}>
          {children}
        </Txt>
      </View>
    </View>
  );
}
