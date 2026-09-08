import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

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
