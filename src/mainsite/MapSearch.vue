<script setup lang="ts">
import { ref, onMounted, watch, onUnmounted } from 'vue'
import L from 'leaflet'
import { useRouter } from 'vue-router'
import { useGeolocation } from '@/composables/useGeolocation'
import { Capacitor } from '@capacitor/core'
import { supabase } from '@/utils/supabase'
import BottomNav from '@/common/layout/BottomNav.vue'

const activeTab = ref('map')

// ✅ Fix Leaflet marker icons
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
 * Fetch shops from Supabase
 */
const fetchShops = async () => {
  try {
    loading.value = true
    const { data, error } = await supabase
      .from('shops')
      .select('id, business_name, latitude, longitude, physical_store') // 👈 use physical_store not logo

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

  // Clear old markers safely
  shopMarkers.forEach((m) => {
    if (map.value?.hasLayer(m)) {
      map.value.removeLayer(m)  // safer than m.remove()
    }
  })
  shopMarkers = []

  shops.value.forEach((shop) => {
    if (!shop.latitude || !shop.longitude) return

    const imageUrl = shop.physical_store || shop.logo_url || 'https://via.placeholder.com/80'

    const marker = L.marker([shop.latitude, shop.longitude])
      .addTo(map.value!)
      .bindPopup(`
        <div style="text-align:center;">
          <img src="${imageUrl}"
               alt="shop image" width="80" height="80" style="border-radius:8px; object-fit:cover;" />
          <p style="margin:5px 0;"><strong>${shop.business_name}</strong></p>
          <button id="view-${shop.id}"
                  style="padding:6px 12px; background:#438fda; color:#fff; border:none; border-radius:6px; cursor:pointer;">
            View Shop
          </button>
        </div>
      `)

    // ✅ Re-bind event when popup opens
    marker.on('popupopen', () => {
      const btn = document.getElementById(`view-${shop.id}`)
      if (btn) {
        btn.onclick = () => {
          router.push(`/shop/${shop.id}`)
        }
      }
    })

    shopMarkers.push(marker)
  })
}

onMounted(async () => {
  if (Capacitor.getPlatform() !== 'web') {
    await requestPermission()
  }

  // ✅ Initialize map
  map.value = L.map('map').setView([8.95, 125.53], 13)

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors',
  }).addTo(map.value)

  // ✅ Wait until map is ready before fetching shops
  map.value.whenReady(async () => {
    await startWatching()
    await fetchShops()
  })
})

// Update marker when location changes
let recenterTimeout: number | null = null

watch([latitude, longitude], ([lat, lng]) => {
  if (!map.value || lat === null || lng === null) return

  // Update user marker immediately
  if (userMarker) {
    userMarker.setLatLng([lat, lng])
  } else {
    userMarker = L.marker([lat, lng])
      .addTo(map.value!)
      .bindPopup('You are here')
      .openPopup()
  }

  // Debounce map.setView
  if (recenterTimeout) clearTimeout(recenterTimeout)
  recenterTimeout = window.setTimeout(() => {
    try {
      map.value!.setView([lat, lng], 15, { animate: true })
    } catch (err) {
      console.warn('⚠️ Leaflet setView failed:', err)
    }
  }, 1000) // wait 1 second after last GPS update
})


// ✅ Cleanup map + watchers when leaving page
onMounted(async () => {
  // ✅ Request permission only on native
  if (Capacitor.getPlatform() !== 'web') {
    await requestPermission()
  }

  // Initialize map
  map.value = L.map('map')

  // ✅ Wait until map is ready before setting view
  map.value.whenReady(() => {
    map.value!.setView([8.95, 125.53], 13)
  })

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors',
  }).addTo(map.value!)

  // Start tracking user location
  await startWatching()

  // Fetch shops once on mount
  await fetchShops()
})

</script>

<template>
  <v-app>
    <v-app-bar color="#3f83c7" flat>
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
        </template>
      </v-text-field>
    </v-app-bar>

    <v-main>
      <!-- Map -->
      <div id="map">
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
</style>
