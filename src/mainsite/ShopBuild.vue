<script setup lang="ts">
import { ref, watch, onMounted, nextTick } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { supabase } from '@/utils/supabase'
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera'
import * as L from 'leaflet'
import 'leaflet.fullscreen'
import 'leaflet.fullscreen/Control.FullScreen.css'

/// -------------------- PSGC Address Dropdowns --------------------
const regions = ref<any[]>([])
const provinces = ref<any[]>([])
const cities = ref<any[]>([])
const barangaysList = ref<any[]>([])

const selectedRegion = ref<any>(null)
const selectedProvince = ref<any>(null)
const selectedCity = ref<any>(null)
const selectedBarangay = ref<any>(null)
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
const barangays = [
  /* ... (keep your list as is) ... */
]

// -------------------- Search --------------------
const searchQuery = ref('')
const searchResults = ref<any[]>([])
const showSearchResults = ref(false)
const searchLoading = ref(false)

// -------------------- Map --------------------
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

// -------------------- Search Functions --------------------
const searchPlace = async () => {
  if (!searchQuery.value.trim()) {
    showSnackbar('Please enter a search query', 'error')
    return
  }

  searchLoading.value = true
  showSearchResults.value = false

  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery.value)}&limit=5`,
    )
    const results = await res.json()

    if (results.length > 0) {
      searchResults.value = results
      showSearchResults.value = true
      showSnackbar(`Found ${results.length} results`, 'success')
    } else {
      showSnackbar('No results found', 'error')
      searchResults.value = []
    }
  } catch (err) {
    console.error(err)
    showSnackbar('Search failed', 'error')
    searchResults.value = []
  } finally {
    searchLoading.value = false
  }
}

const selectSearchResult = async (result: any) => {
  const lat = parseFloat(result.lat)
  const lng = parseFloat(result.lon)

  // Update map and marker
  latitude.value = lat
  longitude.value = lng
  map.value?.setView([lat, lng], 17)
  shopMarker?.setLatLng([lat, lng])

  // Clear search results
  searchResults.value = []
  showSearchResults.value = false
  searchQuery.value = result.display_name

  // Save coordinates and reverse geocode
  await saveCoordinates(lat, lng)
  await reverseGeocode(lat, lng)

  showSnackbar(`Location set to: ${result.display_name}`, 'success')
}

const clearSearch = () => {
  searchResults.value = []
  showSearchResults.value = false
  searchQuery.value = ''
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
        await supabase
          .from('shops')
          .update({ physical_store: newUrl })
          .eq('id', currentShopId.value)
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
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&addressdetails=1`,
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
// -------------------- PSGC Cloud API --------------------
// -------------------- PSGC Cloud API --------------------
const fetchRegions = async () => {
  const res = await fetch('https://psgc.cloud/api/regions')
  const data = await res.json()
  regions.value = data.sort((a, b) => a.name.localeCompare(b.name))
}

const fetchProvinces = async (regionCode) => {
  const res = await fetch(`https://psgc.cloud/api/regions/${regionCode}/provinces`)
  const data = await res.json()
  provinces.value = data.sort((a, b) => a.name.localeCompare(b.name))
}

const fetchCities = async (provinceCode) => {
  const res = await fetch(`https://psgc.cloud/api/provinces/${provinceCode}/cities-municipalities`)
  const data = await res.json()
  cities.value = data.sort((a, b) => a.name.localeCompare(b.name))
}

const fetchBarangays = async (cityCode) => {
  const res = await fetch(`https://psgc.cloud/api/cities-municipalities/${cityCode}/barangays`)
  const data = await res.json()
  barangaysList.value = data.sort((a, b) => a.name.localeCompare(b.name))
}


watch(selectedRegion, (regionCode) => {
  selectedProvince.value = null
  selectedCity.value = null
  selectedBarangay.value = null
  provinces.value = []
  cities.value = []
  barangaysList.value = []
  if (regionCode) fetchProvinces(regionCode)
})

watch(selectedProvince, (provinceCode) => {
  selectedCity.value = null
  selectedBarangay.value = null
  cities.value = []
  barangaysList.value = []
  if (provinceCode) fetchCities(provinceCode)
})

watch(selectedCity, (cityCode) => {
  selectedBarangay.value = null
  barangaysList.value = []
  if (cityCode) fetchBarangays(cityCode)
})

watch(selectedBarangay, async (val) => {
  if (!val || !selectedCity.value) return

  const selectedCityObj = cities.value.find((c) => c.code === selectedCity.value)
  const selectedProvinceObj = provinces.value.find((p) => p.code === selectedProvince.value)
  const selectedRegionObj = regions.value.find((r) => r.code === selectedRegion.value)
  const selectedBarangayObj = barangaysList.value.find((b) => b.code === val)

  if (selectedBarangayObj && selectedCityObj && selectedProvinceObj && selectedRegionObj) {
    const full = `${selectedBarangayObj.name}, ${selectedCityObj.name}, ${selectedProvinceObj.name}, ${selectedRegionObj.name}, Philippines`
    fullAddress.value = full

    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(full)}`
    const res = await fetch(url)
    const data = await res.json()
    if (data.length > 0) {
      const { lat, lon } = data[0]
      latitude.value = parseFloat(lat)
      longitude.value = parseFloat(lon)
      map.value?.setView([latitude.value, longitude.value], 15)
      shopMarker?.setLatLng([latitude.value, longitude.value])
    }
  }
})

watch(selectedCity, async (cityCode) => {
  if (!cityCode) return
  const selectedCityObj = cities.value.find((c) => c.code === cityCode)
  if (!selectedCityObj) return

  const selectedProvinceObj = provinces.value.find((p) => p.code === selectedProvince.value)
  const selectedRegionObj = regions.value.find((r) => r.code === selectedRegion.value)

  const full = `${selectedCityObj.name}, ${selectedProvinceObj?.name || ''}, ${selectedRegionObj?.name || ''}, Philippines`
  const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(full)}`
  const res = await fetch(url)
  const data = await res.json()
  if (data.length > 0) {
    const { lat, lon } = data[0]
    latitude.value = parseFloat(lat)
    longitude.value = parseFloat(lon)
    map.value?.setView([latitude.value, longitude.value], 12)
    shopMarker?.setLatLng([latitude.value, longitude.value])
  }
})

// -------------------- Load Shop --------------------
onMounted(async () => {
  await fetchRegions()
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

//for radio button
const addressOption = ref<'manual' | 'map'>('manual')

watch(addressOption, async (value) => {
  if (value === 'manual') {
    await nextTick()
    if (!map.value) initMap(latitude.value!, longitude.value!)
  }
})
</script>

<template>
  <v-app>
    <!-- Top bar -->
    <v-app-bar flat color="#3f83c7" class="text-white">
      <v-btn icon variant="text" @click="goBack" class="text-white">
        <v-icon>mdi-arrow-left</v-icon>
      </v-btn>
      <v-toolbar-title>Shop Setup</v-toolbar-title>
    </v-app-bar>

    <v-main class="pb-16">
      <!-- =========================
           Cover & Logo Section
      ========================== -->
      <div class="cover-section">
        <v-img
          :src="physicalUrl || 'https://via.placeholder.com/1200x400?text=Store+Cover+Photo'"
          class="cover-photo"
          cover
        >
          <div class="cover-overlay"></div>

          <v-btn
            icon
            color="white"
            class="cover-upload"
            @click="
              () => {
                pickerTarget = 'physical'
                showPicker = true
              }
            "
          >
            <v-icon color="#3f83c7">mdi-camera</v-icon>
          </v-btn>
          <h2 class="text-center text-blue">Upload Physical Store Photo</h2>
        </v-img>

        <!-- Floating logo - FIXED POSITIONING -->
        <div class="logo-wrapper">
          <v-avatar size="110" color="white" class="logo-avatar">
            <v-img v-if="avatarUrl" :src="avatarUrl" cover />
            <v-icon v-else size="70" color="grey">mdi-store</v-icon>
          </v-avatar>

          <v-btn
            icon
            class="logo-upload-btn"
            @click="
              () => {
                pickerTarget = 'logo'
                showPicker = true
              }
            "
          >
            <v-icon color="#3f83c7">mdi-camera</v-icon>
          </v-btn>
        </div>
      </div>

      <!-- =========================
           Form Section
      ========================== -->
      <div class="form-section pa-4">
        <h2 class="section-title">Business Information</h2>
        <v-text-field v-model="shopName" label="Business Name" outlined />
        <v-textarea v-model="description" label="About Us" outlined auto-grow />

        <h2 class="section-title">Operating Hours</h2>
        <v-row>
          <v-col cols="6">
            <v-text-field v-model="openTime" type="time" label="Opening Time" outlined />
          </v-col>
          <v-col cols="6">
            <v-text-field v-model="closeTime" type="time" label="Closing Time" outlined />
          </v-col>
        </v-row>

        <h2 class="section-title">Delivery Options</h2>
        <v-checkbox v-model="deliveryOptions" label="Call a Courier" value="courier" />
        <v-checkbox v-model="deliveryOptions" label="Pickup" value="pickup" />
        <v-checkbox v-model="deliveryOptions" label="Meet-up" value="meetup" />
        <v-text-field
          v-if="deliveryOptions.includes('meetup')"
          v-model="meetUpDetails"
          label="Meet-up details"
          outlined
        />

        <h2 class="section-title">Address (Butuan City)</h2>
        <v-radio-group v-model="addressOption" inline>
          <v-radio label="Enter address manually" value="manual" />
          <v-radio label="Set current location as shop address" value="map" />
        </v-radio-group>
        <div v-if="addressOption === 'manual'">
          <v-select
            v-model="selectedRegion"
            :items="regions"
            item-title="name"
            item-value="code"
            label="Region"
            outlined
          />

          <v-select
            v-model="selectedProvince"
            :items="provinces"
            item-title="name"
            item-value="code"
            label="Province"
            outlined
            :disabled="!selectedRegion"
          />

          <v-select
            v-model="selectedCity"
            :items="cities"
            item-title="name"
            item-value="code"
            label="City / Municipality"
            outlined
            :disabled="!selectedProvince"
          />

          <v-select
            v-model="selectedBarangay"
            :items="barangaysList"
            item-title="name"
            item-value="code"
            label="Barangay"
            outlined
            :disabled="!selectedCity"
          />

          <v-text-field
            v-if="fullAddress"
            v-model="fullAddress"
            label="Full Address"
            readonly
            outlined
          />
           <v-text-field
            
            label="Add more details (e.g., house no., street, building)"
          
            outlined
          />

          <h4 class="text-center mb-2">Please drag/tap your location in the map</h4>

          <v-btn color="secondary" @click="toggleFullscreen" class="mb-2">
            Toggle Map Fullscreen
          </v-btn>

          <!-- Search Section with Results Dropdown -->
          <div class="search-section">
            <v-text-field
              v-model="searchQuery"
              label="Search place"
              outlined
              append-inner-icon="mdi-magnify"
              @keyup.enter="searchPlace"
              @click:clear="clearSearch"
              clearable
            />

            <v-btn
              color="primary"
              @click="searchPlace"
              class="mb-3 search-btn"
              :loading="searchLoading"
              :disabled="!searchQuery.trim()"
            >
              <v-icon left>mdi-magnify</v-icon>
              Search
            </v-btn>

            <!-- Search Results Dropdown -->
            <v-card
              v-if="showSearchResults && searchResults.length > 0"
              class="search-results"
              elevation="4"
            >
              <v-list density="compact">
                <v-list-subheader>Search Results</v-list-subheader>
                <v-list-item
                  v-for="(result, index) in searchResults"
                  :key="index"
                  @click="selectSearchResult(result)"
                  class="search-result-item"
                >
                  <v-list-item-title class="text-body-2">
                    {{ result.display_name }}
                  </v-list-item-title>
                </v-list-item>
              </v-list>
            </v-card>
          </div>
        </div>

        <div id="map" class="map">
          <v-btn icon @click="getLocation" class="locate-btn">
            <v-icon>mdi-crosshairs-gps</v-icon>
          </v-btn>
        </div>

        <v-btn
          color="secondary"
          @click="() => saveCoordinates(latitude!, longitude!)"
          class="save-location"
        >
          Save this location
        </v-btn>
        <div v-if="addressOption === 'map'">
          <!--dria tamn-->
          <v-btn block color="primary" @click="getLocation" class="mt-2">
            Set my location as shop address
          </v-btn>

          <v-text-field
            v-if="fullAddress"
            v-model="fullAddress"
            label="Detected Address"
            outlined
            readonly
          />
        </div>

        <v-btn block color="#3f83c7" :loading="saving" @click="saveShop" class="mt-4 text-white">
          {{ saving ? 'Saving...' : 'Save Shop' }}
        </v-btn>
      </div>

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
/* ===== Cover Section ===== */
.cover-section {
  position: relative;
  width: 100%;
  height: 200px;
  overflow: visible;
  border-bottom-left-radius: 12px;
  border-bottom-right-radius: 12px;
  z-index: 10;
}

.cover-photo {
  height: 200px;
  object-fit: cover;
  position: relative;
  z-index: 1;
}

.cover-overlay {
  position: absolute;
  inset: 0;
  background: linear-gradient(to bottom, rgba(0, 0, 0, 0.25), rgba(0, 0, 0, 0.6));
  z-index: 2;
}

.cover-upload {
  position: absolute;
  top: 10px;
  right: 10px;
  background: rgba(255, 255, 255, 0.9);
  z-index: 20;
}

/* ===== Logo Wrapper ===== */
.logo-wrapper {
  position: absolute;
  bottom: -55px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: auto;
}

.logo-avatar {
  border: 4px solid #fff;
  border-radius: 50%;
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3);
  position: relative;
  z-index: 1001;
  background: white;
}

.logo-upload-btn {
  position: absolute;
  bottom: -5px;
  right: -8px;
  background: white;
  border-radius: 50%;
  width: 30px;
  height: 30px;
  box-shadow: 0 3px 10px rgba(0, 0, 0, 0.3);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1002;
  pointer-events: auto;
}

.logo-upload-btn:hover {
  background: #3f83c7;
  transform: scale(1.1);
}

.logo-upload-btn:hover .v-icon {
  color: white !important;
}

/* ===== Form Section ===== */
.form-section {
  margin-top: 70px;
  background: #fff;
  border-radius: 12px;
  position: relative;
  z-index: 5;
  padding-top: 20px;
}

.section-title {
  color: #3f83c7;
  font-weight: 600;
  margin: 16px 0 8px;
}

/* ===== Search Section ===== */
.search-section {
  position: relative;
  margin-bottom: 16px;
}

.search-btn {
  width: 100%;
}

.search-results {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  z-index: 1000;
  max-height: 200px;
  overflow-y: auto;
  border-radius: 8px;
  margin-top: 4px;
}

.search-result-item {
  cursor: pointer;
  border-bottom: 1px solid #eee;
}

.search-result-item:hover {
  background-color: #f5f5f5;
}

.search-result-item:last-child {
  border-bottom: none;
}

/* ===== Map ===== */
.map {
  position: relative;
}
.map {
  height: 400px;
  width: 100%;
  border-radius: 12px;
  margin-bottom: 16px;
  position: relative;
  overflow: hidden;
  padding-bottom: 40px;
}

.locate-btn {
  position: absolute;
  top: 10px;
  right: 10px;
  background: white;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
  z-index: 1000;
}

.save-location {
  position: absolute;
  bottom: 15px;
  left: 15px;
  z-index: 1000;
  background: rgba(63, 131, 199, 0.9);
  color: white;
}

/* Typography */
h2 {
  font-size: 1.2rem;
  margin-top: 24px;
  color: #3f83c7;
}

h4 {
  font-weight: 500;
}

/* Ensure proper stacking context */
.v-main {
  position: relative;
}

/* Mobile responsiveness */
@media (max-width: 768px) {
  .logo-avatar {
    width: 90px !important;
    height: 90px !important;
  }

  .logo-upload-btn {
    width: 15px;
    height: 15px;
    bottom: -3px;
    right: -32px;
  }

  .logo-upload-btn .v-icon {
    font-size: 20px;
  }

  .form-section {
    margin-top: 60px;
  }
}

@media (max-width: 480px) {
  .logo-avatar {
    width: 80px !important;
    height: 80px !important;
  }

  .logo-wrapper {
    bottom: -45px;
  }

  .form-section {
    margin-top: 50px;
    padding-top: 15px;
  }

  .search-results {
    max-height: 150px;
  }
}

/* Animation for better UX */
.logo-avatar,
.logo-upload-btn,
.cover-upload {
  transition: all 0.3s ease;
}

.logo-avatar:hover {
  transform: scale(1.05);
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.4);
}
</style>
