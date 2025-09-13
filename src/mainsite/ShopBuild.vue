<script setup lang="ts">
import { ref, watch } from 'vue'
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

// address
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
    address.building.value,
    address.street.value,
    address.purok.value,
    address.subdivision.value,
    address.barangay.value,
    address.city.value,
    address.province.value,
    address.region.value,
    address.postal.value,
  ].filter(Boolean).join(', ')

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
    address.building.value,
    address.street.value,
    address.purok.value,
    address.subdivision.value,
    address.barangay.value,
    address.city.value,
    address.province.value,
    address.region.value,
    address.postal.value,
  ],
  async () => {
    const addr = fullAddress()
    if (!addr) return
    const coords = await geocodeAddress(addr)
    if (coords) updateMapPosition(coords)
  }
)

// image upload
const uploadAvatar = async () => {
  try {
    const photo = await Camera.getPhoto({
      quality: 90,
      allowEditing: false,
      resultType: CameraResultType.DataUrl,
      source: CameraSource.Prompt,
    })

    if (photo?.dataUrl) {
      uploading.value = true
      const { data, error } = await supabase.storage
        .from('avatars')
        .upload(`public/${Date.now()}.png`, dataURItoBlob(photo.dataUrl))

      if (error) throw error
      avatarUrl.value = `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/avatars/${data?.path}`
    }
  } catch (error) {
    console.error(error)
    showSnackbar('Failed to upload image', 'error')
  } finally {
    uploading.value = false
  }
}

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

// save shop
const saveShop = async () => {
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

      // address parts
      building: address.building.value,
      street: address.street.value,
      purok: address.purok.value,
      subdivision: address.subdivision.value,
      barangay: address.barangay.value,
      city: address.city.value,
      province: address.province.value,
      region: address.region.value,
      postal: address.postal.value,

      // combined
      full_address: fullAddress(),

      // location
      latitude: latitude.value,
      longitude: longitude.value,

      // hours
      open_time: openTime.value,
      close_time: closeTime.value,
    }

    const { error } = await supabase.from('shops').insert(shopData)
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
    <!-- Top App Bar -->
    <v-app-bar flat density="comfortable" color="#5ca3eb">
      <v-btn icon @click="goBack">
        <v-icon>mdi-arrow-left</v-icon>
      </v-btn>
      <v-toolbar-title class="text-h6"><strong>Business Profile</strong></v-toolbar-title>
    </v-app-bar>

    <v-main class="pa-4">
      <v-container max-width="700px">

        <!-- Business Info -->
         <br>
        <h2 class="section-title">Business Information</h2>
        <div class="avatar-container">
          <v-avatar size="100" color="grey-lighten-4" class="elevation-2">
            <v-img v-if="avatarUrl" :src="avatarUrl" cover />
            <v-icon v-else size="70" color="grey-darken-2">mdi-store</v-icon>
          </v-avatar>
          <v-btn class="edit-btn" color="primary" icon elevation="2" :loading="uploading" @click="showPicker = true">
            <v-icon>mdi-camera</v-icon>
          </v-btn>
        </div>

        <v-text-field v-model="shopName" placeholder="Business Name" variant="outlined" density="comfortable"
          class="form-input" prepend-inner-icon="mdi-store" :rules="[
            v => !!v || 'Required',
            v => (v && v.length >= 3) || 'At least 3 characters'
          ]" clearable />

        <v-textarea v-model="description" placeholder="About Us" variant="outlined" density="comfortable"
          class="form-input" auto-grow rows="3" prepend-inner-icon="mdi-information-outline" />

        <!-- Operating Hours -->
        <h2 class="section-title">Operating Hours</h2>
        <v-row>
          <v-col cols="6">
            <v-text-field v-model="openTime" type="time" placeholder="Opening Time" variant="outlined"
              density="comfortable" class="form-input" prepend-inner-icon="mdi-clock-outline" />
          </v-col>
          <v-col cols="6">
            <v-text-field v-model="closeTime" type="time" placeholder="Closing Time" variant="outlined"
              density="comfortable" class="form-input" prepend-inner-icon="mdi-clock-outline" />
          </v-col>
        </v-row>

        <!-- Address Section -->
        <h2 class="section-title">Address</h2>

        <v-text-field v-model="address.street.value" placeholder="Street Name" variant="outlined" density="comfortable"
          class="form-input" prepend-inner-icon="mdi-road" />

        <v-text-field v-model="address.purok.value" placeholder="Purok / Block / Lot No." variant="outlined"
          density="comfortable" class="form-input" prepend-inner-icon="mdi-home-outline" />

        <v-text-field v-model="address.subdivision.value" placeholder="Subdivision / Village" variant="outlined"
          density="comfortable" class="form-input" prepend-inner-icon="mdi-home-group" />

        <v-text-field v-model="address.barangay.value" placeholder="Barangay" variant="outlined" density="comfortable"
          class="form-input" prepend-inner-icon="mdi-map-marker-outline" />

        <v-text-field v-model="address.city.value" placeholder="City / Municipality" variant="outlined"
          density="comfortable" class="form-input" prepend-inner-icon="mdi-city" />

        <v-text-field v-model="address.postal.value" placeholder="Postal / ZIP Code" variant="outlined"
          density="comfortable" class="form-input" prepend-inner-icon="mdi-mailbox" />

        <!-- Map -->
        <h2 class="section-title">Location</h2>
        <v-sheet class="map elevation-1">
          <div id="map" class="map"></div>
        </v-sheet>

        <!-- Action Buttons -->
        <div class="btns">
          <v-btn color="primary" class="shop-btn" :loading="saving" :disabled="saving" prepend-icon="mdi-content-save"
            @click="saveShop">
            Save
          </v-btn>
        </div>

        <!-- Snackbar Alert -->
        <v-snackbar v-model="snackbar" timeout="3000" color="primary" rounded="pill">
          {{ snackbarMessage }}
        </v-snackbar>

        <!-- Image Picker Dialog -->
        <v-dialog v-model="showPicker" max-width="320">
          <v-card>
            <v-card-title class="text-h6 font-weight-bold">Pick Image Source</v-card-title>
            <v-divider />
            <v-card-actions class="d-flex flex-column">
              <v-btn block @click="pickImage('camera')" color="primary" prepend-icon="mdi-camera">
                Use Camera
              </v-btn>
              <v-btn block @click="pickImage('gallery')" color="primary" prepend-icon="mdi-image">
                Use Gallery
              </v-btn>
            </v-card-actions>
          </v-card>
        </v-dialog>
      </v-container>
    </v-main>
  </v-app>
</template>


<style scoped>
.section-title {
  margin-top: 24px;
  margin-bottom: 12px;
  font-weight: 600;
  font-size: 1.2rem;
  color: #2c3e50;
}

.avatar-container {
  display: flex;
  justify-content: center;
  align-items: center;
  position: relative;
  margin: 24px 0;
}

.edit-btn {
  position: absolute;
  bottom: 0;
  right: calc(50% - 50px);
  transform: translate(50%, 20%);
  border-radius: 50%;
}

.map {
  margin-top: 12px;
  height: 300px;
  border-radius: 12px;
  overflow: hidden;
}

.btns {
  display: flex;
  justify-content: space-between;
  margin: 24px 0;
  gap: 12px;
}

.shop-btn {
  flex: 1;
}
</style>

