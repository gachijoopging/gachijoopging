jest.mock('../api/media', () => ({ mediaFile: async (uri: string) => ({ uri, name: 'photo.jpg', type: 'image/jpeg' }) }));
import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

const mockPermission = jest.fn();
const mockRequest = jest.fn();
const mockBlurs: Array<() => void> = [];
jest.mock('expo/src/winter/fetch', () => ({ fetch: jest.fn() }));
jest.mock('expo-camera', () => ({ CameraView: 'CameraView', Camera: { getCameraPermissionsAsync: () => mockPermission(), requestCameraPermissionsAsync: () => mockRequest() } }));
// 찍은 사진은 재시도를 위해 활동별로 화면 밖에 남는다. 테스트마다 다른 활동으로 연다
let mockId = 'a0';
let mockReduce = false;
const mockHaptic = jest.fn(async (_type: string) => {});
jest.mock('expo-haptics', () => ({ performAndroidHapticsAsync: (t: string) => mockHaptic(t), AndroidHaptics: { Context_Click: 'context-click' } }));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'photo-id' }));
jest.mock('expo-linking', () => ({ openSettings: jest.fn() }));
jest.mock('expo-status-bar', () => ({ StatusBar: 'StatusBar' }));
jest.mock('expo-network', () => ({ useNetworkState: () => ({ isConnected: true }) }));
const mockMutate = jest.fn();
const mockPush = jest.fn();
jest.mock('expo-router', () => ({ router: { push: (...a: unknown[]) => mockPush(...a), dismissTo: jest.fn(), back: jest.fn() }, useLocalSearchParams: () => ({ id: mockId }), useNavigation: () => ({ addListener: () => () => {} }), useFocusEffect: (fn: () => (() => void) | void) => require('react').useEffect(() => { const blur = fn(); if (blur) mockBlurs.push(blur); return blur; }, [fn]) }));
jest.mock('../api/client', () => ({ ApiError: class extends Error {}, createMockClient: () => ({ mutate: (...a: unknown[]) => mockMutate(...a) }) }));
jest.mock('./store', () => ({ getStored: () => ({ session: null }) }));
jest.mock('react-native', () => ({ View: 'View', Image: 'Image', ScrollView: 'ScrollView', AppState: { currentState: 'active', addEventListener: () => ({ remove() {} }) } }));
jest.mock('design-system/src', () => new Proxy({ space: {}, radius: {}, size: {}, borderWidth: {}, useTheme: () => ({ colors: { camera: {} } }), useReduceMotion: () => mockReduce }, { get: (target, key) => key in target ? target[key as keyof typeof target] : String(key) }));
import Photo from '../../app/activity/[id]/photo';

let tree: ReactTestRenderer;
beforeAll(() => { (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true; });
beforeEach(() => {
  mockMutate.mockReset().mockReturnValue(new Promise(() => {}));
  mockPush.mockReset();
  mockId = `a${Number(mockId.slice(1)) + 1}`;
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

test('카메라 화면을 떠나 위에 다른 화면이 올라오면 밝은 상태바를 거둔다', async () => {
  await act(async () => { tree = create(React.createElement(Photo)); });
  expect(tree.root.findAllByType('StatusBar' as never)).toHaveLength(1);
  await act(async () => mockBlurs.splice(0).forEach((blur) => blur()));
  expect(tree.root.findAllByType('StatusBar' as never)).toHaveLength(0);
});

test('셔터를 누르면 찍힌 순간을 손끝으로 알린다', async () => {
  await act(async () => {
    tree = create(React.createElement(Photo), { createNodeMock: () => ({ takePictureAsync: async () => ({ uri: 'file://shot.jpg' }) }) });
  });
  await act(async () => tree.root.findByType('CameraView' as never).props.onCameraReady());
  await act(async () => tree.root.findByType('CaptureButton' as never).props.onPress());
  expect(mockHaptic).toHaveBeenCalledWith('context-click');
});

test.each([[false, 1], [true, 0]])('셔터를 누른 순간 화면이 하얗게 번쩍인다. 동작 줄이기가 %s 면 번쩍임 %i 번', async (reduce, flashes) => {
  mockReduce = reduce;
  let finish: (v: { uri: string }) => void = () => {};
  await act(async () => {
    tree = create(React.createElement(Photo), { createNodeMock: () => ({ takePictureAsync: () => new Promise((r) => { finish = r; }) }) });
  });
  await act(async () => tree.root.findByType('CameraView' as never).props.onCameraReady());
  await act(async () => { void tree.root.findByType('CaptureButton' as never).props.onPress(); });
  const flash = () => tree.root.findAll((n) => n.props.testID === 'shutter-flash');
  expect(flash()).toHaveLength(flashes);
  await act(async () => finish({ uri: 'file://shot.jpg' }));
  expect(flash()).toHaveLength(0);
  mockReduce = false;
});

async function shootOnce() {
  await act(async () => {
    tree = create(React.createElement(Photo), { createNodeMock: () => ({ takePictureAsync: async () => ({ uri: 'file://shot.jpg' }) }) });
  });
  await act(async () => tree.root.findByType('CameraView' as never).props.onCameraReady());
  await act(async () => tree.root.findByType('CaptureButton' as never).props.onPress());
}
const button = (label: string) => tree.root.findAll((n) => (n.type as unknown) === 'Button' && n.props.label === label)[0];

test('셔터를 누르면 미리보기 확인 없이 바로 올리고 분류 확인으로 간다', async () => {
  mockMutate.mockResolvedValue({ data: { id: 'm1', items: [] } });
  await shootOnce();
  expect(mockMutate).toHaveBeenCalledTimes(1);
  expect(mockPush).toHaveBeenCalledWith(expect.objectContaining({ pathname: '/activity/[id]/review' }));
  expect(button('이 사진으로 분류')).toBeUndefined();
});

test('올리지 못하면 같은 사진을 같은 mediaId 로 다시 올린다', async () => {
  mockMutate.mockRejectedValueOnce(new Error('offline'));
  await shootOnce();
  expect(mockPush).not.toHaveBeenCalled();
  mockMutate.mockResolvedValueOnce({ data: { id: 'm1', items: [] } });
  await act(async () => button('다시 올리기').props.onPress());
  const ids = mockMutate.mock.calls.map(([, body]) => (body as FormData).get('mediaId'));
  expect(ids).toEqual(['photo-id', 'photo-id']);
  expect(mockPush).toHaveBeenCalledTimes(1);
});
