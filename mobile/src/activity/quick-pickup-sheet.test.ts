import React from 'react';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';

const mockQuick = jest.fn((category: string, quantity: number) => ({ itemId: 'i1', category, quantity }));
const mockUndo = jest.fn();
jest.mock('expo/src/winter/fetch', () => ({ fetch: jest.fn() }));
jest.mock('./actions', () => ({ quickPickup: (c: string, q: number) => mockQuick(c, q), undoPickup: (l: unknown) => mockUndo(l), isPending: () => true }));
const mockStored = {};
jest.mock('./store', () => ({ subscribe: () => () => {}, getStored: () => mockStored }));
// 스프링 완료 콜백을 붙들어 둔다. 퇴장 중(visible=false 인데 아직 떼어 내지 않음)을 만들기 위해서다
const mockSpringEnds: ((r: { finished: boolean }) => void)[] = [];
jest.mock('react-native', () => ({
  View: 'View',
  Pressable: 'Pressable',
  Animated: {
    View: 'Animated.View',
    Value: class { setValue() {} interpolate() { return 0; } },
    spring: () => ({ start: (cb?: (r: { finished: boolean }) => void) => cb && mockSpringEnds.push(cb) }),
  },
}));
jest.mock('design-system/src/theme.tsx', () => ({ useReduceMotion: () => false }));
jest.mock('design-system/src', () => new Proxy(
  { space: {}, size: {}, borderWidth: {}, useTheme: () => ({ colors: {} }), useRipple: () => undefined, pressedOpacity: () => 1, Appear: jest.requireActual('design-system/src/components/Appear.tsx').Appear },
  { get: (target, key) => (key in target ? target[key as keyof typeof target] : String(key)) },
));
import { QuickPickupSheet } from './QuickPickupSheet';

let tree: ReactTestRenderer;
beforeAll(() => { (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true; });
beforeEach(async () => {
  mockQuick.mockClear();
  mockUndo.mockClear();
  mockSpringEnds.length = 0;
  await act(async () => { tree = create(React.createElement(QuickPickupSheet, { visible: true, onClose: jest.fn(), session: null })); });
});
afterEach(() => act(() => tree.unmount()));

const tile = (name: string) => tree.root.find((n) => (n.type as unknown) === 'Pressable' && typeof n.props.accessibilityLabel === 'string' && n.props.accessibilityLabel.startsWith(`${name},`));

test('카드를 한 번 누르면 하나를 담는다', () => {
  act(() => tile('플라스틱').props.onPress());
  act(() => tile('플라스틱').props.onPress());
  expect(mockQuick.mock.calls).toEqual([['PLASTIC', 1], ['PLASTIC', 1]]);
});

test('길게 누르면 수량을 입력해 한 번에 담는다', () => {
  expect(tree.root.findAll((n) => (n.type as unknown) === 'NumberStepper')).toHaveLength(0);
  act(() => tile('캔').props.onLongPress());
  const stepper = tree.root.find((n) => (n.type as unknown) === 'NumberStepper');
  act(() => stepper.props.onChange(5));
  act(() => tree.root.find((n) => (n.type as unknown) === 'Button' && n.props.label === '5개 담기').props.onPress());
  expect(mockQuick).toHaveBeenCalledWith('CAN', 5);
});

test('스크린리더는 카드 하나에서 하나 담기와 수량 입력을 고른다', () => {
  const t = tile('유리');
  expect(t.props.accessibilityRole).toBe('button');
  expect(t.props.accessibilityActions.map((a: { name: string }) => a.name)).toEqual(['activate', 'longpress']);
  act(() => t.props.onAccessibilityAction({ nativeEvent: { actionName: 'longpress' } }));
  expect(tree.root.findAll((n) => (n.type as unknown) === 'NumberStepper')).toHaveLength(1);
});

// 실제 터치처럼 누른다. 조상 중 하나라도 pointerEvents="none" 이면 닿지 않는다
const press = (node: ReactTestInstance, onPress: () => void) => {
  for (let n: ReactTestInstance | null = node; n; n = n.parent) if (n.props.pointerEvents === 'none') return;
  onPress();
};
// 자리를 잡아 두는 유령 배너(접근성 라벨 없음)는 제외한다
const undoBanner = () => tree.root.findAll((n) => (n.type as unknown) === 'Banner' && n.props.action?.accessibilityLabel?.startsWith('최근'))[0];

test('되돌리기 배너가 사라지는 중에는 다시 눌러도 같은 줍기를 두 번 되돌리지 않는다', () => {
  act(() => tile('캔').props.onPress());
  act(() => press(undoBanner(), undoBanner().props.action.onPress));
  expect(mockUndo).toHaveBeenCalledTimes(1);
  // 퇴장 애니메이션이 아직 안 끝났다 — 배너는 남아 있지만 터치도 스크린리더도 닿지 않는다
  const lingering = undoBanner();
  expect(lingering).toBeDefined();
  act(() => press(lingering, lingering.props.action.onPress));
  expect(mockUndo).toHaveBeenCalledTimes(1);
  const wrapper = tree.root.find((n) => (n.type as unknown) === 'Animated.View');
  expect(wrapper.props.importantForAccessibility).toBe('no-hide-descendants');
  // 퇴장이 끝나면 떼어 낸다
  act(() => mockSpringEnds.forEach((end) => end({ finished: true })));
  expect(undoBanner()).toBeUndefined();
});

test('다시 그려지기 전에 되돌리기를 두 번 눌러도 한 번만 되돌린다', () => {
  act(() => tile('캔').props.onPress());
  // 실기기에서 빠른 연타는 첫 탭의 상태 변경이 그려지기 전에 두 번째 탭이 같은 핸들러로 들어온다
  const onUndo = undoBanner().props.action.onPress;
  act(() => { onUndo(); onUndo(); });
  expect(mockUndo).toHaveBeenCalledTimes(1);
});
