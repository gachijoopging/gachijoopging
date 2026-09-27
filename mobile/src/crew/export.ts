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
