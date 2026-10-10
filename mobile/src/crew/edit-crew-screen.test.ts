import React from 'react';
import EditCrewScreen from '../../app/crew/edit';

const { act, create } = require('react-test-renderer');
const mockGet = jest.fn();
const mockMutate = jest.fn();
const mockPush = jest.fn();
const mockDismiss = jest.fn();
jest.mock('expo/src/winter/fetch', () => ({ fetch: jest.fn() }));
jest.mock('../api/client', () => ({
  ApiError: class extends Error {
    code: string;
    constructor(mockCode: string) { super(mockCode); this.code = mockCode; }
  },
  createMockClient: () => ({ get: (...a: unknown[]) => mockGet(...a), mutate: (...a: unknown[]) => mockMutate(...a) }),
}));
jest.mock('../api/media', () => ({ mediaFile: jest.fn() }));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'uuid' }));
jest.mock('expo-image-picker', () => ({}));
jest.mock('../auth/usePreventBack', () => ({ usePreventBack: jest.fn() }));
jest.mock('expo-router', () => ({
  router: { push: (...a: unknown[]) => mockPush(...a), back: jest.fn(), dismissTo: (...a: unknown[]) => mockDismiss(...a) },
  useNavigation: () => ({ addListener: () => () => {}, dispatch: jest.fn() }),
}));
jest.mock('react-native', () => ({ View: 'View', Linking: { openSettings: jest.fn() } }));
jest.mock('design-system/src', () => new Proxy({ space: {} }, { get: (target, key) => (key in target ? target[key as keyof typeof target] : String(key)) }));

beforeAll(() => { (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true; });

const crew = (memberCount: number, pendingJoinRequests: number) => ({
  data: { name: '한강줍깅크루', intro: '', goalCount: 300, photoUrl: null, region: 'SEOUL', joinPolicy: 'APPROVAL', isLeader: true, memberCount, pendingJoinRequests },
});

let tree: ReturnType<typeof create>;
afterEach(() => act(() => tree.unmount()));
const dialog = (title: string) => tree.root.findAll((n: any) => n.type === 'Dialog' && n.props.title === title)[0];

async function switchToOpen(memberCount: number, pending: number) {
  mockGet.mockResolvedValue(crew(memberCount, pending));
  mockMutate.mockReset().mockResolvedValue(undefined);
  mockPush.mockClear();
  mockDismiss.mockClear();
  await act(async () => { tree = create(React.createElement(EditCrewScreen)); });
  await act(async () => tree.root.findAll((n: any) => n.type === 'SelectRow' && n.props.title === '공개')[0].props.onPress());
  await act(async () => tree.root.findAll((n: any) => n.type === 'Button' && n.props.label === '변경사항 저장')[0].props.onPress());
}

test('비공개 → 공개는 확인을 받은 뒤 저장하고, 실제로 가입한 인원을 알린다', async () => {
  await switchToOpen(18, 2);
  expect(mockMutate).not.toHaveBeenCalled();
  expect(dialog('공개 크루로 바꿀까요?').props.visible).toBe(true);
  // 대기 2건 중 1건은 추방 이력이라 자동 가입되지 않았다
  mockGet.mockResolvedValue(crew(19, 1));
  await act(async () => dialog('공개 크루로 바꿀까요?').props.actions.props.children[1].props.onPress());
  expect(mockMutate).toHaveBeenCalledWith('PATCH /crew', { joinPolicy: 'OPEN' });
  expect(mockDismiss).toHaveBeenCalledWith({ pathname: '/crew/members', params: { flash: '공개 크루로 바꿨어요. 기다리던 1명이 가입했어요.' } });
});

test('신청 관리에서 정리하고 돌아오면 최신 인원으로 다시 검사한다', async () => {
  await switchToOpen(49, 2);
  expect(dialog('공개로 바꿀 수 없어요').props.visible).toBe(true);
  await act(async () => dialog('공개로 바꿀 수 없어요').props.actions.props.children[1].props.onPress());
  mockGet.mockResolvedValue(crew(49, 1));
  await act(async () => tree.root.findAll((n: any) => n.type === 'Button' && n.props.label === '변경사항 저장')[0].props.onPress());
  expect(dialog('공개로 바꿀 수 없어요').props.visible).toBe(false);
  expect(dialog('공개 크루로 바꿀까요?').props.visible).toBe(true);
});

test('크루원 + 대기 신청이 50명을 넘으면 저장하지 않고 가입 신청 관리로 안내한다', async () => {
  await switchToOpen(49, 2);
  expect(mockMutate).not.toHaveBeenCalled();
  expect(dialog('공개로 바꿀 수 없어요').props.visible).toBe(true);
  await act(async () => dialog('공개로 바꿀 수 없어요').props.actions.props.children[1].props.onPress());
  expect(mockPush).toHaveBeenCalledWith('/crew/join-requests');
});

test('서버가 409 CREW_FULL 이면 같은 안내를 보인다', async () => {
  const { ApiError } = require('../api/client');
  await switchToOpen(18, 2);
  mockMutate.mockRejectedValueOnce(new ApiError('CREW_FULL'));
  await act(async () => dialog('공개 크루로 바꿀까요?').props.actions.props.children[1].props.onPress());
  expect(dialog('공개로 바꿀 수 없어요').props.visible).toBe(true);
  expect(mockDismiss).not.toHaveBeenCalled();
});
