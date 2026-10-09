let mockRead!: (value: string | null) => void;
jest.mock('expo-secure-store', () => ({
  getItemAsync: () => new Promise((r) => { mockRead = r; }),
  setItemAsync: async () => {},
  deleteItemAsync: async () => {},
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
