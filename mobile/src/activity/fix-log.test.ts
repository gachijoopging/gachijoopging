import { ANON_ORIGIN, anonymize, fixLogLine, parseFixLog } from './fix-log';
import { distanceM } from './location-filter';

const a = { latitude: 37.501, longitude: 127.039, accuracy: 8, timestamp: 1_700_000_000_000 };
const b = { latitude: 37.5011, longitude: 127.0391, accuracy: null, timestamp: 1_700_000_003_000 };

test('기록한 줄을 그대로 다시 읽는다 — 오차 null 도 보존', () => {
  expect(parseFixLog(fixLogLine(a) + fixLogLine(b))).toEqual([a, b]);
});

test('쓰다 끊긴 마지막 줄과 깨진 줄은 건너뛴다', () => {
  expect(parseFixLog(fixLogLine(a) + 'not json\n' + fixLogLine(b).slice(0, 12))).toEqual([a]);
});

test('익명화하면 첫 점이 기준점·0초가 되고, 점 사이 거리와 시간 간격은 그대로다', () => {
  const walk = [a, { ...b, accuracy: 5 }, { latitude: 37.5031, longitude: 127.0412, accuracy: 6, timestamp: 1_700_000_060_000 }];
  const out = anonymize(walk);
  expect(out[0]).toMatchObject({ ...ANON_ORIGIN, timestamp: 0 });
  expect(out.map((f) => f.timestamp)).toEqual([0, 3000, 60_000]);
  expect(out.map((f) => f.accuracy)).toEqual([8, 5, 6]);
  for (let i = 1; i < walk.length; i++) {
    const before = distanceM(walk[i - 1], walk[i]);
    expect(Math.abs(distanceM(out[i - 1], out[i]) - before) / before).toBeLessThan(0.002);
  }
});

test('기준점과 위도가 크게 다른 곳(부산)에서 걸은 동서 거리도 그대로다', () => {
  const t0 = { latitude: 35.1, longitude: 129.0, accuracy: 5, timestamp: 0 };
  const t1 = { latitude: 35.1, longitude: 129.001, accuracy: 5, timestamp: 3000 };
  const [o0, o1] = anonymize([t0, t1]);
  const before = distanceM(t0, t1);
  expect(Math.abs(distanceM(o0, o1) - before) / before).toBeLessThan(0.002);
});
