<script setup lang="ts">
import { ref, reactive, watch } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/utils/supabase'
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera'
import { useGeolocation } from '@/composables/useGeolocation'

const router = useRouter()
const goBack = () => router.back()

// states
const avatarUrl = ref<string | null>(null)
const uploading = ref(false)
const showPicker = ref(false)

const { coords } = useGeolocation()
const latitude = ref<number | null>(null)
const longitude = ref<number | null>(null)

// snackbar
const snackbar = ref(false)
const snackbarMessage = ref('')
const snackbarColor = ref('success')
const saving = ref(false)

// shop info
const shopName = ref('')
const description = ref('')
const openTime = ref('')
const closeTime = ref('')

// address (still using refs)
const address = {
  building: ref(''),
  street: ref(''),
  purok: ref(''),
  subdivision: ref(''),
  barangay: ref(''),
  city: ref(''),
  province: ref(''),
  region: ref(''),
  postal: ref(''),
}

// build full address string
const fullAddress = () =>
  [
    address.street.value,
    address.purok.value,
    address.subdivision.value,
    address.barangay.value,
    address.city.value,
    address.province.value,
    address.postal.value,
  ]
    .filter(Boolean)
    .join(', ')

// geocode mock
const geocodeAddress = async (addr: string) => {
  console.log('Geocoding address:', addr)
  return { lat: 8.9489, lng: 125.5406 } // sample coords
}

const updateMapPosition = (coords: { lat: number; lng: number }) => {
  latitude.value = coords.lat
  longitude.value = coords.lng
}

watch(
  () => [
    address.street.value,
    address.purok.value,
    address.subdivision.value,
    address.barangay.value,
    address.city.value,
    address.province.value,
    address.postal.value,
  ],
  async () => {
    const addr = fullAddress()
    if (!addr) return
    const coords = await geocodeAddress(addr)
    if (coords) updateMapPosition(coords)
  },
)

function dataURItoBlob(dataURI: string) {
  const byteString = atob(dataURI.split(',')[1])
  const mimeString = dataURI.split(',')[0].split(':')[1].split(';')[0]
  const ab = new ArrayBuffer(byteString.length)
  const ia = new Uint8Array(ab)
  for (let i = 0; i < byteString.length; i++) ia[i] = byteString.charCodeAt(i)
  return new Blob([ab], { type: mimeString })
}

function showSnackbar(message: string, color: string) {
  snackbarMessage.value = message
  snackbarColor.value = color
  snackbar.value = true
}

// 📸 NEW: pick image from camera or gallery
const pickImage = async (source: 'camera' | 'gallery') => {
  try {
    // Get logged-in user
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) throw new Error('User not found')

    // Pick photo from camera or gallery
    const photo = await Camera.getPhoto({
      quality: 90,
      allowEditing: false,
      resultType: CameraResultType.DataUrl,
      source: source === 'camera' ? CameraSource.Camera : CameraSource.Photos,
    })

    if (photo?.dataUrl) {
      uploading.value = true

      // Use user's id as folder
      const fileName = `${user.id}/${Date.now()}.png`

      const { data, error } = await supabase.storage
        .from('Profile')
        .upload(fileName, dataURItoBlob(photo.dataUrl), {
          cacheControl: '3600',
          upsert: true, // overwrite if same name
        })

      if (error) throw error

      // Generate public URL
      avatarUrl.value = `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/Profile/${data?.path}`

      showSnackbar('Image uploaded successfully', 'success')
      showPicker.value = false
    }
  } catch (err) {
    console.error(err)
    showSnackbar('Failed to upload image', 'error')
  } finally {
    uploading.value = false
  }
}

// 💾 Save shop data to DB
const saveShop = async () => {
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
      logo_url: avatarUrl.value, // ✅ now included
      latitude: latitude.value,
      longitude: longitude.value,
      open_time: openTime.value,
      close_time: closeTime.value,
    }

    const { error } = await supabase.from('shops').upsert(shopData, {
      onConflict: 'user_id',
    })
    if (error) throw error

    showSnackbar('Shop saved successfully!', 'success')
  } catch (err) {
    console.error(err)
    showSnackbar('Failed to save shop', 'error')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <v-app>
    <!-- Top Bar -->
    <v-app-bar flat elevation="0" color="transparent">
      <v-btn variant="text" @click="goBack">
        <v-icon start>mdi-arrow-left</v-icon>
        Back
      </v-btn>
    </v-app-bar>

    <v-divider />

    <v-main>
      <!-- Business Info -->
      <h2 class="section-title">Business Information</h2>
      <div class="avatar-container">
        <v-avatar size="80" color="grey-lighten-3">
          <v-img v-if="avatarUrl" :src="avatarUrl" cover />
          <v-icon v-else size="60">mdi-store</v-icon>
        </v-avatar>

        <v-btn
          class="edit-btn"
          color="primary"
          icon
          elevation="4"
          :loading="uploading"
          @click="showPicker = true"
        >
          <v-icon>mdi-camera</v-icon>
        </v-btn>
      </div>

      <v-text-field
        v-model="shopName"
        label="Business Name"
        placeholder="Enter your business name"
        :rules="[
          (v) => !!v || 'Business name is required',
          (v) => (v && v.length >= 3) || 'At least 3 characters',
        ]"
        clearable
        outlined
        color="primary"
        prepend-inner-icon="mdi-store"
        hint="This is your business's official name"
        persistent-hint
      />

      <v-textarea
        v-model="description"
        label="About Us"
        placeholder="Write something about your business"
        outlined
        auto-grow
      />

      <!-- Operating Hours -->
      <h2 class="section-title">Operating Hours</h2>
      <v-row>
        <v-col cols="6">
          <v-text-field v-model="openTime" label="Opening Time" type="time" outlined />
        </v-col>
        <v-col cols="6">
          <v-text-field v-model="closeTime" label="Closing Time" type="time" outlined />
        </v-col>
      </v-row>

      <!-- Address Section -->
      <h2 class="section-title">Address</h2>
      <v-text-field v-model="address.street.value" label="Street Name" outlined />
      <v-text-field v-model="address.purok.value" label="Purok / Block / Lot No." outlined />
      <v-text-field
        v-model="address.subdivision.value"
        label="Subdivision / Village / Compound"
        outlined
      />
      <v-text-field v-model="address.barangay.value" label="Barangay" outlined />
      <v-text-field v-model="address.city.value" label="City / Municipality" outlined />
      <v-text-field v-model="address.province.value" label="Province" outlined />
      <v-text-field v-model="address.postal.value" label="Postal / ZIP Code" outlined />

      <!-- Map -->
      <div id="map" class="map"></div>

      <!-- Action Buttons -->
      <div class="btns">
        <v-btn color="error" class="shop-btn">Delete Shop</v-btn>
        <v-btn color="secondary" class="shop-btn" @click="goBack">Back</v-btn>
        <v-btn
          color="primary"
          class="shop-btn"
          :loading="saving"
          :disabled="saving"
          @click="saveShop"
        >
          Save
        </v-btn>
      </div>

      <!-- Snackbar Alert -->
      <v-snackbar v-model="snackbar" timeout="3000" color="primary" rounded="pill">
        {{ snackbarMessage }}
      </v-snackbar>

      <!-- Image Picker Dialog -->
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
.section-title {
  margin-top: 20px;
  margin-bottom: 10px;
  font-weight: 600;
}

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
  margin-top: 16px;
  height: 300px;
  border-radius: 12px;
}

.btns {
  display: flex;
  justify-content: space-between;
  margin: 20px 0;
}
</style>
