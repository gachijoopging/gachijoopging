export type LatLng = { latitude: number; longitude: number };

export type KakaoMapViewProps = {
  /** 카카오 네이티브 앱 키. 이 값이 와야 SDK 가 초기화되고 지도가 뜬다 */
  appKey: string;
  /** 지도 가운데. 바뀌면 카메라가 그 점으로 옮겨가고 마커를 찍는다 */
  center?: LatLng;
  /** 경로 선. 두 점 미만이면 그리지 않는다 */
  path?: LatLng[];
  onMapReady?: () => void;
  onMapError?: (event: { nativeEvent: { message: string } }) => void;
  style?: object;
};
