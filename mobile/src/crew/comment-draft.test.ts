import { clearDraft, draftFor, editDraft, requestIdFor } from './comment-draft';

const ids = (...values: string[]) => {
  const queue = [...values];
  return () => queue.shift()!;
};

describe('공지 댓글 초안', () => {
  test('전송이 실패해 다시 보내면 같은 요청 id 를 쓴다 — 서버가 중복을 걸러 낸다', () => {
    const next = ids('r1', 'r2');
    editDraft('n01', '확인했습니다');
    expect(requestIdFor('n01', next)).toBe('r1');
    expect(requestIdFor('n01', next)).toBe('r1');
    clearDraft('n01');
  });

  test('실패한 뒤 글을 고치면 다른 댓글이므로 새 요청 id 를 쓴다', () => {
    const next = ids('r1', 'r2');
    editDraft('n01', '확인');
    requestIdFor('n01', next);
    editDraft('n01', '확인했습니다');
    expect(requestIdFor('n01', next)).toBe('r2');
    clearDraft('n01');
  });

  test('화면을 나갔다 와도 공지마다 쓰던 글이 남아 있고 서로 섞이지 않는다', () => {
    editDraft('n01', '첫 공지 댓글');
    editDraft('n02', '둘째 공지 댓글');
    expect(draftFor('n01').text).toBe('첫 공지 댓글');
    expect(draftFor('n02').text).toBe('둘째 공지 댓글');
    clearDraft('n01');
    clearDraft('n02');
  });

  test('전송에 성공해 비우면 빈 초안으로 돌아간다', () => {
    editDraft('n01', '확인');
    requestIdFor('n01', ids('r1'));
    clearDraft('n01');
    expect(draftFor('n01')).toEqual({ text: '', requestId: null });
  });
});
