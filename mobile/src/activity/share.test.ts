import { routeStrokes, shareLines } from './share';

const p = (latitude: number, longitude: number) => ({ latitude, longitude });

describe('공유 이미지 경로', () => {
  test('경로를 틀 안에 맞춰 선분으로 바꾼다 — 동서로 곧은 길은 수평선 하나', () => {
    const [s] = routeStrokes([[p(37.5, 127), p(37.5, 127.01)]], 200, 100);
    expect(s.length).toBeCloseTo(200, 0);
    expect(s.angle).toBeCloseTo(0, 5);
  });

  test('가로세로 비율을 지킨다 — 남북 1km 는 동서 1km 와 같은 길이로 그린다', () => {
    const km = 1 / 111.32;
    const [ns] = routeStrokes([[p(37.5, 127), p(37.5 + km, 127)]], 100, 100);
    const [ew] = routeStrokes([[p(37.5, 127), p(37.5, 127 + km / Math.cos((37.5 * Math.PI) / 180))]], 100, 100);
    expect(ns.length).toBeCloseTo(ew.length, 0);
  });

  test('구간 사이는 잇지 않는다', () => {
    expect(routeStrokes([[p(37.5, 127), p(37.5, 127.01)], [p(37.51, 127), p(37.51, 127.01)]], 100, 100)).toHaveLength(2);
  });

  test('점이 하나뿐이거나 없으면 그릴 것이 없다', () => {
    expect(routeStrokes([[p(37.5, 127)]], 100, 100)).toEqual([]);
    expect(routeStrokes([], 100, 100)).toEqual([]);
    // 제자리에서만 기록된 경로
    expect(routeStrokes([[p(37.5, 127), p(37.5, 127)]], 100, 100)).toEqual([]);
  });
});

describe('공유 이미지 문구', () => {
  const base = { startedAt: '2026-09-07T00:02:00Z', endedAt: '2026-09-07T00:48:00Z', durationSec: 2520, distanceM: 3120, itemCount: 27 };
  test('날짜·시각·시간·거리·걸음·줍기, 걸음 미측정이면 걸음 칸을 뺀다', () => {
    expect(shareLines({ ...base, steps: 4100 }).map((l) => l.label)).toEqual(['활동 시간', '이동 거리', '걸음', '줍기']);
    expect(shareLines({ ...base, steps: null }).map((l) => l.label)).toEqual(['활동 시간', '이동 거리', '줍기']);
  });

  test('짧은 활동의 시간은 화면과 같게 초로 적는다', () => {
    expect(shareLines({ ...base, durationSec: 40, steps: null })[0]).toEqual(expect.objectContaining({ label: '활동 시간', value: '40초' }));
    expect(shareLines({ ...base, steps: null })[1].value).toBe('3.1km');
  });
});
