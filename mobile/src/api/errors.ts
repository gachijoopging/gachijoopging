export type ApiErrorField = { field: string; code: string };

/** 화면은 code 로 분기한다. message 는 개발자용이라 화면에 쓰지 않는다 */
export class ApiError extends Error {
  constructor(
    readonly code: string,
    readonly fields?: readonly ApiErrorField[],
    readonly status?: number,
    readonly requestId?: string,
  ) {
    super(code);
  }
}

/** 서버에 닿지 못한 실패. 오프라인 큐는 이것만 나중에 다시 보낸다 — 서버가 거절한 요청은 다시 보내도 같다 */
export class NetworkError extends ApiError {
  constructor(readonly code: 'OFFLINE' | 'TIMEOUT') {
    super(code);
  }
}

/** backend global/error/ErrorResponse 봉투. 봉투가 아니면(프록시 502 등) INTERNAL */
export function fromEnvelope(status: number, body: unknown): ApiError {
  const e = body as { code?: unknown; fields?: ApiErrorField[]; requestId?: string } | null;
  if (typeof e?.code !== 'string') return new ApiError('INTERNAL', undefined, status);
  return new ApiError(e.code, e.fields, status, e.requestId);
}
