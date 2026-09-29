import { canSendChat, chatLimitNotice, chatSession, saveChatSession, chatRows, chatTime, emptyChat, reconnectDelayMs, enqueue, markDeleted, markFailed, mergeHistory, receive, retry, type ChatMessage } from './chat';

const sanghyeok = { id: 'u2', nickname: '상혁', photoUrl: null, withdrawn: false };
const me = { id: 'u1', nickname: '관열', photoUrl: null, withdrawn: false };
const msg = (seq: number, author = sanghyeok, createdAt = '2026-09-06T06:24:00Z'): ChatMessage => ({
  seq,
  id: `m${seq}`,
  author,
  text: `메시지 ${seq}`,
  createdAt,
});
const seqs = (state: ReturnType<typeof emptyChat>) => state.items.map((i) => ('seq' in i ? i.seq : i.id));

describe('채팅 이력 잇기', () => {
  test('첫 이력은 seq 오름차순으로 위에서 아래로 놓는다', () => {
    const state = mergeHistory(emptyChat(), 'initial', { items: [msg(3), msg(1), msg(2)], hasMore: true });
    expect(seqs(state)).toEqual([1, 2, 3]);
    expect(state.reachedStart).toBe(false);
  });

  test('이전 이력은 위에, 재연결 뒤 빈 구간은 아래에 붙이고 겹친 seq 는 버린다', () => {
    let state = mergeHistory(emptyChat(), 'initial', { items: [msg(5), msg(6)], hasMore: true });
    state = mergeHistory(state, 'before', { items: [msg(3), msg(4), msg(5)], hasMore: true });
    state = mergeHistory(state, 'after', { items: [msg(6), msg(7)], hasMore: false });
    expect(seqs(state)).toEqual([3, 4, 5, 6, 7]);
  });

  test('더 이전이 없으면 시작 안내를 붙일 수 있게 표시한다', () => {
    const state = mergeHistory(emptyChat(), 'initial', { items: [], hasMore: false });
    expect(state.reachedStart).toBe(true);
  });

  test('빈 구간 채우기의 hasMore 는 시작 안내와 무관하다', () => {
    let state = mergeHistory(emptyChat(), 'initial', { items: [msg(5)], hasMore: true });
    state = mergeHistory(state, 'after', { items: [msg(6)], hasMore: false });
    expect(state.reachedStart).toBe(false);
  });
});

describe('보내기와 echo', () => {
  const draft = { id: 'local-1', author: me, text: '쓰레기봉투 챙길게요', createdAt: '2026-09-06T06:26:00Z' };
  const echo: ChatMessage = { ...draft, seq: 9 };

  test('보내면 맨 아래에 전송 중으로 붙는다', () => {
    const state = enqueue(mergeHistory(emptyChat(), 'initial', { items: [msg(8)], hasMore: false }), draft);
    expect(state.items.at(-1)).toMatchObject({ id: 'local-1', status: 'sending' });
  });

  test('같은 id 를 연달아 보내도 한 번만 쌓인다', () => {
    const state = enqueue(enqueue(emptyChat(), draft), draft);
    expect(state.items).toHaveLength(1);
  });

  test('같은 id 의 CHAT 이 오면 그 자리에서 보냄으로 바뀐다', () => {
    let state = enqueue(emptyChat(), draft);
    state = receive(state, msg(10));
    state = receive(state, echo);
    expect(state.items.map((i) => [i.id, i.status])).toEqual([
      ['local-1', 'sent'],
      ['m10', 'sent'],
    ]);
    expect(state.items[0]).toMatchObject({ seq: 9 });
  });

  test('새 CHAT 은 아래에 붙고 이미 받은 것은 다시 붙지 않는다', () => {
    let state = receive(emptyChat(), msg(1));
    state = receive(state, msg(1));
    expect(state.items).toHaveLength(1);
  });

  test('재연결 뒤 빈 구간에 내 echo 가 섞여 와도 전송 중이 풀린다', () => {
    let state = enqueue(emptyChat(), draft);
    state = mergeHistory(state, 'after', { items: [echo], hasMore: false });
    expect(state.items).toHaveLength(1);
    expect(state.items[0]).toMatchObject({ status: 'sent', seq: 9 });
  });
});

describe('전송 실패와 다시 보내기', () => {
  const draft = { id: 'local-1', author: me, text: '쓰레기봉투 챙길게요', createdAt: '2026-09-06T06:26:00Z' };

  test('echo 가 없어 실패하면 자리를 지킨 채 실패로 바뀌고, 뒤에 온 메시지는 아래에 붙는다', () => {
    let state = markFailed(enqueue(emptyChat(), draft), 'local-1');
    state = receive(state, msg(10));
    expect(state.items.map((i) => [i.id, i.status])).toEqual([
      ['local-1', 'failed'],
      ['m10', 'sent'],
    ]);
  });

  test('다시 보내면 같은 id 로 전송 중이 된다', () => {
    const state = retry(markFailed(enqueue(emptyChat(), draft), 'local-1'), 'local-1');
    expect(state.items[0]).toMatchObject({ id: 'local-1', status: 'sending' });
  });

  test('이미 echo 를 받은 메시지는 늦은 타임아웃으로 실패가 되지 않는다', () => {
    const state = markFailed(receive(enqueue(emptyChat(), draft), { ...draft, seq: 9 }), 'local-1');
    expect(state.items[0]).toMatchObject({ status: 'sent' });
  });
});

describe('지워진 메시지', () => {
  test('CHAT_DELETED 의 seq 는 삭제된 메시지로 남는다', () => {
    const state = markDeleted(mergeHistory(emptyChat(), 'initial', { items: [msg(1), msg(2)], hasMore: false }), 2);
    expect(state.items.map((i) => i.status === 'sent' && i.deleted)).toEqual([false, true]);
  });
});

describe('말풍선 줄 만들기', () => {
  const rowsOf = (messages: ChatMessage[], today = '2026-09-28') =>
    chatRows(mergeHistory(emptyChat(), 'initial', { items: messages, hasMore: true }).items, 'u1', today);

  test('시각은 KST 오전·오후 12시간제다', () => {
    expect(chatTime('2026-09-06T06:24:00Z')).toBe('오후 3:24');
    expect(chatTime('2026-09-06T03:05:00Z')).toBe('오후 12:05');
    expect(chatTime('2026-09-05T15:30:00Z')).toBe('오전 12:30');
    expect(chatTime('2026-09-06T00:00:00Z')).toBe('오전 9:00');
  });

  test('날짜가 바뀔 때마다 구분선을 넣는다 — 오늘·어제·그 외 날짜', () => {
    const rows = rowsOf([
      msg(1, sanghyeok, '2026-09-06T06:24:00Z'),
      msg(2, sanghyeok, '2026-09-27T01:00:00Z'),
      msg(3, sanghyeok, '2026-09-27T15:10:00Z'),
    ]);
    expect(rows.filter((r) => r.type === 'date').map((r) => r.type === 'date' && r.label)).toEqual([
      '2026년 9월 6일 일요일',
      '어제',
      '오늘',
    ]);
  });

  test('같은 사람이 연달아 보내면 얼굴·이름은 첫 메시지에만, 같은 분 시각은 마지막에만', () => {
    const rows = rowsOf([
      msg(1, sanghyeok, '2026-09-06T06:24:00Z'),
      msg(2, sanghyeok, '2026-09-06T06:24:40Z'),
      msg(3, sanghyeok, '2026-09-06T06:26:00Z'),
      msg(4, me, '2026-09-06T06:26:10Z'),
    ]).filter((r) => r.type === 'message');
    expect(rows.map((r) => r.type === 'message' && [r.showAuthor, r.showTime, r.mine])).toEqual([
      [true, false, false],
      [false, true, false],
      [false, true, false],
      [false, true, true],
    ]);
  });

  test('다른 사람이 끼어들면 다시 얼굴·이름을 보인다', () => {
    const rows = rowsOf([msg(1), msg(2, me), msg(3)]).filter((r) => r.type === 'message');
    expect(rows.map((r) => r.type === 'message' && r.showAuthor)).toEqual([true, false, true]);
  });
});

describe('메시지 입력', () => {
  test('공백만 있으면 보낼 수 없고, 500자까지 보낼 수 있다', () => {
    expect(canSendChat(' \n ')).toBe(false);
    expect(canSendChat('네')).toBe(true);
    expect(canSendChat('가'.repeat(500))).toBe(true);
    expect(canSendChat('가'.repeat(501))).toBe(false);
  });

  test('글자 수는 보이지 않고, 500자에 닿아 더 입력되지 않을 때만 이유를 알린다', () => {
    expect(chatLimitNotice('가'.repeat(499))).toBeNull();
    expect(chatLimitNotice('가'.repeat(500))).toBe('500자까지 입력할 수 있어요.');
  });
});

describe('재연결 간격', () => {
  test('1·2·4·8초로 늘다가 30초에서 멈춘다', () => {
    expect([0, 1, 2, 3, 4, 5, 6].map(reconnectDelayMs)).toEqual([1000, 2000, 4000, 8000, 16000, 30000, 30000]);
  });
});

describe('화면을 떠났다 돌아오기', () => {
  const key = { meId: 'u1', crewId: 'c001' };
  const draft = { id: 'local-1', author: me, text: '쓰레기봉투 챙길게요', createdAt: '2026-09-06T06:26:00Z' };

  test('입력 중인 글과 전송 중·실패 메시지를 그대로 되살린다', () => {
    let state = enqueue(receive(emptyChat(), msg(1)), draft);
    state = markFailed(enqueue(state, { ...draft, id: 'local-2' }), 'local-2');
    saveChatSession(key, state, '다음에 이어서');

    const restored = chatSession(key);
    expect(restored.draft).toBe('다음에 이어서');
    expect(restored.unsent.map((i) => [i.id, i.status])).toEqual([
      ['local-1', 'sending'],
      ['local-2', 'failed'],
    ]);
  });

  test('다른 계정·다른 크루의 초안은 보이지 않는다', () => {
    saveChatSession(key, emptyChat(), '관열의 초안');
    expect(chatSession({ meId: 'u2', crewId: 'c001' })).toEqual({ draft: '', unsent: [] });
    expect(chatSession({ meId: 'u1', crewId: 'c002' })).toEqual({ draft: '', unsent: [] });
  });

  test('되살린 미전송 메시지는 새 이력 아래에 붙고 이력에 echo 가 있으면 보냄이 된다', () => {
    saveChatSession(key, enqueue(emptyChat(), draft), '');
    let state = mergeHistory(emptyChat(), 'initial', { items: [msg(1)], hasMore: false });
    state = chatSession(key).unsent.reduce(enqueue, state);
    expect(state.items.map((i) => i.status)).toEqual(['sent', 'sending']);
    state = mergeHistory(state, 'after', { items: [{ ...draft, seq: 2 }], hasMore: false });
    expect(state.items.map((i) => i.status)).toEqual(['sent', 'sent']);
  });
});

describe('말풍선 줄 — 경계', () => {
  const rowsAt = (times: string[]) =>
    chatRows(
      mergeHistory(emptyChat(), 'initial', { items: times.map((t, i) => msg(i + 1, sanghyeok, t)), hasMore: true }).items,
      'u1',
      '2026-09-28',
    );

  test('UTC 14:59 와 15:00 은 KST 로 다른 날이라 사이에 구분선이 들어간다', () => {
    const rows = rowsAt(['2026-09-05T14:59:00Z', '2026-09-05T15:00:00Z']);
    expect(rows.map((r) => r.type)).toEqual(['date', 'message', 'date', 'message']);
  });

  test('날짜가 바뀌면 같은 사람이어도 얼굴·이름을 다시 보인다', () => {
    const rows = rowsAt(['2026-09-05T14:59:00Z', '2026-09-05T15:00:00Z']).filter((r) => r.type === 'message');
    expect(rows.map((r) => r.type === 'message' && r.showAuthor)).toEqual([true, true]);
  });
});
