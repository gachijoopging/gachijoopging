import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

const mockDismissTo = jest.fn();
const mockBack = jest.fn();
const mockDiscard = jest.fn();
const mockRecord = jest.fn();
type BeforeRemove = (e: { preventDefault: () => void }) => void;
let mockBeforeRemove: BeforeRemove = () => {};
let mockParams: Record<string, string | undefined> = {};
jest.mock('expo/src/winter/fetch', () => ({ fetch: jest.fn() }));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'u' }));
jest.mock('expo-router', () => ({ router: { dismissTo: (...a: unknown[]) => mockDismissTo(...a), back: () => mockBack() }, useLocalSearchParams: () => mockParams, useNavigation: () => ({ addListener: (_event: string, listener: BeforeRemove) => { mockBeforeRemove = listener; return () => {}; } }) }));
jest.mock('react-native', () => ({ View: 'View', Image: 'Image', ScrollView: 'ScrollView' }));
const mockOpen = jest.fn(() => true);
jest.mock('./actions', () => ({ recordPickup: (...a: unknown[]) => mockRecord(...a), discardPhoto: (...a: unknown[]) => mockDiscard(...a), isActivityOpen: () => mockOpen() }));
jest.mock('design-system/src', () => new Proxy(
  { space: {}, size: {}, radius: {}, useTheme: () => ({ colors: {}, shadows: {} }), useRipple: () => undefined },
  { get: (target, key) => (key in target ? target[key as keyof typeof target] : String(key)) },
));
import Review from '../../app/activity/[id]/review';

let tree: ReactTestRenderer;
beforeAll(() => { (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true; });
afterEach(() => {
  act(() => tree.unmount());
  for (const mock of [mockDismissTo, mockBack, mockDiscard]) mock.mockClear();
  mockRecord.mockReset();
  mockOpen.mockReset().mockReturnValue(true);
  mockBeforeRemove = () => {};
});

const upload = { mediaId: 'm1', photoId: 'p1', url: 'x', inference: { status: 'UNAVAILABLE' } };
const open = () => {
  mockParams = { id: 'a1', media: JSON.stringify(upload) };
  act(() => { tree = create(React.createElement(Review)); });
};
const button = (label: string) => tree.root.findAll((n) => (n.type as unknown) === 'Button' && n.props.label === label)[0];
type DialogAction = React.ReactElement<{ label: string; onPress: () => void }>;
const dialog = () => tree.root.findByType('Dialog' as never);
const dialogButton = (label: string) =>
  (dialog().props.actions as React.ReactElement<{ children: DialogAction[] }>).props.children.find((b) => b.props.label === label)!;
const setQuantity = (n: number) => act(() => tree.root.findAllByType('NumberStepper' as never)[0].props.onChange(n));
const leave = () => {
  const e = { preventDefault: jest.fn() };
  act(() => mockBeforeRemove(e));
  return e;
};

test.each([
  ['없으면', undefined],
  ['JSON 이 아니면', '{'],
  ['사진 정보가 아니면', '{}'],
  ['mediaId 가 없으면', JSON.stringify({ photoId: 'p1', url: 'x', inference: null })],
])('촬영 결과 인자가 %s 오류 없이 활동으로 돌아가 안내한다', (_label, media) => {
  mockParams = { id: 'a1', media };
  act(() => { tree = create(React.createElement(Review)); });
  expect(tree.toJSON()).toBeNull();
  expect(mockDismissTo).toHaveBeenCalledWith({ pathname: '/activity/[id]', params: { id: 'a1', flash: expect.stringMatching(/다시 찍어/) } });
});

test('유효한 촬영 결과면 분류 확인 화면을 그린다', () => {
  open();
  expect(tree.toJSON()).not.toBeNull();
  expect(mockDismissTo).not.toHaveBeenCalled();
});

describe('버린 사진', () => {
  test('다시 촬영하면 이 사진의 mediaId 를 지우고 4-4 로 돌아간다 — 뒤따르는 화면 제거가 한 번 더 지우지 않는다', () => {
    open();
    act(() => button('다시 촬영').props.onPress());
    expect(mockDiscard.mock.calls).toEqual([['m1', 'a1']]);
    expect(mockBack).toHaveBeenCalledTimes(1);
    const e = leave();
    expect(e.preventDefault).not.toHaveBeenCalled();
    expect(mockDiscard).toHaveBeenCalledTimes(1);
  });

  test('수량이 모두 0 이고 AI 도 못 찾았으면 묻지 않고 나가며 사진을 지운다', () => {
    open();
    const e = leave();
    expect(e.preventDefault).toHaveBeenCalled();
    expect(mockDiscard.mock.calls).toEqual([['m1', 'a1']]);
    expect(mockDismissTo).toHaveBeenCalledWith({ pathname: '/activity/[id]', params: { id: 'a1' } });
  });

  test('수량이 있으면 확인창이 뜨고, 계속 분류는 지우지 않고 버리고 돌아가기는 사진을 지운다', () => {
    open();
    setQuantity(2);
    leave();
    expect(dialog().props.visible).toBe(true);
    expect(mockDiscard).not.toHaveBeenCalled();
    act(() => dialogButton('계속 분류').props.onPress());
    expect(dialog().props.visible).toBe(false);
    expect(mockDiscard).not.toHaveBeenCalled();
    leave();
    act(() => dialogButton('버리고 돌아가기').props.onPress());
    expect(mockDiscard.mock.calls).toEqual([['m1', 'a1']]);
    expect(mockDismissTo).toHaveBeenCalledWith({ pathname: '/activity/[id]', params: { id: 'a1' } });
  });

  test('확인창 문구는 사진이 지워진다고 말한다 — 사진이 남을 수 있다는 옛 문구가 아니다', () => {
    open();
    expect(dialog().props.children.props.children).toBe('찍은 사진과 입력한 줍기 수량이 지워져요.');
  });

  test('이대로 담기는 사진을 지우지 않는다 — 줍기에 붙은 사진이다', () => {
    open();
    setQuantity(2);
    act(() => button('이대로 담기 · 2개').props.onPress());
    expect(mockRecord).toHaveBeenCalledTimes(1);
    expect(mockRecord.mock.calls[0].slice(1)).toEqual(['p1', 'a1']);
    const e = leave();
    expect(e.preventDefault).not.toHaveBeenCalled();
    expect(mockDiscard).not.toHaveBeenCalled();
  });
});

describe('이대로 담기', () => {
  const media = { mediaId: 'm1', photoId: 'p1', url: 'x', inference: { status: 'OK', items: [{ category: 'CAN', aiConfidence: 0.9 }] } };
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
