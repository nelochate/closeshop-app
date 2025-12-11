

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
      <v-snackbar
        v-model="showSuccess"
        :timeout="3000"
        color="success"
        location="top"
        elevation="3"
      >
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
                <!-- Contact Info with validation -->
                <v-col cols="12" md="6">
                  <v-text-field
                    v-model="address.recipient_name"
                    label="Recipient Name *"
                    variant="outlined"
                    maxlength="100"
                    density="comfortable"
                    prepend-inner-icon="mdi-account"
                    :rules="[
                      (v) => !!v || 'Name is required',
                      (v) => (v && v.trim().length >= 2) || 'Name must be at least 2 characters',
                      (v) => (v && v.length <= 100) || 'Name is too long',
                    ]"
                    required
                    counter="100"
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
                    :rules="[
                      (v) => !!v || 'Phone number is required',
                      (v) =>
                        (v && /^[0-9+\-\s()]{7,20}$/.test(v)) ||
                        'Please enter a valid phone number',
                    ]"
                    required
                    counter="20"
                  />
                </v-col>

                <!-- PSGC Address Fields (Restricted to dropdowns only) -->
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
                    :rules="[(v) => !!v || 'Region is required']"
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
                    :rules="[(v) => !!v || 'Province is required']"
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
                    :rules="[(v) => !!v || 'City/Municipality is required']"
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
                    :rules="[(v) => !!v || 'Barangay is required']"
                    required
                    :disabled="!address.city"
                    clearable
                  />
                </v-col>

                <!-- Address Details (Optional, no validation) -->
                <v-col cols="12" md="6">
                  <v-text-field
                    v-model="address.street"
                    label="Street (Optional)"
                    variant="outlined"
                    density="comfortable"
                    prepend-inner-icon="mdi-road"
                    hide-details
                  />
                </v-col>

                <v-col cols="12" md="6">
                  <v-text-field
                    v-model="address.house_no"
                    label="House/Lot No. (Optional)"
                    variant="outlined"
                    density="comfortable"
                    prepend-inner-icon="mdi-home"
                    hide-details
                  />
                </v-col>

                <!-- Optional Fields (No validation) -->
                <v-col cols="12" md="6">
                  <v-text-field
                    v-model="address.purok"
                    label="Purok/Subdivision (Optional)"
                    variant="outlined"
                    density="comfortable"
                    prepend-inner-icon="mdi-home-group"
                    hide-details
                  />
                </v-col>

                <v-col cols="12" md="6">
                  <v-text-field
                    v-model="address.building"
                    label="Building/Apartment (Optional)"
                    variant="outlined"
                    density="comfortable"
                    prepend-inner-icon="mdi-office-building"
                    hide-details
                  />
                </v-col>

                <!-- Map Section - ALWAYS VISIBLE -->
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
                      !address.recipient_name.trim() ||
                      !address.phone.trim()
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
                <div class="d-flex gap-2">
                  <v-btn
                    color="primary"
                    @click="useCurrentLocation"
                    :loading="isLoadingLocation"
                    variant="tonal"
                    size="large"
                    rounded="lg"
                    class="mb-2"
                    elevation="2"
                  >
                    <v-icon class="me-2">mdi-crosshairs-gps</v-icon>
                    {{ isLoadingLocation ? 'Detecting...' : 'Detect My Location' }}
                  </v-btn>
                  <v-btn
                    @click="refreshLocationMap"
                    size="large"
                    variant="tonal"
                    color="secondary"
                    rounded="lg"
                    class="mb-2"
                    elevation="2"
                    :loading="isRefreshingMap"
                  >
                    <v-icon class="me-2">mdi-refresh</v-icon>
                    Refresh Map
                  </v-btn>
                </div>
                <p v-if="isLoadingLocation" class="text-caption text-medium-emphasis mt-2">
                  <v-progress-circular
                    indeterminate
                    size="16"
                    width="2"
                    class="me-2"
                  ></v-progress-circular>
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
              <div id="location-map" class="map-wrapper rounded-lg elevation-1"></div>
              <p class="text-caption text-medium-emphasis mt-2">
                <v-icon size="small" color="success" class="me-1">mdi-information</v-icon>
                Drag the marker to fine-tune your location
              </p>
            </div>

            <!-- Auto-filled Address Preview -->
            <div class="mb-6">
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
                    :rules="[
                      (v) => !!v || 'Name is required',
                      (v) => (v && v.trim().length >= 2) || 'Name must be at least 2 characters',
                    ]"
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
                    :rules="[
                      (v) => !!v || 'Phone number is required',
                      (v) =>
                        (v && /^[0-9+\-\s()]{7,20}$/.test(v)) ||
                        'Please enter a valid phone number',
                    ]"
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
                        label="Street (Optional)"
                        variant="outlined"
                        density="comfortable"
                        prepend-inner-icon="mdi-road"
                        hide-details
                      />
                    </v-col>
                    <v-col cols="12" md="6">
                      <v-text-field
                        v-model="address.house_no"
                        label="House/Lot No. (Optional)"
                        variant="outlined"
                        density="comfortable"
                        prepend-inner-icon="mdi-home"
                        hide-details
                      />
                    </v-col>
                    <v-col cols="12" md="6">
                      <v-text-field
                        v-model="address.purok"
                        label="Purok/Subdivision (Optional)"
                        variant="outlined"
                        density="comfortable"
                        prepend-inner-icon="mdi-home-group"
                        hide-details
                      />
                    </v-col>
                    <v-col cols="12" md="6">
                      <v-text-field
                        v-model="address.building"
                        label="Building/Apartment (Optional)"
                        variant="outlined"
                        density="comfortable"
                        prepend-inner-icon="mdi-office-building"
                        hide-details
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

              <!-- Submit Button - FIXED CONDITION -->
              <v-btn
                color="success"
                @click="saveAddress"
                :loading="isLoading"
                :disabled="
                  !address.recipient_name.trim() ||
                  !address.phone.trim() ||
                  (!address.region_name &&
                    !address.province_name &&
                    !address.city_name &&
                    !address.barangay_name)
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
const showEditFields = ref(false)

// Loading states for PSGC dropdowns
const loadingRegions = ref(false)
const loadingProvinces = ref(false)
const loadingCities = ref(false)
const loadingBarangays = ref(false)

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
  if (mode === 'manual') {
    // Destroy location map and initialize manual map
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
    // Destroy manual map and initialize location map
    if (manualMap.value) {
      manualMap.value.remove()
      manualMap.value = null
      manualMapInitialized.value = false
    }
    await nextTick()
    setTimeout(() => {
      initializeLocationMap()
    }, 100)
  }
}

// -------------------- PSGC API Functions --------------------
const fetchRegions = async () => {
  loadingRegions.value = true
  try {
    const res = await fetch('https://psgc.cloud/api/regions')
    const data = await res.json()
    regions.value = data.sort((a, b) => a.name.localeCompare(b.name))
  } catch (error) {
    console.error('Failed to fetch regions:', error)
    snackbarMessage.value = 'Error loading regions. Please try again.'
    showSnackbar.value = true
  } finally {
    loadingRegions.value = false
  }
}

const fetchProvinces = async (regionCode: string) => {
  if (!regionCode) {
    provinces.value = []
    return
  }

  loadingProvinces.value = true
  try {
    const res = await fetch(`https://psgc.cloud/api/regions/${regionCode}/provinces`)
    const data = await res.json()
    provinces.value = data.sort((a, b) => a.name.localeCompare(b.name))
  } catch (error) {
    console.error('Failed to fetch provinces:', error)
    snackbarMessage.value = 'Error loading provinces'
    showSnackbar.value = true
  } finally {
    loadingProvinces.value = false
  }
}

const fetchCitiesMunicipalities = async (provinceCode: string) => {
  if (!provinceCode) {
    citiesMunicipalities.value = []
    return
  }

  loadingCities.value = true
  try {
    const res = await fetch(`https://psgc.cloud/api/provinces/${provinceCode}/cities-municipalities`)
    const data = await res.json()
    citiesMunicipalities.value = data.sort((a, b) => a.name.localeCompare(b.name))
  } catch (error) {
    console.error('Failed to fetch cities:', error)
    snackbarMessage.value = 'Error loading cities/municipalities'
    showSnackbar.value = true
  } finally {
    loadingCities.value = false
  }
}

const fetchBarangays = async (cityCode: string) => {
  if (!cityCode) {
    barangays.value = []
    return
  }

  loadingBarangays.value = true
  try {
    const res = await fetch(`https://psgc.cloud/api/cities-municipalities/${cityCode}/barangays`)
    const data = await res.json()
    barangays.value = data.sort((a, b) => a.name.localeCompare(b.name))
  } catch (error) {
    console.error('Failed to fetch barangays:', error)
    snackbarMessage.value = 'Error loading barangays'
    showSnackbar.value = true
  } finally {
    loadingBarangays.value = false
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
      const selectedRegion = regions.value.find((r) => r.code === newRegion)
      if (selectedRegion) {
        address.value.region_name = selectedRegion.name
      }
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
      const selectedProvince = provinces.value.find((p) => p.code === newProvince)
      if (selectedProvince) {
        address.value.province_name = selectedProvince.name
      }
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
    if (selectedCity) {
      address.value.city_name = selectedCity.name
      address.value.postal_code = selectedCity.zip_code || selectedCity.zipCode || selectedCity.postalCode || ''
    }
    if (newCity) {
      await fetchBarangays(newCity)
      await updateManualMap()
    }
  },
)

watch(
  () => address.value.barangay,
  (newBarangay) => {
    if (addressMode.value !== 'manual') return
    
    if (newBarangay) {
      const selectedBarangay = barangays.value.find((b) => b.code === newBarangay)
      if (selectedBarangay) {
        address.value.barangay_name = selectedBarangay.name
      }
      updateManualMap()
    }
  }
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

    // Only assign the data we care about
    address.value.recipient_name = data.recipient_name || ''
    address.value.phone = data.phone || ''
    address.value.street = data.street || ''
    address.value.purok = data.purok || ''
    address.value.building = data.building || ''
    address.value.house_no = data.house_no || ''
    address.value.postal_code = data.postal_code || ''
    address.value.is_default = data.is_default || false
    address.value.region_name = data.region_name || ''
    address.value.province_name = data.province_name || ''
    address.value.city_name = data.city_name || ''
    address.value.barangay_name = data.barangay_name || ''

    isEdit.value = true

    // Only try to match PSGC if we have the names
    if (data.region_name) {
      const selectedRegion = regions.value.find((r) => r.name === data.region_name)
      if (selectedRegion) {
        address.value.region = selectedRegion.code
        await fetchProvinces(selectedRegion.code)
      }
    }

    if (data.province_name) {
      const selectedProvince = provinces.value.find((p) => p.name === data.province_name)
      if (selectedProvince) {
        address.value.province = selectedProvince.code
        await fetchCitiesMunicipalities(selectedProvince.code)
      }
    }

    if (data.city_name) {
      const selectedCity = citiesMunicipalities.value.find((c) => c.name === data.city_name)
      if (selectedCity) {
        address.value.city = selectedCity.code
        await fetchBarangays(selectedCity.code)
      }
    }

    if (data.barangay_name) {
      const selectedBarangay = barangays.value.find((b) => b.name === data.barangay_name)
      if (selectedBarangay) {
        address.value.barangay = selectedBarangay.code
      }
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

// --- Save Address (Only restrict PSGC and name/phone) ---
const saveAddress = async () => {
  try {
    isLoading.value = true

    // ONLY VALIDATE: PSGC data, name, and phone
    if (addressMode.value === 'manual') {
      // Validate PSGC selections (dropdowns only)
      if (
        !address.value.region ||
        !address.value.province ||
        !address.value.city ||
        !address.value.barangay
      ) {
        throw new Error('Please select complete address from PSGC dropdowns')
      }
    } else {
      // Location mode - validate address components
      // FIXED: Don't require all fields, just require at least one address component
      if (
        !address.value.region_name &&
        !address.value.province_name &&
        !address.value.city_name &&
        !address.value.barangay_name
      ) {
        throw new Error('Address is required. Please detect location or enter address details.')
      }
    }

    // Validate name and phone (required fields)
    if (!address.value.recipient_name.trim()) {
      throw new Error('Recipient name is required')
    }

    if (!address.value.phone.trim()) {
      throw new Error('Phone number is required')
    }

    // Optional: Add phone format validation
    const phoneRegex = /^[0-9+\-\s()]{7,20}$/
    if (!phoneRegex.test(address.value.phone)) {
      throw new Error('Please enter a valid phone number (7-20 digits)')
    }

    // Optional: Add name length validation
    if (address.value.recipient_name.trim().length < 2) {
      throw new Error('Recipient name must be at least 2 characters')
    }

    const profileId = await getUserProfileId()

    let addressData: any

    if (addressMode.value === 'manual') {
      // Get names from selected codes
      const regionName = regions.value.find((r) => r.code === address.value.region)?.name || address.value.region_name
      const provinceName = provinces.value.find((p) => p.code === address.value.province)?.name || address.value.province_name
      const cityName = citiesMunicipalities.value.find((c) => c.code === address.value.city)?.name || address.value.city_name
      const barangayName = barangays.value.find((b) => b.code === address.value.barangay)?.name || address.value.barangay_name

      addressData = {
        user_id: profileId,
        recipient_name: address.value.recipient_name.trim(),
        phone: address.value.phone.trim(),
        street: address.value.street || '',
        purok: address.value.purok || '',
        building: address.value.building || '',
        house_no: address.value.house_no || '',
        postal_code: address.value.postal_code || '',
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
        recipient_name: address.value.recipient_name.trim(),
        phone: address.value.phone.trim(),
        street: address.value.street || '',
        purok: address.value.purok || '',
        building: address.value.building || '',
        house_no: address.value.house_no || '',
        postal_code: address.value.postal_code || '',
        is_default: address.value.is_default,
        region_name: address.value.region_name || '',
        province_name: address.value.province_name || '',
        city_name: address.value.city_name || '',
        barangay_name: address.value.barangay_name || '',
        updated_at: new Date().toISOString(),
      }
    }

    // Handle default address setting
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
  const barangayName = barangays.value.find((b) => b.code === address.value.barangay)?.name || address.value.barangay_name || ''
  const cityName = citiesMunicipalities.value.find((c) => c.code === address.value.city)?.name || address.value.city_name || ''
  const provinceName = provinces.value.find((p) => p.code === address.value.province)?.name || address.value.province_name || ''

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

    // Ensure map container is visible
    const mapElement = document.getElementById('location-map')
    if (mapElement) {
      mapElement.style.display = 'block'
      mapElement.style.visibility = 'visible'
      mapElement.style.height = '300px'
    }

    // Request permissions
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
      locationMap.value.resize()

      locationMap.value.flyTo({
        center: [lng, lat],
        zoom: 18,
        duration: 1500,
      })

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

      setTimeout(() => {
        if (locationMap.value) {
          locationMap.value.resize()
        }
      }, 500)
    }

    await reverseGeocodeLocationMode(lat, lng)

    snackbarMessage.value = '📍 Location detected! Address fields filled automatically.'
    showSnackbar.value = true
  } catch (err: any) {
    console.error('Location error:', err)
    snackbarMessage.value = '📍 ' + (err.message || 'Unable to detect location.')
    showSnackbar.value = true
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
  if (mapElement) {
    // Always reinitialize if container exists
    if (manualMap.value) {
      manualMap.value.remove()
      manualMap.value = null
      manualMapInitialized.value = false
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
      // Force resize and redraw
      setTimeout(() => {
        if (manualMap.value) {
          manualMap.value.resize()
          manualMap.value.triggerRepaint()
        }
      }, 100)
    })

    manualMap.value.on('error', (e) => {
      console.error('Manual map error:', e)
      snackbarMessage.value = 'Map loading error. Please refresh the page.'
      showSnackbar.value = true
    })

    // Ensure map is properly sized
    setTimeout(() => {
      if (manualMap.value) {
        manualMap.value.resize()
        manualMap.value.triggerRepaint()
      }
    }, 300)
  }
}

// --- Initialize Location Map ---
const initializeLocationMap = () => {
  const mapElement = document.getElementById('location-map')
  if (mapElement) {
    // Always reinitialize if container exists
    if (locationMap.value) {
      locationMap.value.remove()
      locationMap.value = null
      locationMapInitialized.value = false
    }

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
      // Force resize and redraw
      setTimeout(() => {
        if (locationMap.value) {
          locationMap.value.resize()
          locationMap.value.triggerRepaint()
        }
      }, 100)
    })

    locationMap.value.on('error', (e) => {
      console.error('Location map error:', e)
      snackbarMessage.value = 'Map loading error. Please refresh the page.'
      showSnackbar.value = true
    })

    // Ensure map is properly sized
    setTimeout(() => {
      if (locationMap.value) {
        locationMap.value.resize()
        locationMap.value.triggerRepaint()
      }
    }, 300)
  }
}

// --- Refresh Map Functions ---
const refreshManualMap = async () => {
  isRefreshingMap.value = true
  try {
    // Force reinitialize the map
    if (manualMap.value) {
      manualMap.value.remove()
      manualMap.value = null
      manualMapInitialized.value = false
    }

    await nextTick()

    // Reinitialize map
    initializeManualMap()

    // Wait for map to load
    await new Promise((resolve) => setTimeout(resolve, 500))

    // Update map with current address
    await updateManualMap()

    snackbarMessage.value = 'Manual map refreshed successfully'
    showSnackbar.value = true
  } catch (err) {
    console.error('Error refreshing manual map:', err)
    snackbarMessage.value = 'Error refreshing map'
    showSnackbar.value = true
  } finally {
    isRefreshingMap.value = false
  }
}

const refreshLocationMap = async () => {
  isRefreshingMap.value = true
  try {
    // Force reinitialize the map
    if (locationMap.value) {
      locationMap.value.remove()
      locationMap.value = null
      locationMapInitialized.value = false
    }

    await nextTick()

    // Reinitialize map
    initializeLocationMap()

    // Wait for map to load
    await new Promise((resolve) => setTimeout(resolve, 500))

    snackbarMessage.value = 'Location map refreshed successfully'
    showSnackbar.value = true
  } catch (err) {
    console.error('Error refreshing location map:', err)
    snackbarMessage.value = 'Error refreshing map'
    showSnackbar.value = true
  } finally {
    isRefreshingMap.value = false
  }
}

// --- Update Location Map ---
const updateLocationMap = () => {
  if (!locationMap.value || !locationMarker.value) return

  if (address.value.region_name && address.value.city_name) {
    // Map ready for location mode
  }
}

// --- Lifecycle ---
onMounted(() => {
  loadAddress()
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

  .gap-2 {
    gap: 8px;
  }
}

@media (max-width: 600px) {
  .map-wrapper {
    height: 200px;
  }

  .gap-2 {
    flex-direction: column;
    gap: 12px;
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

.gap-2 {
  display: flex;
  gap: 16px;
}
</style>

<style>
/* Import Material Design Icons */
@import url('https://cdn.jsdelivr.net/npm/@mdi/font@7.4.47/css/materialdesignicons.min.css');
</style>