// 네이티브 모듈은 쓸 때 불러온다. client.ts 를 거쳐 오류 매핑만 쓰는 화면 테스트까지 SecureStore 를 요구하지 않게
const store = (): typeof import('expo-secure-store') => require('expo-secure-store');

export type TokenPair = { accessToken: string; refreshToken: string };

const KEY = 'auth-tokens';
let cached: TokenPair | null | undefined;

export async function getTokens(): Promise<TokenPair | null> {
  if (cached === undefined) {
    let read: TokenPair | null;
    try {
      const value = JSON.parse((await store().getItemAsync(KEY)) ?? 'null');
      read = typeof value?.accessToken === 'string' && typeof value.refreshToken === 'string' ? value : null;
    } catch { read = null; }
    // 읽는 사이 로그인·로그아웃이 저장한 값이 더 새롭다
    if (cached === undefined) cached = read;
  }
  return cached ?? null;
}

/** 쓰기를 한 줄로 세운다. 로그아웃의 삭제가 다음 로그인의 저장보다 늦게 끝나 기기에 토큰이 없어지면 안 된다 */
let writing: Promise<void> = Promise.resolve();
function write(op: () => Promise<void>): Promise<void> {
  writing = writing.catch(() => {}).then(op);
  return writing;
}

export async function setTokens(pair: TokenPair): Promise<void> {
  const value = { accessToken: pair.accessToken, refreshToken: pair.refreshToken };
  cached = value;
  await write(() => store().setItemAsync(KEY, JSON.stringify(value)));
}

export async function clearTokens(): Promise<void> {
  cached = null;
  await write(() => store().deleteItemAsync(KEY));
}
