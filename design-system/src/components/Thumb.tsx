import { memo, useEffect, useState } from 'react';
import { Image, View } from 'react-native';
import { radius } from '../../tokens/radius.ts';
import { size as sizes } from '../../tokens/spacing.ts';
import { useTheme } from '../theme.tsx';
import { Icon } from './Icon.tsx';

export type ThumbSize = 'sm' | 'md';

const DIM: Record<ThumbSize, number> = { sm: sizes.thumbSm, md: sizes.thumbMd };

/**
 * 정사각 사진 썸네일. 목록 행·신고 미리보기(sm), 사진 고르기 줄·기록 카드(md).
 * 주소가 비었거나 받지 못하면 사진 아이콘으로 자리를 지킵니다.
 * 옆 글자가 뜻을 전하는 경우가 대부분이라 label 이 없으면 스크린리더에서 숨깁니다.
 */
function ThumbBase({ uri, size = 'sm', label }: { uri?: string | null; size?: ThumbSize; label?: string }) {
  const { colors } = useTheme();
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [uri]);
  const d = DIM[size];
  return (
    <View
      accessible={!!label}
      accessibilityRole={label ? 'image' : undefined}
      accessibilityLabel={label}
      importantForAccessibility={label ? 'yes' : 'no-hide-descendants'}
      style={{ width: d, height: d, borderRadius: radius.tile, overflow: 'hidden', backgroundColor: colors.tint, alignItems: 'center', justifyContent: 'center' }}
    >
      {uri && !broken ? (
        <Image source={{ uri }} onError={() => setBroken(true)} style={{ width: '100%', height: '100%' }} />
      ) : (
        <Icon name="image-outline" size={Math.round(d / 2)} color={colors.inkFaint} />
      )}
    </View>
  );
}

export const Thumb = memo(ThumbBase);
