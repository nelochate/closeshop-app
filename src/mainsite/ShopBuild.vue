<script setup lang="ts">
import { ref, watch, onMounted, nextTick } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { supabase } from '@/utils/supabase'
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera'
import * as L from 'leaflet'
import 'leaflet.fullscreen'
import 'leaflet.fullscreen/Control.FullScreen.css'

// -------------------- Router --------------------
const router = useRouter()
const goBack = () => router.back()

const route = useRoute()
const shopId = ref<string | null>((route.params.id as string) || null)

// -------------------- States --------------------
const currentShopId = ref<string | null>(null)
const avatarUrl = ref<string | null>(null)
const physicalUrl = ref<string | null>(null)
const uploading = ref(false)
const pickerTarget = ref<'logo' | 'physical' | null>(null)
const showPicker = ref(false)
const saving = ref(false)
const snackbar = ref(false)
const snackbarMessage = ref('')
const snackbarColor = ref<'success' | 'error'>('success')

// -------------------- Shop Info --------------------
const shopName = ref('')
const description = ref('')
const openTime = ref('')
const closeTime = ref('')
const fullAddress = ref('')

// Address info
const address = {
  barangay: ref(''),
  building: ref(''),
  street: ref(''),
  postal: ref(''),
  house_no: ref(''),
}

// -------------------- Barangays --------------------
const barangays = [/* ... (keep your list as is) ... */]

// -------------------- Map Setup --------------------
const latitude = ref<number | null>(8.9489)
const longitude = ref<number | null>(125.5406)
const map = ref<L.Map | null>(null)
let shopMarker: L.Marker | null = null

const initMap = (lat: number, lng: number) => {
  if (map.value) return

  map.value = L.map('map', {
    center: [lat, lng],
    zoom: 15,
    fullscreenControl: true,
    fullscreenControlOptions: { position: 'topleft' },
  })

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors',
  }).addTo(map.value)

  // Marker
  shopMarker = L.marker([lat, lng], { draggable: true }).addTo(map.value)

  // When dragged
  shopMarker.on('dragend', async (e) => {
    const pos = (e.target as L.Marker).getLatLng()
    latitude.value = pos.lat
    longitude.value = pos.lng
    await saveCoordinates(pos.lat, pos.lng)
    await reverseGeocode(pos.lat, pos.lng)
  })

  // When map clicked
  map.value.on('click', async (e: L.LeafletMouseEvent) => {
    const { lat, lng } = e.latlng
    latitude.value = lat
    longitude.value = lng
    shopMarker?.setLatLng([lat, lng])
    await saveCoordinates(lat, lng)
    await reverseGeocode(lat, lng)
  })
}

const toggleFullscreen = () => map.value?.toggleFullscreen()

// -------------------- Snackbar --------------------
const showSnackbar = (message: string, color: 'success' | 'error' = 'success') => {
  snackbarMessage.value = message
  snackbarColor.value = color
  snackbar.value = true
}

// -------------------- Image Picker --------------------
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
      resultType: CameraResultType.Uri,
      source: source === 'camera' ? CameraSource.Camera : CameraSource.Photos,
    })
    if (!photo?.webPath) return
    uploading.value = true

    const response = await fetch(photo.webPath)
    const blob = await response.blob()
    const file = new File([blob], `${Date.now()}.png`, { type: blob.type })

    const bucket = pickerTarget.value === 'physical' ? 'physical_store' : 'Profile'
    const fileName = `${user.id}/${Date.now()}.png`

    const { data, error } = await supabase.storage
      .from(bucket)
      .upload(fileName, file, { cacheControl: '3600', upsert: true })
    if (error) throw error

    const newUrl = `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/${bucket}/${data.path}`

    if (pickerTarget.value === 'physical') {
      physicalUrl.value = newUrl
      if (currentShopId.value) {
        await supabase.from('shops').update({ physical_store: newUrl }).eq('id', currentShopId.value)
      }
    } else {
      avatarUrl.value = newUrl
      if (currentShopId.value) {
        await supabase.from('shops').update({ logo_url: newUrl }).eq('id', currentShopId.value)
      }
    }

    showSnackbar('Image uploaded successfully', 'success')
    showPicker.value = false
  } catch (err) {
    console.error(err)
    showSnackbar('Failed to upload image', 'error')
  } finally {
    uploading.value = false
    pickerTarget.value = null
  }
}

// -------------------- Coordinates --------------------
const saveCoordinates = async (lat: number, lng: number) => {
  try {
    if (!currentShopId.value) return
    const { error } = await supabase
      .from('shops')
      .update({ latitude: lat, longitude: lng })
      .eq('id', currentShopId.value)
    if (error) throw error
    showSnackbar('Location updated successfully!', 'success')
  } catch (err) {
    console.error(err)
    showSnackbar('Failed to update location', 'error')
  }
}

const getLocation = () => {
  if (!navigator.geolocation) {
    showSnackbar('Geolocation not supported', 'error')
    return
  }
  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      latitude.value = pos.coords.latitude
      longitude.value = pos.coords.longitude
      map.value?.setView([latitude.value, longitude.value], 17)
      shopMarker?.setLatLng([latitude.value, longitude.value])
      await saveCoordinates(latitude.value, longitude.value)
      await reverseGeocode(latitude.value, longitude.value)
    },
    (err) => {
      console.error(err)
      showSnackbar('Failed to get location', 'error')
    },
    { enableHighAccuracy: true, timeout: 10000 },
  )
}

// -------------------- Save Shop --------------------
const deliveryOptions = ref<string[]>([])
const meetUpDetails = ref('')

const saveShop = async () => {
  if (saving.value) return
  if (!latitude.value || !longitude.value) {
    showSnackbar('Please set your shop location first.', 'error')
    return
  }

  saving.value = true
  try {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()
    if (userError || !user) throw new Error('User not found')

    const shopData = {
      owner_id: user.id,
      business_name: shopName.value,
      description: description.value,
      logo_url: avatarUrl.value,
      physical_store: physicalUrl.value,
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
      delivery_options: deliveryOptions.value,
      meetup_details: meetUpDetails.value || null,
      detected_address: fullAddress.value || null,
    }

    let result
    if (!currentShopId.value) {
      const { data, error } = await supabase.from('shops').insert(shopData).select().single()
      if (error) throw error
      currentShopId.value = data.id
      result = data
      showSnackbar('Shop created successfully!', 'success')
      router.push(`/shop/${data.id}`)
    } else {
      const { data, error } = await supabase
        .from('shops')
        .update(shopData)
        .eq('id', currentShopId.value)
        .select()
        .single()
      if (error) throw error
      result = data
      showSnackbar('Shop updated successfully!', 'success')
    }

    console.log('Saved shop:', result)
  } catch (err) {
    console.error(err)
    showSnackbar('Failed to save shop', 'error')
  } finally {
    saving.value = false
  }
}

// -------------------- Reverse Geocode --------------------
const reverseGeocode = async (lat: number, lng: number) => {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&addressdetails=1`
    )
    const data = await res.json()
    if (data && data.address) {
      address.street.value = data.address.road || ''
      address.house_no.value = data.address.house_number || ''
      address.postal.value = data.address.postcode || ''
      address.building.value = data.address.building || ''
      address.barangay.value =
        data.address.suburb || data.address.village || data.address.neighbourhood || ''
      fullAddress.value = data.display_name || ''
      showSnackbar(`Detected address: ${fullAddress.value}`, 'success')
    }
  } catch (err) {
    console.error(err)
    showSnackbar('Failed to fetch address', 'error')
  }
}

// -------------------- Load Shop --------------------
onMounted(async () => {
  await nextTick()

  if (shopId.value) {
    const { data, error } = await supabase.from('shops').select('*').eq('id', shopId.value).single()
    if (error || !data) return

    currentShopId.value = data.id
    avatarUrl.value = data.logo_url
    physicalUrl.value = data.physical_store
    shopName.value = data.business_name
    description.value = data.description
    openTime.value = data.open_time
    closeTime.value = data.close_time
    address.barangay.value = data.barangay
    address.building.value = data.building
    address.street.value = data.street
    address.postal.value = data.postal
    address.house_no.value = data.house_no
    latitude.value = data.latitude || 8.9489
    longitude.value = data.longitude || 125.5406
    fullAddress.value = data.detected_address || ''

    initMap(latitude.value, longitude.value)
    map.value?.setView([latitude.value, longitude.value], 17)
    shopMarker?.setLatLng([latitude.value, longitude.value])
  } else {
    initMap(latitude.value!, longitude.value!)
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition((pos) => {
        latitude.value = pos.coords.latitude
        longitude.value = pos.coords.longitude
        map.value?.setView([latitude.value, longitude.value], 17)
        shopMarker?.setLatLng([latitude.value, longitude.value])
      })
    }
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

      <!-- Logo -->
      <div class="avatar-container">
        <v-avatar size="80" color="grey-lighten-3">
          <v-img v-if="avatarUrl" :src="avatarUrl" cover />
          <v-icon v-else size="60">mdi-store</v-icon>
        </v-avatar>
        <v-btn
          icon
          color="primary"
          :loading="uploading"
          @click="
            () => {
              pickerTarget = 'logo'
              showPicker = true
            }
          "
          class="edit-btn"
        >
          <v-icon>mdi-camera</v-icon>
        </v-btn>
      </div>

      <!-- Physical Store -->
      <div class="avatar-container">
        <v-avatar size="80" color="grey-lighten-3">
          <v-img v-if="physicalUrl" :src="physicalUrl" cover />
          <v-icon v-else size="60">mdi-image</v-icon>
        </v-avatar>
        <v-btn
          icon
          color="primary"
          :loading="uploading"
          @click="
            () => {
              pickerTarget = 'physical'
              showPicker = true
            }
          "
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

      <h2>Delivery Options</h2>
      <v-checkbox v-model="deliveryOptions" label="Call a Courier" value="courier" />
      <v-checkbox v-model="deliveryOptions" label="Pickup" value="pickup" />
      <v-checkbox v-model="deliveryOptions" label="Meet-up" value="meetup" />
      <v-text-field
        v-if="deliveryOptions.includes('meetup')"
        v-model="meetUpDetails"
        label="Meet-up details"
        outlined
      />

      <h2>Address (Butuan City)</h2>
      <v-text-field label="City" value="Butuan City" readonly outlined />
      <v-text-field label="Province" value="Agusan del Norte" readonly outlined />
      <v-text-field label="Region" value="CARAGA" readonly outlined />
      <v-select v-model="address.barangay.value" :items="barangays" label="Barangay" outlined />
      <v-text-field v-model="address.building.value" label="Building No." outlined />
      <v-text-field v-model="address.street.value" label="Street Name" outlined />
      <v-text-field v-model="address.house_no.value" label="House No." outlined />
      <v-text-field v-model="address.postal.value" label="Postal / ZIP Code" outlined />

      <v-divider>or</v-divider>
<h4>Please drag/tap your location in the map to ensure accurate display</h4>
      <v-btn color="secondary" @click="toggleFullscreen" class="mb-2">Toggle Map Fullscreen</v-btn>
      <v-text-field
        v-model="searchQuery"
        label="Search place"
        outlined
        append-inner-icon="mdi-magnify"
        @keyup.enter="searchPlace"
      />
      <v-btn color="primary" @click="searchPlace">Search</v-btn>
      <div id="map" class="map">
        <v-btn icon @click="getLocation" class="locate-btn">
          <v-icon>mdi-crosshairs-gps</v-icon>
        </v-btn>

        <v-btn color="secondary" @click="() => saveCoordinates(latitude.value!, longitude.value!)">
          Save this location
        </v-btn>
      </div>
      <v-btn color="primary" @click="getLocation">Set my location as shop address</v-btn>

      <!-- New field to display full address -->
      <v-text-field
        v-if="fullAddress"
        v-model="fullAddress"
        label="Detected Address"
        outlined
        readonly
      />
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
  position: relative;
}
.locate-btn {
  position: absolute;
  top: 10px;
  right: 10px;
  background: white;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
  z-index: 1000;
}
</style>
