package expo.modules.trackingnotification

import android.app.Notification
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * expo-location 의 포그라운드 서비스 알림은 앱이 배경에 있으면 옵션을 다시 넘겨도 바뀌지 않는다.
 * 그 알림을 채널로 찾아 같은 id 로 다시 올려 제목·본문만 바꾼다.
 */
class TrackingNotificationModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("TrackingNotification")

    Function("update") { taskName: String, title: String, body: String, url: String ->
      val context = appContext.reactContext ?: return@Function false
      val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      val active = manager.activeNotifications.firstOrNull {
        it.notification.channelId?.endsWith(":$taskName") == true
      } ?: return@Function false
      // 실행 중인 MainActivity 를 다시 띄우지 않고 그 태스크로 돌아가게 한다. 플래그 없이 보내면 새 인스턴스가
      // 겹쳐 올라와 dev client 에서는 react context 중복 생성으로 죽고, 링크도 전달되지 않는다
      val open = Intent(Intent.ACTION_VIEW, Uri.parse(url))
        .setPackage(context.packageName)
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP)
      val builder = Notification.Builder.recoverBuilder(context, active.notification)
        .setContentTitle(title)
        .setContentText(body)
        .setOnlyAlertOnce(true)
        .setOngoing(true)
        .setContentIntent(PendingIntent.getActivity(context, 0, open, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE))
      manager.notify(active.id, builder.build())
      true
    }
  }
}
