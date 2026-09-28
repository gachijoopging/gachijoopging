import { ApiError } from '../api/client';
import { joinDecisionOutcome, memberActionOutcome, memberMenu } from './manage';

describe('크루원 관리 메뉴', () => {
  const sanghyeok = { id: 'u2', isLeader: false };

  test('크루장은 일반 크루원 행에서 위임·추방을 고른다', () => {
    expect(memberMenu({ meId: 'u1', meIsLeader: true, member: sanghyeok })).toEqual(['delegate', 'kick']);
  });

  test('크루장 자기 행에는 메뉴가 없다', () => {
    expect(memberMenu({ meId: 'u1', meIsLeader: true, member: { id: 'u1', isLeader: true } })).toEqual([]);
  });

  test('일반 크루원은 누구의 행에서도 메뉴가 없다', () => {
    expect(memberMenu({ meId: 'u3', meIsLeader: false, member: sanghyeok })).toEqual([]);
    expect(memberMenu({ meId: 'u3', meIsLeader: false, member: { id: 'u1', isLeader: true } })).toEqual([]);
  });
});

describe('가입 신청 처리 결과', () => {
  test('승인에 성공하면 행을 지우고 환영 문구를 띄운다', () => {
    expect(joinDecisionOutcome('APPROVE', '지수', null)).toEqual({
      removeRow: true,
      message: '지수 님을 크루원으로 맞이했어요.',
    });
  });

  test('거절에 성공하면 행을 지우고 거절 문구를 띄운다', () => {
    expect(joinDecisionOutcome('REJECT', '지수', null)).toEqual({ removeRow: true, message: '가입 신청을 거절했어요.' });
  });

  test('다른 기기에서 이미 처리됐으면(404·409) 행을 지운다', () => {
    const already = { removeRow: true, message: '이미 처리된 가입 신청이에요.' };
    expect(joinDecisionOutcome('APPROVE', '지수', new ApiError('NOT_FOUND'))).toEqual(already);
    expect(joinDecisionOutcome('REJECT', '지수', new ApiError('CONFLICT'))).toEqual(already);
  });

  test('그 밖의 실패·오프라인이면 행을 남겨 다시 시도하게 한다', () => {
    const retry = { removeRow: false, message: '가입 신청을 처리하지 못했어요. 다시 시도해 주세요.' };
    expect(joinDecisionOutcome('APPROVE', '지수', new ApiError('INTERNAL'))).toEqual(retry);
    expect(joinDecisionOutcome('APPROVE', '지수', new TypeError('Network request failed'))).toEqual(retry);
  });
});

describe('위임·추방 결과', () => {
  test('위임에 성공하면 크루 정보로 돌아간다', () => {
    expect(memberActionOutcome('delegate', '상혁', null)).toEqual({
      next: 'leave',
      message: '상혁 님에게 크루장을 위임했어요.',
    });
  });

  test('추방에 성공하면 그 행만 지운다', () => {
    expect(memberActionOutcome('kick', '상혁', null)).toEqual({ next: 'removeRow', message: '상혁 님을 추방했어요.' });
  });

  test('다른 기기에서 이미 바뀌었으면(404·409) 목록을 다시 받는다', () => {
    const changed = { next: 'reload', message: '크루원 정보가 바뀌었어요.' };
    expect(memberActionOutcome('kick', '상혁', new ApiError('NOT_FOUND'))).toEqual(changed);
    expect(memberActionOutcome('delegate', '상혁', new ApiError('CONFLICT'))).toEqual(changed);
  });

  test('크루장이 아니게 됐으면(403) 역할을 다시 받아 메뉴를 숨긴다', () => {
    expect(memberActionOutcome('kick', '상혁', new ApiError('FORBIDDEN'))).toEqual({ next: 'reload', message: null });
  });

  test('그 밖의 실패는 목록을 그대로 두고 다시 시도하게 한다', () => {
    expect(memberActionOutcome('kick', '상혁', new ApiError('INTERNAL'))).toEqual({
      next: 'stay',
      message: '크루원 관리를 처리하지 못했어요. 다시 시도해 주세요.',
    });
  });
});
