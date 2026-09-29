import * as Crypto from 'expo-crypto';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, View } from 'react-native';
import {
  AppHeader,
  Banner,
  Button,
  Chip,
  Icon,
  IconButton,
  Progress,
  Screen,
  SelectRow,
  Field,
  Txt,
  borderWidth,
  pressedOpacity,
  radius,
  space,
  useRipple,
  useTheme,
} from 'design-system/src';
import { ApiError, createMockClient, type ApiClient } from '../src/api/client';
import { usePreventBack } from '../src/auth/usePreventBack';
import { POST_PHOTO_MAX, POST_TEXT_MAX, canPost, movePhoto, photosToUpload, readyMediaIds } from '../src/profile/profile';

type Photo = { key: string; uri: string; name: string; type: string; mediaId: string | null; failed: boolean };
type Visibility = 'CREW' | 'PRIVATE';
type Draft = { text: string; photos: Photo[]; visibility: Visibility; requestId: string | null };

const api: ApiClient = createMockClient({ delayMs: 300 });
const THUMB = 64;
const EMPTY: Draft = { text: '', photos: [], visibility: 'CREW', requestId: null };

// ponytail: 메모리에만 둔다. 앱을 다시 켜면 사라진다 — 재실행 뒤에도 필요하면 AsyncStorage 로 옮긴다
let draft: Draft = EMPTY;

export default function CreatePostScreen() {
  const { imageUri } = useLocalSearchParams<{ imageUri?: string }>();
  const { colors } = useTheme();
  const ripple = useRipple();
  const [text, setText] = useState(draft.text);
  const [photos, setPhotos] = useState<Photo[]>(() =>
    imageUri && !draft.photos.some((p) => p.uri === imageUri)
      ? [{ key: imageUri, uri: imageUri, name: 'summary.png', type: 'image/png', mediaId: null, failed: false }, ...draft.photos]
      : draft.photos,
  );
  const [visibility, setVisibility] = useState<Visibility>(draft.visibility);
  const [selected, setSelected] = useState<number | null>(null);
  const [posting, setPosting] = useState(false);
  const [done, setDone] = useState(0);
  const [postFailed, setPostFailed] = useState(false);
  const requestId = useRef(draft.requestId);
  const busy = useRef(false);
  usePreventBack(posting);

  // 뒤로 가도 작성 중인 내용을 들고 있다가 다시 들어오면 되살린다
  useEffect(() => {
    draft = { text, photos, visibility, requestId: requestId.current };
  }, [text, photos, visibility]);

  const updatePhoto = (key: string, patch: Partial<Photo>) =>
    setPhotos((prev) => prev.map((p) => (p.key === key ? { ...p, ...patch } : p)));

  const addPhotos = async () => {
    const remaining = POST_PHOTO_MAX - photos.length;
    if (remaining <= 0) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: remaining,
      quality: 0.8,
    });
    if (result.canceled) return;
    const added = result.assets.slice(0, remaining).map((a) => ({
      key: `${a.uri}#${Crypto.randomUUID()}`,
      uri: a.uri,
      name: a.fileName ?? 'photo.jpg',
      type: a.mimeType ?? 'image/jpeg',
      mediaId: null,
      failed: false,
    }));
    setPhotos((prev) => [...prev, ...added].slice(0, POST_PHOTO_MAX));
  };

  const upload = async (photo: Photo): Promise<string | null> => {
    try {
      const body = new FormData();
      body.append('mediaId', Crypto.randomUUID());
      body.append('purpose', 'POST');
      body.append('file', { uri: photo.uri, name: photo.name, type: photo.type } as unknown as Blob);
      const { data } = await api.mutate('POST /media', body);
      updatePhoto(photo.key, { mediaId: data.mediaId, failed: false });
      return data.mediaId;
    } catch {
      updatePhoto(photo.key, { failed: true });
      return null;
    }
  };

  const publish = async () => {
    // 같은 프레임의 연속 탭은 posting 상태가 반영되기 전이라 ref 로 막는다
    if (busy.current || !canPost({ text, photoCount: photos.length })) return;
    busy.current = true;
    setPosting(true);
    setPostFailed(false);
    setSelected(null);
    try {
      const uploaded = new Map(photos.map((p) => [p.key, p.mediaId]));
      setDone(photos.length - photosToUpload(photos).length);
      for (const photo of photosToUpload(photos)) {
        const mediaId = await upload(photo);
        uploaded.set(photo.key, mediaId);
        if (mediaId) setDone((d) => d + 1);
      }
      const mediaIds = readyMediaIds(photos.map((p) => ({ mediaId: uploaded.get(p.key) ?? null })));
      if (!mediaIds) return;
      // 응답이 유실돼 다시 눌러도 같은 id 라 서버가 중복 게시를 흡수한다
      requestId.current ??= Crypto.randomUUID();
      draft = { ...draft, requestId: requestId.current };
      await api.mutate('POST /crew/posts', { id: requestId.current, text: text.trim(), visibility, mediaIds });
      draft = EMPTY;
      router.dismissTo({ pathname: '/(tabs)/feed', params: { flash: '게시물을 올렸어요' } });
    } catch (e) {
      if (e instanceof ApiError && e.code === 'NO_CREW') return router.replace('/1-6-create-or-join-crew');
      setPostFailed(true);
    } finally {
      busy.current = false;
      setPosting(false);
    }
  };

  const allowed = canPost({ text, photoCount: photos.length });
  const atMax = text.length >= POST_TEXT_MAX;

  return (
    <Screen>
      <AppHeader title="게시물 작성" onBack={() => router.back()} backDisabled={posting} />
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ gap: space.lg, paddingBottom: space['3xl'] }} keyboardShouldPersistTaps="handled">
        <View style={{ gap: space.xs }}>
          <Field
            label="글"
            accessibilityLabel={atMax ? '게시물 본문 입력, 1000자, 더 입력할 수 없어요' : '게시물 본문 입력'}
            placeholder="오늘의 줍깅은 어땠나요?"
            value={text}
            onChangeText={setText}
            multiline
            maxLength={POST_TEXT_MAX}
            editable={!posting}
          />
          <Txt variant="micro" tone={atMax ? 'error' : 'muted'} accessible={false} style={{ alignSelf: 'flex-end' }}>
            {text.length} / {POST_TEXT_MAX}
          </Txt>
        </View>

        <View style={{ gap: space.sm }}>
          <Txt variant="label">사진 (최대 {POST_PHOTO_MAX}장)</Txt>
          <ScrollView horizontal contentContainerStyle={{ gap: space.sm }} showsHorizontalScrollIndicator={false}>
            {photos.length < POST_PHOTO_MAX ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`사진 추가, ${POST_PHOTO_MAX}장 중 ${photos.length}장 골랐어요`}
                android_ripple={ripple}
                disabled={posting}
                onPress={addPhotos}
                style={({ pressed }) => ({
                  width: THUMB,
                  height: THUMB,
                  borderRadius: radius.tile,
                  borderWidth: borderWidth.hairline,
                  borderColor: colors.borderDashed,
                  borderStyle: 'dashed',
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: pressedOpacity(pressed),
                })}
              >
                <Icon name="plus" />
              </Pressable>
            ) : null}
            {photos.map((p, i) => (
              <View key={p.key} style={{ width: THUMB, height: THUMB }}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={i === 0 ? `대표 사진, ${i + 1}번째` : `${i + 1}번째 사진, 순서 선택`}
                  accessibilityState={{ selected: selected === i }}
                  disabled={posting}
                  onPress={() => setSelected(selected === i ? null : i)}
                  style={{
                    flex: 1,
                    borderRadius: radius.tile,
                    overflow: 'hidden',
                    borderWidth: selected === i ? borderWidth.focus : 0,
                    borderColor: colors.deep,
                  }}
                >
                  <Image source={{ uri: p.uri }} accessible={false} style={{ width: '100%', height: '100%', backgroundColor: colors.tint }} />
                  {i === 0 ? (
                    <View style={{ position: 'absolute', left: space.xs / 2, bottom: space.xs / 2 }}>
                      <Chip label="대표" tone="deep" />
                    </View>
                  ) : null}
                  {posting && p.mediaId == null && !p.failed ? (
                    <View style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.scrim }}>
                      <ActivityIndicator color={colors.onDark} />
                    </View>
                  ) : null}
                </Pressable>
                {p.failed && !posting ? (
                  <View style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center' }}>
                    <IconButton icon="alert-circle" label="업로드 실패, 다시 시도하려면 두 번 탭" tone="surface" onPress={publish} />
                  </View>
                ) : null}
                <View style={{ position: 'absolute', top: -space.md, right: -space.md }}>
                  <IconButton
                    icon="close"
                    label={`${i + 1}번째 사진 삭제`}
                    disabled={posting}
                    onPress={() => {
                      setSelected(null);
                      setPhotos((prev) => prev.filter((x) => x.key !== p.key));
                    }}
                  />
                </View>
              </View>
            ))}
          </ScrollView>
          {selected != null && photos[selected] ? (
            <View style={{ flexDirection: 'row', gap: space.sm }}>
              <Button
                label="앞으로"
                variant="ghost"
                size="sm"
                icon="arrow-left"
                accessibilityLabel={`${selected + 1}번째 사진 앞으로 이동`}
                disabled={selected === 0}
                onPress={() => {
                  setPhotos((prev) => [...movePhoto(prev, selected, -1)]);
                  setSelected(selected - 1);
                }}
              />
              <Button
                label="뒤로"
                variant="ghost"
                size="sm"
                icon="arrow-right"
                accessibilityLabel={`${selected + 1}번째 사진 뒤로 이동`}
                disabled={selected === photos.length - 1}
                onPress={() => {
                  setPhotos((prev) => [...movePhoto(prev, selected, 1)]);
                  setSelected(selected + 1);
                }}
              />
            </View>
          ) : null}
        </View>

        <View style={{ gap: space.xs }} accessibilityRole="radiogroup">
          <Txt variant="label">공개 범위</Txt>
          <SelectRow title="크루 전체" subtitle="크루원 모두에게 보여요" selected={visibility === 'CREW'} disabled={posting} onPress={() => setVisibility('CREW')} />
          <SelectRow
            title="나만 보기"
            subtitle="나에게만 보여요. 내 게시물 탭에서 볼 수 있어요"
            selected={visibility === 'PRIVATE'}
            disabled={posting}
            onPress={() => setVisibility('PRIVATE')}
          />
        </View>

        {postFailed ? (
          <View accessibilityLiveRegion="polite">
            <Banner tone="danger">
              {photos.some((p) => p.failed) ? '올리지 못한 사진이 있어요. 다시 시도하거나 그 사진을 빼 주세요.' : '게시하지 못했어요. 다시 시도해 주세요.'}
            </Banner>
          </View>
        ) : null}
        {posting && photos.length > 0 ? (
          <View accessibilityLiveRegion="polite">
            <Progress value={done / photos.length} label={`게시하는 중, ${photos.length}장 중 ${done}장 올림`} />
          </View>
        ) : null}

        <View style={{ flexDirection: 'row', gap: space.sm }}>
          <Button label="뒤로" variant="ghost" size="md" accessibilityLabel="뒤로, 작성 중인 내용 유지" disabled={posting} onPress={() => router.back()} />
          <View style={{ flex: 1 }}>
            <Button
              label="게시하기"
              size="md"
              fullWidth
              loading={posting}
              disabled={!allowed}
              accessibilityHint={allowed ? undefined : '글이나 사진을 먼저 넣어 주세요'}
              onPress={publish}
            />
          </View>
        </View>
      </ScrollView>

    </Screen>
  );
}
