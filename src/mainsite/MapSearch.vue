<script setup lang="ts">
import { ref, onMounted, watch, onUnmounted } from 'vue'
import L from 'leaflet'
import { useRouter } from 'vue-router'
import { useGeolocation } from '@/composables/useGeolocation'
import { Capacitor } from '@capacitor/core'
import { supabase } from '@/utils/supabase'
import BottomNav from '@/common/layout/BottomNav.vue'

const activeTab = ref('map')
const cityBoundaryLayer = ref<L.GeoJSON | null>(null)

// polygon style for city boundary
const highlightCityBoundary = async (cityName: string) => {
  if (!map.value) return

  // Ask Nominatim for the city polygon
  const url =
    `https://nominatim.openstreetmap.org/search` +
    `?format=geojson&polygon_geojson=1&addressdetails=1&dedupe=1&limit=5` +
    `&city=${encodeURIComponent(cityName)}` +
    `&country=Philippines`

  const res = await fetch(url, {
    headers: {
      'Accept-Language': 'en',
      // Good practice with Nominatim (rate-limits rely on UA)
      'User-Agent': 'CloseShop/1.0 (contact@example.com)',
    },
  })
  const geo = await res.json()

  if (!geo?.features?.length) {
    console.warn('No GeoJSON features for city:', cityName)
    return
  }

  // Prefer administrative boundary polygons
  const feature =
    geo.features.find(
      (f: any) =>
        f.geometry &&
        (f.properties?.class === 'boundary' ||
          f.properties?.category === 'boundary' ||
          f.properties?.type === 'administrative') &&
        (f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon'),
    ) ??
    // fallback: any polygon
    geo.features.find(
      (f: any) =>
        f.geometry && (f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon'),
    )

  if (!feature) {
    console.warn('No polygon boundary found for city:', cityName, geo.features)
    return
  }

  // Remove previous boundary layer
  if (cityBoundaryLayer.value && map.value.hasLayer(cityBoundaryLayer.value)) {
    map.value.removeLayer(cityBoundaryLayer.value)
  }

  // Draw boundary
  cityBoundaryLayer.value = L.geoJSON(feature.geometry, {
    style: {
      color: '#0ea5e9', // outline
      weight: 3,
      fillColor: '#0ea5e9', // soft fill
      fillOpacity: 0.08,
    },
  }).addTo(map.value)

  // Fit map to boundary
  map.value.fitBounds(cityBoundaryLayer.value.getBounds().pad(0.2))
}

const highlightBoundaryForUserLocation = async (lat: number, lng: number) => {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&addressdetails=1`,
      {
        headers: {
          'Accept-Language': 'en',
          'User-Agent': 'CloseShop/1.0 (contact@example.com)',
        },
      },
    )
    const data = await res.json()
    const addr = data?.address || {}

    // Nominatim can use different keys depending on locality
    const city = addr.city || addr.town || addr.municipality || addr.village || addr.county

    if (city) {
      await highlightCityBoundary(city)
    } else {
      console.warn('Could not resolve city name from reverse geocode.', data)
    }
  } catch (e) {
    console.error('Reverse geocode failed:', e)
  }
}

// ✅ Stable marker icons with retina support
const userIcon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
})
// for the registered shops
const shopIcon = L.icon({
  iconUrl:
    'https://cdn.jsdelivr.net/gh/pointhi/leaflet-color-markers@master/img/marker-icon-red.png',
  iconRetinaUrl:
    'https://cdn.jsdelivr.net/gh/pointhi/leaflet-color-markers@master/img/marker-icon-2x-red.png',
  shadowUrl: '',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
})

//marker for unregistered shops/nearby points of interest
const poiIcon = L.icon({
  iconUrl:
    'https://cdn.jsdelivr.net/gh/pointhi/leaflet-color-markers@master/img/marker-icon-green.png',
  iconRetinaUrl:
    'https://cdn.jsdelivr.net/gh/pointhi/leaflet-color-markers@master/img/marker-icon-2x-green.png',
  shadowUrl: '',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
})

const { latitude, longitude, requestPermission, getLocation, startWatching, stopWatching } =
  useGeolocation()
const router = useRouter()

const search = ref('')
const map = ref<L.Map | null>(null)
let userMarker: L.Marker | null = null
let shopMarkers: L.Marker[] = []
let currentPopup: L.Popup | null = null

const shops = ref<any[]>([])
const loading = ref(false)
const errorMsg = ref<string | null>(null)

/* 🔍 Search */
const onSearch = () => {
  console.log('Searching for:', search.value)
}

/* ✅ Fetch shops */
let poiMarkers: L.Marker[] = [] // 🧹 track green markers

const fetchNearbyPOIs = async (lat: number, lng: number) => {
  try {
    if (!lat || !lng || !map.value) return

    console.log('🔍 Searching nearby places...')
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=shop&addressdetails=1&limit=30&bounded=1&viewbox=${lng - 0.05},${lat + 0.05},${lng + 0.05},${lat - 0.05}`,
    )

    const data = await res.json()
    console.log('🟢 Found nearby POIs:', data.length)

    if (!Array.isArray(data)) {
      console.warn('⚠️ Nominatim did not return an array:', data)
      return
    }

    // 🧹 Remove old green markers first
    poiMarkers.forEach((m) => map.value?.removeLayer(m))
    poiMarkers = []

    data.forEach((place) => {
      const poiLat = parseFloat(place.lat)
      const poiLng = parseFloat(place.lon)
      if (isNaN(poiLat) || isNaN(poiLng)) return
      if (!place.address || place.address.city !== 'Butuan City') return

      const name = place.display_name?.split(',')[0] || 'Unnamed Place'

      // 🛑 Skip already registered shops (based on name + proximity)
      const isRegistered = shops.value.some((shop) => {
        const shopName = shop.business_name?.toLowerCase().trim()
        return (
          shopName &&
          name.toLowerCase().includes(shopName) &&
          Math.abs(shop.latitude - poiLat) < 0.001 &&
          Math.abs(shop.longitude - poiLng) < 0.001
        )
      })
      if (isRegistered) return

      // ✅ Add new green marker
      const marker = L.marker([poiLat, poiLng], {
        icon: poiIcon,
        title: name,
      }).addTo(map.value!)

      const mapsUrl = `https://www.google.com/maps?q=${poiLat},${poiLng}`

      const popupHtml = `
        <div style="text-align:center;">
          <p><strong>${name}</strong></p>
          <div style="display:flex; flex-direction:column; gap:6px; align-items:center;">
            <button id="invite-${poiLat}-${poiLng}"
                    style="padding:6px 12px; background:#4caf50; color:white; border:none; border-radius:6px; cursor:pointer;">
              Invite Shop to Join
            </button>
            <button id="viewmap-${poiLat}-${poiLng}"
                    style="padding:6px 12px; background:#1976d2; color:white; border:none; border-radius:6px; cursor:pointer;">
              View on Map
            </button>
          </div>
        </div>
      `
      marker.bindPopup(popupHtml)

      marker.on('popupopen', () => {
        const inviteBtn = document.getElementById(`invite-${poiLat}-${poiLng}`)
        const mapBtn = document.getElementById(`viewmap-${poiLat}-${poiLng}`)

        if (inviteBtn) {
          inviteBtn.onclick = () => {
            alert(`📨 Invitation sent to "${name}"!`)
            marker.closePopup()
          }
        }

        if (mapBtn) {
          mapBtn.onclick = () => {
            window.open(mapsUrl, '_blank')
          }
        }
      })

      poiMarkers.push(marker)
    })
  } catch (err) {
    console.error('Failed to fetch nearby POIs:', err)
  }
}

// 🔄 For shops missing coordinates, fetch coordinates from their address
/* ✅ Fetch shops (with fallback to address geocoding) */
const fetchShops = async () => {
  try {
    loading.value = true
    errorMsg.value = null

    const { data, error } = await supabase
      .from('shops')
      .select('id, business_name, latitude, longitude, physical_store, logo_url, detected_address')

    if (error) throw error
    if (!data) {
      errorMsg.value = 'No shops found.'
      return
    }

    // 🔄 For shops missing coordinates, fetch coordinates from their address
    const processedShops = await Promise.all(
      data.map(async (shop) => {
        let lat = parseFloat(shop.latitude)
        let lng = parseFloat(shop.longitude)

        if (isNaN(lat) || isNaN(lng)) {
          const address = shop.detected_address
          if (address) {
            try {
              const geoRes = await fetch(
                `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}`,
              )
              const geoData = await geoRes.json()
              if (geoData.length > 0) {
                lat = parseFloat(geoData[0].lat)
                lng = parseFloat(geoData[0].lon)

                // ✅ Optionally save back to Supabase for caching
                await supabase
                  .from('shops')
                  .update({ latitude: lat, longitude: lng })
                  .eq('id', shop.id)
              }
            } catch (geoErr) {
              console.warn(`Failed to geocode shop ${shop.business_name}:`, geoErr)
            }
          }
        }

        return { ...shop, latitude: lat, longitude: lng }
      }),
    )

    shops.value = processedShops
    plotShops()
  } catch (err: any) {
    errorMsg.value = err.message || 'Failed to fetch shops.'
    console.error(err)
  } finally {
    loading.value = false
  }
}

/* ✅ Plot markers safely */
const plotShops = () => {
  if (!map.value || !map.value._loaded) return

  // 🧹 Clear previous markers
  shopMarkers.forEach((marker) => map.value?.removeLayer(marker))
  shopMarkers = []

  shops.value.forEach((shop) => {
    const lat = Number(shop.latitude)
    const lng = Number(shop.longitude)

    if (isNaN(lat) || isNaN(lng)) {
      console.warn(
        '⚠️ Skipping shop with invalid coordinates:',
        shop.business_name,
        shop.latitude,
        shop.longitude,
      )
      return
    }

    const imageUrl = shop.physical_store || shop.logo_url || 'https://via.placeholder.com/80'

    const marker = L.marker([lat, lng], {
      icon: shopIcon,
      title: shop.business_name,
      updateWhenZoom: true,
    }).addTo(map.value!)

    const popupHtml = `
      <div style="text-align:center;">
        <img src="${imageUrl}" alt="${shop.business_name}"
             width="80" height="80"
             style="border-radius:8px; object-fit:cover; margin-bottom:6px;" />
        <p><strong>${shop.business_name}</strong></p>
        <button id="view-${shop.id}"
                style="padding:6px 12px; background:#438fda; color:#fff; border:none; border-radius:6px; cursor:pointer;">
          View Shop
        </button>
      </div>
    `

    marker.bindPopup(popupHtml)

    marker.on('popupopen', () => {
      currentPopup = marker.getPopup()
      const btn = document.getElementById(`view-${shop.id}`)
      if (btn) {
        btn.onclick = () => {
          router.push(`/shop/${shop.id}`)
          marker.closePopup()
        }
      }
    })

    marker.on('popupclose', () => {
      currentPopup = null
    })

    shopMarkers.push(marker)
  })

  // ✅ Adjust map to show all markers
  if (shopMarkers.length > 0 && map.value) {
    const group = L.featureGroup(shopMarkers)
    map.value.fitBounds(group.getBounds().pad(0.2))
  }

  console.log('🧭 Shop markers count:', shopMarkers.length)
}

/* ✅ Initialize map */
const initializeMap = () => {
  if (map.value) {
    map.value.stop()
    map.value.off()
    map.value.remove()
  }

  map.value = L.map('map', {
    center: [8.95, 125.53],
    zoom: 13,
    zoomAnimation: false, // ✅ disable animated zoom (fixes _latLngToNewLayerPoint)
    fadeAnimation: true,
    markerZoomAnimation: true,
  })

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors',
  }).addTo(map.value)
}

/* ✅ Lifecycle */
onMounted(async () => {
  if (Capacitor.getPlatform() !== 'web') await requestPermission()
  initializeMap()

  map.value?.whenReady(async () => {
    await startWatching()
    await fetchShops()
  })
})

/* ✅ Handle user marker + safe recentering */
let recenterTimeout: number | null = null
let lastPOIFetch = 0
const POI_FETCH_INTERVAL = 10000 // fetch green markers every 10 seconds max

watch([latitude, longitude], async ([lat, lng]) => {
  if (!map.value || lat == null || lng == null) return
  const userLat = Number(lat)
  const userLng = Number(lng)
  if (isNaN(userLat) || isNaN(userLng)) return

  if (userMarker) {
    userMarker.setLatLng([userLat, userLng])
  } else {
    userMarker = L.marker([userLat, userLng], { icon: userIcon, updateWhenZoom: true })
      .addTo(map.value)
      .bindPopup('You are here')
      .openPopup()
  }

  const now = Date.now()
  if (now - lastPOIFetch > POI_FETCH_INTERVAL) {
    lastPOIFetch = now
    await fetchNearbyPOIs(userLat, userLng)
    await highlightCityBoundary('Butuan City')

    // 🧹 Remove unwanted blue mini-polygons (like building outlines)
    map.value.eachLayer((layer) => {
      if (layer instanceof L.GeoJSON) {
        map.value.removeLayer(layer)
      }
    })
  }

  if (recenterTimeout) clearTimeout(recenterTimeout)
  recenterTimeout = window.setTimeout(() => {
    if (map.value && map.value._loaded && !currentPopup) {
      try {
        map.value.setView([userLat, userLng], map.value.getZoom(), { animate: false })
      } catch (err) {
        console.warn('⚠️ Safe setView failed:', err)
      }
    }
  }, 1500)
})

/* ✅ Cleanup */
onUnmounted(() => {
  stopWatching()
  if (map.value) {
    map.value.stop()
    shopMarkers.forEach((m) => map.value?.removeLayer(m))
    if (userMarker && map.value.hasLayer(userMarker)) {
      map.value.removeLayer(userMarker)
    }
    map.value.off()
    map.value.remove()
    map.value = null
  }
  shopMarkers = []
  userMarker = null
  currentPopup = null
})

/* ✅ Manual recenter to current location */
const locating = ref(false)

const recenterToUser = async () => {
  locating.value = true
  try {
    const { coords } = await getLocation()
    if (coords) {
      const lat = coords.latitude
      const lng = coords.longitude
      if (map.value) map.value.setView([lat, lng], 16, { animate: true })
    }
  } catch {
    alert('Unable to retrieve location.')
  } finally {
    locating.value = false
  }
}
</script>

<template>
  <v-app>
    <v-app-bar class="searchshop" color="#3f83c7" flat>
      <v-text-field
        v-model="search"
        label="Search shops..."
        hide-details
        density="comfortable"
        variant="outlined"
        class="search-bar"
        @keyup.enter="onSearch"
      >
        <template #append>
          <v-btn icon @click="onSearch">
            <v-icon>mdi-magnify</v-icon>
          </v-btn>
        </template>
      </v-text-field>
    </v-app-bar>

    <v-main>
      <!-- Map Container -->
      <div id="map">
        <v-btn icon :loading="locating" @click="recenterToUser" class="locate-btn">
          <v-icon v-if="!locating">mdi-crosshairs-gps</v-icon>
        </v-btn>
      </div>

      <div class="pa-4">
        <h2><strong>Stores near your location</strong></h2>
        <p v-if="shops.length > 0" class="text-caption">
          Found {{ shops.length }} store(s). Click markers to view.
        </p>
        <p v-if="loading" class="text-caption">Loading stores...</p>
      </div>

      <v-alert v-if="errorMsg" type="error" class="ma-4">
        {{ errorMsg }}
      </v-alert>
    </v-main>

    <BottomNav v-model="activeTab" />
  </v-app>
</template>

<style scoped>
#map {
  width: 100%;
  height: calc(100vh - 64px);
  position: relative;
}

.locate-btn {
  position: absolute;
  bottom: 20px;
  right: 20px;
  z-index: 1000;
  background: white;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
}
.searchshop {
 padding: 30px 16px calc(12px + env(safe-area-inset-top)) 16px;
}

/* ✅ Leaflet container stable visuals */
:deep(.leaflet-container) {
  background: #f8f9fa;
  font-family: inherit;
}

:deep(.leaflet-popup-content-wrapper) {
  border-radius: 8px;
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.15);
}

:deep(.leaflet-popup-content) {
  margin: 10px;
  text-align: center;
  font-size: 14px;
}

:deep(.leaflet-popup-tip) {
  box-shadow: 0 2px 5px rgba(0, 0, 0, 0.1);
}

</style>
