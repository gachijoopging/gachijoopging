package expo.modules.kakaomap

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Paint
import com.kakao.vectormap.KakaoMap
import com.kakao.vectormap.KakaoMapReadyCallback
import com.kakao.vectormap.KakaoMapSdk
import com.kakao.vectormap.LatLng
import com.kakao.vectormap.MapLifeCycleCallback
import com.kakao.vectormap.MapView
import com.kakao.vectormap.camera.CameraUpdateFactory
import com.kakao.vectormap.label.Label
import com.kakao.vectormap.label.LabelOptions
import com.kakao.vectormap.label.LabelStyle
import com.kakao.vectormap.label.LabelStyles
import com.kakao.vectormap.label.LabelTextBuilder
import com.kakao.vectormap.label.LabelTextStyle
import com.kakao.vectormap.route.RouteLineOptions
import com.kakao.vectormap.route.RouteLineSegment
import com.kakao.vectormap.route.RouteLineStyle
import com.kakao.vectormap.route.RouteLineStyles
import com.kakao.vectormap.route.RouteLineStylesSet
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ExpoView

class KakaoMapView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
  private val onMapReady by EventDispatcher()
  private val onMapError by EventDispatcher()
  private val onMarkerPress by EventDispatcher()

  private val mapView = MapView(context).also { addView(it) }
  private var map: KakaoMap? = null
  private var started = false
  private var pendingCenter: LatLng? = null
  private var pendingPath: List<LatLng> = emptyList()
  private var pendingMarkers: List<Marker> = emptyList()
  /** id 로 추가·이동·제거를 가른다. 소켓 갱신마다 전부 다시 그리지 않기 위해서다 */
  private val labels = mutableMapOf<String, Pair<Marker, Label>>()

  /** 키가 와야 SDK 를 초기화할 수 있고, 초기화 전에는 지도를 띄울 수 없다. */
  fun setAppKey(appKey: String) {
    if (started || appKey.isBlank()) return
    started = true
    KakaoMapSdk.init(context, appKey)
    start()
  }

  fun setCenter(lat: Double, lng: Double) {
    val target = LatLng.from(lat, lng)
    if (map == null) pendingCenter = target else moveCamera(target)
  }

  fun setPath(points: List<LatLng>) {
    if (map == null) pendingPath = points else drawPath(points)
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
          if (pendingPath.isNotEmpty()) drawPath(pendingPath)
          drawMarkers(pendingMarkers)
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
  }

  private fun moveCamera(target: LatLng) {
    val kakaoMap = map ?: return
    kakaoMap.moveCamera(CameraUpdateFactory.newCenterPosition(target, ZOOM_LEVEL))
  }

  private fun drawPath(points: List<LatLng>) {
    if (points.size < 2) return
    val kakaoMap = map ?: return
    val stylesSet = RouteLineStylesSet.from(
      RouteLineStyles.from(RouteLineStyle.from(PATH_WIDTH_DP, PATH_COLOR)),
    )
    val segment = RouteLineSegment.from(points).setStyles(stylesSet.getStyles(0))
    kakaoMap.routeLineManager?.layer?.addRouteLine(
      RouteLineOptions.from(segment).setStylesSet(stylesSet),
    )
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
    const val PATH_WIDTH_DP = 8f
    const val PATH_COLOR = 0xFF6FBF3F.toInt()
    const val MARKER_DP = 32f
    // design-system/tokens/colors.ts 라이트 테마. 네이티브는 토큰을 못 읽는다
    const val DEEP = 0xFF3D431F.toInt()
    const val ON_DEEP = 0xFFF4F04B.toInt()
    const val INK = 0xFF262A0E.toInt()
    const val INK_MUTED = 0xFF5C6142.toInt()
  }
}
