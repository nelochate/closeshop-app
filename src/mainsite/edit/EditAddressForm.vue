<template>
  <v-app>
    <!-- App Bar -->
    <v-app-bar flat color="primary" elevation="1">
      <template v-slot:prepend>
        <v-btn icon @click="router.back()" variant="text" color="white">
          <v-icon>mdi-arrow-left</v-icon>
        </v-btn>
      </template>
      <v-toolbar-title class="text-white font-weight-bold">
        {{ isEdit ? 'Edit Address' : 'Add New Address' }}
      </v-toolbar-title>
    </v-app-bar>

    <v-main style="background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%)">
      <!-- Success Toast -->
      <v-snackbar v-model="showSuccess" :timeout="3000" color="success" location="top" elevation="3">
        <v-icon class="me-2">mdi-check-circle</v-icon>
        {{ successMessage }}
      </v-snackbar>

      <!-- Info Toast -->
      <v-snackbar v-model="showSnackbar" :timeout="4000" color="info" location="top" elevation="3">
        <v-icon class="me-2">mdi-information</v-icon>
        {{ snackbarMessage }}
      </v-snackbar>

      <v-container class="py-8">
        <!-- Mode Selection Card -->
        <v-card class="mb-6" elevation="2" rounded="lg">
          <v-card-title class="d-flex align-center">
            <v-icon color="primary" class="me-2">mdi-map-marker</v-icon>
            <span class="text-h6">Choose Address Method</span>
          </v-card-title>
          <v-card-text>
            <v-radio-group v-model="addressMode" hide-details class="mt-2" @change="onModeChange">
              <v-row>
                <v-col cols="12" md="6">
                  <v-radio value="manual" color="primary">
                    <template v-slot:label>
                      <div class="d-flex flex-column ml-2">
                        <span class="font-weight-medium">Manual Entry</span>
                        <span class="text-caption text-medium-emphasis">
                          Select from PSGC dropdowns
                        </span>
                      </div>
                    </template>
                  </v-radio>
                </v-col>
                <v-col cols="12" md="6">
                  <v-radio value="location" color="primary">
                    <template v-slot:label>
                      <div class="d-flex flex-column ml-2">
                        <span class="font-weight-medium">Auto-detect</span>
                        <span class="text-caption text-medium-emphasis">
                          Use my current location
                        </span>
                      </div>
                    </template>
                  </v-radio>
                </v-col>
              </v-row>
            </v-radio-group>
          </v-card-text>
        </v-card>

        <!-- Manual Mode Form -->
        <v-card v-if="addressMode === 'manual'" class="mb-6" elevation="2" rounded="lg">
          <v-card-title class="d-flex align-center">
            <v-icon color="primary" class="me-2">mdi-pencil</v-icon>
            <span class="text-h6">Enter Address</span>
          </v-card-title>

          <v-card-text>
            <v-form @submit.prevent="saveAddress">
              <v-row>
                <!-- Contact Info -->
                <v-col cols="12" md="6">
                  <v-text-field
                    v-model="address.recipient_name"
                    label="Recipient Name *"
                    variant="outlined"
                    maxlength="100"
                    density="comfortable"
                    prepend-inner-icon="mdi-account"
                    required
                  />
                </v-col>
                <v-col cols="12" md="6">
                  <v-text-field
                    v-model="address.phone"
                    label="Phone Number *"
                    variant="outlined"
                    maxlength="20"
                    density="comfortable"
                    prepend-inner-icon="mdi-phone"
                    required
                  />
                </v-col>

                <!-- PSGC Address Fields -->
                <v-col cols="12" md="6">
                  <v-select
                    v-model="address.region"
                    :items="regions"
                    item-title="name"
                    item-value="code"
                    label="Region *"
                    variant="outlined"
                    density="comfortable"
                    prepend-inner-icon="mdi-map"
                    required
                    clearable
                  />
                </v-col>

                <v-col cols="12" md="6">
                  <v-select
                    v-model="address.province"
                    :items="provinces"
                    item-title="name"
                    item-value="code"
                    label="Province *"
                    variant="outlined"
                    density="comfortable"
                    prepend-inner-icon="mdi-map-marker"
                    required
                    :disabled="!address.region"
                    clearable
                  />
                </v-col>

                <v-col cols="12" md="6">
                  <v-select
                    v-model="address.city"
                    :items="citiesMunicipalities"
                    item-title="name"
                    item-value="code"
                    label="City/Municipality *"
                    variant="outlined"
                    density="comfortable"
                    prepend-inner-icon="mdi-city"
                    required
                    :disabled="!address.province"
                    clearable
                  />
                </v-col>

                <v-col cols="12" md="6">
                  <v-select
                    v-model="address.barangay"
                    :items="barangays"
                    item-title="name"
                    item-value="code"
                    label="Barangay *"
                    variant="outlined"
                    density="comfortable"
                    prepend-inner-icon="mdi-home-city"
                    required
                    :disabled="!address.city"
                    clearable
                  />
                </v-col>

                <!-- Address Details -->
                <v-col cols="12" md="6">
                  <v-text-field
                    v-model="address.street"
                    label="Street"
                    variant="outlined"
                    density="comfortable"
                    prepend-inner-icon="mdi-road"
                  />
                </v-col>

                <v-col cols="12" md="6">
                  <v-text-field
                    v-model="address.house_no"
                    label="House/Lot No."
                    variant="outlined"
                    density="comfortable"
                    prepend-inner-icon="mdi-home"
                  />
                </v-col>

                <!-- Optional Fields -->
                <v-col cols="12" md="6">
                  <v-text-field
                    v-model="address.purok"
                    label="Purok/Subdivision (Optional)"
                    variant="outlined"
                    density="comfortable"
                    prepend-inner-icon="mdi-home-group"
                  />
                </v-col>

                <v-col cols="12" md="6">
                  <v-text-field
                    v-model="address.building"
                    label="Building/Apartment (Optional)"
                    variant="outlined"
                    density="comfortable"
                    prepend-inner-icon="mdi-office-building"
                  />
                </v-col>

                <!-- Map Section -->
                <v-col cols="12">
                  <div class="mb-2 d-flex align-center justify-space-between">
                    <div>
                      <span class="text-subtitle-1 font-weight-medium">Map Preview</span>
                      <span class="text-caption text-medium-emphasis ml-2">
                        📍 Map updates as you select address
                      </span>
                    </div>
                    <v-btn
                      @click="refreshManualMap"
                      size="small"
                      variant="tonal"
                      color="primary"
                      :loading="isRefreshingMap"
                    >
                      <v-icon size="small" class="me-1">mdi-refresh</v-icon>
                      Refresh Map
                    </v-btn>
                  </div>
                  <div id="manual-map" class="map-wrapper rounded-lg elevation-1"></div>
                  <p class="text-caption text-medium-emphasis mt-2">
                    <v-icon size="small" color="primary" class="me-1">mdi-information</v-icon>
                    Click on the map or drag the marker to adjust the location
                  </p>
                </v-col>

                <!-- Submit Button -->
                <v-col cols="12">
                  <v-btn
                    type="submit"
                    color="primary"
                    size="large"
                    :loading="isLoading"
                    :disabled="
                      !address.region ||
                      !address.province ||
                      !address.city ||
                      !address.barangay ||
                      !address.recipient_name ||
                      !address.phone
                    "
                    block
                    rounded="lg"
                    class="mt-4"
                    elevation="2"
                  >
                    <v-icon class="me-2">mdi-check</v-icon>
                    {{ isLoading ? 'Saving...' : isEdit ? 'Update Address' : 'Save Address' }}
                  </v-btn>
                </v-col>
              </v-row>
            </v-form>
          </v-card-text>
        </v-card>

        <!-- Location Mode Form -->
        <v-card v-else class="mb-6" elevation="2" rounded="lg">
          <v-card-title class="d-flex align-center">
            <v-icon color="primary" class="me-2">mdi-crosshairs-gps</v-icon>
            <span class="text-h6">Auto-detect Location</span>
          </v-card-title>

          <v-card-text>
            <!-- Location Detection Card -->
            <v-card class="mb-6" variant="outlined" color="primary" rounded="lg">
              <v-card-text class="text-center pa-6">
                <v-icon size="64" color="primary" class="mb-4">mdi-crosshairs-gps</v-icon>
                <p class="text-h6 font-weight-bold mb-2">Detect Your Location</p>
                <p class="text-body-2 text-medium-emphasis mb-4">
                  We'll automatically fill your address details using your device's GPS. Make sure
                  location services are enabled.
                </p>
                <v-btn
                  color="primary"
                  @click="useCurrentLocation"
                  :loading="isLoadingLocation"
                  variant="tonal"
                  size="large"
                  rounded="lg"
                  class="mb-2"
                  elevation="2"
                  block
                >
                  <v-icon class="me-2">mdi-crosshairs-gps</v-icon>
                  {{ isLoadingLocation ? 'Detecting Location...' : 'Detect My Location Now' }}
                </v-btn>
                <p v-if="isLoadingLocation" class="text-caption text-medium-emphasis mt-2">
                  <v-progress-circular indeterminate size="16" width="2" class="me-2"></v-progress-circular>
                  Please wait while we detect your location...
                </p>
              </v-card-text>
            </v-card>

            <!-- Map Container (ALWAYS SHOWN) -->
            <div class="mb-4">
              <div class="d-flex align-center mb-2">
                <v-icon color="success" class="me-2">mdi-map</v-icon>
                <span class="text-subtitle-1 font-weight-medium">Your Location</span>
              </div>
              <!-- Map container should ALWAYS be in the DOM, even if hidden -->
              <div 
                id="location-map" 
                class="map-wrapper rounded-lg elevation-1" 
                :style="{ display: hasDetectedLocation ? 'block' : 'none' }"
              ></div>
              <p v-if="hasDetectedLocation" class="text-caption text-medium-emphasis mt-2">
                <v-icon size="small" color="success" class="me-1">mdi-information</v-icon>
                Drag the marker to fine-tune your location
              </p>
            </div>

            <!-- Auto-filled Address Preview -->
            <div v-if="hasDetectedLocation" class="mb-6">
              <div class="d-flex align-center mb-4">
                <v-icon color="success" class="me-2">mdi-check-circle</v-icon>
                <span class="text-subtitle-1 font-weight-medium">Detected Address</span>
              </div>

              <v-card variant="outlined" class="pa-4 mb-4">
                <div class="d-flex align-start mb-2">
                  <v-icon color="primary" size="small" class="me-2 mt-1">mdi-account</v-icon>
                  <v-text-field
                    v-model="address.recipient_name"
                    label="Recipient Name *"
                    variant="underlined"
                    density="compact"
                    hide-details
                    required
                  />
                </div>

                <div class="d-flex align-start mb-2">
                  <v-icon color="primary" size="small" class="me-2 mt-1">mdi-phone</v-icon>
                  <v-text-field
                    v-model="address.phone"
                    label="Phone Number *"
                    variant="underlined"
                    density="compact"
                    hide-details
                    required
                  />
                </div>

                <v-divider class="my-3"></v-divider>

                <div class="text-body-2">
                  <div class="d-flex align-center mb-1">
                    <v-icon size="small" class="me-2">mdi-map-marker</v-icon>
                    <span class="font-weight-medium">Full Address:</span>
                  </div>
                  <p class="pl-6 mb-1">{{ address.house_no }} {{ address.street }}</p>
                  <p class="pl-6 mb-1">{{ address.purok }}</p>
                  <p class="pl-6 mb-1">{{ address.barangay_name }}</p>
                  <p class="pl-6 mb-1">{{ address.city_name }}</p>
                  <p class="pl-6 mb-1">{{ address.province_name }}</p>
                  <p class="pl-6 mb-1">{{ address.region_name }}</p>
                  <p v-if="address.postal_code" class="pl-6">
                    Postal Code: {{ address.postal_code }}
                  </p>
                </div>

                <div class="mt-3">
                  <v-btn
                    @click="showEditFields = !showEditFields"
                    variant="text"
                    color="primary"
                    size="small"
                  >
                    <v-icon class="me-1">mdi-pencil</v-icon>
                    {{ showEditFields ? 'Hide Edit Fields' : 'Edit Address Details' }}
                  </v-btn>
                </div>
              </v-card>

              <!-- Editable Fields (Collapsible) -->
              <v-expand-transition>
                <div v-if="showEditFields">
                  <v-row>
                    <v-col cols="12" md="6">
                      <v-text-field
                        v-model="address.street"
                        label="Street"
                        variant="outlined"
                        density="comfortable"
                        prepend-inner-icon="mdi-road"
                      />
                    </v-col>
                    <v-col cols="12" md="6">
                      <v-text-field
                        v-model="address.house_no"
                        label="House/Lot No."
                        variant="outlined"
                        density="comfortable"
                        prepend-inner-icon="mdi-home"
                      />
                    </v-col>
                    <v-col cols="12" md="6">
                      <v-text-field
                        v-model="address.purok"
                        label="Purok/Subdivision"
                        variant="outlined"
                        density="comfortable"
                        prepend-inner-icon="mdi-home-group"
                      />
                    </v-col>
                    <v-col cols="12" md="6">
                      <v-text-field
                        v-model="address.building"
                        label="Building/Apartment"
                        variant="outlined"
                        density="comfortable"
                        prepend-inner-icon="mdi-office-building"
                      />
                    </v-col>
                  </v-row>
                </div>
              </v-expand-transition>

              <!-- Default Address Toggle -->
              <v-checkbox
                v-model="address.is_default"
                label="Set as default address"
                color="primary"
                density="comfortable"
                hide-details
                class="mb-4"
              />

              <!-- Submit Button -->
              <v-btn
                color="success"
                @click="saveAddress"
                :loading="isLoading"
                :disabled="
                  !address.region_name ||
                  !address.province_name ||
                  !address.city_name ||
                  !address.barangay_name ||
                  !address.recipient_name ||
                  !address.phone
                "
                block
                size="large"
                rounded="lg"
                elevation="2"
              >
                <v-icon class="me-2">mdi-check</v-icon>
                {{ isLoading ? 'Saving...' : 'Confirm & Save Address' }}
              </v-btn>
            </div>

            <!-- Instructions if no location detected -->
            <div v-else class="text-center py-8">
              <v-icon size="64" color="grey-lighten-1" class="mb-4">mdi-map-marker-radius</v-icon>
              <p class="text-h6 font-weight-bold mb-2">No Location Detected Yet</p>
              <p class="text-body-2 text-medium-emphasis">
                Click the "Detect My Location Now" button above to automatically fill your address.
              </p>
            </div>
          </v-card-text>
        </v-card>
      </v-container>
    </v-main>
  </v-app>
</template>

<script setup lang="ts">
import { ref, onMounted, watch, nextTick, onUnmounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { supabase } from '@/utils/supabase'
import { Geolocation } from '@capacitor/geolocation'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'

const router = useRouter()
const route = useRoute()

// Set Mapbox token
mapboxgl.accessToken =
  'pk.eyJ1IjoiY2xvc2VzaG9wIiwiYSI6ImNtaDI2emxocjEwdnVqMHExenFpam42bjcifQ.QDsWVOHM9JPhPQ---Ca4MA'

// --- State ---
const isLoading = ref(false)
const isLoadingLocation = ref(false)
const isRefreshingMap = ref(false)
const showSuccess = ref(false)
const successMessage = ref('')
const showSnackbar = ref(false)
const snackbarMessage = ref('')
const addressMode = ref('manual')
const isEdit = ref(false)
const addressId = ref(route.params.id || null)
const hasDetectedLocation = ref(false)
const showEditFields = ref(false)

// Separate map instances with proper lifecycle management
const manualMap = ref<mapboxgl.Map | null>(null)
const locationMap = ref<mapboxgl.Map | null>(null)
const manualMarker = ref<mapboxgl.Marker | null>(null)
const locationMarker = ref<mapboxgl.Marker | null>(null)
const manualMapInitialized = ref(false)
const locationMapInitialized = ref(false)

// PSGC Data
const regions = ref<any[]>([])
const provinces = ref<any[]>([])
const citiesMunicipalities = ref<any[]>([])
const barangays = ref<any[]>([])

const address = ref({
  recipient_name: '',
  phone: '',
  street: '',
  purok: '',
  building: '',
  house_no: '',
  postal_code: '',
  is_default: false,
  region_name: '',
  province_name: '',
  city_name: '',
  barangay_name: '',
  // PSGC codes for manual mode
  region: '',
  province: '',
  city: '',
  barangay: '',
})

// --- Cleanup Function ---
const cleanupMaps = () => {
  if (manualMarker.value) {
    manualMarker.value.remove()
    manualMarker.value = null
  }
  if (manualMap.value) {
    manualMap.value.remove()
    manualMap.value = null
  }
  if (locationMarker.value) {
    locationMarker.value.remove()
    locationMarker.value = null
  }
  if (locationMap.value) {
    locationMap.value.remove()
    locationMap.value = null
  }
  manualMapInitialized.value = false
  locationMapInitialized.value = false
}

// --- Mode Change Handler ---
const onModeChange = async (mode: string) => {
  // Clean up the map that's not needed
  if (mode === 'manual') {
    if (locationMap.value) {
      locationMap.value.remove()
      locationMap.value = null
      locationMapInitialized.value = false
    }
    await nextTick()
    setTimeout(() => {
      initializeManualMap()
    }, 100)
  } else {
    if (manualMap.value) {
      manualMap.value.remove()
      manualMap.value = null
      manualMapInitialized.value = false
    }
    await nextTick()
    // When switching to location mode, immediately initialize the map
    setTimeout(() => {
      initializeLocationMap()
    }, 100)
  }
}

// --- PSGC API Functions ---
const fetchRegions = async () => {
  try {
    const res = await fetch('https://psgc.cloud/api/regions')
    if (!res.ok) throw new Error('Failed to fetch regions')
    const data = await res.json()
    regions.value = data.sort((a: any, b: any) => a.name.localeCompare(b.name))
  } catch (err) {
    console.error(err)
    snackbarMessage.value = 'Error loading regions'
    showSnackbar.value = true
  }
}

const fetchProvinces = async (regionCode: string) => {
  if (!regionCode) {
    provinces.value = []
    return
  }
  try {
    const res = await fetch(`https://psgc.cloud/api/regions/${regionCode}/provinces`)
    if (!res.ok) throw new Error('Failed to fetch provinces')
    const data = await res.json()
    provinces.value = data.sort((a: any, b: any) => a.name.localeCompare(b.name))
  } catch (err) {
    console.error(err)
    snackbarMessage.value = 'Error loading provinces'
    showSnackbar.value = true
  }
}

const fetchCitiesMunicipalities = async (provinceCode: string) => {
  if (!provinceCode) {
    citiesMunicipalities.value = []
    return
  }
  try {
    const res = await fetch(
      `https://psgc.cloud/api/provinces/${provinceCode}/cities-municipalities`,
    )
    if (!res.ok) throw new Error('Failed to fetch cities/municipalities')
    const data = await res.json()
    citiesMunicipalities.value = data.sort((a: any, b: any) => a.name.localeCompare(b.name))
  } catch (err) {
    console.error(err)
    snackbarMessage.value = 'Error loading cities/municipalities'
    showSnackbar.value = true
  }
}

const fetchBarangays = async (cityCode: string) => {
  if (!cityCode) {
    barangays.value = []
    return
  }
  try {
    const res = await fetch(`https://psgc.cloud/api/cities/${cityCode}/barangays`)
    if (!res.ok) throw new Error('Failed to fetch barangays')
    const data = await res.json()
    barangays.value = data.sort((a: any, b: any) => a.name.localeCompare(b.name))
  } catch (err) {
    console.error(err)
    snackbarMessage.value = 'Error loading barangays'
    showSnackbar.value = true
  }
}

// --- Progressive Zoom Logic ---
const updateMapZoom = (map: mapboxgl.Map) => {
  if (!map) return

  let zoomLevel = 6 // Default zoom for Philippines

  // Progressive zoom based on filled address fields
  if (address.value.region) zoomLevel = 7
  if (address.value.province) zoomLevel = 9
  if (address.value.city) zoomLevel = 12
  if (address.value.barangay) zoomLevel = 15
  if (address.value.street || address.value.purok || address.value.house_no) zoomLevel = 17

  return zoomLevel
}

// --- Watchers for Manual Input Mode ---
watch(
  () => address.value.region,
  async (newRegion) => {
    if (addressMode.value !== 'manual') return

    address.value.province = ''
    address.value.city = ''
    address.value.barangay = ''
    address.value.postal_code = ''
    if (newRegion) {
      await fetchProvinces(newRegion)
      await updateManualMap()
    }
  },
)

watch(
  () => address.value.province,
  async (newProvince) => {
    if (addressMode.value !== 'manual') return

    address.value.city = ''
    address.value.barangay = ''
    address.value.postal_code = ''
    if (newProvince) {
      await fetchCitiesMunicipalities(newProvince)
      await updateManualMap()
    }
  },
)

watch(
  () => address.value.city,
  async (newCity) => {
    if (addressMode.value !== 'manual') return

    address.value.barangay = ''
    const selectedCity = citiesMunicipalities.value.find((c) => c.code === newCity)
    if (selectedCity?.zip_code) address.value.postal_code = selectedCity.zip_code
    if (newCity) {
      await fetchBarangays(newCity)
      await updateManualMap()
    }
  },
)

// --- Get User Profile ID ---
const getUserProfileId = async () => {
  try {
    const { data: userData, error: userError } = await supabase.auth.getUser()
    if (userError || !userData?.user) throw new Error('User not authenticated')

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', userData.user.id)
      .single()

    if (profileError) {
      const { data: newProfile, error: createError } = await supabase
        .from('profiles')
        .insert([{ id: userData.user.id }])
        .select()
        .single()

      if (createError) throw new Error('Failed to create user profile')
      return newProfile.id
    }

    return profile.id
  } catch (err) {
    console.error('Error getting user profile:', err)
    throw err
  }
}

// --- Load Address for Edit ---
const loadAddress = async () => {
  try {
    const profileId = await getUserProfileId()
    await fetchRegions()

    if (!addressId.value) return

    const { data, error } = await supabase
      .from('addresses')
      .select('*')
      .eq('id', addressId.value)
      .eq('user_id', profileId)
      .single()

    if (error || !data) {
      snackbarMessage.value = 'Error loading address'
      showSnackbar.value = true
      return
    }

    Object.assign(address.value, data)
    isEdit.value = true
    hasDetectedLocation.value = true

    if (data.region_name) {
      const selectedRegion = regions.value.find((r) => r.name === data.region_name)
      if (selectedRegion) await fetchProvinces(selectedRegion.code)
    }

    if (data.province_name) {
      const selectedProvince = provinces.value.find((p) => p.name === data.province_name)
      if (selectedProvince) await fetchCitiesMunicipalities(selectedProvince.code)
    }

    if (data.city_name) {
      const selectedCity = citiesMunicipalities.value.find((c) => c.name === data.city_name)
      if (selectedCity) await fetchBarangays(selectedCity.code)
    }

    setTimeout(() => {
      if (addressMode.value === 'manual') {
        updateManualMap()
      } else {
        updateLocationMap()
      }
    }, 500)
  } catch (err) {
    console.error(err)
    snackbarMessage.value = 'Unexpected error loading address'
    showSnackbar.value = true
  }
}

// --- Save Address ---
const saveAddress = async () => {
  try {
    isLoading.value = true

    // Validation
    const requiredFields =
      addressMode.value === 'manual'
        ? ['region', 'province', 'city', 'barangay']
        : ['region_name', 'province_name', 'city_name', 'barangay_name']

    for (const field of requiredFields) {
      if (!address.value[field as keyof typeof address.value]) {
        throw new Error('Complete all required address fields')
      }
    }

    if (!address.value.recipient_name || !address.value.phone) {
      throw new Error('Recipient name and phone number are required')
    }

    const profileId = await getUserProfileId()

    let addressData: any

    if (addressMode.value === 'manual') {
      const regionName = regions.value.find((r) => r.code === address.value.region)?.name || ''
      const provinceName =
        provinces.value.find((p) => p.code === address.value.province)?.name || ''
      const cityName =
        citiesMunicipalities.value.find((c) => c.code === address.value.city)?.name || ''
      const barangayName =
        barangays.value.find((b) => b.code === address.value.barangay)?.name || ''

      addressData = {
        user_id: profileId,
        recipient_name: address.value.recipient_name,
        phone: address.value.phone,
        street: address.value.street,
        purok: address.value.purok,
        building: address.value.building,
        house_no: address.value.house_no,
        postal_code: address.value.postal_code,
        is_default: address.value.is_default,
        region_name: regionName,
        province_name: provinceName,
        city_name: cityName,
        barangay_name: barangayName,
        updated_at: new Date().toISOString(),
      }
    } else {
      addressData = {
        user_id: profileId,
        recipient_name: address.value.recipient_name,
        phone: address.value.phone,
        street: address.value.street,
        purok: address.value.purok,
        building: address.value.building,
        house_no: address.value.house_no,
        postal_code: address.value.postal_code,
        is_default: address.value.is_default,
        region_name: address.value.region_name,
        province_name: address.value.province_name,
        city_name: address.value.city_name,
        barangay_name: address.value.barangay_name,
        updated_at: new Date().toISOString(),
      }
    }

    if (address.value.is_default) {
      await supabase
        .from('addresses')
        .update({ is_default: false })
        .eq('user_id', profileId)
        .neq('id', addressId.value || '')
    }

    let result
    if (isEdit.value && addressId.value) {
      result = await supabase
        .from('addresses')
        .update(addressData)
        .eq('id', addressId.value)
        .eq('user_id', profileId)
    } else {
      result = await supabase.from('addresses').insert([
        {
          ...addressData,
          user_id: profileId,
          created_at: new Date().toISOString(),
        },
      ])
    }

    if (result.error) {
      if (
        result.error.code === '23505' &&
        result.error.message.includes('one_default_address_per_user')
      ) {
        throw new Error(
          'You can only have one default address. Please unset your current default address first.',
        )
      }
      throw new Error(result.error.message)
    }

    successMessage.value = isEdit.value
      ? 'Address updated successfully!'
      : 'Address added successfully!'
    showSuccess.value = true

    setTimeout(() => router.replace({ name: 'my-address', query: { refreshed: Date.now() } }), 1500)
  } catch (err: any) {
    console.error(err)
    snackbarMessage.value = 'Error: ' + (err.message || 'Failed to save address')
    showSnackbar.value = true
  } finally {
    isLoading.value = false
  }
}

// --- Update Map for Manual Input Mode ---
const updateManualMap = async () => {
  if (addressMode.value !== 'manual' || !manualMap.value) return

  const house = address.value.house_no || ''
  const street = address.value.street || ''
  const purok = address.value.purok || ''
  const barangayName = barangays.value.find((b) => b.code === address.value.barangay)?.name || ''
  const cityName = citiesMunicipalities.value.find((c) => c.code === address.value.city)?.name || ''
  const provinceName = provinces.value.find((p) => p.code === address.value.province)?.name || ''

  if (!barangayName && !street && !cityName) {
    manualMap.value.flyTo({
      center: [121.774, 12.8797],
      zoom: 6,
      duration: 500,
    })

    if (manualMarker.value) {
      manualMarker.value.remove()
      manualMarker.value = null
    }
    return
  }

  const query =
    `${house} ${street} ${purok} ${barangayName}, ${cityName}, ${provinceName}, Philippines`.trim()

  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&countrycodes=ph&limit=1`,
    )
    const results = await res.json()
    if (results.length > 0) {
      const { lat, lon } = results[0]
      const latNum = parseFloat(lat)
      const lonNum = parseFloat(lon)
      const zoomLevel = updateMapZoom(manualMap.value)

      manualMap.value.flyTo({
        center: [lonNum, latNum],
        zoom: zoomLevel,
        duration: 500,
      })

      if (manualMarker.value) {
        manualMarker.value.setLngLat([lonNum, latNum])
      } else {
        const el = document.createElement('div')
        el.className = 'custom-marker manual-marker'
        el.innerHTML = '<i class="mdi mdi-map-marker" style="color: #3f83c7; font-size: 32px;"></i>'

        manualMarker.value = new mapboxgl.Marker({
          element: el,
          draggable: true,
        })
          .setLngLat([lonNum, latNum])
          .addTo(manualMap.value)

        manualMarker.value.on('dragend', () => {
          const lngLat = manualMarker.value!.getLngLat()
          reverseGeocodeManual(lngLat.lat, lngLat.lng)
        })
      }
    }
  } catch (err: any) {
    console.error(err)
    snackbarMessage.value = 'Map update failed: ' + (err.message || 'Geocoding service error')
    showSnackbar.value = true
  }
}

// --- Reverse Geocoding for Manual Mode Dragged Marker ---
const reverseGeocodeManual = async (lat: number, lng: number) => {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`,
    )
    const result = await res.json()
    if (result.address) {
      const addr = result.address
      address.value.house_no = addr.house_number || address.value.house_no
      address.value.building = addr.building || addr.specific_place || address.value.building
      address.value.street = addr.road || address.value.street
      address.value.purok = addr.purok || address.value.purok
      address.value.postal_code = addr.postcode || address.value.postal_code

      snackbarMessage.value = '📍 Marker moved! Address details updated.'
      showSnackbar.value = true
    }
  } catch (err) {
    console.error('Reverse geocoding failed:', err)
    snackbarMessage.value = 'Unable to get address details for this location'
    showSnackbar.value = true
  }
}

// --- Current Location Functions ---
const useCurrentLocation = async () => {
  try {
    snackbarMessage.value = 'Detecting your precise location and address...'
    showSnackbar.value = true
    isLoadingLocation.value = true

    // Initialize the location map if not already done
    if (!locationMapInitialized.value && addressMode.value === 'location') {
      initializeLocationMap()
      // Wait for map to initialize
      await new Promise((resolve) => setTimeout(resolve, 300))
    }

    // Ensure map container is visible
    const mapElement = document.getElementById('location-map')
    if (mapElement) {
      mapElement.style.display = 'block'
      mapElement.style.visibility = 'visible'
      mapElement.style.height = '300px'
    }

    // Request permissions with timeout handling
    const permissions = await Geolocation.checkPermissions()
    if (permissions.location !== 'granted') {
      const request = await Geolocation.requestPermissions()
      if (request.location !== 'granted') throw new Error('Location permission denied.')
    }

    // Get current position
    const coords = await Geolocation.getCurrentPosition({
      enableHighAccuracy: true,
      timeout: 15000,
    }).catch((err) => {
      if (err.code === 3) {
        throw new Error(
          'Location detection timed out. Please check your internet connection and try again.',
        )
      }
      throw err
    })

    const lat = coords.coords.latitude
    const lng = coords.coords.longitude

    // Initialize or update the map
    if (locationMap.value) {
      // Resize map first
      locationMap.value.resize()
      
      // Fly to detected location
      locationMap.value.flyTo({
        center: [lng, lat],
        zoom: 18,
        duration: 1500,
      })

      // Add or update marker
      if (locationMarker.value) {
        locationMarker.value.setLngLat([lng, lat])
      } else {
        const el = document.createElement('div')
        el.className = 'custom-marker location-marker'
        el.innerHTML =
          '<i class="mdi mdi-crosshairs-gps" style="color: #10b981; font-size: 32px;"></i>'

        locationMarker.value = new mapboxgl.Marker({
          element: el,
          draggable: true,
        })
          .setLngLat([lng, lat])
          .addTo(locationMap.value)

        locationMarker.value.on('dragend', () => {
          const lngLat = locationMarker.value!.getLngLat()
          reverseGeocodeLocationMode(lngLat.lat, lngLat.lng)
        })
      }
      
      // Force a redraw
      setTimeout(() => {
        if (locationMap.value) {
          locationMap.value.resize()
        }
      }, 500)
    }

    await reverseGeocodeLocationMode(lat, lng)

    hasDetectedLocation.value = true
    snackbarMessage.value = '📍 Location detected! Address fields filled automatically.'
    showSnackbar.value = true
  } catch (err: any) {
    console.error('Location error:', err)
    snackbarMessage.value = '📍 ' + (err.message || 'Unable to detect location.')
    showSnackbar.value = true
    hasDetectedLocation.value = false
  } finally {
    isLoadingLocation.value = false
  }
}

// --- Reverse Geocoding for Location Mode ---
const reverseGeocodeLocationMode = async (lat: number, lng: number) => {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`,
    )
    const result = await res.json()

    if (result.address) {
      const addr = result.address

      address.value.house_no = addr.house_number || ''
      address.value.building = addr.building || addr.specific_place || ''
      address.value.street = addr.road || ''
      address.value.purok = addr.purok || addr.neighbourhood || addr.suburb || ''
      address.value.postal_code = addr.postcode || ''
      address.value.region_name = addr.state || addr.region || ''
      address.value.province_name = addr.state_district || addr.province || ''
      address.value.city_name = addr.city || addr.town || addr.municipality || ''
      address.value.barangay_name = addr.village || addr.neighbourhood || addr.suburb || ''
    }
  } catch (err) {
    console.error('Location mode reverse geocoding failed:', err)
    snackbarMessage.value = 'Unable to get address details for this location'
    showSnackbar.value = true
  }
}

// --- Initialize Manual Map ---
const initializeManualMap = () => {
  const mapElement = document.getElementById('manual-map')
  if (mapElement && !manualMapInitialized.value) {
    // Clear any existing instance
    if (manualMap.value) {
      manualMap.value.remove()
      manualMap.value = null
    }

    manualMap.value = new mapboxgl.Map({
      container: 'manual-map',
      style: 'mapbox://styles/mapbox/streets-v12',
      center: [121.774, 12.8797],
      zoom: 6,
      attributionControl: false,
    })

    manualMap.value.addControl(new mapboxgl.NavigationControl(), 'top-right')

    manualMap.value.addControl(
      new mapboxgl.GeolocateControl({
        positionOptions: { enableHighAccuracy: true },
        trackUserLocation: true,
        showUserLocation: false,
      }),
    )

    manualMap.value.on('click', (e) => {
      const { lng, lat } = e.lngLat

      if (manualMarker.value) {
        manualMarker.value.setLngLat([lng, lat])
      } else {
        const el = document.createElement('div')
        el.className = 'custom-marker manual-marker'
        el.innerHTML = '<i class="mdi mdi-map-marker" style="color: #3f83c7; font-size: 32px;"></i>'

        manualMarker.value = new mapboxgl.Marker({
          element: el,
          draggable: true,
        })
          .setLngLat([lng, lat])
          .addTo(manualMap.value)

        manualMarker.value.on('dragend', () => {
          const position = manualMarker.value!.getLngLat()
          reverseGeocodeManual(position.lat, position.lng)
        })
      }

      reverseGeocodeManual(lat, lng)
    })

    manualMap.value.on('load', () => {
      manualMapInitialized.value = true
      console.log('Manual map loaded')
    })

    manualMap.value.on('error', (e) => {
      console.error('Manual map error:', e)
      snackbarMessage.value = 'Map loading error. Please refresh the page.'
      showSnackbar.value = true
    })
  }
}

// --- Initialize Location Map ---
const initializeLocationMap = () => {
  const mapElement = document.getElementById('location-map')
  if (mapElement && !locationMapInitialized.value) {
    // Clear any existing instance
    if (locationMap.value) {
      locationMap.value.remove()
      locationMap.value = null
    }

    // Ensure the map container is visible
    mapElement.style.display = 'block'
    mapElement.style.visibility = 'visible'
    mapElement.style.height = '300px'

    locationMap.value = new mapboxgl.Map({
      container: 'location-map',
      style: 'mapbox://styles/mapbox/streets-v12',
      center: [121.774, 12.8797],
      zoom: 6,
      attributionControl: false,
    })

    locationMap.value.addControl(new mapboxgl.NavigationControl(), 'top-right')

    locationMap.value.addControl(
      new mapboxgl.GeolocateControl({
        positionOptions: { enableHighAccuracy: true },
        trackUserLocation: true,
        showUserLocation: false,
      }),
    )

    locationMap.value.on('click', (e) => {
      const { lng, lat } = e.lngLat

      if (locationMarker.value) {
        locationMarker.value.setLngLat([lng, lat])
      } else {
        const el = document.createElement('div')
        el.className = 'custom-marker location-marker'
        el.innerHTML =
          '<i class="mdi mdi-crosshairs-gps" style="color: #10b981; font-size: 32px;"></i>'

        locationMarker.value = new mapboxgl.Marker({
          element: el,
          draggable: true,
        })
          .setLngLat([lng, lat])
          .addTo(locationMap.value)

        locationMarker.value.on('dragend', () => {
          const position = locationMarker.value!.getLngLat()
          reverseGeocodeLocationMode(position.lat, position.lng)
        })
      }

      reverseGeocodeLocationMode(lat, lng)
    })

    locationMap.value.on('load', () => {
      locationMapInitialized.value = true
      console.log('Location map loaded')

      // Force resize after load
      setTimeout(() => {
        if (locationMap.value) {
          locationMap.value.resize()
        }
      }, 200)
    })

    locationMap.value.on('error', (e) => {
      console.error('Location map error:', e)
      snackbarMessage.value = 'Map loading error. Please refresh the page.'
      showSnackbar.value = true
    })
  }
}

// --- Refresh Map Function ---
const refreshManualMap = async () => {
  isRefreshingMap.value = true
  await updateManualMap()
  isRefreshingMap.value = false
}

// --- Update Location Map ---
const updateLocationMap = () => {
  if (!locationMap.value || !locationMarker.value) return

  // If we have location data, center the map
  if (address.value.region_name && address.value.city_name) {
    // This would need proper geocoding implementation
    // For now, just ensure the map is ready
  }
}

// --- Lifecycle ---
onMounted(() => {
  loadAddress()
  // Initialize the map for the current mode
  setTimeout(() => {
    if (addressMode.value === 'manual') {
      initializeManualMap()
    } else {
      initializeLocationMap()
    }
  }, 300)
})

onUnmounted(() => {
  cleanupMaps()
})

// --- Watch for manual address changes ---
let updateMapTimeout: any
watch(
  () => [
    address.value.street,
    address.value.barangay,
    address.value.house_no,
    address.value.purok,
    address.value.city,
    address.value.province,
  ],
  () => {
    if (updateMapTimeout) clearTimeout(updateMapTimeout)
    updateMapTimeout = setTimeout(() => {
      if (addressMode.value === 'manual') updateManualMap()
    }, 800)
  },
)
</script>

<style scoped>
.map-wrapper {
  width: 100%;
  height: 300px;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  position: relative;
  overflow: hidden;
  background: #f8f9fa;
}

/* Custom marker styling */
.custom-marker {
  cursor: move;
  filter: drop-shadow(0px 2px 6px rgba(0, 0, 0, 0.4));
  animation: bounce 0.5s ease-in-out;
}

@keyframes bounce {
  0%,
  100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-10px);
  }
}

.manual-marker i {
  color: #3f83c7 !important;
}

.location-marker i {
  color: #10b981 !important;
}

/* Mapbox controls styling */
:deep(.mapboxgl-ctrl) {
  margin: 10px !important;
}

:deep(.mapboxgl-ctrl-group) {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15) !important;
  border-radius: 8px !important;
  overflow: hidden;
  background: white;
}

:deep(.mapboxgl-ctrl button) {
  width: 36px !important;
  height: 36px !important;
}

:deep(.mapboxgl-ctrl button:not(:disabled):hover) {
  background-color: #f5f5f5 !important;
}

/* Smooth transitions */
.v-card {
  transition:
    transform 0.3s ease,
    box-shadow 0.3s ease;
}

.v-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 25px rgba(0, 0, 0, 0.1) !important;
}

/* Form field focus styles */
:deep(.v-field--variant-outlined .v-field__outline) {
  transition: border-color 0.3s ease;
}

:deep(.v-field--focused .v-field__outline) {
  border-color: var(--v-primary-base) !important;
}

/* Responsive adjustments */
@media (max-width: 960px) {
  .v-container {
    padding-left: 16px;
    padding-right: 16px;
  }

  .map-wrapper {
    height: 250px;
  }
}

@media (max-width: 600px) {
  .map-wrapper {
    height: 200px;
  }
}

/* Address preview styling */
.address-preview {
  background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%);
  border-left: 4px solid #3f83c7;
}

/* Loading state */
.loading-shimmer {
  background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
}

@keyframes shimmer {
  0% {
    background-position: -200% 0;
  }
  100% {
    background-position: 200% 0;
  }
}
</style>

<style>
/* Import Material Design Icons */
@import url('https://cdn.jsdelivr.net/npm/@mdi/font@7.4.47/css/materialdesignicons.min.css');
</style>