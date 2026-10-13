// 화면 4-5 · docs/screens/4-5-ai-classification-review.md
import * as Crypto from 'expo-crypto';
import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Image, ScrollView, View } from 'react-native';
import {
  AppHeader,
  Banner,
  Button,
  Card,
  Chip,
  Dialog,
  NumberStepper,
  Screen,
  Txt,
  size,
  space,
  useTheme,
} from 'design-system/src';
import { CATEGORIES, CATEGORY_LABEL, type Category } from '../../../src/category';
import { CategoryTile } from '../../../src/activity/CategoryTile';
import { recordPickup } from '../../../src/activity/actions';
import { aiBanner, groupDetections, itemsFromCounts, QUANTITY_MAX, totalOf, type Counts, type Inference } from '../../../src/activity/pickup';

type Media = { photoId: string; url: string; thumbUrl?: string | null; inference: Inference };

const BANNERS = {
  unavailable: { tone: 'info', text: '지금은 AI 분석을 쓸 수 없어요. 직접 골라 담으면 줍기 개수에는 바로 반영돼요.' },
  none: { tone: 'info', text: '사진에서 쓰레기를 찾지 못했어요. 직접 골라 담을 수 있어요.' },
  check: { tone: 'warn', text: '확인 필요 표시가 있는 종류와 수량을 확인해 주세요.' },
} as const;


function parseMedia(raw: string | undefined): Media | null {
  try {
    const media = JSON.parse(raw ?? '');
    return typeof media?.photoId === 'string' ? media : null;
  } catch {
    return null;
  }
}

export default function AiClassificationReviewScreen() {
  const { id, media: raw, localUri } = useLocalSearchParams<{ id: string; media?: string; localUri?: string }>();
  const media = useMemo(() => parseMedia(raw), [raw]);
  // 직접 링크·상태 복원으로 촬영 결과 없이 들어오면 담을 것이 없다. 활동으로 돌려보낸다
  useEffect(() => {
    if (!media) router.dismissTo({ pathname: '/activity/[id]', params: { id, flash: '사진 정보를 불러오지 못했어요. 다시 찍어 주세요' } });
  }, [media, id]);
  return media ? <Review id={id} media={media} localUri={localUri} /> : null;
}

function Review({ id, media, localUri }: { id: string; media: Media; localUri?: string }) {
  const navigation = useNavigation();
  const { colors } = useTheme();
  const groups = useMemo(() => groupDetections(media.inference?.status === 'OK' ? media.inference.items : []), [media]);
  const [counts, setCounts] = useState<Counts>(() =>
    Object.fromEntries(Object.entries(groups).map(([c, g]) => [c, g?.count ?? 0])),
  );
  const [invalid, setInvalid] = useState<Partial<Record<Category, boolean>>>({});
  const [saveFailed, setSaveFailed] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const ids = useRef<Partial<Record<Category, string>>>({});
  const leaving = useRef(false);

  const banner = aiBanner(media.inference);
  const found = media.inference?.status === 'OK' ? media.inference.items.length : 0;
  const total = totalOf(counts);
  const anyInvalid = Object.values(invalid).some(Boolean);
  const untouched = total === 0 && found === 0;

  const backToActivity = (flash?: string) => {
    leaving.current = true;
    router.dismissTo({ pathname: '/activity/[id]', params: { id, ...(flash ? { flash } : {}) } });
  };

  useEffect(
    () =>
      navigation.addListener('beforeRemove', (e) => {
        if (leaving.current) return;
        e.preventDefault();
        if (untouched) backToActivity();
        else setConfirmLeave(true);
      }),
    [navigation, untouched],
  );

  const save = () => {
    if (total === 0 || anyInvalid) return;
    setSaveFailed(false);
    try {
      // 같은 작업을 다시 시도하면 같은 id 를 쓴다 — 서버가 중복을 흡수한다
      const items = itemsFromCounts(counts, groups, () => '').map((it) => ({
        ...it,
        id: (ids.current[it.category] ??= Crypto.randomUUID()),
      }));
      recordPickup(items, media.photoId, id);
      const summary = items.map((it) => `${CATEGORY_LABEL[it.category]} ${it.quantity}`).join(' · ');
      backToActivity(`${summary} 담았어요 · 기기에 저장됨`);
    } catch {
      setSaveFailed(true);
    }
  };

  return (
    <Screen scroll={false}>
      <AppHeader title="AI 분류 확인" onBack={() => router.back()} />
      <ScrollView contentContainerStyle={{ gap: space.md, paddingBottom: space.xl }} keyboardShouldPersistTaps="handled">
        <Card padded={false} style={{ overflow: 'hidden' }}>
          <Image
            source={{ uri: localUri ?? media.url }}
            style={{ width: '100%', aspectRatio: 1, maxHeight: size.photoMaxHeight, backgroundColor: colors.neutral }}
            resizeMode="cover"
            accessible
            accessibilityRole="image"
            accessibilityLabel="방금 찍은 쓰레기"
          />
          <View style={{ position: 'absolute', left: space.md, bottom: space.md }} importantForAccessibility="no-hide-descendants">
            <Chip tone="overlay" label="방금 찍은 쓰레기" />
          </View>
        </Card>

        {banner ? <Banner tone={BANNERS[banner].tone}>{BANNERS[banner].text}</Banner> : null}
        {saveFailed ? (
          <Banner tone="danger" action={{ label: '다시 시도', onPress: save }}>
            기기에 기록을 저장하지 못했어요
          </Banner>
        ) : null}

        <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <Txt variant="section" bold>맞게 분류됐나요?</Txt>
          {found > 0 ? <Txt variant="caption" tone="muted">AI 가 {found}개 찾았어요</Txt> : null}
        </View>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
          {CATEGORIES.map((c) => {
            const g = groups[c];
            const n = counts[c] ?? 0;
            const name = CATEGORY_LABEL[c];
            const status = g ? (g.needsCheck ? '확인 필요' : 'AI') : null;
            return (
              <CategoryTile
                key={c}
                category={c}
                selected={n > 0}
                headerLabel={[name, `${n}개`, status === '확인 필요' ? '확인 필요' : null].filter(Boolean).join(', ')}
                aside={status ? <Chip tone={status === '확인 필요' ? 'warn' : 'lime'} label={status} /> : null}
              >
                <NumberStepper
                  label={name}
                  hideLabel
                  decrementLabel={`${name} 빼기`}
                  incrementLabel={`${name} 더하기`}
                  value={n}
                  min={0}
                  max={QUANTITY_MAX}
                  onChange={(v) => setCounts((m) => ({ ...m, [c]: v }))}
                  onValidityChange={(ok) => setInvalid((m) => ({ ...m, [c]: !ok }))}
                />
              </CategoryTile>
            );
          })}
        </View>

        <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'center' }}>
          <Button
            label="다시 촬영"
            variant="ghost"
            size="md"
            onPress={() => {
              leaving.current = true;
              router.back();
            }}
          />
          <View style={{ flex: 1 }}>
            <Button
              label={total > 0 ? `이대로 담기 · ${total}개` : '이대로 담기'}
              accessibilityLabel={`이대로 담기, ${total}개`}
              size="lg"
              fullWidth
              disabled={total === 0 || anyInvalid}
              onPress={save}
            />
          </View>
        </View>
      </ScrollView>

      <Dialog
        visible={confirmLeave}
        onClose={() => setConfirmLeave(false)}
        title="촬영 결과를 버릴까요?"
        actions={
          <>
            <Button label="계속 분류" variant="ghost" size="md" onPress={() => setConfirmLeave(false)} />
            <Button
              label="버리고 돌아가기"
              variant="danger"
              size="md"
              onPress={() => {
                setConfirmLeave(false);
                backToActivity();
              }}
            />
          </>
        }
      >
        <Txt variant="body">입력한 줍기 수량을 버릴까요? 업로드된 사진은 남을 수 있어요.</Txt>
      </Dialog>
    </Screen>
  );
}
