import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

const mockMutate = jest.fn();
jest.mock('../api/client', () => ({ createMockClient: () => ({ mutate: (...a: unknown[]) => mockMutate(...a) }) }));
jest.mock('expo/src/winter/fetch', () => ({ fetch: jest.fn() }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn() }));
jest.mock('react-native', () => ({ View: 'View', Share: { share: jest.fn(async () => ({})) } }));
jest.mock('design-system/src', () => new Proxy(
  { space: {}, tracking: {} },
  { get: (target, key) => (key in target ? target[key as keyof typeof target] : String(key)) },
));
import { InviteCodeSheet } from './InviteCodeSheet';

beforeAll(() => { (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true; });

test('새 코드를 만들지 못하면 시트 안에서 알린다. 시트가 스낵바를 덮는다', async () => {
  mockMutate.mockRejectedValue(new Error('offline'));
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = create(React.createElement(InviteCodeSheet, { visible: true, code: 'HG-7K2P', isLeader: true, onClose: jest.fn(), onReissued: jest.fn(), onMessage: jest.fn() }));
  });
  const confirm = tree.root.find((n) => (n.type as unknown) === 'Dialog').props.actions.props.children[1];
  await act(async () => confirm.props.onPress());
  const sheet = tree.root.find((n) => (n.type as unknown) === 'BottomSheet');
  const banner = sheet.findAll((n) => (n.type as unknown) === 'Banner');
  expect(banner.map((b) => b.props.children)).toEqual(['새 코드를 만들지 못했어요. 다시 시도해 주세요.']);
  act(() => tree.unmount());
});
