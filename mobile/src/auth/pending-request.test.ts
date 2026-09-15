import { resolvePendingRequest } from './pending-request';

test('승인 상태여도 MEMBER 확인 전에는 홈으로 가지 않는다', () => {
  expect(resolvePendingRequest('APPROVED', 'PENDING')).toBe('pending');
  expect(resolvePendingRequest('APPROVED', 'MEMBER')).toBe('home');
});

test('거절과 취소·없는 신청을 구분한다', () => {
  expect(resolvePendingRequest('REJECTED', 'NONE')).toBe('rejected');
  expect(resolvePendingRequest('CANCELED', 'NONE')).toBe('empty');
  expect(resolvePendingRequest(undefined, 'NONE')).toBe('empty');
});
