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
