/**
 * 토큰 명세 페이지 생성기.
 *
 * 값을 손으로 옮겨 적으면 토큰과 문서가 갈라집니다. 그래서 tokens/ 에서 직접 읽어
 * HTML 을 뽑습니다. 토큰을 바꾸면 이걸 다시 돌리세요.
 *
 *   node preview.mjs
 */
import { writeFileSync } from 'node:fs';
import { light, dark, gradient } from './tokens/colors.ts';
import { space, screen, size } from './tokens/spacing.ts';
import { radius } from './tokens/radius.ts';
import { fontSize, lineHeight, fontFamily } from './tokens/typography.ts';
import { shadow, androidElevation, borderWidth } from './tokens/elevation.ts';

// ── 대비 계산 (contrast.test.ts 와 같은 공식) ──────────────────────
const lum = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * ch((n >> 16) & 255) + 0.7152 * ch((n >> 8) & 255) + 0.0722 * ch(n & 255);
};
const cr = (a, b) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
const r2 = (n) => n.toFixed(2);

// ── 색 그룹 ────────────────────────────────────────────────────────
const groups = [
  ['배경과 표면', ['bg', 'surface', 'surface85', 'surface70', 'surface40', 'tint']],
  ['잉크', ['ink', 'inkMuted', 'inkFaint', 'inkHint', 'ink65', 'onDark', 'onPhoto', 'inkShadow']],
  ['브랜드', ['deep', 'lime', 'lime35', 'lime28', 'yellow', 'onDeep', 'onLime', 'greenText', 'greenStrong', 'route']],
  ['선과 구분', ['border', 'borderDashed', 'borderDotted', 'handle', 'track']],
  ['중립 칩', ['neutral', 'neutralInk', 'softChip']],
  ['상태', ['warnBg', 'warnBgSoft', 'warnBorder', 'warnInk', 'dangerBg', 'dangerInk', 'infoBg', 'infoInk', 'error', 'orange']],
  ['그림자 색', ['shadow', 'shadowLime', 'shadowDeep']],
  ['오버레이', ['black50', 'scrim', 'photoBadge']],
  ['외부 브랜드', ['kakao', 'kakaoInk']],
];

const swatchRow = (name, l, d) => `
      <div class="tk">
        <code class="tk-name">${name}</code>
        <div class="tk-side"><span class="chip" style="background:${l}"></span><code>${l}</code></div>
        <div class="tk-side"><span class="chip chip-d" style="background:${d}"></span><code>${d}</code></div>
      </div>`;

const colorSections = groups.map(([label, keys]) => `
    <section class="grp">
      <h3>${label}</h3>
      <div class="tk-head"><span></span><span>라이트</span><span>다크</span></div>
      ${keys.map((k) => swatchRow(k, light[k], dark[k])).join('')}
    </section>`).join('');

const subGroup = (label, key) => `
    <section class="grp">
      <h3>${label}</h3>
      <div class="tk-head"><span></span><span>라이트</span><span>다크</span></div>
      ${Object.keys(light[key]).map((k) => swatchRow(`${key}.${k}`, light[key][k], dark[key][k])).join('')}
    </section>`;

// ── 대비 불변식 (contrast.test.ts 와 같은 쌍) ──────────────────────
const checks = [];
const add = (theme, label, fg, bg, min) =>
  checks.push({ theme, label, fg, bg, min, ratio: cr(fg, bg) });

for (const [t, p] of [['라이트', light], ['다크', dark]]) {
  for (const k of ['ink', 'inkMuted', 'inkFaint', 'inkHint']) {
    add(t, `${k} · bg`, p[k], p.bg, 4.5);
    add(t, `${k} · surface`, p[k], p.surface, 4.5);
  }
  add(t, 'surface · bg (층)', p.surface, p.bg, 1.25);
  add(t, 'deep · surface (UI)', p.deep, p.surface, 3);
  add(t, 'onLime · lime', p.onLime, p.lime, 4.5);
  add(t, 'onDeep · deep', p.onDeep, p.deep, 4.5);
  add(t, 'onDark · deep', p.onDark, p.deep, 4.5);
  add(t, 'warnInk · warnBg', p.warnInk, p.warnBg, 4.5);
  add(t, 'dangerInk · dangerBg', p.dangerInk, p.dangerBg, 4.5);
  add(t, 'infoInk · infoBg', p.infoInk, p.infoBg, 4.5);
  add(t, 'neutralInk · neutral', p.neutralInk, p.neutral, 4.5);
  add(t, 'error · surface', p.error, p.surface, 4.5);
  add(t, 'greenText · surface', p.greenText, p.surface, 4.5);
}

const failCount = checks.filter((c) => c.ratio < c.min).length;
const contrastRows = (theme) => checks.filter((c) => c.theme === theme).map((c) => `
        <tr class="${c.ratio < c.min ? 'fail' : ''}">
          <td><code>${c.label}</code></td>
          <td class="num">${r2(c.ratio)}</td>
          <td class="num min">${c.min}</td>
          <td><span class="badge ${c.ratio < c.min ? 'b-fail' : 'b-pass'}">${c.ratio < c.min ? '미달' : '통과'}</span></td>
        </tr>`).join('');

// ── 타이포 견본 ────────────────────────────────────────────────────
const samples = {
  counter: '128',
  display: '오늘 12개 주웠어요',
  title: '우리 동네 줍깅',
  metric: '3.4 km',
  subtitle: '함께 걸을 이웃을 찾아보세요',
  section: '이번 주 기록',
  bodyLg: '모임을 만들면 이웃에게 알림이 갑니다.',
  body: '수거한 쓰레기를 촬영하면 자동으로 분류됩니다.',
  caption: '사진은 활동이 끝나면 지워집니다',
  label: '진행 중',
  micro: '3분 전',
};
const boldKeys = ['counter', 'display', 'title', 'metric'];
const semiboldKeys = ['label'];
const typeRows = Object.keys(fontSize).map((k) => `
      <div class="ty">
        <div class="ty-meta"><code>${k}</code><span>${fontSize[k]} / ${lineHeight[k]}</span></div>
        <div class="ty-s" style="font-size:${fontSize[k]}px;line-height:${lineHeight[k]}px;font-weight:${boldKeys.includes(k) ? 700 : semiboldKeys.includes(k) ? 600 : 400}">${samples[k]}</div>
      </div>`).join('');

// ── 간격 ───────────────────────────────────────────────────────────
const spaceRows = Object.entries(space).map(([k, v]) => `
      <div class="sp"><code>space.${k}</code><span class="sp-bar" style="width:${v}px"></span><span class="sp-n">${v}</span></div>`).join('');
const screenRows = Object.entries(screen).map(([k, v]) => `
      <div class="sp"><code>screen.${k}</code><span class="sp-bar" style="width:${Math.min(v, 120)}px"></span><span class="sp-n">${v}</span></div>`).join('');
const sizeRows = Object.entries(size).map(([k, v]) => `
      <div class="sp"><code>size.${k}</code><span class="sp-box" style="width:${v}px;height:${Math.min(v, 40)}px"></span><span class="sp-n">${v}</span></div>`).join('');

// ── 반경 ───────────────────────────────────────────────────────────
const radiusRows = Object.entries(radius).map(([k, v]) => `
      <figure class="rd">
        <div class="rd-box" style="border-radius:${Math.min(v, 60)}px"></div>
        <figcaption><code>radius.${k}</code><span>${v}</span></figcaption>
      </figure>`).join('');

// ── 그림자 ─────────────────────────────────────────────────────────
const shadowRow = (level) => `
      <div class="sh-row">
        <code class="sh-name">${level}</code>
        <div class="sh-cell sh-l"><div class="sh-box" style="box-shadow:${shadow.light[level]}"></div></div>
        <div class="sh-cell sh-d"><div class="sh-box sh-box-d" style="box-shadow:${shadow.dark[level]}"></div></div>
        <code class="sh-el">elevation ${androidElevation[level]}</code>
      </div>`;
const shadowRows = Object.keys(shadow.light).map(shadowRow).join('');
const shadowCss = Object.keys(shadow.light).map((k) => `      <div class="sh-code"><code>${k}</code><code class="dim">${shadow.light[k]}</code></div>`).join('\n');
const borderRows = Object.entries(borderWidth).map(([k, v]) => `
      <div class="bd-row"><code style="width:190px">borderWidth.${k}</code><span class="bd-box" style="border-width:${v}px"></span><span class="sp-n">${v}</span></div>`).join('');

const html = `<title>가치줍깅 디자인 토큰</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&family=Noto+Sans+KR:wght@400;500;700&family=IBM+Plex+Mono:wght@400;500&display=swap">
<style>
  /* 이 페이지는 자기가 설명하는 팔레트로 그려집니다. 라이트 테마는 가치줍깅
     라이트 팔레트, 다크 테마는 야간 팔레트입니다. */
  :root {
    --bg: ${light.bg};
    --surface: ${light.surface};
    --ink: ${light.ink};
    --ink-muted: ${light.inkMuted};
    --ink-hint: ${light.inkHint};
    --deep: ${light.deep};
    --lime: ${light.lime};
    --on-lime: ${light.onLime};
    --border: ${light.border};
    --green: ${light.greenStrong};
    --error: ${light.error};
    --danger-bg: ${light.dangerBg};
    --soft: ${light.softChip};
    --shadow-card: ${shadow.light.card};
  }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) {
      --bg: ${dark.bg};
      --surface: ${dark.surface};
      --ink: ${dark.ink};
      --ink-muted: ${dark.inkMuted};
      --ink-hint: ${dark.inkHint};
      --deep: ${dark.deep};
      --lime: ${dark.lime};
      --on-lime: ${dark.onLime};
      --border: ${dark.border};
      --green: ${dark.greenStrong};
      --error: ${dark.error};
      --danger-bg: ${dark.dangerBg};
      --soft: ${dark.softChip};
      --shadow-card: ${shadow.dark.card};
    }
  }
  :root[data-theme="dark"] {
    --bg: ${dark.bg};
    --surface: ${dark.surface};
    --ink: ${dark.ink};
    --ink-muted: ${dark.inkMuted};
    --ink-hint: ${dark.inkHint};
    --deep: ${dark.deep};
    --lime: ${dark.lime};
    --on-lime: ${dark.onLime};
    --border: ${dark.border};
    --green: ${dark.greenStrong};
    --error: ${dark.error};
    --danger-bg: ${dark.dangerBg};
    --soft: ${dark.softChip};
    --shadow-card: ${shadow.dark.card};
  }

  * { box-sizing: border-box; }
  body {
    margin: 0;
    background: var(--bg);
    color: var(--ink);
    font-family: 'Inter', 'Noto Sans KR', system-ui, sans-serif;
    font-size: 15px;
    line-height: 1.6;
    -webkit-font-smoothing: antialiased;
  }
  code { font-family: 'IBM Plex Mono', ui-monospace, monospace; font-size: 12.5px; }
  .wrap { max-width: 1080px; margin: 0 auto; padding: 40px 24px 96px; }

  header { padding: 8px 0 32px; }
  h1 {
    font-size: 34px; line-height: 1.15; font-weight: 700; margin: 0 0 10px;
    letter-spacing: -0.02em; text-wrap: balance;
  }
  .lede { margin: 0; max-width: 62ch; color: var(--ink-muted); }
  .lede code { color: var(--ink); }

  .status {
    display: inline-flex; align-items: center; gap: 10px; flex-wrap: wrap;
    margin-top: 20px; padding: 9px 16px 9px 13px;
    background: var(--surface); border: 1px solid var(--border);
    border-radius: 999px; box-shadow: var(--shadow-card);
  }
  .status .dot { width: 8px; height: 8px; border-radius: 999px; background: var(--green); flex: none; }
  .status strong { font-weight: 600; font-size: 13.5px; }
  .status .dim { color: var(--ink-hint); font-size: 13px; }

  nav { display: flex; flex-wrap: wrap; gap: 8px; margin: 28px 0 0; }
  nav a {
    padding: 6px 13px; border-radius: 999px; text-decoration: none;
    background: var(--soft); color: var(--ink-muted);
    font-size: 13px; font-weight: 500; border: 1px solid transparent;
  }
  nav a:hover { border-color: var(--border); color: var(--ink); }
  nav a:focus-visible { outline: 2px solid var(--deep); outline-offset: 2px; }

  h2 {
    font-size: 13px; font-weight: 700; letter-spacing: 0.10em; text-transform: uppercase;
    color: var(--ink-hint); margin: 0 0 18px; padding-bottom: 10px;
    border-bottom: 1px solid var(--border);
  }
  .block { margin-top: 56px; scroll-margin-top: 20px; }
  .note { color: var(--ink-muted); max-width: 68ch; margin: -6px 0 22px; font-size: 14px; }
  .sub { font-size: 14px; font-weight: 600; margin: 28px 0 4px; }

  .grp { margin-bottom: 26px; }
  .grp h3 { font-size: 14px; font-weight: 600; margin: 0 0 8px; }
  .tk-head, .tk { display: grid; grid-template-columns: 168px 1fr 1fr; gap: 12px; align-items: center; }
  .tk-head { padding: 0 0 6px; font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--ink-hint); }
  .tk { padding: 5px 0; border-top: 1px solid var(--border); }
  .tk-side { display: flex; align-items: center; gap: 9px; min-width: 0; }
  .tk-side code { color: var(--ink-hint); }
  .chip {
    width: 30px; height: 22px; border-radius: 6px; flex: none;
    border: 1px solid rgba(0,0,0,0.14);
    background-image:
      linear-gradient(45deg, #b9b9b9 25%, transparent 25%, transparent 75%, #b9b9b9 75%),
      linear-gradient(45deg, #b9b9b9 25%, #ffffff 25%, #ffffff 75%, #b9b9b9 75%);
    background-size: 8px 8px; background-position: 0 0, 4px 4px;
  }
  .chip-d { border-color: rgba(255,255,255,0.22); }

  table { width: 100%; border-collapse: collapse; }
  th, td { text-align: left; padding: 6px 10px 6px 0; border-top: 1px solid var(--border); }
  thead th { border-top: none; font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--ink-hint); font-weight: 600; }
  td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; width: 70px; font-family: 'IBM Plex Mono', monospace; font-size: 12.5px; }
  td.min { color: var(--ink-hint); }
  tr.fail td { background: var(--danger-bg); }
  .badge { font-size: 11.5px; font-weight: 600; padding: 2px 9px; border-radius: 999px; white-space: nowrap; }
  .b-pass { background: var(--lime); color: var(--on-lime); }
  .b-fail { background: var(--error); color: #ffffff; }
  .cols { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 34px; }
  .cols h3 { font-size: 14px; font-weight: 600; margin: 0 0 10px; }

  .ty { display: grid; grid-template-columns: 148px 1fr; gap: 20px; align-items: baseline; padding: 12px 0; border-top: 1px solid var(--border); }
  .ty-meta { display: flex; flex-direction: column; gap: 2px; }
  .ty-meta span { font-family: 'IBM Plex Mono', monospace; font-size: 11.5px; color: var(--ink-hint); }
  .ty-s { font-family: 'Noto Sans KR', 'Inter', sans-serif; min-width: 0; overflow-wrap: anywhere; }

  .sp { display: flex; align-items: center; gap: 14px; padding: 6px 0; border-top: 1px solid var(--border); }
  .sp code { width: 190px; flex: none; }
  .sp-bar { height: 14px; background: var(--lime); border-radius: 3px; flex: none; }
  .sp-box { background: var(--soft); border: 1px solid var(--border); border-radius: 6px; flex: none; }
  .sp-n { font-family: 'IBM Plex Mono', monospace; font-size: 12px; color: var(--ink-hint); font-variant-numeric: tabular-nums; }

  .rd-grid { display: flex; flex-wrap: wrap; gap: 20px; }
  .rd { margin: 0; }
  .rd-box { width: 108px; height: 78px; background: var(--surface); border: 1px solid var(--border); box-shadow: var(--shadow-card); }
  .rd figcaption { display: flex; flex-direction: column; gap: 1px; margin-top: 9px; }
  .rd figcaption span { font-family: 'IBM Plex Mono', monospace; font-size: 11.5px; color: var(--ink-hint); }

  .sh-row { display: grid; grid-template-columns: 92px 1fr 1fr 122px; gap: 14px; align-items: center; padding: 8px 0; border-top: 1px solid var(--border); }
  .sh-head { border-top: none; color: var(--ink-hint); font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; }
  .sh-head span:nth-child(2), .sh-head span:nth-child(3) { text-align: center; }
  .sh-head span:nth-child(4) { text-align: right; }
  .sh-cell { display: flex; align-items: center; justify-content: center; padding: 22px 0; border-radius: 12px; }
  .sh-l { background: ${light.bg}; }
  .sh-d { background: ${dark.bg}; }
  .sh-box { width: 118px; height: 46px; border-radius: 14px; background: ${light.surface}; }
  .sh-box-d { background: ${dark.surface}; }
  .sh-el { color: var(--ink-hint); text-align: right; }
  .sh-code { display: flex; gap: 14px; padding: 4px 0; flex-wrap: wrap; }
  .sh-code code:first-child { width: 84px; flex: none; }
  .dim { color: var(--ink-hint); }
  .gr-row { display: flex; align-items: center; gap: 16px; padding: 8px 0; border-top: 1px solid var(--border); flex-wrap: wrap; }
  .gr-box { width: 220px; height: 44px; border-radius: 999px; flex: none; }
  .bd-row { display: flex; align-items: center; gap: 16px; padding: 8px 0; border-top: 1px solid var(--border); }
  .bd-box { width: 108px; height: 44px; border-radius: 12px; border-style: solid; border-color: var(--deep); background: var(--surface); flex: none; }

  .scroller { overflow-x: auto; }
  footer { margin-top: 64px; padding-top: 22px; border-top: 1px solid var(--border); color: var(--ink-hint); font-size: 13.5px; max-width: 68ch; }
  ::selection { background: var(--lime); color: var(--on-lime); }

  @media (max-width: 620px) {
    .tk-head, .tk { grid-template-columns: 118px 1fr 1fr; gap: 8px; }
    .sh-row { grid-template-columns: 70px 1fr 1fr; }
    .sh-el, .sh-head span:nth-child(4) { display: none; }
    .ty { grid-template-columns: 1fr; gap: 6px; }
    .sp code { width: 130px; }
  }
</style>

<div class="wrap">
  <header>
    <h1>가치줍깅 디자인 토큰</h1>
    <p class="lede">안드로이드 <code>res/values{,-night}/</code> 에서 React&nbsp;Native 로 이식한 토큰입니다. 이 페이지는 <code>tokens/</code> 에서 직접 생성되므로 값이 문서와 갈라지지 않습니다. 페이지 자체도 이 팔레트로 그려집니다 — 브라우저 테마를 바꾸면 야간 팔레트로 넘어갑니다.</p>
    <div class="status">
      <span class="dot"></span>
      <strong>대비 불변식 ${checks.length - failCount}/${checks.length} 통과</strong>
      <span class="dim">· 견본 글꼴은 Pretendard 대역(Inter + Noto Sans KR)</span>
    </div>
    <nav>
      <a href="#color">색상</a><a href="#contrast">대비</a><a href="#type">글꼴과 크기</a><a href="#space">여백과 간격</a><a href="#radius">모서리 반경</a><a href="#depth">그림자와 테두리</a>
    </nav>
  </header>

  <section class="block" id="color">
    <h2>색상</h2>
    <p class="note">두 팔레트는 같은 올리브 색상환(H≈57~75°)을 유지하고 명도만 뒤집습니다. 브랜드가 연두 단색 기반이라 색상까지 건드리면 다른 앱이 됩니다. <code>deep</code> 은 예외로, 야간에는 밝은 쪽으로 보내고 그 위 글자를 어둡게 뒤집어 쌍으로 반전시킵니다.</p>
    ${colorSections}
    ${subGroup('아바타 배경', 'avatar')}
    ${subGroup('카메라', 'camera')}
  </section>

  <section class="block" id="contrast">
    <h2>대비 불변식</h2>
    <p class="note">색은 손으로 옮기다 한 글자만 틀려도 대비가 조용히 깨지고, 실기기에서 보기 전까지 아무도 모릅니다. <code>node --test contrast.test.ts</code> 가 아래 쌍을 전부 강제합니다. 잉크 4단이 <code>bg</code> 와 <code>surface</code> <strong>양쪽 모두</strong>에서 4.5:1 이어야 한다는 조건이, 배경을 얼마나 어둡게 내릴 수 있는지의 상한을 잡습니다.</p>
    <div class="cols">
      <div>
        <h3>라이트</h3>
        <div class="scroller"><table><thead><tr><th>쌍</th><th class="num">실측</th><th class="num">하한</th><th></th></tr></thead><tbody>${contrastRows('라이트')}</tbody></table></div>
      </div>
      <div>
        <h3>다크</h3>
        <div class="scroller"><table><thead><tr><th>쌍</th><th class="num">실측</th><th class="num">하한</th><th></th></tr></thead><tbody>${contrastRows('다크')}</tbody></table></div>
      </div>
    </div>
  </section>

  <section class="block" id="type">
    <h2>글꼴과 텍스트 크기</h2>
    <p class="note">본문은 원래 13 이었는데 레이아웃들이 토큰을 버리고 14·15·17 을 직접 박아 쓰고 있었습니다(하드코딩 74건 중 54건). 토큰이 현실과 안 맞아 우회당한 경우라 body 를 14 로 올리고, 실제로 쓰이던 크기에 이름을 붙여 흡수했습니다. 행간은 XML 에 없던 값이라 이식하면서 새로 정했습니다 — RN <code>Text</code> 는 안드로이드 <code>TextView</code> 와 달리 알아서 벌려주지 않아 한글 본문이 답답해집니다. 실물은 Pretendard(<code>${fontFamily.regular}</code> / <code>${fontFamily.medium}</code> / <code>${fontFamily.semibold}</code> / <code>${fontFamily.bold}</code>)이고, 아래 견본은 웹에서 대신 세운 글꼴이라 자간이 조금 다릅니다.</p>
    ${typeRows}
  </section>

  <section class="block" id="space">
    <h2>여백과 간격</h2>
    <p class="note">4 그리드. 2 단위로 흩어진 값은 눈으로 구분되지 않아 위계를 전달하지 못하므로 역할별로 세 단계씩만 둡니다 — 붙어 있음(4) · 관련됨(8) · 분리됨(12), 그리고 컨테이너 여백 12 · 16 · 20.</p>
    ${spaceRows}
    <h3 class="sub">화면 여백</h3>
    ${screenRows}
    <h3 class="sub">컨트롤 치수</h3>
    ${sizeRows}
  </section>

  <section class="block" id="radius">
    <h2>모서리 반경</h2>
    <p class="note"><code>pill</code> 은 999 로, 실제 반경은 높이의 절반에서 잘립니다. 아래 견본은 60 에서 잘라 그렸습니다.</p>
    <div class="rd-grid">${radiusRows}</div>
  </section>

  <section class="block" id="depth">
    <h2>그림자와 테두리</h2>
    <p class="note">아래 그림자는 토큰 문자열을 그대로 CSS <code>box-shadow</code> 에 넘긴 것입니다 — RN 의 <code>boxShadow</code> 가 같은 문법을 쓰므로, 브라우저가 그리는 것이 곧 실제 렌더링입니다. 검정 그림자는 연두 배경 위에서 채도가 빠진 회색때처럼 보이므로 라이트에서는 올리브 계열을 씁니다. 어두운 배경에서는 올리브가 묻히므로 야간에는 검정으로 돌리고 불투명도를 올립니다.</p>
    <div class="sh-row sh-head"><span></span><span>라이트</span><span>다크</span><span>Android 8.1 이하</span></div>
    ${shadowRows}
    <p class="note" style="margin-top:22px"><strong>Android 8.1(API 27) 이하에서는 <code>boxShadow</code> 가 아무것도 그리지 않습니다.</strong> 그래서 층을 그림자에만 맡기면 안 됩니다 — <code>surface</code> 와 <code>bg</code> 의 1.29:1 명도 차이와 테두리 1px 이 층을 만들고, 그림자는 그 위에 얹는 보강입니다. 오른쪽 <code>elevation</code> 값은 그 구형 기기에서 검정 그림자로라도 층을 세워야 할 때 <code>Platform.Version &lt; 28</code> 로 분기해 쓰는 대체값입니다. 둘을 함께 주면 그림자가 두 번 그려집니다.</p>
    <div style="margin-top:10px">
${shadowCss}
    </div>
    <h3 class="sub">주 채움 그라데이션</h3>
    <p class="note">기본 버튼 · 촬영 버튼 · 진행바가 전부 이 채움을 씁니다. 브랜드에서 &ldquo;활성&rdquo;을 뜻하는 유일한 채움이라, 단색 라임으로 바꾸면 앱이 눈에 띄게 밋밋해집니다. 두 테마에서 값이 같습니다.</p>
    <div class="gr-row">
      <div class="gr-box" style="background:linear-gradient(90deg, ${gradient.primary.colors[0]}, ${gradient.primary.colors[1]})"></div>
      <code class="dim">${gradient.primary.colors[0]} → ${gradient.primary.colors[1]} · 90deg</code>
    </div>

    <h3 class="sub">테두리 두께</h3>
    <p class="note">hairline 이 기본입니다. 카드·목록 행·콜아웃에 1 을 넘는 색 테두리를 두면 층이 아니라 장식이 됩니다.</p>
    ${borderRows}
  </section>

  <footer>
    <code>node preview.mjs</code> 로 다시 생성합니다. 값은 <code>tokens/</code> 가 정본이고 이 페이지는 그 출력입니다 — 여기서 고치지 마세요.
  </footer>
</div>
`;

writeFileSync('preview.html', html, 'utf8');
console.log(`preview.html 생성 · 대비 검사 ${checks.length}쌍 중 미달 ${failCount}건`);
