// git push 가 성공하면 Mattermost 로 알린다. Claude Code 의 PostToolUse 훅.
// 웹훅은 각자의 루트 .env 에서 읽으므로 사람마다 자기 계정으로 나간다.
// .env 가 없거나 비어 있으면 조용히 넘어간다 — 훅이 남의 작업을 막으면 안 된다.
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseEnv } from '../../infra/notify.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();

function readStdin() {
  try { return JSON.parse(readFileSync(0, 'utf8')); } catch { return null; }
}

// 푸시가 실제로 반영됐는지는 로컬 HEAD 와 업스트림이 같은지로 본다.
// tool_response 의 문구를 읽는 것보다 확실하다.
function pushLanded() {
  try { return git('rev-parse', 'HEAD') === git('rev-parse', '@{u}'); } catch { return false; }
}

function webUrl(branch) {
  try {
    const remote = git('remote', 'get-url', 'origin')
      .replace(/^git@([^:]+):/, 'https://$1/')
      .replace(/\.git$/, '');
    return `${remote}/tree/${branch}`;
  } catch { return null; }
}

const input = readStdin();
const command = input?.tool_input?.command ?? '';
if (input?.tool_name !== 'Bash' || !/\bgit\s+push\b/.test(command)) process.exit(0);
if (!pushLanded()) process.exit(0);

let hook;
try { hook = parseEnv(readFileSync(join(root, '.env'), 'utf8')).MM_WEBHOOK_URL; } catch { process.exit(0); }
if (!hook) process.exit(0);

const branch = git('rev-parse', '--abbrev-ref', 'HEAD');
const who = (() => { try { return git('config', 'user.name'); } catch { return '누군가'; } })();
const subject = git('log', '-1', '--format=%s');
const ahead = (() => {
  try { return git('rev-list', '--count', `origin/${branch}...HEAD@{1}`); } catch { return null; }
})();

const url = webUrl(branch);
const where = url ? `[\`${branch}\`](${url})` : `\`${branch}\``;
const count = ahead && ahead !== '0' ? ` (${ahead}커밋)` : '';
const text = `:arrow_up: **${who}** 님이 ${where} 에 푸시${count}\n${subject}`;

try {
  const res = await fetch(hook, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) process.exit(0);
} catch { /* 네트워크 실패로 작업을 막지 않는다 */ }
