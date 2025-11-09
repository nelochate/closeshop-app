<script setup>
import { ref, onMounted, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { supabase } from '@/utils/supabase'
import { Geolocation } from '@capacitor/geolocation'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

const router = useRouter()
const route = useRoute()

// --- State ---
const isLoading = ref(false)
const showSuccess = ref(false)
const successMessage = ref('')
const showMapSnackbar = ref(false)
const snackbarMessage = ref('')
const addressMode = ref('manual')
const isEdit = ref(false)
const addressId = ref(route.query.id || null)

const map = ref(null)
const marker = ref(null)

const address = ref({
  region: 'Caraga',
  province: 'Agusan del Norte',
  city: 'Butuan City',
  recipient_name: '',
  phone: '',
  purok: '',
  barangay: '',
  building: '',
  street: '',
  house_no: '',
  postal_code: '8600',
  is_default: false,
})

const barangays = [
  'Agusan Pequeño', 'Ambago', 'Amparo', 'Ampayon', 'Anticala', 'Antongalon', 'Aupagan',
  'Baan KM 3', 'Baan Riverside Poblacion (Barangay 20)', 'Babag', 'Bading Poblacion (Barangay 22)',
  'Bancasi', 'Banza', 'Baobaoan', 'Basag', 'Bayanihan Poblacion (Barangay 27)', 'Bilay',
  'Bitan-agan', 'Bit-os', 'Bobon', 'Bonbon', 'Bugabus', 'Bugsukan', 'Buhangin Poblacion (Barangay 19)',
  'Cabcabon', 'Camayahan', 'Dagohoy Poblacion (Barangay 7)', 'Dankias', 'De Oro',
  'Diego Silang Poblacion (Barangay 6)', 'Don Francisco', 'Doongan', 'Dulag', 'Dumalagan',
  'Florida', 'Golden Ribbon Poblacion (Barangay 2)', 'Holy Redeemer Poblacion (Barangay 23)',
  'Humabon Poblacion (Barangay 11)', 'Imadejas Poblacion (Barangay 24)', 'Jose Rizal Poblacion (Barangay 25)',
  'Kinamlutan', 'Lapu-Lapu Poblacion (Barangay 8)', 'Lemon', 'Leon Kilat Poblacion (Barangay 13)',
  'Libertad', 'Limaha Poblacion (Barangay 14)', 'Los Angeles', 'Lumbocan', 'Maguinda',
  'Mahay', 'Mahogany Poblacion (Barangay 21)', 'Maibu', 'Mandamo', 'Manila de Bugabus',
  'Maon Poblacion (Barangay 1)', 'Masao', 'Maug', 'New Society Village Poblacion (Barangay 26)',
  'Nong-Nong', 'Obrero Poblacion (Barangay 18)', 'Ong Yiu Poblacion (Barangay 16)', 'Pagatpatan',
  'Pangabugan', 'Pianing', 'Pigdaulan', 'Pinamanculan',
  'Port Poyohon Poblacion (Barangay 17, New Asia)', 'Rajah Soliman Poblacion (Barangay 4)',
  'Salvacion', 'San Ignacio Poblacion (Barangay 15)', 'San Mateo', 'Santo Niño',
  'San Vicente', 'Sikatuna Poblacion (Barangay 10)', 'Silongan Poblacion (Barangay 5)',
  'Sumile', 'Sumilihon', 'Tagabaca', 'Taguibo', 'Taligaman',
  'Tandang Sora Poblacion (Barangay 12)', 'Tiniwisan', 'Tungao', 'Urduja Poblacion (Barangay 9)',
  'Villa Kananga'
]

// --- Load address if editing ---
const loadAddress = async () => {
  const { data: userData } = await supabase.auth.getUser()
  if (!userData?.user) return router.push({ name: 'login' })

  if (addressId.value) {
    const { data, error } = await supabase
      .from('addresses')
      .select('*')
      .eq('id', addressId.value)
      .eq('user_id', userData.user.id)
      .single()

    if (data) {
      address.value = { ...data }
      isEdit.value = true
      updateMap()
    } else if (error) {
      console.error('Load address error:', error)
    }
  }
}

// --- Save address ---
const saveAddress = async () => {
  try {
    isLoading.value = true
    const { data: userData } = await supabase.auth.getUser()
    if (!userData?.user) throw new Error('User not found')

    if (address.value.is_default) {
      // Set all other addresses to false
      await supabase.from('addresses')
        .update({ is_default: false })
        .eq('user_id', userData.user.id)
    }

    if (isEdit.value) {
      await supabase.from('addresses')
        .update({ ...address.value, updated_at: new Date().toISOString() })
        .eq('id', addressId.value)
    } else {
      await supabase.from('addresses').insert([{
        ...address.value,
        user_id: userData.user.id,
        created_at: new Date().toISOString(),
      }])
    }

    successMessage.value = isEdit.value ? 'Address updated successfully!' : 'Address added successfully!'
    showSuccess.value = true
    setTimeout(() => router.replace({ name: 'addresslist', query: { refreshed: Date.now() } }), 1500)

  } catch (error) {
    console.error('Save address error:', error)
    successMessage.value = 'Error: ' + error.message
    showSuccess.value = true
  } finally {
    isLoading.value = false
  }
}

// --- Update Map (via Node.js proxy) ---
const updateMap = async () => {
  if (!map.value) return

  const house = address.value.house_no || ''
  const street = address.value.street || ''
  const purok = address.value.purok || ''
  const barangay = address.value.barangay || ''
  const city = address.value.city || 'Butuan City'
  const query = `${house} ${street} ${purok} ${barangay}, ${city}, Philippines`

  if (!barangay && !street) return

  try {
    const res = await fetch(`http://localhost:3000/api/geocode?q=${encodeURIComponent(query)}`)
    const results = await res.json()
    if (results.length > 0) {
      const { lat, lon } = results[0]
      const latNum = parseFloat(lat)
      const lonNum = parseFloat(lon)

      map.value.setView([latNum, lonNum], 15)
      if (marker.value) marker.value.setLatLng([latNum, lonNum])
      else marker.value = L.marker([latNum, lonNum]).addTo(map.value)
    }
  } catch (error) {
    console.error('Error updating map via proxy:', error)
  }
}

// --- Detect user location ---
const useCurrentLocation = async () => {
  try {
    snackbarMessage.value = 'Getting your location...'
    showMapSnackbar.value = true

    const coords = await Geolocation.getCurrentPosition()
    const lat = coords.coords.latitude
    const lng = coords.coords.longitude

    map.value.setView([lat, lng], 15)
    if (marker.value) marker.value.setLatLng([lat, lng])
    else marker.value = L.marker([lat, lng]).addTo(map.value)

    // Reverse geocode via proxy
    const res = await fetch(`http://localhost:3000/api/geocode?q=${lat},${lng}`)
    const results = await res.json()
    if (results.length > 0 && results[0].display_name) {
      const addrParts = results[0].display_name.split(',').map(p => p.trim())
      address.value.street = addrParts[0] || ''
      address.value.barangay = addrParts[1] || ''
      address.value.city = addrParts[2] || 'Butuan City'
    }

    snackbarMessage.value = 'Location detected!'
    showMapSnackbar.value = true
  } catch (error) {
    console.error('Location error:', error)
    snackbarMessage.value = 'Unable to detect location.'
    showMapSnackbar.value = true
  }
}

// --- Lifecycle & Watchers ---
onMounted(() => {
  map.value = L.map('map').setView([8.9492, 125.5436], 13)
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors'
  }).addTo(map.value)
  loadAddress()
})

watch(
  () => [address.value.street, address.value.barangay, address.value.house_no],
  () => updateMap()
)
</script>

<template>
  <v-app>
    <v-app-bar flat color="#3f83c7">
      <v-btn icon @click="router.back()"><v-icon>mdi-arrow-left</v-icon></v-btn>
      <v-toolbar-title>{{ isEdit ? 'Edit Address' : 'Add New Address' }}</v-toolbar-title>
    </v-app-bar>

    <v-main>
      <v-snackbar v-model="showSuccess" :timeout="3000" color="success" location="top">
        {{ successMessage }}
      </v-snackbar>

      <v-snackbar v-model="showMapSnackbar" :timeout="4000" color="info" location="top">
        {{ snackbarMessage }}
      </v-snackbar>

      <v-container>
        <v-card>
          <v-card-title>Address Mode</v-card-title>
          <v-card-text>
            <v-radio-group v-model="addressMode" row>
              <v-radio label="Manual Input" value="manual" />
              <v-radio label="Use My Current Location" value="location" />
            </v-radio-group>
          </v-card-text>
        </v-card>

        <v-card v-if="addressMode === 'manual'" class="mt-4">
          <v-card-title>Enter Address Manually</v-card-title>
          <v-card-text>
            <v-form @submit.prevent="saveAddress">
              <v-row>
                <v-col cols="12"><v-text-field v-model="address.recipient_name" label="Recipient Name" /></v-col>
                <v-col cols="12"><v-text-field v-model="address.phone" label="Phone Number" /></v-col>
                <v-col cols="12"><v-select v-model="address.barangay" :items="barangays" label="Barangay" required /></v-col>
                <v-col cols="12"><v-text-field v-model="address.purok" label="Purok" /></v-col>
                <v-col cols="12"><v-text-field v-model="address.street" label="Street" /></v-col>
                <v-col cols="12"><v-text-field v-model="address.building" label="Building No." /></v-col>
                <v-col cols="12"><v-text-field v-model="address.house_no" label="House No." /></v-col>
                <v-col cols="12"><v-text-field v-model="address.postal_code" label="Postal Code" /></v-col>

                <v-col cols="12">
                  <div id="map" class="map-wrapper"></div>
                  <p class="text-caption mt-2">Map updates automatically</p>
                </v-col>

                <v-col cols="12" class="text-right">
                  <v-btn type="submit" color="primary" :loading="isLoading" :disabled="!address.barangay">
                    <v-icon class="me-2">mdi-check</v-icon>
                    {{ isLoading ? 'Saving...' : 'Save Address' }}
                  </v-btn>
                </v-col>
              </v-row>
            </v-form>
          </v-card-text>
        </v-card>

        <v-card v-else class="mt-4">
          <v-card-title>Use My Current Location</v-card-title>
          <v-card-text>
            <v-btn color="primary" @click="useCurrentLocation" :loading="isLoading">
              <v-icon class="me-2">mdi-crosshairs-gps</v-icon>
              Detect My Location
            </v-btn>

            <v-row class="mt-4">
              <v-col cols="12"><v-text-field v-model="address.street" label="Street" readonly /></v-col>
              <v-col cols="12"><v-text-field v-model="address.barangay" label="Barangay" readonly /></v-col>
              <v-col cols="12"><v-text-field v-model="address.city" label="City" readonly /></v-col>
            </v-row>

            <v-col cols="12" class="mt-4">
              <div id="map" class="map-wrapper"></div>
              <p class="text-caption mt-2">Your detected location appears here</p>
            </v-col>

            <v-btn block color="primary" class="mt-4" @click="saveAddress" :loading="isLoading" :disabled="!address.barangay">
              <v-icon class="me-2">mdi-check</v-icon>
              {{ isLoading ? 'Saving...' : 'Save Current Location' }}
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
  border: 1px solid #e0e0e0;
}
:deep(.leaflet-container) { border-radius: 12px; }
:deep(.leaflet-container:fullscreen) { width: 100vw; height: 100vh; border-radius: 0; }
</style>
