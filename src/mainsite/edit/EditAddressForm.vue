<script setup lang="ts">
import { ref, onMounted, watch, nextTick } from 'vue'
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

// Separate maps for each mode
const manualMap = ref<any>(null)
const locationMap = ref<any>(null)
const manualMarker = ref<any>(null)
const locationMarker = ref<any>(null)
const fullscreenControl = ref<any>(null)

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

// --- Custom Fullscreen Control ---
const createFullscreenControl = () => {
  const FullscreenControl = L.Control.extend({
    options: {
      position: 'topright',
    },
    onAdd: function () {
      const container = L.DomUtil.create('div', 'leaflet-bar leaflet-control')
      const button = L.DomUtil.create('a', 'leaflet-control-fullscreen', container)
      button.innerHTML = '⛶'
      button.href = '#'
      button.title = 'Toggle fullscreen'

      L.DomEvent.on(button, 'click', L.DomEvent.stopPropagation)
      L.DomEvent.on(button, 'click', L.DomEvent.preventDefault)
      L.DomEvent.on(button, 'click', this.toggleFullscreen, this)

      return container
    },
    toggleFullscreen: function () {
      const mapContainer = this._map.getContainer()
      if (!document.fullscreenElement) {
        if (mapContainer.requestFullscreen) {
          mapContainer.requestFullscreen()
        } else if ((mapContainer as any).webkitRequestFullscreen) {
          ;(mapContainer as any).webkitRequestFullscreen()
        } else if ((mapContainer as any).msRequestFullscreen) {
          ;(mapContainer as any).msRequestFullscreen()
        }
      } else {
        if (document.exitFullscreen) {
          document.exitFullscreen()
        } else if ((document as any).webkitExitFullscreen) {
          ;(document as any).webkitExitFullscreen()
        } else if ((document as any).msExitFullscreen) {
          ;(document as any).msExitFullscreen()
        }
      }
    },
  })

  return new FullscreenControl()
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

// --- Progressive Zoom Logic ---
const updateMapZoom = (map: any) => {
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
    // Only run for manual mode
    if (addressMode.value !== 'manual') return

    address.value.province = ''
    address.value.city = ''
    address.value.barangay = ''
    address.value.postal_code = ''
    if (newRegion) {
      await fetchProvinces(newRegion)
      if (manualMap.value) {
        const zoomLevel = updateMapZoom(manualMap.value)
        manualMap.value.setZoom(zoomLevel)
      }
    }
  },
)

watch(
  () => address.value.province,
  async (newProvince) => {
    // Only run for manual mode
    if (addressMode.value !== 'manual') return

    address.value.city = ''
    address.value.barangay = ''
    address.value.postal_code = ''
    if (newProvince) {
      await fetchCitiesMunicipalities(newProvince)
      if (manualMap.value) {
        const zoomLevel = updateMapZoom(manualMap.value)
        manualMap.value.setZoom(zoomLevel)
      }
    }
  },
)

watch(
  () => address.value.city,
  async (newCity) => {
    // Only run for manual mode
    if (addressMode.value !== 'manual') return

    address.value.barangay = ''
    const selectedCity = citiesMunicipalities.value.find((c) => c.code === newCity)
    if (selectedCity?.zip_code) address.value.postal_code = selectedCity.zip_code
    if (newCity) {
      await fetchBarangays(newCity)
      if (manualMap.value) {
        const zoomLevel = updateMapZoom(manualMap.value)
        manualMap.value.setZoom(zoomLevel)
      }
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

    setTimeout(() => updateManualMap(), 500)
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

    // Validation differs based on mode
    if (addressMode.value === 'manual') {
      if (
        !address.value.region ||
        !address.value.province ||
        !address.value.city ||
        !address.value.barangay
      )
        throw new Error('Complete all required address fields')
    } else {
      // For location mode, validate the text fields
      if (
        !address.value.region_name ||
        !address.value.province_name ||
        !address.value.city_name ||
        !address.value.barangay_name
      )
        throw new Error('Complete all required address fields')
    }

    const profileId = await getUserProfileId()

    let addressData: any

    if (addressMode.value === 'manual') {
      // Manual mode - use PSGC data
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
      // Location mode - use directly filled text fields
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
    successMessage.value = 'Error: ' + (err.message || 'Failed to save address')
    showSuccess.value = true
  } finally {
    isLoading.value = false
  }
}

// --- Update Map for Manual Input Mode ---
const updateManualMap = async () => {
  // Only run for manual mode
  if (addressMode.value !== 'manual') return

  if (!manualMap.value) return
  const house = address.value.house_no || ''
  const street = address.value.street || ''
  const purok = address.value.purok || ''
  const barangayName = barangays.value.find((b) => b.code === address.value.barangay)?.name || ''
  const cityName = citiesMunicipalities.value.find((c) => c.code === address.value.city)?.name || ''
  const provinceName = provinces.value.find((p) => p.code === address.value.province)?.name || ''

  if (!barangayName && !street && !cityName) {
    manualMap.value.setView([12.8797, 121.774], 6)
    if (manualMarker.value) {
      manualMap.value.removeLayer(manualMarker.value)
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

      manualMap.value.setView([latNum, lonNum], zoomLevel)

      if (manualMarker.value) {
        manualMarker.value.setLatLng([latNum, lonNum])
      } else {
        manualMarker.value = L.marker([latNum, lonNum], {
          draggable: true,
          autoPan: true,
        }).addTo(manualMap.value)

        manualMarker.value.on('dragend', function (event: any) {
          const marker = event.target
          const position = marker.getLatLng()
          reverseGeocode(position.lat, position.lng)
        })
      }
    }
  } catch (err: any) {
    console.error(err)
    snackbarMessage.value = 'Map update failed: ' + (err.message || 'Geocoding service error')
    showMapSnackbar.value = true
  }
}

// --- Reverse Geocoding for Dragged Marker ---
const reverseGeocode = async (lat: number, lng: number) => {
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
      showMapSnackbar.value = true
    }
  } catch (err) {
    console.error('Reverse geocoding failed:', err)
    snackbarMessage.value = 'Unable to get address details for this location'
    showMapSnackbar.value = true
  }
}

// --- Current Location Functions (Independent from Manual Mode) ---
const useCurrentLocation = async () => {
  try {
    snackbarMessage.value = 'Detecting your precise location and address...'
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

    // Ensure location map is properly initialized
    if (!locationMap.value) {
      initializeLocationMap()
    }

    // Set map view and marker with smooth animation
    locationMap.value.setView([lat, lng], 18, {
      animate: true,
      duration: 1,
    })

    if (locationMarker.value) {
      locationMarker.value.setLatLng([lat, lng])
    } else {
      locationMarker.value = L.marker([lat, lng], {
        draggable: true,
        autoPan: true,
      }).addTo(locationMap.value)

      locationMarker.value.on('dragend', function (event: any) {
        const marker = event.target
        const position = marker.getLatLng()
        reverseGeocodeLocationMode(position.lat, position.lng)
      })
    }

    // Use location mode specific reverse geocoding
    await reverseGeocodeLocationMode(lat, lng)

    snackbarMessage.value =
      '📍 Location detected! Address fields filled automatically and shown on map.'
    showMapSnackbar.value = true
  } catch (err: any) {
    console.error(err)
    snackbarMessage.value = '📍 ' + (err.message || 'Unable to detect location.')
    showMapSnackbar.value = true
  } finally {
    isLoading.value = false
  }
}

// --- Reverse Geocoding for Location Mode (Independent) ---
const reverseGeocodeLocationMode = async (lat: number, lng: number) => {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`,
    )
    const result = await res.json()

    console.log('Location mode geocoding result:', result)

    if (result.address) {
      const addr = result.address

      // Fill all address fields from reverse geocoding for location mode
      address.value.house_no = addr.house_number || ''
      address.value.building = addr.building || addr.specific_place || ''
      address.value.street = addr.road || ''
      address.value.purok = addr.purok || addr.neighbourhood || addr.suburb || ''
      address.value.postal_code = addr.postcode || ''

      // Fill location-based address fields (not using PSGC dropdowns)
      address.value.region_name = addr.state || addr.region || ''
      address.value.province_name = addr.state_district || addr.province || ''
      address.value.city_name = addr.city || addr.town || addr.municipality || ''
      address.value.barangay_name = addr.village || addr.neighbourhood || addr.suburb || ''

      console.log('All address fields filled for location mode')
    }
  } catch (err) {
    console.error('Location mode reverse geocoding failed:', err)
    snackbarMessage.value = 'Unable to get address details for this location'
    showMapSnackbar.value = true
  }
}

// --- Initialize Manual Map ---
const initializeManualMap = () => {
  const mapElement = document.getElementById('manual-map')
  if (mapElement && !manualMap.value) {
    manualMap.value = L.map('manual-map').setView([12.8797, 121.774], 6)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
    }).addTo(manualMap.value)

    const fullscreenControl = createFullscreenControl()
    manualMap.value.addControl(fullscreenControl)

    manualMap.value.on('click', function (e: any) {
      const { lat, lng } = e.latlng

      if (manualMarker.value) {
        manualMarker.value.setLatLng([lat, lng])
      } else {
        manualMarker.value = L.marker([lat, lng], {
          draggable: true,
          autoPan: true,
        }).addTo(manualMap.value)

        manualMarker.value.on('dragend', function (event: any) {
          const marker = event.target
          const position = marker.getLatLng()
          reverseGeocode(position.lat, position.lng)
        })
      }

      reverseGeocode(lat, lng)
    })
  }
}

// --- Initialize Location Map ---
const initializeLocationMap = () => {
  const mapElement = document.getElementById('location-map')
  if (mapElement && !locationMap.value) {
    locationMap.value = L.map('location-map').setView([12.8797, 121.774], 6)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
    }).addTo(locationMap.value)

    const fullscreenControl = createFullscreenControl()
    locationMap.value.addControl(fullscreenControl)

    locationMap.value.on('click', function (e: any) {
      const { lat, lng } = e.latlng

      if (locationMarker.value) {
        locationMarker.value.setLatLng([lat, lng])
      } else {
        locationMarker.value = L.marker([lat, lng], {
          draggable: true,
          autoPan: true,
        }).addTo(locationMap.value)

        locationMarker.value.on('dragend', function (event: any) {
          const marker = event.target
          const position = marker.getLatLng()
          reverseGeocodeLocationMode(position.lat, position.lng)
        })
      }

      reverseGeocodeLocationMode(lat, lng)
    })
  }
}

// --- Lifecycle ---
onMounted(() => {
  // Initialize both maps
  initializeManualMap()
  initializeLocationMap()
  loadAddress()
})

// --- Watch for address changes (Manual Mode Only) ---
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
    }, 1000)
  },
)

// --- Watch for mode changes ---
watch(addressMode, async (mode) => {
  // Use nextTick to ensure DOM is updated
  await nextTick()
  
  if (mode === 'location') {
    // Reset location map view
    if (locationMap.value) {
      locationMap.value.setView([12.8797, 121.774], 6)
      if (locationMarker.value) {
        locationMap.value.removeLayer(locationMarker.value)
        locationMarker.value = null
      }
    }
    // Clear address fields when switching to location mode
    address.value.region = ''
    address.value.province = ''
    address.value.city = ''
    address.value.barangay = ''
    address.value.street = ''
    address.value.purok = ''
    address.value.building = ''
    address.value.house_no = ''
    address.value.postal_code = ''
    address.value.region_name = ''
    address.value.province_name = ''
    address.value.city_name = ''
    address.value.barangay_name = ''
  } else if (mode === 'manual') {
    // Reset manual map view
    if (manualMap.value) {
      manualMap.value.setView([12.8797, 121.774], 6)
      if (manualMarker.value) {
        manualMap.value.removeLayer(manualMarker.value)
        manualMarker.value = null
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
              <v-radio label="Manual Input (PSGC Cloud API)" value="manual" />
              <v-radio label="Use My Current Location" value="location" />
            </v-radio-group>
            <p class="text-caption text-grey mt-2" v-if="addressMode === 'manual'">
              Fill address details manually using official PSGC data for accurate location mapping.
            </p>
            <p class="text-caption text-grey mt-2" v-if="addressMode === 'location'">
              Detect your current location to automatically fill all address fields using
              location-based detection.
            </p>
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
                    maxlength="100"
                  />
                </v-col>
                <v-col cols="12">
                  <v-text-field
                    v-model="address.phone"
                    label="Phone Number"
                    variant="outlined"
                    maxlength="20"
                  />
                </v-col>

                <!-- PSGC Address Fields (USING PSGC CLOUD API) -->
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
                    maxlength="20"
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
                  <div id="manual-map" class="map-wrapper"></div>
                  <p class="text-caption mt-2 text-grey">
                    📍 Map automatically updates and zooms as you fill PSGC address fields.
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
              block
              size="large"
            >
              <v-icon class="me-2">mdi-crosshairs-gps</v-icon>
              {{ isLoading ? 'Detecting Location...' : 'Detect My Current Location' }}
            </v-btn>

            <p class="text-caption text-grey mt-2">
              Click the button above to detect your location and automatically fill all address
              fields. Your location will be shown on the map below.
            </p>

            <v-row class="mt-4">
              <v-col cols="12">
                <v-text-field
                  v-model="address.recipient_name"
                  label="Recipient Name"
                  variant="outlined"
                  maxlength="100"
                />
              </v-col>
              <v-col cols="12">
                <v-text-field
                  v-model="address.phone"
                  label="Phone Number"
                  variant="outlined"
                  maxlength="20"
                />
              </v-col>

              <!-- Location-based Address Fields (No PSGC Dropdowns) -->
              <v-col cols="12">
                <v-text-field
                  v-model="address.region_name"
                  label="Region *"
                  variant="outlined"
                  required
                />
              </v-col>

              <v-col cols="12">
                <v-text-field
                  v-model="address.province_name"
                  label="Province *"
                  variant="outlined"
                  required
                />
              </v-col>

              <v-col cols="12">
                <v-text-field
                  v-model="address.city_name"
                  label="City/Municipality *"
                  variant="outlined"
                  required
                />
              </v-col>

              <v-col cols="12">
                <v-text-field
                  v-model="address.barangay_name"
                  label="Barangay *"
                  variant="outlined"
                  required
                />
              </v-col>

              <v-col cols="12">
                <v-text-field v-model="address.street" label="Street" variant="outlined" />
              </v-col>

              <v-col cols="12">
                <v-text-field
                  v-model="address.purok"
                  label="Purok/Subdivision"
                  variant="outlined"
                />
              </v-col>

              <v-col cols="12">
                <v-text-field
                  v-model="address.building"
                  label="Building/Apartment"
                  variant="outlined"
                />
              </v-col>

              <v-col cols="12">
                <v-text-field v-model="address.house_no" label="House/Lot No." variant="outlined" />
              </v-col>

              <v-col cols="12">
                <v-text-field
                  v-model="address.postal_code"
                  label="Postal Code"
                  variant="outlined"
                  maxlength="20"
                />
              </v-col>
            </v-row>

            <v-col cols="12" class="mt-4">
              <div id="location-map" class="map-wrapper"></div>
              <p class="text-caption mt-2 text-grey">
                📍 Your detected location will appear here with a marker. You can drag the marker to
                adjust the exact location.
              </p>
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
              :disabled="
                !address.region_name ||
                !address.province_name ||
                !address.city_name ||
                !address.barangay_name
              "
              size="large"
            >
              <v-icon class="me-2">mdi-check</v-icon>
              {{ isLoading ? 'Saving...' : 'Save Address' }}
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
  position: relative;
}

:deep(.leaflet-container) {
  border-radius: 12px;
  background-color: #e9ecef; /* Add background color to make map visible when loading */
}

:deep(.leaflet-control-fullscreen) {
  background: white;
  border: 2px solid rgba(0, 0, 0, 0.2);
  border-radius: 4px;
  width: 30px;
  height: 30px;
  line-height: 30px;
  text-align: center;
  font-size: 16px;
  font-weight: bold;
  cursor: pointer;
}

:deep(.leaflet-control-fullscreen:hover) {
  background: #f4f4f4;
}

:deep(.leaflet-container:fullscreen) {
  width: 100vw;
  height: 100vh;
  border-radius: 0;
}

:deep(.leaflet-marker-draggable) {
  cursor: move;
}

/* Ensure map containers are visible */
:deep(#manual-map),
:deep(#location-map) {
  z-index: 1;
  min-height: 300px; /* Ensure minimum height */
}
</style>