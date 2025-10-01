<script setup lang="ts">
import { ref, onMounted, watch, onUnmounted } from 'vue'
import L from 'leaflet'
import { useRouter } from 'vue-router'
import { useGeolocation } from '@/composables/useGeolocation'
import { Capacitor } from '@capacitor/core'
import { supabase } from '@/utils/supabase'
import BottomNav from '@/common/layout/BottomNav.vue'

const activeTab = ref('map')

// Fix marker icons (otherwise they don’t show in build)
import iconUrl from 'leaflet/dist/images/marker-icon.png'
import iconRetinaUrl from 'leaflet/dist/images/marker-icon-2x.png'
import shadowUrl from 'leaflet/dist/images/marker-shadow.png'

L.Marker.prototype.options.icon = L.icon({
  iconRetinaUrl,
  iconUrl,
  shadowUrl,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  tooltipAnchor: [16, -28],
  shadowSize: [41, 41],
})

const { latitude, longitude, requestPermission, getLocation, startWatching, stopWatching } =
  useGeolocation()

const router = useRouter()
const search = ref('')
const map = ref<L.Map | null>(null)
let userMarker: L.Marker | null = null
let shopMarkers: L.Marker[] = []

const shops = ref<any[]>([])
const loading = ref(false)
const errorMsg = ref<string | null>(null)

const onSearch = () => {
  console.log('Searching for:', search.value)
}

/**
 * Fetch shops from Supabase near the user’s location
 * This example fetches all shops and you can later filter by distance
 */
const fetchShops = async () => {
  try {
    loading.value = true
    const { data, error } = await supabase
      .from('shops')
      .select('id, business_name, latitude, longitude, logo_url')

    if (error) throw error
    shops.value = data || []
    plotShops()
  } catch (err: any) {
    errorMsg.value = err.message
    console.error('Error fetching shops:', err)
  } finally {
    loading.value = false
  }
}

/**
 * Plot shop markers on the map
 */
const plotShops = () => {
  if (!map.value) return

  // Clear old markers
  shopMarkers.forEach((m) => m.remove())
  shopMarkers = []

  shops.value.forEach((shop) => {
    if (!shop.latitude || !shop.longitude) return

    const marker = L.marker([shop.latitude, shop.longitude])
      .addTo(map.value!)
      .bindPopup(`
        <div style="text-align:center;">
          <img src="${shop.logo_url || 'https://via.placeholder.com/80'}"
               alt="logo" width="60" height="60" style="border-radius:50%;" />
          <p style="margin:5px 0;"><strong>${shop.business_name}</strong></p>
          <button id="view-${shop.id}"
                  style="padding:6px 12px; background:#438fda; color:#fff; border:none; border-radius:6px; cursor:pointer;">
            View Shop
          </button>
        </div>
      `)

    // Handle button click inside popup
    marker.on('popupopen', () => {
      const btn = document.getElementById(`view-${shop.id}`)
      if (btn) {
        btn.addEventListener('click', () => {
          router.push(`/shop/${shop.id}`)
        })
      }
    })

    shopMarkers.push(marker)
  })
}

onMounted(async () => {
  // ✅ Request permission only on native
  if (Capacitor.getPlatform() !== 'web') {
    await requestPermission()
  }

  // Initialize map
  map.value = L.map('map').setView([8.95, 125.53], 13)

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors',
  }).addTo(map.value)

  // Start tracking user location
  await startWatching()

  // Fetch shops once on mount
  await fetchShops()
})

// Update marker when location changes
watch([latitude, longitude], ([lat, lng]) => {
  if (!map.value || lat === null || lng === null) return

  map.value.setView([lat, lng], 15)

  if (userMarker) {
    userMarker.setLatLng([lat, lng])
  } else {
    userMarker = L.marker([lat, lng])
      .addTo(map.value)
      .bindPopup('You are here')
      .openPopup()
  }
})

// cleanup tracking when leaving page
onUnmounted(() => {
  stopWatching()
})
</script>

<template>
  <v-app>
    <v-app-bar color="#3f83c7" flat>
      <!-- Search -->
      <v-text-field
        v-model="search"
        label="Search..."
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
          <v-btn icon @click="goNotifications">
            <v-icon>mdi-bell-outline</v-icon>
          </v-btn>
        </template>
      </v-text-field>
    </v-app-bar>

    <v-main>
      <!-- Map -->
      <div id="map">
        <!-- Manual refresh -->
        <v-btn icon @click="getLocation" class="locate-btn">
          <v-icon>mdi-crosshairs-gps</v-icon>
        </v-btn>
      </div>

      <div>
        <h1><strong>Stores within your location</strong></h1>
      </div>

      <v-alert v-if="errorMsg" type="error" class="ma-4">
        {{ errorMsg }}
      </v-alert>
    </v-main>

    <!-- Reusable BottomNav -->
    <BottomNav v-model="activeTab" />
  </v-app>
</template>

<style scoped>
#map {
  width: 100%;
  height: calc(100vh - 64px);
}

.locate-btn {
  position: absolute;
  bottom: 20px;
  right: 20px;
  z-index: 1000;
}
</style>
