import { parseStored } from './store';

jest.mock('expo-file-system', () => ({ File: class {}, Paths: {} }));

describe('기기 기록 읽기', () => {
  test('종료 스냅샷과 보내지 못한 큐를 그대로 되살린다 — 종료 요청이 먼저 나가도 요약은 스냅샷으로 그린다', () => {
    const saved = { session: { activityId: 'a1' }, ended: { endedAt: '2026-09-29T10:00:00Z', durationSec: 60, pausedSec: 0, distanceM: 10, steps: null, route: [] }, outbox: [{ kind: 'pause', activityId: 'a1' }] };
    expect(parseStored(JSON.stringify(saved))).toEqual(saved);
  });

  test('쓰다 끊긴 파일은 null 이라 임시 파일로 넘어간다', () => {
    expect(parseStored('{"session":')).toBeNull();
    expect(parseStored(null)).toBeNull();
  });

  test('옛 판에 없는 필드는 비어 있는 값으로 채운다', () => {
    expect(parseStored('{}')).toEqual({ session: null, ended: null, outbox: [] });
  });
});
