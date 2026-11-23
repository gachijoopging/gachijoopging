import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { endBody, newSession } from './session';

const mockDismissTo = jest.fn();
let mockStored: ReturnType<typeof import('./store')['getStored']>;
let mockParams: Record<string, string | undefined> = {};
jest.mock('expo/src/winter/fetch', () => ({ fetch: jest.fn() }));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'u' }));
jest.mock('expo-router', () => ({
  router: { dismissTo: (...a: unknown[]) => mockDismissTo(...a), back: jest.fn() },
  useLocalSearchParams: () => mockParams,
  useNavigation: () => ({ addListener: () => () => {} }),
}));
jest.mock('react-native', () => ({ View: 'View', Image: 'Image', ScrollView: 'ScrollView' }));
jest.mock('./store', () => ({
  getStored: () => mockStored,
  loadLastAccount: () => mockStored,
  updateStored: (fn: (st: typeof mockStored) => typeof mockStored) => { mockStored = fn(mockStored); },
}));
jest.mock('./tracking', () => ({ syncOutbox: jest.fn(), isSendingItem: () => false, stopTracking: jest.fn(), finalSteps: jest.fn() }));
jest.mock('design-system/src', () => new Proxy(
  { space: {}, size: {}, radius: {}, useTheme: () => ({ colors: {}, shadows: {} }), useRipple: () => undefined },
  { get: (target, key) => (key in target ? target[key as keyof typeof target] : String(key)) },
));
import Review from '../../app/activity/[id]/review';

const START = Date.parse('2026-09-30T00:00:00Z');
const HOUR = 3_600_000;
const EXPIRED_FLASH = '활동이 끝나 사진을 담을 수 없어요';
const media = { mediaId: 'm1', photoId: 'p1', url: 'x', inference: { status: 'OK', items: [{ category: 'CAN', aiConfidence: 0.9 }] } };

let tree: ReactTestRenderer;
let clock: jest.SpyInstance;
const session = () => newSession({ id: 'a1', startedAt: '2026-09-30T00:00:00Z', pausedSec: 0, paused: false, pausedAt: null, itemCount: 0, locationShared: false }, 'u1', 0);
const saveAt = (hoursAfterStart: number) => {
  clock.mockReturnValue(START + hoursAfterStart * HOUR);
  mockParams = { id: 'a1', media: JSON.stringify(media) };
  act(() => { tree = create(React.createElement(Review)); });
  const save = tree.root.find((n) => (n.type as unknown) === 'Button' && n.props.size === 'lg');
  act(() => save.props.onPress());
};
const queued = () => mockStored.outbox.map((op) => op.kind);

beforeAll(() => { (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true; });
beforeEach(() => {
  clock = jest.spyOn(Date, 'now');
  mockStored = { session: session(), ended: null, outbox: [] };
});
afterEach(() => {
  act(() => tree.unmount());
  clock.mockRestore();
  mockDismissTo.mockClear();
});

describe('24시간이 지나 4-5 에서 담지 못하고 4-3 으로 돌려보내질 때', () => {
  test('종료 기록이 아직 없으면 올린 사진의 삭제를 대기열에 남기고 안내와 함께 돌아간다', () => {
    saveAt(25);
    expect(queued()).toEqual(['discardPhoto']);
    expect(mockStored.outbox[0]).toMatchObject({ activityId: 'a1', mediaId: 'm1' });
    expect(mockDismissTo).toHaveBeenCalledWith({ pathname: '/activity/[id]', params: { id: 'a1', flash: EXPIRED_FLASH } });
  });

  test('종료 기록이 이미 있으면 삭제를 넣지 않는다 — 종료 뒤에 닿으면 서버가 지우지 않는다', () => {
    const ended = endBody(session(), START + HOUR);
    mockStored = { session: session(), ended, outbox: [{ kind: 'end', activityId: 'a1', body: ended }] };
    saveAt(2);
    expect(queued()).toEqual(['end']);
    expect(mockDismissTo).toHaveBeenCalledWith({ pathname: '/activity/[id]', params: { id: 'a1', flash: EXPIRED_FLASH } });
  });
});

test('기한 안에 담으면 사진은 줍기에 붙으므로 삭제를 대기열에 넣지 않는다', () => {
  saveAt(2);
  expect(queued()).toEqual(['items']);
  expect(mockDismissTo).toHaveBeenCalledWith({ pathname: '/activity/[id]', params: { id: 'a1', flash: expect.stringContaining('기기에 저장됨') } });
});
