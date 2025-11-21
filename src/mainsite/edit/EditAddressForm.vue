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
      position: 'topright'
    },
    onAdd: function() {
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
    toggleFullscreen: function() {
      const mapContainer = map.value.getContainer()
      if (!document.fullscreenElement) {
        if (mapContainer.requestFullscreen) {
          mapContainer.requestFullscreen()
        } else if ((mapContainer as any).webkitRequestFullscreen) {
          (mapContainer as any).webkitRequestFullscreen()
        } else if ((mapContainer as any).msRequestFullscreen) {
          (mapContainer as any).msRequestFullscreen()
        }
      } else {
        if (document.exitFullscreen) {
          document.exitFullscreen()
        } else if ((document as any).webkitExitFullscreen) {
          (document as any).webkitExitFullscreen()
        } else if ((document as any).msExitFullscreen) {
          (document as any).msExitFullscreen()
        }
      }
    }
  })
  
  return new FullscreenControl()
}

// --- PSGC API Functions (KEPT INTACT - NEVER REMOVED) ---
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

// --- PSGC Code Matching Functions (USING PSGC CLOUD API DATA) ---
const findRegionCode = (regionName: string) => {
  return regions.value.find((r: any) => 
    r.name.toLowerCase().includes(regionName.toLowerCase()) ||
    regionName.toLowerCase().includes(r.name.toLowerCase())
  )?.code || ''
}

const findProvinceCode = (provinceName: string) => {
  return provinces.value.find((p: any) => 
    p.name.toLowerCase().includes(provinceName.toLowerCase()) ||
    provinceName.toLowerCase().includes(p.name.toLowerCase())
  )?.code || ''
}

const findCityCode = (cityName: string) => {
  return citiesMunicipalities.value.find((c: any) => 
    c.name.toLowerCase().includes(cityName.toLowerCase()) ||
    cityName.toLowerCase().includes(c.name.toLowerCase())
  )?.code || ''
}

const findBarangayCode = (barangayName: string) => {
  return barangays.value.find((b: any) => 
    b.name.toLowerCase().includes(barangayName.toLowerCase()) ||
    barangayName.toLowerCase().includes(b.name.toLowerCase())
  )?.code || ''
}

// --- Progressive Zoom Logic ---
const updateMapZoom = () => {
  if (!map.value) return

  let zoomLevel = 6 // Default zoom for Philippines
  
  // Progressive zoom based on filled address fields
  if (address.value.region) zoomLevel = 7
  if (address.value.province) zoomLevel = 9
  if (address.value.city) zoomLevel = 12
  if (address.value.barangay) zoomLevel = 15
  if (address.value.street || address.value.purok || address.value.house_no) zoomLevel = 17

  return zoomLevel
}

// --- Watchers for PSGC Cascading (KEPT INTACT - USING PSGC CLOUD API) ---
watch(
  () => address.value.region,
  async (newRegion) => {
    address.value.province = ''
    address.value.city = ''
    address.value.barangay = ''
    address.value.postal_code = ''
    if (newRegion) {
      await fetchProvinces(newRegion)
      if (map.value) {
        const zoomLevel = updateMapZoom()
        map.value.setZoom(zoomLevel)
      }
    }
  },
)

watch(
  () => address.value.province,
  async (newProvince) => {
    address.value.city = ''
    address.value.barangay = ''
    address.value.postal_code = ''
    if (newProvince) {
      await fetchCitiesMunicipalities(newProvince)
      if (map.value) {
        const zoomLevel = updateMapZoom()
        map.value.setZoom(zoomLevel)
      }
    }
  },
)

watch(
  () => address.value.city,
  async (newCity) => {
    address.value.barangay = ''
    const selectedCity = citiesMunicipalities.value.find((c) => c.code === newCity)
    if (selectedCity?.zip_code) address.value.postal_code = selectedCity.zip_code
    if (newCity) {
      await fetchBarangays(newCity)
      if (map.value) {
        const zoomLevel = updateMapZoom()
        map.value.setZoom(zoomLevel)
      }
    }
  },
)

// --- Get User Profile ID ---
const getUserProfileId = async () => {
  try {
    const { data: userData, error: userError } = await supabase.auth.getUser()
    if (userError || !userData?.user) throw new Error('User not authenticated')

    // Get the profile ID that matches the auth user
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', userData.user.id)
      .single()

    if (profileError) {
      // If profile doesn't exist, create one
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

    const profileId = await getUserProfileId()

    // ✅ Get human-readable names for all PSGC fields using PSGC Cloud API data
    const regionName = regions.value.find((r) => r.code === address.value.region)?.name || ''
    const provinceName = provinces.value.find((p) => p.code === address.value.province)?.name || ''
    const cityName = citiesMunicipalities.value.find((c) => c.code === address.value.city)?.name || ''
    const barangayName = barangays.value.find((b) => b.code === address.value.barangay)?.name || ''

    const addressData = {
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

    // Handle default address logic
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
      result = await supabase
        .from('addresses')
        .insert([
          { 
            ...addressData, 
            user_id: profileId, 
            created_at: new Date().toISOString() 
          }
        ])
    }

    if (result.error) {
      // Handle unique constraint violation for default addresses
      if (result.error.code === '23505' && result.error.message.includes('one_default_address_per_user')) {
        throw new Error('You can only have one default address. Please unset your current default address first.')
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

// --- Update Map with Public Geocoding Service ---
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
    // Use Nominatim (OpenStreetMap) geocoding service
    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&countrycodes=ph&limit=1`)
    const results = await res.json()
    if (results.length > 0) {
      const { lat, lon } = results[0]
      const latNum = parseFloat(lat)
      const lonNum = parseFloat(lon)
      const zoomLevel = updateMapZoom()
      
      map.value.setView([latNum, lonNum], zoomLevel)
      
      if (marker.value) {
        marker.value.setLatLng([latNum, lonNum])
      } else {
        // Create draggable marker
        marker.value = L.marker([latNum, lonNum], { 
          draggable: true,
          autoPan: true
        }).addTo(map.value)
        
        // Add dragend event to update address when marker is moved
        marker.value.on('dragend', function(event: any) {
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
    // Use Nominatim reverse geocoding
    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`)
    const result = await res.json()
    if (result.address) {
      const addr = result.address
      // Update address fields with reverse geocoded data
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

// --- Enhanced Current Location Detection ---
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

    // Set map view and marker
    map.value.setView([lat, lng], 18)
    
    if (marker.value) {
      marker.value.setLatLng([lat, lng])
    } else {
      marker.value = L.marker([lat, lng], { 
        draggable: true,
        autoPan: true
      }).addTo(map.value)
      
      marker.value.on('dragend', function(event: any) {
        const marker = event.target
        const position = marker.getLatLng()
        reverseGeocode(position.lat, position.lng)
      })
    }

    // Enhanced reverse geocoding to fill all address fields
    await enhancedReverseGeocode(lat, lng)
    
    snackbarMessage.value = '📍 Location detected! Address fields have been automatically filled.'
    showMapSnackbar.value = true
  } catch (err: any) {
    console.error(err)
    snackbarMessage.value = '📍 ' + (err.message || 'Unable to detect location.')
    showMapSnackbar.value = true
  } finally {
    isLoading.value = false
  }
}

// --- Enhanced Reverse Geocoding for Current Location ---
const enhancedReverseGeocode = async (lat: number, lng: number) => {
  try {
    // Use Nominatim reverse geocoding with more details
    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`)
    const result = await res.json()
    
    if (result.address) {
      const addr = result.address
      
      // Clear existing address data first
      address.value.region = ''
      address.value.province = ''
      address.value.city = ''
      address.value.barangay = ''
      address.value.street = ''
      address.value.purok = ''
      address.value.building = ''
      address.value.house_no = ''
      address.value.postal_code = ''
      
      // Update address fields with reverse geocoded data
      address.value.house_no = addr.house_number || ''
      address.value.building = addr.building || addr.specific_place || ''
      address.value.street = addr.road || ''
      address.value.purok = addr.purok || ''
      address.value.postal_code = addr.postcode || ''
      
      // Extract and match Philippine administrative divisions
      const regionName = addr.state || addr.region || ''
      const provinceName = addr.state_district || addr.province || ''
      const cityName = addr.city || addr.town || addr.municipality || ''
      const barangayName = addr.suburb || addr.village || addr.neighbourhood || ''
      
      // Ensure we have regions data loaded from PSGC Cloud API
      if (regions.value.length === 0) {
        await fetchRegions()
      }
      
      // Find and set region code using PSGC Cloud API data
      if (regionName) {
        const regionCode = findRegionCode(regionName)
        if (regionCode) {
          address.value.region = regionCode
          await fetchProvinces(regionCode) // Uses PSGC Cloud API
          
          // Find and set province code using PSGC Cloud API data
          if (provinceName) {
            setTimeout(async () => {
              const provinceCode = findProvinceCode(provinceName)
              if (provinceCode) {
                address.value.province = provinceCode
                await fetchCitiesMunicipalities(provinceCode) // Uses PSGC Cloud API
                
                // Find and set city code using PSGC Cloud API data
                if (cityName) {
                  setTimeout(async () => {
                    const cityCode = findCityCode(cityName)
                    if (cityCode) {
                      address.value.city = cityCode
                      await fetchBarangays(cityCode) // Uses PSGC Cloud API
                      
                      // Find and set barangay code using PSGC Cloud API data
                      if (barangayName) {
                        setTimeout(() => {
                          const barangayCode = findBarangayCode(barangayName)
                          if (barangayCode) {
                            address.value.barangay = barangayCode
                          }
                        }, 500)
                      }
                    }
                  }, 500)
                }
              }
            }, 500)
          }
        }
      }
      
      console.log('Enhanced reverse geocoding result:', {
        raw: addr,
        matched: {
          region: address.value.region,
          province: address.value.province,
          city: address.value.city,
          barangay: address.value.barangay
        }
      })
    }
  } catch (err) {
    console.error('Enhanced reverse geocoding failed:', err)
    snackbarMessage.value = 'Unable to get complete address details for this location'
    showMapSnackbar.value = true
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
    
    // Add custom fullscreen control
    fullscreenControl.value = createFullscreenControl()
    map.value.addControl(fullscreenControl.value)
    
    // Add click event to map to place/move marker
    map.value.on('click', function(e: any) {
      const { lat, lng } = e.latlng
      
      if (marker.value) {
        marker.value.setLatLng([lat, lng])
      } else {
        marker.value = L.marker([lat, lng], { 
          draggable: true,
          autoPan: true
        }).addTo(map.value)
        
        marker.value.on('dragend', function(event: any) {
          const marker = event.target
          const position = marker.getLatLng()
          reverseGeocode(position.lat, position.lng)
        })
      }
      
      // Reverse geocode the clicked location
      reverseGeocode(lat, lng)
    })
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
            <p class="text-caption text-grey mt-2" v-if="addressMode === 'location'">
              Click the button below to detect your current location and automatically fill all address fields using PSGC data.
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

                <!-- PSGC Address Fields (USING PSGC CLOUD API - NEVER REMOVED) -->
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
                  <div id="map" class="map-wrapper"></div>
                  <p class="text-caption mt-2 text-grey">
                    📍 Map zooms in as you fill details. Click/tap on map or drag marker to adjust location.
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
              {{ isLoading ? 'Detecting Location...' : 'Detect My Location & Fill Address' }}
            </v-btn>

            <p class="text-caption text-grey mt-2">
              This will use your device's GPS to detect your exact location and automatically populate all address fields using PSGC Cloud API data.
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

              <!-- PSGC Fields for Location Mode (USING PSGC CLOUD API - NEVER REMOVED) -->
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
            </v-row>

            <v-col cols="12" class="mt-4">
              <div id="map" class="map-wrapper"></div>
              <p class="text-caption mt-2 text-grey">
                📍 Your detected location will appear here. You can drag the marker or click/tap on map for precise adjustment.
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
              :disabled="!address.region || !address.province || !address.city || !address.barangay"
              size="large"
            >
              <v-icon class="me-2">mdi-check</v-icon>
              {{ isLoading ? 'Saving...' : 'Save Current Location Address' }}
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
}

:deep(.leaflet-control-fullscreen) {
  background: white;
  border: 2px solid rgba(0,0,0,0.2);
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
</style>