import React from 'react';
import { LeaveCrew } from './LeaveCrew';
import { ApiError } from '../api/client';

const { act, create } = require('react-test-renderer');
const mockGet = jest.fn();
const mockMutate = jest.fn();
const mockDismiss = jest.fn();
const mockRemember = jest.fn();
let mockStored = { session: null as unknown, ended: null as unknown, outbox: [] as unknown[] };
jest.mock('expo-router', () => ({ router: { dismissTo: (...a: unknown[]) => mockDismiss(...a) } }));
jest.mock('expo-network', () => ({ useNetworkState: () => ({ isConnected: true }) }));
jest.mock('../activity/store', () => ({ getStored: () => mockStored, loadLastAccount: () => mockStored }));
jest.mock('../auth/account', () => ({ currentAccount: () => ({ id: 'u1' }), rememberAccount: (...a: unknown[]) => mockRemember(...a) }));
jest.mock('design-system/src', () => new Proxy({}, { get: (_t, key) => key === 'Dialog' ? (props: any) => require('react').createElement('Dialog', props, props.children, props.actions) : String(key) }));

const api = { get: (...a: unknown[]) => mockGet(...a), mutate: (...a: unknown[]) => mockMutate(...a) };
let tree: ReturnType<typeof create>;
beforeAll(() => { (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true; });
beforeEach(() => {
  mockStored = { session: null, ended: null, outbox: [] };
  mockGet.mockReset().mockImplementation((key: string) => Promise.resolve({ data: key === 'GET /crew' ? { memberCount: 3 } : null }));
  mockMutate.mockReset().mockResolvedValue(undefined);
  mockDismiss.mockClear(); mockRemember.mockClear();
});
afterEach(() => act(() => tree.unmount()));
const row = () => tree.root.findAll((n: any) => n.type === 'ListRow' && n.props.title === '크루 나가기')[0];
const button = (label: string) => tree.root.findAll((n: any) => n.type === 'Button' && n.props.label === label)[0];
const openDialog = () => tree.root.findAll((n: any) => n.type === 'Dialog' && n.props.visible)[0];
async function mount(isLeader = false) {
  await act(async () => { tree = create(React.createElement(LeaveCrew, { api: api as any, crewName: '데모크루', isLeader })); });
  await act(async () => row().props.onPress());
}

test('크루원이 나가면 소속을 비우고 1-6 크루 선택으로 간다', async () => {
  await mount();
  expect(openDialog().props.title).toBe('크루를 나갈까요?');
  await act(async () => button('나가기').props.onPress());
  expect(mockMutate).toHaveBeenCalledWith('POST /crew/leave');
  expect(mockRemember).toHaveBeenCalledWith({ id: 'u1', membership: { status: 'NONE' } });
  expect(mockDismiss).toHaveBeenCalledWith({ pathname: '/crew-choice', params: { flash: '크루를 나갔어요.' } });
});

test('혼자 남은 크루장이면 해산을 확인한다', async () => {
  mockGet.mockImplementation((key: string) => Promise.resolve({ data: key === 'GET /crew' ? { memberCount: 1 } : null }));
  await mount(true);
  expect(openDialog().props.title).toBe('크루를 해산하고 나갈까요?');
  expect(button('해산하고 나가기')).toBeDefined();
});

test('진행 중이거나 저장 안 된 기록이 있으면 나가지 않는다', async () => {
  mockStored = { session: null, ended: null, outbox: [{ kind: 'end' }] };
  await mount();
  expect(openDialog().props.title).toBe('먼저 활동 종료와 동기화를 완료해 주세요');
  expect(mockMutate).not.toHaveBeenCalled();
});

test('위임이 먼저 필요하면(403) 이 화면의 크루원 목록에서 위임하라고 안내한다', async () => {
  mockMutate.mockRejectedValueOnce(new ApiError('LEADER_MUST_DELEGATE'));
  await mount(true);
  await act(async () => button('나가기').props.onPress());
  expect(openDialog().props.title).toBe('위임한 뒤에 나갈 수 있어요');
  expect(mockDismiss).not.toHaveBeenCalled();
});

test('실패하면 다시 누를 수 있다', async () => {
  mockMutate.mockRejectedValueOnce(new Error('network'));
  await mount();
  await act(async () => button('나가기').props.onPress());
  expect(button('나가기').props.loading).toBe(false);
  expect(mockDismiss).not.toHaveBeenCalled();
});
