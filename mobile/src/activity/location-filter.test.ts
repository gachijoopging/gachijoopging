import {
  correctDistance,
  distanceM,
  filterFix,
  initialFilterState,
  type Fix,
  type FilterState,
} from './location-filter';

const ORIGIN = { latitude: 37.5665, longitude: 126.978 };
/** 위도 1도 ≈ 111,195m */
const northOf = (m: number) => ({ latitude: ORIGIN.latitude + m / 111_195, longitude: ORIGIN.longitude });
const fix = (m: number, sec: number, accuracy: number | null = 10): Fix => ({
  ...northOf(m),
  accuracy,
  timestamp: sec * 1000,
});

function run(fixes: Fix[]) {
  let state: FilterState = initialFilterState;
  return fixes.map((f) => {
    const r = filterFix(state, f);
    state = r.state;
    return r;
  });
}

describe('1단계 오차 반경', () => {
  test('30m 는 통과, 30m 초과는 버린다', () => {
    expect(filterFix(initialFilterState, fix(0, 0, 30)).point).not.toBeNull();
    const r = filterFix(initialFilterState, fix(0, 0, 30.1));
    expect(r.point).toBeNull();
    expect(r.point === null && r.reason).toBe('accuracy');
  });

  test('오차를 모르는 점은 버린다', () => {
    expect(filterFix(initialFilterState, fix(0, 0, null)).point).toBeNull();
  });

  test('버린 점은 상태를 바꾸지 않는다', () => {
    const r = filterFix(initialFilterState, fix(0, 0, 50));
    expect(r.state).toBe(initialFilterState);
  });
});

describe('2단계 속도', () => {
  test('초속 5m 이하는 통과한다', () => {
    const [, b] = run([fix(0, 0), fix(49, 10)]);
    expect(b.point).not.toBeNull();
  });

  test('직전 통과 점 대비 초속 5m 초과는 버린다', () => {
    const [, b] = run([fix(0, 0), fix(60, 10)]);
    expect(b.point === null && b.reason).toBe('speed');
  });

  test('튄 점을 버린 뒤에도 다음 점은 직전 통과 점과 비교한다', () => {
    const [, jump, next] = run([fix(0, 0), fix(500, 1), fix(10, 2)]);
    expect(jump.point).toBeNull();
    expect(next.point).not.toBeNull();
  });

  test('시각이 같거나 거꾸로 온 점은 버린다', () => {
    const [, b] = run([fix(0, 5), fix(1, 5)]);
    expect(b.point).toBeNull();
  });
});

describe('3단계 평활화', () => {
  test('통과한 점은 최근 점들의 평균으로 나온다', () => {
    const [, b] = run([fix(0, 0), fix(10, 10)]);
    expect(distanceM(b.point!, northOf(5))).toBeLessThan(0.01);
  });

  test('평균 창은 최근 4점이다', () => {
    const out = run([0, 10, 20, 30, 40].map((m, i) => fix(m, i * 10)));
    // 10·20·30·40 의 평균
    expect(distanceM(out[4].point!, northOf(25))).toBeLessThan(0.01);
  });
});

describe('4단계 걸음수 보정', () => {
  test('걸음 거리보다 30% 넘게 크면 걸음 거리로 보정한다', () => {
    // 100걸음 = 70m, 허용 91m
    expect(correctDistance(120, 100)).toBeCloseTo(70);
  });

  test('30% 이내면 GPS 거리를 그대로 쓴다', () => {
    expect(correctDistance(91, 100)).toBe(91);
  });

  test('걸음 미측정(null)이면 보정하지 않는다', () => {
    expect(correctDistance(120, null)).toBe(120);
  });

  test('0걸음 때문에 거리를 0으로 만들지 않는다', () => {
    expect(correctDistance(120, 0)).toBe(120);
  });
});
