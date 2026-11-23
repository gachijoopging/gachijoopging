import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

jest.mock('expo/src/winter/fetch', () => ({ fetch: jest.fn() }));
jest.mock('react-native', () => ({ View: 'View' }));
jest.mock('../../modules/kakao-map', () => ({ KakaoMapView: 'KakaoMapView' }));
jest.mock('design-system/src', () => new Proxy(
  { space: {}, size: {}, radius: {}, useTheme: () => ({ colors: {} }) },
  { get: (target, key) => (key in target ? target[key as keyof typeof target] : String(key)) },
));
import { ActivityMetrics, CategoryChips, RouteMap } from './SummaryBlocks';

let tree: ReactTestRenderer;
beforeAll(() => { (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true; });
afterEach(() => act(() => tree.unmount()));
const render = (el: React.ReactElement) => act(() => { tree = create(el); });
const texts = () => tree.root.findAll((n) => (n.type as unknown) === 'Txt').map((n) => n.props.children);

test('종료 요약과 기록 상세는 같은 지표 칸을 쓴다', () => {
  render(React.createElement(ActivityMetrics, { itemCount: 12, durationSec: 1800, distanceM: 1200 }));
  const items = tree.root.findByType('MetricSplit' as never).props.items.map((i: { label: string; value: string }) => [i.label, i.value]);
  expect(items).toEqual([['줍기', '12개'], ['활동 시간', '30분'], ['이동 거리', '1.2km']]);
});

test('걸음은 잰 값만 칸을 만든다. 0걸음은 보이고 미측정은 빠진다', () => {
  render(React.createElement(ActivityMetrics, { itemCount: 0, durationSec: 30, distanceM: 0, steps: 0 }));
  expect(tree.root.findByType('MetricSplit' as never).props.items.map((i: { label: string }) => i.label)).toContain('걸음');
  act(() => tree.update(React.createElement(ActivityMetrics, { itemCount: 0, durationSec: 30, distanceM: 0, steps: null })));
  expect(tree.root.findByType('MetricSplit' as never).props.items.map((i: { label: string }) => i.label)).not.toContain('걸음');
});

test('줍기 항목은 주운 종류만 아이콘과 수로 보인다', () => {
  render(React.createElement(CategoryChips, { byCategory: { PLASTIC: 3, CAN: 0, GLASS: 1 } }));
  const chips = tree.root.findAllByType('Chip' as never).map((c) => [c.props.label, c.props.accessibilityLabel, typeof c.props.icon]);
  expect(chips).toEqual([['플라스틱 3', '플라스틱 3개', 'string'], ['유리 1', '유리 1개', 'string']]);
});

test('경로가 두 점 미만이면 빈 지도 틀 대신 한 줄로 알린다', () => {
  render(React.createElement(RouteMap, { appKey: 'k', segments: [[{ latitude: 1, longitude: 1 }]] }));
  expect(tree.root.findAll((n) => (n.type as unknown) === 'KakaoMapView')).toHaveLength(0);
  expect(texts()).toContain('경로가 기록되지 않았어요');
});

test('지도 키가 없으면 지도를 불러오지 못했다고 알린다', () => {
  const two = [[{ latitude: 1, longitude: 1 }, { latitude: 2, longitude: 2 }]];
  render(React.createElement(RouteMap, { appKey: '', segments: two }));
  expect(texts()).toContain('지도를 불러오지 못했어요');
  act(() => tree.update(React.createElement(RouteMap, { appKey: 'k', segments: two })));
  expect(tree.root.findAll((n) => (n.type as unknown) === 'KakaoMapView')).toHaveLength(1);
});
