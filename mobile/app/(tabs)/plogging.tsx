import Constants from 'expo-constants';
import { useState } from 'react';
import { Screen, Txt, Banner } from 'design-system/src';
import { KakaoMapView } from '../../modules/kakao-map';

/** 스파이크 확인용 좌표 — 서울시청에서 광화문까지. GAC-28 이 끝나면 실제 활동 경로로 바뀐다. */
const CENTER = { latitude: 37.5665, longitude: 126.978 };
const PATH = [
  { latitude: 37.5665, longitude: 126.978 },
  { latitude: 37.5701, longitude: 126.9768 },
  { latitude: 37.5759, longitude: 126.9769 },
];

export default function PloggingScreen() {
  const appKey = Constants.expoConfig?.extra?.kakaoNativeAppKey ?? '';
  const [status, setStatus] = useState('지도 여는 중');

  if (!appKey) {
    return (
      <Screen>
        <Txt variant="display">줍깅</Txt>
        <Banner tone="warn">
          카카오 네이티브 앱 키가 없다. mobile/.env 의 KAKAO_NATIVE_APP_KEY 를 채운다
        </Banner>
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
        style={{ flex: 1, marginTop: 12 }}
      />
    </Screen>
  );
}
