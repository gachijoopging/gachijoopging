/** `GET /crew/chat/messages` 한 항목이자 소켓 CHAT 의 data */
export type ChatMessage = {
  seq: number;
  id: string;
  author: { id: string; nickname: string; photoUrl: string | null; withdrawn: boolean };
  text: string;
  createdAt: string;
};

/** 서버에 있는 메시지. deleted 는 크루장이 신고 처리로 지운 것 */
export type SentItem = ChatMessage & { status: 'sent'; deleted: boolean };
/** 내가 보냈지만 서버 echo 를 아직 못 받은 메시지. id 는 앱이 만든 uuid 라 재전송해도 같다 */
export type LocalItem = Omit<ChatMessage, 'seq'> & { status: 'sending' | 'failed' };
export type ChatItem = SentItem | LocalItem;

export type ChatState = { items: readonly ChatItem[]; reachedStart: boolean };

export function emptyChat(): ChatState {
  return { items: [], reachedStart: false };
}

const toSent = (m: ChatMessage): SentItem => ({ ...m, status: 'sent', deleted: false });

export function mergeHistory(
  state: ChatState,
  direction: 'initial' | 'before' | 'after',
  page: { items: readonly ChatMessage[]; hasMore: boolean },
): ChatState {
  state = page.items.reduce(confirm, state);
  const known = new Set(state.items.map((i) => i.id));
  const fresh = page.items
    .filter((m) => !known.has(m.id))
    .sort((a, b) => a.seq - b.seq)
    .map(toSent);
  if (direction === 'before') return { items: [...fresh, ...state.items], reachedStart: !page.hasMore };
  return {
    items: [...state.items, ...fresh],
    reachedStart: direction === 'initial' ? !page.hasMore : state.reachedStart,
  };
}

/** 내가 보낸 메시지의 echo 면 그 자리의 전송 중을 보냄으로 바꾼다 */
function confirm(state: ChatState, message: ChatMessage): ChatState {
  if (!state.items.some((i) => i.id === message.id && i.status !== 'sent')) return state;
  return { ...state, items: state.items.map((i) => (i.id === message.id ? toSent(message) : i)) };
}

export function receive(state: ChatState, message: ChatMessage): ChatState {
  state = confirm(state, message);
  if (state.items.some((i) => i.id === message.id)) return state;
  return { ...state, items: [...state.items, toSent(message)] };
}

/** 되살린 미전송 메시지는 status 를 그대로 가져온다 */
export function enqueue(state: ChatState, draft: Omit<ChatMessage, 'seq'> & { status?: LocalItem['status'] }): ChatState {
  if (state.items.some((i) => i.id === draft.id)) return state;
  return { ...state, items: [...state.items, { status: 'sending', ...draft }] };
}

function setLocalStatus(state: ChatState, id: string, status: LocalItem['status']): ChatState {
  return {
    ...state,
    items: state.items.map((i) => (i.id === id && i.status !== 'sent' ? { ...i, status } : i)),
  };
}

export function markFailed(state: ChatState, id: string): ChatState {
  return setLocalStatus(state, id, 'failed');
}

export function retry(state: ChatState, id: string): ChatState {
  return setLocalStatus(state, id, 'sending');
}

export function markDeleted(state: ChatState, seq: number): ChatState {
  return {
    ...state,
    items: state.items.map((i) => (i.status === 'sent' && i.seq === seq ? { ...i, deleted: true } : i)),
  };
}

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
const kst = (iso: string) => new Date(Date.parse(iso) + KST_OFFSET_MS);
const kstDate = (iso: string) => kst(iso).toISOString().slice(0, 10);
const kstMinute = (iso: string) => kst(iso).toISOString().slice(0, 16);

export function chatTime(iso: string): string {
  const t = kst(iso);
  const h = t.getUTCHours();
  const m = String(t.getUTCMinutes()).padStart(2, '0');
  return `${h < 12 ? '오전' : '오후'} ${h % 12 || 12}:${m}`;
}

function dateDivider(date: string, today: string): string {
  if (date === today) return '오늘';
  if (Date.parse(today) - Date.parse(date) === 24 * 60 * 60 * 1000) return '어제';
  const d = new Date(`${date}T00:00:00Z`);
  return `${d.getUTCFullYear()}년 ${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일 ${WEEKDAYS[d.getUTCDay()]}요일`;
}

export type ChatRow =
  | { type: 'date'; key: string; label: string }
  | { type: 'message'; key: string; item: ChatItem; mine: boolean; showAuthor: boolean; showTime: boolean };

/** today 는 KST 날짜(YYYY-MM-DD) */
export function chatRows(items: readonly ChatItem[], meId: string, today: string): ChatRow[] {
  const rows: ChatRow[] = [];
  items.forEach((item, i) => {
    const prev = items[i - 1];
    const next = items[i + 1];
    const date = kstDate(item.createdAt);
    const newDay = !prev || kstDate(prev.createdAt) !== date;
    if (newDay) rows.push({ type: 'date', key: `date-${date}`, label: dateDivider(date, today) });
    const mine = item.author.id === meId;
    const sameAuthorNext = next?.author.id === item.author.id && kstMinute(next.createdAt) === kstMinute(item.createdAt);
    rows.push({
      type: 'message',
      key: item.id,
      item,
      mine,
      showAuthor: !mine && (newDay || prev.author.id !== item.author.id),
      showTime: !sameAuthorNext,
    });
  });
  return rows;
}

export const CHAT_MAX = 500;

export function canSendChat(text: string): boolean {
  return text.trim().length > 0 && text.length <= CHAT_MAX;
}

/** 한도에 닿아 더 입력되지 않을 때만 그 이유를 알린다 */
export function chatLimitNotice(text: string): string | null {
  return text.length >= CHAT_MAX ? '500자까지 입력할 수 있어요.' : null;
}

/** docs/realtime.md 의 지수 백오프. attempt 는 0부터 */
export function reconnectDelayMs(attempt: number): number {
  return Math.min(1000 * 2 ** attempt, 30_000);
}

export type ChatSessionKey = { meId: string; crewId: string };
type ChatSession = { draft: string; unsent: LocalItem[] };

// ponytail: 메모리에만 둔다. 앱을 다시 켜면 사라진다 — 재실행 뒤에도 필요하면 AsyncStorage 로 옮긴다
const sessions = new Map<string, ChatSession>();
const sessionKey = ({ meId, crewId }: ChatSessionKey) => `${meId}/${crewId}`;

export function saveChatSession(key: ChatSessionKey, state: ChatState, draft: string): void {
  const unsent = state.items.filter((i): i is LocalItem => i.status !== 'sent');
  sessions.set(sessionKey(key), { draft, unsent });
}

export function chatSession(key: ChatSessionKey): ChatSession {
  return sessions.get(sessionKey(key)) ?? { draft: '', unsent: [] };
}
