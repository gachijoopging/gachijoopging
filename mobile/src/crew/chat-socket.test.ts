import { createMockChatSocket, reconnectWithBackoff, type ChatSocketStatus } from './chat-socket';

const author = { id: 'u1', nickname: '관열', photoUrl: null, withdrawn: false };

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

describe('목 소켓 끊김', () => {
  const statuses = (socket: ReturnType<typeof createMockChatSocket>) => {
    const seen: ChatSocketStatus[] = [];
    socket.onStatus((s) => seen.push(s));
    return seen;
  };

  test('그냥 끊기면 연결 중이 됐다가 스스로 다시 열린다', async () => {
    const socket = createMockChatSocket({ author });
    const seen = statuses(socket);
    socket.simulateDrop();
    await jest.advanceTimersByTimeAsync(1000);
    expect(seen).toEqual(['open', 'connecting', 'open']);
  });

  test('토큰 만료(4401)·소속 없음(4403)은 스스로 다시 붙지 않고 사유를 알린다', async () => {
    const socket = createMockChatSocket({ author });
    const seen = statuses(socket);
    socket.simulateDrop(4401);
    await jest.advanceTimersByTimeAsync(60_000);
    expect(seen).toEqual(['open', { closed: 4401 }]);
  });

  test('토큰을 갱신한 뒤 reconnect 하면 다시 열린다', async () => {
    const socket = createMockChatSocket({ author });
    const seen = statuses(socket);
    socket.simulateDrop(4401);
    socket.reconnect();
    await jest.advanceTimersByTimeAsync(0);
    expect(seen).toEqual(['open', { closed: 4401 }, 'connecting', 'open']);
  });
});
