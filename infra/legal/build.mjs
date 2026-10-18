// docs/legal/*.md 를 서빙용 HTML 로 바꾼다. 정본은 .md 이고 여기 결과물은 파생이다.
//
//   node infra/legal/build.mjs          만든다
//   node infra/legal/build.mjs --check  어긋나면 1 로 끝낸다 (CI)
//
// 배포 때 변환하지 않는다. 변환이 깨지면 배포가 통째로 막히기 때문이다.
// 전문을 고치면 이 스크립트를 돌려 결과물을 같이 커밋한다 — CI 가 대조한다.
//
// 이 세 문서가 쓰는 문법만 다룬다(제목·표·목록·강조·인라인 코드). 범용 변환기가 아니다.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const PAGES = ['terms', 'privacy', 'marketing'];

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// 인라인은 이스케이프 뒤에 건다. 순서를 바꾸면 생성한 태그까지 이스케이프된다.
const inline = (s) =>
  esc(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

const isTableRow = (l) => l.startsWith('|');
const cells = (l) => l.replace(/^\||\|$/g, '').split('|').map((c) => c.trim());

function toBody(md) {
  const lines = md.split(/\r?\n/);
  const out = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) { i++; continue; }

    const h = line.match(/^(#{1,6}) +(.*)$/);
    if (h) { out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`); i++; continue; }

    if (isTableRow(line)) {
      const head = cells(line);
      // 두 번째 줄은 구분선(---)이다. 없으면 표가 아니다.
      const sep = lines[i + 1] ?? '';
      if (!/^\|[\s:|-]+\|$/.test(sep)) { out.push(`<p>${inline(line)}</p>`); i++; continue; }
      out.push('<table><thead><tr>' + head.map((c) => `<th>${inline(c)}</th>`).join('') + '</tr></thead><tbody>');
      i += 2;
      while (i < lines.length && isTableRow(lines[i])) {
        out.push('<tr>' + cells(lines[i]).map((c) => `<td>${inline(c)}</td>`).join('') + '</tr>');
        i++;
      }
      out.push('</tbody></table>');
      continue;
    }

    const bullet = line.match(/^[-*] +(.*)$/);
    const number = line.match(/^\d+\. +(.*)$/);
    if (bullet || number) {
      const tag = bullet ? 'ul' : 'ol';
      const pick = (l) => (bullet ? l.match(/^[-*] +(.*)$/) : l.match(/^\d+\. +(.*)$/));
      out.push(`<${tag}>`);
      while (i < lines.length) {
        const m = pick(lines[i]);
        if (!m) break;
        out.push(`<li>${inline(m[1])}</li>`);
        i++;
      }
      out.push(`</${tag}>`);
      continue;
    }

    // 나머지는 문단. 빈 줄까지 이어 붙인다.
    const para = [];
    while (i < lines.length && lines[i].trim() && !/^[-*#|]|^\d+\. /.test(lines[i])) {
      para.push(lines[i].trim());
      i++;
    }
    out.push(`<p>${inline(para.join(' '))}</p>`);
  }
  return out.join('\n');
}

// 앱의 WebView·브라우저에서 바로 읽히게만 한다. 외부 폰트·스크립트를 쓰지 않는다 —
// 약관 화면이 네트워크 사정으로 안 보이면 동의를 받을 수 없다.
const page = (title, body) => `<!doctype html>
<html lang="ko">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} — 가치줍깅</title>
<style>
  :root { color-scheme: light dark; }
  body { max-width: 44rem; margin: 0 auto; padding: 1.5rem 1rem 4rem;
         font: 16px/1.7 system-ui, -apple-system, "Segoe UI", sans-serif;
         word-break: keep-all; overflow-wrap: anywhere; }
  h1 { font-size: 1.5rem; margin: 0 0 1.5rem; }
  h2 { font-size: 1.15rem; margin: 2.5rem 0 .75rem; }
  h3 { font-size: 1rem; margin: 1.5rem 0 .5rem; }
  table { width: 100%; border-collapse: collapse; margin: 1rem 0; font-size: .9rem; display: block; overflow-x: auto; }
  th, td { border: 1px solid #8884; padding: .5rem .6rem; text-align: left; vertical-align: top; }
  th { font-weight: 600; }
  code { background: #8882; padding: .1rem .3rem; border-radius: .2rem; font-size: .9em; }
  li { margin: .3rem 0; }
</style>
${body}
</html>
`;

const check = process.argv.includes('--check');
let stale = [];

mkdirSync(HERE, { recursive: true });
for (const name of PAGES) {
  const md = readFileSync(join(ROOT, 'docs', 'legal', `${name}.md`), 'utf8');
  const title = (md.match(/^# +(.*)$/m) ?? [, name])[1];
  const html = page(title, toBody(md));
  const dest = join(HERE, `${name}.html`);

  if (check) {
    let current = '';
    try { current = readFileSync(dest, 'utf8'); } catch { /* 없으면 어긋난 것이다 */ }
    if (current !== html) stale.push(`${name}.html`);
  } else {
    writeFileSync(dest, html, 'utf8');
    console.log(`만들었다: infra/legal/${name}.html`);
  }
}

if (check) {
  if (stale.length) {
    console.error(`전문과 어긋난다: ${stale.join(', ')}`);
    console.error('node infra/legal/build.mjs 를 돌려 결과물을 같이 커밋한다.');
    process.exit(1);
  }
  console.log('전문과 일치한다.');
}
