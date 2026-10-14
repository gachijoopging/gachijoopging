// 화면 5-8 · docs/screens/5-8-edit-profile.md
import { mediaFile } from '../../src/api/media';
import * as Crypto from 'expo-crypto';
import * as ImagePicker from 'expo-image-picker';
import { router, useNavigation } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Linking, Pressable, View, type TextInput } from 'react-native';
import {
  AppHeader,
  Avatar,
  Banner,
  BottomSheet,
  Button,
  Dialog,
  ErrorState,
  Field,
  ListRow,
  Loading,
  Screen,
  Snackbar,
  Txt,
  pressedOpacity,
  radius,
  space,
  useRipple,
} from 'design-system/src';
import { ApiError, type ApiClient } from '../../src/api/client';
import { createApiClient } from '../../src/api/config';
import { normalizeNickname, validateNickname } from '../../src/auth/validators';
import { usePreventBack } from '../../src/auth/usePreventBack';
import { INTRO_MAX, NICKNAME_MAX, profileChanges, profilePatch } from '../../src/profile/profile';

type Original = { nickname: string; intro: string; photoUrl: string | null };
/** 새로 고른 사진. mediaId 는 올린 뒤에만 생기고, 저장이 실패해도 들고 있다가 다시 올리지 않는다 */
type Picked = { uri: string; name: string; type: string; uploadId: string; mediaId: string | null };

const api: ApiClient = createApiClient({ delayMs: 300 });

export default function EditProfileScreen() {
  const navigation = useNavigation();
  const ripple = useRipple();
  const [original, setOriginal] = useState<Original | null>(null);
  const [failed, setFailed] = useState(false);
  const [nickname, setNickname] = useState('');
  const [intro, setIntro] = useState('');
  const [picked, setPicked] = useState<Picked | null>(null);
  const [photoRemoved, setPhotoRemoved] = useState(false);
  const [nickTouched, setNickTouched] = useState(false);
  const [nickServerError, setNickServerError] = useState<string>();
  const [introError, setIntroError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const [photoSheet, setPhotoSheet] = useState(false);
  const [cameraDenied, setCameraDenied] = useState(false);
  const [pendingLeave, setPendingLeave] = useState<(() => void) | null>(null);
  const [snackbar, setSnackbar] = useState<string | null>(null);
  const saved = useRef(false);
  const busy = useRef(false);
  const introRef = useRef<TextInput>(null);
  usePreventBack(saving);

  const load = async () => {
    setFailed(false);
    try {
      const { data } = await api.get('GET /users/me');
      const next = { nickname: data.nickname ?? '', intro: data.intro ?? '', photoUrl: data.photoUrl };
      setOriginal(next);
      setNickname(next.nickname);
      setIntro(next.intro);
    } catch {
      setFailed(true);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  // 사진은 저장할 때 올리므로 폼에서는 "바뀜" 표시만 한다
  const photoMediaId = picked ? (picked.mediaId ?? 'pending') : photoRemoved ? null : undefined;
  const form = { nickname, intro, photoMediaId };
  const canSave = !!original && profilePatch(original, form) != null;
  const dirty = !!original && Object.keys(profileChanges(original, form)).length > 0;

  useEffect(
    () =>
      navigation.addListener('beforeRemove', (e) => {
        if (saved.current || !dirty) return;
        e.preventDefault();
        if (busy.current) return;
        setPendingLeave(() => () => navigation.dispatch(e.data.action));
      }),
    [navigation, dirty],
  );

  const save = async () => {
    // 같은 프레임의 연속 탭은 saving 상태가 반영되기 전이라 ref 로 막는다
    if (busy.current || !original || !canSave) return;
    busy.current = true;
    setSaving(true);
    let mediaId = picked?.mediaId ?? null;
    try {
      if (picked && !mediaId) {
        try {
          const body = new FormData();
          body.append('mediaId', picked.uploadId);
          body.append('purpose', 'PROFILE');
          body.append('file', await mediaFile(picked.uri) as unknown as Blob);
          const { data } = await api.mutate('POST /media', body);
          mediaId = data.mediaId;
          setPicked({ ...picked, mediaId });
        } catch {
          setSnackbar('사진을 올리지 못했어요. 다시 시도해 주세요.');
          return;
        }
      }
      const patch = profilePatch(original, { nickname, intro, photoMediaId: picked ? mediaId : photoRemoved ? null : undefined });
      if (!patch) return;
      try {
        await api.mutate('PATCH /users/me', patch);
        saved.current = true;
        router.dismissTo({ pathname: '/(tabs)/profile', params: { flash: '프로필을 저장했어요.' } });
      } catch (e) {
        if (e instanceof ApiError && e.code === 'NICKNAME_TAKEN') setNickServerError('이미 사용 중인 닉네임이에요. 다른 이름을 입력해 주세요.');
        else if (e instanceof ApiError && e.code === 'VALIDATION') {
          const fields = e.fields?.map((f) => f.field) ?? [];
          if (fields.includes('intro')) setIntroError('소개는 200자 이내로 입력해 주세요.');
          if (fields.includes('nickname') || fields.length === 0) setNickServerError('닉네임은 2자에서 12자여야 해요.');
        } else setSnackbar('저장하지 못했어요. 다시 시도해 주세요.');
      }
    } finally {
      // 떠나는 화면은 다시 그리지 않는다. 전환 중 재렌더가 Fabric 을 죽인다
      if (!saved.current) {
        busy.current = false;
        setSaving(false);
      }
    }
  };

  const pick = async (source: 'camera' | 'library') => {
    setPhotoSheet(false);
    if (source === 'camera') {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) return setCameraDenied(!permission.canAskAgain);
    }
    setCameraDenied(false);
    // 사진 선택은 OS 사진 선택기라 앨범 전체 권한을 묻지 않는다
    const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.8 };
    const result = source === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
    const asset = result.canceled ? null : result.assets[0];
    if (asset) setPicked({ uri: asset.uri, name: asset.fileName ?? 'profile.jpg', type: asset.mimeType ?? 'image/jpeg', uploadId: Crypto.randomUUID(), mediaId: null });
  };

  const photoUri = picked?.uri ?? (photoRemoved ? undefined : original?.photoUrl ?? undefined);
  const nickLength = normalizeNickname(nickname).length;
  const nickError = nickServerError ?? (nickTouched ? validateNickname(nickname) : undefined);

  return (
    <Screen scroll contentStyle={{ flexGrow: 1 }}>
      <AppHeader title="프로필 수정" onBack={() => router.back()} backDisabled={saving} />

      {!original ? (
        failed ? <ErrorState title="내 정보를 불러오지 못했어요" onRetry={load} /> : <Loading label="내 정보를 불러오고 있어요" />
      ) : (
        <>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="프로필 사진, 사진 변경"
            android_ripple={ripple}
            disabled={saving}
            onPress={() => setPhotoSheet(true)}
            style={({ pressed }) => ({ alignSelf: 'center', alignItems: 'center', gap: space.sm, borderRadius: radius.card, padding: space.sm, opacity: pressedOpacity(pressed) })}
          >
            <Avatar name={normalizeNickname(nickname) || original.nickname} uri={photoUri} size="xl" />
            <Txt variant="caption" bold>사진 변경</Txt>
          </Pressable>
          {cameraDenied ? (
            <Banner tone="warn" action={{ label: '설정으로 이동', onPress: () => void Linking.openSettings() }}>
              카메라 권한을 허용해 주세요.
            </Banner>
          ) : null}

          <View style={{ gap: space.xs }}>
            <Field
              label="닉네임"
              accessibilityLabel="닉네임, 2자에서 12자"
              value={nickname}
              onChangeText={(v) => {
                setNickname(v);
                setNickServerError(undefined);
              }}
              onBlur={() => setNickTouched(true)}
              error={nickError}
              maxLength={NICKNAME_MAX}
              editable={!saving}
              returnKeyType="next"
              submitBehavior="submit"
              onSubmitEditing={() => introRef.current?.focus()}
            />
            <Txt variant="micro" tone="muted" accessibilityLabel={`${nickLength}자, ${NICKNAME_MAX}자 중`} style={{ alignSelf: 'flex-end' }}>
              {nickLength}/{NICKNAME_MAX}
            </Txt>
          </View>

          <View style={{ gap: space.xs }}>
            <Field
              ref={introRef}
              label="소개"
              accessibilityLabel="소개, 최대 200자"
              placeholder="크루원에게 나를 소개해 보세요"
              value={intro}
              onChangeText={(v) => {
                setIntro(v);
                setIntroError(undefined);
              }}
              error={introError}
              multiline
              maxLength={INTRO_MAX}
              editable={!saving}
            />
            <Txt variant="micro" tone="muted" accessibilityLabel={`${intro.length}자, ${INTRO_MAX}자 중`} style={{ alignSelf: 'flex-end' }}>
              {intro.length}/{INTRO_MAX}
            </Txt>
          </View>

          <View style={{ flex: 1 }} />
          <Button
            label="저장"
            size="lg"
            fullWidth
            loading={saving}
            accessibilityLabel={saving ? '저장 중' : '저장'}
            disabled={!canSave}
            onPress={save}
          />
        </>
      )}

      <BottomSheet visible={photoSheet} onClose={() => setPhotoSheet(false)} title="프로필 사진 변경">
        <ListRow icon="camera-outline" title="카메라로 촬영" onPress={() => void pick('camera')} />
        <ListRow icon="image-outline" title="앨범에서 선택" onPress={() => void pick('library')} />
        {photoUri ? (
          <ListRow
            icon="delete-outline"
            title="사진 삭제"
            chevron={false}
            onPress={() => {
              setPicked(null);
              setPhotoRemoved(!!original?.photoUrl);
              setPhotoSheet(false);
            }}
          />
        ) : null}
      </BottomSheet>

      <Dialog visible={pendingLeave != null} onClose={() => setPendingLeave(null)} title="나갈까요?"
        actions={
          <>
            <Button label="계속 수정" variant="ghost" size="md" onPress={() => setPendingLeave(null)} />
            <Button
              label="나가기"
              variant="danger"
              size="md"
              onPress={() => {
                const leave = pendingLeave;
                setPendingLeave(null);
                saved.current = true;
                leave?.();
              }}
            />
          </>
        }
      >
        <Txt variant="body">저장하지 않은 변경사항이 사라져요.</Txt>
      </Dialog>

      <Snackbar visible={snackbar != null} message={snackbar ?? ''} onDismiss={() => setSnackbar(null)} />
    </Screen>
  );
}
