function isDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  // 2월 30일처럼 Date 가 다음 달로 넘겨 버리는 값을 걸러 낸다
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}

export function exportRangeError(from: string, to: string): string | null {
  if (!isDate(from) || !isDate(to)) return '날짜를 2026-09-01 처럼 입력해 주세요.';
  return from > to ? '시작일은 종료일보다 앞서야 해요.' : null;
}

// ponytail: 파일명 규칙은 3-4 미결. 정해지면 여기만 바꾼다
export function exportFileName(from: string, to: string): string {
  return `crew-records_${from}_${to}.csv`;
}

const CSV_HEADER = '날짜,크루원,시작,종료,거리(m),시간(초),총개수,담배꽁초,캔,플라스틱,종이,유리,비닐,일반';

// ponytail: text/csv 라 목 생성기가 못 옮긴다. 실 API 가 붙으면 GET /crew/export?from&to 응답 본문으로 바꾼다
export async function fetchCrewCsv(from: string, _to: string): Promise<string> {
  // 엑셀이 UTF-8 로 읽도록 BOM 을 붙인다 (계약과 같다)
  return `﻿${CSV_HEADER}\n${from},관열,09:02,09:48,3120,2520,27,14,3,6,2,0,2,0\n`;
}
