import { clearNoticeDraft, noticeDraft, noticeFormErrors, noticeSubmit, saveNoticeDraft } from './notice-edit';

describe('공지 입력 검증', () => {
  test('빈 제목·본문은 각 입력 아래에 안내한다', () => {
    expect(noticeFormErrors({ title: '  ', body: '\n' })).toEqual({
      title: '공지 제목을 입력해 주세요.',
      body: '공지 내용을 입력해 주세요.',
    });
  });

  test('제목 100자·본문 3000자를 넘으면 안내한다', () => {
    expect(noticeFormErrors({ title: '가'.repeat(101), body: '나'.repeat(3001) })).toEqual({
      title: '제목은 100자까지 입력할 수 있어요.',
      body: '내용은 3000자까지 입력할 수 있어요.',
    });
  });

  test('앞뒤 공백을 지운 뒤 1자 이상이면 통과한다', () => {
    expect(noticeFormErrors({ title: ' 안내 ', body: ` ${'나'.repeat(3000)} ` })).toEqual({});
  });
});

describe('공지 저장 요청', () => {
  test('작성은 유효하면 정리한 제목·본문을 보낸다', () => {
    expect(noticeSubmit(null, { title: ' 9월 정기 활동 ', body: ' 여의도에서 모여요. ' })).toEqual({
      title: '9월 정기 활동',
      body: '여의도에서 모여요.',
    });
  });

  test('유효하지 않으면 보내지 않는다', () => {
    expect(noticeSubmit(null, { title: '', body: '내용' })).toBeNull();
  });

  test('수정은 바뀐 것이 없으면 보내지 않는다', () => {
    const original = { title: '9월 정기 활동', body: '여의도에서 모여요.' };
    expect(noticeSubmit(original, { title: '9월 정기 활동 ', body: '여의도에서 모여요.' })).toBeNull();
    expect(noticeSubmit(original, { title: '9월 정기 활동', body: '여의나루에서 모여요.' })).toEqual({
      title: '9월 정기 활동',
      body: '여의나루에서 모여요.',
    });
  });
});

describe('공지 초안', () => {
  const key = { meId: 'u1', crewId: 'c001', noticeId: null };

  test('떠났다 다시 들어오면 쓰던 제목·본문을 되살린다', () => {
    saveNoticeDraft(key, { title: '10월 활동', body: '첫째 주' });
    expect(noticeDraft(key)).toEqual({ title: '10월 활동', body: '첫째 주' });
  });

  test('작성 초안과 공지별 수정 초안, 계정별 초안은 섞이지 않는다', () => {
    saveNoticeDraft(key, { title: '새 공지', body: '' });
    expect(noticeDraft({ ...key, noticeId: 'n01' })).toBeNull();
    expect(noticeDraft({ ...key, meId: 'u2' })).toBeNull();
  });

  test('저장에 성공해 비우면 다음엔 빈 입력으로 시작한다', () => {
    saveNoticeDraft(key, { title: '10월 활동', body: '첫째 주' });
    clearNoticeDraft(key);
    expect(noticeDraft(key)).toBeNull();
  });
});
