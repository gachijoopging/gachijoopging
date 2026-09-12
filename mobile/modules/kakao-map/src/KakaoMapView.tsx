import { requireNativeView } from 'expo';
import type { KakaoMapViewProps } from './KakaoMap.types';

const NativeView = requireNativeView<KakaoMapViewProps>('KakaoMap');

export function KakaoMapView(props: KakaoMapViewProps) {
  return <NativeView {...props} />;
}
