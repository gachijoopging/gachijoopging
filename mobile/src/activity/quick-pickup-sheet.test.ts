import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

const mockQuick = jest.fn((category: string, quantity: number) => ({ itemId: 'i1', category, quantity }));
jest.mock('expo/src/winter/fetch', () => ({ fetch: jest.fn() }));
jest.mock('./actions', () => ({ quickPickup: (c: string, q: number) => mockQuick(c, q), undoPickup: jest.fn(), isPending: () => true }));
const mockStored = {};
jest.mock('./store', () => ({ subscribe: () => () => {}, getStored: () => mockStored }));
jest.mock('react-native', () => ({ View: 'View', Pressable: 'Pressable' }));
jest.mock('design-system/src', () => new Proxy(
  { space: {}, size: {}, borderWidth: {}, useTheme: () => ({ colors: {} }), useRipple: () => undefined, pressedOpacity: () => 1 },
  { get: (target, key) => (key in target ? target[key as keyof typeof target] : String(key)) },
));
import { QuickPickupSheet } from './QuickPickupSheet';

let tree: ReactTestRenderer;
beforeAll(() => { (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true; });
beforeEach(async () => {
  mockQuick.mockClear();
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
