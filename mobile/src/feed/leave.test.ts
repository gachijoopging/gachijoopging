let mockAccountFile: string | null = null;
const mockReplace = jest.fn();
const mockGet = jest.fn();
jest.mock('expo-file-system', () => ({ Paths: { document: 'documents' }, File: class {
  get exists() { return mockAccountFile != null; }
  textSync() { return mockAccountFile; }
  write(text: string) { mockAccountFile = text; }
  delete() { mockAccountFile = null; }
} }));
jest.mock('expo-router', () => ({ router: { replace: (...a: unknown[]) => mockReplace(...a) } }));
jest.mock('../api/config', () => ({ createApiClient: () => ({ get: (...a: unknown[]) => mockGet(...a) }) }));
import { currentAccount, rememberAccount } from '../auth/account';
import { leaveForMembership } from './leave';

test('NO_CREW 를 받으면 연결이 없어도 기억한 소속을 바꿔 이전 크루의 캐시를 버린다', async () => {
  const before = rememberAccount({ id: 'u1', membership: { status: 'MEMBER' } });
  mockGet.mockRejectedValueOnce(new Error('OFFLINE'));

  await leaveForMembership();

  expect(currentAccount()).toMatchObject({ id: 'u1', hasCrew: false });
  expect(currentAccount()?.since).not.toBe(before.since);
  expect(mockReplace).toHaveBeenCalledWith('/crew-choice');
});
