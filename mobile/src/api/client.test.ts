import { createMockClient, ApiError } from './client';
import { MOCKS } from './mocks.generated';

describe('목 클라이언트', () => {
  test('재실행 뒤 종료 목도 기기에 남은 전체 합계를 사용한다', async () => {
    const api = createMockClient({ activityTotals: () => ({ itemCount: 2, byCategory: { CAN: 2 } }) });
    const body = { id: 'a1', endedAt: '2026-09-30T00:01:00Z', durationSec: 60, pausedSec: 0, distanceM: 10, steps: null, route: [] };
    const response = await api.mutate('POST /activities/{id}/end', body);
    expect(response.data).toEqual(expect.objectContaining({ ...body, itemCount: 2, byCategory: { CAN: 2 } }));
  });

  test('openapi.yaml 의 example 을 그대로 돌려준다', async () => {
    const api = createMockClient();
    await expect(api.get('GET /crew/home')).resolves.toBe(MOCKS['GET /crew/home']);
  });

  test('지정한 키는 실패시켜 오류 UI 를 확인할 수 있다', async () => {
    const api = createMockClient({ failing: ['GET /crew/home'] });
    await expect(api.get('GET /crew/home')).rejects.toBeInstanceOf(ApiError);
  });

  test('실패 지정이 없는 키는 영향받지 않는다', async () => {
    const api = createMockClient({ failing: ['GET /crew/home'] });
    await expect(api.get('GET /users/me')).resolves.toBeDefined();
  });

  test('지연을 주면 그만큼 늦게 온다', async () => {
    const api = createMockClient({ delayMs: 30 });
    const started = Date.now();
    await api.get('GET /users/me');
    expect(Date.now() - started).toBeGreaterThanOrEqual(25);
  });

  test('mutate 는 example 이 있는 경로면 그 데이터를 돌려준다', async () => {
    const api = createMockClient();
    await expect(api.mutate('POST /auth/login', { email: 'a@b.com', password: 'password' })).resolves.toBe(
      MOCKS['POST /auth/login'],
    );
  });

  test('mutate 는 204 전용 경로(example 없음)면 값 없이 끝난다', async () => {
    const api = createMockClient();
    await expect(api.mutate('POST /auth/password-reset', { email: 'a@b.com' })).resolves.toBeUndefined();
  });

  test('mutate 도 지정한 키를 실패시킬 수 있다', async () => {
    const api = createMockClient({ failing: ['POST /auth/login'] });
    await expect(api.mutate('POST /auth/login', {})).rejects.toBeInstanceOf(ApiError);
  });
});
