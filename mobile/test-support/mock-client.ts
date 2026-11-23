import { ApiError, getAndRemember, type ApiClient, type ApiResponse, type MutationKey, type MutationResponse, type QueryKey } from '../src/api/client';
import { MOCKS, type MockKey } from '../src/api/mocks.generated';
import { kstDate } from '../src/crew/calendar';

// 목도 계약을 만족해야 한다. example 이 계약과 어긋나면 여기서 타입 오류가 난다
MOCKS satisfies { readonly [K in MockKey]: MutationResponse<K> };

export type MockOptions = {
  /** 응답 지연. 늦게 온 응답을 시험하려면 올린다 */
  delayMs?: number;
  /** 이 키들은 항상 실패한다 */
  failing?: readonly MutationKey[];
};

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

function isMockKey(key: MutationKey): key is MockKey {
  return key in MOCKS;
}

type PostsQuery = { scope?: 'CREW' | 'MINE'; from?: string; to?: string };

/** 서버처럼 scope·기간을 적용한다. 전체 탭에는 나만 보기 글이 오지 않고, 내 게시물 탭에는 내 글만 온다 */
function filterPosts({ scope = 'CREW', from, to }: PostsQuery = {}) {
  const me = MOCKS['GET /users/me'].data.id;
  const posts = MOCKS['GET /crew/posts'].data;
  const items = posts.items.filter((post) => {
    const day = kstDate(post.createdAt);
    if (scope === 'MINE' ? post.author.id !== me : post.visibility === 'PRIVATE') return false;
    return !(from && day < from) && !(to && day > to);
  });
  return { data: { ...posts, items } };
}

/** docs/openapi.yaml 의 example 을 돌려주는 테스트용 클라이언트. 앱은 쓰지 않는다 */
export function createMockClient({ delayMs = 0, failing = [] }: MockOptions = {}): ApiClient {
  async function load<K extends QueryKey>(key: K, query: unknown): Promise<ApiResponse<K>> {
    if (delayMs > 0) await wait(delayMs);
    if (failing.includes(key)) throw new ApiError('MOCK_FAILURE');
    if (key === 'GET /crew/posts') return filterPosts(query as PostsQuery) as unknown as ApiResponse<K>;
    return (MOCKS as unknown as Record<string, unknown>)[key] as ApiResponse<K>;
  }
  return {
    get: (key, query) => getAndRemember(key, query, () => load(key, query)),
    async mutate(key, body) {
      if (delayMs > 0) await wait(delayMs);
      if (failing.includes(key)) throw new ApiError('MOCK_FAILURE');
      if (key === 'POST /activities') {
        // 목의 startedAt 은 고정값이라 그대로 쓰면 시작하자마자 24시간 기한이 지난 활동이 된다
        return { data: { ...MOCKS['POST /activities'].data, ...(body as object) } } as never;
      }
      // 204 전용 경로는 example 이 없다 — 성공은 그냥 값 없이 끝난다.
      return (isMockKey(key) ? MOCKS[key] : undefined) as never;
    },
  };
}
