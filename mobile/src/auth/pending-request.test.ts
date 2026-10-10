import { resolvePendingRequest } from './pending-request';

test('승인 상태여도 MEMBER 확인 전에는 홈으로 가지 않는다', () => {
  expect(resolvePendingRequest('APPROVED', 'PENDING')).toBe('confirming');
  expect(resolvePendingRequest('APPROVED', 'MEMBER')).toBe('home');
});

test('신청 조회 뒤 소속이 바뀌면 최신 소속으로 이동한다', () => {
  expect(resolvePendingRequest('PENDING', 'MEMBER')).toBe('home');
  expect(resolvePendingRequest(undefined, 'MEMBER')).toBe('home');
});

test('거절은 안내를 보이고, 취소·없는 신청은 크루 선택으로 보낸다', () => {
  expect(resolvePendingRequest('REJECTED', 'NONE')).toBe('rejected');
  expect(resolvePendingRequest('CANCELED', 'NONE')).toBe('choice');
  expect(resolvePendingRequest(undefined, 'NONE')).toBe('choice');
});
