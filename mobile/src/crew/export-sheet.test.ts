import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

jest.mock('expo/src/winter/fetch', () => ({ fetch: jest.fn() }));
const mockGet = jest.fn();
const mockShare = jest.fn();
const mockWritten: { name: string; text: string }[] = [];
let mockFinish: () => void = () => {};
jest.mock('../api/config', () => ({ createApiClient: () => ({ get: (...args: unknown[]) => mockGet(...args) }) }));
jest.mock('expo-file-system', () => ({ Paths: { cache: 'cache' }, File: class {
  name: string; uri: string;
  constructor(_directory: string, name: string) { this.name = name; this.uri = `file://${name}`; }
  write(text: string) { mockWritten.push({ name: this.name, text }); }
} }));
jest.mock('expo-sharing', () => ({ shareAsync: (...args: unknown[]) => { mockShare(...args); return new Promise<void>((resolve) => { mockFinish = resolve; }); } }));
jest.mock('react-native', () => ({ View: 'View' }));
jest.mock('./export', () => ({
  exportRangeError: () => null, formatDateInput: (v: string) => v, csvFileText: (text: string) => `BOM${text}`,
  defaultExportRange: () => ({ from: '2026-09-01', to: '2026-09-17' }),
}));
jest.mock('design-system/src', () => new Proxy({ space: {} }, { get: (target, key) => (key in target ? target[key as keyof typeof target] : String(key)) }));
import { ExportSheet } from './ExportSheet';

const SERVER_NAME = '줍깅 크루_활동기록_2026-09-01_2026-09-17.csv';
let tree: ReactTestRenderer;
const sheet = () => tree.root.findByType('BottomSheet' as never);
const submit = () => tree.root.findAll((n) => (n.type as unknown) === 'Button' && n.props.label === 'CSV 내보내기')[0];
async function mount(onClose = jest.fn()) {
  await act(async () => { tree = create(React.createElement(ExportSheet, { visible: true, onClose, onFailed: jest.fn() })); });
  return onClose;
}

beforeAll(() => { (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true; });
beforeEach(() => {
  mockWritten.length = 0;
  mockShare.mockReset();
  mockGet.mockReset().mockResolvedValue({ fileName: SERVER_NAME, text: 'csv' });
});
afterEach(() => { act(() => tree.unmount()); });

test('파일을 만드는 동안에는 시트를 끌거나 바깥을 눌러 닫을 수 없다', async () => {
  const onClose = await mount();
  const fields = tree.root.findAllByType('Field' as never);
  act(() => { fields[0].props.onChangeText('20260901'); fields[1].props.onChangeText('20260930'); });
  expect(sheet().props.dismissible).not.toBe(false);

  await act(async () => { void submit().props.onPress(); });
  expect(sheet().props.dismissible).toBe(false);

  await act(async () => mockFinish());
  expect(onClose).toHaveBeenCalledTimes(1);
  expect(sheet().props.dismissible).not.toBe(false);
});

test('서버 파일명으로 저장해 공유 시트에 넘긴다 — 기간은 이번 달 1일부터 오늘로 채워져 있다', async () => {
  await mount();
  expect(tree.root.findAllByType('Field' as never).map((field) => field.props.value)).toEqual(['2026-09-01', '2026-09-17']);

  await act(async () => { void submit().props.onPress(); });
  expect(mockGet).toHaveBeenCalledWith('GET /crew/export', { from: '2026-09-01', to: '2026-09-17' });
  expect(mockWritten).toEqual([{ name: SERVER_NAME, text: 'BOMcsv' }]);
  expect(mockShare).toHaveBeenCalledWith(`file://${SERVER_NAME}`, expect.objectContaining({ mimeType: 'text/csv' }));
  await act(async () => mockFinish());
});
