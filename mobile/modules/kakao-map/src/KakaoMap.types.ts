export type LatLng = { latitude: number; longitude: number };

/** 크루원처럼 여러 개 찍는 마커. id 로 추가·이동·제거를 가른다 */
export type MapMarker = LatLng & { id: string; label: string; paused: boolean };

export type KakaoMapViewProps = {
  /** 카카오 네이티브 앱 키. 이 값이 와야 SDK 가 초기화되고 지도가 뜬다 */
  appKey: string;
  /** 지도 가운데. 바뀌면 카메라가 그 점으로 옮겨간다. 점을 찍으려면 markers 를 쓴다 */
  center?: LatLng;
  /** 경로 선. 두 점 미만이면 그리지 않는다 */
  path?: LatLng[];
  markers?: MapMarker[];
  onMapReady?: () => void;
  onMapError?: (event: { nativeEvent: { message: string } }) => void;
  onMarkerPress?: (event: { nativeEvent: { id: string } }) => void;
  style?: object;
};
