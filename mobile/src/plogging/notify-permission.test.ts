import { askNotificationsOnce } from './notify-permission';

const perms = (status: string, canAskAgain = true, alreadyAsked = false) => {
  const requested: string[] = [];
  let asked = alreadyAsked;
  return {
    requested,
    get: async () => ({ status, canAskAgain }),
    request: async () => { requested.push('request'); return { status: 'denied' }; },
    wasAsked: () => asked,
    markAsked: () => { asked = true; },
  };
};

describe('시작 전 알림 권한', () => {
  test('아직 묻지 않았으면 OS 창을 띄운다', async () => {
    const p = perms('undetermined');
    await askNotificationsOnce(p);
    expect(p.requested).toEqual(['request']);
  });

  test('Android 13+ 는 묻기 전에도 denied 로 오지만 다시 물을 수 있으면 띄운다', async () => {
    const p = perms('denied', true);
    await askNotificationsOnce(p);
    expect(p.requested).toEqual(['request']);
  });

  test('한 번 물었으면 거부 뒤 OS 가 다시 물을 수 있다고 해도 또 띄우지 않는다', async () => {
    const p = perms('denied', true);
    await askNotificationsOnce(p);
    await askNotificationsOnce(p);
    expect(p.requested).toEqual(['request']);
  });

  test('이미 허용했으면 다시 묻지 않는다', async () => {
    const p = perms('granted');
    await askNotificationsOnce(p);
    expect(p.requested).toEqual([]);
  });

  test('OS 가 더는 물을 수 없다고 하면 띄우지 않는다', async () => {
    const p = perms('denied', false);
    await askNotificationsOnce(p);
    expect(p.requested).toEqual([]);
  });

  test('권한 확인이 실패해도 시작을 막지 않는다', async () => {
    const broken = { ...perms('denied'), get: async () => { throw new Error('no activity'); } };
    await expect(askNotificationsOnce(broken)).resolves.toBeUndefined();
  });
});
