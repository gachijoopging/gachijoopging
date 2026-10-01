import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

jest.mock('expo/src/winter/fetch', () => ({ fetch: jest.fn() }));
let mockFinish: () => void = () => {};
jest.mock('expo-file-system', () => ({ File: class { uri = 'file://x.csv'; write() {} }, Paths: { cache: 'cache' } }));
jest.mock('expo-sharing', () => ({ shareAsync: () => new Promise<void>((resolve) => { mockFinish = resolve; }) }));
jest.mock('react-native', () => ({ View: 'View' }));
jest.mock('./export', () => ({ exportRangeError: () => null, formatDateInput: (v: string) => v, exportFileName: () => 'x.csv', fetchCrewCsv: async () => 'csv' }));
jest.mock('design-system/src', () => new Proxy({ space: {} }, { get: (target, key) => (key in target ? target[key as keyof typeof target] : String(key)) }));
import { ExportSheet } from './ExportSheet';

beforeAll(() => { (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true; });

test('파일을 만드는 동안에는 시트를 끌거나 바깥을 눌러 닫을 수 없다', async () => {
  let tree!: ReactTestRenderer;
  const onClose = jest.fn();
  await act(async () => { tree = create(React.createElement(ExportSheet, { visible: true, onClose, onFailed: jest.fn() })); });
  const sheet = () => tree.root.findByType('BottomSheet' as never);
  const fields = tree.root.findAllByType('Field' as never);
  act(() => { fields[0].props.onChangeText('20260901'); fields[1].props.onChangeText('20260930'); });
  expect(sheet().props.dismissible).not.toBe(false);

  const submit = tree.root.findAll((n) => (n.type as unknown) === 'Button' && n.props.label === 'CSV 내보내기')[0];
  await act(async () => { void submit.props.onPress(); });
  expect(sheet().props.dismissible).toBe(false);

  await act(async () => mockFinish());
  expect(onClose).toHaveBeenCalledTimes(1);
  expect(sheet().props.dismissible).not.toBe(false);
  act(() => tree.unmount());
});
