import { canSendComment, commentAction } from './notice';

describe('공지 댓글 메뉴', () => {
  test('내 댓글은 삭제할 수 있다', () => {
    expect(commentAction({ authorId: 'u1', meId: 'u1', isLeader: false })).toBe('delete');
  });

  test('크루장은 누구의 댓글이든 삭제하고 신고하지 않는다', () => {
    expect(commentAction({ authorId: 'u2', meId: 'u1', isLeader: true })).toBe('delete');
  });

  test('크루원은 다른 사람 댓글을 신고한다', () => {
    expect(commentAction({ authorId: 'u2', meId: 'u1', isLeader: false })).toBe('report');
  });
});

describe('댓글 전송 가능 여부', () => {
  test('공백만 있으면 보낼 수 없다', () => {
    expect(canSendComment('')).toBe(false);
    expect(canSendComment('   \n ')).toBe(false);
  });

  test('한 글자부터 500자까지 보낼 수 있다', () => {
    expect(canSendComment('네')).toBe(true);
    expect(canSendComment('가'.repeat(500))).toBe(true);
  });

  test('500자를 넘으면 보낼 수 없다', () => {
    expect(canSendComment('가'.repeat(501))).toBe(false);
  });
});
