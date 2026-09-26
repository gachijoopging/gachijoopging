import { PermissionsAndroid, Platform } from 'react-native';

export type PermissionMode = 'loading' | 'request' | 'settings' | 'approximate' | 'granted';

export async function requestPreciseLocation() {
  const { ACCESS_FINE_LOCATION, ACCESS_COARSE_LOCATION } = PermissionsAndroid.PERMISSIONS;
  const results = await PermissionsAndroid.requestMultiple([ACCESS_FINE_LOCATION, ACCESS_COARSE_LOCATION]);
  return results[ACCESS_FINE_LOCATION];
}

export async function getPermissionMode(): Promise<PermissionMode> {
  if (Platform.OS !== 'android') return 'request';
  const fineGranted = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
  if (fineGranted) return 'granted';
  const coarseGranted = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION);
  return coarseGranted ? 'approximate' : 'request';
}

/**
 * 활동 시작 직전의 위치 확인. 경로 필터가 정확한 위치를 전제하므로 대략적 위치만으로는 통과시키지 않는다.
 * 없으면 1-10 을 띄우고, 사용자가 허용하고 돌아왔을 때만 멈췄던 시작을 이어 간다 — 나중에·뒤로는 시작하지 않는다.
 */
export function createLocationGate(deps: {
  hasPreciseLocation: () => Promise<boolean>;
  openGuide: () => void;
}) {
  let pending: (() => void) | null = null;
  return {
    async require(onReady: () => void) {
      if (await deps.hasPreciseLocation()) {
        onReady();
        return;
      }
      pending = onReady;
      deps.openGuide();
    },
    async resume() {
      const next = pending;
      if (!next) return;
      pending = null;
      if (await deps.hasPreciseLocation()) next();
    },
  };
}
