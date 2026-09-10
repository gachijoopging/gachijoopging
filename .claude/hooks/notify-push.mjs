// dev·main 반영과 PR 리뷰어 지정을 Mattermost 로 직접 알린다. Claude Code 의 PostToolUse 훅.
// GitHub Actions 를 거치지 않는다 — 이 세션이 로컬에서 git/gh 로 한 작업만 잡는다.
// 웹훅은 각자의 루트 .env 에서 읽으므로 사람마다 자기 계정으로 나간다.
// .env 가 없거나 비어 있으면 조용히 넘어간다 — 훅이 남의 작업을 막으면 안 된다.
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseEnv } from '../../infra/notify.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
const gh = (...args) => execFileSync('gh', args, { cwd: root, encoding: 'utf8' }).trim();

function readStdin() {
  try { return JSON.parse(readFileSync(0, 'utf8')); } catch { return null; }
}

function responseText(input) {
  const r = input?.tool_response;
  if (typeof r === 'string') return r;
  if (r && typeof r === 'object') return `${r.stdout ?? ''}\n${r.stderr ?? ''}`;
  return '';
}

function webUrl(branch) {
  try {
    const remote = git('remote', 'get-url', 'origin')
      .replace(/^git@([^:]+):/, 'https://$1/')
      .replace(/\.git$/, '');
    return `${remote}/tree/${branch}`;
  } catch { return null; }
}

async function send(hook, text) {
  const res = await fetch(hook, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) process.exit(0); // 실패해도 작업을 막지 않는다
}

// 직접 git push 로 dev/main 에 반영됐을 때
function devOrMainPush() {
  try { if (git('rev-parse', 'HEAD') !== git('rev-parse', '@{u}')) return null; } catch { return null; }
  const branch = (() => { try { return git('rev-parse', '--abbrev-ref', 'HEAD'); } catch { return null; } })();
  if (branch !== 'dev' && branch !== 'main') return null; // 그 외 브랜치 푸시는 보내지 않는다

  const subject = git('log', '-1', '--format=%s');
  const url = webUrl(branch);
  const where = url ? `[변경 내역](${url})` : '';
  return branch === 'main'
    ? `:rocket: **main 배포** — ${subject}\n${where}`
    : `:arrows_counterclockwise: **dev 반영** — ${subject}\n${where}`;
}

// gh pr create 로 PR 을 열었을 때 — CODEOWNERS 로 자동 지정된 리뷰어를 알린다
function prOpened(input) {
  const m = responseText(input).match(/https:\/\/github\.com\/[^\s]+\/pull\/(\d+)/);
  if (!m) return null;
  const pr = JSON.parse(gh('pr', 'view', m[1], '--json', 'number,title,url,author,reviewRequests'));
  const reviewers = (pr.reviewRequests ?? []).map((r) => r.login).filter(Boolean);
  if (reviewers.length === 0) return null;
  return `:eyes: **@${reviewers.join(', @')} 리뷰 요청** — PR #${pr.number}\n[${pr.title}](${pr.url}) · @${pr.author.login}`;
}

// gh pr merge 로 dev/main 에 반영됐을 때
function prMerged(input) {
  const idFromCmd = input.tool_input.command.match(/\bgh\s+pr\s+merge\s+(\S+)/)?.[1];
  const id = idFromCmd && !idFromCmd.startsWith('-') ? idFromCmd : responseText(input).match(/#(\d+)/)?.[1];
  if (!id) return null;
  const pr = JSON.parse(gh('pr', 'view', id, '--json', 'number,title,url,baseRefName'));
  if (pr.baseRefName !== 'dev' && pr.baseRefName !== 'main') return null;
  return pr.baseRefName === 'main'
    ? `:rocket: **main 배포** — ${pr.title}\n[${pr.url}](${pr.url})`
    : `:arrows_counterclockwise: **dev 반영** — ${pr.title}\n[${pr.url}](${pr.url})`;
}

const input = readStdin();
const command = input?.tool_input?.command ?? '';
if (input?.tool_name !== 'Bash') process.exit(0);

let hook;
try { hook = parseEnv(readFileSync(join(root, '.env'), 'utf8')).MM_WEBHOOK_URL; } catch { process.exit(0); }
if (!hook) process.exit(0);

try {
  let text = null;
  if (/\bgit\s+push\b/.test(command)) text = devOrMainPush();
  else if (/\bgh\s+pr\s+create\b/.test(command)) text = prOpened(input);
  else if (/\bgh\s+pr\s+merge\b/.test(command)) text = prMerged(input);

  if (text) await send(hook, text);
} catch { /* 네트워크·gh 호출 실패로 작업을 막지 않는다 */ }
