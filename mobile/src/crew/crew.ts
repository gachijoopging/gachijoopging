export function spelledCode(code: string): string {
  return code.replace(/[^0-9A-Za-z]/g, '').split('').join(' ');
}

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

export function monthDay(iso: string): string {
  const kst = new Date(new Date(iso).getTime() + KST_OFFSET_MS);
  return `${kst.getUTCMonth() + 1}월 ${kst.getUTCDate()}일`;
}
