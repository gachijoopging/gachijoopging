// 운영 서버를 거친 활동 사진 업로드를 N장 동시에 보내고, 응답 시간과 inference.status 를 센다.
// AI 처리량 자체는 여기서 재지 않는다 — 터널이 처리량을 깎고 월 한도를 태운다(ai/progress.md).
// 서빙 기기에서 `uv run python scripts/smoke.py --concurrency 10` 으로 잰다.
//
//   node infra/load/upload.mjs [N=10]
//
// 계정·크루·활동은 실행마다 만들고 끝나면 지운다.
import { readdirSync, readFileSync } from 'node:fs';

const BASE = process.env.BASE ?? 'https://www.gachijoopging.site/api/v1';
const N = +(process.argv[2] ?? 10);
const RUN = Date.now().toString(36);
const DIR = new URL('../../ai/docs/labeling-examples/', import.meta.url);
const photos = readdirSync(DIR).filter((f) => f.endsWith('.jpg'));

async function http(method, path, token, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
    body: body && JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${text.slice(0, 200)}`);
  return text ? JSON.parse(text).data : null;
}

async function upload(token, activityId, name) {
  const form = new FormData();
  form.set('mediaId', crypto.randomUUID());
  form.set('purpose', 'ACTIVITY');
  form.set('activityId', activityId);
  form.set('file', new Blob([readFileSync(new URL(name, DIR))], { type: 'image/jpeg' }), name);
  const t = Date.now();
  const res = await fetch(`${BASE}/media`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form });
  const body = await res.json().catch(() => null);
  return { name, http: res.status, ms: Date.now() - t, inference: body?.data?.inference?.status ?? body?.code, inferenceMs: body?.data?.inference?.inferenceMs ?? null };
}

const catalog = await http('GET', '/agreements');
const t = await http('POST', '/auth/signup', null, { email: `load-${RUN}-up@example.com`, password: `load-${RUN}-pw`, nickname: '부하업로드' });
const token = t.accessToken;
const activityId = crypto.randomUUID();
let started = false;
try {
  await http('PUT', '/users/me/agreements', token, { items: catalog.items.map((a) => ({ type: a.type, version: a.version, agreed: a.required })) });
  await http('POST', '/crews', token, { name: `부하${RUN}`, region: 'SEOUL', joinPolicy: 'OPEN' });
  await http('POST', '/activities', token, { id: activityId, startedAt: new Date().toISOString(), locationShared: false });
  started = true;

  const results = await Promise.all(Array.from({ length: N }, (_, i) => upload(token, activityId, photos[i % photos.length])));
  console.table(results);
  const ms = results.map((r) => r.ms).sort((a, b) => a - b);
  const count = (s) => results.filter((r) => r.inference === s).length;
  console.log(JSON.stringify({ n: N, ok: count('OK'), unavailable: count('UNAVAILABLE'), other: N - count('OK') - count('UNAVAILABLE'), p50: ms[Math.floor(N / 2)], max: ms.at(-1) }));
} finally {
  if (started) {
    await http('POST', `/activities/${activityId}/end`, token, { endedAt: new Date().toISOString(), durationSec: 60, pausedSec: 0, distanceM: 0, steps: null, route: [] }).catch((e) => console.error(e.message));
    await http('DELETE', `/activities/${activityId}`, token).catch((e) => console.error(e.message));
  }
  await http('DELETE', '/users/me', token).catch((e) => console.error(e.message));
  console.log('정리 끝');
}
