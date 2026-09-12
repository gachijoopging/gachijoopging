import { createMockClient, ApiError } from './client';
import { MOCKS } from './mocks.generated';

describe('목 클라이언트', () => {
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
});
