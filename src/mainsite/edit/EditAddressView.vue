<script setup>
import { ref, onMounted, watch, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/utils/supabase'
import { useAuthUserStore } from '@/stores/authUser'
import { Geolocation } from '@capacitor/geolocation'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import 'leaflet.fullscreen/Control.FullScreen.css'
import 'leaflet.fullscreen/Control.FullScreen.js'

const router = useRouter()
const authStore = useAuthUserStore()

// --- State ---
const isLoading = ref(false)
const showSuccess = ref(false)
const successMessage = ref('')
const addressMode = ref('manual') // manual | location

// PSGC data
const regions = ref([])
const provinces = ref([])
const cities = ref([])
const barangays = ref([])

// Map refs
const manualMap = ref(null)
const manualMarker = ref(null)
const locationMap = ref(null)
const locationMarker = ref(null)

const snackbarMessage = ref('')
const showMapSnackbar = ref(false)

const address = ref({
  region: '',
  region_code: '',
  province: '',
  province_code: '',
  city: 'Butuan City',
  city_code: '',
  barangay: '',
  barangay_code: '',
  building: '',
  street: '',
  house_no: '',
  postal: '',
  purok: '',
})

// --- PSGC Loaders ---
const loadRegions = async () => {
  const res = await fetch('https://psgc.gitlab.io/api/regions/')
  regions.value = (await res.json()).sort((a, b) => a.name.localeCompare(b.name))
}
const loadProvinces = async (regionCode) => {
  const res = await fetch(`https://psgc.gitlab.io/api/regions/${regionCode}/provinces/`)
  provinces.value = (await res.json()).sort((a, b) => a.name.localeCompare(b.name))
}
const loadCities = async (provinceCode) => {
  const res = await fetch(
    `https://psgc.gitlab.io/api/provinces/${provinceCode}/cities-municipalities/`,
  )
  cities.value = (await res.json()).sort((a, b) => a.name.localeCompare(b.name))
}
const loadBarangays = async (cityCode) => {
  const res = await fetch(`https://psgc.gitlab.io/api/cities-municipalities/${cityCode}/barangays/`)
  barangays.value = (await res.json()).sort((a, b) => a.name.localeCompare(b.name))
}

// --- Load user address ---
const loadAddress = async () => {
  const { data: userData } = await supabase.auth.getUser()
  if (userData?.user && authStore.profile) {
    Object.assign(address.value, {
      region: authStore.profile.region || '',
      province: authStore.profile.province || '',
      city: authStore.profile.city || 'Butuan City',
      barangay: authStore.profile.barangay || '',
      building: authStore.profile.building || '',
      street: authStore.profile.street || '',
      house_no: authStore.profile.house_no || '',
      postal: authStore.profile.postal || '',
      purok: authStore.profile.purok || '',
    })
  }
}

// --- Save to Supabase ---
const saveAddress = async () => {
  try {
    isLoading.value = true
    const { data: userData } = await supabase.auth.getUser()
    if (!userData?.user) throw new Error('User not found')

    await supabase
      .from('profiles')
      .update({ ...address.value, updated_at: new Date().toISOString() })
      .eq('id', userData.user.id)

    await authStore.hydrateFromSession()
    successMessage.value = 'Address updated successfully!'
    showSuccess.value = true
    setTimeout(
      () => router.replace({ name: 'profileview', query: { refreshed: Date.now() } }),
      2000,
    )
  } catch (e) {
    successMessage.value = 'Failed to update address: ' + e.message
    showSuccess.value = true
  } finally {
    isLoading.value = false
  }
}

// --- Map Initialization ---
const initializeManualMap = () => {
  if (manualMap.value) return

  manualMap.value = L.map('manualMap', {
    zoomControl: true, // enable default zoom buttons
  }).setView([8.9492, 125.5436], 13)

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors',
  }).addTo(manualMap.value)

  // Add fullscreen control
  L.control
    .fullscreen({
      position: 'topleft',
      title: 'View Fullscreen',
      titleCancel: 'Exit Fullscreen',
    })
    .addTo(manualMap.value)

  manualMarker.value = L.marker([8.9492, 125.5436], { draggable: true }).addTo(manualMap.value)

  manualMarker.value.on('dragend', async (e) => {
    const pos = e.target.getLatLng()
    manualMap.value.setView([pos.lat, pos.lng])
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${pos.lat}&lon=${pos.lng}&format=json`,
    )
    const data = await res.json()
    if (data?.address) {
      const addr = data.address
      address.value.street = addr.road || ''
      address.value.barangay = addr.suburb || addr.village || ''
      address.value.city = addr.city || addr.town || ''
      snackbarMessage.value = [addr.house_number, addr.road, addr.suburb, addr.city]
        .filter(Boolean)
        .join(', ')
      showMapSnackbar.value = true
    }
  })
}

const initializeLocationMap = () => {
  locationMap.value = L.map('locationMap', {
    zoomControl: true,
  }).setView([8.9492, 125.5436], 13)

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors',
  }).addTo(locationMap.value)

  L.control
    .fullscreen({
      position: 'topleft',
      title: 'View Fullscreen',
      titleCancel: 'Exit Fullscreen',
    })
    .addTo(locationMap.value)

  locationMarker.value = L.marker([8.9492, 125.5436]).addTo(locationMap.value)
}

// --- Manual Map Update ---
const updateManualMap = async () => {
  const query = [
    address.value.house_no,
    address.value.street,
    address.value.barangay,
    address.value.city,
    address.value.province,
    'Philippines',
  ]
    .filter(Boolean)
    .join(', ')
  if (!query) return
  const res = await fetch(
    `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}`,
  )
  const results = await res.json()
  if (results.length > 0) {
    const { lat, lon } = results[0]
    manualMap.value.setView([+lat, +lon], 15)
    manualMarker.value.setLatLng([+lat, +lon])
  }
}

// --- Use GPS ---
const useCurrentLocation = async () => {
  try {
    const { coords } = await Geolocation.getCurrentPosition({
      enableHighAccuracy: true,
      timeout: 10000,
    })
    const { latitude, longitude } = coords
    locationMap.value.setView([latitude, longitude], 17)
    locationMarker.value.setLatLng([latitude, longitude])

    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json&addressdetails=1`,
    )
    const data = await res.json()
    if (data?.address) {
      const addr = data.address
      address.value.street = addr.road || ''
      address.value.barangay = addr.suburb || addr.village || ''
      address.value.city = addr.city || addr.town || ''
      address.value.province = addr.state || ''
      address.value.region = addr.region || ''
      address.value.postal = addr.postcode || ''
      snackbarMessage.value = [addr.house_number, addr.road, addr.suburb, addr.city]
        .filter(Boolean)
        .join(', ')
      showMapSnackbar.value = true
    }
  } catch (err) {
    snackbarMessage.value = 'Failed to get your location.'
    showMapSnackbar.value = true
  }
}

// --- Watchers ---
watch(
  () => address.value.region_code,
  (val) => val && loadProvinces(val),
)
watch(
  () => address.value.province_code,
  (val) => val && loadCities(val),
)
watch(
  () => address.value.city_code,
  (val) => val && loadBarangays(val),
)

watch(
  () => [address.value.street, address.value.house_no],
  () => {
    if (addressMode.value === 'manual') updateManualMap()
  },
)
watch(
  [
    () => address.value.region_code,
    () => address.value.province_code,
    () => address.value.city_code,
    () => address.value.barangay_code,
  ],
  async () => {
    if (addressMode.value === 'manual' && manualMap.value) {
      // Resolve names from PSGC lists for proper query text
      const regionObj = regions.value.find((r) => r.code === address.value.region_code)
      const provinceObj = provinces.value.find((p) => p.code === address.value.province_code)
      const cityObj = cities.value.find((c) => c.code === address.value.city_code)
      const barangayObj = barangays.value.find((b) => b.code === address.value.barangay_code)

      address.value.region = regionObj?.name || ''
      address.value.province = provinceObj?.name || ''
      address.value.city = cityObj?.name || ''
      address.value.barangay = barangayObj?.name || ''

      await nextTick()
      focusOnSelection()
    }
  },
  { deep: true },
)

// --- Lifecycle ---
onMounted(async () => {
  await loadRegions()
  await loadAddress()

  // Wait for DOM paint
  await nextTick()

  initializeManualMap()

  // Wait a bit and fix size after rendering
  setTimeout(() => {
    manualMap.value.invalidateSize()
  }, 300)
})

watch(addressMode, async (mode) => {
  await nextTick()
  if (mode === 'manual') {
    manualMap.value.invalidateSize()
  } else if (mode === 'location') {
    if (!locationMap.value) initializeLocationMap()
    else locationMap.value.invalidateSize()
  }
})

//zoom in
const focusOnSelection = async () => {
  // Build progressive query text
  const parts = [
    address.value.barangay && `${address.value.barangay},`,
    address.value.city && `${address.value.city},`,
    address.value.province && `${address.value.province},`,
    address.value.region && `${address.value.region},`,
    'Philippines',
  ].filter(Boolean)

  const query = parts.join(' ')
  const res = await fetch(
    `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}`,
  )
  const results = await res.json()
  if (!results.length) return
  const { lat, lon } = results[0]
  const latNum = parseFloat(lat)
  const lonNum = parseFloat(lon)

  // Zoom level logic
  let zoom = 6 // region
  if (address.value.province) zoom = 9
  if (address.value.city) zoom = 12
  if (address.value.barangay) zoom = 15

  manualMap.value.setView([latNum, lonNum], zoom)
  manualMarker.value.setLatLng([latNum, lonNum])
}
</script>

<template>
  <v-app>
    <v-app-bar flat color="#3f83c7">
      <v-btn icon @click="router.back()"><v-icon>mdi-arrow-left</v-icon></v-btn>
      <v-toolbar-title>Edit Address</v-toolbar-title>
    </v-app-bar>

    <v-main>
      <!-- Success Snackbar -->
      <v-snackbar v-model="showSuccess" :timeout="3000" color="success" location="top">
        {{ successMessage }}
      </v-snackbar>

      <!-- Map Snackbar -->
      <v-snackbar v-model="showMapSnackbar" :timeout="4000" color="info" location="top">
        {{ snackbarMessage }}
      </v-snackbar>

      <v-container>
        <!-- Address Mode -->
        <v-card>
          <v-card-title>Address Mode</v-card-title>
          <v-card-text>
            <v-radio-group v-model="addressMode" row>
              <v-radio label="Manual Input" value="manual" />
              <v-radio label="Use My Current Location" value="location" />
            </v-radio-group>
          </v-card-text>
        </v-card>

        <!-- Manual Mode -->
        <v-card v-if="addressMode === 'manual'" class="mt-4">
          <v-card-title>Enter Address Manually</v-card-title>
          <v-card-text>
            <v-form @submit.prevent="saveAddress">
              <v-row>
                <v-col cols="12" md="6">
                  <v-select
                    v-model="address.region_code"
                    :items="regions"
                    item-title="name"
                    item-value="code"
                    label="Region"
                    variant="outlined"
                  />
                </v-col>
                <v-col cols="12" md="6">
                  <v-select
                    v-model="address.province_code"
                    :items="provinces"
                    item-title="name"
                    item-value="code"
                    label="Province"
                    variant="outlined"
                    :disabled="!address.region_code"
                  />
                </v-col>
                <v-col cols="12" md="6">
                  <v-select
                    v-model="address.city_code"
                    :items="cities"
                    item-title="name"
                    item-value="code"
                    label="City / Municipality"
                    variant="outlined"
                    :disabled="!address.province_code"
                  />
                </v-col>
                <v-col cols="12" md="6">
                  <v-select
                    v-model="address.barangay_code"
                    :items="barangays"
                    item-title="name"
                    item-value="code"
                    label="Barangay"
                    variant="outlined"
                    :disabled="!address.city_code"
                  />
                </v-col>
                <v-col cols="12" md="6">
                  <v-text-field v-model="address.street" label="Street" variant="outlined" />
                </v-col>
                <v-col cols="12" md="6">
                  <v-text-field v-model="address.house_no" label="House No." variant="outlined" />
                </v-col>
                <v-col cols="12">
                  <div id="manualMap" class="map-wrapper"></div>
                </v-col>
                <v-col cols="12" class="text-right">
                  <v-btn type="submit" color="primary" size="large">
                    <v-icon class="me-2">mdi-check</v-icon>
                    {{ isLoading ? 'Saving...' : 'Save Address' }}
                  </v-btn>
                </v-col>
              </v-row>
            </v-form>
          </v-card-text>
        </v-card>

        <!-- Location Mode -->
        <v-card v-else class="mt-4">
          <v-card-title>Use My Current Location</v-card-title>
          <v-card-text>
            <v-btn color="primary" @click="useCurrentLocation">
              <v-icon class="me-2">mdi-crosshairs-gps</v-icon>
              Detect My Location
            </v-btn>
            <v-col cols="12" class="mt-4">
              <div id="locationMap" class="map-wrapper"></div>
            </v-col>
            <v-btn block color="primary" class="mt-4" @click="saveAddress">
              <v-icon class="me-2">mdi-check</v-icon>
              Save Current Location
            </v-btn>
          </v-card-text>
        </v-card>
      </v-container>
    </v-main>
  </v-app>
</template>

<style scoped>
.map-wrapper {
  width: 100%;
  height: 300px;
  border-radius: 12px;
  margin-top: 10px;
}
:deep(.leaflet-container:fullscreen) {
  width: 100vw;
  height: 100vh;
}
</style>
