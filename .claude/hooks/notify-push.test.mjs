// node --test .claude/hooks/notify-push.test.mjs
// 훅을 임시 폴더에 복사해 돌린다. 저장소 루트 .env 의 실제 웹훅으로 나가지 않게 하기 위해서다.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn, execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const gh = (...args) => JSON.parse(execFileSync('gh', args, { cwd: root, encoding: 'utf8' }));

const { nameWithOwner, url } = gh('repo', 'view', '--json', 'nameWithOwner,url');
const open = gh('pr', 'list', '--state', 'open', '--json', 'number,reviewRequests');
const anyOpen = open[0]?.number;
const reviewed = open.find((p) => p.reviewRequests.length > 0)?.number;

const sandbox = mkdtempSync(join(tmpdir(), 'notify-push-'));
const hookCopy = join(sandbox, '.claude', 'hooks', 'notify-push.mjs');
mkdirSync(dirname(hookCopy), { recursive: true });
mkdirSync(join(sandbox, 'infra'));
cpSync(join(here, 'notify-push.mjs'), hookCopy);
cpSync(join(root, 'infra', 'notify.mjs'), join(sandbox, 'infra', 'notify.mjs'));

let received = [];
const server = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    received.push(JSON.parse(body).text);
    res.end('ok');
  });
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
writeFileSync(join(sandbox, '.env'), `MM_WEBHOOK_URL=http://127.0.0.1:${server.address().port}/hook\n`);
after(() => {
  server.close();
  rmSync(sandbox, { recursive: true, force: true });
});

// 임시 폴더는 git 저장소가 아니므로 gh 가 볼 저장소를 GH_REPO 로 넘긴다
function run(command, stdout = '') {
  received = [];
  const input = { tool_name: 'Bash', tool_input: { command }, tool_response: { stdout, stderr: '' } };
  return new Promise((resolve) => {
    const p = spawn('node', [hookCopy], { env: { ...process.env, GH_REPO: nameWithOwner } });
    p.on('close', () => resolve(received));
    p.stdin.end(JSON.stringify(input));
  });
}
const mergeNotices = (texts) => texts.filter((t) => /dev 반영|main 배포/.test(t));
const reviewNotices = (texts) => texts.filter((t) => t.includes('리뷰 요청'));

test('PR 본문에 열린 PR 의 머지 명령이 적혀 있어도 머지 알림을 보내지 않는다', { skip: !anyOpen && '열린 PR 이 없다' }, async () => {
  const body = `$(cat <<'EOF'\n머지는 gh pr merge ${anyOpen} --squash 로 한다\nEOF\n)`;
  const texts = await run(`gh pr create --base dev --title t --body "${body}"`, `${url}/pull/${anyOpen}\n`);
  assert.equal(mergeNotices(texts).length, 0);
});

test('실제로 머지된 PR 은 반영 알림을 한 번 보낸다', async () => {
  const texts = await run('gh pr merge 93 --squash --delete-branch');
  assert.equal(mergeNotices(texts).length, 1);
});

test('git push 와 gh pr create 가 한 명령이어도 리뷰어 알림을 보낸다', { skip: !reviewed && '리뷰어가 지정된 열린 PR 이 없다' }, async () => {
  const texts = await run('git push -u origin x && gh pr create --base dev --title t --body b', `${url}/pull/${reviewed}\n`);
  assert.equal(reviewNotices(texts).length, 1);
});
