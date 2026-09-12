import { MOCKS, type MockKey } from './mocks.generated';

export type ApiClient = {
  get<K extends MockKey>(key: K): Promise<(typeof MOCKS)[K]>;
};

export class ApiError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

export type MockOptions = {
  /** 응답 지연. 화면의 로딩 상태를 눈으로 보려면 올린다 */
  delayMs?: number;
  /** 이 키들은 항상 실패한다. 오류·재시도 UI 를 목으로 확인하는 수단 */
  failing?: readonly MockKey[];
};

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** 실 API 가 붙기 전까지 화면이 쓰는 구현. 숫자는 docs/openapi.yaml 의 example 그대로다. */
export function createMockClient({ delayMs = 0, failing = [] }: MockOptions = {}): ApiClient {
  return {
    async get(key) {
      if (delayMs > 0) await wait(delayMs);
      if (failing.includes(key)) throw new ApiError('MOCK_FAILURE');
      return MOCKS[key];
    },
  };
}
