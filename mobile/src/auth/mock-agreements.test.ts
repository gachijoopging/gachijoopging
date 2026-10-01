let mockOwner = 'first';
jest.mock('./account', () => ({ currentAccount: () => ({ id: mockOwner, hasCrew: true }) }));
import { createMockClient } from '../api/client';

test('mock consent state belongs to the current account', async () => {
  const api = createMockClient();
  const { data: catalogue } = await api.get('GET /agreements');
  await api.mutate('PUT /users/me/agreements', { items: catalogue.items.map((item) => ({ type: item.type, version: item.version, agreed: item.required })) });
  expect((await api.get('GET /users/me/agreements')).data.complete).toBe(true);
  mockOwner = 'second';
  expect((await api.get('GET /users/me/agreements')).data.complete).toBe(false);
});

test('mock refuses consent for an obsolete version', async () => {
  const api = createMockClient();
  await expect(api.mutate('PUT /users/me/agreements', { items: [{ type: 'TERMS', version: 'obsolete', agreed: true }] })).rejects.toMatchObject({ code: 'VALIDATION', fields: [{ field: 'items', code: 'FORMAT' }] });
});
