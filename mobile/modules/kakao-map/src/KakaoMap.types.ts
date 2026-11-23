export type LatLng = { latitude: number; longitude: number };

/** 크루원처럼 여러 개 찍는 마커. id 로 추가·이동·제거를 가른다 */
export type MapMarker = LatLng & { id: string; label: string; paused: boolean };

export type KakaoMapViewProps = {
  /** 카카오 네이티브 앱 키. 이 값이 와야 SDK 가 초기화되고 지도가 뜬다 */
  appKey: string;
  /** 지도 가운데. 바뀌면 카메라가 그 점으로 옮겨간다. 점을 찍으려면 markers 를 쓴다 */
  center?: LatLng;
  /** 경로 선. 구간마다 따로 긋고 구간 사이는 잇지 않는다. 두 점 미만인 구간은 그리지 않는다 */
  segments?: LatLng[][];
  /** 내 위치 점과 오차 반경(m) 원. null 이면 지운다 */
  myLocation?: (LatLng & { accuracy: number | null }) | null;
  markers?: MapMarker[];
  /** 카메라를 옮길 때 이어서 움직인다. 모션 줄이기면 false. 첫 배치는 항상 바로 */
  animateCamera?: boolean;
  onMapReady?: () => void;
  onMapError?: (event: { nativeEvent: { message: string } }) => void;
  onMarkerPress?: (event: { nativeEvent: { id: string } }) => void;
  /** 사용자가 손으로 지도를 옮기거나 확대했다. 코드가 옮긴 카메라에는 오지 않는다 */
  onUserGesture?: () => void;
  style?: object;
};
