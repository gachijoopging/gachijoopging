export function formatDistance(meters: number): string {
  return meters < 1000 ? `${Math.round(meters)}m` : `${(meters / 1000).toFixed(1)}km`;
}

export function formatElapsed(sec: number): string {
  const minutes = Math.floor(sec / 60);
  const hours = Math.floor(minutes / 60);
  return hours > 0 ? `${hours}시간 ${minutes % 60}분` : `${minutes}분`;
}
