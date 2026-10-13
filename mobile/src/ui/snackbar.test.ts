import React from 'react';
import { AccessibilityInfo } from 'react-native';
import { Snackbar } from '../../../design-system/src/components/Snackbar';

const { act, create } = require('react-test-renderer');
jest.mock('../../../design-system/src/theme.tsx', () => ({
  useTheme: () => ({ colors: { deep: 'black', onDark: 'white' }, shadows: { overlay: {} } }),
  useRipple: () => ({}),
  depth: () => ({}),
}));
jest.mock('../../../design-system/src/components/Text.tsx', () => ({ Txt: 'Txt' }));
jest.mock('../../../design-system/src/components/Appear.tsx', () => ({ Appear: 'Appear' }));

test('매초 새 닫기 콜백을 전달해도 스낵바는 4초 뒤 최신 콜백으로 닫힌다', () => {
  jest.useFakeTimers();
  const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
  const dismiss = jest.fn();
  const frame = (tick: number) => React.createElement(Snackbar, { visible: true, message: '기록을 저장했어요', onDismiss: () => dismiss(tick) });
  let rendered: ReturnType<typeof create>;
  try {
    act(() => { rendered = create(frame(0)); });
    for (let tick = 1; tick <= 3; tick++) {
      act(() => { jest.advanceTimersByTime(1000); rendered.update(frame(tick)); });
    }
    expect(dismiss).not.toHaveBeenCalled();
    act(() => { jest.advanceTimersByTime(1000); });
    expect(dismiss).toHaveBeenCalledTimes(1);
    expect(dismiss).toHaveBeenCalledWith(3);
  } finally {
    act(() => { rendered?.unmount(); });
    announce.mockRestore();
    jest.useRealTimers();
  }
});
