import Constants from 'expo-constants';
import { useState } from 'react';
import { Screen, Txt, Banner, Button, space } from 'design-system/src';
import { KakaoMapView } from '../../modules/kakao-map';
import { useLocationGate } from '../../src/auth/useLocationGate';

/** 스파이크 확인용 좌표 — 서울시청에서 광화문까지. GAC-28 이 끝나면 실제 활동 경로로 바뀐다. */
const CENTER = { latitude: 37.5665, longitude: 126.978 };
const PATH = [
  { latitude: 37.5665, longitude: 126.978 },
  { latitude: 37.5701, longitude: 126.9768 },
  { latitude: 37.5759, longitude: 126.9769 },
];

export default function PloggingScreen() {
  const appKey = Constants.expoConfig?.extra?.kakaoNativeAppKey ?? '';
  const [status, setStatus] = useState(appKey ? '지도 여는 중' : '');
  const requireLocation = useLocationGate();
  // ponytail: 4-2 시작 시트는 GAC-43. 그전까지는 위치 확인을 통과했다는 것만 보인다
  const startPlogging = () => requireLocation(() => setStatus('위치 확인 완료 — 4-2 시작 시트 자리'));

  if (!appKey) {
    return (
      <Screen>
        <Txt variant="display">줍깅</Txt>
        <Banner tone="warn">
          카카오 네이티브 앱 키가 없다. mobile/.env 의 KAKAO_NATIVE_APP_KEY 를 채운다
        </Banner>
        <Txt variant="caption" tone="muted">{status}</Txt>
        <Button label="줍깅 시작" size="lg" fullWidth onPress={startPlogging} />
      </Screen>
    );
  }

  return (
    <Screen>
      <Txt variant="display">줍깅</Txt>
      <Txt variant="caption" tone="muted">
        화면 4-1 — 지도 스파이크: {status}
      </Txt>
      <KakaoMapView
        appKey={appKey}
        center={CENTER}
        path={PATH}
        onMapReady={() => setStatus('지도 떴다')}
        onMapError={(e) => setStatus(`실패: ${e.nativeEvent.message}`)}
        style={{ flex: 1, marginTop: space.md }}
      />
      <Button label="줍깅 시작" size="lg" fullWidth onPress={startPlogging} />
    </Screen>
  );
}
