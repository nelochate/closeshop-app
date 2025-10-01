<script setup>
import { ref, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/utils/supabase'
import { useAuthUserStore } from '@/stores/authUser'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

const router = useRouter()
const authStore = useAuthUserStore()

const isLoading = ref(false)
const showSuccess = ref(false)
const successMessage = ref('')

const map = ref(null)
const marker = ref(null)

const address = ref({
  region: '',
  province: '',
  city: 'Butuan City', // default since this is Butuan
  barangay: '',
  building: '',
  street: '',
  house_no: '',
  postal: '',
  purok: '',
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

// Load address from profile
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
    updateMap()
  }
}

// Save address to supabase
const saveAddress = async () => {
  try {
    isLoading.value = true
    const { data: userData } = await supabase.auth.getUser()
    if (!userData?.user) throw new Error('User not found')

    await supabase.from('profiles').update({
      ...address.value,
      updated_at: new Date().toISOString(),
    }).eq('id', userData.user.id)

    await authStore.hydrateFromSession()
    successMessage.value = 'Address updated successfully!'
    showSuccess.value = true
    setTimeout(() => router.replace({ name: 'profileview', query: { refreshed: Date.now() } }), 2000)
  } catch (e) {
    successMessage.value = 'Failed to update address: ' + e.message
    showSuccess.value = true
  } finally {
    isLoading.value = false
  }
}

// Update map preview using Nominatim API
const updateMap = async () => {
  const query = `${address.value.house_no} ${address.value.street} ${address.value.barangay}, ${address.value.city}, Philippines`
  if (!address.value.barangay && !address.value.street) return

  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}`)
    const results = await res.json()
    if (results.length > 0) {
      const { lat, lon } = results[0]
      const latNum = parseFloat(lat)
      const lonNum = parseFloat(lon)

      map.value.setView([latNum, lonNum], 15)
      if (marker.value) {
        marker.value.setLatLng([latNum, lonNum])
      } else {
        marker.value = L.marker([latNum, lonNum]).addTo(map.value)
      }
    }
  } catch (error) {
    console.error('Error updating map:', error)
  }
}

onMounted(() => {
  // Init Leaflet map
  map.value = L.map('map').setView([8.9492, 125.5436], 13) // Default to Butuan
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors'
  }).addTo(map.value)

  loadAddress()
})

// Watch changes to address fields and update map
watch(
  () => [address.value.street, address.value.barangay, address.value.house_no],
  () => updateMap()
)
</script>

<template>
  <v-app>
    <v-app-bar flat density="comfortable" color="#3f83c7">
      <v-btn icon @click="router.back()"><v-icon>mdi-arrow-left</v-icon></v-btn>
      <v-toolbar-title>Edit Address</v-toolbar-title>
    </v-app-bar>

    <v-main>
      <v-snackbar v-model="showSuccess" :timeout="3000" color="success" location="top">
        {{ successMessage }}
        <template v-slot:actions>
          <v-btn color="white" variant="text" @click="showSuccess = false">Close</v-btn>
        </template>
      </v-snackbar>

      <v-container>
        <v-card>
          <v-card-title>Address Information</v-card-title>
          <v-card-text>
            <v-form @submit.prevent="saveAddress">
              <v-row>
                <v-col cols="12">
                  <v-text-field v-model="address.purok" label="Purok" variant="outlined" />
                </v-col>
                <v-col cols="12">
                  <v-select v-model="address.barangay" :items="barangays" label="Barangay" variant="outlined" />
                </v-col>
                <v-col cols="12">
                  <v-text-field v-model="address.building" label="Building No." variant="outlined" />
                </v-col>
                <v-col cols="12">
                  <v-text-field v-model="address.street" label="Street" variant="outlined" />
                </v-col>
                <v-col cols="12">
                  <v-text-field v-model="address.house_no" label="House No." variant="outlined" />
                </v-col>
                <v-col cols="12">
                  <v-text-field v-model="address.postal" label="Postal Code" variant="outlined" />
                </v-col>

                <!-- Leaflet Map Preview -->
                <v-col cols="12">
                  <div id="map"></div>
                </v-col>

                <v-col cols="12" class="text-right">
                  <v-btn type="submit" color="primary" size="large">
                    <v-icon class="me-2">mdi-check</v-icon>
                    {{ isLoading ? 'Saved' : 'Save Address' }}
                  </v-btn>
                </v-col>
              </v-row>
            </v-form>
          </v-card-text>
        </v-card>
      </v-container>
    </v-main>
  </v-app>
</template>

<style scoped>
#map {
  width: 100%;
  height: 300px;
  border-radius: 12px;
  margin-top: 10px;
}
</style>
