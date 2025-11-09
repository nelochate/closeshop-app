<script setup>
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

const address = ref({
  region: 'Caraga',
  province: 'Agusan del Norte',
  city: 'Butuan City',
  recipient_name: '',
  phone: '',
  purok: '',
  barangay: '',
  building: '',
  street: '',
  house_no: '',
  postal_code: '8600',
  is_default: false,
})

const barangays = [
  'Agusan Pequeño', 'Ambago', 'Amparo', 'Ampayon', 'Anticala', 'Antongalon', 'Aupagan',
  'Baan KM 3', 'Baan Riverside Poblacion (Barangay 20)', 'Babag', 'Bading Poblacion (Barangay 22)',
  'Bancasi', 'Banza', 'Baobaoan', 'Basag', 'Bayanihan Poblacion (Barangay 27)', 'Bilay',
  'Bitan-agan', 'Bit-os', 'Bobon', 'Bonbon', 'Bugabus', 'Bugsukan', 'Buhangin Poblacion (Barangay 19)',
  'Cabcabon', 'Camayahan', 'Dagohoy Poblacion (Barangay 7)', 'Dankias', 'De Oro',
  'Diego Silang Poblacion (Barangay 6)', 'Don Francisco', 'Doongan', 'Dulag', 'Dumalagan',
  'Florida', 'Golden Ribbon Poblacion (Barangay 2)', 'Holy Redeemer Poblacion (Barangay 23)',
  'Humabon Poblacion (Barangay 11)', 'Imadejas Poblacion (Barangay 24)', 'Jose Rizal Poblacion (Barangay 25)',
  'Kinamlutan', 'Lapu-Lapu Poblacion (Barangay 8)', 'Lemon', 'Leon Kilat Poblacion (Barangay 13)',
  'Libertad', 'Limaha Poblacion (Barangay 14)', 'Los Angeles', 'Lumbocan', 'Maguinda',
  'Mahay', 'Mahogany Poblacion (Barangay 21)', 'Maibu', 'Mandamo', 'Manila de Bugabus',
  'Maon Poblacion (Barangay 1)', 'Masao', 'Maug', 'New Society Village Poblacion (Barangay 26)',
  'Nong-Nong', 'Obrero Poblacion (Barangay 18)', 'Ong Yiu Poblacion (Barangay 16)', 'Pagatpatan',
  'Pangabugan', 'Pianing', 'Pigdaulan', 'Pinamanculan',
  'Port Poyohon Poblacion (Barangay 17, New Asia)', 'Rajah Soliman Poblacion (Barangay 4)',
  'Salvacion', 'San Ignacio Poblacion (Barangay 15)', 'San Mateo', 'Santo Niño',
  'San Vicente', 'Sikatuna Poblacion (Barangay 10)', 'Silongan Poblacion (Barangay 5)',
  'Sumile', 'Sumilihon', 'Tagabaca', 'Taguibo', 'Taligaman',
  'Tandang Sora Poblacion (Barangay 12)', 'Tiniwisan', 'Tungao', 'Urduja Poblacion (Barangay 9)',
  'Villa Kananga'
]

// --- Load address if editing ---
const loadAddress = async () => {
  try {
    const { data: userData, error: userError } = await supabase.auth.getUser()
    if (userError || !userData?.user) {
      console.error('User not authenticated:', userError)
      return router.push({ name: 'login' })
    }

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
        // Only assign properties that exist in the address object
        Object.keys(address.value).forEach(key => {
          if (data[key] !== undefined) {
            address.value[key] = data[key]
          }
        })
        isEdit.value = true

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
    if (!address.value.barangay) {
      throw new Error('Barangay is required')
    }

    const { data: userData, error: userError } = await supabase.auth.getUser()
    if (userError || !userData?.user) {
      throw new Error('User not authenticated')
    }

    // Prepare address data - only include fields that exist in the table
    const addressData = {
      recipient_name: address.value.recipient_name || null,
      phone: address.value.phone || null,
      street: address.value.street || null,
      city: address.value.city || 'Butuan City',
      province: address.value.province || 'Agusan del Norte',
      postal_code: address.value.postal_code || '8600',
      is_default: address.value.is_default || false,
      purok: address.value.purok || null,
      barangay: address.value.barangay || null,
      updated_at: new Date().toISOString(),
    }

    // Handle default address logic
    if (address.value.is_default) {
      // Set all other addresses to false
      const { error: updateError } = await supabase
        .from('addresses')
        .update({ is_default: false })
        .eq('user_id', userData.user.id)
        .neq('id', addressId.value || '00000000-0000-0000-0000-000000000000') // Avoid empty IN clause

      if (updateError) {
        console.error('Error updating default addresses:', updateError)
      }
    }

    let result
    if (isEdit.value && addressId.value) {
      // Update existing address
      result = await supabase
        .from('addresses')
        .update(addressData)
        .eq('id', addressId.value)
        .eq('user_id', userData.user.id)
    } else {
      // Insert new address
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

// --- Update Map (using server proxy) ---
const updateMap = async () => {
  if (!map.value) {
    console.warn('Map not initialized')
    return
  }

  const house = address.value.house_no || ''
  const street = address.value.street || ''
  const purok = address.value.purok || ''
  const barangay = address.value.barangay || ''
  const city = address.value.city || 'Butuan City'

  if (!barangay && !street) {
    map.value.setView([8.9492, 125.5436], 13)
    if (marker.value) {
      map.value.removeLayer(marker.value)
      marker.value = null
    }
    return
  }

  const query = `${house} ${street} ${purok} ${barangay}, ${city}, Philippines`.trim()

  try {
    // Use your proxy endpoint
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

// --- Detect user location (using proxy) ---
// --- Enhanced Current Location Detection with Specifics ---
const useCurrentLocation = async () => {
  try {
    snackbarMessage.value = 'Detecting your precise location...'
    showMapSnackbar.value = true
    isLoading.value = true

    // Check permissions
    const permissions = await Geolocation.checkPermissions()
    if (permissions.location !== 'granted') {
      const request = await Geolocation.requestPermissions()
      if (request.location !== 'granted') {
        throw new Error('Location permission denied. Please enable location services.')
      }
    }

    // Get high-precision coordinates
    const coords = await Geolocation.getCurrentPosition({
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 0
    })
    
    const lat = coords.coords.latitude
    const lng = coords.coords.longitude
    const accuracy = coords.coords.accuracy

    console.log('Precise coordinates obtained:', { lat, lng, accuracy: accuracy + ' meters' })

    // Update map view with precise location
    map.value.setView([lat, lng], 18) // Zoom to building level
    if (marker.value) {
      marker.value.setLatLng([lat, lng])
    } else {
      marker.value = L.marker([lat, lng]).addTo(map.value)
      
      // Add accuracy circle
      L.circle([lat, lng], {
        radius: accuracy,
        color: 'blue',
        fillColor: '#1e88e5',
        fillOpacity: 0.1,
        weight: 1
      }).addTo(map.value)
    }

    // Enhanced reverse geocoding with specific details
    try {
      console.log('Calling enhanced reverse geocoding API...')
      const res = await fetch(`http://localhost:3000/api/reverse-geocode?lat=${lat}&lon=${lng}`)
      
      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`)
      }
      
      const result = await res.json()
      console.log('Enhanced address result:', result)
      
      if (result.error) {
        throw new Error(result.error)
      }

      if (result.address) {
        const addr = result.address
        
        // Build a detailed location description
        let locationDescription = ''
        if (addr.university) locationDescription += `${addr.university}, `
        if (addr.building) locationDescription += `${addr.building}, `
        if (addr.specific_place) locationDescription += `${addr.specific_place}, `
        
        // Update address fields with enhanced details
        address.value.recipient_name = '' // Clear for user to fill
        address.value.phone = '' // Clear for user to fill
        address.value.house_no = addr.house_number || ''
        address.value.building = addr.building || addr.specific_place || ''
        address.value.street = addr.road || ''
        address.value.purok = addr.purok || ''
        address.value.barangay = addr.suburb || addr.neighbourhood || addr.village || ''
        address.value.city = addr.city || 'Butuan City'
        address.value.province = addr.state || 'Agusan del Norte'
        address.value.region = addr.region || 'Caraga'
        address.value.postal_code = addr.postcode || '8600'
        
        // Set detailed success message
        if (addr.university) {
          snackbarMessage.value = `📍 Detected: ${addr.university}`
        } else if (addr.building) {
          snackbarMessage.value = `📍 Detected: ${addr.building}`
        } else if (addr.specific_place) {
          snackbarMessage.value = `📍 Detected: ${addr.specific_place}`
        } else {
          snackbarMessage.value = '📍 Location detected successfully!'
        }
        
        // Additional info for debugging
        console.log('Enhanced address details:', {
          university: addr.university,
          building: addr.building,
          purok: addr.purok,
          specific_place: addr.specific_place,
          full_address: addr.full_display_name
        })

      } else {
        snackbarMessage.value = '📍 Location detected but detailed address not found'
      }
    } catch (geocodeError) {
      console.error('Enhanced reverse geocoding error:', geocodeError)
      snackbarMessage.value = '📍 Location detected but detailed address lookup failed. Please fill address manually.'
      
      // Fallback: At least set the coordinates
      address.value.building = `Near coordinates: ${lat.toFixed(6)}, ${lng.toFixed(6)}`
    }

    showMapSnackbar.value = true
  } catch (error) {
    console.error('Location detection error:', error)
    
    if (error.message.includes('permission')) {
      snackbarMessage.value = '📍 Location access denied. Please enable location permissions in your browser/app settings.'
    } else if (error.message.includes('timeout')) {
      snackbarMessage.value = '📍 Location detection timeout. Please try again in an area with better GPS signal.'
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
  // Initialize map with error handling
  try {
    const mapElement = document.getElementById('map')
    if (mapElement) {
      map.value = L.map('map').setView([8.9492, 125.5436], 13)
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
  () => [address.value.street, address.value.barangay, address.value.house_no, address.value.purok],
  () => {
    if (updateMapTimeout) clearTimeout(updateMapTimeout)
    updateMapTimeout = setTimeout(() => {
      if (addressMode.value === 'manual') {
        updateMap()
      }
    }, 1000) // Debounce for 1 second
  }
)

// Watch address mode changes
watch(addressMode, (newMode) => {
  if (newMode === 'location') {
    // Reset to default view when switching to location mode
    if (map.value) {
      map.value.setView([8.9492, 125.5436], 13)
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
                  <v-text-field
                    v-model="address.phone"
                    label="Phone Number"
                    variant="outlined"
                  />
                </v-col>
                <v-col cols="12">
                  <v-select
                    v-model="address.barangay"
                    :items="barangays"
                    label="Barangay *"
                    variant="outlined"
                    required
                  />
                </v-col>
                <v-col cols="12">
                  <v-text-field
                    v-model="address.purok"
                    label="Purok"
                    variant="outlined"
                  />
                </v-col>
                <v-col cols="12">
                  <v-text-field
                    v-model="address.street"
                    label="Street"
                    variant="outlined"
                  />
                </v-col>
                <v-col cols="12">
                  <v-text-field
                    v-model="address.building"
                    label="Building"
                    variant="outlined"
                  />
                </v-col>
                <v-col cols="12">
                  <v-text-field
                    v-model="address.house_no"
                    label="House No."
                    variant="outlined"
                  />
                </v-col>
                <v-col cols="12">
                  <v-text-field
                    v-model="address.postal_code"
                    label="Postal Code"
                    variant="outlined"
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
                  <p class="text-caption mt-2 text-grey">Map will update automatically as you fill in address details</p>
                </v-col>

                <v-col cols="12" class="text-right">
                  <v-btn
                    type="submit"
                    color="primary"
                    size="large"
                    :loading="isLoading"
                    :disabled="!address.barangay"
                  >
                    <v-icon class="me-2">mdi-check</v-icon>
                    {{ isLoading ? 'Saving...' : (isEdit ? 'Update Address' : 'Save Address') }}
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
                <v-text-field
                  v-model="address.phone"
                  label="Phone Number"
                  variant="outlined"
                />
              </v-col>
              <v-col cols="12">
                <v-text-field
                  v-model="address.barangay"
                  label="Barangay"
                  variant="outlined"
                  readonly
                />
              </v-col>
              <v-col cols="12">
                <v-text-field
                  v-model="address.street"
                  label="Street"
                  variant="outlined"
                  readonly
                />
              </v-col>

              <v-col cols="12">
                <v-text-field
                  v-model="address.city"
                  label="City"
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
              :disabled="!address.barangay"
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
