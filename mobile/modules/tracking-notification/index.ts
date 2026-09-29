import { requireOptionalNativeModule } from 'expo';

type TrackingNotificationModule = { update(taskName: string, title: string, body: string, url: string): boolean };

const native = requireOptionalNativeModule<TrackingNotificationModule>('TrackingNotification');

/** 추적 중인 포그라운드 서비스 알림의 문구를 바꾼다. 알림이 없거나(권한 없음) 모듈이 없으면 false */
export function updateTrackingNotification(taskName: string, title: string, body: string, url: string): boolean {
  return native?.update(taskName, title, body, url) ?? false;
}
