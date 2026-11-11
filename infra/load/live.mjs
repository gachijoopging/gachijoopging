// 크루 하나(크루장 포함 N명)가 활동 중 위치를 5초마다 보내는 상태를 MIN 분 유지하고,
// 각 연결이 받은 LIVE_UPDATE 수·본인 위치가 되돌아오기까지 걸린 시간·끊김을 센다.
// 계정·크루는 실행마다 새로 만들고 끝나면 탈퇴로 지운다(혼자 남은 크루장이 탈퇴하면 크루도 해산).
//
//   BASE=https://www.gachijoopging.site/api/v1 node infra/load/live.mjs [N=50] [MIN=10]
//
// 서버 자원은 따로 본다 — 도는 동안 서버에서 `docker stats`.
// Ctrl+C 한 번은 대기를 끝내고 정리한 뒤 종료한다. 두 번이면 정리 없이 죽는다.
const BASE = process.env.BASE;
// 기본값을 두지 않는다 — 인자 없이 돌리면 곧바로 운영에 계정이 생긴다
if (!BASE) { console.error('BASE=<API 주소> 를 준다. 예: BASE=https://www.gachijoopging.site/api/v1'); process.exit(1); }
const WS = BASE.replace(/^http/, 'ws') + '/ws';
const N = +(process.argv[2] ?? 50);
const MIN = +(process.argv[3] ?? 10);
// access token 이 1시간이라 그 뒤에는 정리 요청이 401 이다
if (MIN >= 55) { console.error('MIN 은 55 미만'); process.exit(1); }
const RUN = Date.now().toString(36);
// 계정은 실행 중에만 쓴다. RUN 은 크루 이름으로 보이므로 비밀번호에 쓰지 않는다
const PASSWORD = crypto.randomUUID();
const PERIOD = 5000;
let interrupt;
let stopped = false;
const interrupted = new Promise((r) => (interrupt = r));
process.once('SIGINT', () => { console.log('중단 — 정리 후 종료'); stopped = true; interrupt(); });
// 준비 중에 눌러도 바로 정리로 넘어간다. 안 그러면 준비가 이어지고, 다시 누르면 정리 없이 죽는다
const checkStop = () => { if (stopped) throw new Error('중단'); };

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

const email = (i) => `load-${RUN}-${i}@example.com`;

// 가입 직후에 users 에 넣는다 — 뒤 요청이 실패해도 정리 대상에서 빠지지 않게
async function signup(i, agreements, users) {
  const t = await http('POST', '/auth/signup', null, {
    email: email(i), password: PASSWORD, nickname: `부하${RUN.slice(-4)}${i}`, // 닉네임은 UNIQUE · 2~12자
  });
  const u = { i, token: t.accessToken };
  users.push(u);
  await http('PUT', '/users/me/agreements', u.token, { items: agreements });
  u.id = (await http('GET', '/users/me', u.token)).id;
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

async function cleanup(users) {
  // 크루장(0번)을 마지막에 — 다른 크루원이 남아 있으면 크루장은 탈퇴하지 못한다
  let failed = 0;
  for (const u of [...users.slice(1), users[0]].filter(Boolean)) {
    try {
      if (u.activityId) {
        // 기록을 남기지 않으므로 0 이다. 실제 시간을 넣으면 준비가 60초를 넘을 때 서버가 422 로 거절해
        // 탈퇴까지 막힌다(활동 시간 ≤ 시작~종료 + 60초)
        await http('POST', `/activities/${u.activityId}/end`, u.token, {
          endedAt: new Date().toISOString(), durationSec: 0,
          pausedSec: 0, distanceM: 0, steps: null, route: [],
        });
        await http('DELETE', `/activities/${u.activityId}`, u.token);
      }
      await http('DELETE', '/users/me', u.token);
    } catch (e) {
      failed++;
      console.error(`정리 실패 ${u.i} ${email(u.i)}: ${e.message}`);
    }
  }
  return failed;
}

const catalog = await http('GET', '/agreements');
const agreements = catalog.items.map((a) => ({ type: a.type, version: a.version, agreed: a.required }));
const users = [];
const stats = { updates: 0, sentCount: 0, echoMs: [], drops: [], errors: [] };
try {
  for (let i = 0; i < N; i++) { checkStop(); await signup(i, agreements, users); }
  // 비공개로 만들어 크루장이 직접 승인한다 — 공개면 실행 중에 실사용자가 들어올 수 있고, 그러면 크루장이 탈퇴하지 못해 정리가 막힌다
  const crew = await http('POST', '/crews', users[0].token, { name: `부하${RUN}`, region: 'SEOUL', joinPolicy: 'APPROVAL' });
  for (const u of users.slice(1)) {
    checkStop();
    const jr = await http('POST', '/crews/join-requests', u.token, { crewId: crew.id });
    await http('POST', `/crew/join-requests/${jr.id}`, users[0].token, { decision: 'APPROVE' });
  }
  for (const u of users) {
    checkStop();
    // 시작이 성공한 뒤에 넣는다 — 없는 활동을 정리하려다 404 가 나면 그 사용자의 탈퇴까지 건너뛴다
    const id = crypto.randomUUID();
    await http('POST', '/activities', u.token, { id, startedAt: new Date().toISOString(), locationShared: true });
    u.activityId = id;
  }
  console.log(`준비: ${N}명 · 크루 ${crew.name}`);

  await Promise.all(users.map((u) => connect(u, stats)));
  checkStop();
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
  let wait;
  await Promise.race([new Promise((r) => (wait = setTimeout(r, MIN * 60000))), interrupted]);
  clearTimeout(wait); // 안 지우면 정리 뒤에도 MIN 분이 찰 때까지 프로세스가 안 끝난다
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
} catch (e) {
  if (!stopped) throw e;
} finally {
  for (const u of users) { u.closing = true; u.ws?.close(); }
  const failed = await cleanup(users);
  // 0 이 아니면 운영에 계정·크루가 남았다. 비밀번호를 남기지 않으므로 API 로는 못 지운다 —
  // "정리 실패" 줄의 email 로 운영 DB 에서 지운다
  console.log(`정리: ${users.length}명 중 실패 ${failed}`);
  process.exitCode = failed ? 1 : process.exitCode;
}
