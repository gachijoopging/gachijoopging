import { parseStored } from './store';

jest.mock('expo-file-system', () => ({ File: class {}, Paths: {} }));

describe('기기 기록 읽기', () => {
  test('끝난 활동과 보내지 못한 큐를 그대로 되살린다', () => {
    const saved = { session: { activityId: 'a1' }, ended: true, outbox: [{ kind: 'pause', activityId: 'a1' }] };
    expect(parseStored(JSON.stringify(saved))).toEqual(saved);
  });

  test('쓰다 끊긴 파일은 null 이라 임시 파일로 넘어간다', () => {
    expect(parseStored('{"session":')).toBeNull();
    expect(parseStored(null)).toBeNull();
  });

  test('옛 판에 없는 필드는 비어 있는 값으로 채운다', () => {
    expect(parseStored('{}')).toEqual({ session: null, ended: false, outbox: [] });
  });
});
