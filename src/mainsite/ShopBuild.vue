<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/utils/supabase'
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera'
import { useGeolocation } from '@/composables/useGeolocation'
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

// Address info
const address = {
  region: ref(''),
  province: ref(''),
  city: ref(''),
  building: ref(''),
  barangay: ref(''),
  postal: ref(''),
  street: ref(''),
  house_no: ref(''),
}

// Geolocation
const { coords } = useGeolocation()
const latitude = ref<number | null>(null)
const longitude = ref<number | null>(null)

// -------------------- Map --------------------
const map = ref<L.Map | null>(null)
let shopMarker: L.Marker | null = null

const initMap = () => {
  if (map.value) return

  map.value = L.map('map', {
    center: [latitude.value || 8.9489, longitude.value || 125.5406],
    zoom: 15,
    fullscreenControl: true,
    fullscreenControlOptions: { position: 'topleft' },
  })

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors',
  }).addTo(map.value)

  // Add marker if coordinates exist
  if (latitude.value && longitude.value) {
    shopMarker = L.marker([latitude.value, longitude.value]).addTo(map.value)
  }
}

watch([latitude, longitude], () => {
  if (!map.value || !latitude.value || !longitude.value) return
  map.value.setView([latitude.value, longitude.value], 15)
  if (shopMarker) {
    shopMarker.setLatLng([latitude.value, longitude.value])
  } else {
    shopMarker = L.marker([latitude.value, longitude.value]).addTo(map.value)
  }
})

const toggleFullscreen = () => {
  map.value?.toggleFullscreen()
}

// -------------------- Helpers --------------------
const fullAddress = () =>
  [
    address.street.value,
    address.building.value,
    address.barangay.value,
    address.city.value,
    address.province.value,
    address.region.value,
    address.postal.value,
    address.house_no.value,
  ]
    .filter(Boolean)
    .join(', ')

const geocodeAddress = async (addr: string) => {
  console.log('Geocoding address:', addr)
  return { lat: 8.9489, lng: 125.5406 } // sample coords
}

watch(
  () => [
    address.street.value,
    address.building.value,
    address.barangay.value,
    address.city.value,
    address.province.value,
    address.region.value,
    address.postal.value,
    address.house_no.value,
  ],
  async () => {
    const addr = fullAddress()
    if (!addr) return
    const coords = await geocodeAddress(addr)
    if (coords) {
      latitude.value = coords.lat
      longitude.value = coords.lng
    }
  },
)

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
      region: address.region.value,
      province: address.province.value,
      city: address.city.value,
      building: address.building.value,
      barangay: address.barangay.value,
      postal: address.postal.value,
      street: address.street.value,
      house_no: address.house_no.value,
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

// -------------------- Load Shop Data and Init Map --------------------
onMounted(async () => {
  try {
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

    if (data.address) {
      address.region.value = data.address.region || ''
      address.province.value = data.address.province || ''
      address.city.value = data.address.city || ''
      address.building.value = data.address.building || ''
      address.barangay.value = data.address.barangay || ''
      address.postal.value = data.address.postal || ''
      address.street.value = data.address.street || ''
      address.house_no.value = data.address.house_no || ''
    }

    // Set initial coords
    latitude.value = data.latitude || 8.9489
    longitude.value = data.longitude || 125.5406

    // Initialize the map after coords
    initMap()
  } catch (err) {
    console.error(err)
    initMap() // fallback
  }
})
</script>

<template>
  <v-app>
    <v-app-bar flat elevation="0" color="transparent">
      <v-btn variant="text" @click="goBack">
        <v-icon start>mdi-arrow-left</v-icon> Back
      </v-btn>
    </v-app-bar>

    <v-divider />

    <v-main>
      <h2 class="section-title">Business Information</h2>
      <div class="avatar-container">
        <v-avatar size="80" color="grey-lighten-3">
          <v-img v-if="avatarUrl" :src="avatarUrl" cover />
          <v-icon v-else size="60">mdi-store</v-icon>
        </v-avatar>
        <v-btn class="edit-btn" color="primary" icon elevation="4" :loading="uploading" @click="showPicker = true">
          <v-icon>mdi-camera</v-icon>
        </v-btn>
      </div>

      <v-text-field v-model="shopName" label="Business Name" outlined clearable />
      <v-textarea v-model="description" label="About Us" outlined auto-grow />

      <h2 class="section-title">Operating Hours</h2>
      <v-row>
        <v-col cols="6"><v-text-field v-model="openTime" label="Opening Time" type="time" outlined /></v-col>
        <v-col cols="6"><v-text-field v-model="closeTime" label="Closing Time" type="time" outlined /></v-col>
      </v-row>

      <h2 class="section-title">Address</h2>
      <v-text-field v-model="address.region.value" label="Region" outlined />
      <v-text-field v-model="address.province.value" label="Province" outlined />
      <v-text-field v-model="address.city.value" label="City / Municipality" outlined />
      <v-text-field v-model="address.building.value" label="Building No." outlined />
      <v-text-field v-model="address.barangay.value" label="Barangay" outlined />
      <v-text-field v-model="address.postal.value" label="Postal / ZIP Code" outlined />
      <v-text-field v-model="address.street.value" label="Street Name" outlined />
      <v-text-field v-model="address.house_no.value" label="House No." outlined />

      <v-btn color="secondary" @click="toggleFullscreen" class="mb-2">Toggle Fullscreen</v-btn>
      <div id="map" class="map"></div>

      <div class="btns">
        <v-btn color="primary" class="shop-btn" :loading="saving" :disabled="saving" @click="saveShop">
          {{ saving ? 'Saving...' : 'Save' }}
        </v-btn>
      </div>

      <v-snackbar v-model="snackbar" timeout="3000" color="primary" rounded="pill">
        {{ snackbarMessage }}
      </v-snackbar>

      <v-dialog v-model="showPicker" max-width="290">
        <v-card>
          <v-card-title class="headline">Pick Image Source</v-card-title>
          <v-card-actions>
            <v-btn @click="pickImage('camera')" color="primary">Use Camera</v-btn>
            <v-btn @click="pickImage('gallery')" color="primary">Use Gallery</v-btn>
          </v-card-actions>
        </v-card>
      </v-dialog>
    </v-main>
  </v-app>
</template>

<style scoped>
.section-title { margin-top: 20px; margin-bottom: 10px; font-weight: 600; }
.avatar-container { display: flex; justify-content: center; align-items: center; position: relative; margin: 16px 0; }
.edit-btn { position: absolute; bottom: -10px; right: -10px; border-radius: 50%; }
.map { height: 400px; width: 100%; border-radius: 12px; margin-bottom: 16px; }
.btns { display: flex; justify-content: space-between; margin: 20px 0; }
</style>
