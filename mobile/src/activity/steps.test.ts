import { newSession, pause, resume, type Session } from './session';
import { activeSpans, readSteps, type StepSource } from './steps';

const T0 = Date.parse('2026-10-07T10:00:00Z');
const at = (min: number) => T0 + min * 60_000;
const iso = (min: number) => new Date(at(min)).toISOString();

function started(): Session {
  return newSession(
    { id: 'a1', startedAt: iso(0), pausedSec: 0, paused: false, pausedAt: null, itemCount: 0, locationShared: true },
    'u1',
    T0,
  );
}

/** 분 단위 [from, to) 구간마다 100걸음씩 걸은 기기 */
function walked(status: Awaited<ReturnType<StepSource['status']>> = 'granted'): StepSource & { asked: [string, string][] } {
  const asked: [string, string][] = [];
  return {
    asked,
    status: async () => status,
    count: async (from, to) => {
      asked.push([from, to]);
      return ((Date.parse(to) - Date.parse(from)) / 60_000) * 100;
    },
  };
}

describe('걸음을 세는 구간', () => {
  test('일시정지 구간은 빼고 활동 구간만 센다', () => {
    let s = started();
    s = pause(s, at(10));
    s = resume(s, at(15));
    expect(activeSpans(s, at(20))).toEqual([[iso(0), iso(10)], [iso(15), iso(20)]]);
  });

  test('일시정지 중이면 멈춘 시각까지만 센다', () => {
    const s = pause(started(), at(10));
    expect(activeSpans(s, at(30))).toEqual([[iso(0), iso(10)]]);
  });

  test('일시정지 구간을 남기기 전 버전에 저장된 활동이 멈춘 적 있으면 셀 수 없다', () => {
    const { pauses, ...legacy } = resume(pause(started(), at(10)), at(15));
    expect(activeSpans(legacy as Session, at(20))).toBeNull();
    const { pauses: _, ...neverPaused } = started();
    expect(activeSpans(neverPaused as Session, at(20))).toEqual([[iso(0), iso(20)]]);
  });

  test('서버에서 받은 활동이라 멈춘 구간을 모르면 셀 수 없다', () => {
    const s = newSession(
      { id: 'a1', startedAt: iso(0), pausedSec: 300, paused: false, pausedAt: null, itemCount: 0, locationShared: true },
      'u1',
      at(20),
    );
    expect(activeSpans(s, at(20))).toBeNull();
  });
});

describe('걸음수 읽기', () => {
  test('권한이 있으면 활동 구간 걸음만 합친다 — 일시정지 중 걸음은 빠진다', async () => {
    let s = pause(started(), at(10));
    s = resume(s, at(15));
    const source = walked();
    expect(await readSteps(s, at(20), source)).toBe(1500);
    expect(source.asked).toEqual([[iso(0), iso(10)], [iso(15), iso(20)]]);
  });

  test('걸음이 실제로 0이면 0 이다 — 미측정과 다르다', async () => {
    const source: StepSource = { status: async () => 'granted', count: async () => 0 };
    expect(await readSteps(started(), at(5), source)).toBe(0);
  });

  test('걸음을 쓴 앱이 없는 구간은 미측정이다 — 0걸음으로 바꾸지 않는다', async () => {
    const source: StepSource = { status: async () => 'granted', count: async () => null };
    expect(await readSteps(started(), at(5), source)).toBeNull();
  });

  test('한 구간이라도 기록이 없으면 전체가 미측정이다 — 일부 구간 걸음으로 전체 거리를 보정하지 않는다', async () => {
    let s = pause(started(), at(10));
    s = resume(s, at(15));
    const counts = [null, 300];
    const source: StepSource = { status: async () => 'granted', count: async () => counts.shift()! };
    expect(await readSteps(s, at(20), source)).toBeNull();
  });

  test.each(['unavailable', 'not-installed', 'denied'] as const)('%s 이면 null 이다', async (status) => {
    const source = walked(status);
    expect(await readSteps(started(), at(5), source)).toBeNull();
    expect(source.asked).toEqual([]);
  });

  test('읽다 실패하면 null 이다 — 활동을 막지 않는다', async () => {
    const source: StepSource = { status: async () => 'granted', count: async () => { throw new Error('remote'); } };
    expect(await readSteps(started(), at(5), source)).toBeNull();
  });

  test('재실행해 디스크에서 되살린 활동도 같은 구간으로 다시 센다', async () => {
    let s = pause(started(), at(10));
    s = resume(s, at(15));
    const restored: Session = JSON.parse(JSON.stringify(s));
    expect(await readSteps(restored, at(20), walked())).toBe(1500);
  });
});
