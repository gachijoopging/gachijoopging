package expo.modules.kakaomap

import com.kakao.vectormap.LatLng
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class KakaoMapModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("KakaoMap")

    View(KakaoMapView::class) {
      Events("onMapReady", "onMapError", "onMarkerPress")

      Prop("appKey") { view: KakaoMapView, appKey: String ->
        view.setAppKey(appKey)
      }

      Prop("center") { view: KakaoMapView, center: Map<String, Double> ->
        val lat = center["latitude"] ?: return@Prop
        val lng = center["longitude"] ?: return@Prop
        view.setCenter(lat, lng)
      }

      Prop("path") { view: KakaoMapView, path: List<Map<String, Double>> ->
        view.setPath(path.mapNotNull {
          val lat = it["latitude"] ?: return@mapNotNull null
          val lng = it["longitude"] ?: return@mapNotNull null
          LatLng.from(lat, lng)
        })
      }

      Prop("markers") { view: KakaoMapView, markers: List<Map<String, Any?>> ->
        view.setMarkers(markers.mapNotNull {
          KakaoMapView.Marker(
            id = it["id"] as? String ?: return@mapNotNull null,
            latitude = (it["latitude"] as? Number)?.toDouble() ?: return@mapNotNull null,
            longitude = (it["longitude"] as? Number)?.toDouble() ?: return@mapNotNull null,
            label = it["label"] as? String ?: "",
            paused = it["paused"] as? Boolean ?: false,
          )
        })
      }
    }
  }
}
