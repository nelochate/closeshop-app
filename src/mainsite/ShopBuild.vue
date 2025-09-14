<script setup lang="ts">
import { ref, watch, onMounted, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/utils/supabase'
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera'
import * as L from 'leaflet'
import 'leaflet.fullscreen'
import 'leaflet.fullscreen/Control.FullScreen.css'

// -------------------- Router --------------------
const router = useRouter()
const goBack = () => router.back()

// -------------------- States --------------------
const avatarUrl = ref<string | null>(null)
const uploading = ref(false)
const showPicker = ref(false)
const saving = ref(false)
const snackbar = ref(false)
const snackbarMessage = ref('')
const snackbarColor = ref('success')

// Shop info
const shopName = ref('')
const description = ref('')
const openTime = ref('')
const closeTime = ref('')

// Address info (Butuan City fixed)
const address = {
  barangay: ref(''),
  building: ref(''),
  street: ref(''),
  postal: ref(''),
  house_no: ref(''),
}

// Butuan City barangays
// Butuan City barangays
const barangays = [
  'Agusan Pequeño',
  'Ambago',
  'Amparo',
  'Ampayon',
  'Anticala',
  'Antongalon',
  'Aupagan',
  'Baan KM 3',
  'Baan Riverside Poblacion (Barangay 20)',
  'Babag',
  'Bading Poblacion (Barangay 22)',
  'Bancasi',
  'Banza',
  'Baobaoan',
  'Basag',
  'Bayanihan Poblacion (Barangay 27)',
  'Bilay',
  'Bitan-agan',
  'Bit-os',
  'Bobon',
  'Bonbon',
  'Bugabus',
  'Bugsukan',
  'Buhangin Poblacion (Barangay 19)',
  'Cabcabon',
  'Camayahan',
  'Dagohoy Poblacion (Barangay 7)',
  'Dankias',
  'De Oro',
  'Diego Silang Poblacion (Barangay 6)',
  'Don Francisco',
  'Doongan',
  'Dulag',
  'Dumalagan',
  'Florida',
  'Golden Ribbon Poblacion (Barangay 2)',
  'Holy Redeemer Poblacion (Barangay 23)',
  'Humabon Poblacion (Barangay 11)',
  'Imadejas Poblacion (Barangay 24)',
  'Jose Rizal Poblacion (Barangay 25)',
  'Kinamlutan',
  'Lapu-Lapu Poblacion (Barangay 8)',
  'Lemon',
  'Leon Kilat Poblacion (Barangay 13)',
  'Libertad',
  'Limaha Poblacion (Barangay 14)',
  'Los Angeles',
  'Lumbocan',
  'Maguinda',
  'Mahay',
  'Mahogany Poblacion (Barangay 21)',
  'Maibu',
  'Mandamo',
  'Manila de Bugabus',
  'Maon Poblacion (Barangay 1)',
  'Masao',
  'Maug',
  'New Society Village Poblacion (Barangay 26)',
  'Nong-Nong',
  'Obrero Poblacion (Barangay 18)',
  'Ong Yiu Poblacion (Barangay 16)',
  'Pagatpatan',
  'Pangabugan',
  'Pianing',
  'Pigdaulan',
  'Pinamanculan',
  'Port Poyohon Poblacion (Barangay 17, New Asia)',
  'Rajah Soliman Poblacion (Barangay 4)',
  'Salvacion',
  'San Ignacio Poblacion (Barangay 15)',
  'San Mateo',
  'Santo Niño',
  'San Vicente',
  'Sikatuna Poblacion (Barangay 10)',
  'Silongan Poblacion (Barangay 5)',
  'Sumile',
  'Sumilihon',
  'Tagabaca',
  'Taguibo',
  'Taligaman',
  'Tandang Sora Poblacion (Barangay 12)',
  'Tiniwisan',
  'Tungao',
  'Urduja Poblacion (Barangay 9)',
  'Villa Kananga',
]

// Location coordinates
const latitude = ref<number | null>(8.9489) // default Butuan City center
const longitude = ref<number | null>(125.5406)

// -------------------- Map --------------------
const map = ref<L.Map | null>(null)
let shopMarker: L.Marker | null = null

const initMap = () => {
  if (map.value) return

  map.value = L.map('map', {
    center: [latitude.value, longitude.value],
    zoom: 15,
    fullscreenControl: true,
    fullscreenControlOptions: { position: 'topleft' },
  })

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors',
  }).addTo(map.value)

  // Add draggable marker
  shopMarker = L.marker([latitude.value, longitude.value], { draggable: true }).addTo(map.value)
  shopMarker.on('dragend', (e) => {
    const pos = (e.target as L.Marker).getLatLng()
    latitude.value = pos.lat
    longitude.value = pos.lng
  })
}

const toggleFullscreen = () => map.value?.toggleFullscreen()

// -------------------- Helpers --------------------
const fullAddress = () =>
  [
    address.house_no.value,
    address.building.value,
    address.street.value,
    address.barangay.value,
    'Butuan City',
    'Agusan del Norte',
    'CARAGA',
    address.postal.value,
  ]
    .filter(Boolean)
    .join(', ')

// -------------------- Snackbar --------------------
const showSnackbar = (message: string, color: string = 'success') => {
  snackbarMessage.value = message
  snackbarColor.value = color
  snackbar.value = true
}

// -------------------- Image Picker --------------------
const dataURItoBlob = (dataURI: string) => {
  const byteString = atob(dataURI.split(',')[1])
  const mimeString = dataURI.split(',')[0].split(':')[1].split(';')[0]
  const ab = new ArrayBuffer(byteString.length)
  const ia = new Uint8Array(ab)
  for (let i = 0; i < byteString.length; i++) ia[i] = byteString.charCodeAt(i)
  return new Blob([ab], { type: mimeString })
}

const pickImage = async (source: 'camera' | 'gallery') => {
  try {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()
    if (userError || !user) throw new Error('User not found')

    const photo = await Camera.getPhoto({
      quality: 90,
      allowEditing: false,
      resultType: CameraResultType.DataUrl,
      source: source === 'camera' ? CameraSource.Camera : CameraSource.Photos,
    })

    if (!photo?.dataUrl) return
    uploading.value = true

    if (avatarUrl.value) {
      const oldPath = avatarUrl.value.split('/storage/v1/object/public/Profile/')[1]
      if (oldPath) await supabase.storage.from('Profile').remove([oldPath])
    }

    const fileName = `${user.id}/${Date.now()}.png`
    const { data, error } = await supabase.storage
      .from('Profile')
      .upload(fileName, dataURItoBlob(photo.dataUrl), { cacheControl: '3600', upsert: true })
    if (error) throw error

    avatarUrl.value = `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/Profile/${data?.path}`
    showSnackbar('Image uploaded successfully', 'success')
    showPicker.value = false
  } catch (err) {
    console.error(err)
    showSnackbar('Failed to upload image', 'error')
  } finally {
    uploading.value = false
  }
}

// -------------------- Save Shop --------------------
const saveShop = async () => {
  if (saving.value) return
  saving.value = true
  try {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()
    if (userError || !user) throw new Error('User not found')

    const shopData = {
      user_id: user.id,
      business_name: shopName.value,
      description: description.value,
      logo_url: avatarUrl.value,
      latitude: latitude.value,
      longitude: longitude.value,
      open_time: openTime.value,
      close_time: closeTime.value,
      barangay: address.barangay.value,
      building: address.building.value,
      street: address.street.value,
      postal: address.postal.value,
      house_no: address.house_no.value,
      city: 'Butuan City',
      province: 'Agusan del Norte',
      region: 'CARAGA',
    }

    const { error } = await supabase.from('shops').upsert(shopData, { onConflict: 'user_id' })
    if (error) throw error

    showSnackbar('Shop saved successfully!', 'success')
  } catch (err) {
    console.error(err)
    showSnackbar('Failed to save shop', 'error')
  } finally {
    saving.value = false
  }
}

// -------------------- Load Shop Data --------------------
onMounted(async () => {
  try {
    await nextTick()
    initMap()

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()
    if (userError || !user) return

    const { data, error } = await supabase.from('shops').select('*').eq('user_id', user.id).single()
    if (error || !data) return

    avatarUrl.value = data.logo_url || null
    shopName.value = data.business_name || ''
    description.value = data.description || ''
    openTime.value = data.open_time || ''
    closeTime.value = data.close_time || ''

    address.barangay.value = data.barangay || ''
    address.building.value = data.building || ''
    address.street.value = data.street || ''
    address.postal.value = data.postal || ''
    address.house_no.value = data.house_no || ''

    latitude.value = data.latitude || 8.9489
    longitude.value = data.longitude || 125.5406

    // Update marker position
    if (shopMarker) shopMarker.setLatLng([latitude.value, longitude.value])
  } catch (err) {
    console.error(err)
  }
})
</script>

<template>
  <v-app>
    <v-app-bar flat color="transparent">
      <v-btn variant="text" @click="goBack"> <v-icon start>mdi-arrow-left</v-icon> Back </v-btn>
    </v-app-bar>

    <v-main>
      <h2>Business Information</h2>

      <div class="avatar-container">
        <v-avatar size="80" color="grey-lighten-3">
          <v-img v-if="avatarUrl" :src="avatarUrl" cover />
          <v-icon v-else size="60">mdi-store</v-icon>
        </v-avatar>
        <v-btn
          icon
          color="primary"
          :loading="uploading"
          @click="showPicker = true"
          class="edit-btn"
        >
          <v-icon>mdi-camera</v-icon>
        </v-btn>
      </div>

      <v-text-field v-model="shopName" label="Business Name" outlined />
      <v-textarea v-model="description" label="About Us" outlined auto-grow />

      <h2>Operating Hours</h2>
      <v-row>
        <v-col cols="6">
          <v-text-field v-model="openTime" type="time" label="Opening Time" outlined />
        </v-col>
        <v-col cols="6">
          <v-text-field v-model="closeTime" type="time" label="Closing Time" outlined />
        </v-col>
      </v-row>
      <h2>Address (Butuan City)</h2>
        <!-- Fixed fields -->
      <v-text-field label="City" value="Butuan City" readonly outlined />
      <v-text-field label="Province" value="Agusan del Norte" readonly outlined />
      <v-text-field label="Region" value="CARAGA" readonly outlined />
      <!-- Editable fields -->

      <v-select v-model="address.barangay.value" :items="barangays" label="Barangay" outlined />
      <v-text-field v-model="address.building.value" label="Building No." outlined />
      <v-text-field v-model="address.street.value" label="Street Name" outlined />
      <v-text-field v-model="address.house_no.value" label="House No." outlined />
      <v-text-field v-model="address.postal.value" label="Postal / ZIP Code" outlined />

    
      <v-btn color="secondary" @click="toggleFullscreen" class="mb-2">Toggle Map Fullscreen</v-btn>
      <div id="map" class="map"></div>

      <v-btn color="primary" :loading="saving" @click="saveShop">
        {{ saving ? 'Saving...' : 'Save Shop' }}
      </v-btn>

      <v-snackbar v-model="snackbar" :color="snackbarColor" timeout="3000">
        {{ snackbarMessage }}
      </v-snackbar>

      <v-dialog v-model="showPicker" max-width="290">
        <v-card>
          <v-card-title class="headline">Pick Image Source</v-card-title>
          <v-card-actions>
            <v-btn color="primary" @click="pickImage('camera')">Use Camera</v-btn>
            <v-btn color="primary" @click="pickImage('gallery')">Use Gallery</v-btn>
          </v-card-actions>
        </v-card>
      </v-dialog>
    </v-main>
  </v-app>
</template>

<style scoped>
.avatar-container {
  display: flex;
  justify-content: center;
  align-items: center;
  position: relative;
  margin: 16px 0;
}
.edit-btn {
  position: absolute;
  bottom: -10px;
  right: -10px;
  border-radius: 50%;
}
.map {
  height: 400px;
  width: 100%;
  border-radius: 12px;
  margin-bottom: 16px;
}
</style>
