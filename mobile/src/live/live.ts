import type { MapMarker } from '../../modules/kakao-map';

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
