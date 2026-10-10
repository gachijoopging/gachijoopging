import { createOnboardingMockClient, searchCrews } from './onboarding';

const status = async (api: ReturnType<typeof createOnboardingMockClient>) => (await api.get('GET /users/me')).data.membership;

test('공개 크루는 바로 가입되고 비공개 크루는 승인 대기가 된다', async () => {
  const open = createOnboardingMockClient();
  expect((await open.mutate('POST /crews/join-requests', { crewId: 'c003' })).data.status).toBe('APPROVED');
  expect((await status(open)).status).toBe('MEMBER');

  const closed = createOnboardingMockClient();
  expect((await closed.mutate('POST /crews/join-requests', { crewId: 'c001' })).data.status).toBe('PENDING');
  expect((await status(closed)).status).toBe('PENDING');
});

test('정원이 찬 크루는 공개여도 가입할 수 없다', async () => {
  const api = createOnboardingMockClient();
  await expect(api.mutate('POST /crews/join-requests', { crewId: 'c002' })).rejects.toMatchObject({ code: 'CREW_FULL' });
  expect((await status(api)).status).toBe('NONE');
});

test('대기 중이면 다른 크루를 만들거나 가입할 수 없다', async () => {
  const api = createOnboardingMockClient();
  await api.mutate('POST /crews/join-requests', { crewId: 'c001' });
  await expect(api.mutate('POST /crews', { name: '새크루', region: 'SEOUL', joinPolicy: 'OPEN' })).rejects.toMatchObject({ code: 'JOIN_REQUEST_PENDING' });
  await expect(api.mutate('POST /crews/join-requests', { crewId: 'c003' })).rejects.toMatchObject({ code: 'JOIN_REQUEST_PENDING' });
});

test('요청을 취소하면 소속 없음으로 돌아가고 신청은 CANCELED 다', async () => {
  const api = createOnboardingMockClient();
  await api.mutate('POST /crews/join-requests', { crewId: 'c001' });
  await api.mutate('DELETE /crews/join-requests/mine');
  expect((await status(api)).status).toBe('NONE');
  expect((await api.get('GET /crews/join-requests/mine')).data?.status).toBe('CANCELED');
});

test('거절 안내는 확인하기 전까지 남고 확인하면 사라진다', async () => {
  const api = createOnboardingMockClient();
  await api.mutate('POST /crews/join-requests', { crewId: 'c001' });
  expect((await api.get('GET /crews/join-requests/mine')).data?.status).toBe('PENDING');
  expect((await api.get('GET /crews/join-requests/mine')).data?.status).toBe('REJECTED');
  const rejected = await status(api);
  expect(rejected).toMatchObject({ status: 'NONE', rejection: { requestId: 'jr001', crew: { name: '한강줍깅크루' } } });
  await api.mutate('POST /crews/join-requests/{requestId}/read', { requestId: 'jr001' });
  expect((await status(api)).rejection).toBeNull();
});

test('크루 생성 성공만 소속을 바꾸고 실패는 보존한다', async () => {
  const failed = createOnboardingMockClient({ failing: ['POST /crews'] });
  await expect(failed.mutate('POST /crews', { name: '한강줍깅크루' })).rejects.toThrow();
  expect((await status(failed)).status).toBe('NONE');
  const api = createOnboardingMockClient();
  await api.mutate('POST /crews', { name: '한강줍깅크루', region: 'SEOUL', joinPolicy: 'APPROVAL' });
  expect((await status(api)).status).toBe('MEMBER');
});

test('크루 검색은 이름 부분 일치와 지역을 함께 건다', () => {
  expect(searchCrews().data.items.map((c) => c.id)).toEqual(['c001', 'c002', 'c003']);
  expect(searchCrews({ query: '망원' }).data.items.map((c) => c.id)).toEqual(['c002']);
  expect(searchCrews({ query: '한강', region: 'BUSAN' }).data.items).toEqual([]);
});
