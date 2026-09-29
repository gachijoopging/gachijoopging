import { useEffect, useRef, useState } from 'react';
import { FlatList, Image, View, useWindowDimensions, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { Chip, Icon, IconButton, radius, screen, size, space, useTheme } from 'design-system/src';

/** 원본 비율을 지키되 너무 납작하거나 길어지지 않게 막는 범위 (5-2 배치) */
const MIN_H = 220;
const MAX_H = size.photoMaxHeight;

type Photo = { url: string; thumbUrl: string };

/** 5-2·5-3 사진 보기. 자르지 않고 원본 비율, 좌우로 넘기며 끝에서 순환하지 않는다 */
export function PhotoPager({
  photos,
  label,
  onIndexChange,
}: {
  photos: readonly Photo[];
  label: (index: number, total: number) => string;
  onIndexChange?: (index: number) => void;
}) {
  const { colors } = useTheme();
  const { width: windowWidth } = useWindowDimensions();
  const [width, setWidth] = useState(windowWidth - screen.horizontal * 2);
  const [index, setIndex] = useState(0);
  const [height, setHeight] = useState(MIN_H);
  const [failed, setFailed] = useState<ReadonlySet<number>>(new Set());
  const list = useRef<FlatList<Photo>>(null);
  const total = photos.length;

  // 첫 사진으로 한 번만 정한다. 넘길 때마다 바꾸면 카드가 튀고 아래 본문이 밀린다 — 다른 비율은 contain 이 흡수
  const first = photos[0]?.url;
  useEffect(() => {
    if (!first) return;
    Image.getSize(
      first,
      (w, h) => setHeight(Math.min(MAX_H, Math.max(MIN_H, (width * h) / w))),
      () => {},
    );
  }, [first, width]);

  const go = (next: number) => {
    const i = Math.max(0, Math.min(total - 1, next));
    list.current?.scrollToIndex({ index: i, animated: true });
    setIndex(i);
    onIndexChange?.(i);
  };

  const onScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = Math.round(e.nativeEvent.contentOffset.x / width);
    if (i !== index) {
      setIndex(i);
      onIndexChange?.(i);
    }
  };

  return (
    <View
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      style={{ height, borderRadius: radius.tile, overflow: 'hidden', backgroundColor: colors.tint }}
    >
      <FlatList
        ref={list}
        data={photos}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        keyExtractor={(p, i) => `${i}-${p.url}`}
        onMomentumScrollEnd={onScrollEnd}
        getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
        renderItem={({ item, index: i }) => (
          <View
            accessible
            accessibilityRole="image"
            accessibilityLabel={label(i, total)}
            accessibilityLiveRegion="polite"
            style={{ width, height, alignItems: 'center', justifyContent: 'center' }}
          >
            <Icon name="image-outline" size={size.iconCircleLg} color={colors.inkFaint} />
            {!failed.has(i) ? (
              <Image
                source={{ uri: item.url }}
                defaultSource={{ uri: item.thumbUrl }}
                resizeMode="contain"
                onError={() => setFailed((s) => new Set(s).add(i))}
                style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
              />
            ) : null}
          </View>
        )}
      />
      {total > 1 ? (
        <>
          <View style={{ position: 'absolute', top: space.sm, right: space.sm }} importantForAccessibility="no-hide-descendants">
            <Chip label={`${index + 1}/${total}`} tone="overlay" />
          </View>
          {index > 0 ? (
            <View style={{ position: 'absolute', left: space.xs, top: height / 2 - size.iconButton / 2 }}>
              <IconButton icon="chevron-left" label="이전 사진" tone="surface" onPress={() => go(index - 1)} />
            </View>
          ) : null}
          {index < total - 1 ? (
            <View style={{ position: 'absolute', right: space.xs, top: height / 2 - size.iconButton / 2 }}>
              <IconButton icon="chevron-right" label="다음 사진" tone="surface" onPress={() => go(index + 1)} />
            </View>
          ) : null}
        </>
      ) : null}
    </View>
  );
}
