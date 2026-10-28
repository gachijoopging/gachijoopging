import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

const mockDismissTo = jest.fn();
let mockParams: Record<string, string | undefined> = {};
jest.mock('expo/src/winter/fetch', () => ({ fetch: jest.fn() }));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'u' }));
jest.mock('expo-router', () => ({ router: { dismissTo: (...a: unknown[]) => mockDismissTo(...a), back: jest.fn() }, useLocalSearchParams: () => mockParams, useNavigation: () => ({ addListener: () => () => {} }) }));
jest.mock('react-native', () => ({ View: 'View', Image: 'Image', ScrollView: 'ScrollView' }));
const mockRecord = jest.fn();
const mockOpen = jest.fn(() => true);
jest.mock('./actions', () => ({ recordPickup: (...a: unknown[]) => mockRecord(...a), isActivityOpen: () => mockOpen() }));
jest.mock('design-system/src', () => new Proxy(
  { space: {}, size: {}, radius: {}, useTheme: () => ({ colors: {}, shadows: {} }), useRipple: () => undefined },
  { get: (target, key) => (key in target ? target[key as keyof typeof target] : String(key)) },
));
import Review from '../../app/activity/[id]/review';

let tree: ReactTestRenderer;
beforeAll(() => { (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true; });
afterEach(() => { act(() => tree.unmount()); mockDismissTo.mockClear(); mockRecord.mockReset(); mockOpen.mockReset().mockReturnValue(true); });

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

describe('이대로 담기', () => {
  const media = { photoId: 'p1', url: 'x', inference: { status: 'OK', items: [{ category: 'CAN', aiConfidence: 0.9 }] } };
  const press = () => {
    mockParams = { id: 'a1', media: JSON.stringify(media) };
    act(() => { tree = create(React.createElement(Review)); });
    const save = tree.root.find((n) => (n.type as unknown) === 'Button' && n.props.size === 'lg');
    act(() => save.props.onPress());
  };
  const banners = () => tree.root.findAll((n) => (n.type as unknown) === 'Banner' && n.props.tone === 'danger');

  test('기한이 지났으면 담지 않고 재시도 대신 4-3 으로 돌아가 안내한다 — 4-3 이 자동 종료한다', () => {
    mockOpen.mockReturnValue(false);
    press();
    expect(mockRecord).not.toHaveBeenCalled();
    expect(mockDismissTo).toHaveBeenCalledWith({ pathname: '/activity/[id]', params: { id: 'a1', flash: '활동이 끝나 사진을 담을 수 없어요' } });
    expect(banners()).toHaveLength(0);
  });

  test('디스크에 못 남기면 4-5 에 머물러 다시 시도하게 한다', () => {
    mockRecord.mockImplementation(() => { throw new Error('disk'); });
    press();
    expect(mockDismissTo).not.toHaveBeenCalled();
    expect(banners()).toHaveLength(1);
  });

  test('담기면 줍기를 알리며 4-3 으로 돌아간다', () => {
    press();
    expect(mockRecord).toHaveBeenCalledWith([expect.objectContaining({ category: 'CAN', quantity: 1 })], 'p1', 'a1');
    expect(mockDismissTo).toHaveBeenCalledWith({ pathname: '/activity/[id]', params: { id: 'a1', flash: expect.stringContaining('기기에 저장됨') } });
  });
});
