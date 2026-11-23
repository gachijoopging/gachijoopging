import { memo, useEffect, useState } from 'react';
import { Image, View, type ViewStyle } from 'react-native';
import { size as sizes } from '../../tokens/spacing.ts';
import { borderWidth } from '../../tokens/elevation.ts';
import { useTheme } from '../theme.tsx';
import { Icon } from './Icon.tsx';
import { Txt, type TextVariant } from './Text.tsx';

export type AvatarSize = 'sm' | 'md' | 'lg' | 'xl';
export type AvatarTone = 'me' | 'pink' | 'sky' | 'sand' | 'lilac' | 'leaf';

const DIM: Record<AvatarSize, number> = {
  sm: sizes.avatarSm,
  md: sizes.avatarMd,
  lg: sizes.avatarLg,
  xl: sizes.avatarXl,
};
const LABEL: Record<AvatarSize, TextVariant> = {
  sm: 'label',
  md: 'section',
  lg: 'display',
  xl: 'display',
};

const TONES: AvatarTone[] = ['me', 'pink', 'sky', 'sand', 'lilac', 'leaf'];

/** 이름이 같으면 항상 같은 색이 나오도록 이름에서 톤을 정합니다. */
export function toneForName(name: string): AvatarTone {
  let h = 0;
  for (let i = 0; i < name.length; i += 1) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return TONES[h % TONES.length];
}

export type AvatarProps = {
  name: string;
  uri?: string;
  size?: AvatarSize;
  tone?: AvatarTone;
  /** 발언 중인 참가자 표시 (원본 `bg_circle_avatar_ring`) */
  ring?: boolean;
  /** 옆 글자나 부모 라벨이 이미 이름을 읽을 때. 스크린리더에서 숨깁니다 */
  decorative?: boolean;
  /** 탈퇴한 사용자. 이름 첫 글자 대신 사람 실루엣, 중립 배경 */
  withdrawn?: boolean;
};

function AvatarBase({ name, uri, size = 'md', tone, ring = false, decorative = false, withdrawn = false }: AvatarProps) {
  const { colors } = useTheme();
  // 주소가 죽었거나 늦으면 빈 원이 남는다. 실패하면 첫 글자로 돌아간다
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [uri]);
  const d = DIM[size];
  const bg = withdrawn ? colors.neutral : colors.avatar[tone ?? toneForName(name)];

  const shell: ViewStyle = {
    width: d,
    height: d,
    borderRadius: d / 2,
    backgroundColor: bg,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: ring ? borderWidth.focus : 0,
    borderColor: colors.lime,
  };

  return (
    <View
      style={shell}
      accessible={!decorative}
      accessibilityLabel={decorative ? undefined : withdrawn ? '탈퇴한 크루원' : name}
      importantForAccessibility={decorative ? 'no-hide-descendants' : 'auto'}
    >
      {withdrawn ? (
        <Icon name="account-outline" size={Math.round(d * 0.6)} color={colors.neutralInk} />
      ) : uri && !broken ? (
        <Image source={{ uri }} onError={() => setBroken(true)} style={{ width: '100%', height: '100%' }} />
      ) : (
        <Txt variant={LABEL[size]} style={{ color: colors.ink }}>
          {[...name][0] ?? '?'}
        </Txt>
      )}
    </View>
  );
}

export const Avatar = memo(AvatarBase);
