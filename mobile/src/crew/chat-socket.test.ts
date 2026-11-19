import { reconnectWithBackoff } from './chat-socket';

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

describe('재연결', () => {
  test('실패하면 1·2·4초 간격으로 다시 붙이고 붙으면 멈춘다', async () => {
    const attempts: number[] = [];
    const results = [false, false, true];
    reconnectWithBackoff(async () => {
      attempts.push(Date.now());
      return results.shift() ?? true;
    });
    const start = Date.now();
    await jest.advanceTimersByTimeAsync(10_000);
    expect(attempts.map((t) => t - start)).toEqual([1000, 3000, 7000]);
  });

  test('취소하면 더 붙이지 않는다', async () => {
    const connect = jest.fn(async () => false);
    const cancel = reconnectWithBackoff(connect);
    await jest.advanceTimersByTimeAsync(1000);
    cancel();
    await jest.advanceTimersByTimeAsync(60_000);
    expect(connect).toHaveBeenCalledTimes(1);
  });
});

test('연결 시도가 예외로 끝나도 다음 간격에 다시 시도한다', async () => {
  const results: Array<() => Promise<boolean>> = [
    () => Promise.reject(new Error('network')),
    async () => true,
  ];
  const connect = jest.fn(() => results.shift()!());
  reconnectWithBackoff(connect);
  await jest.advanceTimersByTimeAsync(3000);
  expect(connect).toHaveBeenCalledTimes(2);
});
