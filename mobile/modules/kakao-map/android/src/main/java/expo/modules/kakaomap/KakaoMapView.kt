package expo.modules.kakaomap

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Paint
import com.kakao.vectormap.GestureType
import com.kakao.vectormap.KakaoMap
import com.kakao.vectormap.KakaoMapReadyCallback
import com.kakao.vectormap.KakaoMapSdk
import com.kakao.vectormap.LatLng
import com.kakao.vectormap.MapLifeCycleCallback
import com.kakao.vectormap.MapView
import com.kakao.vectormap.camera.CameraAnimation
import com.kakao.vectormap.camera.CameraUpdateFactory
import com.kakao.vectormap.label.Label
import com.kakao.vectormap.label.LabelOptions
import com.kakao.vectormap.label.LabelStyle
import com.kakao.vectormap.label.LabelStyles
import com.kakao.vectormap.label.LabelTextBuilder
import com.kakao.vectormap.label.LabelTextStyle
import com.kakao.vectormap.route.RouteLine
import com.kakao.vectormap.route.RouteLineOptions
import com.kakao.vectormap.route.RouteLineSegment
import com.kakao.vectormap.route.RouteLineStyle
import com.kakao.vectormap.route.RouteLineStyles
import com.kakao.vectormap.route.RouteLineStylesSet
import com.kakao.vectormap.shape.DotPoints
import com.kakao.vectormap.shape.Polygon
import com.kakao.vectormap.shape.PolygonOptions
import com.kakao.vectormap.shape.PolygonStyles
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ExpoView

class KakaoMapView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
  private val onMapReady by EventDispatcher()
  private val onMapError by EventDispatcher()
  private val onMarkerPress by EventDispatcher()
  private val onUserGesture by EventDispatcher()

  // react-native-screens 는 다른 화면이 위에 오면 이 화면의 fragment 를 떼므로 지도가 창에서 빠진다.
  // SDK 는 그때 finishManually 가 아니면 엔진을 스스로 끝내 버려 돌아와도 검게 남는다.
  // 끝내기는 unmount 때 우리가 하고, 창에서 빠지고 붙을 때는 렌더 스레드만 멈췄다 잇는다
  private val mapView = MapView(context).also { addView(it) }
  private var map: KakaoMap? = null
  private var started = false
  private var pendingCenter: LatLng? = null
  private var pendingSegments: List<List<LatLng>> = emptyList()
  private var pendingMe: Pair<LatLng, Double?>? = null
  private var routeLine: RouteLine? = null
  private var meLabel: Label? = null
  private var meAccuracy: Polygon? = null
  /** 첫 이동만 확대 수준을 정한다. 그 뒤로는 사용자가 맞춘 확대를 지킨다 */
  private var cameraPlaced = false
  /** 따라가기 중 점마다 순간이동하면 지도가 1초 간격으로 끊긴다. 모션 줄이기면 끈다 */
  var animateCamera = true
  private var pendingMarkers: List<Marker> = emptyList()
  /** id 로 추가·이동·제거를 가른다. 소켓 갱신마다 전부 다시 그리지 않기 위해서다 */
  private val labels = mutableMapOf<String, Pair<Marker, Label>>()

  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    if (map != null) mapView.resume()
  }

  override fun onDetachedFromWindow() {
    if (map != null) mapView.pause()
    super.onDetachedFromWindow()
  }

  fun destroy() = mapView.finish()

  /** 키가 와야 SDK 를 초기화할 수 있고, 초기화 전에는 지도를 띄울 수 없다. */
  fun setAppKey(appKey: String) {
    if (started || appKey.isBlank()) return
    started = true
    // SDK 는 arm 계열 .so 만 싣는다. x86 에뮬레이터에서 앱째 죽지 않고 지도 자리만 실패로 알린다
    try {
      KakaoMapSdk.init(context, appKey)
      start()
    } catch (e: Throwable) {
      onMapError(mapOf("message" to (e.message ?: e.javaClass.simpleName)))
    }
  }

  fun setCenter(lat: Double, lng: Double) {
    val target = LatLng.from(lat, lng)
    if (map == null) pendingCenter = target else moveCamera(target)
  }

  fun setSegments(segments: List<List<LatLng>>) {
    if (map == null) pendingSegments = segments else drawSegments(segments)
  }

  fun setMyLocation(position: LatLng?, accuracy: Double?) {
    val me = position?.let { it to accuracy }
    if (map == null) pendingMe = me else drawMe(me)
  }

  fun setMarkers(markers: List<Marker>) {
    if (map == null) pendingMarkers = markers else drawMarkers(markers)
  }

  private fun start() {
    mapView.start(
      object : MapLifeCycleCallback() {
        override fun onMapDestroy() = Unit
        override fun onMapError(error: Exception) {
          onMapError(mapOf("message" to (error.message ?: "unknown")))
        }
      },
      object : KakaoMapReadyCallback() {
        override fun onMapReady(kakaoMap: KakaoMap) {
          map = kakaoMap
          pendingCenter?.let { moveCamera(it) }
          drawSegments(pendingSegments)
          drawMe(pendingMe)
          drawMarkers(pendingMarkers)
          kakaoMap.setOnCameraMoveStartListener { _, gesture ->
            if (gesture != GestureType.Unknown) onUserGesture(mapOf())
          }
          kakaoMap.setOnLabelClickListener { _, _, label ->
            val id = labels.entries.firstOrNull { it.value.second == label }?.key
              ?: return@setOnLabelClickListener false
            onMarkerPress(mapOf("id" to id))
            true
          }
          onMapReady(mapOf())
        }
      },
    )
    // start() 가 내부 SurfaceView 를 만든 뒤라야 먹는다. 그 전에 부르면 조용히 무시된다
    mapView.setFinishManually(true)
  }

  private fun moveCamera(target: LatLng) {
    val kakaoMap = map ?: return
    if (!cameraPlaced) {
      cameraPlaced = true
      kakaoMap.moveCamera(CameraUpdateFactory.newCenterPosition(target, ZOOM_LEVEL))
      return
    }
    val update = CameraUpdateFactory.newCenterPosition(target)
    if (animateCamera) kakaoMap.moveCamera(update, CameraAnimation.from(CAMERA_MS)) else kakaoMap.moveCamera(update)
  }

  /** 일시정지로 끊긴 구간은 이어 긋지 않는다. 매번 통째로 다시 그린다 — 한 활동의 점 수로는 충분히 가볍다 */
  private fun drawSegments(segments: List<List<LatLng>>) {
    val layer = map?.routeLineManager?.layer ?: return
    routeLine?.let { layer.remove(it) }
    routeLine = null
    val drawable = segments.filter { it.size >= 2 }
    if (drawable.isEmpty()) return
    val stylesSet = RouteLineStylesSet.from(
      RouteLineStyles.from(RouteLineStyle.from(dp(PATH_WIDTH_DP), PATH_COLOR)),
    )
    val lines = drawable.map { RouteLineSegment.from(it).setStyles(stylesSet.getStyles(0)) }
    routeLine = layer.addRouteLine(RouteLineOptions.from(lines).setStylesSet(stylesSet))
  }

  private fun drawMe(me: Pair<LatLng, Double?>?) {
    val kakaoMap = map ?: return
    val labelLayer = kakaoMap.labelManager?.layer ?: return
    val shapeLayer = kakaoMap.shapeManager?.layer
    meAccuracy?.let { shapeLayer?.remove(it) }
    meAccuracy = null
    if (me == null) {
      meLabel?.let { labelLayer.remove(it) }
      meLabel = null
      return
    }
    val (position, accuracy) = me
    if (accuracy != null && accuracy > 0) {
      meAccuracy = shapeLayer?.addPolygon(
        PolygonOptions.from(DotPoints.fromCircle(position, accuracy.toFloat()), PolygonStyles.from(ACCURACY_FILL)),
      )
    }
    val existing = meLabel
    if (existing != null) {
      existing.moveTo(position)
      return
    }
    val style = LabelStyle.from(meDot())
    val styles = kakaoMap.labelManager?.addLabelStyles(LabelStyles.from(style)) ?: LabelStyles.from(style)
    meLabel = labelLayer.addLabel(LabelOptions.from(ME_ID, position).setStyles(styles))
  }

  private fun meDot(): Bitmap {
    val size = dp(ME_DP).toInt()
    val bitmap = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(bitmap)
    val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = ON_DEEP }
    canvas.drawCircle(size / 2f, size / 2f, size / 2f, paint)
    paint.color = DEEP
    canvas.drawCircle(size / 2f, size / 2f, size / 2f - dp(3f), paint)
    return bitmap
  }

  private fun drawMarkers(markers: List<Marker>) {
    val layer = map?.labelManager?.layer ?: return
    val nextIds = markers.map { it.id }.toSet()
    labels.keys.filter { it !in nextIds }.forEach { labels.remove(it)?.second?.let { label -> layer.remove(label) } }
    for (marker in markers) {
      val position = LatLng.from(marker.latitude, marker.longitude)
      val existing = labels[marker.id]
      if (existing == null) {
        val label = layer.addLabel(
          LabelOptions.from(marker.id, position)
            .setStyles(markerStyles(marker))
            .setTexts(LabelTextBuilder().setTexts(marker.label))
            .setClickable(true),
        ) ?: continue
        labels[marker.id] = marker to label
        continue
      }
      val (previous, label) = existing
      if (previous.latitude != marker.latitude || previous.longitude != marker.longitude) label.moveTo(position)
      if (previous.paused != marker.paused || previous.label != marker.label) {
        label.changeStylesAndText(markerStyles(marker), LabelTextBuilder().setTexts(marker.label))
      }
      labels[marker.id] = marker to label
    }
  }

  private fun markerStyles(marker: Marker): LabelStyles {
    val style = LabelStyle.from(initialBadge(marker))
      .setTextStyles(LabelTextStyle.from(dp(12f).toInt(), if (marker.paused) INK_MUTED else INK))
    return map?.labelManager?.addLabelStyles(LabelStyles.from(style)) ?: LabelStyles.from(style)
  }

  /** 사진을 받아 합성하면 무겁다. 1차는 닉네임 첫 글자 원이다 */
  private fun initialBadge(marker: Marker): Bitmap {
    val size = dp(MARKER_DP).toInt()
    val bitmap = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(bitmap)
    val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = if (marker.paused) INK_MUTED else DEEP }
    canvas.drawCircle(size / 2f, size / 2f, size / 2f, paint)
    paint.color = ON_DEEP
    paint.textSize = size * 0.45f
    paint.textAlign = Paint.Align.CENTER
    val baseline = size / 2f - (paint.descent() + paint.ascent()) / 2
    canvas.drawText(marker.label.take(1), size / 2f, baseline, paint)
    return bitmap
  }

  private fun dp(value: Float) = value * resources.displayMetrics.density

  data class Marker(val id: String, val latitude: Double, val longitude: Double, val label: String, val paused: Boolean)

  private companion object {
    const val ZOOM_LEVEL = 16
    const val CAMERA_MS = 300
    const val PATH_WIDTH_DP = 8f
    const val PATH_COLOR = 0xFF6FBF3F.toInt()
    const val MARKER_DP = 32f
    const val ME_DP = 18f
    const val ME_ID = "__me"
    const val ACCURACY_FILL = 0x333D431F
    // design-system/tokens/colors.ts 라이트 테마. 네이티브는 토큰을 못 읽는다
    const val DEEP = 0xFF3D431F.toInt()
    const val ON_DEEP = 0xFFF4F04B.toInt()
    const val INK = 0xFF262A0E.toInt()
    const val INK_MUTED = 0xFF5C6142.toInt()
  }
}
