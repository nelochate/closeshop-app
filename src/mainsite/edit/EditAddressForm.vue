<script setup lang="ts">
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
const addressId = ref(route.params.id || null)

const map = ref<any>(null)
const marker = ref<any>(null)

// PSGC Data
const regions = ref([])
const provinces = ref([])
const citiesMunicipalities = ref([])
const barangays = ref([])

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
})

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
    showMapSnackbar.value = true
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
    showMapSnackbar.value = true
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
    showMapSnackbar.value = true
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
    showMapSnackbar.value = true
  }
}

// --- Watchers for PSGC Cascading ---
watch(
  () => address.value.region,
  async (newRegion) => {
    address.value.province = ''
    address.value.city = ''
    address.value.barangay = ''
    address.value.postal_code = ''
    if (newRegion) await fetchProvinces(newRegion)
  },
)

watch(
  () => address.value.province,
  async (newProvince) => {
    address.value.city = ''
    address.value.barangay = ''
    address.value.postal_code = ''
    if (newProvince) await fetchCitiesMunicipalities(newProvince)
  },
)

watch(
  () => address.value.city,
  async (newCity) => {
    address.value.barangay = ''
    const selectedCity = citiesMunicipalities.value.find((c) => c.code === newCity)
    if (selectedCity?.zip_code) address.value.postal_code = selectedCity.zip_code
    if (newCity) await fetchBarangays(newCity)
  },
)

// --- Load Address for Edit ---
const loadAddress = async () => {
  try {
    const { data: userData, error: userError } = await supabase.auth.getUser()
    if (userError || !userData?.user) return router.push({ name: 'login' })

    await fetchRegions()

    if (!addressId.value) return

    const { data, error } = await supabase
      .from('addresses')
      .select('*')
      .eq('id', addressId.value)
      .eq('user_id', userData.user.id)
      .single()

    if (error || !data) {
      snackbarMessage.value = 'Error loading address'
      showMapSnackbar.value = true
      return
    }

    Object.assign(address.value, data)
    isEdit.value = true

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

    setTimeout(() => updateMap(), 500)
  } catch (err) {
    console.error(err)
    snackbarMessage.value = 'Unexpected error loading address'
    showMapSnackbar.value = true
  }
}

// --- Save Address ---
const saveAddress = async () => {
  try {
    isLoading.value = true
    if (
      !address.value.region ||
      !address.value.province ||
      !address.value.city ||
      !address.value.barangay
    )
      throw new Error('Complete all required address fields')

    const { data: userData, error: userError } = await supabase.auth.getUser()
    if (userError || !userData?.user) throw new Error('User not authenticated')

    // ✅ Get human-readable names for all PSGC fields
    const regionName = regions.value.find((r) => r.code === address.value.region)?.name || ''
    const provinceName = provinces.value.find((p) => p.code === address.value.province)?.name || ''
    const cityName =
      citiesMunicipalities.value.find((c) => c.code === address.value.city)?.name || ''
    const barangayName = barangays.value.find((b) => b.code === address.value.barangay)?.name || ''

    const addressData = {
      user_id: userData.user.id,
      recipient_name: address.value.recipient_name,
      phone: address.value.phone,
      street: address.value.street,
      purok: address.value.purok,
      building: address.value.building,
      house_no: address.value.house_no,
      postal_code: address.value.postal_code,
      is_default: address.value.is_default,
      region_name: regions.value.find((r) => r.code === address.value.region)?.name || '',
      province_name: provinces.value.find((p) => p.code === address.value.province)?.name || '',
      city_name: citiesMunicipalities.value.find((c) => c.code === address.value.city)?.name || '',
      barangay_name: barangays.value.find((b) => b.code === address.value.barangay)?.name || '',
      updated_at: new Date().toISOString(),
      created_at: isEdit.value ? undefined : new Date().toISOString(),
    }

    // Default address logic
    if (address.value.is_default) {
      await supabase
        .from('addresses')
        .update({ is_default: false })
        .eq('user_id', userData.user.id)
        .neq('id', addressId.value || '')
    }

    let result
    if (isEdit.value && addressId.value) {
      result = await supabase
        .from('addresses')
        .update(addressData)
        .eq('id', addressId.value)
        .eq('user_id', userData.user.id)
    } else {
      result = await supabase
        .from('addresses')
        .insert([
          { ...addressData, user_id: userData.user.id, created_at: new Date().toISOString() },
        ])
    }

    if (result.error) throw new Error(result.error.message)

    successMessage.value = isEdit.value
      ? 'Address updated successfully!'
      : 'Address added successfully!'
    showSuccess.value = true

    setTimeout(() => router.replace({ name: 'my-address', query: { refreshed: Date.now() } }), 1500)
  } catch (err: any) {
    console.error(err)
    successMessage.value = 'Error: ' + (err.message || 'Failed to save address')
    showSuccess.value = true
  } finally {
    isLoading.value = false
  }
}

// --- Update Map ---
const updateMap = async () => {
  if (!map.value) return
  const house = address.value.house_no || ''
  const street = address.value.street || ''
  const purok = address.value.purok || ''
  const barangayName = barangays.value.find((b) => b.code === address.value.barangay)?.name || ''
  const cityName = citiesMunicipalities.value.find((c) => c.code === address.value.city)?.name || ''
  const provinceName = provinces.value.find((p) => p.code === address.value.province)?.name || ''

  if (!barangayName && !street && !cityName) {
    map.value.setView([12.8797, 121.774], 6)
    if (marker.value) {
      map.value.removeLayer(marker.value)
      marker.value = null
    }
    return
  }

  const query =
    `${house} ${street} ${purok} ${barangayName}, ${cityName}, ${provinceName}, Philippines`.trim()

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
  } catch (err) {
    console.error(err)
    snackbarMessage.value = 'Map update failed: ' + err.message
    showMapSnackbar.value = true
  }
}

// --- Current Location ---
const useCurrentLocation = async () => {
  try {
    snackbarMessage.value = 'Detecting your precise location...'
    showMapSnackbar.value = true
    isLoading.value = true

    const permissions = await Geolocation.checkPermissions()
    if (permissions.location !== 'granted') {
      const request = await Geolocation.requestPermissions()
      if (request.location !== 'granted') throw new Error('Location permission denied.')
    }

    const coords = await Geolocation.getCurrentPosition({ enableHighAccuracy: true })
    const lat = coords.coords.latitude
    const lng = coords.coords.longitude

    map.value.setView([lat, lng], 18)
    if (marker.value) marker.value.setLatLng([lat, lng])
    else marker.value = L.marker([lat, lng]).addTo(map.value)

    const res = await fetch(`http://localhost:3000/api/reverse-geocode?lat=${lat}&lon=${lng}`)
    const result = await res.json()
    if (result.address) {
      const addr = result.address
      address.value.house_no = addr.house_number || ''
      address.value.building = addr.building || addr.specific_place || ''
      address.value.street = addr.road || ''
      address.value.purok = addr.purok || ''
      address.value.postal_code = addr.postcode || ''
      snackbarMessage.value = '📍 Location detected! Please complete remaining details.'
    }
    showMapSnackbar.value = true
  } catch (err: any) {
    console.error(err)
    snackbarMessage.value = '📍 ' + (err.message || 'Unable to detect location.')
    showMapSnackbar.value = true
  } finally {
    isLoading.value = false
  }
}

// --- Lifecycle ---
onMounted(() => {
  const mapElement = document.getElementById('map')
  if (mapElement) {
    map.value = L.map('map').setView([12.8797, 121.774], 6)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
    }).addTo(map.value)
  }
  loadAddress()
})

// --- Watch for address changes ---
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
      if (addressMode.value === 'manual') updateMap()
    }, 1000)
  },
)

watch(addressMode, (mode) => {
  if (mode === 'location' && map.value) {
    map.value.setView([12.8797, 121.774], 6)
    if (marker.value) {
      map.value.removeLayer(marker.value)
      marker.value = null
    }
  }
})
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
                <v-col cols="12">
                  <v-text-field
                    v-model="address.recipient_name"
                    label="Recipient Name"
                    variant="outlined"
                  />
                </v-col>
                <v-col cols="12">
                  <v-text-field v-model="address.phone" label="Phone Number" variant="outlined" />
                </v-col>

                <!-- PSGC Address Fields -->
                <v-col cols="12">
                  <v-select
                    v-model="address.region"
                    :items="regions"
                    item-title="name"
                    item-value="code"
                    label="Region *"
                    variant="outlined"
                    required
                  />
                </v-col>

                <v-col cols="12">
                  <v-select
                    v-model="address.province"
                    :items="provinces"
                    item-title="name"
                    item-value="code"
                    label="Province *"
                    variant="outlined"
                    required
                    :disabled="!address.region"
                  />
                </v-col>

                <v-col cols="12">
                  <v-select
                    v-model="address.city"
                    :items="citiesMunicipalities"
                    item-title="name"
                    item-value="code"
                    label="City/Municipality *"
                    variant="outlined"
                    required
                    :disabled="!address.province"
                  />
                </v-col>

                <v-col cols="12">
                  <v-select
                    v-model="address.barangay"
                    :items="barangays"
                    item-title="name"
                    item-value="code"
                    label="Barangay *"
                    variant="outlined"
                    required
                    :disabled="!address.city"
                  />
                </v-col>

                <v-col cols="12">
                  <v-text-field
                    v-model="address.purok"
                    label="Purok/Subdivision"
                    variant="outlined"
                  />
                </v-col>

                <v-col cols="12">
                  <v-text-field v-model="address.street" label="Street" variant="outlined" />
                </v-col>

                <v-col cols="12">
                  <v-text-field
                    v-model="address.building"
                    label="Building/Apartment"
                    variant="outlined"
                  />
                </v-col>

                <v-col cols="12">
                  <v-text-field
                    v-model="address.house_no"
                    label="House/Lot No."
                    variant="outlined"
                  />
                </v-col>

                <v-col cols="12">
                  <v-text-field
                    v-model="address.postal_code"
                    label="Postal Code"
                    variant="outlined"
                    readonly
                  />
                </v-col>

                <v-col cols="12">
                  <v-checkbox
                    v-model="address.is_default"
                    label="Set as default address"
                    color="primary"
                  />
                </v-col>

                <v-col cols="12">
                  <div id="map" class="map-wrapper"></div>
                  <p class="text-caption mt-2 text-grey">
                    Map will update automatically as you fill in address details
                  </p>
                </v-col>

                <v-col cols="12" class="text-right">
                  <v-btn
                    type="submit"
                    color="primary"
                    size="large"
                    :loading="isLoading"
                    :disabled="
                      !address.region || !address.province || !address.city || !address.barangay
                    "
                  >
                    <v-icon class="me-2">mdi-check</v-icon>
                    {{ isLoading ? 'Saving...' : isEdit ? 'Update Address' : 'Save Address' }}
                  </v-btn>
                </v-col>
              </v-row>
            </v-form>
          </v-card-text>
        </v-card>

        <v-card v-else class="mt-4">
          <v-card-title>Use My Current Location</v-card-title>
          <v-card-text>
            <v-btn
              color="primary"
              @click="useCurrentLocation"
              :loading="isLoading"
              variant="outlined"
            >
              <v-icon class="me-2">mdi-crosshairs-gps</v-icon>
              Detect My Location
            </v-btn>

            <v-row class="mt-4">
              <v-col cols="12">
                <v-text-field
                  v-model="address.recipient_name"
                  label="Recipient Name"
                  variant="outlined"
                />
              </v-col>
              <v-col cols="12">
                <v-text-field v-model="address.phone" label="Phone Number" variant="outlined" />
              </v-col>

              <!-- PSGC Fields for Location Mode -->
              <v-col cols="12">
                <v-select
                  v-model="address.region"
                  :items="regions"
                  item-title="name"
                  item-value="code"
                  label="Region *"
                  variant="outlined"
                  required
                />
              </v-col>

              <v-col cols="12">
                <v-select
                  v-model="address.province"
                  :items="provinces"
                  item-title="name"
                  item-value="code"
                  label="Province *"
                  variant="outlined"
                  required
                  :disabled="!address.region"
                />
              </v-col>

              <v-col cols="12">
                <v-select
                  v-model="address.city"
                  :items="citiesMunicipalities"
                  item-title="name"
                  item-value="code"
                  label="City/Municipality *"
                  variant="outlined"
                  required
                  :disabled="!address.province"
                />
              </v-col>

              <v-col cols="12">
                <v-select
                  v-model="address.barangay"
                  :items="barangays"
                  item-title="name"
                  item-value="code"
                  label="Barangay *"
                  variant="outlined"
                  required
                  :disabled="!address.city"
                />
              </v-col>

              <v-col cols="12">
                <v-text-field v-model="address.street" label="Street" variant="outlined" />
              </v-col>

              <v-col cols="12">
                <v-text-field
                  v-model="address.postal_code"
                  label="Postal Code"
                  variant="outlined"
                  readonly
                />
              </v-col>
            </v-row>

            <v-col cols="12" class="mt-4">
              <div id="map" class="map-wrapper"></div>
              <p class="text-caption mt-2 text-grey">Your detected location will appear here</p>
            </v-col>

            <v-col cols="12">
              <v-checkbox
                v-model="address.is_default"
                label="Set as default address"
                color="primary"
              />
            </v-col>

            <v-btn
              block
              color="primary"
              class="mt-4"
              @click="saveAddress"
              :loading="isLoading"
              :disabled="!address.region || !address.province || !address.city || !address.barangay"
              size="large"
            >
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

:deep(.leaflet-container) {
  border-radius: 12px;
}

:deep(.leaflet-container:fullscreen) {
  width: 100vw;
  height: 100vh;
  border-radius: 0;
}
</style>
