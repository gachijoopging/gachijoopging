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
import type { Fix } from './location-filter';

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

/** 6초마다 21m 씩 걷는다(초속 3.5m). 평활 창이 차기 전 첫 점들도 정지 판정 반경을 벗어나 경로에 쌓인다 */
function stride(s: Session, from: number, to: number): Session {
  for (let i = from; i <= to; i++) s = applyFix(s, fix(i * 6, i * 0.00019));
  return s;
}

describe('경로와 거리', () => {
  test('필터를 통과한 점만 경로에 쌓고 거리를 더한다', () => {
    const s = stride(started(), 0, 10);
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
    let s = stride(started(), 0, 5);
    const before = s.distanceM;
    s = pause(s, at(31));
    s = stride(s, 7, 20);
    expect(s.distanceM).toBe(before);
    expect(s.segments[0]).toHaveLength(6);
    expect(s.here?.latitude).toBeCloseTo(37.5 + 18.5 * 0.00019, 4);
  });

  test('일시정지·종료 때는 정지 판정 반경 안에서 마지막으로 움직인 만큼도 경로와 거리에 넣는다', () => {
    let s = stride(started(), 0, 5);
    // 마지막 자리에 멈춰 서면 평활점이 뒤따라오다 반경 안에서 경로 끝을 지나친다. 반경은 그때 오차(25m)다
    for (const sec of [33, 36, 39, 42]) s = applyFix(s, fix(sec, 5 * 0.00019, 25));
    const lastRoute = s.segments[0][s.segments[0].length - 1];
    expect(s.here!.latitude).toBeGreaterThan(lastRoute.latitude);

    const ended = endBody(s, at(43));
    expect(ended.route).toHaveLength(s.segments[0].length + 1);
    expect(ended.distanceM).toBeGreaterThan(Math.round(s.distanceM));

    const paused = pause(s, at(43));
    expect(paused.segments[0]).toHaveLength(s.segments[0].length + 1);
    expect(paused.distanceM).toBeGreaterThan(s.distanceM);
    expect(endBody(paused, at(40)).distanceM).toBe(Math.round(paused.distanceM));
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

  test('GPS 시각이 앞섰다가 돌아오면 경로를 이어 가되 멈춘 사이 떨어진 거리는 더하지 않는다', () => {
    let s = walk(started(), 0, 5);
    s = applyFix(s, fix(2400, 0.00006)); // 40분 앞선 시각
    const before = s.distanceM;
    // 시계가 돌아온 뒤 1km 떨어진 곳에서 다시 걷는다(초속 1.1m)
    for (let sec = 10; sec <= 30; sec++) s = applyFix(s, fix(sec, 0.01 + sec * 0.00001));
    expect(s.distanceM - before).toBeGreaterThan(5);
    expect(s.distanceM - before).toBeLessThan(50);
    expect(s.segments.length).toBeGreaterThan(1);
  });

  test('걸음수 미측정(null)이면 GPS 거리를 그대로 쓴다', () => {
    const s = pause(stride(started(), 0, 10), at(61));
    expect(s.steps).toBeNull();
    expect(s.distanceM).toBeGreaterThan(100);
    expect(endBody(s, at(62)).distanceM).toBe(Math.round(s.distanceM));
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
    let s = stride(started(), 0, 2);
    s = resume(pause(s, at(13)), at(14));
    s = stride(s, 5, 6);
    expect(endBody(s, at(37)).route).toHaveLength(5);
    expect(endBody(s, at(37)).route[0]).toEqual([127, expect.any(Number)]);
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
  test('네 칸을 한 문장으로, 걸음 미측정은 "걸음수 없음". 초는 빼서 초점이 있는 동안 매초 다시 읽히지 않게', () => {
    const s = addItems(started(), [{ category: 'CAN', quantity: 17 }]);
    expect(metricsLabel(s, at(2530))).toBe('줍기 17개, 활동 시간 42분, 이동 거리 0미터, 걸음수 없음');
  });

  test('1시간 넘으면 시간부터, 1km 넘으면 킬로미터', () => {
    const s = { ...started(), distanceM: 2100, steps: 3200 };
    expect(metricsLabel(s, at(3730))).toBe('줍기 0개, 활동 시간 1시간 2분, 이동 거리 2.1킬로미터, 3200걸음');
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

describe('정지 드리프트 억제', () => {
  // 실기기(SM-S916N) 실내에서 11분간 움직이지 않고 기록한 원시 위치. 익명화돼 있다
  const still: Fix[] = require('./__fixtures__/still-indoor.json');

  const ORIGIN = { latitude: 37.5665, longitude: 126.978 };

  function replay(fixes: Fix[]) {
    const start = fixes[0].timestamp;
    let s = newSession(
      { id: 'a1', startedAt: new Date(start).toISOString(), pausedSec: 0, paused: false, pausedAt: null, itemCount: 0, locationShared: true },
      'u1',
      start,
    );
    for (const f of fixes) s = applyFix(s, f);
    return s;
  }

  test('서 있는 동안 GPS 가 흔들려도 누적 거리는 5m 미만이다', () => {
    expect(replay(still).distanceM).toBeLessThan(5);
  });

  test('서 있는 동안에도 GPS 상태는 정상이고 현재 위치는 갱신된다', () => {
    const s = replay(still);
    expect(s.here).not.toBeNull();
    expect(s.searchingSince).toBeNull();
    expect(s.lastPassAt).toBe(still[still.length - 1].timestamp);
  });

  test('야외처럼 오차 4m 안에서만 흔들려도 서 있는 동안은 거리에 넣지 않는다', () => {
    let seed = 11;
    // 축마다 ±2.83m — 어느 점이든 원점에서 4m 안이다
    const noise = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5) * 4 * Math.SQRT2;
    const outdoor: Fix[] = [];
    for (let sec = 0; sec <= 300; sec += 3) {
      outdoor.push({ latitude: ORIGIN.latitude + noise() / 111_195, longitude: ORIGIN.longitude + noise() / 88_200, accuracy: 4, timestamp: sec * 1000 });
    }
    expect(replay(outdoor).distanceM).toBeLessThan(5);
  });

  test('좁은 구역을 맴도는 보행도 거리에 넣는다 — 반경 4m 원 20바퀴', () => {
    const laps: Fix[] = [];
    for (let i = 0; i < 400; i++) {
      const t = (2 * Math.PI * i) / 20;
      laps.push({ latitude: ORIGIN.latitude + (4 * Math.sin(t)) / 111_195, longitude: ORIGIN.longitude + (4 * Math.cos(t)) / 88_200, accuracy: 1, timestamp: i * 3000 });
    }
    expect(replay(laps).distanceM / (20 * 2 * Math.PI * 4)).toBeGreaterThan(0.85);
  });

  test('10m 를 되돌아오며 왕복해도 거리에 넣는다', () => {
    const shuttle: Fix[] = [];
    for (let i = 0; i < 400; i++) {
      const k = i % 20;
      shuttle.push({ latitude: ORIGIN.latitude + (k < 10 ? k : 20 - k) / 111_195, longitude: ORIGIN.longitude, accuracy: 1, timestamp: i * 1000 });
    }
    // 평활화가 꺾이는 끝을 깎아 실제 400m 보다 짧다. 사라지지만 않으면 된다
    expect(replay(shuttle).distanceM).toBeGreaterThan(250);
  });

  test('오차 12m 잡음이 낀 400m 직선 보행은 ±15% 안으로 잰다', () => {
    // 결정적 의사난수. 같은 입력이면 같은 잡음
    let seed = 7;
    const noise = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5) * 12;
    const walk: Fix[] = [];
    for (let sec = 0; sec <= 300; sec += 3) {
      const m = (400 * sec) / 300;
      walk.push({
        latitude: ORIGIN.latitude + (m + noise()) / 111_195,
        longitude: ORIGIN.longitude + noise() / 88_200,
        accuracy: 12,
        timestamp: sec * 1000,
      });
    }
    expect(Math.abs(replay(walk).distanceM - 400) / 400).toBeLessThan(0.15);
  });
});

test('24시간 뒤의 위치는 경로·거리·현재 위치에 넣지 않는다 — 경로 점에는 시각이 없어 나중에 자를 수 없다', () => {
  const s = walk(started(), 0, 5);
  const late = applyFix(applyFix(s, { ...fix(0, 0.001), timestamp: T0 + 86_400_000 }), { ...fix(0, 0.002), timestamp: T0 + 90_000_000 });
  expect(late).toBe(s);
});

test('끝내는 시각 뒤에 시작한 일시정지는 그 시각에 활동 중이었던 것으로 센다 — 활동 시간이 24시간을 넘거나 일시정지가 음수가 되지 않는다', () => {
  const s = { ...started(), pausedSec: 600, paused: true, pausedAt: new Date(T0 + 24.5 * 3_600_000).toISOString() };
  const body = endBody(s, T0 + 86_400_000);
  expect(body).toMatchObject({ durationSec: 86_400 - 600, pausedSec: 600 });
});
