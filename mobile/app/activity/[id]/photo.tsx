// 화면 4-4 · docs/screens/4-4-take-photo.md
import * as Crypto from 'expo-crypto';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Linking from 'expo-linking';
import { useNetworkState } from 'expo-network';
import { router, useFocusEffect, useLocalSearchParams, useNavigation } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Image, ScrollView, View } from 'react-native';
import {
  Banner,
  Button,
  CaptureButton,
  EmptyState,
  Loading,
  Icon,
  IconButton,
  Progress,
  Screen,
  Snackbar,
  Tile,
  Txt,
  borderWidth,
  radius,
  size,
  space,
  useTheme,
} from 'design-system/src';
import { ApiError, createMockClient, type ApiClient } from '../../../src/api/client';
import { getStored } from '../../../src/activity/store';

const api: ApiClient = createMockClient({ delayMs: 600 });

type Perm = 'unknown' | 'granted' | 'denied' | 'blocked';
type Shot = { uri: string; takenAt: string; mediaId: string };

export default function TakePhotoScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const navigation = useNavigation();
  const { colors } = useTheme();
  const network = useNetworkState();
  const offline = network.isConnected === false || network.isInternetReachable === false;
  const [permission, requestPermission] = useCameraPermissions();
  const camera = useRef<CameraView>(null);
  const [cameraReady, setCameraReady] = useState(false);
  // 다른 화면에 가 있으면 프리뷰를 내린다 — 카메라 프리뷰는 한 번에 하나만 살 수 있다
  const [focused, setFocused] = useState(true);
  const [shot, setShot] = useState<Shot | null>(null);
  const [shooting, setShooting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [rejected, setRejected] = useState(false);
  const [snackbar, setSnackbar] = useState<{ text: string; retry?: boolean } | null>(null);

  // 한 번 거절했지만 다시 물을 수 있으면 권한 카드를 보여야 한다 — 아직 안 물은 것과 다르다
  const perm: Perm = !permission
    ? 'unknown'
    : permission.granted
      ? 'granted'
      : !permission.canAskAgain
        ? 'blocked'
        : permission.status === 'undetermined'
          ? 'unknown'
          : 'denied';

  // 처음이면 바로 묻는다. 설정에서 돌아오면 훅이 다시 읽는다
  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain && permission.status === 'undetermined') void requestPermission();
  }, [permission, requestPermission]);

  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );

  // 올리는 동안은 나가지 못한다. 미리보기에서 뒤로는 1단계로 돌아간다
  useEffect(
    () =>
      navigation.addListener('beforeRemove', (e) => {
        if (uploading) return e.preventDefault();
        if (shot) {
          e.preventDefault();
          setShot(null);
          setRejected(false);
        }
      }),
    [navigation, uploading, shot],
  );

  const shoot = async () => {
    if (shooting || !camera.current) return;
    setShooting(true);
    try {
      const photo = await camera.current.takePictureAsync({ quality: 0.8, exif: false });
      if (photo?.uri) {
        setShot({ uri: photo.uri, takenAt: new Date().toISOString(), mediaId: Crypto.randomUUID() });
        setRejected(false);
      }
    } catch {
      setSnackbar({ text: '사진을 찍지 못했어요. 다시 시도해 주세요.' });
    } finally {
      setShooting(false);
    }
  };

  const upload = async () => {
    if (!shot || uploading) return;
    setUploading(true);
    setProgress(0);
    const here = getStored().session?.here;
    try {
      // ponytail: 목은 진행률이 없다. 실 업로드는 보낸 바이트 비율로 바꾼다
      setProgress(0.4);
      const res = await api.mutate('POST /media', {
        mediaId: shot.mediaId,
        file: shot.uri,
        purpose: 'ACTIVITY',
        activityId: id,
        takenAt: shot.takenAt,
        ...(here ? { lat: here.latitude, lng: here.longitude } : {}),
      });
      setProgress(1);
      setUploading(false);
      router.push({ pathname: '/activity/[id]/review', params: { id, media: JSON.stringify(res.data), localUri: shot.uri } });
      setShot(null);
    } catch (e) {
      setUploading(false);
      const code = e instanceof ApiError ? e.code : null;
      if (code === 'VALIDATION') {
        setRejected(true);
        setSnackbar({ text: '이 사진은 올릴 수 없어요. 다시 찍어 주세요.' });
      } else if (code === 'NOT_FOUND') {
        router.back();
      } else {
        setSnackbar({ text: '사진을 올리지 못했어요', retry: true });
      }
    }
  };

  const quickPickup = () => router.dismissTo({ pathname: '/activity/[id]', params: { id, quick: '1' } });

  const frameInside =
    perm === 'denied' || perm === 'blocked' ? (
      <View accessibilityLiveRegion="polite" style={{ flex: 1, justifyContent: 'center' }}>
        <EmptyState
          icon="camera-outline"
          title="카메라 권한이 필요해요"
          description={
            perm === 'blocked'
              ? '쓰레기 촬영과 AI 분류에 카메라를 사용해요. 설정에서 카메라 권한을 허용해 주세요.'
              : '쓰레기 촬영과 AI 분류에 카메라를 사용해요.'
          }
          actionLabel={perm === 'blocked' ? '설정으로 이동' : '카메라 권한 허용'}
          onAction={() => (perm === 'blocked' ? void Linking.openSettings() : void requestPermission())}
        />
      </View>
    ) : shot ? (
      <View style={{ flex: 1 }}>
        <Image source={{ uri: shot.uri }} style={{ flex: 1 }} resizeMode="cover" accessible accessibilityRole="image" accessibilityLabel="방금 찍은 사진" />
        {uploading ? (
          <View style={{ position: 'absolute', left: space.lg, right: space.lg, bottom: space.lg, gap: space.xs }} accessibilityLiveRegion="polite">
            <Progress value={progress} label={`올리는 중, ${Math.round(progress * 100)}%`} />
            <Txt variant="caption" tone="onPhoto" accessibilityLabel="사진을 올리고 있어요">올리는 중</Txt>
          </View>
        ) : null}
      </View>
    ) : (
      <View style={{ flex: 1 }} accessible accessibilityRole="image" accessibilityLabel="카메라 미리보기, 쓰레기를 화면 중앙에 놓아 주세요">
        {perm === 'granted' && focused ? (
          <CameraView ref={camera} facing="back" style={{ flex: 1 }} onCameraReady={() => setCameraReady(true)} />
        ) : null}
        {/* 프리뷰가 밝아도 안내가 읽히게 어두운 막을 얹는다. 사진에는 들어가지 않는다 */}
        <View
          pointerEvents="none"
          style={{ position: 'absolute', inset: 0, backgroundColor: colors.camera.scrim, alignItems: 'center', justifyContent: 'center' }}
        >
          <Corners color={colors.lime} />
          {cameraReady ? (
            <Txt variant="body" bold tone="onPhoto" style={{ textAlign: 'center', paddingHorizontal: space.xl, textShadowColor: colors.inkShadow, textShadowRadius: space.xs }}>
              쓰레기를 화면 중앙에 놓아 주세요
            </Txt>
          ) : (
            <Loading label="카메라 준비 중" />
          )}
        </View>
      </View>
    );

  return (
    <Screen style={{ backgroundColor: colors.camera.bg }}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, gap: space.md, paddingBottom: space.lg }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
          <IconButton icon="arrow-left" label="뒤로" tone="translucent" disabled={uploading} onPress={() => router.back()} />
          <View>
            <Txt variant="title" tone="onPhoto">쓰레기 촬영</Txt>
            <Txt variant="caption" tone="onPhoto">찍으면 AI 가 종류를 찾아요</Txt>
          </View>
        </View>

        {offline ? (
          <Banner tone="warn" action={{ label: '빠른 줍기', onPress: quickPickup }}>
            오프라인에서는 빠른 줍기로 기록해 주세요
          </Banner>
        ) : null}

        <View
          style={{
            flex: 1,
            minHeight: size.captureFrameMin,
            borderRadius: radius.card,
            borderWidth: borderWidth.focus,
            borderStyle: 'dashed',
            borderColor: colors.lime,
            backgroundColor: colors.camera.frame,
            overflow: 'hidden',
          }}
        >
          {frameInside}
        </View>

        <Tile tone="dark" style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
          <Icon name="creation" size={size.iconCard} color={colors.lime} />
          <Txt variant="caption" tone="onPhoto" style={{ flex: 1 }}>
            쓰레기가 겹치지 않게 펼쳐 찍으면 AI 가 더 잘 찾아요.
          </Txt>
        </Tile>

        {shot ? (
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            <View style={{ flex: 1 }}>
              <Button label="다시 찍기" variant="translucent" size="lg" fullWidth disabled={uploading} onPress={() => { setShot(null); setRejected(false); }} />
            </View>
            <View style={{ flex: 1 }}>
              <Button label="사용" size="lg" fullWidth loading={uploading} disabled={uploading || rejected} onPress={upload} />
            </View>
          </View>
        ) : (
          <View style={{ alignItems: 'center' }}>
            <CaptureButton disabled={perm !== 'granted' || !cameraReady || shooting} onPress={shoot} />
          </View>
        )}
      </ScrollView>

      <Snackbar
        visible={snackbar != null}
        message={snackbar?.text ?? ''}
        actionLabel={snackbar?.retry ? '다시 시도' : undefined}
        onAction={snackbar?.retry ? () => { setSnackbar(null); void upload(); } : undefined}
        onDismiss={() => setSnackbar(null)}
      />
    </Screen>
  );
}

/** 네 귀의 ㄱ자 가이드. 장식이라 읽지 않는다 */
function Corners({ color }: { color: string }) {
  const len = size.cornerGuide;
  const w = size.cornerGuideStroke;
  const inset = space.lg;
  const base = { position: 'absolute' as const, width: len, height: len, borderColor: color };
  return (
    <View pointerEvents="none" importantForAccessibility="no-hide-descendants" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
      <View style={{ ...base, top: inset, left: inset, borderTopWidth: w, borderLeftWidth: w }} />
      <View style={{ ...base, top: inset, right: inset, borderTopWidth: w, borderRightWidth: w }} />
      <View style={{ ...base, bottom: inset, left: inset, borderBottomWidth: w, borderLeftWidth: w }} />
      <View style={{ ...base, bottom: inset, right: inset, borderBottomWidth: w, borderRightWidth: w }} />
    </View>
  );
}
