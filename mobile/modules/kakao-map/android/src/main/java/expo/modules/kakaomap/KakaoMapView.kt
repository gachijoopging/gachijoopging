package expo.modules.kakaomap

import android.content.Context
import com.kakao.vectormap.KakaoMap
import com.kakao.vectormap.KakaoMapReadyCallback
import com.kakao.vectormap.KakaoMapSdk
import com.kakao.vectormap.LatLng
import com.kakao.vectormap.MapLifeCycleCallback
import com.kakao.vectormap.MapView
import com.kakao.vectormap.camera.CameraUpdateFactory
import com.kakao.vectormap.label.LabelOptions
import com.kakao.vectormap.label.LabelStyle
import com.kakao.vectormap.label.LabelStyles
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

  private val mapView = MapView(context).also { addView(it) }
  private var map: KakaoMap? = null
  private var started = false
  private var pendingCenter: LatLng? = null
  private var pendingPath: List<LatLng> = emptyList()

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
          onMapReady(mapOf())
        }
      },
    )
  }

  private fun moveCamera(target: LatLng) {
    val kakaoMap = map ?: return
    kakaoMap.moveCamera(CameraUpdateFactory.newCenterPosition(target, ZOOM_LEVEL))
    val styles = kakaoMap.labelManager?.addLabelStyles(
      LabelStyles.from(LabelStyle.from(android.R.drawable.ic_menu_mylocation)),
    ) ?: return
    kakaoMap.labelManager?.layer?.addLabel(LabelOptions.from(target).setStyles(styles))
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

  private companion object {
    const val ZOOM_LEVEL = 16
    const val PATH_WIDTH_DP = 8f
    const val PATH_COLOR = 0xFF6FBF3F.toInt()
  }
}
