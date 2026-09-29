import type { ApiClient } from '../api/client';
import { enqueue, type Op } from './outbox';
import { getStored, loadAccount, updateStored } from './store';
import { syncOutbox } from './tracking';

jest.mock('expo-file-system', () => {
  const disk = new Map<string, string>();
  class File {
    private key: string;
    constructor(_dir: unknown, name: string) {
      this.key = name;
    }
    get exists() {
      return disk.has(this.key);
    }
    textSync() {
      return disk.get(this.key) ?? '';
    }
    write(text: string) {
      disk.set(this.key, text);
    }
    delete() {
      disk.delete(this.key);
    }
    create() {
      disk.set(this.key, '');
    }
  }
  return { File, Paths: { document: '' } };
});
let mockOnline = true;
jest.mock('expo-network', () => ({ getNetworkStateAsync: async () => ({ isConnected: mockOnline, isInternetReachable: mockOnline }) }));
jest.mock('expo-location', () => ({}));
jest.mock('expo-task-manager', () => ({ defineTask: () => {} }));
jest.mock('../../modules/tracking-notification', () => ({ updateTrackingNotification: () => false }));

const pause: Op = { kind: 'pause', activityId: 'a1' };
const resume: Op = { kind: 'resume', activityId: 'a1' };

function client(onSend: (key: string) => void | Promise<void>): ApiClient {
  return { get: async () => ({}) as never, mutate: async (key: string) => { await onSend(key); } } as ApiClient;
}

describe('큐 보내기', () => {
  beforeEach(() => {
    mockOnline = true;
    loadAccount(`u${Math.random()}`);
  });

  test('연결이 없으면 보내 보지도 않고 false — 시간 초과를 기다리지 않는다', async () => {
    mockOnline = false;
    updateStored((st) => ({ ...st, outbox: enqueue(st.outbox, pause) }));
    const send = jest.fn();
    expect(await syncOutbox(client(send))).toBe(false);
    expect(send).not.toHaveBeenCalled();
    expect(getStored().outbox).toEqual([pause]);
  });

  test('보내는 도중에 쌓인 것도 이어서 보낸다', async () => {
    updateStored((st) => ({ ...st, outbox: enqueue(st.outbox, pause) }));
    const sent: string[] = [];
    const ok = await syncOutbox(
      client((key) => {
        sent.push(key);
        // 첫 요청이 나가는 사이에 사용자가 하나 더 담았다
        if (sent.length === 1) updateStored((st) => ({ ...st, outbox: enqueue(st.outbox, resume) }));
      }),
    );
    expect(sent).toEqual(['POST /activities/{id}/pause', 'POST /activities/{id}/resume']);
    expect(ok).toBe(true);
    expect(getStored().outbox).toEqual([]);
  });

  test('실패하면 false 이고 큐를 남긴다', async () => {
    updateStored((st) => ({ ...st, outbox: enqueue(st.outbox, pause) }));
    const ok = await syncOutbox(client(() => Promise.reject(new Error('offline'))));
    expect(ok).toBe(false);
    expect(getStored().outbox).toEqual([pause]);
  });
});
