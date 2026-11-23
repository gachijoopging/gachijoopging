import { kstDate } from './calendar';

function isDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  // 2월 30일처럼 Date 가 다음 달로 넘겨 버리는 값을 걸러 낸다
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}

// 숫자 자판에는 하이픈이 없어서, 숫자만 받고 자리에 맞춰 하이픈을 넣는다
export function formatDateInput(raw: string): string {
  const d = raw.replace(/\D/g, '').slice(0, 8);
  return [d.slice(0, 4), d.slice(4, 6), d.slice(6)].filter(Boolean).join('-');
}

export function exportRangeError(from: string, to: string): string | null {
  if (!isDate(from) || !isDate(to)) return '날짜를 2026-09-01 처럼 입력해 주세요.';
  return from > to ? '시작일은 종료일보다 앞서야 해요.' : null;
}

// 엑셀이 UTF-8 로 읽도록 BOM 을 붙인다 (계약과 같다)
export function csvFileText(text: string): string {
  return `﻿${text.replace(/^﻿/, '')}`;
}

export function defaultExportRange(now = new Date()): { from: string; to: string } {
  const to = kstDate(now.toISOString());
  return { from: `${to.slice(0, 8)}01`, to };
}
