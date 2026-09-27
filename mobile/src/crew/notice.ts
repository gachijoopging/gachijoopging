type CommentActor = { authorId: string; meId: string; isLeader: boolean };

export function commentAction({ authorId, meId, isLeader }: CommentActor): 'delete' | 'report' {
  return isLeader || authorId === meId ? 'delete' : 'report';
}

export const COMMENT_MAX = 500;

export function canSendComment(text: string): boolean {
  return text.trim().length > 0 && text.length <= COMMENT_MAX;
}
