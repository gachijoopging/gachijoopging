let mockRead!: (value: string | null) => void;
const mockStore = new Map<string, string>();
let mockDeleteGate: Promise<void> | null = null;
jest.mock('expo-secure-store', () => ({
  getItemAsync: () => new Promise((r) => { mockRead = r; }),
  setItemAsync: async (k: string, v: string) => { mockStore.set(k, v); },
  deleteItemAsync: async (k: string) => { await mockDeleteGate; mockStore.delete(k); },
}));
import { clearTokens, getTokens, setTokens } from './tokens';

test('처음 읽기가 끝나기 전에 저장·삭제가 있었으면 늦게 읽은 값으로 되돌리지 않는다', async () => {
  const cold = getTokens();
  await setTokens({ accessToken: 'b', refreshToken: 'r-b' });
  mockRead(JSON.stringify({ accessToken: 'a', refreshToken: 'r-a' }));
  await expect(cold).resolves.toEqual({ accessToken: 'b', refreshToken: 'r-b' });
  await expect(getTokens()).resolves.toEqual({ accessToken: 'b', refreshToken: 'r-b' });

  await clearTokens();
  await expect(getTokens()).resolves.toBeNull();
});

test('저장소 쓰기는 부른 순서대로 끝난다. 늦게 끝난 삭제가 다음 로그인 토큰을 지우지 않는다', async () => {
  let release!: () => void;
  mockDeleteGate = new Promise((r) => { release = r; });
  const cleared = clearTokens();
  const saved = setTokens({ accessToken: 'b', refreshToken: 'r-b' });
  await new Promise((r) => setTimeout(r, 0));
  release();
  await Promise.all([cleared, saved]);
  expect(mockStore.get('auth-tokens')).toBe(JSON.stringify({ accessToken: 'b', refreshToken: 'r-b' }));
});
