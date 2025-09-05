<script setup lang="ts">
import { ref, onMounted, watch, onUnmounted } from 'vue'
import L from 'leaflet'
import { useRouter } from 'vue-router'
import { useGeolocation } from '@/composables/useGeolocation'

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

//  get geolocation composable
const { latitude, longitude, requestPermission, getLocation, startWatching, stopWatching } =
  useGeolocation()

const router = useRouter()
const search = ref('')
const map = ref<L.Map | null>(null)
let userMarker: L.Marker | null = null

const onSearch = () => {
  console.log('Searching for:', search.value)
}

const goNotifications = () => {
  router.push('/notifications')
}

const goBack = () => {
  router.back()
}

onMounted(async () => {
  await requestPermission()

  // Initialize map
  map.value = L.map('map').setView([8.95, 125.53], 13)

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors',
  }).addTo(map.value)

  // Start tracking
  await startWatching()
})

// Update marker when location changes
watch([latitude, longitude], ([lat, lng]) => {
  if (!map.value || lat === null || lng === null) return

  map.value.setView([lat, lng], 15)

  if (userMarker) {
    userMarker.setLatLng([lat, lng])
  } else {
    userMarker = L.marker([lat, lng]).addTo(map.value).bindPopup('You are here').openPopup()
  }
})

// cleanup tracking when leaving page
onUnmounted(() => {
  stopWatching()
})
</script>

<template>
  <v-app>
    <v-app-bar color="primary" flat>
      <!-- Back Button -->
      <v-btn icon @click="goBack">
        <v-icon>mdi-keyboard-backspace</v-icon>back
      </v-btn>

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
