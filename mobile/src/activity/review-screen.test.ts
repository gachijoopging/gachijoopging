import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

const mockDismissTo = jest.fn();
let mockParams: Record<string, string | undefined> = {};
jest.mock('expo/src/winter/fetch', () => ({ fetch: jest.fn() }));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'u' }));
jest.mock('expo-router', () => ({ router: { dismissTo: (...a: unknown[]) => mockDismissTo(...a), back: jest.fn() }, useLocalSearchParams: () => mockParams, useNavigation: () => ({ addListener: () => () => {} }) }));
jest.mock('react-native', () => ({ View: 'View', Image: 'Image', ScrollView: 'ScrollView' }));
jest.mock('./actions', () => ({ recordPickup: jest.fn() }));
jest.mock('design-system/src', () => new Proxy(
  { space: {}, size: {}, radius: {}, useTheme: () => ({ colors: {}, shadows: {} }), useRipple: () => undefined },
  { get: (target, key) => (key in target ? target[key as keyof typeof target] : String(key)) },
));
import Review from '../../app/activity/[id]/review';

let tree: ReactTestRenderer;
beforeAll(() => { (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true; });
afterEach(() => { act(() => tree.unmount()); mockDismissTo.mockClear(); });

test.each([
  ['없으면', undefined],
  ['JSON 이 아니면', '{'],
  ['사진 정보가 아니면', '{}'],
])('촬영 결과 인자가 %s 오류 없이 활동으로 돌아가 안내한다', (_label, media) => {
  mockParams = { id: 'a1', media };
  act(() => { tree = create(React.createElement(Review)); });
  expect(tree.toJSON()).toBeNull();
  expect(mockDismissTo).toHaveBeenCalledWith({ pathname: '/activity/[id]', params: { id: 'a1', flash: expect.stringMatching(/다시 찍어/) } });
});

test('유효한 촬영 결과면 분류 확인 화면을 그린다', () => {
  mockParams = { id: 'a1', media: JSON.stringify({ photoId: 'p1', url: 'x', inference: { status: 'UNAVAILABLE' } }) };
  act(() => { tree = create(React.createElement(Review)); });
  expect(tree.toJSON()).not.toBeNull();
  expect(mockDismissTo).not.toHaveBeenCalled();
});
