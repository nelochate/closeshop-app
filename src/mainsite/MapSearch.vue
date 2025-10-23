<script setup lang="ts">
import { ref, onMounted, watch, onUnmounted } from 'vue'
import L from 'leaflet'
import { useRouter } from 'vue-router'
import { useGeolocation } from '@/composables/useGeolocation'
import { Capacitor } from '@capacitor/core'
import { supabase } from '@/utils/supabase'
import BottomNav from '@/common/layout/BottomNav.vue'

const activeTab = ref('map')

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

const shopIcon = L.icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-blue.png',
  iconRetinaUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
})

const { latitude, longitude, requestPermission, getLocation, startWatching, stopWatching } = useGeolocation()
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
const fetchShops = async () => {
  try {
    loading.value = true
    const { data, error } = await supabase
      .from('shops')
      .select('id, business_name, latitude, longitude, physical_store, logo_url')

    if (error) throw error
    shops.value = data || []
    plotShops()
  } catch (err: any) {
    errorMsg.value = err.message
  } finally {
    loading.value = false
  }
}

/* ✅ Plot markers safely */
const plotShops = () => {
  if (!map.value || !map.value._loaded) return

  // Clear previous markers
  shopMarkers.forEach((marker) => map.value?.removeLayer(marker))
  shopMarkers = []

  shops.value.forEach((shop) => {
    const lat = Number(shop.latitude)
    const lng = Number(shop.longitude)
    if (isNaN(lat) || isNaN(lng)) return

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

watch([latitude, longitude], ([lat, lng]) => {
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

  // ✅ Debounce and safely recenter (no animation during zoom)
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
</script>

<template>
  <v-app>
    <v-app-bar color="#3f83c7" flat>
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
        <v-btn icon @click="getLocation" class="locate-btn">
          <v-icon>mdi-crosshairs-gps</v-icon>
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