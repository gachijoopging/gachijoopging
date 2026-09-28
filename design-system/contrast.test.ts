/**
 * 색 토큰의 대비 불변식 검증.
 *
 * 이 파일이 이 패키지에서 가장 중요합니다. 색은 손으로 옮기다 한 글자만 틀려도
 * 대비가 조용히 깨지고, 실기기에서 보기 전까지 아무도 모릅니다. 브랜드 색을
 * 조정할 때도 여기가 안전망입니다.
 *
 *   node --test contrast.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { light, dark, type Palette } from './tokens/colors.ts';

/** WCAG 2.x 상대 휘도 */
function luminance(hex: string): number {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) throw new Error(`대비 계산은 #RRGGBB 만 받습니다: ${hex}`);
  const n = parseInt(m[1], 16);
  const channel = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return (
    0.2126 * channel((n >> 16) & 0xff) +
    0.7152 * channel((n >> 8) & 0xff) +
    0.0722 * channel(n & 0xff)
  );
}

/** WCAG 2.x 대비비. 1 ~ 21 */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const round = (n: number) => Math.round(n * 100) / 100;

/** 반투명 rgba() 토큰을 불투명 바탕 위에 얹었을 때 실제로 보이는 #RRGGBB */
function over(rgba: string, bg: string): string {
  const m = /^rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)$/.exec(rgba);
  if (!m) throw new Error(`rgba() 가 아닙니다: ${rgba}`);
  const a = Number(m[4]);
  const b = parseInt(bg.slice(1), 16);
  const mix = (c: number, shift: number) => Math.round(c * a + ((b >> shift) & 0xff) * (1 - a));
  const hex = (n: number) => n.toString(16).padStart(2, '0');
  return `#${hex(mix(+m[1], 16))}${hex(mix(+m[2], 8))}${hex(mix(+m[3], 0))}`;
}

function atLeast(fg: string, bg: string, min: number, label: string) {
  const ratio = contrast(fg, bg);
  assert.ok(
    ratio >= min,
    `${label}: ${round(ratio)}:1 — ${min}:1 이상이어야 합니다 (${fg} on ${bg})`,
  );
}

const themes: Array<[string, Palette]> = [
  ['light', light],
  ['dark', dark],
];

// ── 불변식 1 ────────────────────────────────────────────────────────
// 잉크 4단은 bg 와 surface **양쪽 모두** 에서 본문 대비를 지킵니다.
// 이 "양쪽" 조건이 bg 를 얼마나 어둡게 내릴 수 있는지의 상한을 잡습니다.
for (const [name, p] of themes) {
  test(`${name}: 잉크 4단이 bg·surface 양쪽에서 4.5:1`, () => {
    for (const key of ['ink', 'inkMuted', 'inkFaint', 'inkHint'] as const) {
      atLeast(p[key], p.bg, 4.5, `${name}.${key} on bg`);
      atLeast(p[key], p.surface, 4.5, `${name}.${key} on surface`);
    }
  });
}

// ── 불변식 2 ────────────────────────────────────────────────────────
// 카드가 그림자 없이도 층으로 읽혀야 합니다. Android 8.1 이하에서는
// boxShadow 가 그려지지 않으므로 이 명도 차이가 유일한 층 신호입니다.
for (const [name, p] of themes) {
  test(`${name}: surface 가 bg 위에서 층으로 읽힌다`, () => {
    atLeast(p.surface, p.bg, 1.25, `${name}.surface on bg`);
  });
}

// ── 불변식 3 ────────────────────────────────────────────────────────
// 선택된 탭·하단 내비 알약은 비텍스트 UI 라 WCAG SC 1.4.11 의 3:1 을 받습니다.
for (const [name, p] of themes) {
  test(`${name}: deep 채움이 surface 위에서 3:1 (SC 1.4.11)`, () => {
    atLeast(p.deep, p.surface, 3, `${name}.deep on surface`);
  });
}

// ── 채움 위의 글자 ──────────────────────────────────────────────────
// 라임은 야간에도 밝게 남으므로 onLime 은 두 테마 모두 어둡습니다.
// deep 은 반대로 야간에 밝아지므로 onDeep·onDark 가 쌍으로 반전됩니다.
for (const [name, p] of themes) {
  test(`${name}: 채움 위의 글자·아이콘`, () => {
    atLeast(p.onLime, p.lime, 4.5, `${name}.onLime on lime`);
    atLeast(p.onLime, p.yellow, 4.5, `${name}.onLime on yellow`);
    atLeast(p.onDeep, p.deep, 4.5, `${name}.onDeep on deep`);
    atLeast(p.onDark, p.deep, 4.5, `${name}.onDark on deep`);
    atLeast(p.kakaoInk, p.kakao, 4.5, `${name}.kakaoInk on kakao`);
  });
}

// ── 상태 색 ─────────────────────────────────────────────────────────
for (const [name, p] of themes) {
  test(`${name}: 상태 잉크가 짝 배경 위에서 4.5:1`, () => {
    atLeast(p.warnInk, p.warnBg, 4.5, `${name}.warnInk on warnBg`);
    atLeast(p.warnInk, p.warnBgSoft, 4.5, `${name}.warnInk on warnBgSoft`);
    atLeast(p.dangerInk, p.dangerBg, 4.5, `${name}.dangerInk on dangerBg`);
    atLeast(p.infoInk, p.infoBg, 4.5, `${name}.infoInk on infoBg`);
    atLeast(p.neutralInk, p.neutral, 4.5, `${name}.neutralInk on neutral`);
  });
}

// ── surface 위의 텍스트 색 ──────────────────────────────────────────
for (const [name, p] of themes) {
  test(`${name}: surface 위 텍스트 색이 4.5:1`, () => {
    atLeast(p.error, p.surface, 4.5, `${name}.error on surface`);
    atLeast(p.greenText, p.surface, 4.5, `${name}.greenText on surface`);
    atLeast(p.greenStrong, p.surface, 4.5, `${name}.greenStrong on surface`);
  });
}

// ── 아바타 배경 ─────────────────────────────────────────────────────
// 아바타 위에는 이니셜 글자가 얹힙니다.
for (const [name, p] of themes) {
  test(`${name}: 아바타 배경 위 이니셜이 4.5:1`, () => {
    for (const [key, bg] of Object.entries(p.avatar)) {
      atLeast(p.ink, bg, 4.5, `${name}.ink on avatar.${key}`);
    }
  });
}

// ── 컴포넌트가 조합해 만드는 쌍 ─────────────────────────────────────
//
// 위 검사들은 토큰끼리의 쌍만 봤습니다. 실제로 대비가 깨진 자리는 컴포넌트가
// 두 토큰을 붙이는 곳이었습니다 — Badge 가 `white` 를 `error` 위에 얹어 다크에서
// 2.53:1 이 됐는데, 어느 토큰도 단독으로는 잘못되지 않아 아무도 못 봤습니다.
//
// 그래서 컴포넌트가 실제로 만드는 쌍을 여기에 적습니다. 새 컴포넌트가 토큰 두 개를
// 겹쳐 놓을 때마다 한 줄씩 늘리세요.
for (const [name, p] of themes) {
  test(`${name}: 컴포넌트가 겹쳐 놓는 색 쌍`, () => {
    // Badge
    atLeast(p.onError, p.error, 4.5, `${name} Badge danger`);
    atLeast(p.onDark, p.deep, 4.5, `${name} Badge deep`);
    atLeast(p.onLime, p.lime, 4.5, `${name} Badge lime`);
    atLeast(p.neutralInk, p.neutral, 4.5, `${name} Badge neutral`);
    atLeast(p.warnInk, p.warnBg, 4.5, `${name} Badge warn`);

    // Banner neutral
    atLeast(p.neutralInk, p.neutral, 4.5, `${name} Banner neutral`);

    // Chip overlay · 사진 위. 가장 밝은 사진(흰색)이 최악입니다
    atLeast(p.onPhoto, over(p.photoBadge, p.white), 4.5, `${name} Chip overlay`);

    // Button
    atLeast(p.ink, p.softChip, 4.5, `${name} Button soft`);
    atLeast(p.kakaoInk, p.kakao, 4.5, `${name} Button kakao`);
    atLeast(p.inkMuted, p.track, 4.5, `${name} Button primary 비활성`);

    // Tabs · 비선택 라벨은 트랙 위에 얹힙니다
    atLeast(p.inkMuted, p.track, 4.5, `${name} Tabs 비선택`);

    // Field · 자리표시 문구와 비활성 채움
    atLeast(p.inkHint, p.surface, 4.5, `${name} Field placeholder`);
    atLeast(p.ink, p.neutral, 4.5, `${name} Field 비활성`);

    // Snackbar · 딥 채움 위의 본문과 액션
    atLeast(p.onDark, p.deep, 4.5, `${name} Snackbar 본문`);
    atLeast(p.onDark, p.deep, 4.5, `${name} Snackbar 액션`);

    // Dot · 글자 없는 상태 점. 서피스·배경, 선택된 달력 칸(deep) 위
    atLeast(p.deep, p.surface, 3, `${name} Dot 서피스`);
    atLeast(p.deep, p.bg, 3, `${name} Dot 배경`);
    atLeast(p.onDark, p.deep, 3, `${name} Dot onDeep`);

    // Tile dark
    atLeast(p.onDark, p.deep, 4.5, `${name} Tile dark`);
  });
}

// ── 비텍스트 UI (WCAG SC 1.4.11 · 3:1) ─────────────────────────────
for (const [name, p] of themes) {
  test(`${name}: 비텍스트 UI 요소가 3:1`, () => {
    atLeast(p.deep, p.surface, 3, `${name} 선택 채움 · 라디오 채운 점`);
    atLeast(p.inkHint, p.surface, 3, `${name} 라디오 미선택 윤곽`);
    atLeast(p.error, p.surface, 3, `${name} Field 오류 테두리`);
    // Button ghost · 채움이 없어 테두리만이 버튼 경계다. 화면 배경과 카드 양쪽에 놓인다
    atLeast(p.inkHint, p.bg, 3, `${name} Button ghost 테두리 (배경)`);
    atLeast(p.inkHint, p.surface, 3, `${name} Button ghost 테두리 (카드)`);
    atLeast(p.border, p.surface, 1.2, `${name} 카드 테두리 (층 신호)`);

    // IconCircle · 아이콘은 비텍스트라 3:1. tint 는 반투명이라 서피스 위에 얹어 봅니다
    atLeast(p.ink, over(p.tint, p.surface), 3, `${name} IconCircle tint`);
    atLeast(p.neutralInk, p.neutral, 3, `${name} IconCircle neutral`);
    atLeast(p.ink, p.surface, 3, `${name} IconCircle surface`);
    atLeast(p.onDeep, p.deep, 3, `${name} IconCircle deep`);
    atLeast(p.onLime, p.lime, 3, `${name} IconCircle lime`);
    atLeast(p.onLime, p.orange, 3, `${name} IconCircle orange`);

    // 리플 · 눌림이 서피스 위에서 보여야 합니다
    atLeast(over(p.ripple, p.surface), p.surface, 1.1, `${name} 리플`);

    // SelectRow 의 라임 테두리는 일부러 검사하지 않습니다. 밝은 서피스 위에서
    // 1.41:1 이라 3:1 에 구조적으로 닿을 수 없고, 상태는 위의 라디오가 집니다.
    // 라임을 유일한 선택 표시로 쓰는 컴포넌트를 새로 만들지 마세요.
  });
}
