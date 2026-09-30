const snapshot = { endedAt: '2026-09-30T00:01:00Z', durationSec: 60, pausedSec: 0, distanceM: 10, steps: null, route: [] };
import { getStored, loadAccount, loadLastAccount, parseStored, updateStored } from './store';

const mockFiles = new Map<string, string>();
let mockFailedSuffix: string | null = null;
jest.mock('expo-file-system', () => ({
  Paths: { document: 'documents' },
  File: class {
    private name: string;
    constructor(_directory: string, fileName: string) { this.name = fileName; }
    get exists() { return mockFiles.has(this.name); }
    textSync() { return mockFiles.get(this.name); }
    write(text: string) {
      if (mockFailedSuffix && this.name.endsWith(mockFailedSuffix)) throw new Error('disk full');
      mockFiles.set(this.name, text);
    }
    delete() { mockFiles.delete(this.name); }
  },
}));

beforeEach(() => {
  mockFiles.clear();
  mockFailedSuffix = null;
});

describe('기기 기록 읽기', () => {
  test('끝난 활동과 보내지 못한 큐를 그대로 되살린다', () => {
    const saved = { session: { activityId: 'a1' }, ended: snapshot, outbox: [{ kind: 'pause', activityId: 'a1' }] };
    expect(parseStored(JSON.stringify(saved))).toEqual(saved);
  });

  test('쓰다 끊긴 파일은 null 이라 임시 파일로 넘어간다', () => {
    expect(parseStored('{"session":')).toBeNull();
    expect(parseStored(null)).toBeNull();
  });

  test('옛 판에 없는 필드는 비어 있는 값으로 채운다', () => {
    expect(parseStored('{}')).toEqual({ session: null, ended: null, outbox: [] });
  });

  test('최신 임시 파일은 이전 본 파일보다 먼저 복구한다', () => {
    mockFiles.set('activity-recovery.json', JSON.stringify({ ended: null, outbox: [] }));
    const latest = { session: null, ended: snapshot, outbox: [{ kind: 'pause', activityId: 'a1' }] };
    mockFiles.set('activity-recovery.json.tmp', JSON.stringify(latest));
    expect(loadAccount('recovery')).toEqual(latest);
  });

  test('재실행은 서버 조회 없이 마지막 계정의 미저장 활동을 복구한다', () => {
    const saved = { session: { activityId: 'a1', userId: 'offline-user' }, ended: snapshot, outbox: [{ kind: 'pause', activityId: 'a1' }] };
    mockFiles.set('activity-owner', 'offline-user');
    mockFiles.set('activity-offline-user.json', JSON.stringify(saved));
    jest.isolateModules(() => {
      const store = require('./store') as typeof import('./store');
      expect(store.loadLastAccount()).toEqual(saved);
    });
  });

  test('임시 파일 쓰기 실패는 메모리의 종료 상태와 큐를 바꾸지 않는다', () => {
    const before = loadAccount('write-failure');
    mockFailedSuffix = '.tmp';
    expect(() => updateStored((st) => ({ ...st, ended: snapshot }))).toThrow('disk full');
    expect(getStored()).toBe(before);
  });

  test('본 파일 쓰기 실패에도 임시 파일에 최신 큐를 보존한다', () => {
    loadAccount('main-failure');
    mockFailedSuffix = '.json';
    const latest = updateStored((st) => ({ ...st, ended: snapshot, outbox: [{ kind: 'pause', activityId: 'a1' }] }));
    expect(parseStored(mockFiles.get('activity-main-failure.json.tmp')!)).toEqual(latest);
    expect(() => updateStored((st) => ({ ...st, outbox: [] }))).toThrow('disk full');
    expect(parseStored(mockFiles.get('activity-main-failure.json.tmp')!)).toEqual(latest);
    expect(getStored()).toEqual(latest);
    mockFailedSuffix = null;
    loadAccount('other');
    expect(loadAccount('main-failure')).toEqual(latest);
    expect(loadLastAccount()).toEqual(latest);
  });
});
