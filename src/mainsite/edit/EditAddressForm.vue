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

const map = ref(null)
const marker = ref(null)

// PSGC Data
const regions = ref([])
const provinces = ref([])
const citiesMunicipalities = ref([])
const barangays = ref([])

const address = ref({
  region: '',
  province: '',
  city: '',
  recipient_name: '',
  phone: '',
  purok: '',
  barangay: '',
  building: '',
  street: '',
  house_no: '',
  postal_code: '',
  is_default: false,
})

// --- PSGC API Functions ---
const fetchRegions = async () => {
  try {
    const res = await fetch('https://psgc.gitlab.io/api/regions')
    if (!res.ok) throw new Error('Failed to fetch regions')
    regions.value = await res.json()
  } catch (err) {
    console.error(err)
    snackbarMessage.value = 'Error loading regions'
    showMapSnackbar.value = true
  }
}

const fetchProvinces = async (regionCode: string = '') => {
  try {
    const res = await fetch('https://psgc.gitlab.io/api/provinces')
    if (!res.ok) throw new Error('Failed to fetch provinces')
    let data = await res.json()
    provinces.value = regionCode
      ? data.filter((p: any) => p.code.startsWith(regionCode.substring(0, 2)))
      : data
  } catch (err) {
    console.error(err)
    snackbarMessage.value = 'Error loading provinces'
    showMapSnackbar.value = true
  }
}

const fetchCitiesMunicipalities = async (provinceCode: string = '') => {
  try {
    const [citiesRes, munisRes] = await Promise.all([
      fetch('https://psgc.gitlab.io/api/cities'),
      fetch('https://psgc.gitlab.io/api/municipalities')
    ])
    if (!citiesRes.ok || !munisRes.ok) throw new Error('Failed to fetch cities/municipalities')
    let cities = await citiesRes.json()
    let municipalities = await munisRes.json()

    let all = [...cities, ...municipalities]

    citiesMunicipalities.value = provinceCode
      ? all.filter((c: any) => c.code.startsWith(provinceCode.substring(0, 4)))
      : all

    citiesMunicipalities.value.sort((a: any, b: any) => a.name.localeCompare(b.name))
  } catch (err) {
    console.error(err)
    snackbarMessage.value = 'Error loading cities/municipalities'
    showMapSnackbar.value = true
  }
}

const fetchBarangays = async (cityCode: string = '') => {
  try {
    const res = await fetch('https://psgc.gitlab.io/api/barangays')
    if (!res.ok) throw new Error('Failed to fetch barangays')
    let data = await res.json()
    barangays.value = cityCode
      ? data.filter((b: any) => b.code.startsWith(cityCode.substring(0, 6)))
      : data
  } catch (err) {
    console.error(err)
    snackbarMessage.value = 'Error loading barangays'
    showMapSnackbar.value = true
  }
}


// --- Watchers for PSGC Data ---
watch(() => address.value.region, async (newRegionCode) => {
  if (newRegionCode) {
    address.value.province = ''
    address.value.city = ''
    address.value.barangay = ''
    address.value.postal_code = ''
    await fetchProvinces(newRegionCode)
  }
})

watch(() => address.value.province, async (newProvinceCode) => {
  if (newProvinceCode) {
    address.value.city = ''
    address.value.barangay = ''
    address.value.postal_code = ''
    await fetchCitiesMunicipalities(newProvinceCode)
  }
})

watch(() => address.value.city, async (newCityCode) => {
  if (newCityCode) {
    address.value.barangay = ''

    // Set postal code from selected city/municipality
    const selectedCity = citiesMunicipalities.value.find(city => city.code === newCityCode)
    if (selectedCity && selectedCity.zip_code) {
      address.value.postal_code = selectedCity.zip_code
    }

    await fetchBarangays(newCityCode)
  }
})

// --- Load address if editing ---
const loadAddress = async () => {
  try {
    const { data: userData, error: userError } = await supabase.auth.getUser()
    if (userError || !userData?.user) {
      console.error('User not authenticated:', userError)
      return router.push({ name: 'login' })
    }

    // Load PSGC data first
    await fetchRegions()

    if (addressId.value) {
      const { data, error } = await supabase
        .from('addresses')
        .select('*')
        .eq('id', addressId.value)
        .eq('user_id', userData.user.id)
        .single()

      if (error) {
        console.error('Load address error:', error)
        snackbarMessage.value = 'Error loading address'
        showMapSnackbar.value = true
        return
      }

      if (data) {
        // Load address data and cascade PSGC data loading
        Object.keys(address.value).forEach(key => {
          if (data[key] !== undefined) {
            address.value[key] = data[key]
          }
        })
        isEdit.value = true

        // Cascade loading of PSGC data based on saved address
        if (data.region) {
          await fetchProvinces(data.region)
          if (data.province) {
            await fetchCitiesMunicipalities(data.province)
            if (data.city) {
              await fetchBarangays(data.city)
            }
          }
        }

        // Update map after a short delay to ensure DOM is ready
        setTimeout(() => updateMap(), 500)
      }
    }
  } catch (error) {
    console.error('Unexpected error in loadAddress:', error)
    snackbarMessage.value = 'Unexpected error loading address'
    showMapSnackbar.value = true
  }
}

// --- Save address ---
const saveAddress = async () => {
  try {
    isLoading.value = true

    // Validate required fields
    if (!address.value.region || !address.value.province || !address.value.city || !address.value.barangay) {
      throw new Error('Please complete all address fields (Region, Province, City/Municipality, Barangay)')
    }

    const { data: userData, error: userError } = await supabase.auth.getUser()
    if (userError || !userData?.user) {
      throw new Error('User not authenticated')
    }

    // Get display names for selected codes
    const regionName = regions.value.find(r => r.code === address.value.region)?.name || ''
    const provinceName = provinces.value.find(p => p.code === address.value.province)?.name || ''
    const cityName = citiesMunicipalities.value.find(c => c.code === address.value.city)?.name || ''
    const barangayName = barangays.value.find(b => b.code === address.value.barangay)?.name || ''

    // Prepare address data
    const addressData = {
      recipient_name: address.value.recipient_name || null,
      phone: address.value.phone || null,
      street: address.value.street || null,
      building: address.value.building || null,
      house_no: address.value.house_no || null,
      purok: address.value.purok || null,
      region: address.value.region,
      region_name: regionName,
      province: address.value.province,
      province_name: provinceName,
      city: address.value.city,
      city_name: cityName,
      barangay: address.value.barangay,
      barangay_name: barangayName,
      postal_code: address.value.postal_code || '',
      is_default: address.value.is_default || false,
      updated_at: new Date().toISOString(),
    }

    // Handle default address logic
    if (address.value.is_default) {
      const { error: updateError } = await supabase
        .from('addresses')
        .update({ is_default: false })
        .eq('user_id', userData.user.id)
        .neq('id', addressId.value || '00000000-0000-0000-0000-000000000000')

      if (updateError) {
        console.error('Error updating default addresses:', updateError)
      }
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
        .insert([{
          ...addressData,
          user_id: userData.user.id,
          created_at: new Date().toISOString(),
        }])
    }

    if (result.error) {
      throw new Error(result.error.message || 'Failed to save address')
    }

    successMessage.value = isEdit.value ? 'Address updated successfully!' : 'Address added successfully!'
    showSuccess.value = true

    setTimeout(() => {
      router.replace({ name: 'my-address', query: { refreshed: Date.now() } })
    }, 1500)

  } catch (error) {
    console.error('Save address error:', error)
    successMessage.value = 'Error: ' + (error.message || 'Failed to save address')
    showSuccess.value = true
  } finally {
    isLoading.value = false
  }
}

// --- Update Map ---
const updateMap = async () => {
  if (!map.value) {
    console.warn('Map not initialized')
    return
  }

  const house = address.value.house_no || ''
  const street = address.value.street || ''
  const purok = address.value.purok || ''
  const barangayName = barangays.value.find(b => b.code === address.value.barangay)?.name || ''
  const cityName = citiesMunicipalities.value.find(c => c.code === address.value.city)?.name || ''
  const provinceName = provinces.value.find(p => p.code === address.value.province)?.name || ''

  if (!barangayName && !street && !cityName) {
    map.value.setView([12.8797, 121.7740], 6) // Default Philippines view
    if (marker.value) {
      map.value.removeLayer(marker.value)
      marker.value = null
    }
    return
  }

  const query = `${house} ${street} ${purok} ${barangayName}, ${cityName}, ${provinceName}, Philippines`.trim()

  try {
    const res = await fetch(`http://localhost:3000/api/geocode?q=${encodeURIComponent(query)}`)

    if (!res.ok) {
      throw new Error(`HTTP error! status: ${res.status}`)
    }

    const results = await res.json()

    if (results.error) {
      throw new Error(results.error)
    }

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
    } else {
      console.warn('No results found for query:', query)
    }
  } catch (error) {
    console.error('Error updating map:', error)
    snackbarMessage.value = 'Map update failed: ' + error.message
    showMapSnackbar.value = true
  }
}

// --- Current Location Detection ---
const useCurrentLocation = async () => {
  try {
    snackbarMessage.value = 'Detecting your precise location...'
    showMapSnackbar.value = true
    isLoading.value = true

    const permissions = await Geolocation.checkPermissions()
    if (permissions.location !== 'granted') {
      const request = await Geolocation.requestPermissions()
      if (request.location !== 'granted') {
        throw new Error('Location permission denied. Please enable location services.')
      }
    }

    const coords = await Geolocation.getCurrentPosition({
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 0
    })

    const lat = coords.coords.latitude
    const lng = coords.coords.longitude

    map.value.setView([lat, lng], 18)
    if (marker.value) {
      marker.value.setLatLng([lat, lng])
    } else {
      marker.value = L.marker([lat, lng]).addTo(map.value)
    }

    try {
      const res = await fetch(`http://localhost:3000/api/reverse-geocode?lat=${lat}&lon=${lng}`)

      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`)
      }

      const result = await res.json()

      if (result.error) {
        throw new Error(result.error)
      }

      if (result.address) {
        const addr = result.address

        // Reset address fields
        address.value.recipient_name = ''
        address.value.phone = ''
        address.value.house_no = addr.house_number || ''
        address.value.building = addr.building || addr.specific_place || ''
        address.value.street = addr.road || ''
        address.value.purok = addr.purok || ''

        // Note: For PSGC integration, you would need to map the reverse geocoded results
        // to PSGC codes. This is complex and might require additional API calls.
        // For now, we'll set the names and clear the codes
        address.value.barangay = '' // Clear code, user will need to select
        address.value.city = '' // Clear code, user will need to select
        address.value.province = '' // Clear code, user will need to select
        address.value.region = '' // Clear code, user will need to select
        address.value.postal_code = addr.postcode || ''

        snackbarMessage.value = '📍 Location detected! Please complete the address details below.'

      } else {
        snackbarMessage.value = '📍 Location detected but detailed address not found'
      }
    } catch (geocodeError) {
      console.error('Reverse geocoding error:', geocodeError)
      snackbarMessage.value = '📍 Location detected but address lookup failed. Please fill address manually.'
    }

    showMapSnackbar.value = true
  } catch (error) {
    console.error('Location detection error:', error)

    if (error.message.includes('permission')) {
      snackbarMessage.value = '📍 Location access denied. Please enable location permissions.'
    } else if (error.message.includes('timeout')) {
      snackbarMessage.value = '📍 Location detection timeout. Please try again.'
    } else {
      snackbarMessage.value = '📍 Unable to detect location: ' + (error.message || 'Please try again')
    }

    showMapSnackbar.value = true
  } finally {
    isLoading.value = false
  }
}

// --- Lifecycle & Watchers ---
onMounted(() => {
  try {
    const mapElement = document.getElementById('map')
    if (mapElement) {
      map.value = L.map('map').setView([12.8797, 121.7740], 6) // Philippines view
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
      }).addTo(map.value)
      console.log('Map initialized successfully')
    } else {
      console.error('Map element not found')
    }
  } catch (mapError) {
    console.error('Error initializing map:', mapError)
  }

  loadAddress()
})

// Watch for address changes with debounce
let updateMapTimeout
watch(
  () => [
    address.value.street,
    address.value.barangay,
    address.value.house_no,
    address.value.purok,
    address.value.city,
    address.value.province
  ],
  () => {
    if (updateMapTimeout) clearTimeout(updateMapTimeout)
    updateMapTimeout = setTimeout(() => {
      if (addressMode.value === 'manual') {
        updateMap()
      }
    }, 1000)
  }
)

watch(addressMode, (newMode) => {
  if (newMode === 'location') {
    if (map.value) {
      map.value.setView([12.8797, 121.7740], 6)
      if (marker.value) {
        map.value.removeLayer(marker.value)
        marker.value = null
      }
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
                    :loading="!regions.length"
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
                    :loading="provinces.length === 0 && address.region"
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
                    :loading="citiesMunicipalities.length === 0 && address.province"
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
                    :loading="barangays.length === 0 && address.city"
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
