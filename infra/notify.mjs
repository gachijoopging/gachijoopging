// Mattermost 로 한 줄 보낸다.  node infra/notify.mjs "메시지"
// 웹훅 URL 은 저장소 루트 .env 의 MM_WEBHOOK_URL 에서 읽는다. 사람마다 다르므로 인자로 받지 않는다.
// 서버 환경 변수(infra/.env)와는 별개다 — 이건 각자 로컬 설정이다.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

export function parseEnv(text) {
  const out = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    // URL 에 = 가 들어갈 수 있어 첫 = 에서만 자른다
    let value = trimmed.slice(eq + 1).trim();
    if (value.length > 1 && (value[0] === '"' || value[0] === "'") && value.at(-1) === value[0]) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

async function main() {
  const text = process.argv.slice(2).join(' ').trim();
  if (!text) {
    console.error('사용법: node infra/notify.mjs "메시지"');
    process.exit(2);
  }

  const envPath = join(dirname(fileURLToPath(import.meta.url)), '..', '.env');
  let hook;
  try {
    hook = parseEnv(readFileSync(envPath, 'utf8')).MM_WEBHOOK_URL;
  } catch {
    console.error(`${envPath} 가 없다. 저장소 루트의 .env.example 을 .env 로 복사해 채운다.`);
    process.exit(1);
  }
  if (!hook) {
    console.error('.env 의 MM_WEBHOOK_URL 이 비어 있다. 발급 방법은 .env.example 참고.');
    process.exit(1);
  }

  const res = await fetch(hook, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) {
    console.error(`전송 실패 ${res.status}: ${await res.text()}`);
    process.exit(1);
  }
  console.log('보냈다.');
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  await main();
}
