import { crewMarkers, locationShareLabel } from './live';

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
