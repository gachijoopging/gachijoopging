import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { Script } from 'node:vm'

const html = await readFile(new URL('./gachijoopging.html', import.meta.url), 'utf8')

test('contains app and review roots', () => {
  assert.match(html, /<main id="app"><\/main>/)
  assert.match(html, /<aside id="review-panel"><\/aside>/)
  assert.match(html, /<div id="sheet-root"><\/div>/)
})

test('declares offline token CSS', () => {
  assert.match(html, /--bg:\s*#DCE6A6/)
  assert.match(html, /--surface:\s*#FDFDF3/)
  assert.match(html, /--ink:\s*#262A0E/)
  assert.match(html, /--deep:\s*#3D431F/)
  assert.match(html, /--lime:\s*#C9E345/)
  assert.match(html, /--yellow:\s*#F4F04B/)
})

test('uses the reusable design-system visual primitives', () => {
  assert.match(html, /@font-face\s*\{[\s\S]*?Pretendard-Regular\.ttf/)
  assert.match(html, /font-family:\s*'Pretendard'/)
  assert.match(html, /--surface-raised:\s*#FFFFFF/)
  assert.match(html, /\.button--deep\s*\{/)
  assert.match(html, /\.button--translucent\s*\{/)
  assert.match(html, /\.field--error\s*\{/)
  for (const primitive of ['button', 'iconButton', 'card', 'field', 'listRow', 'banner']) {
    assert.match(html, new RegExp(`function ${primitive}\\(`))
  }
})

test('registers every approved screen exactly once', () => {
  const entries = [...html.matchAll(/id:\s*'([1-6]-\d+)'[\s\S]*?spec:\s*'(docs\/screens\/[^']+\.md)'/g)]
  assert.equal(entries.length, 43)
  assert.equal(new Set(entries.map(([, id]) => id)).size, 43)
  assert.equal(new Set(entries.map(([, , spec]) => spec)).size, 43)
})

test('defines five tab roots', () => {
  for (const id of ['2-1', '5-1', '4-1', '3-1', '5-5']) {
    assert.match(html, new RegExp(`id: '${id}'`))
  }
})

test('defines every registered screen renderer', () => {
  const entries = [...html.matchAll(/render:\s*(render\w+)/g)]
  assert.equal(entries.length, 43)
  for (const [, renderer] of entries) {
    assert.match(html, new RegExp(`function ${renderer}\\(`))
  }
})

test('keeps prototype offline and self-contained', () => {
  assert.doesNotMatch(html, /\bfetch\s*\(/)
  assert.doesNotMatch(html, /<script[^>]+\bsrc=/i)
  assert.doesNotMatch(html, /<link[^>]+\bhref=/i)
  assert.doesNotMatch(html, /\bhttps?:\/\//i)
})

test('uses modal semantics and minimum touch targets', () => {
  assert.match(html, /setAttribute\('role', 'dialog'\)/)
  assert.match(html, /--min-touch:\s*48px/)
  assert.match(html, /min-height:\s*var\(--min-touch\)/)
})

test('has valid inline JavaScript', () => {
  const script = html.match(/<script>([\s\S]*)<\/script>/)?.[1]
  assert.ok(script)
  assert.doesNotThrow(() => new Script(script))
})

test('keeps selected review controls and activity sheets', () => {
  assert.match(html, /if \(options\.selected !== undefined\) node\.selected = options\.selected/)
  assert.match(html, /openSheet\('activity-start'\)/)
  assert.match(html, /openSheet\('quick-pickup'\)/)
  assert.match(html, /state\.sheet\.kind === 'activity-start'/)
  assert.match(html, /state\.sheet\.kind === 'quick-pickup'/)
  assert.match(html, /function renderActivityStart\(\)[\s\S]*?kind: 'activity-start'/)
  assert.match(html, /function renderQuickPickup\(\)[\s\S]*?kind: 'quick-pickup'/)
})
