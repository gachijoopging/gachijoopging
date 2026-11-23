import { applyLiveEvent, crewMarkers, locationShareLabel, type CrewLive } from './live';
import type { LiveEvent } from '../realtime/stomp';

const 상혁 = {
  user: { id: 'u1', nickname: '상혁', photoUrl: null },
  paused: false,
  locationShared: true,
  location: { lat: 37.52, lng: 126.93 },
};

describe('크루원 위치 공유 상태 문구', () => {
  test('공유를 껐으면 공유하지 않는다고 한다', () => {
    expect(locationShareLabel({ ...상혁, locationShared: false, location: null })).toBe('위치를 공유하지 않아요');
  });

  test('공유 중인데 좌표가 아직 없으면 확인 중이라고 한다', () => {
    expect(locationShareLabel({ ...상혁, location: null })).toBe('위치를 확인하고 있어요');
  });

  test('좌표가 있으면 공유 중이라고 한다', () => {
    expect(locationShareLabel(상혁)).toBe('위치 공유 중');
  });
});

describe('크루원 지도 마커', () => {
  test('공유를 켜고 좌표가 있는 크루원만 마커가 된다', () => {
    const 지수 = { ...상혁, user: { ...상혁.user, id: 'u2', nickname: '지수' }, locationShared: false, location: null };
    const 민수 = { ...상혁, user: { ...상혁.user, id: 'u3', nickname: '민수' }, location: null };
    expect(crewMarkers([상혁, 지수, 민수])).toEqual([
      { id: 'u1', latitude: 37.52, longitude: 126.93, label: '상혁', paused: false },
    ]);
  });

  test('일시정지한 크루원도 마커로 남고 일시정지로 표시된다', () => {
    expect(crewMarkers([{ ...상혁, paused: true }])[0].paused).toBe(true);
  });
});

describe('소켓 LIVE_* 반영', () => {
  const member = (id: string, activityId = `a-${id}`): CrewLive => ({
    user: { id, nickname: id, photoUrl: null, withdrawn: false },
    activityId,
    startedAt: '2026-09-07T08:30:00Z',
    elapsedSec: 60,
    distanceM: 100,
    itemCount: 1,
    paused: false,
    locationShared: true,
    location: { lng: 126.93, lat: 37.52 },
  });
  const update = (userId: string, change: Partial<Extract<LiveEvent, { type: 'LIVE_UPDATE' }>['data']> = {}): LiveEvent => ({
    type: 'LIVE_UPDATE',
    data: { userId, locationShared: true, location: { lng: 127, lat: 37.6 }, distanceM: 500, itemCount: 4, elapsedSec: 300, paused: false, ...change },
  });

  test('LIVE_STARTED 는 행을 더하고, 같은 사람이 다시 시작하면 바꾼다', () => {
    let members = applyLiveEvent([member('u1')], { type: 'LIVE_STARTED', data: member('u2') });
    members = applyLiveEvent(members, { type: 'LIVE_STARTED', data: member('u1', 'a-new') });
    expect(members.map((m) => [m.user.id, m.activityId])).toEqual([['u2', 'a-u2'], ['u1', 'a-new']]);
  });

  test('LIVE_UPDATE 는 그 사람의 위치·거리·개수·일시정지를 바꾼다', () => {
    const [u1, u2] = applyLiveEvent([member('u1'), member('u2')], update('u1', { paused: true }));
    expect(u1).toMatchObject({ location: { lng: 127, lat: 37.6 }, distanceM: 500, itemCount: 4, elapsedSec: 300, paused: true, activityId: 'a-u1' });
    expect(u2).toEqual(member('u2'));
  });

  test('위치 공유를 끈 갱신은 좌표를 지워 마커를 내린다', () => {
    const members = applyLiveEvent([member('u1')], update('u1', { locationShared: false, location: null }));
    expect(crewMarkers([...members])).toEqual([]);
    expect(locationShareLabel(members[0])).toBe('위치를 공유하지 않아요');
  });

  test('모르는 사람의 LIVE_UPDATE 는 버린다', () => {
    expect(applyLiveEvent([member('u1')], update('u9'))).toEqual([member('u1')]);
  });

  test('LIVE_ENDED 는 그 활동의 행만 지운다', () => {
    const members = [member('u1'), member('u2')];
    expect(applyLiveEvent(members, { type: 'LIVE_ENDED', data: { userId: 'u1', activityId: 'a-u1' } }).map((m) => m.user.id)).toEqual(['u2']);
    expect(applyLiveEvent(members, { type: 'LIVE_ENDED', data: { userId: 'u1', activityId: 'a-old' } })).toHaveLength(2);
  });
});
