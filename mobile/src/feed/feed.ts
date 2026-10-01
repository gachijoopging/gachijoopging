/** docs/openapi.yaml 의 Post. 목 example 은 리터럴이라 그대로 쓰면 타입이 좁다 */
export type UserBrief = { id: string; nickname: string; photoUrl: string | null; withdrawn: boolean };
export type Post = {
  id: string;
  author: UserBrief;
  text: string;
  visibility: 'CREW' | 'PRIVATE';
  media: readonly { url: string; thumbUrl: string }[];
  likeCount: number;
  liked: boolean;
  commentCount: number;
  createdAt: string;
};
export type Comment = { id: string; author: UserBrief; text: string; createdAt: string };

type Author = { id: string; withdrawn: boolean };
type Actor = { author: Author; meId: string; isLeader: boolean };

/** 권한표 그대로 — 신고는 크루원만, 남의 글 삭제는 크루장만. null 이면 시트를 띄우지 않는다 */
export function manageAction({ author, meId, isLeader }: Actor): 'delete' | 'report' | null {
  if (author.id === meId || isLeader) return 'delete';
  // 탈퇴한 사람은 신고해도 처리할 상대가 없다
  return author.withdrawn ? null : 'report';
}

/** 탈퇴는 닉네임 문자열이 아니라 withdrawn 으로만 판별한다 — 같은 닉네임의 살아 있는 계정과 구별되지 않는다 */
export function authorLink(author: Author, meId: string | undefined): 'me' | 'other' | null {
  if (author.withdrawn) return null;
  return author.id === meId ? 'me' : 'other';
}

export function toggleLike<T extends { liked: boolean; likeCount: number }>(post: T): T {
  return post.liked
    ? { ...post, liked: false, likeCount: Math.max(0, post.likeCount - 1) }
    : { ...post, liked: true, likeCount: post.likeCount + 1 };
}

export function beforeLabel(date: string, today: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const md = `${m}월 ${d}일 이전`;
  return date.slice(0, 4) === today.slice(0, 4) ? md : `${y}년 ${md}`;
}

export type FeedScope = 'CREW' | 'MINE';

export function emptyCopy(scope: FeedScope, filtered: boolean): { title: string; description: string; write: boolean } {
  if (filtered) return { title: '그 날 이전 게시물이 없어요', description: '다른 날짜를 고르거나 필터를 지워 보세요.', write: false };
  return scope === 'CREW'
    ? { title: '아직 크루 소식이 없어요', description: '첫 게시물을 남겨 보세요.', write: true }
    : { title: '아직 올린 글이 없어요', description: '나만 보기로 올린 글도 여기에 모여요.', write: true };
}

export function photoLabel(index: number, total: number): string {
  return total > 1 ? `게시물 사진, ${total}장 중 ${index + 1}번째` : '게시물 사진';
}

/** 빠르게 여러 번 눌러도 요청은 마지막 상태 하나만 — 서버가 이미 그 상태면 보내지 않는다 */
export function likeRequest(server: boolean, wanted: boolean): 'PUT /posts/{postId}/like' | 'DELETE /posts/{postId}/like' | null {
  if (server === wanted) return null;
  return wanted ? 'PUT /posts/{postId}/like' : 'DELETE /posts/{postId}/like';
}

/**
 * 서버 상태가 마지막으로 원한 상태와 같아질 때까지 보낸다. 성공할 때마다 st.server 를 고치므로
 * 실패해도 st.server 가 실제 서버 상태다 — 부르는 쪽은 그 값으로 화면을 되돌린다
 */
export type LikeSync = { server: boolean; wanted: boolean };

export async function syncLike(
  st: LikeSync,
  send: (key: 'PUT /posts/{postId}/like' | 'DELETE /posts/{postId}/like') => Promise<unknown>,
): Promise<void> {
  for (let req = likeRequest(st.server, st.wanted); req; req = likeRequest(st.server, st.wanted)) {
    await send(req);
    st.server = !st.server;
  }
}

/** 탈퇴는 withdrawn 으로만 판별한다. 서버가 남긴 닉네임 문자열에 기대지 않는다 */
export const displayName = (author: { nickname: string; withdrawn: boolean }) => (author.withdrawn ? '탈퇴한 크루원' : author.nickname);
