import type { MapMarker } from '../../modules/kakao-map';
import type { components } from '../api/contract.generated';
import type { LiveEvent } from '../realtime/stomp';

/** `GET /crew/live` 한 항목 중 이 파일이 보는 필드 */
export type LiveMember = {
  user: { id: string; nickname: string; photoUrl: string | null };
  paused: boolean;
  locationShared: boolean;
  location: { lat: number; lng: number } | null;
};

export function locationShareLabel(member: LiveMember): string {
  if (!member.locationShared) return '위치를 공유하지 않아요';
  return member.location ? '위치 공유 중' : '위치를 확인하고 있어요';
}

export function crewMarkers(members: LiveMember[]): MapMarker[] {
  return members.flatMap(({ user, paused, locationShared, location }) =>
    locationShared && location
      ? [{ id: user.id, latitude: location.lat, longitude: location.lng, label: user.nickname, paused }]
      : [],
  );
}

/** `GET /crew/live` 한 항목이자 소켓 LIVE_STARTED 의 data */
export type CrewLive = components['schemas']['LiveMember'];

/** 소켓 LIVE_* 하나를 목록에 반영한다. 모르는 사람의 LIVE_UPDATE 는 버린다 — 재연결 뒤 `GET /crew/live` 가 다시 채운다 */
export function applyLiveEvent(members: readonly CrewLive[], event: LiveEvent): readonly CrewLive[] {
  switch (event.type) {
    case 'LIVE_STARTED':
      return [...members.filter((m) => m.user.id !== event.data.user.id), event.data];
    case 'LIVE_UPDATE': {
      const { userId, ...change } = event.data;
      return members.map((m) => (m.user.id === userId ? { ...m, ...change } : m));
    }
    case 'LIVE_ENDED':
      return members.filter((m) => !(m.user.id === event.data.userId && m.activityId === event.data.activityId));
  }
}
