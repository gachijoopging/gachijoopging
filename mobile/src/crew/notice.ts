type CommentActor = { authorId: string; meId: string; isLeader: boolean };

export function commentAction({ authorId, meId, isLeader }: CommentActor): 'delete' | 'report' {
  return isLeader || authorId === meId ? 'delete' : 'report';
}

/** 차단한 사람의 댓글은 내 화면에서만 숨긴다. 크루장은 삭제·신고 처리를 위해 모두 본다 (3-6 문서) */
export function visibleComments<T extends { author: { id: string } }>(comments: readonly T[], blocked: ReadonlySet<string>, isLeader: boolean): T[] {
  return isLeader ? [...comments] : comments.filter((c) => !blocked.has(c.author.id));
}

export const COMMENT_MAX = 500;

export function canSendComment(text: string): boolean {
  return text.trim().length > 0 && text.length <= COMMENT_MAX;
}
