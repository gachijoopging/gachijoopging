import {
  authorLink,
  beforeLabel,
  emptyCopy,
  manageAction,
  photoLabel,
  toggleLike,
} from './feed';

const me = 'u1';
const author = (id: string, withdrawn = false) => ({ id, withdrawn });

describe('게시물·댓글 관리 메뉴', () => {
  test('내 글은 크루원이든 크루장이든 삭제한다', () => {
    expect(manageAction({ author: author(me), meId: me, isLeader: false })).toBe('delete');
    expect(manageAction({ author: author(me), meId: me, isLeader: true })).toBe('delete');
  });

  test('크루장은 남의 글을 삭제하고 신고하지 않는다', () => {
    expect(manageAction({ author: author('u2'), meId: me, isLeader: true })).toBe('delete');
  });

  test('크루원은 남의 글을 신고한다', () => {
    expect(manageAction({ author: author('u2'), meId: me, isLeader: false })).toBe('report');
  });

  test('탈퇴한 사람의 글은 크루원에게 메뉴가 없고 크루장에게는 삭제만', () => {
    expect(manageAction({ author: author('u2', true), meId: me, isLeader: false })).toBeNull();
    expect(manageAction({ author: author('u2', true), meId: me, isLeader: true })).toBe('delete');
  });
});

describe('작성자 얼굴·이름을 누르면', () => {
  test('남이면 타인 프로필로 간다', () => {
    expect(authorLink(author('u2'), me)).toBe('other');
  });

  test('나면 내 정보로 간다', () => {
    expect(authorLink(author(me), me)).toBe('me');
  });

  test('탈퇴 여부는 withdrawn 으로만 본다 — 닉네임이 "탈퇴한 크루원" 이어도 살아 있으면 열린다', () => {
    expect(authorLink(author('u2', true), me)).toBeNull();
    const namesake = { id: 'u3', withdrawn: false, nickname: '탈퇴한 크루원' };
    expect(authorLink(namesake, me)).toBe('other');
  });
});

describe('좋아요 토글', () => {
  test('누르면 하트가 채워지고 수가 1 오른다', () => {
    expect(toggleLike({ liked: false, likeCount: 5 })).toEqual({ liked: true, likeCount: 6 });
  });

  test('취소하면 수가 1 내려가되 0 아래로 가지 않는다', () => {
    expect(toggleLike({ liked: true, likeCount: 6 })).toEqual({ liked: false, likeCount: 5 });
    expect(toggleLike({ liked: true, likeCount: 0 })).toEqual({ liked: false, likeCount: 0 });
  });

  test('두 번 토글하면 원래대로 — 실패 시 되돌리기', () => {
    const post = { liked: false, likeCount: 3, id: 'p' };
    expect(toggleLike(toggleLike(post))).toEqual(post);
  });
});

describe('날짜 필터 알약', () => {
  test('같은 해면 월·일만', () => {
    expect(beforeLabel('2026-09-06', '2026-09-29')).toBe('9월 6일 이전');
  });

  test('해가 다르면 연도를 붙인다', () => {
    expect(beforeLabel('2025-09-06', '2026-09-29')).toBe('2025년 9월 6일 이전');
  });
});

describe('빈 피드 문구', () => {
  test('날짜 필터가 있으면 탭과 상관없이 같은 문구에 버튼이 없다', () => {
    expect(emptyCopy('CREW', true)).toEqual({
      title: '그 날 이전 게시물이 없어요',
      description: '다른 날짜를 고르거나 필터를 지워 보세요.',
      write: false,
    });
    expect(emptyCopy('MINE', true).write).toBe(false);
  });

  test('전체 탭과 내 게시물 탭은 문구가 다르고 글쓰기 버튼이 있다', () => {
    expect(emptyCopy('CREW', false)).toEqual({ title: '아직 크루 소식이 없어요', description: '첫 게시물을 남겨 보세요.', write: true });
    expect(emptyCopy('MINE', false)).toEqual({
      title: '아직 올린 글이 없어요',
      description: '나만 보기로 올린 글도 여기에 모여요.',
      write: true,
    });
  });
});

describe('사진 라벨', () => {
  test('한 장이면 번호가 없다', () => {
    expect(photoLabel(0, 1)).toBe('게시물 사진');
  });

  test('여러 장이면 몇 번째인지 읽는다', () => {
    expect(photoLabel(0, 3)).toBe('게시물 사진, 3장 중 1번째');
  });
});
