import { type Activity } from '../api/client';
import { MOCKS } from '../api/mocks.generated';
import { ploggingEntry } from './entry';

const activity: Activity = MOCKS['POST /activities'].data;

describe('줍깅 탭을 눌렀을 때', () => {
  test('처음이면 온보딩(4-1)', () => {
    expect(ploggingEntry({ onboarded: false, current: null })).toEqual({ kind: 'onboarding' });
  });

  test('온보딩을 봤으면 지금 탭 위에 시작 시트', () => {
    expect(ploggingEntry({ onboarded: true, current: null })).toEqual({ kind: 'sheet' });
  });

  test('진행 중인 활동이 있으면 온보딩 여부와 상관없이 바로 4-3', () => {
    expect(ploggingEntry({ onboarded: true, current: activity })).toEqual({ kind: 'resume', id: activity.id });
    expect(ploggingEntry({ onboarded: false, current: activity })).toEqual({ kind: 'resume', id: activity.id });
  });
});
