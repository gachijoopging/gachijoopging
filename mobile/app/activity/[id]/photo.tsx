// 화면 4-4 · docs/screens/4-4-take-photo.md
import { mediaFile } from '../../../src/api/media';
import * as Crypto from 'expo-crypto';
import { AndroidHaptics, performAndroidHapticsAsync } from 'expo-haptics';
import { CameraView, Camera } from 'expo-camera';
import * as Linking from 'expo-linking';
import { useNetworkState } from 'expo-network';
import { StatusBar } from 'expo-status-bar';
import { router, useFocusEffect, useLocalSearchParams, useNavigation } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, AppState, Image, ScrollView, View } from 'react-native';
import {
  Banner,
  Button,
  CaptureButton,
  EmptyState,
  ErrorState,
  Loading,
  Icon,
  IconButton,
  Progress,
  Screen,
  Snackbar,
  Tile,
  Txt,
  borderWidth,
  motion,
  radius,
  size,
  space,
  useReduceMotion,
  useTheme,
} from 'design-system/src';
import { ApiError, type ApiClient } from '../../../src/api/client';
import { createApiClient } from '../../../src/api/config';
import { getStored } from '../../../src/activity/store';

const api: ApiClient = createApiClient({ delayMs: 600 });

type Perm = 'unknown' | 'granted' | 'denied' | 'blocked';
type Shot = { uri: string; takenAt: string; mediaId: string; location: { lat: number; lng: number } | null };
const shots = new Map<string, Shot>();

export default function TakePhotoScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const navigation = useNavigation();
  const { colors } = useTheme();
  const reduceMotion = useReduceMotion();
  const network = useNetworkState();
  const offline = network.isConnected === false || network.isInternetReachable === false;
  const [perm, setPerm] = useState<Perm>('unknown');
  const [shot, setShot] = useState<Shot | null>(() => shots.get(id) ?? null);
  const [shooting, setShooting] = useState(false);
  const [flashing, setFlashing] = useState(false);
  const flash = useRef(new Animated.Value(0)).current;
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const camera = useRef<CameraView>(null);
  const leaving = useRef(false);
  const [ready, setReady] = useState(false);
  const [cameraFailed, setCameraFailed] = useState(false);
  const [focused, setFocused] = useState(false);
  const [appActive, setAppActive] = useState(AppState.currentState === 'active');
  useEffect(() => {
    const listener = AppState.addEventListener('change', (state) => setAppActive(state === 'active'));
    return () => listener.remove();
  }, []);
  useFocusEffect(useCallback(() => {
    setFocused(true);
    return () => { setFocused(false); setReady(false); };
  }, []));
  const [rejected, setRejected] = useState(false);
  const [snackbar, setSnackbar] = useState<{ text: string; retry?: boolean } | null>(null);
  useEffect(() => {
    if (shot) shots.set(id, shot);
    else shots.delete(id);
  }, [id, shot]);

  const readPerm = useCallback(async (ask: boolean) => {
    const p = ask ? await Camera.requestCameraPermissionsAsync() : await Camera.getCameraPermissionsAsync();
    setPerm(p.granted ? 'granted' : !p.canAskAgain ? 'blocked' : p.status === 'undetermined' ? 'unknown' : 'denied');
    return p;
  }, []);

  // 설정 앱에서 허용하고 돌아오면(appActive) 다시 읽어야 권한 카드가 사라진다
  useFocusEffect(
    useCallback(() => {
      if (!appActive) return;
      void (async () => {
        const p = await readPerm(false);
        if (!p.granted && p.canAskAgain && p.status === 'undetermined') await readPerm(true);
      })();
    }, [readPerm, appActive]),
  );

  useEffect(
    () =>
      navigation.addListener('beforeRemove', (e) => {
        if (leaving.current) return;
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
    // 진동 끄기 설정을 따르는 시스템 햅틱이다. 지원하지 않는 기기에서는 조용히 넘어간다
    performAndroidHapticsAsync(AndroidHaptics.Context_Click).catch(() => {});
    // 실기기는 찍는 데 1초 가까이 걸린다. 번쩍임은 찍기가 끝나길 기다리지 않고 바로 걷힌다
    if (!reduceMotion) {
      flash.setValue(1);
      setFlashing(true);
      Animated.spring(flash, { toValue: 0, ...motion.settle, useNativeDriver: true }).start(() => setFlashing(false));
    }
    try {
      const here = getStored().session?.here;
      const takenAt = new Date().toISOString();
      const res = await camera.current?.takePictureAsync({ quality: 0.8, exif: false });
      if (res) {
        const next = { uri: res.uri, takenAt, mediaId: Crypto.randomUUID(), location: here ? { lat: here.latitude, lng: here.longitude } : null };
        setShot(next);
        setRejected(false);
        setShooting(false);
        // 고르는 단계 없이 바로 올린다. 잘못 찍었으면 4-5 의 다시 촬영이 받는다
        void upload(next);
        return;
      }
    } catch {
      setSnackbar({ text: '사진을 찍지 못했어요. 다시 시도해 주세요.' });
    }
    setShooting(false);
  };

  const upload = async (shot: Shot | null) => {
    if (!shot || uploading) return;
    setUploading(true);
    setProgress(0);
    try {
      // ponytail: 목은 진행률이 없다. 실 업로드는 보낸 바이트 비율로 바꾼다
      setProgress(0.4);
      const body = new FormData();
      body.append('mediaId', shot.mediaId);
      body.append('file', await mediaFile(shot.uri) as unknown as Blob);
      body.append('purpose', 'ACTIVITY');
      body.append('activityId', id);
      body.append('takenAt', shot.takenAt);
      if (shot.location) {
        body.append('lat', String(shot.location.lat));
        body.append('lng', String(shot.location.lng));
      }
      const res = await api.mutate('POST /media', body);
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
        leaving.current = true;
        router.dismissTo({ pathname: '/activity/[id]', params: { id, flash: '활동이 끝나 사진을 담을 수 없어요' } });
      } else {
        setSnackbar({ text: '사진을 올리지 못했어요', retry: true });
      }
    }
  };

  const quickPickup = () => {
    leaving.current = true;
    router.dismissTo({ pathname: '/activity/[id]', params: { id, quick: '1' } });
  };

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
          onAction={() => (perm === 'blocked' ? void Linking.openSettings() : void readPerm(true))}
        />
      </View>
    ) : cameraFailed ? (
      <View style={{ flex: 1, justifyContent: 'center' }}>
        <ErrorState title="카메라를 열 수 없어요" description="다른 앱이 카메라를 쓰고 있지 않은지 확인하고 다시 시도해 주세요." onRetry={() => setCameraFailed(false)} />
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
        {perm === 'granted' && focused && appActive ? (
          <CameraView ref={camera} facing="back" style={{ flex: 1 }} onCameraReady={() => setReady(true)} onMountError={() => setCameraFailed(true)} />
        ) : null}
        {/* 찍힌 순간을 눈으로도 알린다. 미리보기 위에 얹는 막이라 사진에는 들어가지 않는다 */}
        {flashing ? (
          <Animated.View testID="shutter-flash" pointerEvents="none" style={{ position: 'absolute', inset: 0, backgroundColor: colors.white, opacity: flash }} />
        ) : null}
        {/* 프리뷰가 밝아도 안내가 읽히게 어두운 막을 얹는다. 사진에는 들어가지 않는다 */}
        <View
          pointerEvents="none"
          style={{ position: 'absolute', inset: 0, backgroundColor: colors.camera.scrim, alignItems: 'center', justifyContent: 'center' }}
        >
          <Corners color={colors.lime} />
          {ready ? (
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
      {/* 카메라 배경은 테마와 무관하게 어둡다. 위에 다른 화면이 올라오면 거둬 그 화면이 테마를 따르게 한다 */}
      {focused ? <StatusBar style="light" /> : null}
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

        {shot && !uploading ? (
          // 올리지 못한 사진만 여기 남는다. 같은 mediaId 로 다시 올려 서버가 중복을 거른다
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            <View style={{ flex: 1 }}>
              <Button label="다시 찍기" variant="translucent" size="lg" fullWidth onPress={() => { setShot(null); setRejected(false); }} />
            </View>
            {rejected ? null : (
              <View style={{ flex: 1 }}>
                <Button label="다시 올리기" size="lg" fullWidth disabled={offline} onPress={() => void upload(shot)} />
              </View>
            )}
          </View>
        ) : shot ? null : (
          <View style={{ alignItems: 'center' }}>
            <CaptureButton disabled={perm !== 'granted' || !ready || shooting || offline} onPress={shoot} />
          </View>
        )}
      </ScrollView>

      <Snackbar
        visible={snackbar != null}
        message={snackbar?.text ?? ''}
        actionLabel={snackbar?.retry ? '다시 시도' : undefined}
        onAction={snackbar?.retry ? () => { setSnackbar(null); void upload(shot); } : undefined}
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
