// 크루 하나(크루장 포함 N명)가 활동 중 위치를 5초마다 보내는 상태를 MIN 분 유지하고,
// 각 연결이 받은 LIVE_UPDATE 수·본인 위치가 되돌아오기까지 걸린 시간·끊김을 센다.
// 계정·크루는 실행마다 새로 만들고 끝나면 탈퇴로 지운다(혼자 남은 크루장이 탈퇴하면 크루도 해산).
//
//   node infra/load/live.mjs [N=50] [MIN=10]
//
// 서버 자원은 따로 본다 — 도는 동안 서버에서 `docker stats`.
const BASE = process.env.BASE ?? 'https://www.gachijoopging.site/api/v1';
const WS = BASE.replace(/^http/, 'ws') + '/ws';
const N = +(process.argv[2] ?? 50);
const MIN = +(process.argv[3] ?? 10);
const RUN = Date.now().toString(36);
const PERIOD = 5000;

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

async function signup(i, agreements) {
  const t = await http('POST', '/auth/signup', null, {
    email: `load-${RUN}-${i}@example.com`, password: `load-${RUN}-pw`, nickname: `부하${i}`,
  });
  await http('PUT', '/users/me/agreements', t.accessToken, { items: agreements });
  const me = await http('GET', '/users/me', t.accessToken);
  return { i, token: t.accessToken, id: me.id };
}

const frame = (cmd, headers, body = '') =>
  `${cmd}\n${Object.entries(headers).map(([k, v]) => `${k}:${v}`).join('\n')}\n\n${body}\0`;

function connect(u, stats) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${WS}?token=${u.token}`);
    const sent = new Map(); // elapsedSec → 보낸 시각
    u.ws = ws;
    ws.onopen = () => ws.send(frame('CONNECT', { 'accept-version': '1.2', host: new URL(BASE).host, 'heart-beat': '0,0' }));
    ws.onmessage = ({ data }) => {
      for (const raw of String(data).split('\0')) {
        if (!raw.trim()) continue;
        const cmd = raw.slice(0, raw.indexOf('\n'));
        if (cmd === 'CONNECTED') {
          ws.send(frame('SUBSCRIBE', { id: 'crew', destination: '/user/queue/crew' }));
          resolve();
        } else if (cmd === 'ERROR') {
          stats.errors.push(raw.slice(0, 200));
          reject(new Error(raw.slice(0, 200)));
        } else if (cmd === 'MESSAGE') {
          const msg = JSON.parse(raw.slice(raw.indexOf('\n\n') + 2));
          if (msg.type !== 'LIVE_UPDATE') continue;
          stats.updates++;
          if (msg.data.userId === u.id && sent.has(msg.data.elapsedSec)) {
            stats.echoMs.push(Date.now() - sent.get(msg.data.elapsedSec));
            sent.delete(msg.data.elapsedSec);
          }
        }
      }
    };
    ws.onclose = (e) => { if (!u.closing) stats.drops.push(`${u.i}:${e.code}`); reject(new Error(`close ${e.code}`)); };
    u.sendLive = (elapsedSec) => {
      sent.set(elapsedSec, Date.now());
      const d = elapsedSec * 1.2; // 초속 1.2m 로 북쪽으로 걷는다
      ws.send(frame('SEND', { destination: '/app/crew/live', 'content-type': 'application/json' }, JSON.stringify({
        activityId: u.activityId,
        location: { lng: 126.9780 + u.i * 0.0005, lat: 37.5665 + d / 111000 },
        distanceM: Math.round(d), itemCount: 0, elapsedSec, paused: false,
      })));
      stats.sentCount++;
    };
  });
}

const pct = (xs, p) => xs.length ? [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(xs.length * p))] : null;

async function cleanup(users, startedAt) {
  // 크루장(0번)을 마지막에 — 다른 크루원이 남아 있으면 크루장은 탈퇴하지 못한다
  for (const u of [...users.slice(1), users[0]]) {
    try {
      if (u.activityId) {
        await http('POST', `/activities/${u.activityId}/end`, u.token, {
          endedAt: new Date().toISOString(), durationSec: Math.round((Date.now() - startedAt) / 1000),
          pausedSec: 0, distanceM: 0, steps: null, route: [],
        });
        await http('DELETE', `/activities/${u.activityId}`, u.token);
      }
      await http('DELETE', '/users/me', u.token);
    } catch (e) {
      console.error(`정리 실패 ${u.i}: ${e.message}`);
    }
  }
}

const catalog = await http('GET', '/agreements');
const agreements = catalog.items.map((a) => ({ type: a.type, version: a.version, agreed: a.required }));
const users = [];
const stats = { updates: 0, sentCount: 0, echoMs: [], drops: [], errors: [] };
const startedAt = Date.now();
try {
  for (let i = 0; i < N; i++) users.push(await signup(i, agreements));
  const crew = await http('POST', '/crews', users[0].token, { name: `부하${RUN}`, region: 'SEOUL', joinPolicy: 'OPEN' });
  for (const u of users.slice(1)) await http('POST', '/crews/join-requests', u.token, { crewId: crew.id });
  for (const u of users) {
    u.activityId = crypto.randomUUID();
    await http('POST', '/activities', u.token, { id: u.activityId, startedAt: new Date().toISOString(), locationShared: true });
  }
  console.log(`준비: ${N}명 · 크루 ${crew.name}`);

  await Promise.all(users.map((u) => connect(u, stats)));
  console.log(`연결: ${N} — ${MIN}분 유지`);

  const t0 = Date.now();
  const timers = users.map((u) => {
    let sec = 0;
    // 한꺼번에 몰리지 않게 시작을 5초 안에 흩는다
    return setTimeout(() => {
      u.sendLive(sec);
      u.timer = setInterval(() => { if (u.ws.readyState === 1) u.sendLive(sec += 5); }, PERIOD);
    }, Math.random() * PERIOD);
  });
  const tick = setInterval(() => console.log(
    `${Math.round((Date.now() - t0) / 1000)}s 보냄 ${stats.sentCount} 받음 ${stats.updates} 끊김 ${stats.drops.length} 왕복 p95 ${pct(stats.echoMs, 0.95)}ms`,
  ), 60000);
  await new Promise((r) => setTimeout(r, MIN * 60000));
  clearInterval(tick);
  timers.forEach(clearTimeout);
  for (const u of users) { clearInterval(u.timer); u.closing = true; u.ws.close(); }

  const expected = stats.sentCount * N; // 보낸 위치마다 크루원 전원(본인 포함)이 받아야 한다
  console.log(JSON.stringify({
    connections: N, minutes: MIN, sent: stats.sentCount, received: stats.updates,
    receivedRatio: +(stats.updates / expected).toFixed(3),
    echoMs: { p50: pct(stats.echoMs, 0.5), p95: pct(stats.echoMs, 0.95), max: pct(stats.echoMs, 1), n: stats.echoMs.length },
    drops: stats.drops, errors: stats.errors,
  }, null, 2));
} finally {
  for (const u of users) { u.closing = true; u.ws?.close(); }
  await cleanup(users, startedAt);
  console.log(`정리: ${users.length}명 탈퇴 시도`);
}
