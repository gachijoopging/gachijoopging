import { type Activity } from '../api/client';
import { MOCKS } from '../api/mocks.generated';
import { readyView } from './ready';

const activity: Activity = MOCKS['POST /activities'].data;

describe('4-1 줍깅 대기 상태', () => {
  test('처음 불러오는 중', () => {
    expect(readyView({ last: undefined, failed: false })).toEqual({ kind: 'loading' });
  });

  test('불러온 값 없이 실패하면 오류', () => {
    expect(readyView({ last: undefined, failed: true })).toEqual({ kind: 'error' });
  });

  test('진행 중인 활동이 없으면 대기', () => {
    expect(readyView({ last: null, failed: false })).toEqual({ kind: 'idle', stale: false });
  });

  test('진행 중인 활동이 있으면 이어가기', () => {
    expect(readyView({ last: activity, failed: false })).toEqual({ kind: 'active', activity, stale: false });
  });

  test('이전 값이 있으면 재조회가 실패해도 그대로 두고 연결 안내를 붙인다', () => {
    expect(readyView({ last: activity, failed: true })).toEqual({ kind: 'active', activity, stale: true });
    expect(readyView({ last: null, failed: true })).toEqual({ kind: 'idle', stale: true });
  });
});
