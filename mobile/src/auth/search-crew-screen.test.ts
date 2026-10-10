import React from 'react';
import SearchCrewScreen from '../../app/(onboarding)/search-crew';
import { MOCKS } from '../api/mocks.generated';

const { act, create } = require('react-test-renderer');
const mockGet = jest.fn();
const mockMutate = jest.fn();
const mockReset = jest.fn();
const mockNavigation = { reset: (...a: unknown[]) => mockReset(...a) };
jest.mock('expo/src/winter/fetch', () => ({ fetch: jest.fn() }));
jest.mock('../api/client', () => ({
  ApiError: class extends Error {
    code: string;
    constructor(mockCode: string) { super(mockCode); this.code = mockCode; }
  },
}));
jest.mock('../api/onboarding', () => ({
  onboardingApi: { get: (...a: unknown[]) => mockGet(...a), mutate: (...a: unknown[]) => mockMutate(...a) },
}));
jest.mock('./usePreventBack', () => ({ usePreventBack: jest.fn() }));
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn() },
  // 실제 useNavigation 처럼 렌더마다 같은 객체를 돌려준다
  useNavigation: () => mockNavigation,
}));
jest.mock('react-native', () => ({ View: 'View', Pressable: 'Pressable', RefreshControl: 'RefreshControl' }));
jest.mock('design-system/src', () => new Proxy({ space: {}, size: {}, useRipple: () => undefined }, { get: (target, key) => (key in target ? target[key as keyof typeof target] : String(key)) }));

beforeAll(() => { (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true; });
beforeEach(() => {
  // 이름 검색만 흉내 낸다. 검색 규칙 자체는 api/onboarding.test.ts 가 본다
  mockGet.mockReset().mockImplementation((_key: string, { query }: { query?: string }) => {
    const page = MOCKS['GET /crews'].data;
    return Promise.resolve({ data: { ...page, items: page.items.filter((c) => !query || c.name.includes(query)) } });
  });
  mockMutate.mockReset();
  mockReset.mockClear();
});

let tree: ReturnType<typeof create>;
afterEach(() => act(() => tree.unmount()));
const find = (type: string, pred: (p: any) => boolean = () => true) => tree.root.findAll((n: any) => n.type === type && pred(n.props));
const list = () => find('List')[0];
const ids = () => list().props.data.map((c: { id: string }) => c.id);
const sheetButton = () => find('Button', (p) => p.label === '가입하기' || p.label === '가입 신청하기')[0];

async function openCrew(crewId: string) {
  await act(async () => { tree = create(React.createElement(SearchCrewScreen)); });
  const item = list().props.data.find((c: { id: string }) => c.id === crewId);
  const row = list().props.renderItem({ item });
  await act(async () => row.props.onPress());
}

test('들어오면 전체 크루를 이름순으로 부르고, 검색어로 다시 부른다', async () => {
  await act(async () => { tree = create(React.createElement(SearchCrewScreen)); });
  expect(mockGet).toHaveBeenCalledWith('GET /crews', {});
  expect(ids()).toEqual(['c001', 'c002', 'c003']);
  await act(async () => find('Field')[0].props.onChangeText(' 망원 '));
  await act(async () => find('Field')[0].props.onSubmitEditing());
  expect(mockGet).toHaveBeenLastCalledWith('GET /crews', { query: '망원' });
  expect(ids()).toEqual(['c002']);
});

test('조건을 바꾸면 새 첫 페이지가 오기 전에는 이전 커서로 더 부르지 않는다', async () => {
  const page = MOCKS['GET /crews'].data;
  mockGet.mockResolvedValueOnce({ data: { ...page, nextCursor: 'old' } });
  await act(async () => { tree = create(React.createElement(SearchCrewScreen)); });
  mockGet.mockClear().mockReturnValue(new Promise(() => {}));
  await act(async () => find('Field')[0].props.onChangeText('망원'));
  await act(async () => find('Field')[0].props.onSubmitEditing());
  await act(async () => list().props.onEndReached());
  expect(mockGet).toHaveBeenCalledTimes(1);
  expect(mockGet).toHaveBeenCalledWith('GET /crews', { query: '망원' });
});

test('조건을 바꾼 조회가 실패하면 이전 결과를 지우고, 같은 검색어로 다시 찾을 수 있다', async () => {
  const { ApiError } = require('../api/client');
  await act(async () => { tree = create(React.createElement(SearchCrewScreen)); });
  const succeed = mockGet.getMockImplementation();
  mockGet.mockRejectedValueOnce(new ApiError('NETWORK'));
  await act(async () => find('Field')[0].props.onChangeText('망원'));
  await act(async () => find('Field')[0].props.onSubmitEditing());
  expect(find('List')).toHaveLength(0);
  expect(find('ErrorState')).toHaveLength(1);
  mockGet.mockImplementation(succeed);
  await act(async () => find('Field')[0].props.onSubmitEditing());
  expect(ids()).toEqual(['c002']);
});

test('검색 중 다른 기기에서 신청해 409 가 오면 승인 대기로 간다', async () => {
  const { ApiError } = require('../api/client');
  mockGet.mockRejectedValueOnce(new ApiError('JOIN_REQUEST_PENDING'));
  await act(async () => { tree = create(React.createElement(SearchCrewScreen)); });
  expect(mockReset).toHaveBeenCalledWith({ index: 0, routes: [{ name: '(onboarding)/pending-approval', params: { flash: '승인 대기 중인 가입 요청이 있어요.' } }] });
});

test('정원이 찬 크루는 공개여도 가입 버튼이 꺼져 있다', async () => {
  await openCrew('c002');
  expect(sheetButton().props.disabled).toBe(true);
});

test('공개 크루에 가입하면 시트가 내려간 뒤 홈으로 간다', async () => {
  mockMutate.mockResolvedValue({ data: { id: 'jr001', crew: { id: 'c003', name: '여의도아침줍깅' }, status: 'APPROVED' } });
  await openCrew('c003');
  expect(sheetButton().props.label).toBe('가입하기');
  await act(async () => sheetButton().props.onPress());
  expect(mockMutate).toHaveBeenCalledWith('POST /crews/join-requests', { crewId: 'c003' });
  expect(mockReset).not.toHaveBeenCalled();
  await act(async () => find('BottomSheet', (p) => p.title === '여의도아침줍깅')[0].props.onClosed());
  expect(mockReset).toHaveBeenCalledWith({ index: 0, routes: [{ name: '(tabs)', params: { screen: 'index', params: { flash: '여의도아침줍깅에 가입했어요.' } } }] });
});

test('비공개 크루에 신청하면 승인 대기로 간다', async () => {
  mockMutate.mockResolvedValue({ data: { id: 'jr001', crew: { id: 'c001', name: '한강줍깅크루' }, status: 'PENDING' } });
  await openCrew('c001');
  expect(sheetButton().props.label).toBe('가입 신청하기');
  await act(async () => sheetButton().props.onPress());
  await act(async () => find('BottomSheet', (p) => p.title === '한강줍깅크루')[0].props.onClosed());
  expect(mockReset).toHaveBeenCalledWith({ index: 0, routes: [{ name: '(onboarding)/pending-approval' }] });
});

test('추방된 크루면 시트 안에 알리고 버튼을 끈다', async () => {
  const { ApiError } = require('../api/client');
  mockMutate.mockRejectedValue(new ApiError('EXPELLED_FROM_CREW'));
  await openCrew('c001');
  await act(async () => sheetButton().props.onPress());
  expect(find('Banner').map((n: any) => n.props.children)).toContain('이 크루에서 내보내져 다시 가입할 수 없어요.');
  expect(sheetButton().props.disabled).toBe(true);
});
