import React from 'react';
import { StartSheet } from './StartSheet';

const { act, create } = require('react-test-renderer');
let mockMode = 'granted';
let mockPending: Promise<string> | null = null;
const mockRequest = jest.fn();
const mockStart = jest.fn();
const mockOpenSettings = jest.fn();
jest.mock('expo/src/winter/fetch', () => ({ fetch: jest.fn() }));
jest.mock('../auth/location-permission', () => ({
  getPermissionMode: () => mockPending ?? Promise.resolve(mockMode),
  requestPreciseLocation: () => mockRequest(),
}));
jest.mock('./start', () => ({ startActivity: (...a: unknown[]) => mockStart(...a) }));
jest.mock('./notify-permission', () => ({ askNotificationsOnce: async () => {} }));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'activity-1' }));
jest.mock('expo-file-system', () => ({ Paths: { document: 'd' }, File: class { exists = true; create() {} } }));
jest.mock('expo-location', () => ({ Accuracy: { High: 4 }, watchPositionAsync: () => new Promise(() => {}) }));
jest.mock('expo-notifications', () => ({ getPermissionsAsync: jest.fn(), requestPermissionsAsync: jest.fn() }));
jest.mock('react-native', () => ({
  View: 'View',
  Pressable: 'Pressable',
  Platform: { OS: 'android', select: (o: Record<string, unknown>) => o.android ?? o.default },
  AppState: { addEventListener: () => ({ remove: () => {} }) },
  Linking: { openSettings: () => mockOpenSettings() },
  PermissionsAndroid: { RESULTS: { GRANTED: 'granted', DENIED: 'denied', NEVER_ASK_AGAIN: 'never_ask_again' } },
}));
jest.mock('design-system/src', () => new Proxy(
  { space: {}, size: {}, radius: {}, useTheme: () => ({ colors: {} }), useRipple: () => undefined, pressedOpacity: () => 1, disabledOpacity: 0.4 },
  { get: (target, key) => (key in target ? target[key as keyof typeof target] : String(key)) },
));

beforeAll(() => { (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true; });
beforeEach(() => {
  mockMode = 'granted';
  mockPending = null;
  mockRequest.mockReset();
  mockStart.mockReset().mockResolvedValue({ kind: 'started', id: 'activity-1', startedAt: 't', locationShared: false });
  mockOpenSettings.mockReset();
});

let tree: ReturnType<typeof create>;
afterEach(() => act(() => tree.unmount()));
const onDone = jest.fn();
const button = (label: string) => tree.root.findAll((n: any) => n.type === 'Button' && n.props.label === label)[0];
const sheetTitle = () => tree.root.findAll((n: any) => n.type === 'BottomSheet')[0].props.title;

const sheet = (visible: boolean) =>
  React.createElement(StartSheet, { api: {} as never, visible, shareLocationDefault: false, onClose: jest.fn(), onClosed: jest.fn(), onDone });

async function open() {
  onDone.mockClear();
  await act(async () => { tree = create(sheet(true)); });
}

test('권한을 확인하는 동안에는 시작 화면을 그리지 않는다', async () => {
  mockPending = new Promise(() => {});
  await open();
  expect(button('줍깅 시작')).toBeUndefined();
  expect(tree.root.findAll((n: any) => n.type === 'Pressable' && n.props.accessibilityRole === 'switch')).toHaveLength(0);
  expect(sheetTitle()).not.toBe('활동을 시작할까요?');
});

test('닫힌 뒤 들어온 허용 결과가 다음에 열 때의 확인을 앞지르지 않는다', async () => {
  mockMode = 'request';
  await open();
  let grant!: (r: string) => void;
  mockRequest.mockReturnValue(new Promise((resolve) => { grant = resolve; }));
  await act(async () => { void button('위치 권한 허용').props.onPress(); });
  await act(async () => tree.update(sheet(false)));
  await act(async () => grant('granted'));
  mockPending = new Promise(() => {});
  await act(async () => tree.update(sheet(true)));
  expect(button('줍깅 시작')).toBeUndefined();
});

test('정확한 위치 권한이 있으면 시작 버튼으로 활동을 시작한다', async () => {
  await open();
  expect(sheetTitle()).toBe('활동을 시작할까요?');
  await act(async () => button('줍깅 시작').props.onPress());
  expect(mockStart).toHaveBeenCalled();
  expect(onDone).toHaveBeenCalledWith(expect.objectContaining({ kind: 'started' }));
});

test('권한이 없으면 시트 안에서 권한을 요청하고, 허용되면 같은 시트에서 시작할 수 있다', async () => {
  mockMode = 'request';
  await open();
  expect(sheetTitle()).toBe('위치 권한이 필요해요');
  expect(button('줍깅 시작')).toBeUndefined();
  mockRequest.mockResolvedValue('granted');
  await act(async () => button('위치 권한 허용').props.onPress());
  expect(sheetTitle()).toBe('활동을 시작할까요?');
  expect(button('줍깅 시작')).toBeDefined();
});

test('다시 묻지 않음이면 설정으로 보낸다', async () => {
  mockMode = 'request';
  await open();
  mockRequest.mockResolvedValue('never_ask_again');
  await act(async () => button('위치 권한 허용').props.onPress());
  await act(async () => button('설정으로 이동').props.onPress());
  expect(mockOpenSettings).toHaveBeenCalled();
});

test('대략적 위치만 있으면 시작하지 않는다', async () => {
  mockMode = 'approximate';
  await open();
  expect(button('줍깅 시작')).toBeUndefined();
  expect(mockStart).not.toHaveBeenCalled();
});

test('시트가 열린 사이 권한을 끄면 시작하지 않고 안내로 바뀐다', async () => {
  await open();
  mockMode = 'request';
  await act(async () => button('줍깅 시작').props.onPress());
  expect(mockStart).not.toHaveBeenCalled();
  expect(sheetTitle()).toBe('위치 권한이 필요해요');
});
