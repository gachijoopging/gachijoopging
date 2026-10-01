import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

const mockPermission = jest.fn();
const mockRequest = jest.fn();
jest.mock('expo/src/winter/fetch', () => ({ fetch: jest.fn() }));
jest.mock('expo-camera', () => ({ CameraView: 'CameraView', Camera: { getCameraPermissionsAsync: () => mockPermission(), requestCameraPermissionsAsync: () => mockRequest() } }));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'photo-id' }));
jest.mock('expo-linking', () => ({ openSettings: jest.fn() }));
jest.mock('expo-network', () => ({ useNetworkState: () => ({ isConnected: true }) }));
jest.mock('expo-router', () => ({ router: {}, useLocalSearchParams: () => ({ id: 'a1' }), useNavigation: () => ({ addListener: () => () => {} }), useFocusEffect: (fn: () => void) => require('react').useEffect(fn, [fn]) }));
jest.mock('../api/client', () => ({ ApiError: class extends Error {}, createMockClient: () => ({}) }));
jest.mock('./store', () => ({ getStored: () => ({ session: null }) }));
jest.mock('react-native', () => ({ View: 'View', Image: 'Image', ScrollView: 'ScrollView', AppState: { currentState: 'active', addEventListener: () => ({ remove() {} }) } }));
jest.mock('design-system/src', () => new Proxy({ space: {}, radius: {}, size: {}, borderWidth: {}, useTheme: () => ({ colors: { camera: {} } }) }, { get: (target, key) => key in target ? target[key as keyof typeof target] : String(key) }));
import Photo from '../../app/activity/[id]/photo';

let tree: ReactTestRenderer;
beforeAll(() => { (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true; });
beforeEach(() => {
  mockPermission.mockReset().mockResolvedValue({ granted: true, canAskAgain: true, status: 'granted' });
  mockRequest.mockReset().mockResolvedValue({ granted: false, canAskAgain: true, status: 'denied' });
});
afterEach(() => { act(() => tree.unmount()); });

test('화면 진입에서 허용된 권한을 조회하고 카메라를 연다', async () => {
  await act(async () => { tree = create(React.createElement(Photo)); });
  expect(mockPermission).toHaveBeenCalledTimes(1);
  expect(tree.root.findAllByType('CameraView' as never)).toHaveLength(1);
  expect(mockRequest).not.toHaveBeenCalled();
});

test('처음 진입에서는 권한을 요청하고 거부되면 안내를 보여 준다', async () => {
  mockPermission.mockResolvedValue({ granted: false, canAskAgain: true, status: 'undetermined' });
  await act(async () => { tree = create(React.createElement(Photo)); });
  expect(mockRequest).toHaveBeenCalledTimes(1);
  expect(tree.root.findAllByType('CameraView' as never)).toHaveLength(0);
  expect(tree.root.findByType('EmptyState' as never).props.title).toBe('카메라 권한이 필요해요');
});
