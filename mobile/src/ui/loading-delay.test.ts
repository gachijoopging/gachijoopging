import { createElement } from 'react';
import { Loading } from 'design-system/src/components/States';
import { LOADING_SHOW_AFTER_MS } from 'design-system/tokens/motion';

const { act, create } = require('react-test-renderer');

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

// 호스트 노드만 센다. 합성 View 와 그 아래 호스트 'View' 가 같은 prop 을 갖는다
const progressbar = (tree: ReturnType<typeof create>) => tree.root.findAll((n: any) => n.type === 'View' && n.props.accessibilityRole === 'progressbar');

test('짧은 불러오기에는 로딩을 보이지 않고, 기준 시간이 지나야 스피너와 progressbar 가 나타난다', () => {
  let tree: ReturnType<typeof create>;
  act(() => { tree = create(createElement(Loading, { label: '피드를 불러오고 있어요' })); });
  act(() => { jest.advanceTimersByTime(LOADING_SHOW_AFTER_MS - 1); });
  expect(progressbar(tree!)).toHaveLength(0);
  expect(tree!.root.find((n: any) => n.type === 'View' && n.props.importantForAccessibility === 'no-hide-descendants').props.style.opacity).toBe(0);
  act(() => { jest.advanceTimersByTime(1); });
  expect(progressbar(tree!)).toHaveLength(1);
  expect(progressbar(tree!)[0].props.accessibilityLabel).toBe('피드를 불러오고 있어요');
  expect(progressbar(tree!)[0].props.style.opacity).toBe(1);
  act(() => tree!.unmount());
});

test('다시 마운트되면 처음부터 기다리고, 기다리는 중에 떼어 내면 타이머를 남기지 않는다', () => {
  let tree: ReturnType<typeof create>;
  act(() => { tree = create(createElement(Loading)); });
  act(() => { jest.advanceTimersByTime(LOADING_SHOW_AFTER_MS); });
  expect(progressbar(tree!)).toHaveLength(1);
  act(() => tree!.unmount());
  act(() => { tree = create(createElement(Loading)); });
  act(() => { jest.advanceTimersByTime(LOADING_SHOW_AFTER_MS - 1); });
  expect(progressbar(tree!)).toHaveLength(0);
  act(() => tree!.unmount());
  expect(jest.getTimerCount()).toBe(0);
});
