import { createElement } from 'react';
import { Platform } from 'react-native';
import { Button } from 'design-system/src/components/Button';

const { act, create } = require('react-test-renderer');

test('로딩·비활성 전환 중 Android 리플의 네이티브 뷰를 유지한다', () => {
  const platform = jest.replaceProperty(Platform, 'OS', 'android');
  let tree: ReturnType<typeof create>;
  act(() => { tree = create(createElement(Button, { label: '가입 신청' })); });
  const ripple = tree.root.findByProps({ accessibilityRole: 'button' }).props.android_ripple;
  expect(ripple).toBeDefined();
  try {
    for (const props of [{ loading: true }, { disabled: true }, { loading: false }]) {
      act(() => { tree.update(createElement(Button, { label: '가입 신청', ...props })); });
      expect(tree.root.findByProps({ accessibilityRole: 'button' }).props.android_ripple).toEqual(ripple);
    }
  } finally {
    act(() => tree.unmount());
    platform.restore();
  }
});
