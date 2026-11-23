import { ApiError, type ApiClient } from '../api/client';
import { MOCKS } from '../api/mocks.generated';
import { completeSignIn } from './complete-sign-in';

const navigation = () => ({ reset: jest.fn() });

describe('로그인 뒤 공통 꼬리', () => {
  test('내 정보와 동의를 받아 스택을 한 장으로 바꾼다', async () => {
    const api = { get: jest.fn(async (key: string) => (MOCKS as Record<string, unknown>)[key]) } as unknown as ApiClient;
    const nav = navigation();
    await completeSignIn(api, nav);
    expect(nav.reset).toHaveBeenCalledWith({ index: 0, routes: [{ name: expect.any(String) }] });
  });

  test('내 정보 조회가 실패하면 그대로 던진다 — 호출자는 인증을 다시 하지 않고 이 함수만 재시도한다', async () => {
    const api = { get: jest.fn(async () => { throw new ApiError('MOCK_FAILURE'); }) } as unknown as ApiClient;
    const nav = navigation();
    await expect(completeSignIn(api, nav)).rejects.toBeInstanceOf(ApiError);
    expect(nav.reset).not.toHaveBeenCalled();
  });
});
