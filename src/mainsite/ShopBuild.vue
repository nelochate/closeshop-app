<script setup lang="ts">
import { ref, watch, onMounted, nextTick } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { supabase } from '@/utils/supabase'
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera'
import * as L from 'leaflet'
import 'leaflet.fullscreen'
import 'leaflet.fullscreen/Control.FullScreen.css'

// -------------------- ROUTER --------------------
const router = useRouter()
const route = useRoute()
const goBack = () => router.back()
const shopId = ref<string | null>((route.params.id as string) || null)

watch(() => route.params.id, (newId) => {
  shopId.value = (newId as string) || null
  if (shopId.value) {
    loadShopData()
  }
})

// -------------------- STATES --------------------
const currentShopId = ref<string | null>(null)
const uploading = ref(false)
const showPicker = ref(false)
const saving = ref(false)
const snackbar = ref(false)
const snackbarMessage = ref('')
const snackbarColor = ref<'success' | 'error'>('success')
const loadingShopData = ref(false)

// -------------------- FORM STEPS --------------------
const currentStep = ref(1)
const totalSteps = 6
const steps = [
  { number: 1, title: 'Business Info', icon: 'mdi-store' },
  { number: 2, title: 'Open Days', icon: 'mdi-calendar' },
  { number: 3, title: 'Operating Hours', icon: 'mdi-clock' },
  { number: 4, title: 'Delivery Options', icon: 'mdi-truck' },
  { number: 5, title: 'Location', icon: 'mdi-map-marker' },
  { number: 6, title: 'Valid ID', icon: 'mdi-card-account-details' }
]

const nextStep = () => {
  if (currentStep.value < totalSteps) {
    currentStep.value++
    // Initialize map when moving to step 5
    if (currentStep.value === 5) {
      nextTick(() => {
        initMap(latitude.value!, longitude.value!)
      })
    }
  }
}

const prevStep = () => {
  if (currentStep.value > 1) {
    currentStep.value--
  }
}

// -------------------- SHOP INFO --------------------
const shopName = ref('')
const description = ref('')
const openTime = ref('')
const closeTime = ref('')
const avatarUrl = ref<string | null>(null)
const physicalUrl = ref<string | null>(null)
const deliveryOptions = ref<string[]>([])
const meetUpDetails = ref('')
const fullAddress = ref('')
const validIdFrontUrl = ref<string | null>(null)
const validIdBackUrl = ref<string | null>(null)
const pickerTarget = ref<'logo' | 'physical' | 'valid_id_front' | 'valid_id_back' | null>(null)

// -------------------- ADDRESS --------------------
const addressOption = ref<'manual' | 'map'>('manual')
const address = {
  barangay: ref(''),
  building: ref(''),
  street: ref(''),
  postal: ref(''),
  house_no: ref(''),
  city: ref(''),
  province: ref(''),
  region: ref('')
}

// -------------------- PSGC --------------------
const regions = ref<any[]>([])
const provinces = ref<any[]>([])
const cities = ref<any[]>([])
const barangaysList = ref<any[]>([])

const selectedRegion = ref<any>(null)
const selectedProvince = ref<any>(null)
const selectedCity = ref<any>(null)
const selectedBarangay = ref<any>(null)

// Track loading states
const loadingRegions = ref(false)
const loadingProvinces = ref(false)
const loadingCities = ref(false)
const loadingBarangays = ref(false)

// -------------------- MAP --------------------
const latitude = ref<number | null>(8.9489)
const longitude = ref<number | null>(125.5406)
const map = ref<L.Map | null>(null)
let shopMarker: L.Marker | null = null
const mapInitialized = ref(false)

// -------------------- OPEN DAYS --------------------
const openDays = ref<number[]>([1, 2, 3, 4, 5, 6]) // Default: Monday to Saturday
const daysOfWeek = [
  { id: 1, label: 'Mon' },
  { id: 2, label: 'Tue' },
  { id: 3, label: 'Wed' },
  { id: 4, label: 'Thu' },
  { id: 5, label: 'Fri' },
  { id: 6, label: 'Sat' },
  { id: 7, label: 'Sun' }
]

const toggleDay = (dayId: number) => {
  const index = openDays.value.indexOf(dayId)
  if (index > -1) {
    openDays.value.splice(index, 1)
  } else {
    openDays.value.push(dayId)
  }
  openDays.value.sort((a, b) => a - b)
}

// -------------------- PSGC MAPPING FUNCTIONS --------------------
const findRegionCodeByName = (name: string) => {
  return regions.value.find(region => region.name.includes(name))?.code || null
}

const findProvinceCodeByName = (name: string) => {
  return provinces.value.find(province => province.name === name)?.code || null
}

const findCityCodeByName = (name: string) => {
  return cities.value.find(city => city.name === name)?.code || null
}

const findBarangayCodeByName = (name: string) => {
  return barangaysList.value.find(barangay => barangay.name === name)?.code || null
}

// -------------------- REVERSE GEOCODE --------------------
const reverseGeocode = async (lat: number, lng: number) => {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}`,
    )
    const data = await res.json()

    if (data?.display_name) {
      fullAddress.value = data.display_name
      showSnackbar(`📍 ${data.display_name}`, 'success')
    } else {
      showSnackbar('Address not found for this location', 'error')
    }
  } catch (err) {
    console.error('Reverse geocoding failed:', err)
    showSnackbar('Failed to fetch address', 'error')
  }
}

// -------------------- MAP INITIALIZATION --------------------
const initMap = (lat: number, lng: number) => {
  // Check if map container exists
  const mapContainer = document.getElementById('map')
  if (!mapContainer) {
    console.error('Map container not found')
    return
  }

  // Check if map is already initialized
  if (map.value) {
    map.value.setView([lat, lng], 15)
    shopMarker?.setLatLng([lat, lng])
    return
  }

  try {
    map.value = L.map('map', {
      center: [lat, lng],
      zoom: 15,
      fullscreenControl: true,
      fullscreenControlOptions: { position: 'topleft' },
    })

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
    }).addTo(map.value)

    shopMarker = L.marker([lat, lng], { draggable: true }).addTo(map.value)

    shopMarker.on('dragend', async (e) => {
      const pos = (e.target as L.Marker).getLatLng()
      latitude.value = pos.lat
      longitude.value = pos.lng
      await saveCoordinates(pos.lat, pos.lng)
      await reverseGeocode(pos.lat, pos.lng)
    })

    map.value.on('click', async (e: L.LeafletMouseEvent) => {
      const { lat, lng } = e.latlng
      latitude.value = lat
      longitude.value = lng
      shopMarker?.setLatLng([lat, lng])
      await saveCoordinates(lat, lng)
      await reverseGeocode(lat, lng)
    })

    mapInitialized.value = true
  } catch (error) {
    console.error('Error initializing map:', error)
  }
}

const toggleFullscreen = () => map.value?.toggleFullscreen()

// -------------------- SNACKBAR --------------------
const showSnackbar = (message: string, color: 'success' | 'error' = 'success') => {
  snackbarMessage.value = message
  snackbarColor.value = color
  snackbar.value = true
}

// -------------------- IMAGE UPLOAD --------------------
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

    const bucket =
      pickerTarget.value === 'physical'
        ? 'physical_store'
        : pickerTarget.value === 'valid_id_front' || pickerTarget.value === 'valid_id_back'
          ? 'valid_id'
          : 'Profile'

    const fileName = `${user.id}/${Date.now()}.png`

    const { data, error } = await supabase.storage.from(bucket).upload(fileName, file, {
      cacheControl: '3600',
      upsert: true,
    })
    if (error) throw error

    const newUrl = `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/${bucket}/${data.path}`

    if (pickerTarget.value === 'physical') {
      physicalUrl.value = newUrl
      if (currentShopId.value)
        await supabase
          .from('shops')
          .update({ physical_store: newUrl })
          .eq('id', currentShopId.value)
    } else if (pickerTarget.value === 'valid_id_front') {
      validIdFrontUrl.value = newUrl
      if (currentShopId.value)
        await supabase
          .from('shops')
          .update({ valid_id_front: newUrl })
          .eq('id', currentShopId.value)
    } else if (pickerTarget.value === 'valid_id_back') {
      validIdBackUrl.value = newUrl
      if (currentShopId.value)
        await supabase.from('shops').update({ valid_id_back: newUrl }).eq('id', currentShopId.value)
    } else {
      avatarUrl.value = newUrl
      if (currentShopId.value)
        await supabase.from('shops').update({ logo_url: newUrl }).eq('id', currentShopId.value)
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

// -------------------- COORDINATES --------------------
const saveCoordinates = async (lat: number, lng: number) => {
  try {
    if (!currentShopId.value) return

    const { error } = await supabase
      .from('shops')
      .update({
        latitude: lat,
        longitude: lng,
        detected_address: fullAddress.value,
      })
      .eq('id', currentShopId.value)

    if (error) throw error
    showSnackbar(`📍 Location updated: ${fullAddress.value || 'Coordinates saved'}`, 'success')
  } catch (err) {
    console.error(err)
    showSnackbar('Failed to update location', 'error')
  }
}

const getCoordinatesFromAddress = async (address: string) => {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}`,
    )
    const data = await res.json()
    if (data.length > 0) return { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) }
    return null
  } catch (error) {
    console.error('Failed to fetch coordinates:', error)
    return null
  }
}

// -------------------- SEARCH PLACE --------------------
const searchQuery = ref('')
const searchLoading = ref(false)
const searchResults = ref<any[]>([])
const showSearchResults = ref(false)

const searchPlace = async () => {
  if (!searchQuery.value.trim()) return
  searchLoading.value = true
  showSearchResults.value = false
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery.value)}`,
    )
    const data = await res.json()
    searchResults.value = data
    showSearchResults.value = true
  } catch (err) {
    console.error('Search failed:', err)
  } finally {
    searchLoading.value = false
  }
}

const selectSearchResult = (result: any) => {
  latitude.value = parseFloat(result.lat)
  longitude.value = parseFloat(result.lon)
  map.value?.setView([latitude.value, longitude.value], 15)
  shopMarker?.setLatLng([latitude.value, longitude.value])
  fullAddress.value = result.display_name
  showSearchResults.value = false
}

const clearSearch = () => {
  searchQuery.value = ''
  searchResults.value = []
  showSearchResults.value = false
}

// -------------------- PSGC API --------------------
const fetchRegions = async () => {
  loadingRegions.value = true
  try {
    const res = await fetch('https://psgc.cloud/api/regions')
    const data = await res.json()
    regions.value = data.sort((a, b) => a.name.localeCompare(b.name))

    // Pre-select Region XIII (Caraga)
    const caragaRegion = data.find((r: any) => r.name.includes('Caraga'))
    if (caragaRegion) {
      selectedRegion.value = caragaRegion.code
      address.region.value = caragaRegion.name
      console.log('Selected region:', caragaRegion.name)
    }
  } catch (error) {
    console.error('Failed to fetch regions:', error)
  } finally {
    loadingRegions.value = false
  }
}

const fetchProvinces = async (regionCode: string) => {
  if (!regionCode) return

  loadingProvinces.value = true
  try {
    const res = await fetch(`https://psgc.cloud/api/regions/${regionCode}/provinces`)
    const data = await res.json()
    provinces.value = data.sort((a, b) => a.name.localeCompare(b.name))

    // Pre-select Agusan del Norte if available
    const agusanDelNorte = data.find((p: any) => p.name === 'Agusan del Norte')
    if (agusanDelNorte) {
      selectedProvince.value = agusanDelNorte.code
      address.province.value = agusanDelNorte.name
      console.log('Selected province:', agusanDelNorte.name)
    }
  } catch (error) {
    console.error('Failed to fetch provinces:', error)
  } finally {
    loadingProvinces.value = false
  }
}

const fetchCities = async (provinceCode: string) => {
  if (!provinceCode) return

  loadingCities.value = true
  try {
    const res = await fetch(`https://psgc.cloud/api/provinces/${provinceCode}/cities-municipalities`)
    const data = await res.json()
    cities.value = data.sort((a, b) => a.name.localeCompare(b.name))

    // Pre-select City of Butuan if available
    const butuanCity = data.find((c: any) => c.name === 'City of Butuan')
    if (butuanCity) {
      selectedCity.value = butuanCity.code
      address.city.value = butuanCity.name
      console.log('Selected city:', butuanCity.name)
    }
  } catch (error) {
    console.error('Failed to fetch cities:', error)
  } finally {
    loadingCities.value = false
  }
}

const fetchBarangays = async (cityCode: string) => {
  if (!cityCode) return

  loadingBarangays.value = true
  try {
    const res = await fetch(`https://psgc.cloud/api/cities-municipalities/${cityCode}/barangays`)
    const data = await res.json()
    barangaysList.value = data.sort((a, b) => a.name.localeCompare(b.name))
  } catch (error) {
    console.error('Failed to fetch barangays:', error)
  } finally {
    loadingBarangays.value = false
  }
}

// Load shop data for editing
const loadShopData = async () => {
  if (!shopId.value) return

  loadingShopData.value = true
  try {
    const { data, error } = await supabase.from('shops').select('*').eq('id', shopId.value).single()
    if (error || !data) {
      console.error('Error loading shop data:', error)
      return
    }

    // Fill basic shop data
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
    address.city.value = data.city
    address.province.value = data.province
    address.region.value = data.region
    latitude.value = data.latitude || 8.9489
    longitude.value = data.longitude || 125.5406
    fullAddress.value = data.detected_address || ''
    deliveryOptions.value = data.delivery_options || []
    meetUpDetails.value = data.meetup_details || ''
    openDays.value = data.open_days || [1, 2, 3, 4, 5, 6]
    validIdFrontUrl.value = data.valid_id_front
    validIdBackUrl.value = data.valid_id_back

    console.log('Loaded shop data:', {
      region: data.region,
      province: data.province,
      city: data.city,
      barangay: data.barangay
    })

    // Map PSGC values after a short delay to ensure regions are loaded
    setTimeout(async () => {
      if (data.region) {
        const regionCode = findRegionCodeByName(data.region)
        if (regionCode) {
          selectedRegion.value = regionCode
          console.log('Mapped region:', data.region, '->', regionCode)

          // Wait for provinces to load
          await fetchProvinces(regionCode)
          await nextTick()

          if (data.province) {
            const provinceCode = findProvinceCodeByName(data.province)
            if (provinceCode) {
              selectedProvince.value = provinceCode
              console.log('Mapped province:', data.province, '->', provinceCode)

              // Wait for cities to load
              await fetchCities(provinceCode)
              await nextTick()

              if (data.city) {
                const cityCode = findCityCodeByName(data.city)
                if (cityCode) {
                  selectedCity.value = cityCode
                  console.log('Mapped city:', data.city, '->', cityCode)

                  // Wait for barangays to load
                  await fetchBarangays(cityCode)
                  await nextTick()

                  if (data.barangay) {
                    const barangayCode = findBarangayCodeByName(data.barangay)
                    if (barangayCode) {
                      selectedBarangay.value = barangayCode
                      console.log('Mapped barangay:', data.barangay, '->', barangayCode)
                    }
                  }
                }
              }
            }
          }
        }
      }
    }, 1000)

  } catch (err) {
    console.error('Error loading shop:', err)
  } finally {
    loadingShopData.value = false
  }
}

// Update address fields when PSGC selections change
watch(selectedRegion, (regionCode) => {
  selectedProvince.value = null
  selectedCity.value = null
  selectedBarangay.value = null
  provinces.value = []
  cities.value = []
  barangaysList.value = []
  if (regionCode) {
    fetchProvinces(regionCode)
    const regionObj = regions.value.find((r) => r.code === regionCode)
    if (regionObj) address.region.value = regionObj.name
  }
})

watch(selectedProvince, (provinceCode) => {
  selectedCity.value = null
  selectedBarangay.value = null
  cities.value = []
  barangaysList.value = []
  if (provinceCode) {
    fetchCities(provinceCode)
    const provinceObj = provinces.value.find((p) => p.code === provinceCode)
    if (provinceObj) address.province.value = provinceObj.name
  }
})

watch(selectedCity, (cityCode) => {
  selectedBarangay.value = null
  barangaysList.value = []
  if (cityCode) {
    fetchBarangays(cityCode)
    const cityObj = cities.value.find((c) => c.code === cityCode)
    if (cityObj) address.city.value = cityObj.name
  }
})

watch(selectedBarangay, async (barangayCode) => {
  if (!barangayCode || !selectedCity.value) return

  const barangayObj = barangaysList.value.find((b) => b.code === barangayCode)
  if (barangayObj) address.barangay.value = barangayObj.name

  const regionObj = regions.value.find((r) => r.code === selectedRegion.value)
  const provinceObj = provinces.value.find((p) => p.code === selectedProvince.value)
  const cityObj = cities.value.find((c) => c.code === selectedCity.value)

  if (barangayObj && cityObj && provinceObj && regionObj) {
    const full = `${barangayObj.name}, ${cityObj.name}, ${provinceObj.name}, ${regionObj.name}, Philippines`
    fullAddress.value = full

    const coords = await getCoordinatesFromAddress(full)
    if (coords) {
      latitude.value = coords.lat
      longitude.value = coords.lon
      // Only update map if it's initialized and we're on the location step
      if (mapInitialized.value && currentStep.value === 5) {
        map.value?.setView([coords.lat, coords.lon], 15)
        shopMarker?.setLatLng([coords.lat, coords.lon])
      }
    }
  }
})

// Update map when full address changes
watch(fullAddress, async (newVal) => {
  if (!newVal || !mapInitialized.value || currentStep.value !== 5) return

  const coords = await getCoordinatesFromAddress(newVal)
  if (coords) {
    latitude.value = coords.lat
    longitude.value = coords.lon
    map.value?.setView([coords.lat, coords.lon], 15)
    shopMarker?.setLatLng([coords.lat, coords.lon])
    await saveCoordinates(coords.lat, coords.lon)
  }
})

// -------------------- GET LOCATION --------------------
const getLocation = () => {
  if (!navigator.geolocation) {
    showSnackbar('Geolocation not supported', 'error')
    return
  }
  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      latitude.value = pos.coords.latitude
      longitude.value = pos.coords.longitude

      // Only update map if it's initialized and we're on the location step
      if (mapInitialized.value && currentStep.value === 5) {
        map.value?.setView([latitude.value, longitude.value], 17)
        shopMarker?.setLatLng([latitude.value, longitude.value])
      }

      await reverseGeocode(latitude.value, longitude.value)
      await saveCoordinates(latitude.value, longitude.value)
    },
    (err) => {
      console.error(err)
      showSnackbar('Failed to get location', 'error')
    },
    { enableHighAccuracy: true, timeout: 10000 },
  )
}

// -------------------- SAVE SHOP --------------------
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

    // Prepare shop data according to schema
    const shopData = {
      owner_id: user.id,
      business_name: shopName.value,
      description: description.value,
      logo_url: avatarUrl.value,
      physical_store: physicalUrl.value,
      latitude: latitude.value,
      longitude: longitude.value,
      open_time: openTime.value || null,
      close_time: closeTime.value || null,
      barangay: address.barangay.value,
      building: address.building.value,
      street: address.street.value,
      postal: address.postal.value,
      house_no: address.house_no.value,
      city: address.city.value,
      province: address.province.value,
      region: address.region.value,
      delivery_options: deliveryOptions.value,
      meetup_details: meetUpDetails.value || null,
      detected_address: fullAddress.value || null,
      status: 'pending',
      valid_id_front: validIdFrontUrl.value,
      valid_id_back: validIdBackUrl.value,
      open_days: openDays.value // Add open days according to schema
    }

    if (!currentShopId.value) {
      const { data, error } = await supabase.from('shops').insert(shopData).select().single()
      if (error) throw error
      currentShopId.value = data.id
      showSnackbar('Shop created successfully!', 'success')
      router.push(`/shop/${data.id}`)
    } else {
      const { error } = await supabase.from('shops').update(shopData).eq('id', currentShopId.value)
      if (error) throw error
      showSnackbar('Shop updated successfully!', 'success')
      // Redirect back to user shop after update
      router.push('/usershop')
    }
  } catch (err) {
    console.error(err)
    showSnackbar('Failed to save shop', 'error')
  } finally {
    saving.value = false
  }
}

// -------------------- MOUNT --------------------
onMounted(async () => {
  await fetchRegions()
  await nextTick()

  // Load shop data if editing
  if (shopId.value) {
    await loadShopData()
  }

  // Don't initialize map here - wait until step 5 is active
})

// Add a watcher to debug the selection process
watch([selectedRegion, selectedProvince, selectedCity], ([region, province, city]) => {
  console.log('Current selections:', {
    region: region ? regions.value.find(r => r.code === region)?.name : 'None',
    province: province ? provinces.value.find(p => p.code === province)?.name : 'None',
    city: city ? cities.value.find(c => c.code === city)?.name : 'None'
  })
})
</script>

<template>
  <v-app>
    <!-- Top App Bar -->
    <v-app-bar class="app-bar" flat color="#3f83c7" dark density="comfortable">
      <v-btn icon @click="goBack">
        <v-icon>mdi-arrow-left</v-icon>
      </v-btn>
      <v-toolbar-title><strong>{{ currentShopId ? 'Edit Shop' : 'Create Shop' }}</strong></v-toolbar-title>
    </v-app-bar>

    <v-main class="pb-16">
      <!-- Progress Steps -->
      <v-card class="steps-card" flat>
        <v-card-text class="steps-container">
          <div class="steps">
            <div v-for="step in steps" :key="step.number" class="step" :class="{
                'active': currentStep === step.number,
                'completed': currentStep > step.number
              }">
              <div class="step-icon">
                <v-icon size="20">{{ step.icon }}</v-icon>
              </div>
              <span class="step-title">{{ step.title }}</span>
            </div>
          </div>
          <div class="step-progress">
            <v-progress-linear :model-value="(currentStep / totalSteps) * 100" color="#3f83c7" height="6"
              rounded></v-progress-linear>
          </div>
        </v-card-text>
      </v-card>

      <!-- Cover & Logo Section -->
      <div class="cover-section">
        <v-img :src="physicalUrl || 'https://via.placeholder.com/1200x400?text=Store+Cover+Photo'" class="cover-photo"
          cover>
          <div class="cover-overlay"></div>
          <v-btn icon color="white" class="cover-upload" @click="pickerTarget = 'physical'; showPicker = true">
            <v-icon color="#3f83c7">mdi-camera</v-icon>
          </v-btn>
          <h2 class="text-center text-blue">Upload Physical Store Photo</h2>
        </v-img>

        <!-- Floating logo -->
        <div class="logo-wrapper">
          <v-avatar size="110" color="white" class="logo-avatar">
            <v-img v-if="avatarUrl" :src="avatarUrl" cover />
            <v-icon v-else size="70" color="grey">mdi-store</v-icon>
          </v-avatar>
          <v-btn icon class="logo-upload-btn" @click="pickerTarget = 'logo'; showPicker = true">
            <v-icon color="#3f83c7">mdi-camera</v-icon>
          </v-btn>
        </div>
      </div>

      <!-- Loading State -->
      <v-overlay :model-value="loadingShopData" class="align-center justify-center" persistent>
        <v-progress-circular color="primary" indeterminate size="64"></v-progress-circular>
        <div class="text-center mt-4">
          <div class="text-h6">Loading Shop Data...</div>
          <div class="text-body-2">Please wait while we load your shop information</div>
        </div>
      </v-overlay>

      <!-- Form Section -->
      <div class="form-section pa-4" v-if="!loadingShopData">
        <!-- Step 1: Business Information -->
        <v-card v-if="currentStep === 1" class="mb-4 step-card" variant="outlined">
          <v-card-title class="section-title">
            <v-icon class="mr-2">mdi-store</v-icon>
            Business Information
            <v-chip v-if="currentShopId" color="primary" size="small" class="ml-2">
              Pre-filled
            </v-chip>
          </v-card-title>
          <v-card-text>
            <v-text-field v-model="shopName" label="Business Name *" outlined required class="mb-3"
              :rules="[v => !!v || 'Business name is required']" />
            <v-textarea v-model="description" label="About Us" outlined auto-grow rows="3"
              hint="Tell customers about your business" />
          </v-card-text>
          <v-card-actions class="step-actions">
            <v-btn color="primary" @click="nextStep" :disabled="!shopName" class="next-btn">
              Next
              <v-icon right>mdi-arrow-right</v-icon>
            </v-btn>
          </v-card-actions>
        </v-card>

        <!-- Step 2: Open Days -->
        <v-card v-if="currentStep === 2" class="mb-4 step-card" variant="outlined">
          <v-card-title class="section-title">
            <v-icon class="mr-2">mdi-calendar</v-icon>
            Open Days
            <v-chip v-if="currentShopId" color="primary" size="small" class="ml-2">
              Pre-filled
            </v-chip>
          </v-card-title>
          <v-card-text>
            <div class="open-days">
              <v-chip v-for="day in daysOfWeek" :key="day.id"
                :color="openDays.includes(day.id) ? 'primary' : 'grey-lighten-2'"
                :variant="openDays.includes(day.id) ? 'flat' : 'outlined'" class="ma-1 day-chip"
                @click="toggleDay(day.id)">
                {{ day.label }}
              </v-chip>
            </div>
          </v-card-text>
          <v-card-actions class="step-actions">
            <v-btn variant="outlined" @click="prevStep" class="prev-btn">
              <v-icon left>mdi-arrow-left</v-icon>
              Back
            </v-btn>
            <v-btn color="primary" @click="nextStep" class="next-btn">
              Next
              <v-icon right>mdi-arrow-right</v-icon>
            </v-btn>
          </v-card-actions>
        </v-card>

        <!-- Step 3: Operating Hours -->
        <v-card v-if="currentStep === 3" class="mb-4 step-card" variant="outlined">
          <v-card-title class="section-title">
            <v-icon class="mr-2">mdi-clock</v-icon>
            Operating Hours
            <v-chip v-if="currentShopId" color="primary" size="small" class="ml-2">
              Pre-filled
            </v-chip>
          </v-card-title>
          <v-card-text>
            <v-row>
              <v-col cols="6">
                <v-text-field v-model="openTime" type="time" label="Opening Time" outlined />
              </v-col>
              <v-col cols="6">
                <v-text-field v-model="closeTime" type="time" label="Closing Time" outlined />
              </v-col>
            </v-row>
          </v-card-text>
          <v-card-actions class="step-actions">
            <v-btn variant="outlined" @click="prevStep" class="prev-btn">
              <v-icon left>mdi-arrow-left</v-icon>
              Back
            </v-btn>
            <v-btn color="primary" @click="nextStep" class="next-btn">
              Next
              <v-icon right>mdi-arrow-right</v-icon>
            </v-btn>
          </v-card-actions>
        </v-card>

        <!-- Step 4: Delivery Options -->
        <v-card v-if="currentStep === 4" class="mb-4 step-card" variant="outlined">
          <v-card-title class="section-title">
            <v-icon class="mr-2">mdi-truck</v-icon>
            Delivery Options
            <v-chip v-if="currentShopId" color="primary" size="small" class="ml-2">
              Pre-filled
            </v-chip>
          </v-card-title>
          <v-card-text>
            <v-checkbox v-model="deliveryOptions" label="Call a Courier" value="courier" />
            <v-checkbox v-model="deliveryOptions" label="Pickup" value="pickup" />
            <v-checkbox v-model="deliveryOptions" label="Meet-up" value="meetup" />
            <v-text-field v-if="deliveryOptions.includes('meetup')" v-model="meetUpDetails" label="Meet-up details"
              outlined class="mt-2" />
          </v-card-text>
          <v-card-actions class="step-actions">
            <v-btn variant="outlined" @click="prevStep" class="prev-btn">
              <v-icon left>mdi-arrow-left</v-icon>
              Back
            </v-btn>
            <v-btn color="primary" @click="nextStep" class="next-btn">
              Next
              <v-icon right>mdi-arrow-right</v-icon>
            </v-btn>
          </v-card-actions>
        </v-card>

        <!-- Step 5: Location -->
        <v-card v-if="currentStep === 5" class="mb-4 step-card" variant="outlined">
          <v-card-title class="section-title">
            <v-icon class="mr-2">mdi-map-marker</v-icon>
            Location
            <v-chip v-if="currentShopId" color="primary" size="small" class="ml-2">
              Pre-filled
            </v-chip>
          </v-card-title>
          <v-card-text>
            <v-radio-group v-model="addressOption" inline class="mb-4">
              <v-radio label="Enter address manually" value="manual" />
              <v-radio label="Set current location as shop address" value="map" />
            </v-radio-group>

            <div v-if="addressOption === 'manual'">
              <!-- PSGC Address Fields -->
              <v-row>
                <v-col cols="12">
                  <v-select v-model="selectedRegion" :items="regions" item-title="name" item-value="code"
                    label="Region *" outlined :loading="loadingRegions" />
                </v-col>
                <v-col cols="12">
                  <v-select v-model="selectedProvince" :items="provinces" item-title="name" item-value="code"
                    label="Province *" outlined :disabled="!selectedRegion" :loading="loadingProvinces" />
                </v-col>
                <v-col cols="12">
                  <v-select v-model="selectedCity" :items="cities" item-title="name" item-value="code"
                    label="City / Municipality *" outlined :disabled="!selectedProvince" :loading="loadingCities" />
                </v-col>
                <v-col cols="12">
                  <v-select v-model="selectedBarangay" :items="barangaysList" item-title="name" item-value="code"
                    label="Barangay *" outlined :disabled="!selectedCity" :loading="loadingBarangays" />
                </v-col>
              </v-row>

              <!-- Additional Address Details -->
              <v-row>
                <v-col cols="12" sm="6">
                  <v-text-field v-model="address.house_no.value" label="House No." outlined />
                </v-col>
                <v-col cols="12" sm="6">
                  <v-text-field v-model="address.building.value" label="Building Name" outlined />
                </v-col>
                <v-col cols="12" sm="6">
                  <v-text-field v-model="address.street.value" label="Street" outlined />
                </v-col>
                <v-col cols="12" sm="6">
                  <v-text-field v-model="address.postal.value" label="Postal Code" outlined />
                </v-col>
              </v-row>

              <v-text-field v-if="fullAddress" v-model="fullAddress" label="Full Address" readonly outlined
                class="mt-2" />

              <h4 class="text-center mb-2 mt-4">Please drag/tap your location in the map</h4>

              <v-btn color="secondary" @click="toggleFullscreen" class="mb-2">
                Toggle Map Fullscreen
              </v-btn>

              <!-- Search Section -->
              <div class="search-section">
                <v-text-field v-model="searchQuery" label="Search place" outlined append-inner-icon="mdi-magnify"
                  @keyup.enter="searchPlace" @click:clear="clearSearch" clearable class="mb-2" />

                <v-btn color="primary" @click="searchPlace" class="mb-3 search-btn" :loading="searchLoading"
                  :disabled="!searchQuery.trim()" block>
                  <v-icon left>mdi-magnify</v-icon>
                  Search
                </v-btn>

                <v-card v-if="showSearchResults && searchResults.length > 0" class="search-results" elevation="4">
                  <v-list density="compact">
                    <v-list-subheader>Search Results</v-list-subheader>
                    <v-list-item v-for="(result, index) in searchResults" :key="index"
                      @click="selectSearchResult(result)" class="search-result-item">
                      <v-list-item-title class="text-body-2">
                        {{ result.display_name }}
                      </v-list-item-title>
                    </v-list-item>
                  </v-list>
                </v-card>
              </div>
            </div>
          </v-card-text>

          <!-- Map -->
          <div id="map" class="map">
            <v-btn icon @click="getLocation" class="locate-btn">
              <v-icon>mdi-crosshairs-gps</v-icon>
            </v-btn>
          </div>

          <div v-if="addressOption === 'map'" class="pa-4">
            <v-btn block color="primary" @click="getLocation" class="mt-2 mb-4">
              Set my location as shop address
            </v-btn>
            <v-text-field v-if="fullAddress" v-model="fullAddress" label="Detected Address" outlined readonly />
          </div>

          <v-card-actions class="step-actions">
            <v-btn variant="outlined" @click="prevStep" class="prev-btn">
              <v-icon left>mdi-arrow-left</v-icon>
              Back
            </v-btn>
            <v-btn color="primary" @click="nextStep" class="next-btn">
              Next
              <v-icon right>mdi-arrow-right</v-icon>
            </v-btn>
          </v-card-actions>
        </v-card>

        <!-- Step 6: Valid ID Upload -->
        <v-card v-if="currentStep === 6" class="mb-4 step-card" variant="outlined">
          <v-card-title class="section-title">
            <v-icon class="mr-2">mdi-card-account-details</v-icon>
            Valid ID Upload
            <v-chip v-if="currentShopId" color="primary" size="small" class="ml-2">
              Pre-filled
            </v-chip>
          </v-card-title>

          <v-card-text>
            <!-- Upload Instructions -->
            <v-alert type="info" variant="tonal" class="mb-4">
              <template #title>
                <strong>Upload Requirements</strong>
              </template>
              <div class="text-caption">
                • Upload clear images of both front and back of your valid ID<br>
                • Ensure all details are readable<br>
                • Accepted formats: JPG, PNG<br>
                • Maximum file size: 5MB
              </div>
            </v-alert>

            <!-- ID Upload Cards -->
            <v-row class="mb-4">
              <!-- Front ID Card -->
              <v-col cols="12" md="6">
                <v-card variant="outlined" class="id-upload-card" :class="{ 'has-image': validIdFrontUrl }">
                  <v-card-title class="text-subtitle-1 d-flex align-center">
                    <v-icon color="primary" class="mr-2">mdi-card-bulleted-outline</v-icon>
                    Valid ID Front
                    <v-chip v-if="validIdFrontUrl" color="success" size="x-small" class="ml-2">
                      Uploaded
                    </v-chip>
                  </v-card-title>

                  <v-card-text class="text-center pa-4">
                    <!-- Image Preview -->
                    <div class="image-preview-container mb-4">
                      <v-img v-if="validIdFrontUrl" :src="validIdFrontUrl" :max-height="200"
                        class="id-preview-image mx-auto" cover style="border-radius: 8px;">
                        <template #placeholder>
                          <v-skeleton-loader type="image" />
                        </template>
                      </v-img>

                      <!-- Placeholder when no image -->
                      <div v-else class="placeholder-container">
                        <v-icon size="64" color="grey-lighten-1" class="mb-2">mdi-account-card-details</v-icon>
                        <div class="text-caption text-grey">No ID front uploaded</div>
                      </div>
                    </div>

                    <!-- Upload Button -->
                    <v-btn color="primary" variant="outlined"
                      @click="pickerTarget = 'valid_id_front'; showPicker = true" block class="upload-btn">
                      <v-icon left>{{ validIdFrontUrl ? 'mdi-reload' : 'mdi-upload' }}</v-icon>
                      {{ validIdFrontUrl ? 'Replace Front ID' : 'Upload Front ID' }}
                    </v-btn>
                  </v-card-text>
                </v-card>
              </v-col>

              <!-- Back ID Card -->
              <v-col cols="12" md="6">
                <v-card variant="outlined" class="id-upload-card" :class="{ 'has-image': validIdBackUrl }">
                  <v-card-title class="text-subtitle-1 d-flex align-center">
                    <v-icon color="primary" class="mr-2">mdi-card-bulleted</v-icon>
                    Valid ID Back
                    <v-chip v-if="validIdBackUrl" color="success" size="x-small" class="ml-2">
                      Uploaded
                    </v-chip>
                  </v-card-title>

                  <v-card-text class="text-center pa-4">
                    <!-- Image Preview -->
                    <div class="image-preview-container mb-4">
                      <v-img v-if="validIdBackUrl" :src="validIdBackUrl" :max-height="200"
                        class="id-preview-image mx-auto" cover style="border-radius: 8px;">
                        <template #placeholder>
                          <v-skeleton-loader type="image" />
                        </template>
                      </v-img>

                      <!-- Placeholder when no image -->
                      <div v-else class="placeholder-container">
                        <v-icon size="64" color="grey-lighten-1" class="mb-2">mdi-account-card-details-outline</v-icon>
                        <div class="text-caption text-grey">No ID back uploaded</div>
                      </div>
                    </div>

                    <!-- Upload Button -->
                    <v-btn color="primary" variant="outlined" @click="pickerTarget = 'valid_id_back'; showPicker = true"
                      block class="upload-btn">
                      <v-icon left>{{ validIdBackUrl ? 'mdi-reload' : 'mdi-upload' }}</v-icon>
                      {{ validIdBackUrl ? 'Replace Back ID' : 'Upload Back ID' }}
                    </v-btn>
                  </v-card-text>
                </v-card>
              </v-col>
            </v-row>

            <!-- Upload Status -->
            <v-alert v-if="uploading" type="info" variant="tonal" class="mb-2">
              <div class="d-flex align-center">
                <v-progress-circular indeterminate size="20" width="2" class="mr-3" />
                Uploading ID image...
              </div>
            </v-alert>

            <!-- Validation Status -->
            <div v-if="validIdFrontUrl && validIdBackUrl" class="text-center">
              <v-chip color="success" variant="flat" class="mb-2">
                <v-icon start>mdi-check-circle</v-icon>
                Both ID images uploaded successfully
              </v-chip>
              <div class="text-caption text-medium-emphasis">
                Ready to save your shop information
              </div>
            </div>

            <div v-else-if="validIdFrontUrl || validIdBackUrl" class="text-center">
              <v-chip color="warning" variant="flat" class="mb-2">
                <v-icon start>mdi-alert-circle</v-icon>
                Please upload both front and back of your ID
              </v-chip>
            </div>
          </v-card-text>

          <v-card-actions class="step-actions">
            <v-btn variant="outlined" @click="prevStep" class="prev-btn">
              <v-icon left>mdi-arrow-left</v-icon>
              Back
            </v-btn>
            <v-btn color="#3f83c7" :loading="saving" @click="saveShop" class="text-white save-btn"
              :disabled="!shopName" size="large">
              <v-icon left>{{ saving ? 'mdi-loading' : 'mdi-content-save' }}</v-icon>
              {{ saving ? 'Saving...' : (currentShopId ? 'Update Shop' : 'Save Shop') }}
            </v-btn>
          </v-card-actions>
        </v-card>
      </div>

      <!-- Snackbar -->
      <v-snackbar v-model="snackbar" :color="snackbarColor" timeout="3000">
        {{ snackbarMessage }}
      </v-snackbar>

      <!-- Image Picker Dialog -->
      <v-dialog v-model="showPicker" max-width="400">
        <v-card>
          <v-card-title class="headline">Pick Image Source</v-card-title>
          <v-card-text class="text-center">
            Choose how you want to upload the image
          </v-card-text>
          <v-card-actions class="justify-center pb-4">
            <v-btn color="primary" @click="pickImage('camera')" class="mr-2">
              <v-icon left>mdi-camera</v-icon>
              Use Camera
            </v-btn>
            <v-btn color="primary" @click="pickImage('gallery')">
              <v-icon left>mdi-image</v-icon>
              Use Gallery
            </v-btn>
          </v-card-actions>
        </v-card>
      </v-dialog>
    </v-main>
  </v-app>
</template>

<style scoped>
.app-bar {
  padding-top: 22px;
}

.pb-16 {
  padding-top: 75px !important;
}
.steps-card {
  border-radius: 0;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  margin-bottom: 8px;
}

.steps-container {
  padding: 16px;
}

.steps {
  display: flex;
  justify-content: space-between;
  position: relative;
  margin-bottom: 16px;
}

.step {
  display: flex;
  flex-direction: column;
  align-items: center;
  position: relative;
  z-index: 2;
  flex: 1;
}

.step-icon {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: #e0e0e0;
  color: #757575;
  margin-bottom: 8px;
  transition: all 0.3s ease;
}

.step.active .step-icon {
  background-color: #3f83c7;
  color: white;
  transform: scale(1.1);
  box-shadow: 0 4px 8px rgba(63, 131, 199, 0.3);
}

.step.completed .step-icon {
  background-color: #4caf50;
  color: white;
}

.step-title {
  font-size: 0.75rem;
  font-weight: 500;
  text-align: center;
  color: #757575;
  transition: all 0.3s ease;
}

.step.active .step-title {
  color: #3f83c7;
  font-weight: 600;
}

.step.completed .step-title {
  color: #4caf50;
}

.step-progress {
  margin-top: 8px;
}

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

.form-section {
  margin-top: 70px;
  background: #fff;
  border-radius: 12px;
  position: relative;
  z-index: 5;
  padding-top: 20px;
}

.step-card {
  border-radius: 12px;
  overflow: hidden;
  transition: all 0.3s ease;
}

.section-title {
  color: #3f83c7;
  font-weight: 600;
  margin: 0;
  font-size: 1.1rem;
  padding-bottom: 16px;
  border-bottom: 1px solid #e0e0e0;
}

.step-actions {
  display: flex;
  justify-content: space-between;
  padding: 16px;
  border-top: 1px solid #e0e0e0;
  background-color: #fafafa;
}

.prev-btn, .next-btn {
  min-width: 120px;
}

.open-days {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  margin-bottom: 16px;
}

.day-chip {
  cursor: pointer;
  transition: all 0.2s ease;
}

.day-chip:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
}

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

.placeholder-image {
  width: 150px;
  height: 100px;
  border: 2px dashed #ccc;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #999;
  border-radius: 8px;
}

.save-btn {
  font-weight: bold;
  font-size: 1rem;
  height: 48px;
  background-color: #3f83c7;
}

@media (max-width: 768px) {
  .steps {
    flex-wrap: wrap;
  }

  .step {
    flex: 0 0 33.333%;
    margin-bottom: 16px;
  }

  .step-title {
    font-size: 0.7rem;
  }

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

  .open-days {
    justify-content: flex-start;
  }

  .section-title {
    font-size: 1rem;
  }

  .step-actions {
    flex-direction: column;
    gap: 12px;
  }

  .prev-btn, .next-btn, .save-btn {
    width: 100%;
  }
}

@media (max-width: 480px) {
  .step {
    flex: 0 0 50%;
  }

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

  .cover-section {
    height: 180px;
  }

  .cover-photo {
    height: 180px;
  }
}

.logo-avatar,
.logo-upload-btn,
.cover-upload {
  transition: all 0.3s ease;
}

.logo-avatar:hover {
  transform: scale(1.05);
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.4);
}

.step-card {
  animation: fadeIn 0.5s ease;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
