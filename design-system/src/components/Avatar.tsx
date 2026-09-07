import { memo } from 'react';
import { Image, View, type ViewStyle } from 'react-native';
import { size as sizes } from '../../tokens/spacing.ts';
import { borderWidth } from '../../tokens/elevation.ts';
import { useTheme } from '../theme.tsx';
import { Txt, type TextVariant } from './Text.tsx';

export type AvatarSize = 'sm' | 'md' | 'lg';
export type AvatarTone = 'me' | 'pink' | 'sky' | 'sand' | 'lilac' | 'leaf';

const DIM: Record<AvatarSize, number> = {
  sm: sizes.avatarSm,
  md: sizes.avatarMd,
  lg: sizes.avatarLg,
};
const LABEL: Record<AvatarSize, TextVariant> = {
  sm: 'label',
  md: 'section',
  lg: 'display',
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
};

function AvatarBase({ name, uri, size = 'md', tone, ring = false }: AvatarProps) {
  const { colors } = useTheme();
  const d = DIM[size];
  const bg = colors.avatar[tone ?? toneForName(name)];

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
    <View style={shell} accessible accessibilityLabel={name}>
      {uri ? (
        <Image source={{ uri }} style={{ width: '100%', height: '100%' }} />
      ) : (
        <Txt variant={LABEL[size]} style={{ color: colors.ink }}>
          {[...name][0] ?? '?'}
        </Txt>
      )}
    </View>
  );
}

export const Avatar = memo(AvatarBase);
