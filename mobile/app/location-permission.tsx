// 화면 1-10 · docs/screens/1-10-location-permission.md
import { useCallback, useRef, useState } from 'react';
import { AppState, Linking, PermissionsAndroid, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { AppHeader, Banner, Button, Screen, Txt } from 'design-system/src';
import { getPermissionMode, requestPreciseLocation, type PermissionMode } from '../src/auth/location-permission';
import { usePreventBack } from '../src/auth/usePreventBack';

export default function LocationPermissionScreen() {
  const [mode, setMode] = useState<PermissionMode>('loading');
  const [loading, setLoading] = useState(false);
  const [banner, setBanner] = useState<string>();
  const busy = useRef(false);
  const left = useRef(false);
  usePreventBack(loading);

  function close() {
    if (left.current) return;
    left.current = true;
    router.back();
  }

  async function refreshPermission() {
    if (busy.current || left.current) return;
    try {
      const nextMode = await getPermissionMode();
      setMode((current) => current === 'settings' && nextMode !== 'granted' ? current : nextMode);
      if (nextMode === 'granted') close();
    } catch {
      setBanner('기기 설정 > 앱 > 가치줍깅 > 권한에서 위치를 켜 주세요.');
      setMode('settings');
    }
  }

  useFocusEffect(useCallback(() => {
    left.current = false;
    void refreshPermission();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refreshPermission();
    });
    return () => { left.current = true; subscription.remove(); };
  }, []));

  async function handlePermission() {
    if (busy.current) return;
    if (mode === 'settings') {
      try {
        await Linking.openSettings();
      } catch {
        setBanner('기기 설정 > 앱 > 가치줍깅 > 권한에서 위치를 켜 주세요.');
      }
      return;
    }

    busy.current = true;
    setLoading(true);
    setBanner(undefined);
    try {
      const result = await requestPreciseLocation();
      if (result === PermissionsAndroid.RESULTS.GRANTED) {
        close();
      } else if (result === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN) {
        setMode('settings');
      } else {
        setMode(await getPermissionMode());
      }
    } catch {
      setBanner('기기 설정 > 앱 > 가치줍깅 > 권한에서 위치를 켜 주세요.');
      setMode('settings');
    } finally {
      busy.current = false;
      // 닫히는 화면을 다시 그리면 Fabric 이 떼어 내던 뷰를 다시 붙이려다 죽는다
      if (!left.current) setLoading(false);
    }
  }

  const isSettings = mode === 'settings';

  return (
    <Screen scroll>
      <AppHeader title="위치 권한" onBack={() => router.back()} backDisabled={loading} />
      <View style={{ alignItems: 'center' }}>
        <Txt variant="title" bold>위치 권한이 필요해요</Txt>
      </View>
      <Txt variant="body">활동 경로와 거리를 기록하는 데 써요. 위치 공유를 켜면 크루원에게 내 위치를 보여 줘요. 다른 탭은 지금도 이용할 수 있어요.</Txt>
      {mode === 'approximate' ? <Banner tone="warn">활동 경로를 기록하려면 정확한 위치가 필요해요.</Banner> : null}
      {isSettings ? <Banner tone="warn">설정에서 위치 권한을 켜 주세요.</Banner> : null}
      {banner ? <Banner tone="danger">{banner}</Banner> : null}
      <Button
        label={isSettings ? '설정으로 이동' : '위치 권한 허용'}
        variant="primary"
        size="lg"
        fullWidth
        loading={loading || mode === 'loading'}
        disabled={mode === 'loading'}
        onPress={handlePermission}
        accessibilityLabel={isSettings ? '설정으로 이동, 기기 설정 앱이 열립니다' : '위치 권한 허용'}
      />
      <Button label="나중에" variant="ghost" size="lg" fullWidth disabled={loading} onPress={() => router.back()} accessibilityLabel="나중에, 활동 시작을 보류합니다" />
    </Screen>
  );
}
