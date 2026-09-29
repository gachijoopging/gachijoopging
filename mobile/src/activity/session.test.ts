import {
  applyFix,
  bannerFor,
  elapsedSec,
  endBody,
  gpsStatus,
  livePayload,
  newSession,
  pause,
  resume,
  addItems,
  removeItem,
  metricsLabel,
  restartLine,
  trackingNotice,
  type Session,
} from './session';

const T0 = Date.parse('2026-09-29T10:00:00Z');
const at = (sec: number) => T0 + sec * 1000;
// 위도 0.0001도 ≈ 11.1m
const fix = (sec: number, dLat = 0, accuracy: number | null = 5) => ({
  latitude: 37.5 + dLat,
  longitude: 127,
  accuracy,
  timestamp: at(sec),
});

function started(): Session {
  return newSession(
    { id: 'a1', startedAt: new Date(T0).toISOString(), pausedSec: 0, paused: false, pausedAt: null, itemCount: 0, locationShared: true },
    'u1',
    T0,
  );
}

function walk(s: Session, from: number, to: number): Session {
  for (let sec = from; sec <= to; sec++) s = applyFix(s, fix(sec, sec * 0.00001));
  return s;
}

describe('경로와 거리', () => {
  test('필터를 통과한 점만 경로에 쌓고 거리를 더한다', () => {
    const s = walk(started(), 0, 10);
    expect(s.segments).toHaveLength(1);
    expect(s.segments[0]).toHaveLength(11);
    expect(s.distanceM).toBeGreaterThan(5);
  });

  test('오차 30m 를 넘는 점은 경로에도 현재 위치에도 쓰지 않는다', () => {
    const s = applyFix(started(), fix(0, 0, 50));
    expect(s.segments[0]).toHaveLength(0);
    expect(s.here).toBeNull();
  });

  test('일시정지 중에는 현재 위치만 바뀌고 경로·거리는 멈춘다', () => {
    let s = walk(started(), 0, 5);
    const before = s.distanceM;
    s = pause(s, at(6));
    s = walk(s, 7, 20);
    expect(s.distanceM).toBe(before);
    expect(s.segments[0]).toHaveLength(6);
    expect(s.here?.latitude).toBeCloseTo(37.5 + 20 * 0.00001, 4);
  });

  test('재개하면 새 구간을 시작하고 정지 전 점과 잇지 않는다', () => {
    let s = walk(started(), 0, 5);
    s = pause(s, at(6));
    s = resume(s, at(60));
    // 정지 중 걸어서 멀리 갔어도 속도 필터가 정지 전 점과 비교해 버리지 않는다
    s = applyFix(s, fix(61, 0.01));
    expect(s.segments).toHaveLength(2);
    expect(s.segments[1]).toHaveLength(1);
  });

  test('걸음수 미측정(null)이면 GPS 거리를 그대로 쓴다', () => {
    const s = walk(started(), 0, 10);
    expect(s.steps).toBeNull();
    expect(endBody(s, at(11)).distanceM).toBe(Math.round(s.distanceM));
    expect(endBody(s, at(11)).steps).toBeNull();
  });
});

describe('활동 시간', () => {
  test('일시정지 시간을 빼고, 정지 중에는 멈춘다', () => {
    let s = pause(started(), at(60));
    expect(elapsedSec(s, at(100))).toBe(60);
    s = resume(s, at(100));
    expect(s.pausedSec).toBe(40);
    expect(elapsedSec(s, at(130))).toBe(90);
  });

  test('종료 본문은 진행 중인 정지 구간까지 정지 시간에 넣는다', () => {
    const s = pause(started(), at(60));
    const body = endBody(s, at(100));
    expect(body.durationSec).toBe(60);
    expect(body.pausedSec).toBe(40);
  });

  test('종료 경로는 구간을 이어 [lng, lat] 로 보낸다', () => {
    let s = walk(started(), 0, 2);
    s = resume(pause(s, at(3)), at(4));
    s = walk(s, 5, 6);
    expect(endBody(s, at(7)).route).toHaveLength(5);
    expect(endBody(s, at(7)).route[0]).toEqual([127, expect.any(Number)]);
  });
});

describe('GPS 상태', () => {
  test('첫 점이 오기 전에는 찾는 중이다', () => {
    expect(gpsStatus(started(), at(1))).toBe('searching');
  });

  test('통과한 점이 10초 넘게 없으면 다시 찾는 중이다', () => {
    const s = walk(started(), 0, 3);
    expect(gpsStatus(s, at(10))).toBe('ok');
    expect(gpsStatus(s, at(14))).toBe('searching');
  });

  test('오차 때문에 15초 넘게 버려지면 불안정이다', () => {
    let s = walk(started(), 0, 1);
    for (let sec = 2; sec <= 20; sec++) s = applyFix(s, fix(sec, 0, 60));
    expect(gpsStatus(s, at(12))).toBe('searching');
    expect(gpsStatus(s, at(20))).toBe('unstable');
    s = applyFix(s, fix(21, 0.0001));
    expect(gpsStatus(s, at(21))).toBe('ok');
  });

  test('재개 직후에는 찾는 중부터 다시 시작한다', () => {
    let s = walk(started(), 0, 3);
    s = resume(pause(s, at(4)), at(5));
    expect(gpsStatus(s, at(5))).toBe('searching');
  });
});

describe('배너 슬롯', () => {
  const none = { locationOff: false, offline: false, connecting: false, gps: 'ok' as const, paused: false };

  test('한 번에 하나, 위치 꺼짐이 가장 먼저다', () => {
    expect(bannerFor({ ...none, locationOff: true, offline: true, paused: true })).toBe('locationOff');
    expect(bannerFor({ ...none, offline: true, gps: 'searching' })).toBe('offline');
    expect(bannerFor({ ...none, connecting: true, gps: 'unstable' })).toBe('connecting');
    expect(bannerFor({ ...none, gps: 'searching', paused: true })).toBe('searching');
    expect(bannerFor({ ...none, gps: 'unstable', paused: true })).toBe('unstable');
    expect(bannerFor({ ...none, paused: true })).toBe('paused');
    expect(bannerFor(none)).toBeNull();
  });

});

describe('실시간 전송', () => {
  test('위치 공유를 끈 활동은 location 만 null 이고 나머지는 보낸다', () => {
    let s = walk({ ...started(), locationShared: false }, 0, 3);
    s = addItems(s, [{ category: 'CAN', quantity: 2 }]);
    expect(livePayload(s, at(4))).toEqual({ activityId: 'a1', location: null, distanceM: Math.round(s.distanceM), itemCount: 2, elapsedSec: 4, paused: false });
  });

  test('공유 중이면 마지막 통과 점을 lng·lat 로 보낸다', () => {
    const s = walk(started(), 0, 3);
    expect(livePayload(s, at(4)).location).toEqual({ lng: 127, lat: expect.any(Number) });
  });
});

describe('배경 알림 문구', () => {
  test('활동 중·일시정지 중 제목이 다르고 본문은 거리·시간·개수다', () => {
    const s = addItems(started(), [{ category: 'CAN', quantity: 17 }]);
    expect(trackingNotice(s, at(2530))).toEqual({ title: '가치줍깅 · 활동 중', body: '0m · 42:10 · 17개' });
    expect(trackingNotice(pause(s, at(2530)), at(2600)).title).toBe('가치줍깅 · 일시정지 중');
  });
});

describe('위치가 돌아오면', () => {
  test('새 선을 시작하고 끊긴 동안의 이동을 잇지 않는다', () => {
    let s = walk(started(), 0, 3);
    s = restartLine(s, at(30));
    s = applyFix(s, fix(31, 0.01));
    expect(s.segments).toHaveLength(2);
    expect(s.segments[1]).toHaveLength(1);
    expect(gpsStatus(restartLine(s, at(40)), at(40))).toBe('searching');
  });

  test('빈 구간만 있으면 구간을 더 늘리지 않는다', () => {
    expect(restartLine(started(), at(1)).segments).toHaveLength(1);
  });
});

describe('지표 카드 읽기', () => {
  test('네 칸을 한 문장으로, 걸음 미측정은 "걸음수 없음"', () => {
    const s = addItems(started(), [{ category: 'CAN', quantity: 17 }]);
    expect(metricsLabel(s, at(2530))).toBe('줍기 17개, 활동 시간 42분 10초, 이동 거리 0미터, 걸음수 없음');
  });

  test('1시간 넘으면 시간부터, 1km 넘으면 킬로미터', () => {
    const s = { ...started(), distanceM: 2100, steps: 3200 };
    expect(metricsLabel(s, at(3730))).toBe('줍기 0개, 활동 시간 1시간 2분 10초, 이동 거리 2.1킬로미터, 3200걸음');
  });
});

describe('줍기 합계', () => {
  test('카테고리별로 쌓고 되돌리면 뺀다', () => {
    let s = addItems(started(), [{ category: 'CAN', quantity: 2 }, { category: 'PAPER', quantity: 1 }]);
    expect(s.itemCount).toBe(3);
    expect(s.byCategory).toEqual({ CAN: 2, PAPER: 1 });
    s = removeItem(s, { category: 'PAPER', quantity: 1 });
    expect(s.byCategory).toEqual({ CAN: 2 });
    expect(s.itemCount).toBe(2);
  });
});
