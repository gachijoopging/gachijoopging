// 네이티브 모듈은 쓸 때 불러온다. client.ts 를 거쳐 오류 매핑만 쓰는 화면 테스트까지 SecureStore 를 요구하지 않게
const store = (): typeof import('expo-secure-store') => require('expo-secure-store');

export type TokenPair = { accessToken: string; refreshToken: string };

const KEY = 'auth-tokens';
let cached: TokenPair | null | undefined;

export async function getTokens(): Promise<TokenPair | null> {
  if (cached === undefined) {
    try {
      const value = JSON.parse((await store().getItemAsync(KEY)) ?? 'null');
      cached = typeof value?.accessToken === 'string' && typeof value.refreshToken === 'string' ? value : null;
    } catch { cached = null; }
  }
  return cached ?? null;
}

export async function setTokens(pair: TokenPair): Promise<void> {
  cached = { accessToken: pair.accessToken, refreshToken: pair.refreshToken };
  await store().setItemAsync(KEY, JSON.stringify(cached));
}

export async function clearTokens(): Promise<void> {
  cached = null;
  await store().deleteItemAsync(KEY);
}
