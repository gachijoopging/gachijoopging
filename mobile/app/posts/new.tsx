// 화면 5-6 · docs/screens/5-6-create-post.md
import { mediaFile } from '../../src/api/media';
import * as Crypto from 'expo-crypto';
import * as ImagePicker from 'expo-image-picker';
import { useNetworkState } from 'expo-network';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { LayoutAnimation, Pressable, ScrollView, View } from 'react-native';
import {
  AppHeader,
  Banner,
  Button,
  Badge,
  Icon,
  IconButton,
  Progress,
  Screen,
  SelectRow,
  Field,
  ErrorState,
  Loading,
  Spinner,
  Thumb,
  Txt,
  borderWidth,
  pressedOpacity,
  radius,
  size,
  space,
  useReduceMotion,
  useRipple,
  useTheme,
} from 'design-system/src';
import { ApiError, type ApiClient } from '../../src/api/client';
import { createApiClient } from '../../src/api/config';
import { usePreventBack } from '../../src/auth/usePreventBack';
import { currentAccount, rememberAccount } from '../../src/auth/account';
import { resolveDestination } from '../../src/auth/destination';
import { POST_PHOTO_MAX, POST_TEXT_MAX, canPost, movePhoto, photosToUpload, readyMediaIds } from '../../src/profile/profile';
import { changedDraft, discardPhotos, emptyDraft, keepPhoto, lastPostScope, loadDraft, rememberPostScope, saveDraft, type Draft, type Photo, type PostScope } from '../../src/profile/post-draft';

const api: ApiClient = createApiClient({ delayMs: 300 });
const THUMB = size.thumbMd;

export default function CreatePostScreen() {
  const { imageUri } = useLocalSearchParams<{ imageUri?: string }>();
  const { colors } = useTheme();
  const ripple = useRipple();
  const reduce = useReduceMotion();
  const network = useNetworkState();
  const offline = network.isConnected === false || network.isInternetReachable === false;
  const [scope, setScope] = useState<PostScope | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const draftRef = useRef(draft);
  const { text, photos, visibility } = draft;
  const [saveError, setSaveError] = useState<string | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const imageAdded = useRef(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [posting, setPosting] = useState(false);
  const [done, setDone] = useState(0);
  const [postFailed, setPostFailed] = useState(false);
  const busy = useRef(false);
  const initialization = useRef(0);
  usePreventBack(posting);

  const initialize = async () => {
    if (busy.current) return;
    const generation = ++initialization.current;
    const accountId = currentAccount()?.id;
    setLoadFailed(false);
    try {
      let next: PostScope | null;
      if (offline) {
        const account = currentAccount();
        next = account?.hasCrew ? lastPostScope(account.id) : null;
      } else {
        const { data } = await api.get('GET /users/me');
        if (generation !== initialization.current || (accountId && currentAccount()?.id !== accountId)) return;
        rememberAccount(data);
        if (data.membership.status !== 'MEMBER' || !data.membership.crew) return router.replace(resolveDestination(data));
        next = { userId: data.id, crewId: data.membership.crew.id };
        rememberPostScope(next);
      }
      if (generation !== initialization.current) return;
      if (!next) throw new Error('계정을 확인할 수 없어요');
      const restored = loadDraft(next);
      draftRef.current = restored;
      setDraft(restored);
      setScope(next);
    } catch { if (generation === initialization.current) setLoadFailed(true); }
  };
  useEffect(() => {
    void initialize();
    return () => { initialization.current++; };
  }, [offline]);

  const commit = (next: Draft) => {
    if (!scope) throw new Error('계정을 확인할 수 없어요');
    saveDraft(scope, next);
    draftRef.current = next;
    setDraft(next);
    setSaveError(null);
  };
  const edit = (change: Partial<Draft>) => {
    if (busy.current) return;
    try {
      const previous = draftRef.current;
      const next = changedDraft(previous, { ...previous, ...change });
      commit(next);
      discardPhotos(previous.photos.filter((photo) => !next.photos.some((saved) => saved.key === photo.key)));
    }
    catch { setSaveError('초안을 저장하지 못했어요. 다시 시도해 주세요.'); }
  };
  const setText = (value: string) => edit({ text: value });
  const setVisibility = (value: Draft['visibility']) => edit({ visibility: value });
  const setPhotos = (fn: (photos: Photo[]) => Photo[]) => edit({ photos: fn(draftRef.current.photos) });

  useEffect(() => {
    if (!scope || !imageUri || imageAdded.current) return;
    if (photos.some((photo) => photo.sourceUri === imageUri)) { imageAdded.current = true; return; }
    if (photos.length >= POST_PHOTO_MAX) { setSaveError('사진은 최대 10장이에요. 요약 이미지를 넣으려면 한 장을 삭제해 주세요.'); return; }
    try {
      const photo = keepPhoto({ uri: imageUri, name: 'summary.png', type: 'image/png' }, Crypto.randomUUID());
      commit(changedDraft(draftRef.current, { ...draftRef.current, photos: [photo, ...photos] }));
      imageAdded.current = true;
    } catch { setSaveError('요약 이미지를 보존하지 못했어요. 다시 열어 주세요.'); }
  }, [scope, imageUri, photos.length]);

  // 썸네일이 순간이동하지 않게 줄 재배치를 짧게 잇는다
  const animateRow = () => {
    if (!reduce) LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
  };

  const updatePhoto = (key: string, patch: Partial<Photo>) =>
    commit({ ...draftRef.current, photos: draftRef.current.photos.map((p) => (p.key === key ? { ...p, ...patch } : p)) });

  const addPhotos = async () => {
    const remaining = POST_PHOTO_MAX - photos.length;
    if (remaining <= 0) return;
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: true,
        selectionLimit: remaining,
        quality: 0.8,
      });
      if (result.canceled) return;
      const added = result.assets.slice(0, remaining).map((a) => keepPhoto({
        uri: a.uri,
        name: a.fileName ?? 'photo.jpg',
        type: a.mimeType ?? 'image/jpeg',
      }, Crypto.randomUUID()));
      setPhotos((prev) => [...prev, ...added].slice(0, POST_PHOTO_MAX));
    } catch { setSaveError('사진을 보존하지 못했어요. 다시 선택해 주세요.'); }
  };

  const upload = async (photo: Photo): Promise<string | null> => {
    try {
      const body = new FormData();
      body.append('mediaId', photo.key);
      body.append('purpose', 'POST');
      body.append('file', await mediaFile(photo.uri));
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
    if (busy.current || offline || !scope || !canPost({ text, photoCount: photos.length })) return;
    busy.current = true;
    setPosting(true);
    setPostFailed(false);
    setSelected(null);
    let left = false;
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
      const requestId = draftRef.current.requestId ?? Crypto.randomUUID();
      commit({ ...draftRef.current, requestId });
      await api.mutate('POST /crew/posts', { id: requestId, text: text.trim(), visibility, mediaIds });
      const publishedPhotos = draftRef.current.photos;
      // 닫히는 전환 중에 이 화면을 다시 그리면 Fabric Android 가 addViewAt 에서 죽는다. 비운 초안은 파일에만 남긴다
      saveDraft(scope, emptyDraft());
      draftRef.current = emptyDraft();
      discardPhotos(publishedPhotos);
      left = true;
      router.dismissTo({ pathname: '/(tabs)/feed', params: { flash: '게시물을 올렸어요' } });
    } catch (e) {
      if (e instanceof ApiError && e.code === 'NO_CREW') {
        const response = await api.get('GET /users/me').catch(() => null);
        if (response) return router.replace(resolveDestination(response.data));
      }
      setPostFailed(true);
    } finally {
      if (!left) {
        busy.current = false;
        setPosting(false);
      }
    }
  };

  const retryPhoto = async (photo: Photo) => {
    if (busy.current || offline) return;
    busy.current = true;
    setPosting(true);
    try { await upload(photo); }
    catch { setSaveError('사진 업로드 결과를 보존하지 못했어요. 다시 시도해 주세요.'); }
    finally { busy.current = false; setPosting(false); }
  };

  const allowed = !!scope && !offline && canPost({ text, photoCount: photos.length });
  const atMax = text.length >= POST_TEXT_MAX;

  if (!scope) return <Screen><AppHeader title="게시물 작성" onBack={() => router.back()} />{loadFailed ? <ErrorState onRetry={initialize} /> : <Loading label="초안을 불러오는 중" />}</Screen>;

  return (
    <Screen>
      <AppHeader title="게시물 작성" onBack={() => router.back()} backDisabled={posting} />
      {offline ? <Banner tone="warn">인터넷 연결을 확인해 주세요.</Banner> : null}
      {saveError ? <Banner tone="danger">{saveError}</Banner> : null}
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
                  // 옆 썸네일이 삭제 버튼 자리로 위에 둔 여백만큼 내려 윗선을 맞춘다
                  marginTop: space.md,
                  borderRadius: radius.tile,
                  borderWidth: borderWidth.hairline,
                  borderColor: colors.borderDotted,
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
              // 삭제 버튼이 썸네일 밖으로 걸치면 안드로이드는 그 부분의 터치를 받지 않는다. 여백을 둬 버튼을 안에 넣는다
              <View key={p.key} style={{ width: THUMB + space.md, height: THUMB + space.md, paddingTop: space.md, paddingRight: space.md }}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={i === 0 ? `대표 사진, ${i + 1}번째` : `${i + 1}번째 사진, 순서 선택`}
                  accessibilityState={{ selected: selected === i }}
                  disabled={posting}
                  android_ripple={ripple}
                  onPress={() => setSelected(selected === i ? null : i)}
                  style={{
                    flex: 1,
                    borderRadius: radius.tile,
                    overflow: 'hidden',
                    borderWidth: selected === i ? borderWidth.focus : 0,
                    borderColor: colors.deep,
                  }}
                >
                  <Thumb uri={p.uri} size="md" />
                  {i === 0 ? (
                    <Badge label="대표" tone="deep" style={{ position: 'absolute', left: space.xs, bottom: space.xs }} />
                  ) : null}
                  {posting && p.mediaId == null && !p.failed ? (
                    <View style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface85 }}>
                      <Spinner />
                    </View>
                  ) : null}
                </Pressable>
                {p.failed && !posting ? (
                  <View style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center' }}>
                    <IconButton icon="alert-circle" label="업로드 실패, 다시 시도하려면 두 번 탭" tone="surface" disabled={offline} onPress={() => retryPhoto(p)} />
                  </View>
                ) : null}
                <View style={{ position: 'absolute', top: 0, right: 0, zIndex: 1 }}>
                  <IconButton
                    icon="close"
                    label={`${i + 1}번째 사진 삭제`}
                    tone="surface"
                    disabled={posting}
                    onPress={() => {
                      animateRow();
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
                label="앞으로 옮기기"
                variant="ghost"
                size="sm"
                icon="arrow-left"
                accessibilityLabel={`${selected + 1}번째 사진 앞으로 이동`}
                disabled={selected === 0}
                onPress={() => {
                  animateRow();
                  setPhotos((prev) => [...movePhoto(prev, selected, -1)]);
                  setSelected(selected - 1);
                }}
              />
              <Button
                label="뒤로 옮기기"
                variant="ghost"
                size="sm"
                icon="arrow-right"
                accessibilityLabel={`${selected + 1}번째 사진 뒤로 이동`}
                disabled={selected === photos.length - 1}
                onPress={() => {
                  animateRow();
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
