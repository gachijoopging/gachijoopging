import { createOnboardingMockClient } from './onboarding';

test('가입 신청과 취소가 다음 화면의 소속·신청 조회에 반영된다', async () => {
  const api = createOnboardingMockClient();
  expect((await api.get('GET /users/me')).data.membership.status).toBe('NONE');
  await api.mutate('POST /crews/join-requests', { inviteCode: 'HG-7K2P' });
  expect((await api.get('GET /users/me')).data.membership.status).toBe('PENDING');
  expect((await api.get('GET /crews/join-requests/mine')).data?.status).toBe('PENDING');
  await api.mutate('DELETE /crews/join-requests/mine');
  expect((await api.get('GET /users/me')).data.membership.status).toBe('NONE');
  expect((await api.get('GET /crews/join-requests/mine')).data).toBeNull();
});

test('크루 생성 성공만 소속을 바꾸고 실패는 보존한다', async () => {
  const failed = createOnboardingMockClient({ failing: ['POST /crews'] });
  await expect(failed.mutate('POST /crews', { name: '한강줍깅크루' })).rejects.toThrow();
  expect((await failed.get('GET /users/me')).data.membership.status).toBe('NONE');
  const api = createOnboardingMockClient();
  await api.mutate('POST /crews', { name: '한강줍깅크루' });
  expect((await api.get('GET /users/me')).data.membership.status).toBe('MEMBER');
});
