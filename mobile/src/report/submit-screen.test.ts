import React from 'react';
import ReportScreen from '../../app/report';
import { ApiError } from '../api/client';
import { clearReportDraft, editReportDraft, reportDraftFor } from './report';

const { act, create } = require('react-test-renderer');
const mockGet = jest.fn();
const mockMutate = jest.fn();
const mockDismiss = jest.fn();
const mockRandomUUID = jest.fn();
let mockBeforeRemove: ((event: { preventDefault: () => void }) => void) | null = null;
let mockParams: { targetType?: string; targetId?: string } = { targetType: 'POST', targetId: 'p1' };
const mockNavigation = {
  getState: () => ({ routes: [{ name: '5-2-post-detail', params: { id: 'p1' } }, { name: '6-1-report' }], index: 1 }),
  addListener: (_event: string, callback: typeof mockBeforeRemove) => {
    mockBeforeRemove = callback;
    return () => { if (mockBeforeRemove === callback) mockBeforeRemove = null; };
  },
};
jest.mock('expo-crypto', () => ({ randomUUID: () => mockRandomUUID() }));
jest.mock('../api/client', () => ({
  ApiError: class extends Error {
    code: string;
    constructor(value: string) { super(value); this.code = value; }
  },
  createMockClient: () => ({ get: (...args: unknown[]) => mockGet(...args), mutate: (...args: unknown[]) => mockMutate(...args) }),
}));
jest.mock('expo-router', () => ({
  router: { canGoBack: () => true, back: jest.fn(), replace: jest.fn(), dismissTo: (...args: unknown[]) => mockDismiss(...args) },
  useLocalSearchParams: () => mockParams, useNavigation: () => mockNavigation,
}));
jest.mock('../auth/usePreventBack', () => ({ usePreventBack: () => {} }));
jest.mock('react-native', () => new Proxy({ Image: 'Image', View: 'View' }, {
  get: (target, key) => key in target ? target[key as keyof typeof target] : jest.requireActual('react-native')[key],
}));
jest.mock('design-system/src', () => new Proxy({ radius: {}, size: {}, space: { sm: 8, md: 16, xs: 4 } }, {
  get: (target, key) => key in target ? target[key as keyof typeof target] : String(key),
}));
const me = (id = 'u1', isLeader = false) => ({ data: { id, membership: { status: 'MEMBER', crew: { isLeader } } } });
let rendered: ReturnType<typeof create>;
beforeEach(() => {
  mockGet.mockReset().mockResolvedValue(me());
  mockMutate.mockReset().mockResolvedValue(undefined);
  mockDismiss.mockReset();
  mockRandomUUID.mockReset().mockReturnValueOnce('request-id').mockReturnValue('changed-request-id');
  mockParams = { targetType: 'POST', targetId: 'p1' };
  mockBeforeRemove = null;
  clearReportDraft('u1', 'POST', 'p1');
  clearReportDraft('u2', 'POST', 'p1');
});
afterEach(async () => { if (rendered) await act(async () => rendered.unmount()); });
const mount = async () => { await act(async () => { rendered = create(React.createElement(ReportScreen)); }); };
const chooseSpam = async () => { await act(async () => rendered.root.findAllByType('SelectRow').find((row: any) => row.props.title === '스팸·도배').props.onPress()); };
const submitButton = () => rendered.root.findAllByType('Button').find((button: any) => button.props.label === '신고 보내기');

test('같은 프레임의 중복 제출은 한 번만 보내며 대기 중 이탈을 막고 성공 복귀를 허용한다', async () => {
  await mount();
  await chooseSpam();
  let finish!: () => void;
  mockMutate.mockImplementation(() => new Promise<void>((resolve) => { finish = resolve; }));
  const handler = submitButton().props.onPress;
  await act(async () => { void handler(); void handler(); });
  expect(mockMutate).toHaveBeenCalledTimes(1);
  const pending = { preventDefault: jest.fn() };
  mockBeforeRemove!(pending);
  expect(pending.preventDefault).toHaveBeenCalledTimes(1);
  const completed = { preventDefault: jest.fn() };
  mockDismiss.mockImplementation(() => mockBeforeRemove!(completed));
  await act(async () => finish());
  expect(mockDismiss).toHaveBeenCalledTimes(1);
  expect(completed.preventDefault).not.toHaveBeenCalled();
  expect(reportDraftFor('u1', 'POST', 'p1').requestId).toBeNull();
});

test('계정을 바꾸어 진입하면 이전 신고 메모를 화면에 복원하지 않는다', async () => {
  editReportDraft('u1', 'POST', 'p1', { reason: 'OTHER', memo: '앞 계정의 사생활 메모' });
  mockGet.mockResolvedValue(me('u2'));
  await mount();
  expect(rendered.root.findAllByType('Field').length).toBe(0);
  expect(submitButton().props.disabled).toBe(true);
  expect(reportDraftFor('u1', 'POST', 'p1').memo).toBe('앞 계정의 사생활 메모');
});

test('크루장 직접 진입과 권한 조회 실패는 신고 폼을 열지 않는다', async () => {
  mockGet.mockResolvedValue(me('u1', true));
  await mount();
  expect(rendered.root.findByType('ErrorState').props.title).toBe('크루원만 신고할 수 있어요');
  expect(rendered.root.findByType('ErrorState').props.description).toBe('크루장과 크루에 가입하지 않은 사용자는 신고할 수 없어요.');
  expect(rendered.root.findAllByType('SelectRow').length).toBe(0);
  await act(async () => rendered.unmount());
  mockGet.mockRejectedValue(new Error('offline'));
  await mount();
  expect(rendered.root.findByType('ErrorState').props.title).toBe('신고 권한을 확인하지 못했어요');
  expect(mockMutate).not.toHaveBeenCalled();
  mockGet.mockResolvedValue(me());
  await act(async () => rendered.root.findByType('ErrorState').props.onRetry());
  expect(rendered.root.findAllByType('SelectRow').length).toBe(5);
});

test('권한이 바뀌어 제출이 거부되면 메모를 보존하고 재제출을 막는다', async () => {
  await mount();
  await chooseSpam();
  mockMutate.mockRejectedValue(new ApiError('FORBIDDEN'));
  await act(async () => submitButton().props.onPress());
  expect(rendered.root.findByType('ErrorState').props.title).toBe('크루원만 신고할 수 있어요');
  expect(rendered.root.findByType('ErrorState').props.description).toBe('크루장과 크루에 가입하지 않은 사용자는 신고할 수 없어요.');
  expect(reportDraftFor('u1', 'POST', 'p1').reason).toBe('SPAM');
  expect(mockDismiss).not.toHaveBeenCalled();
});

test('잘못된 링크의 대상 유형 또는 누락 id는 조회·제출 전에 거부한다', async () => {
  mockParams = { targetType: 'UNKNOWN', targetId: 'p1' };
  await mount();
  expect(rendered.root.findByType('ErrorState').props.title).toBe('신고 대상을 확인할 수 없어요');
  expect(rendered.root.findByType('ErrorState').props.description).toBe('잘못된 링크예요. 진입한 화면에서 다시 열어 주세요.');
  expect(mockGet).not.toHaveBeenCalled();
  expect(mockMutate).not.toHaveBeenCalled();
});

test('기타 사유의 메모를 비운 채 칸을 떠나면 칸 아래에 필수라고 알린다', async () => {
  await mount();
  await act(async () => rendered.root.findAllByType('SelectRow').find((row: any) => row.props.title === '기타').props.onPress());
  const memo = () => rendered.root.findAllByType('Field').find((f: any) => f.props.accessibilityLabel?.startsWith('상세 메모'));
  expect(memo().props.error).toBeUndefined();
  await act(async () => memo().props.onBlur());
  expect(memo().props.error).toBe('기타 사유는 메모가 필요해요.');
  await act(async () => memo().props.onChangeText('광고 링크를 반복해서 올려요'));
  expect(memo().props.error).toBeUndefined();
});

test('다른 사유를 골랐다가 기타로 돌아오면 칸을 다시 떠나기 전까지 필수 오류를 보이지 않는다', async () => {
  await mount();
  const pick = (title: string) => act(async () => rendered.root.findAllByType('SelectRow').find((row: any) => row.props.title === title).props.onPress());
  const memo = () => rendered.root.findAllByType('Field').find((f: any) => f.props.accessibilityLabel?.startsWith('상세 메모'));
  await pick('기타');
  await act(async () => memo().props.onBlur());
  await pick('스팸·도배');
  await pick('기타');
  expect(memo().props.error).toBeUndefined();
});

test.each(['MOCK_FAILURE', 'OFFLINE'])('신고 제출 %s 뒤 사유·메모와 요청 id를 보존하고 재시도한다', async (code) => {
  editReportDraft('u1', 'POST', 'p1', { reason: 'OTHER', memo: '광고 링크를 반복해서 올려요' });
  await mount();
  mockMutate.mockRejectedValueOnce(new ApiError(code)).mockResolvedValueOnce(undefined);
  await act(async () => submitButton().props.onPress());
  expect(rendered.root.findByType('Banner').props.children).toBe('신고를 접수하지 못했어요. 다시 시도해 주세요.');
  expect(rendered.root.findByType('Field').props.value).toBe('광고 링크를 반복해서 올려요');
  expect(submitButton().props.disabled).toBe(false);
  expect(mockDismiss).not.toHaveBeenCalled();
  const firstRequest = mockMutate.mock.calls[0];
  await act(async () => submitButton().props.onPress());
  expect(mockMutate.mock.calls[1]).toEqual(firstRequest);
  expect(mockRandomUUID).toHaveBeenCalledTimes(1);
  expect(mockDismiss).toHaveBeenCalledTimes(1);
  expect(reportDraftFor('u1', 'POST', 'p1').memo).toBe('');
});

test('중복 신고 응답은 입력을 보존하고 재제출 버튼 대신 돌아가기를 제공한다', async () => {
  await mount();
  await chooseSpam();
  mockMutate.mockRejectedValue(new ApiError('CONFLICT'));
  await act(async () => submitButton().props.onPress());
  expect(rendered.root.findByType('Banner').props.children).toBe('이미 신고한 대상이에요.');
  expect(submitButton()).toBeUndefined();
  expect(rendered.root.findAllByType('Button').some((button: any) => button.props.label === '돌아가기')).toBe(true);
  expect(reportDraftFor('u1', 'POST', 'p1').reason).toBe('SPAM');
  expect(mockMutate).toHaveBeenCalledTimes(1);
  expect(mockDismiss).not.toHaveBeenCalled();
});
