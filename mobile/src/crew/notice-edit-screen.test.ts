import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

const mockGet = jest.fn();
jest.mock('expo/src/winter/fetch', () => ({ fetch: jest.fn() }));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'uuid-1' }));
jest.mock('expo-file-system', () => ({ Paths: { document: 'documents' }, File: class { get exists() { return false; } textSync() { return undefined; } write() {} delete() {} } }));
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), replace: jest.fn(), dismissTo: jest.fn() },
  useLocalSearchParams: () => ({}),
  useFocusEffect: (fn: () => void) => require('react').useEffect(fn, [fn]),
}));
jest.mock('react-native', () => ({ View: 'View', BackHandler: { addEventListener: () => ({ remove: () => {} }) } }));
jest.mock('../api/client', () => ({ ApiError: class extends Error {}, createMockClient: () => ({ get: (k: string) => mockGet(k), mutate: jest.fn() }) }));
jest.mock('design-system/src', () => new Proxy(
  { space: {} },
  { get: (target, key) => (key in target ? target[key as keyof typeof target] : String(key)) },
));
import EditNoticeScreen from '../../app/crew/notices/edit';

let tree: ReactTestRenderer;
beforeAll(() => { (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true; });
afterEach(() => act(() => tree.unmount()));

const field = (label: string) => tree.root.find((n) => (n.type as unknown) === 'Field' && n.props.label === label);
const retry = () => tree.root.findAll((n) => (n.type as unknown) === 'Banner' && n.props.action?.label === '다시 시도');
const submit = () => tree.root.find((n) => (n.type as unknown) === 'Button' && n.props.label === '공지 올리기');

test('작성 중 권한 조회가 실패하면 쓴 글을 지우지 않고 다시 시도를 보인다', async () => {
  mockGet.mockRejectedValueOnce(new Error('network'));
  await act(async () => { tree = create(React.createElement(EditNoticeScreen)); });
  await act(async () => field('제목').props.onChangeText('이번 주 모임'));
  expect(retry()).toHaveLength(1);
  expect(submit().props.disabled).toBe(true);
  // 다시 받으면 안내가 사라지고 올릴 수 있다
  mockGet.mockResolvedValueOnce({ data: { id: 'u1', membership: { crew: { id: 'c1', isLeader: true } } } });
  await act(async () => retry()[0].props.action.onPress());
  expect(retry()).toHaveLength(0);
  expect(field('제목').props.value).toBe('이번 주 모임');
  await act(async () => field('내용').props.onChangeText('토요일 9시'));
  expect(submit().props.disabled).toBe(false);
});
