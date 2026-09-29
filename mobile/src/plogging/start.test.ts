import { ApiError, type Activity, type ApiClient } from '../api/client';
import { MOCKS } from '../api/mocks.generated';
import { activeSec, activityMetrics, activitySummaryLabel, startActivity } from './start';

const base: Activity = { ...MOCKS['POST /activities'].data, startedAt: '2026-09-29T09:00:00Z' };
const at = (iso: string) => Date.parse(iso);

describe('활동 시간', () => {
  test('시작부터 지금까지에서 일시정지 누적을 뺀다', () => {
    expect(activeSec({ ...base, pausedSec: 600 }, at('2026-09-29T09:52:00Z'))).toBe(42 * 60);
  });

  test('일시정지 중이면 pausedAt 이후는 쌓지 않는다', () => {
    const paused = { ...base, paused: true, pausedAt: '2026-09-29T09:30:00Z' };
    expect(activeSec(paused, at('2026-09-29T11:00:00Z'))).toBe(30 * 60);
  });

  test('기기 시계가 시작 시각보다 뒤처져도 0 아래로 내려가지 않는다', () => {
    expect(activeSec(base, at('2026-09-29T08:59:00Z'))).toBe(0);
  });
});

describe('요약 수치', () => {
  const act = { ...base, distanceM: 1234, itemCount: 17, paused: true, pausedAt: '2026-09-29T09:42:00Z' };

  test('거리 · 시간 · 줍기 세 칸, 일시정지 중이면 시간이 멈춰 흐리다', () => {
    expect(activityMetrics(act, at('2026-09-29T10:00:00Z'))).toEqual([
      { value: '1.2km', label: '거리' },
      { value: '42분', label: '시간', muted: true },
      { value: '17개', label: '줍기' },
    ]);
  });

  test('진행 중이면 시간이 흐리지 않다', () => {
    const running = { ...act, paused: false, pausedAt: null };
    expect(activityMetrics(running, at('2026-09-29T09:42:00Z'))[1]).toEqual({ value: '42분', label: '시간', muted: false });
  });

  test('스크린리더는 한 문장으로 단위를 풀어 읽는다', () => {
    const running = { ...act, paused: false, pausedAt: null };
    expect(activitySummaryLabel(running, at('2026-09-29T09:42:00Z'))).toBe('진행 중인 활동, 1.2킬로미터, 42분, 17개');
  });

  test('일시정지 중이면 그것도 읽는다', () => {
    expect(activitySummaryLabel(act, at('2026-09-29T10:00:00Z'))).toBe('진행 중인 활동, 1.2킬로미터, 42분, 17개, 일시정지 중');
  });

  test('1km 미만은 미터로 읽는다', () => {
    const near = { ...act, paused: false, pausedAt: null, distanceM: 820 };
    expect(activitySummaryLabel(near, at('2026-09-29T09:42:00Z'))).toBe('진행 중인 활동, 820미터, 42분, 17개');
  });
});

describe('활동 시작', () => {
  const body = { id: 'u1', startedAt: '2026-09-29T09:00:00Z', locationShared: true };
  const client = (post: () => Promise<unknown>, current: Activity | null = null): ApiClient => ({
    get: async () => ({ data: current }) as never,
    mutate: post as never,
  });

  test('201 이면 시작 — 시계는 앱이 보낸 시작 시각과 공유 설정으로 연다', async () => {
    await expect(startActivity(client(async () => ({ data: { ...base, id: 'u1' } })), body))
      .resolves.toEqual({ kind: 'started', id: 'u1', startedAt: body.startedAt, locationShared: true });
  });

  test('네트워크 실패는 실패', async () => {
    await expect(startActivity(client(async () => { throw new TypeError('Network request failed'); }), body))
      .resolves.toEqual({ kind: 'failed' });
  });

  test('NO_CREW 는 따로 알린다', async () => {
    await expect(startActivity(client(async () => { throw new ApiError('NO_CREW'); }), body))
      .resolves.toEqual({ kind: 'noCrew' });
  });

  test('409 면 진행 중인 활동으로 이어간다', async () => {
    const api = client(async () => { throw new ApiError('CONFLICT'); }, { ...base, id: 'other' });
    await expect(startActivity(api, body)).resolves.toEqual({ kind: 'resumed', id: 'other' });
  });

  test('409 인데 진행 중인 활동이 없으면 실패', async () => {
    await expect(startActivity(client(async () => { throw new ApiError('CONFLICT'); }), body))
      .resolves.toEqual({ kind: 'failed' });
  });

  test('409 뒤 재조회도 실패하면 실패', async () => {
    const api: ApiClient = {
      get: async () => { throw new TypeError('Network request failed'); },
      mutate: async () => { throw new ApiError('CONFLICT'); },
    };
    await expect(startActivity(api, body)).resolves.toEqual({ kind: 'failed' });
  });
});
