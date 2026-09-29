type Permissions = {
  get: () => Promise<{ status: string; canAskAgain?: boolean }>;
  request: () => Promise<unknown>;
  wasAsked: () => boolean;
  markAsked: () => void;
};

/**
 * Android 13+ 은 아직 묻지 않은 권한도 denied 로 돌려주고, 한 번 거부해도 canAskAgain 이 true 로 남는다.
 * OS 만 믿으면 두 번 묻게 되므로 물었다는 사실은 앱이 따로 기억한다.
 * 거부해도 알림창 현황만 안 뜰 뿐이라 활동 시작은 어떤 경우에도 막지 않는다.
 */
export async function askNotificationsOnce(perms: Permissions): Promise<void> {
  try {
    if (perms.wasAsked()) return;
    const { status, canAskAgain } = await perms.get();
    if (status === 'granted' || canAskAgain === false) return;
    perms.markAsked();
    await perms.request();
  } catch {}
}
