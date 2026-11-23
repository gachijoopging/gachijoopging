import { ApiError } from '../api/client';
import {
  REASONS,
  canSubmitReport,
  clearReportDraft,
  editReportDraft,
  memoCounter,
  reportActions,
  reportDraftFor,
  reportRequestId,
  validReportTarget,
  resolveOutcome,
  submitOutcome,
  targetLabel,
  withoutKickedUser,
} from './report';

describe('신고 사유', () => {
  test('다섯 사유가 계약 enum 순서대로 있다', () => {
    expect(REASONS.map((r) => r.value)).toEqual(['SPAM', 'HATE', 'INAPPROPRIATE_PHOTO', 'PRIVACY', 'OTHER']);
  });

  test('사유를 고르지 않으면 제출할 수 없다', () => {
    expect(canSubmitReport(null, '')).toBe(false);
  });

  test('기타가 아니면 메모 없이 제출된다', () => {
    expect(canSubmitReport('SPAM', '')).toBe(true);
  });

  test('기타는 공백뿐인 메모로 제출할 수 없다', () => {
    expect(canSubmitReport('OTHER', '')).toBe(false);
    expect(canSubmitReport('OTHER', '  \n ')).toBe(false);
    expect(canSubmitReport('OTHER', '광고 링크')).toBe(true);
  });

  test('메모가 500자를 넘으면 제출할 수 없다', () => {
    expect(canSubmitReport('OTHER', '가'.repeat(501))).toBe(false);
  });
});

describe('남은 글자', () => {
  test('400자까지는 숨긴다', () => {
    expect(memoCounter('가'.repeat(400))).toBeNull();
  });

  test('400자를 넘으면 보이고 500에 닿으면 가득 찬 것으로 표시한다', () => {
    expect(memoCounter('가'.repeat(487))).toEqual({ text: '487/500', full: false });
    expect(memoCounter('가'.repeat(500))).toEqual({ text: '500/500', full: true });
  });
});

describe('신고 제출 결과', () => {
  test('성공하면 돌아간다', () => {
    expect(submitOutcome(null)).toEqual({ kind: 'done', message: '신고를 접수했어요' });
  });

  test('409 는 이미 신고한 대상이다', () => {
    expect(submitOutcome(new ApiError('CONFLICT'))).toEqual({ kind: 'duplicate', message: '이미 신고한 대상이에요.' });
  });

  test('그 외 오류는 입력을 남기고 다시 시도하게 한다', () => {
    expect(submitOutcome(new ApiError('MOCK_FAILURE'))).toEqual({
      kind: 'failed',
      message: '신고를 접수하지 못했어요. 다시 시도해 주세요.',
    });
    expect(submitOutcome(new TypeError('Network request failed')).kind).toBe('failed');
  });
});

describe('신고 초안', () => {
  afterEach(() => clearReportDraft('u1', 'POST', 'p1'));

  test('같은 대상으로 돌아오면 사유·메모가 남아 있다', () => {
    editReportDraft('u1', 'POST', 'p1', { reason: 'OTHER', memo: '광고' });
    expect(reportDraftFor('u1', 'POST', 'p1')).toMatchObject({ reason: 'OTHER', memo: '광고' });
    expect(reportDraftFor('u1', 'COMMENT', 'p1')).toMatchObject({ reason: null, memo: '' });
  });

  test('다른 계정은 앞 계정의 사유·메모·신고 id를 공유하지 않는다', () => {
    editReportDraft('u1', 'POST', 'p1', { reason: 'OTHER', memo: '비공개 신고 메모' });
    expect(reportRequestId('u1', 'POST', 'p1', () => 'u1-request')).toBe('u1-request');
    expect(reportDraftFor('u2', 'POST', 'p1')).toEqual({ reason: null, memo: '', requestId: null });
    expect(reportRequestId('u2', 'POST', 'p1', () => 'u2-request')).toBe('u2-request');
    clearReportDraft('u2', 'POST', 'p1');
  });

  test('같은 입력의 재시도는 같은 요청 id 를 쓴다', () => {
    let n = 0;
    const make = () => `id${++n}`;
    editReportDraft('u1', 'POST', 'p1', { reason: 'SPAM', memo: '' });
    expect(reportRequestId('u1', 'POST', 'p1', make)).toBe('id1');
    expect(reportRequestId('u1', 'POST', 'p1', make)).toBe('id1');
  });

  test('입력이 바뀌면 새 요청 id 를 쓴다', () => {
    let n = 0;
    const make = () => `id${++n}`;
    editReportDraft('u1', 'POST', 'p1', { reason: 'SPAM', memo: '' });
    reportRequestId('u1', 'POST', 'p1', make);
    editReportDraft('u1', 'POST', 'p1', { reason: 'HATE', memo: '' });
    expect(reportRequestId('u1', 'POST', 'p1', make)).toBe('id2');
  });

  test('성공하면 초안을 지운다', () => {
    editReportDraft('u1', 'POST', 'p1', { reason: 'SPAM', memo: '' });
    clearReportDraft('u1', 'POST', 'p1');
    expect(reportDraftFor('u1', 'POST', 'p1')).toMatchObject({ reason: null, memo: '' });
  });
});

test('신고 경계에서는 알려진 대상 유형과 비어 있지 않은 id만 허용한다', () => {
  expect(validReportTarget('POST', 'p1')).toBe(true);
  expect(validReportTarget('USER', 'u1')).toBe(true);
  expect(validReportTarget('UNKNOWN', 'p1')).toBe(false);
  expect(validReportTarget('POST', undefined)).toBe(false);
  expect(validReportTarget('POST', '  ')).toBe(false);
  expect(validReportTarget(['POST'], 'p1')).toBe(false);
});

describe('신고 처리 (6-2)', () => {
  test('대상 유형마다 요약 문구가 있다', () => {
    expect(targetLabel('POST')).toBe('게시물 신고');
    expect(targetLabel('COMMENT')).toBe('댓글 신고');
    expect(targetLabel('NOTICE_COMMENT')).toBe('공지 댓글 신고');
    expect(targetLabel('CHAT_MESSAGE')).toBe('크루 채팅 신고');
    expect(targetLabel('USER')).toBe('사용자 신고');
  });

  test('콘텐츠 신고는 기각 또는 삭제', () => {
    for (const t of ['POST', 'COMMENT', 'NOTICE_COMMENT', 'CHAT_MESSAGE']) {
      expect(reportActions(t)).toEqual(['DISMISS', 'DELETE']);
    }
  });

  test('사용자 신고는 삭제가 아니라 기각 또는 추방', () => {
    expect(reportActions('USER')).toEqual(['DISMISS', 'KICK']);
  });

  test('처리에 성공하면 행을 지우고 결과를 알린다', () => {
    expect(resolveOutcome('DISMISS', null)).toEqual({ removeRow: true, message: '신고를 기각했어요.' });
    expect(resolveOutcome('DELETE', null)).toEqual({ removeRow: true, message: '신고 대상을 삭제했어요.' });
  });

  test('다른 기기에서 먼저 처리됐으면 행을 지운다', () => {
    expect(resolveOutcome('DELETE', new ApiError('NOT_FOUND'))).toEqual({ removeRow: true, message: '이미 처리된 신고예요.' });
    expect(resolveOutcome('DISMISS', new ApiError('CONFLICT'))).toEqual({ removeRow: true, message: '이미 처리된 신고예요.' });
  });

  test('크루장이 아니게 됐으면 권한 없음으로 바꾼다', () => {
    expect(resolveOutcome('DELETE', new ApiError('FORBIDDEN'))).toEqual({ removeRow: false, message: null, denied: true });
  });

  test('그 외 실패는 행을 남긴다', () => {
    expect(resolveOutcome('DELETE', new ApiError('MOCK_FAILURE'))).toEqual({
      removeRow: false,
      message: '신고를 처리하지 못했어요. 다시 시도해 주세요.',
    });
  });

  test('추방하면 그 사용자의 대기 중 USER 신고가 모두 빠진다', () => {
    const reports = [
      { id: 'r1', targetType: 'USER', targetId: 'u9' },
      { id: 'r2', targetType: 'USER', targetId: 'u9' },
      { id: 'r3', targetType: 'POST', targetId: 'u9' },
      { id: 'r4', targetType: 'USER', targetId: 'u2' },
    ];
    expect(withoutKickedUser(reports, 'u9').map((r) => r.id)).toEqual(['r3', 'r4']);
  });
});
