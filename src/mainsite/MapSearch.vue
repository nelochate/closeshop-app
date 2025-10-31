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

const map = ref<L.Map | null>(null)
const router = useRouter()
const search = ref('')
const shops = ref<any[]>([])
const loading = ref(false)
const errorMsg = ref<string | null>(null)
const showShopMenu = ref(false)

// Geolocation composable
const { latitude, longitude, requestPermission, getLocation, startWatching, stopWatching } = useGeolocation()

// Markers
let userMarker: L.Marker | null = null
let shopMarkers: L.Marker[] = []
let poiMarkers: L.Marker[] = []
let currentPopup: L.Popup | null = null

// Marker icons
const userIcon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
})

const shopIcon = L.icon({
  iconUrl: 'https://cdn.jsdelivr.net/gh/pointhi/leaflet-color-markers@master/img/marker-icon-red.png',
  iconRetinaUrl: 'https://cdn.jsdelivr.net/gh/pointhi/leaflet-color-markers@master/img/marker-icon-2x-red.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
})

const poiIcon = L.icon({
  iconUrl: 'https://cdn.jsdelivr.net/gh/pointhi/leaflet-color-markers@master/img/marker-icon-green.png',
  iconRetinaUrl: 'https://cdn.jsdelivr.net/gh/pointhi/leaflet-color-markers@master/img/marker-icon-2x-green.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
})

/* -------------------- MAP INITIALIZATION -------------------- */
const initializeMap = () => {
  if (map.value) {
    map.value.remove()
  }

  map.value = L.map('map', {
    center: [8.95, 125.53],
    zoom: 13,
    zoomAnimation: false,
    fadeAnimation: true,
    markerZoomAnimation: true,
  })

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors',
  }).addTo(map.value)
}

/* -------------------- CITY BOUNDARY -------------------- */
const highlightCityBoundary = async (cityName: string) => {
  if (!map.value) return

  try {
    const url = `https://nominatim.openstreetmap.org/search?format=geojson&polygon_geojson=1&addressdetails=1&city=${encodeURIComponent(cityName)}&country=Philippines`
    const res = await fetch(url, {
      headers: {
        'Accept-Language': 'en',
        'User-Agent': 'CloseShop/1.0 (contact@example.com)',
      },
    })
    const geo = await res.json()

    const feature = geo.features?.find(
      (f: any) =>
        f.geometry &&
        (f.properties?.class === 'boundary' || f.properties?.type === 'administrative') &&
        ['Polygon', 'MultiPolygon'].includes(f.geometry.type)
    )

    if (!feature) return

    if (cityBoundaryLayer.value && map.value.hasLayer(cityBoundaryLayer.value)) {
      map.value.removeLayer(cityBoundaryLayer.value)
    }

    cityBoundaryLayer.value = L.geoJSON(feature.geometry, {
      style: {
        color: '#0ea5e9',
        weight: 3,
        fillColor: '#0ea5e9',
        fillOpacity: 0.08,
      },
    }).addTo(map.value)

    map.value.fitBounds(cityBoundaryLayer.value.getBounds().pad(0.2))
  } catch (e) {
    console.error('Boundary fetch failed:', e)
  }
}

/* -------------------- SHOPS FETCHING -------------------- */
const fetchShops = async () => {
  try {
    loading.value = true
    const { data, error } = await supabase
      .from('shops')
      .select('id, business_name, latitude, longitude, logo_url, physical_store, detected_address')

    if (error) throw error
    if (!data) return

    const processed = await Promise.all(
      data.map(async (shop) => {
        let lat = parseFloat(shop.latitude)
        let lng = parseFloat(shop.longitude)

        if (isNaN(lat) || isNaN(lng)) {
          if (shop.detected_address) {
            try {
              const geoRes = await fetch(
                `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(shop.detected_address)}`
              )
              const geoData = await geoRes.json()
              if (geoData.length > 0) {
                lat = parseFloat(geoData[0].lat)
                lng = parseFloat(geoData[0].lon)
                await supabase.from('shops').update({ latitude: lat, longitude: lng }).eq('id', shop.id)
              }
            } catch (geoErr) {
              console.warn('Failed to geocode:', shop.business_name, geoErr)
            }
          }
        }
        return { ...shop, latitude: lat, longitude: lng }
      })
    )

    shops.value = processed
    plotShops()
  } catch (e) {
    console.error(e)
    errorMsg.value = 'Failed to fetch shops.'
  } finally {
    loading.value = false
  }
}

/* -------------------- PLOT SHOPS -------------------- */
const plotShops = () => {
  if (!map.value) return

  shopMarkers.forEach((m) => map.value?.removeLayer(m))
  shopMarkers = []

  shops.value.forEach((shop) => {
    const lat = Number(shop.latitude)
    const lng = Number(shop.longitude)
    if (isNaN(lat) || isNaN(lng)) return

    const imageUrl = shop.physical_store || shop.logo_url || 'https://via.placeholder.com/80'

    const marker = L.marker([lat, lng], { icon: shopIcon, title: shop.business_name }).addTo(map.value!)

    const popupHtml = `
      <div style="text-align:center;">
        <img src="${imageUrl}" width="80" height="80" style="border-radius:8px;object-fit:cover;margin-bottom:6px;" />
        <p><strong>${shop.business_name}</strong></p>
        <button id="view-${shop.id}" style="padding:6px 12px;background:#438fda;color:#fff;border:none;border-radius:6px;cursor:pointer;">View Shop</button>
      </div>
    `

    marker.bindPopup(popupHtml)
    marker.on('popupopen', () => {
      const btn = document.getElementById(`view-${shop.id}`)
      if (btn) {
        btn.onclick = () => {
          router.push(`/shop/${shop.id}`)
          marker.closePopup()
        }
      }
    })

    shopMarkers.push(marker)
  })

  if (shopMarkers.length > 0) {
    const group = L.featureGroup(shopMarkers)
    map.value.fitBounds(group.getBounds().pad(0.2))
  }
}

/* -------------------- NEARBY POIs -------------------- */
const fetchNearbyPOIs = async (lat: number, lng: number) => {
  if (!map.value) return
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=shop&addressdetails=1&limit=25&bounded=1&viewbox=${lng - 0.05},${lat + 0.05},${lng + 0.05},${lat - 0.05}`
    )
    const data = await res.json()

    poiMarkers.forEach((m) => map.value?.removeLayer(m))
    poiMarkers = []

    for (const place of data) {
      const poiLat = parseFloat(place.lat)
      const poiLng = parseFloat(place.lon)
      if (isNaN(poiLat) || isNaN(poiLng)) continue
      if (place.address?.city !== 'Butuan City') continue

      const name = place.display_name?.split(',')[0] || 'Unnamed Place'
      const isRegistered = shops.value.some(
        (s) =>
          s.business_name?.toLowerCase() === name.toLowerCase() &&
          Math.abs(s.latitude - poiLat) < 0.001 &&
          Math.abs(s.longitude - poiLng) < 0.001
      )
      if (isRegistered) continue

      const marker = L.marker([poiLat, poiLng], { icon: poiIcon, title: name }).addTo(map.value!)
      const mapsUrl = `https://www.google.com/maps?q=${poiLat},${poiLng}`

      const popupHtml = `
        <div style="text-align:center;">
          <p><strong>${name}</strong></p>
          <button id="invite-${poiLat}-${poiLng}" style="padding:6px 12px;background:#4caf50;color:white;border:none;border-radius:6px;cursor:pointer;margin-bottom:4px;">Invite Shop</button>
          <button id="viewmap-${poiLat}-${poiLng}" style="padding:6px 12px;background:#1976d2;color:white;border:none;border-radius:6px;cursor:pointer;">View on Map</button>
        </div>
      `

      marker.bindPopup(popupHtml)
      marker.on('popupopen', () => {
        document.getElementById(`invite-${poiLat}-${poiLng}`)?.addEventListener('click', () => {
          alert(`📨 Invitation sent to "${name}"!`)
          marker.closePopup()
        })
        document.getElementById(`viewmap-${poiLat}-${poiLng}`)?.addEventListener('click', () => {
          window.open(mapsUrl, '_blank')
        })
      })

      poiMarkers.push(marker)
    }
  } catch (e) {
    console.error('Failed to fetch POIs:', e)
  }
}

/* -------------------- USER LOCATION -------------------- */
let recenterTimeout: number | null = null
let lastPOIFetch = 0
const POI_FETCH_INTERVAL = 15000

watch([latitude, longitude], async ([lat, lng]) => {
  if (!map.value || lat == null || lng == null) return

  const userLat = Number(lat)
  const userLng = Number(lng)

  if (!isFinite(userLat) || !isFinite(userLng)) return

  if (userMarker) {
    userMarker.setLatLng([userLat, userLng])
  } else {
    userMarker = L.marker([userLat, userLng], { icon: userIcon }).addTo(map.value).bindPopup('You are here').openPopup()
  }

  const now = Date.now()
  if (now - lastPOIFetch > POI_FETCH_INTERVAL) {
    lastPOIFetch = now
    await fetchNearbyPOIs(userLat, userLng)
  }

  if (recenterTimeout) clearTimeout(recenterTimeout)
  recenterTimeout = window.setTimeout(() => {
    if (map.value && !currentPopup) map.value.setView([userLat, userLng], map.value.getZoom(), { animate: false })
  }, 1500)
})

/* -------------------- RECENTER BUTTON -------------------- */
const locating = ref(false)
const recenterToUser = async () => {
  locating.value = true
  try {
    const { coords } = await getLocation()
    if (coords && map.value) map.value.setView([coords.latitude, coords.longitude], 16, { animate: true })
  } catch {
    alert('Unable to retrieve location.')
  } finally {
    locating.value = false
  }
}

/* -------------------- LIFECYCLE -------------------- */
onMounted(async () => {
  if (Capacitor.getPlatform() !== 'web') await requestPermission()
  initializeMap()
  map.value?.whenReady(async () => {
    await startWatching()
    await fetchShops()
    await highlightCityBoundary('Butuan City')
  })
})

onUnmounted(() => {
  stopWatching()
  if (map.value) {
    map.value.off()
    map.value.remove()
  }
})
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
      >
        <template #append>
          <v-btn icon @click="console.log('Searching for', search)">
            <v-icon>mdi-magnify</v-icon>
          </v-btn>
        </template>
      </v-text-field>
    </v-app-bar>

    <v-main>

      
      <div id="map"></div>

  <div class="map-buttons" v-if="!showShopMenu">
  <v-btn icon :loading="locating" @click="recenterToUser" class="locate-btn">
    <v-icon>mdi-crosshairs-gps</v-icon>
  </v-btn>

  <v-btn icon @click="showShopMenu = true" class="menu-btn">
    <v-icon>mdi-menu</v-icon>
  </v-btn>
</div>

      <v-alert v-if="errorMsg" type="error" class="ma-4">{{ errorMsg }}</v-alert>
    </v-main>

    <v-navigation-drawer v-model="showShopMenu" location="right" temporary width="320">
      <v-toolbar flat color="primary" dark>
        <v-toolbar-title>Nearby Shops ({{ shops.length }})</v-toolbar-title>
        <v-btn icon @click="showShopMenu = false"><v-icon>mdi-close</v-icon></v-btn>
      </v-toolbar>

      <v-divider></v-divider>

      <v-list>
        <v-list-item
          v-for="shop in shops"
          :key="shop.id"
          @click="router.push(`/shop/${shop.id}`); showShopMenu = false"
        >
          <template #prepend>
            <v-avatar size="40">
              <img :src="shop.logo_url || shop.physical_store || 'https://via.placeholder.com/80'" />
            </v-avatar>
          </template>
          <v-list-item-title>{{ shop.business_name }}</v-list-item-title>
          <v-list-item-subtitle v-if="shop.detected_address">
            {{ shop.detected_address }}
          </v-list-item-subtitle>
        </v-list-item>
      </v-list>
    </v-navigation-drawer>

    <BottomNav v-model="activeTab" />
  </v-app>
</template>

<style scoped>
#map {
  position: absolute;
  top: var(--v-toolbar-height, 64px);
  bottom: var(--v-bottom-navigation-height, 56px);
  left: 0;
  right: 0;
  width: 100%;
}

.searchshop {
  padding: 30px 16px calc(12px + env(safe-area-inset-top)) 16px;
}

.map-buttons {
  position: absolute;
  bottom: 20px;              /* distance from bottom of map */
  right: 20px;               /* distance from right edge */
  display: flex;
  flex-direction: column;    /* stack vertically */
  gap: 10px;                 /* space between buttons */
  z-index: 2000;             /* 🟢 ensure above map overlay */
  pointer-events: auto;      /* allow taps */
}
/* each button inside gets a subtle white background */
.map-buttons .v-btn {
  background: white;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
  z-index: 2001;             /* 🟢 ensure they stay on top of popups */
}

.menu-btn,
.locate-btn {
  background: white;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
}

:deep(.leaflet-container) {
  background: #f8f9fa;
}

:deep(.leaflet-popup-content-wrapper) {
  border-radius: 8px;
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.15);
}
:deep(.v-navigation-drawer) {
  position: absolute !important;
  top: var(--v-toolbar-height, 64px);
  bottom: var(--v-bottom-navigation-height, 56px);
  height: auto !important;
  z-index: 3000 !important; /* 🟢 make sure it's above map buttons */
}
:deep(.v-navigation-drawer .v-toolbar) {
  z-index: 3100 !important;
  position: relative;
}
:deep(.v-navigation-drawer.v-navigation-drawer--temporary) {
  transition: transform 0.3s ease;
}

</style>
