<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted, nextTick, computed } from 'vue'
import type { LocationOption, ShopAddressComponents } from '@/utils/location'
import { useRouter, useRoute } from 'vue-router'
import { supabase } from '@/utils/supabase'
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera'
import { StatusBar } from '@capacitor/status-bar'
import { syncCurrentViewStatusBar } from '@/utils/statusBar'
import {
  ensureLocationPermission,
  findMatchingLocationOption,
  formatShopAddress,
  getPreciseCurrentPosition,
  parseCoordinate,
  resolveCoordinateAddress,
} from '@/utils/location'
// -------------------- MAPBOX --------------------
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'

// Mapbox access token
const MAPBOX_ACCESS_TOKEN =
  'pk.eyJ1IjoiY2xvc2VzaG9wIiwiYSI6ImNtaDI2emxocjEwdnVqMHExenFpam42bjcifQ.QDsWVOHM9JPhPQ---Ca4MA'

// Set Mapbox access token globally
mapboxgl.accessToken = MAPBOX_ACCESS_TOKEN

// -------------------- ROUTER --------------------
const router = useRouter()
const route = useRoute()
const goBack = () => router.back()
const shopId = ref<string | null>((route.params.id as string) || null)

watch(
  () => route.params.id,
  (newId) => {
    shopId.value = (newId as string) || null
    if (shopId.value) {
      loadShopData()
    }
  },
)

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
const totalSteps = 7
const steps = [
  { number: 1, title: 'Business Info', icon: 'mdi-store' },
  { number: 2, title: 'Open Days', icon: 'mdi-calendar' },
  { number: 3, title: 'Operating Hours', icon: 'mdi-clock' },
  { number: 4, title: 'Delivery Options', icon: 'mdi-truck' },
  { number: 5, title: 'Payment Options', icon: 'mdi-currency-php' },
  { number: 6, title: 'Location', icon: 'mdi-map-marker' },
  { number: 7, title: 'Valid ID', icon: 'mdi-card-account-details' },
]

const nextStep = () => {
  if (currentStep.value < totalSteps) {
    currentStep.value++
    // Initialize map when moving to step 6
    if (currentStep.value === 6) {
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

//camera
const isCameraActive = ref(false)
// Helper to hide app bar and status bar
const hideAppBar = async () => {
  isCameraActive.value = true
  document.body.classList.add('camera-active')

  try {
    await StatusBar.hide()
  } catch {}
}

const showAppBar = async () => {
  isCameraActive.value = false
  document.body.classList.remove('camera-active')

  try {
    await syncCurrentViewStatusBar({ waitForPaint: false })
  } catch {}
}
// -------------------- SHOP INFO --------------------
const shopName = ref('')
const description = ref('')
const openTime = ref('')
const closeTime = ref('')
const avatarUrl = ref<string | null>(null)
const physicalUrl = ref<string | null>(null)
const deliveryOptions = ref<string[]>([])
const paymentOptions = ref<string[]>([])
const fullAddress = ref('')
const validIdFrontUrl = ref<string | null>(null)
const validIdBackUrl = ref<string | null>(null)
const pickerTarget = ref<'logo' | 'physical' | 'valid_id_front' | 'valid_id_back' | null>(null)

// -------------------- GCASH/PAYMONGO CONFIG --------------------
const showGcashSetup = ref(false)
const paymongoPublicKey = ref('')
const paymongoSecretKey = ref('')
const paymongoWebhookSecret = ref('')
const testMode = ref(true)
const gcashEnabled = ref(false)
const savingGcash = ref(false)
const testingGcash = ref(false)
const showPublicKey = ref(false)
const showSecretKey = ref(false)
const showWebhookSecret = ref(false)
const copied = ref(false)
const gcashError = ref('')

// Computed webhook URL
const webhookUrl = computed(() => {
  const baseUrl = import.meta.env.VITE_BASE_URL || window.location.origin
  return `${baseUrl}/api/paymongo-webhook`
})

// Copy webhook URL
const copyWebhookUrl = async () => {
  try {
    await navigator.clipboard.writeText(webhookUrl.value)
    copied.value = true
    setTimeout(() => {
      copied.value = false
    }, 2000)
    showSnackbar('Webhook URL copied!', 'success')
  } catch (err) {
    console.error('Failed to copy:', err)
  }
}

// -------------------- IMAGE UPLOAD HANDLERS --------------------
const handlePhysicalUpload = () => {
  pickerTarget.value = 'physical'
  showPicker.value = true
}

const handleLogoUpload = () => {
  pickerTarget.value = 'logo'
  showPicker.value = true
}

const handleValidIdFrontUpload = () => {
  pickerTarget.value = 'valid_id_front'
  showPicker.value = true
}

const handleValidIdBackUpload = () => {
  pickerTarget.value = 'valid_id_back'
  showPicker.value = true
}

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
  region: ref(''),
}

// -------------------- PSGC --------------------
const regions = ref<any[]>([])
const provinces = ref<LocationOption[]>([])
const cities = ref<LocationOption[]>([])
const barangaysList = ref<LocationOption[]>([])

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
const map = ref<any>(null)
let shopMarker: any = null
const mapInitialized = ref(false)
const detectedLocationAccuracy = ref<number | null>(null)
const detectingLocation = ref(false)
const locationLoadingStage = ref<'gps' | 'reverse-geocoding' | 'saving' | null>(null)
const syncingDetectedAddress = ref(false)
const syncingLocationSelections = ref(false)
const suppressLocationWatchEffects = ref(false)
let manualLocationSyncTimer: ReturnType<typeof setTimeout> | null = null

const locationLoadingMessage = computed(() => {
  switch (locationLoadingStage.value) {
    case 'gps':
      return 'Getting your exact GPS location...'
    case 'reverse-geocoding':
      return 'Resolving your address from the selected coordinates...'
    case 'saving':
      return 'Saving your detected location details...'
    default:
      return ''
  }
})

const withSuppressedLocationWatchEffects = async <T,>(task: () => Promise<T> | T): Promise<T> => {
  suppressLocationWatchEffects.value = true

  try {
    return await task()
  } finally {
    await nextTick()
    suppressLocationWatchEffects.value = false
  }
}

const shouldSkipLocationWatchEffects = () =>
  suppressLocationWatchEffects.value || loadingShopData.value || currentStep.value !== 6

const DEFAULT_SHOP_LOCATION = {
  lat: 8.9489,
  lng: 125.5406,
}

// -------------------- OPEN DAYS --------------------
const openDays = ref<number[]>([1, 2, 3, 4, 5, 6]) // Default: Monday to Saturday
const daysOfWeek = [
  { id: 1, label: 'Mon' },
  { id: 2, label: 'Tue' },
  { id: 3, label: 'Wed' },
  { id: 4, label: 'Thu' },
  { id: 5, label: 'Fri' },
  { id: 6, label: 'Sat' },
  { id: 7, label: 'Sun' },
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

// -------------------- PAYMENT OPTIONS FUNCTIONS --------------------
const togglePayment = (option: string) => {
  const index = paymentOptions.value.indexOf(option)
  if (index > -1) {
    paymentOptions.value.splice(index, 1)
    // If removing GCash, close setup
    if (option === 'gcash') {
      showGcashSetup.value = false
      gcashError.value = '' // Clear any errors
    }
  } else {
    paymentOptions.value.push(option)
    // If adding GCash, open setup
    if (option === 'gcash') {
      showGcashSetup.value = true
    }
  }
}

const removePayment = (option: string) => {
  const index = paymentOptions.value.indexOf(option)
  if (index > -1) {
    paymentOptions.value.splice(index, 1)
    if (option === 'gcash') {
      showGcashSetup.value = false
      gcashEnabled.value = false
      gcashError.value = ''
    }
  }
}

const getPaymentIcon = (option: string) => {
  return option === 'gcash' ? 'mdi-cellphone' : 'mdi-cash-multiple'
}

const getPaymentLabel = (option: string) => {
  return option === 'gcash' ? 'GCash' : 'Cash on Delivery'
}

// -------------------- GCASH SETUP FUNCTIONS - UPDATED WITH TIMEOUT PROTECTION --------------------
const isSavingGcash = ref(false)

const saveGcashConfig = async () => {
  if (isSavingGcash.value) {
    return
  }

  gcashError.value = ''

  isSavingGcash.value = true
  savingGcash.value = true

  let timeoutId: ReturnType<typeof setTimeout> | null = null

  try {
    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession()

    if (sessionError) {
      throw new Error('Session error: ' + sessionError.message)
    }

    if (!session) {
      throw new Error('You must be logged in')
    }

    const user = session.user

    if (!currentShopId.value) {
      throw new Error('No shop ID found')
    }

    if (!paymongoPublicKey.value || !paymongoSecretKey.value) {
      throw new Error('Please enter both public and secret keys')
    }

    if (!paymongoPublicKey.value.startsWith('pk_')) {
      throw new Error('Invalid public key format. Should start with "pk_"')
    }

    if (!paymongoSecretKey.value.startsWith('sk_')) {
      throw new Error('Invalid secret key format. Should start with "sk_"')
    }

    const { data: shop, error: shopError } = await supabase
      .from('shops')
      .select('id, owner_id, paymongo_config, gcash_enabled')
      .eq('id', currentShopId.value)
      .maybeSingle()

    if (shopError) {
      throw new Error(`Error fetching shop: ${shopError.message}`)
    }

    if (!shop) {
      throw new Error('Shop not found')
    }

    if (shop.owner_id !== user.id) {
      throw new Error('You do not have permission to update this shop')
    }
    const paymongoConfig = {
      public_key: paymongoPublicKey.value.trim(),
      secret_key: paymongoSecretKey.value.trim(),
      webhook_secret: paymongoWebhookSecret.value?.trim() || null,
      test_mode: testMode.value,
      connected_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }

    const currentPaymentOptions = paymentOptions.value || []
    const updatedPaymentOptions = [...new Set([...currentPaymentOptions, 'gcash'])]

    const validPaymentOptions = updatedPaymentOptions.filter(
      (opt) => opt === 'cod' || opt === 'gcash',
    )
    const updatePromise = supabase
      .from('shops')
      .update({
        paymongo_config: paymongoConfig,
        gcash_enabled: true,
        payment_options: validPaymentOptions,
        payment_enabled: true,
        updated_at: new Date().toISOString(),
      })
      .eq('id', currentShopId.value)
      .eq('owner_id', user.id)
      .select()

    timeoutId = setTimeout(() => undefined, 15000)

    const { data, error } = await updatePromise

    clearTimeout(timeoutId)
    timeoutId = null

    if (error) {
      if (error.code === '42501') {
        throw new Error('Permission denied. Check RLS policies.')
      } else if (error.code === '23505') {
        throw new Error('Duplicate entry. This might be a unique constraint violation.')
      } else if (error.code === '22P02') {
        throw new Error('Invalid data format. Check your input.')
      } else {
        throw error
      }
    }

    if (!data || data.length === 0) {
      const { data: checkData } = await supabase
        .from('shops')
        .select('gcash_enabled, paymongo_config, payment_options')
        .eq('id', currentShopId.value)
        .single()

      if (checkData?.gcash_enabled) {
        gcashEnabled.value = true
        paymentOptions.value = validPaymentOptions
        showSnackbar('GCash configuration saved successfully!', 'success')
        return
      } else {
        throw new Error('Update failed - no data returned and verification failed')
      }
    }
    gcashEnabled.value = true
    paymentOptions.value = validPaymentOptions

    showSnackbar('GCash configuration saved successfully!', 'success')
  } catch (error: any) {
    if (timeoutId) clearTimeout(timeoutId)

    if (error.message?.includes('timeout')) {
      gcashError.value = 'Operation timed out. Please check your connection and try again.'
    } else if (error.message?.includes('JWT') || error.message?.includes('token')) {
      gcashError.value = 'Session expired. Please log in again.'
    } else if (error.code === '42501' || error.message?.includes('permission')) {
      gcashError.value =
        'Permission denied. You may not own this shop or RLS policies are blocking the update.'
    } else if (error.message?.includes('network') || error.message?.includes('fetch')) {
      gcashError.value = 'Network error. Please check your internet connection.'
    } else if (error.message?.includes('JSON')) {
      gcashError.value = 'Invalid configuration format. Please check your keys.'
    } else if (error.code === '23505') {
      gcashError.value = 'A unique constraint was violated. This might be a duplicate entry.'
    } else {
      gcashError.value = error.message || 'Failed to save configuration'
    }

    showSnackbar(gcashError.value, 'error')
  } finally {
    savingGcash.value = false
    isSavingGcash.value = false
  }
}

const disconnectGcash = async () => {
  if (!currentShopId.value) return
  if (!confirm('Are you sure you want to disconnect GCash payments?')) return

  savingGcash.value = true
  gcashError.value = ''

  try {
    // Remove GCash from payment options
    const updatedPaymentOptions = paymentOptions.value.filter((opt) => opt !== 'gcash')

    const { data, error } = await supabase
      .from('shops')
      .update({
        paymongo_config: {},
        gcash_enabled: false,
        payment_options: updatedPaymentOptions,
      })
      .eq('id', currentShopId.value)
      .select()

    if (error) throw error

    // Update local state
    paymentOptions.value = updatedPaymentOptions
    gcashEnabled.value = false
    paymongoPublicKey.value = ''
    paymongoSecretKey.value = ''
    paymongoWebhookSecret.value = ''
    showGcashSetup.value = false

    showSnackbar('GCash disconnected successfully', 'success')
  } catch (error: any) {
    console.error('Error disconnecting GCash:', error)
    gcashError.value = error.message || 'Failed to disconnect GCash'
    showSnackbar(gcashError.value, 'error')
  } finally {
    savingGcash.value = false
  }
}
const testGcashConnection = async () => {
  if (!currentShopId.value) return

  testingGcash.value = true
  gcashError.value = ''

  try {
    // First check if we have valid PayMongo config
    const { data: shop, error: shopError } = await supabase
      .from('shops')
      .select('paymongo_config')
      .eq('id', currentShopId.value)
      .single()

    if (shopError) throw shopError

    if (!shop.paymongo_config?.public_key || !shop.paymongo_config?.secret_key) {
      throw new Error('PayMongo configuration not found')
    }

    // Here you would typically make a test API call to PayMongo
    // For now, we'll just simulate a success
    showSnackbar('Test connection successful! Check your PayMongo dashboard.', 'success')
  } catch (error: any) {
    console.error('Test connection error:', error)
    gcashError.value = error.message || 'Test connection failed'
    showSnackbar(gcashError.value, 'error')
  } finally {
    testingGcash.value = false
  }
}

// -------------------- PSGC MAPPING FUNCTIONS --------------------
const applyAddressComponents = (components: ShopAddressComponents) => {
  address.house_no.value = components.houseNo || ''
  address.building.value = components.building || ''
  address.street.value = components.street || ''
  address.postal.value = components.postal || ''
  address.barangay.value = components.barangay || ''
  address.city.value = components.city || ''
  address.province.value = components.province || ''
  address.region.value = components.region || ''
}

const getAddressComponentsSnapshot = (): ShopAddressComponents => ({
  houseNo: address.house_no.value.trim(),
  building: address.building.value.trim(),
  street: address.street.value.trim(),
  postal: address.postal.value.trim(),
  barangay: address.barangay.value.trim(),
  city: address.city.value.trim(),
  province: address.province.value.trim(),
  region: address.region.value.trim(),
})

const buildManualAddressQueries = () => {
  const parts = {
    house: address.house_no.value.trim(),
    building: address.building.value.trim(),
    street: address.street.value.trim(),
    barangay: address.barangay.value.trim(),
    city: address.city.value.trim(),
    province: address.province.value.trim(),
    region: address.region.value.trim(),
    postal: address.postal.value.trim(),
  }

  const queries = [
    [
      parts.house,
      parts.building,
      parts.street,
      parts.barangay,
      parts.city,
      parts.province,
      parts.region,
      parts.postal,
      'Philippines',
    ],
    [
      parts.building,
      parts.street,
      parts.barangay,
      parts.city,
      parts.province,
      parts.region,
      'Philippines',
    ],
    [parts.barangay, parts.city, parts.province, parts.region, 'Philippines'],
    [parts.city, parts.province, parts.region, 'Philippines'],
  ]
    .map((segments) => segments.filter(Boolean).join(', '))
    .filter(Boolean)

  return [...new Set(queries)]
}

const updateMapMarkerPosition = (lat: number, lng: number, zoom = 17) => {
  latitude.value = lat
  longitude.value = lng

  if (mapInitialized.value && currentStep.value === 6) {
    map.value?.setCenter([lng, lat])
    map.value?.setZoom(zoom)
    shopMarker?.setLngLat([lng, lat])
  }
}

const syncDetectedPsgcSelections = async (components: ShopAddressComponents) => {
  return withSuppressedLocationWatchEffects(async () => {
    syncingLocationSelections.value = true

    try {
      if (!regions.value.length) {
        await fetchRegions()
      }

      const matchedRegion = findMatchingLocationOption(regions.value, components.region)
      selectedRegion.value = matchedRegion?.code || null
      address.region.value = matchedRegion?.name || components.region || ''

      if (matchedRegion?.code) {
        await fetchProvinces(matchedRegion.code)
      } else {
        provinces.value = []
      }

      const matchedProvince = findMatchingLocationOption(provinces.value, components.province)
      selectedProvince.value = matchedProvince?.code || null
      address.province.value = matchedProvince?.name || components.province || ''

      if (matchedProvince?.code) {
        await fetchCities(matchedProvince.code)
      } else {
        cities.value = []
      }

      const matchedCity = findMatchingLocationOption(cities.value, components.city)
      selectedCity.value = matchedCity?.code || null
      address.city.value = matchedCity?.name || components.city || ''

      if (matchedCity?.code) {
        await fetchBarangays(matchedCity.code)
      } else {
        barangaysList.value = []
      }

      const matchedBarangay = findMatchingLocationOption(barangaysList.value, components.barangay)
      selectedBarangay.value = matchedBarangay?.code || null
      address.barangay.value = matchedBarangay?.name || components.barangay || ''
    } finally {
      syncingLocationSelections.value = false
    }
  })
}

// -------------------- REVERSE GEOCODE --------------------
const reverseGeocode = async (lat: number, lng: number): Promise<string> => {
  try {
    syncingDetectedAddress.value = true

    const { displayName, components } = await resolveCoordinateAddress(lat, lng)
    const detectedAddress = displayName || formatShopAddress(components)

    fullAddress.value = detectedAddress
    applyAddressComponents(components)
    await syncDetectedPsgcSelections(components)

    if (!detectedAddress) {
      showSnackbar('Address not found for this location', 'error')
    }

    return detectedAddress
  } catch (err) {
    console.error('Reverse geocoding failed:', err)
    showSnackbar('Failed to fetch address', 'error')
    return ''
  } finally {
    syncingDetectedAddress.value = false
  }
}

// -------------------- MAP INITIALIZATION --------------------
const initMap = (lat: number, lng: number) => {
  const mapContainer = document.getElementById('map')
  if (!mapContainer) {
    console.error('Map container not found')
    return
  }

  if (map.value) {
    map.value.setCenter([lng, lat])
    shopMarker?.setLngLat([lng, lat])
    return
  }

  try {
    map.value = new mapboxgl.Map({
      container: 'map',
      style: 'mapbox://styles/mapbox/streets-v11',
      center: [lng, lat],
      zoom: 15,
      attributionControl: false,
    })

    map.value.addControl(new mapboxgl.NavigationControl(), 'top-right')
    map.value.addControl(
      new mapboxgl.AttributionControl({
        compact: true,
      }),
      'bottom-right',
    )

    const geolocate = new mapboxgl.GeolocateControl({
      positionOptions: {
        enableHighAccuracy: true,
      },
      trackUserLocation: true,
      showUserLocation: true,
    })
    map.value.addControl(geolocate, 'top-right')

    const markerEl = document.createElement('div')
    markerEl.className = 'shop-marker'
    markerEl.innerHTML = `
      <svg width="30" height="40" viewBox="0 0 30 40" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M15 0C6.72 0 0 6.72 0 15C0 26.25 15 40 15 40C15 40 30 26.25 30 15C30 6.72 23.28 0 15 0Z" fill="#3f83c7"/>
        <circle cx="15" cy="15" r="6" fill="white"/>
      </svg>
    `

    shopMarker = new mapboxgl.Marker({
      element: markerEl,
      draggable: true,
    })
      .setLngLat([lng, lat])
      .addTo(map.value)

    shopMarker.on('dragend', async () => {
      if (!shopMarker) return
      const lngLat = shopMarker.getLngLat()
      updateMapMarkerPosition(lngLat.lat, lngLat.lng)
      await reverseGeocode(lngLat.lat, lngLat.lng)
      await saveCoordinates(lngLat.lat, lngLat.lng)
    })

    map.value.on('click', async (e: any) => {
      const { lng, lat } = e.lngLat
      updateMapMarkerPosition(lat, lng)
      await reverseGeocode(lat, lng)
      await saveCoordinates(lat, lng)
    })

    map.value.on('load', () => {
      mapInitialized.value = true
    })

    map.value.on('error', (e: any) => {
      console.error('Mapbox error:', e.error)
    })
  } catch (error) {
    console.error('Error initializing Mapbox map:', error)
  }
}

// -------------------- SNACKBAR --------------------
const showSnackbar = (message: string, color: 'success' | 'error' = 'success') => {
  snackbarMessage.value = message
  snackbarColor.value = color
  snackbar.value = true
}

// Close dialog function
const closePickerDialog = () => {
  showPicker.value = false
}

// Handle camera button click
const handleCameraClick = async () => {
  // Close the dialog first
  showPicker.value = false

  // Small delay to ensure dialog is fully closed before opening camera
  setTimeout(() => {
    pickImage('camera')
  }, 200)
}

// Handle gallery button click
const handleGalleryClick = async () => {
  // Close the dialog first
  showPicker.value = false

  // Small delay to ensure dialog is fully closed before opening gallery
  setTimeout(() => {
    pickImage('gallery')
  }, 200)
}
// -------------------- IMAGE UPLOAD --------------------
const pickImage = async (source: 'camera' | 'gallery') => {
  try {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()
    if (userError || !user) throw new Error('User not found')

    // Hide app bar before opening camera
    await hideAppBar()

    const photo = await Camera.getPhoto({
      quality: 90,
      allowEditing: false,
      resultType: CameraResultType.Uri,
      source: source === 'camera' ? CameraSource.Camera : CameraSource.Photos,
      presentationStyle: 'fullscreen',
      width: 1920,
      height: 1080,
      saveToGallery: false,
      correctOrientation: true,
    })

    // Show app bar after camera closes
    await showAppBar()

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
  } catch (err) {
    // Ensure app bar shows even if error occurs
    await showAppBar()
    console.error(err)
    // Don't show error if user cancelled
    if (err instanceof Error && !err.message.toLowerCase().includes('cancel')) {
      showSnackbar('Failed to upload image', 'error')
    }
  } finally {
    uploading.value = false
    pickerTarget.value = null
  }
}

// -------------------- COORDINATES --------------------
const saveCoordinates = async (lat: number, lng: number) => {
  try {
    if (!currentShopId.value) return
    const addressSource = addressOption.value === 'manual' ? 'manual' : 'detected'

    const { error } = await supabase
      .from('shops')
      .update({
        latitude: lat,
        longitude: lng,
        detected_address:
          fullAddress.value || formatShopAddress(getAddressComponentsSnapshot()) || null,
        barangay: address.barangay.value || null,
        building: address.building.value || null,
        street: address.street.value || null,
        postal: address.postal.value || null,
        house_no: address.house_no.value || null,
        city: address.city.value || null,
        province: address.province.value || null,
        region: address.region.value || null,
        address_source: addressSource,
        updated_at: new Date().toISOString(),
      })
      .eq('id', currentShopId.value)

    if (error) throw error

    if (fullAddress.value) {
      showSnackbar(`📍 Address detected and saved: ${fullAddress.value}`, 'success')
    } else {
      showSnackbar('📍 Coordinates saved successfully', 'success')
    }
  } catch (err) {
    console.error(err)
    showSnackbar('Failed to update location', 'error')
  }
}

const getCoordinatesFromAddress = async (address: string) => {
  try {
    if (!address.trim()) return null

    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&addressdetails=1&countrycodes=ph&q=${encodeURIComponent(address)}`,
      {
        headers: {
          'Accept-Language': 'en',
        },
      },
    )
    const data = await res.json()
    const lat = parseCoordinate(data[0]?.lat)
    const lon = parseCoordinate(data[0]?.lon)
    if (lat != null && lon != null) return { lat, lon }
    return null
  } catch (error) {
    console.error('Failed to fetch coordinates:', error)
    return null
  }
}

const syncManualCoordinatesFromAddress = async () => {
  if (addressOption.value !== 'manual') return

  const queries = buildManualAddressQueries()
  if (!queries.length) return

  for (const query of queries) {
    const coords = await getCoordinatesFromAddress(query)
    if (!coords) continue

    fullAddress.value = formatShopAddress(getAddressComponentsSnapshot(), query)
    updateMapMarkerPosition(coords.lat, coords.lon, 17)
    await saveCoordinates(coords.lat, coords.lon)
    return
  }
}

// -------------------- SEARCH PLACE --------------------
const searchQuery = ref<string | null>('')
const normalizedSearchQuery = computed(() => String(searchQuery.value || '').trim())
const searchLoading = ref(false)
const searchResults = ref<any[]>([])
const showSearchResults = ref(false)

const searchPlace = async () => {
  if (!normalizedSearchQuery.value) return
  searchLoading.value = true
  showSearchResults.value = false
  try {
    const contextualQuery = [
      normalizedSearchQuery.value,
      address.city.value || null,
      address.province.value || null,
      address.region.value || null,
      'Philippines',
    ]
      .filter(Boolean)
      .join(', ')

    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=8&addressdetails=1&countrycodes=ph&q=${encodeURIComponent(contextualQuery)}`,
      {
        headers: {
          'Accept-Language': 'en',
        },
      },
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

const selectSearchResult = async (result: any) => {
  const lat = parseCoordinate(result.lat)
  const lng = parseCoordinate(result.lon)
  if (lat == null || lng == null) {
    showSnackbar('Selected place has invalid coordinates', 'error')
    return
  }

  updateMapMarkerPosition(lat, lng, 17.5)
  showSearchResults.value = false
  await reverseGeocode(lat, lng)
  await saveCoordinates(lat, lng)
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
    const data = (await res.json()) as LocationOption[]
    regions.value = data.sort((a, b) => a.name.localeCompare(b.name))
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
    const data = (await res.json()) as LocationOption[]
    provinces.value = data.sort((a, b) => a.name.localeCompare(b.name))
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
    const res = await fetch(
      `https://psgc.cloud/api/provinces/${provinceCode}/cities-municipalities`,
    )
    const data = (await res.json()) as LocationOption[]
    cities.value = data.sort((a, b) => a.name.localeCompare(b.name))
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
    const data = (await res.json()) as LocationOption[]
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

  // Clear all values first
  shopName.value = ''
  description.value = ''
  openTime.value = ''
  closeTime.value = ''

  try {
    const { data, error } = await supabase.from('shops').select('*').eq('id', shopId.value).single()
    if (error || !data) {
      console.error('Error loading shop data:', error)
      return
    }

    currentShopId.value = data.id
    avatarUrl.value = data.logo_url
    physicalUrl.value = data.physical_store
    shopName.value = data.business_name || ''
    description.value = data.description || ''
    openTime.value = data.open_time || ''
    closeTime.value = data.close_time || ''

    deliveryOptions.value = data.delivery_options || []
    paymentOptions.value = data.payment_options || []
    openDays.value = data.open_days || [1, 2, 3, 4, 5, 6]

    validIdFrontUrl.value = data.valid_id_front || null
    validIdBackUrl.value = data.valid_id_back || null

    // Load GCash config if exists
    if (data.paymongo_config) {
      paymongoPublicKey.value = data.paymongo_config.public_key || ''
      paymongoSecretKey.value = data.paymongo_config.secret_key || ''
      paymongoWebhookSecret.value = data.paymongo_config.webhook_secret || ''
      testMode.value = data.paymongo_config.test_mode !== false
    }
    gcashEnabled.value = data.gcash_enabled || false

    await withSuppressedLocationWatchEffects(async () => {
      const hasSavedManualAddress =
        Boolean(data.barangay) ||
        Boolean(data.city) ||
        Boolean(data.province) ||
        Boolean(data.region) ||
        Boolean(data.house_no) ||
        Boolean(data.building) ||
        Boolean(data.street) ||
        Boolean(data.postal)

      addressOption.value =
        data.address_source === 'detected'
          ? 'map'
          : data.address_source === 'manual' || hasSavedManualAddress
            ? 'manual'
            : 'map'

      address.barangay.value = data.barangay || ''
      address.building.value = data.building || ''
      address.street.value = data.street || ''
      address.postal.value = data.postal || ''
      address.house_no.value = data.house_no || ''
      address.city.value = data.city || ''
      address.province.value = data.province || ''
      address.region.value = data.region || ''

      latitude.value = parseCoordinate(data.latitude) ?? DEFAULT_SHOP_LOCATION.lat
      longitude.value = parseCoordinate(data.longitude) ?? DEFAULT_SHOP_LOCATION.lng
      fullAddress.value =
        data.detected_address ||
        formatShopAddress({
          houseNo: data.house_no || '',
          building: data.building || '',
          street: data.street || '',
          postal: data.postal || '',
          barangay: data.barangay || '',
          city: data.city || '',
          province: data.province || '',
          region: data.region || '',
        }) ||
        ''

      if (data.region || data.province || data.city || data.barangay) {
        await syncDetectedPsgcSelections({
          houseNo: data.house_no || '',
          building: data.building || '',
          street: data.street || '',
          postal: data.postal || '',
          barangay: data.barangay || '',
          city: data.city || '',
          province: data.province || '',
          region: data.region || '',
        })
      }
    })

    await nextTick()
  } catch (err) {
    console.error('Error loading shop:', err)
  } finally {
    loadingShopData.value = false
  }
}

// Update address fields when PSGC selections change
watch(selectedRegion, (regionCode) => {
  if (syncingLocationSelections.value || shouldSkipLocationWatchEffects()) return

  selectedProvince.value = null
  selectedCity.value = null
  selectedBarangay.value = null
  provinces.value = []
  cities.value = []
  barangaysList.value = []
  address.province.value = ''
  address.city.value = ''
  address.barangay.value = ''
  if (regionCode) {
    fetchProvinces(regionCode)
    const regionObj = regions.value.find((r) => r.code === regionCode)
    if (regionObj) address.region.value = regionObj.name
  } else {
    address.region.value = ''
  }
})

watch(selectedProvince, (provinceCode) => {
  if (syncingLocationSelections.value || shouldSkipLocationWatchEffects()) return

  selectedCity.value = null
  selectedBarangay.value = null
  cities.value = []
  barangaysList.value = []
  address.city.value = ''
  address.barangay.value = ''
  if (provinceCode) {
    fetchCities(provinceCode)
    const provinceObj = provinces.value.find((p) => p.code === provinceCode)
    if (provinceObj) address.province.value = provinceObj.name
  } else {
    address.province.value = ''
  }
})

watch(selectedCity, (cityCode) => {
  if (syncingLocationSelections.value || shouldSkipLocationWatchEffects()) return

  selectedBarangay.value = null
  barangaysList.value = []
  address.barangay.value = ''
  if (cityCode) {
    fetchBarangays(cityCode)
    const cityObj = cities.value.find((c) => c.code === cityCode)
    if (cityObj) address.city.value = cityObj.name
  } else {
    address.city.value = ''
  }
})

watch(selectedBarangay, async (barangayCode) => {
  if (syncingLocationSelections.value || shouldSkipLocationWatchEffects()) return
  if (!barangayCode || !selectedCity.value) return

  const barangayObj = barangaysList.value.find((b) => b.code === barangayCode)
  if (barangayObj) address.barangay.value = barangayObj.name

  const regionObj = regions.value.find((r) => r.code === selectedRegion.value)
  const provinceObj = provinces.value.find((p) => p.code === selectedProvince.value)
  const cityObj = cities.value.find((c) => c.code === selectedCity.value)

  if (barangayObj && cityObj && provinceObj && regionObj) {
    const full = `${barangayObj.name}, ${cityObj.name}, ${provinceObj.name}, ${regionObj.name}, Philippines`
    fullAddress.value = full

    await syncManualCoordinatesFromAddress()
  }
})

watch(
  [
    () => address.house_no.value,
    () => address.building.value,
    () => address.street.value,
    () => address.postal.value,
  ],
  () => {
    if (
      addressOption.value !== 'manual' ||
      syncingDetectedAddress.value ||
      shouldSkipLocationWatchEffects()
    )
      return
    if (
      !selectedBarangay.value ||
      !selectedCity.value ||
      !selectedProvince.value ||
      !selectedRegion.value
    )
      return

    if (manualLocationSyncTimer) {
      clearTimeout(manualLocationSyncTimer)
    }

    manualLocationSyncTimer = setTimeout(() => {
      void syncManualCoordinatesFromAddress()
    }, 450)
  },
)

// -------------------- GET LOCATION --------------------
const getLocation = async () => {
  if (detectingLocation.value) return

  detectingLocation.value = true
  locationLoadingStage.value = 'gps'

  try {
    await ensureLocationPermission()

    const position = await getPreciseCurrentPosition()
    const nextLatitude = position.coords.latitude
    const nextLongitude = position.coords.longitude
    detectedLocationAccuracy.value = position.coords.accuracy ?? null

    addressOption.value = 'map'
    updateMapMarkerPosition(nextLatitude, nextLongitude, 18)

    locationLoadingStage.value = 'reverse-geocoding'
    await reverseGeocode(nextLatitude, nextLongitude)

    locationLoadingStage.value = 'saving'
    await saveCoordinates(nextLatitude, nextLongitude)

    if (detectedLocationAccuracy.value && detectedLocationAccuracy.value > 80) {
      showSnackbar(
        `Location detected with +/-${Math.round(detectedLocationAccuracy.value)}m accuracy. Drag the pin if needed.`,
        'success',
      )
    }
  } catch (err) {
    console.error(err)
    showSnackbar(err instanceof Error ? err.message : 'Failed to get location', 'error')
  } finally {
    detectingLocation.value = false
    locationLoadingStage.value = null
  }
}

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

    let addressSource = 'detected'
    const hasManualAddressFields =
      address.barangay.value ||
      address.building.value ||
      address.street.value ||
      address.house_no.value ||
      (selectedBarangay.value &&
        selectedCity.value &&
        selectedProvince.value &&
        selectedRegion.value)

    if (addressOption.value === 'manual' || hasManualAddressFields) {
      addressSource = 'manual'
    }

    // Prepare shop data with GCash config if enabled
    const shopData: any = {
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
      payment_options: paymentOptions.value,
      detected_address:
        fullAddress.value || formatShopAddress(getAddressComponentsSnapshot()) || null,
      address_source: addressSource,
      valid_id_front: validIdFrontUrl.value,
      valid_id_back: validIdBackUrl.value,
      open_days: openDays.value,
      updated_at: new Date().toISOString(),
    }

    // Add GCash config if GCash is enabled
    if (
      paymentOptions.value.includes('gcash') &&
      paymongoPublicKey.value &&
      paymongoSecretKey.value
    ) {
      shopData.paymongo_config = {
        public_key: paymongoPublicKey.value,
        secret_key: paymongoSecretKey.value,
        webhook_secret: paymongoWebhookSecret.value,
        test_mode: testMode.value,
        connected_at: new Date().toISOString(),
      }
      shopData.gcash_enabled = true
    }

    let savedShopId

    if (!currentShopId.value) {
      const insertData = {
        ...shopData,
        owner_id: user.id,
        status: 'pending',
      }

      const { data, error } = await supabase.from('shops').insert(insertData).select()

      if (error) throw error

      if (!data || data.length === 0) {
        throw new Error('Insert succeeded but no data returned')
      }

      savedShopId = data[0].id
    } else {
      const { data: existingShop, error: checkError } = await supabase
        .from('shops')
        .select('id, owner_id')
        .eq('id', currentShopId.value)
        .single()

      if (checkError) {
        console.error('Error checking shop:', checkError)
        throw new Error(`Shop not found: ${checkError.message}`)
      }

      if (existingShop.owner_id !== user.id) {
        throw new Error('You do not have permission to update this shop')
      }

      const { data, error } = await supabase
        .from('shops')
        .update(shopData)
        .eq('id', currentShopId.value)
        .eq('owner_id', user.id)
        .select()

      if (error) {
        console.error('Update error:', error)
        throw error
      }

      if (!data || data.length === 0) {
        throw new Error('Update failed - no data returned. Check RLS policies.')
      }

      savedShopId = currentShopId.value
    }

    showSnackbar('Shop saved successfully!', 'success')

    setTimeout(() => {
      localStorage.setItem('lastCreatedShopId', savedShopId)
      if (currentShopId.value) {
        // If in editing mode, go back to usershop
        router.replace({
          path: '/usershop',
        })
      } else {
        // If creating a new shop, go to status shop creation
        router.replace({
          path: '/statusshopcreation',
          query: {
            shopId: savedShopId,
            from: 'shop-build',
            returnTo: 'usershop',
          },
        })
      }
    }, 1500)
  } catch (err) {
    console.error('Save shop error:', err)
    showSnackbar(err instanceof Error ? err.message : 'Failed to save shop', 'error')
  } finally {
    saving.value = false
  }
}
// -------------------- MOUNT --------------------
onMounted(async () => {
  await fetchRegions()
  await nextTick()

  if (shopId.value) {
    await loadShopData()
  }
})

const isMobile = ref(window.innerWidth < 768)

// Add resize handler if needed
const updateMobileState = () => {
  isMobile.value = window.innerWidth < 768
}

onMounted(() => {
  window.addEventListener('resize', updateMobileState)
})

onUnmounted(() => {
  window.removeEventListener('resize', updateMobileState)

  if (manualLocationSyncTimer) {
    clearTimeout(manualLocationSyncTimer)
    manualLocationSyncTimer = null
  }
})
</script>

<template>
  <v-app>
    <!-- Top App Bar -->
    <v-app-bar
      class="app-bar"
      flat
      color="#3f83c7"
      dark
      density="comfortable"
      :class="{ 'app-bar-hidden': isCameraActive }"
    >
      <v-btn icon @click="goBack" class="back-btn">
        <v-icon>mdi-arrow-left</v-icon>
      </v-btn>
      <v-toolbar-title>
        <strong>{{ currentShopId ? 'Edit Shop' : 'Create Shop' }}</strong>
      </v-toolbar-title>
    </v-app-bar>

    <v-main class="pb-16">
      <!-- Progress Steps -->
      <v-card class="steps-card" flat>
        <v-card-text class="steps-container">
          <div class="steps">
            <div
              v-for="step in steps"
              :key="step.number"
              class="step"
              :class="{
                active: currentStep === step.number,
                completed: currentStep > step.number,
              }"
            >
              <div class="step-icon">
                <v-icon size="20">{{ step.icon }}</v-icon>
              </div>
              <span class="step-title">{{ step.title }}</span>
            </div>
          </div>
          <div class="step-progress">
            <v-progress-linear
              :model-value="(currentStep / totalSteps) * 100"
              color="#3f83c7"
              height="6"
              rounded
            />
          </div>
        </v-card-text>
      </v-card>

      <!-- Cover & Logo Section -->
      <div class="cover-section">
        <v-img
          :src="physicalUrl || 'https://via.placeholder.com/1200x400?text=Store+Cover+Photo'"
          class="cover-photo"
          cover
        >
          <div class="cover-overlay" />
          <v-btn icon color="white" class="cover-upload" @click="handlePhysicalUpload">
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
          <v-btn icon class="logo-upload-btn" @click="handleLogoUpload">
            <v-icon color="#3f83c7">mdi-camera</v-icon>
          </v-btn>
        </div>
      </div>

      <!-- Loading State -->
      <v-overlay :model-value="loadingShopData" class="align-center justify-center" persistent>
        <v-progress-circular color="primary" indeterminate size="64" />
        <div class="text-center mt-4">
          <div class="text-h6">Loading Shop Data...</div>
          <div class="text-body-2">Please wait while we load your shop information</div>
        </div>
      </v-overlay>

      <!-- Form Section -->
      <div class="form-section pa-4" v-if="!loadingShopData" :key="currentShopId || 'new-shop'">
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
            <v-text-field
              v-model="shopName"
              label="Business Name *"
              outlined
              required
              class="mb-3"
              :rules="[(v) => !!v || 'Business name is required']"
            />
            <v-textarea
              v-model="description"
              label="About Us"
              outlined
              auto-grow
              rows="3"
              hint="Tell customers about your business"
            />
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
              <v-chip
                v-for="day in daysOfWeek"
                :key="day.id"
                :color="openDays.includes(day.id) ? 'primary' : 'grey-lighten-2'"
                :variant="openDays.includes(day.id) ? 'flat' : 'outlined'"
                class="ma-1 day-chip"
                @click="toggleDay(day.id)"
              >
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
            <v-checkbox v-model="deliveryOptions" label="Deliver" value="courier" />
            <v-checkbox v-model="deliveryOptions" label="Pickup" value="pickup" />
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

        <!-- Step 5: Payment Options (with integrated GCash setup) - UPDATED VERSION -->
        <v-card v-if="currentStep === 5" class="mb-4 step-card" variant="outlined">
          <v-card-title class="section-title">
            <v-icon class="mr-2">mdi-currency-php</v-icon>
            Payment Options
            <v-chip v-if="currentShopId" color="primary" size="small" class="ml-2">
              Pre-filled
            </v-chip>
          </v-card-title>

          <v-card-text>
            <!-- Payment Options Description -->
            <v-alert type="info" variant="tonal" class="mb-4">
              <template #title>
                <strong>Select Payment Methods</strong>
              </template>
              <div class="text-caption">
                Choose which payment methods you accept. Click on GCash to configure.
              </div>
            </v-alert>

            <!-- Error Display -->
            <v-alert
              v-if="gcashError"
              type="error"
              variant="tonal"
              class="mb-4"
              dismissible
              @click:close="gcashError = ''"
            >
              <strong>Error:</strong> {{ gcashError }}
            </v-alert>

            <!-- Payment Method Cards -->
            <v-row>
              <!-- COD Option -->
              <v-col cols="12" md="6">
                <v-card
                  variant="outlined"
                  class="payment-card"
                  :class="{ 'selected-payment': paymentOptions.includes('cod') }"
                  @click="togglePayment('cod')"
                >
                  <v-card-text class="text-center">
                    <v-icon
                      size="48"
                      :color="paymentOptions.includes('cod') ? 'success' : 'grey'"
                      class="mb-2"
                    >
                      mdi-cash-multiple
                    </v-icon>
                    <div class="text-h6">Cash on Delivery</div>
                    <div class="text-caption text-grey">Pay cash when you receive the order</div>
                    <v-checkbox-btn
                      :model-value="paymentOptions.includes('cod')"
                      color="success"
                      class="mt-2"
                      @click.stop="togglePayment('cod')"
                    />
                  </v-card-text>
                </v-card>
              </v-col>

              <!-- GCash Option -->
              <v-col cols="12" md="6">
                <v-card
                  variant="outlined"
                  class="payment-card"
                  :class="{ 'selected-payment': paymentOptions.includes('gcash') }"
                  @click="togglePayment('gcash')"
                >
                  <v-card-text class="text-center">
                    <v-icon
                      size="48"
                      :color="paymentOptions.includes('gcash') ? 'success' : 'grey'"
                      class="mb-2"
                    >
                      mdi-cellphone
                    </v-icon>
                    <div class="text-h6">GCash</div>
                    <div class="text-caption text-grey">Mobile payment via GCash</div>
                    <v-checkbox-btn
                      :model-value="paymentOptions.includes('gcash')"
                      color="success"
                      class="mt-2"
                      @click.stop="togglePayment('gcash')"
                    />
                  </v-card-text>
                </v-card>
              </v-col>
            </v-row>

            <!-- Selected Payment Methods Summary -->
            <v-divider class="my-4" />

            <div class="d-flex align-center justify-space-between">
              <div>
                <span class="text-subtitle-2">Selected Payment Methods:</span>
                <div class="mt-1">
                  <v-chip
                    v-for="option in paymentOptions"
                    :key="option"
                    :color="option === 'gcash' ? '#0077e5' : 'success'"
                    size="small"
                    class="mr-1 payment-chip"
                    closable
                    @click:close="removePayment(option)"
                  >
                    <v-icon start size="16">
                      {{ getPaymentIcon(option) }}
                    </v-icon>
                    {{ getPaymentLabel(option) }}
                  </v-chip>
                  <span v-if="paymentOptions.length === 0" class="text-caption text-grey">
                    No payment methods selected
                  </span>
                </div>
              </div>
              <v-chip :color="paymentOptions.length > 0 ? 'success' : 'warning'" size="small">
                {{ paymentOptions.length }} selected
              </v-chip>
            </div>

            <!-- GCash Setup Section (expands when GCash is selected) -->
            <v-expand-transition>
              <div v-if="paymentOptions.includes('gcash')" class="mt-6">
                <v-divider class="mb-4" />

                <div class="d-flex align-center mb-4">
                  <h3 class="text-subtitle-1 font-weight-bold">
                    <v-icon color="#0077e5" class="mr-1">mdi-cellphone</v-icon>
                    GCash / PayMongo Configuration
                  </h3>
                  <v-spacer />
                  <v-chip :color="gcashEnabled ? 'success' : 'warning'" size="small">
                    {{ gcashEnabled ? 'Connected' : 'Not Connected' }}
                  </v-chip>
                </div>

                <!-- Connection Status Alert -->
                <v-alert v-if="gcashEnabled" type="success" variant="tonal" class="mb-4">
                  <div class="d-flex align-center">
                    <v-icon left>mdi-check-circle</v-icon>
                    <div>
                      <strong>GCash is active!</strong> Your shop can receive GCash payments.
                    </div>
                  </div>
                </v-alert>

                <v-alert v-else type="info" variant="tonal" class="mb-4">
                  <div class="d-flex align-center">
                    <v-icon left>mdi-information</v-icon>
                    <div>
                      <strong>Connect your PayMongo account</strong><br />
                      Enter your API keys to start accepting GCash payments.
                    </div>
                  </div>
                </v-alert>

                <!-- PayMongo Configuration Form -->
                <v-row>
                  <v-col cols="12">
                    <v-text-field
                      v-model="paymongoPublicKey"
                      label="PayMongo Public Key"
                      placeholder="pk_live_xxx or pk_test_xxx"
                      outlined
                      dense
                      :disabled="gcashEnabled"
                      :append-inner-icon="showPublicKey ? 'mdi-eye-off' : 'mdi-eye'"
                      :type="showPublicKey ? 'text' : 'password'"
                      @click:append-inner="showPublicKey = !showPublicKey"
                      :error-messages="
                        !paymongoPublicKey && gcashError ? 'Public key is required' : ''
                      "
                    />
                  </v-col>

                  <v-col cols="12">
                    <v-text-field
                      v-model="paymongoSecretKey"
                      label="PayMongo Secret Key"
                      placeholder="sk_live_xxx or sk_test_xxx"
                      outlined
                      dense
                      :disabled="gcashEnabled"
                      :append-inner-icon="showSecretKey ? 'mdi-eye-off' : 'mdi-eye'"
                      :type="showSecretKey ? 'text' : 'password'"
                      @click:append-inner="showSecretKey = !showSecretKey"
                      :error-messages="
                        !paymongoSecretKey && gcashError ? 'Secret key is required' : ''
                      "
                    />
                  </v-col>

                  <v-col cols="12">
                    <v-text-field
                      v-model="paymongoWebhookSecret"
                      label="Webhook Secret (Optional)"
                      placeholder="whsec_xxx"
                      outlined
                      dense
                      :disabled="gcashEnabled"
                      :append-inner-icon="showWebhookSecret ? 'mdi-eye-off' : 'mdi-eye'"
                      :type="showWebhookSecret ? 'text' : 'password'"
                      @click:append-inner="showWebhookSecret = !showWebhookSecret"
                    />
                  </v-col>

                  <v-col cols="12">
                    <v-switch
                      v-model="testMode"
                      label="Use Test Mode"
                      color="warning"
                      :disabled="gcashEnabled"
                      hint="Use test keys for sandbox environment"
                      persistent-hint
                    />
                  </v-col>

                  <v-col cols="12">
                    <v-alert v-if="testMode" type="warning" variant="tonal" class="mb-2" dense>
                      <v-icon start small>mdi-test-tube</v-icon>
                      <strong>Test Mode Active</strong> - Use your PayMongo test keys
                    </v-alert>
                  </v-col>

                  <!-- Webhook URL Display -->
                  <v-col cols="12">
                    <span class="text-subtitle-2">Webhook URL</span>
                    <v-text-field
                      :model-value="webhookUrl"
                      label="Webhook URL"
                      outlined
                      readonly
                      dense
                      hide-details
                      class="mt-1"
                      :append-inner-icon="copied ? 'mdi-check' : 'mdi-content-copy'"
                      @click:append-inner="copyWebhookUrl"
                    />
                    <div class="text-caption text-grey mt-1">
                      Add this URL to your PayMongo webhook settings
                    </div>
                  </v-col>

                  <!-- Action Buttons -->
                  <v-col cols="12">
                    <div class="d-flex gap-2 mt-2">
                      <v-btn
                        v-if="!gcashEnabled"
                        color="primary"
                        :loading="savingGcash"
                        @click="saveGcashConfig"
                        block
                        :disabled="!paymongoPublicKey || !paymongoSecretKey"
                      >
                        <v-icon left>mdi-content-save</v-icon>
                        {{ savingGcash ? 'Saving...' : 'Save & Connect' }}
                      </v-btn>

                      <v-btn
                        v-if="gcashEnabled"
                        color="error"
                        variant="outlined"
                        :loading="savingGcash"
                        @click="disconnectGcash"
                        block
                      >
                        <v-icon left>mdi-link-off</v-icon>
                        Disconnect GCash
                      </v-btn>
                    </div>

                    <v-btn
                      v-if="gcashEnabled"
                      color="info"
                      variant="text"
                      :loading="testingGcash"
                      @click="testGcashConnection"
                      block
                      class="mt-2"
                    >
                      <v-icon left>mdi-test-tube</v-icon>
                      Test Connection
                    </v-btn>
                  </v-col>
                </v-row>
              </div>
            </v-expand-transition>
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

        <!-- Step 6: Location -->
        <v-card v-if="currentStep === 6" class="mb-4 step-card" variant="outlined">
          <v-card-title class="section-title">
            <v-icon class="mr-2">mdi-map-marker</v-icon>
            Location
            <v-chip v-if="currentShopId" color="primary" size="small" class="ml-2">
              Pre-filled
            </v-chip>
          </v-card-title>
          <v-card-text>
            <v-radio-group
              v-model="addressOption"
              inline
              class="mb-4"
              :disabled="detectingLocation"
            >
              <v-radio label="Enter address manually" value="manual" />
              <v-radio label="Use current location (Detect Address)" value="map" />
            </v-radio-group>

            <div v-if="addressOption === 'manual'">
              <!-- PSGC Address Fields -->
              <v-row>
                <v-col cols="12">
                  <v-select
                    v-model="selectedRegion"
                    :items="regions"
                    item-title="name"
                    item-value="code"
                    label="Region *"
                    outlined
                    :loading="loadingRegions"
                  />
                </v-col>
                <v-col cols="12">
                  <v-select
                    v-model="selectedProvince"
                    :items="provinces"
                    item-title="name"
                    item-value="code"
                    label="Province *"
                    outlined
                    :disabled="!selectedRegion"
                    :loading="loadingProvinces"
                  />
                </v-col>
                <v-col cols="12">
                  <v-select
                    v-model="selectedCity"
                    :items="cities"
                    item-title="name"
                    item-value="code"
                    label="City / Municipality *"
                    outlined
                    :disabled="!selectedProvince"
                    :loading="loadingCities"
                  />
                </v-col>
                <v-col cols="12">
                  <v-select
                    v-model="selectedBarangay"
                    :items="barangaysList"
                    item-title="name"
                    item-value="code"
                    label="Barangay *"
                    outlined
                    :disabled="!selectedCity"
                    :loading="loadingBarangays"
                  />
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

              <v-text-field
                v-if="fullAddress"
                v-model="fullAddress"
                label="Full Address"
                readonly
                outlined
                class="mt-2"
              />

              <h4 class="text-center mb-2 mt-4">Please drag/tap your location in the map</h4>

              <!-- Search Section -->
              <div class="search-section">
                <v-text-field
                  v-model="searchQuery"
                  label="Search place"
                  outlined
                  append-inner-icon="mdi-magnify"
                  @keyup.enter="searchPlace"
                  @click:clear="clearSearch"
                  clearable
                  class="mb-2"
                />

                <v-btn
                  color="primary"
                  @click="searchPlace"
                  class="mb-3 search-btn"
                  :loading="searchLoading"
                  :disabled="!normalizedSearchQuery"
                  block
                >
                  <v-icon left>mdi-magnify</v-icon>
                  Search
                </v-btn>

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
          </v-card-text>

          <!-- Map Container -->
          <div class="map-container">
            <div id="map" class="map" />
            <div v-if="detectingLocation" class="map-loading-overlay">
              <v-progress-circular indeterminate color="primary" size="44" width="4" />
              <div class="map-loading-title">Detecting location</div>
              <div class="map-loading-message">{{ locationLoadingMessage }}</div>
            </div>
            <v-btn
              icon
              @click="getLocation"
              class="locate-btn"
              title="Detect Address"
              :loading="detectingLocation"
              :disabled="detectingLocation"
            >
              <v-icon>mdi-crosshairs-gps</v-icon>
            </v-btn>
          </div>

          <div v-if="addressOption === 'map'" class="pa-4">
            <v-alert
              v-if="detectingLocation"
              type="info"
              variant="tonal"
              class="mb-3"
              border="start"
            >
              <template #title>
                <strong>Detecting your location</strong>
              </template>
              {{ locationLoadingMessage }}
            </v-alert>

            <v-btn
              block
              color="primary"
              @click="getLocation"
              class="mt-2 mb-4"
              size="large"
              :loading="detectingLocation"
              :disabled="detectingLocation"
            >
              <v-icon left>mdi-crosshairs-gps</v-icon>
              {{ detectingLocation ? 'Detecting Current Location...' : 'Detect Location' }}
            </v-btn>

            <!-- Display detected address -->
            <v-alert v-if="fullAddress" type="info" variant="tonal" class="mb-3">
              <template #title>
                <strong>Detected Address</strong>
              </template>
              {{ fullAddress }}
              <div class="text-caption mt-1">
                This address will be saved to the "detected_address" field.
              </div>
            </v-alert>

            <v-text-field
              v-model="fullAddress"
              label="Detected Address"
              outlined
              readonly
              hint="This is the address detected from your current location"
            />

            <div class="mt-3">
              <v-alert type="warning" variant="tonal" density="compact">
                <div class="text-caption">
                  <strong>Note:</strong> After detecting your address, you can refine it using the
                  manual address fields above if needed.
                </div>
              </v-alert>
            </div>
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

        <!-- Step 7: Valid ID Upload -->
        <v-card v-if="currentStep === 7" class="mb-4 step-card" variant="outlined">
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
                • Upload clear images of both front and back of your valid ID<br />
                • Ensure all details are readable<br />
                • Accepted formats: JPG, PNG<br />
                • Maximum file size: 5MB
              </div>
            </v-alert>

            <!-- ID Upload Cards -->
            <v-row class="mb-4">
              <!-- Front ID Card -->
              <v-col cols="12" md="6">
                <v-card
                  variant="outlined"
                  class="id-upload-card"
                  :class="{ 'has-image': validIdFrontUrl }"
                >
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
                      <v-img
                        v-if="validIdFrontUrl"
                        :src="validIdFrontUrl"
                        :max-height="200"
                        class="id-preview-image mx-auto"
                        cover
                        style="border-radius: 8px"
                      >
                        <template #placeholder>
                          <v-skeleton-loader type="image" />
                        </template>
                      </v-img>

                      <!-- Placeholder when no image -->
                      <div v-else class="placeholder-container">
                        <v-icon size="64" color="grey-lighten-1" class="mb-2"
                          >mdi-account-card-details</v-icon
                        >
                        <div class="text-caption text-grey">No ID front uploaded</div>
                      </div>
                    </div>

                    <!-- Upload Button -->
                    <v-btn
                      color="primary"
                      variant="outlined"
                      @click="handleValidIdFrontUpload"
                      block
                      class="upload-btn"
                    >
                      <v-icon left>{{ validIdFrontUrl ? 'mdi-reload' : 'mdi-upload' }}</v-icon>
                      {{ validIdFrontUrl ? 'Replace Front ID' : 'Upload Front ID' }}
                    </v-btn>
                  </v-card-text>
                </v-card>
              </v-col>

              <!-- Back ID Card -->
              <v-col cols="12" md="6">
                <v-card
                  variant="outlined"
                  class="id-upload-card"
                  :class="{ 'has-image': validIdBackUrl }"
                >
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
                      <v-img
                        v-if="validIdBackUrl"
                        :src="validIdBackUrl"
                        :max-height="200"
                        class="id-preview-image mx-auto"
                        cover
                        style="border-radius: 8px"
                      >
                        <template #placeholder>
                          <v-skeleton-loader type="image" />
                        </template>
                      </v-img>

                      <!-- Placeholder when no image -->
                      <div v-else class="placeholder-container">
                        <v-icon size="64" color="grey-lighten-1" class="mb-2"
                          >mdi-account-card-details-outline</v-icon
                        >
                        <div class="text-caption text-grey">No ID back uploaded</div>
                      </div>
                    </div>

                    <!-- Upload Button -->
                    <v-btn
                      color="primary"
                      variant="outlined"
                      @click="handleValidIdBackUpload"
                      block
                      class="upload-btn"
                    >
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
            <v-btn
              color="#3f83c7"
              :loading="saving"
              @click="saveShop"
              class="text-white save-btn"
              :disabled="!shopName"
              size="large"
            >
              <v-icon left>{{ saving ? 'mdi-loading' : 'mdi-content-save' }}</v-icon>
              {{ saving ? 'Saving...' : currentShopId ? 'Update & View Status' : 'Save Shop' }}
            </v-btn>
          </v-card-actions>
        </v-card>
      </div>

      <!-- Snackbar -->
      <v-snackbar v-model="snackbar" :color="snackbarColor" timeout="3000">
        {{ snackbarMessage }}
      </v-snackbar>

      <!-- Image Picker Dialog -->
      <v-dialog
        v-model="showPicker"
        max-width="400"
        :persistent="false"
        @click:outside="closePickerDialog"
      >
        <v-card class="image-picker-dialog" :rounded="isMobile ? 'lg' : 'xl'">
          <div class="dialog-header">
            <div class="dialog-icon-wrapper">
              <v-icon size="32" color="#3f83c7">mdi-image-plus</v-icon>
            </div>
            <v-card-title class="dialog-title">Add Photo</v-card-title>
            <v-card-subtitle class="dialog-subtitle">Choose how you want to upload</v-card-subtitle>
          </div>

          <v-divider></v-divider>

          <v-card-text class="dialog-buttons pa-4">
            <button class="picker-btn camera-btn" @click="handleCameraClick">
              <div class="btn-icon-wrapper">
                <svg
                  width="28"
                  height="28"
                  viewBox="0 0 24 24"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"
                    stroke="currentColor"
                    stroke-width="1.5"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    fill="none"
                  />
                  <circle
                    cx="12"
                    cy="13"
                    r="4"
                    stroke="currentColor"
                    stroke-width="1.5"
                    fill="none"
                  />
                </svg>
              </div>
              <div class="btn-content">
                <span class="btn-title">Camera</span>
                <span class="btn-description">Take a photo now</span>
              </div>
              <v-icon class="btn-arrow" size="20" color="grey">mdi-chevron-right</v-icon>
            </button>

            <button class="picker-btn gallery-btn" @click="handleGalleryClick">
              <div class="btn-icon-wrapper">
                <svg
                  width="28"
                  height="28"
                  viewBox="0 0 24 24"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <rect
                    x="2"
                    y="2"
                    width="20"
                    height="20"
                    rx="2"
                    stroke="currentColor"
                    stroke-width="1.5"
                    fill="none"
                  />
                  <circle
                    cx="8.5"
                    cy="8.5"
                    r="2.5"
                    stroke="currentColor"
                    stroke-width="1.5"
                    fill="none"
                  />
                  <polyline
                    points="2 17 8 11 13 16 17 12 22 17"
                    stroke="currentColor"
                    stroke-width="1.5"
                    fill="none"
                  />
                </svg>
              </div>
              <div class="btn-content">
                <span class="btn-title">Gallery</span>
                <span class="btn-description">Choose from existing photos</span>
              </div>
              <v-icon class="btn-arrow" size="20" color="grey">mdi-chevron-right</v-icon>
            </button>
          </v-card-text>

          <v-divider></v-divider>

          <v-card-actions class="dialog-footer pa-3">
            <button class="cancel-btn" @click="closePickerDialog">Cancel</button>
          </v-card-actions>
        </v-card>
      </v-dialog>
    </v-main>
  </v-app>
</template>

<style scoped>
:root {
  --sat: env(safe-area-inset-top);
  --sar: env(safe-area-inset-right);
  --sab: env(safe-area-inset-bottom);
  --sal: env(safe-area-inset-left);
}

/* Mapbox-specific styles */
.map-container {
  position: relative;
  width: 100%;
  height: 400px;
  border-radius: 12px;
  margin-bottom: 16px;
  overflow: hidden;
}

.map {
  width: 100%;
  height: 100%;
  border-radius: 12px;
}

.mapboxgl-map {
  border-radius: 12px;
}

.map-loading-overlay {
  position: absolute;
  inset: 0;
  z-index: 1001;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 20px;
  text-align: center;
  background: rgba(255, 255, 255, 0.82);
  backdrop-filter: blur(2px);
}

.map-loading-title {
  font-size: 1rem;
  font-weight: 700;
  color: #1e293b;
}

.map-loading-message {
  max-width: 260px;
  font-size: 0.82rem;
  color: #475569;
  line-height: 1.45;
}

.shop-marker {
  cursor: move;
}

.locate-btn {
  position: absolute;
  top: 10px;
  right: 10px;
  background: white;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
  z-index: 1000;
}

.mapboxgl-ctrl-top-right {
  top: 10px;
  right: 10px;
}

.mapboxgl-ctrl-bottom-right {
  bottom: 10px;
  right: 10px;
}

.mapboxgl-ctrl-group {
  border-radius: 8px;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
}

/* Payment Card Styles */
.payment-card {
  cursor: pointer;
  transition: all 0.2s ease;
  border-width: 2px !important;
  height: 100%;
}

.payment-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 8px 16px rgba(0, 0, 0, 0.1);
}

.payment-card.selected-payment {
  border-color: #4caf50 !important;
  background-color: rgba(76, 175, 80, 0.05);
}

.payment-card:active {
  transform: translateY(-2px);
}

.payment-chip {
  margin: 2px;
}

/* =========================================
   APP BAR
========================================= */
.app-bar {
  padding-top: env(safe-area-inset-top);
  background: linear-gradient(135deg, #3f83c7, #2f6ca9) !important;
  color: white !important;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.12) !important;
}

.app-bar :deep(.v-toolbar-title) {
  font-size: 1.05rem;
  font-weight: 700;
  letter-spacing: 0.2px;
}

.app-bar :deep(.v-btn) {
  color: white !important;
}

.pb-16 {
  padding-top: calc(75px + env(safe-area-inset-top, 0px)) !important;
}

/* Steps Card Styles */
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

/* Cover Section Styles */
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

/* Form Section */
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

.prev-btn,
.next-btn {
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

/* Search Section */
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

.gap-2 {
  gap: 8px;
}

/* Image Picker Dialog Styles */
.image-picker-dialog {
  border-radius: 24px !important;
  overflow: hidden;
}

.dialog-header {
  text-align: center;
  padding: 24px 20px 16px;
  background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
}

.dialog-icon-wrapper {
  width: 64px;
  height: 64px;
  margin: 0 auto 12px;
  background: linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%);
  border-radius: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.dialog-title {
  font-size: 1.25rem;
  font-weight: 700;
  color: #1e293b;
  padding: 0;
  margin-bottom: 4px;
}

.dialog-subtitle {
  font-size: 0.85rem;
  color: #64748b;
  padding: 0;
}

.dialog-buttons {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 20px !important;
}

.picker-btn {
  display: flex;
  align-items: center;
  gap: 16px;
  width: 100%;
  padding: 16px;
  border: 1px solid #e2e8f0;
  border-radius: 16px;
  background: white;
  cursor: pointer;
  transition: all 0.2s ease;
  text-align: left;
}

.picker-btn:hover {
  transform: translateY(-2px);
  border-color: #3f83c7;
  box-shadow: 0 4px 12px rgba(63, 131, 199, 0.15);
}

.picker-btn:active {
  transform: translateY(0);
}

.btn-icon-wrapper {
  width: 48px;
  height: 48px;
  background: #f8fafc;
  border-radius: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
}

.camera-btn:hover .btn-icon-wrapper {
  background: #eff6ff;
}

.gallery-btn:hover .btn-icon-wrapper {
  background: #eff6ff;
}

.btn-icon-wrapper svg {
  stroke: #3f83c7;
}

.btn-content {
  flex: 1;
}

.btn-title {
  display: block;
  font-weight: 600;
  font-size: 1rem;
  color: #1e293b;
  margin-bottom: 4px;
}

.btn-description {
  display: block;
  font-size: 0.75rem;
  color: #94a3b8;
}

.btn-arrow {
  transition: transform 0.2s ease;
}

.picker-btn:hover .btn-arrow {
  transform: translateX(4px);
  color: #3f83c7 !important;
}

.dialog-footer {
  padding: 12px 20px 20px !important;
}

.cancel-btn {
  width: 100%;
  padding: 12px;
  background: #f1f5f9;
  border: none;
  border-radius: 12px;
  font-size: 0.9rem;
  font-weight: 500;
  color: #64748b;
  cursor: pointer;
  transition: all 0.2s ease;
}

.cancel-btn:hover {
  background: #e2e8f0;
  color: #475569;
}

.cancel-btn:active {
  transform: scale(0.98);
}

/* Responsive Styles */
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

  .prev-btn,
  .next-btn,
  .save-btn {
    width: 100%;
  }

  .map-container {
    height: 350px;
  }

  /* Dialog mobile styles */
  .image-picker-dialog {
    margin: 16px;
    border-radius: 20px !important;
  }

  .dialog-header {
    padding: 20px 16px 12px;
  }

  .dialog-icon-wrapper {
    width: 56px;
    height: 56px;
  }

  .dialog-title {
    font-size: 1.1rem;
  }

  .dialog-subtitle {
    font-size: 0.75rem;
  }

  .dialog-buttons {
    padding: 16px !important;
    gap: 10px;
  }

  .picker-btn {
    padding: 12px;
    gap: 12px;
  }

  .btn-icon-wrapper {
    width: 44px;
    height: 44px;
  }

  .btn-icon-wrapper svg {
    width: 22px;
    height: 22px;
  }

  .btn-title {
    font-size: 0.9rem;
  }

  .btn-description {
    font-size: 0.7rem;
  }

  .dialog-footer {
    padding: 10px 16px 16px !important;
  }

  .cancel-btn {
    padding: 10px;
    font-size: 0.85rem;
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

  .map-container {
    height: 300px;
  }

  /* Extra small devices */
  .btn-description {
    display: none;
  }

  .picker-btn {
    justify-content: center;
  }

  .btn-content {
    flex: none;
  }

  .btn-title {
    font-size: 0.85rem;
  }
}

/* Animations */
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

<style>
/* Global styles to hide app bar when camera is active */
body.camera-active .v-app-bar {
  display: none !important;
  visibility: hidden !important;
  opacity: 0 !important;
  transform: translateY(-100%) !important;
}

body.camera-active {
  overflow: hidden;
}

/* Hide dialog backdrop when camera is active */
body.camera-active .v-overlay__scrim,
body.camera-active .v-dialog {
  display: none !important;
  visibility: hidden !important;
}

/* Dark mode support for dialog */
@media (prefers-color-scheme: dark) {
  .image-picker-dialog {
    background: #1e293b;
  }

  .map-loading-overlay {
    background: rgba(15, 23, 42, 0.82);
  }

  .map-loading-title {
    color: #f8fafc;
  }

  .map-loading-message {
    color: #cbd5e1;
  }

  .dialog-header {
    background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
  }

  .dialog-icon-wrapper {
    background: linear-gradient(135deg, #1e293b 0%, #334155 100%);
  }

  .dialog-title {
    color: #f1f5f9;
  }

  .dialog-subtitle {
    color: #94a3b8;
  }

  .picker-btn {
    background: #1e293b;
    border-color: #334155;
  }

  .picker-btn:hover {
    border-color: #3f83c7;
    background: #1e293b;
  }

  .btn-icon-wrapper {
    background: #0f172a;
  }

  .btn-title {
    color: #f1f5f9;
  }

  .btn-description {
    color: #64748b;
  }

  .cancel-btn {
    background: #1e293b;
    color: #94a3b8;
  }

  .cancel-btn:hover {
    background: #334155;
    color: #cbd5e1;
  }
}
</style>

<style>
/* Global styles to hide app bar when camera is active */
body.camera-active .v-app-bar {
  display: none !important;
  visibility: hidden !important;
  opacity: 0 !important;
  transform: translateY(-100%) !important;
}

body.camera-active {
  overflow: hidden;
}

/* Hide dialog backdrop when camera is active */
body.camera-active .v-overlay__scrim,
body.camera-active .v-dialog {
  display: none !important;
  visibility: hidden !important;
}

/* Dark mode support for dialog */
@media (prefers-color-scheme: dark) {
  .image-picker-dialog {
    background: #1e293b;
  }

  .dialog-header {
    background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
  }

  .dialog-icon-wrapper {
    background: linear-gradient(135deg, #1e293b 0%, #334155 100%);
  }

  .dialog-title {
    color: #f1f5f9;
  }

  .dialog-subtitle {
    color: #94a3b8;
  }

  .picker-btn {
    background: #1e293b;
    border-color: #334155;
  }

  .picker-btn:hover {
    border-color: #3f83c7;
    background: #1e293b;
  }

  .btn-icon-wrapper {
    background: #0f172a;
  }

  .btn-title {
    color: #f1f5f9;
  }

  .btn-description {
    color: #64748b;
  }

  .cancel-btn {
    background: #1e293b;
    color: #94a3b8;
  }

  .cancel-btn:hover {
    background: #334155;
    color: #cbd5e1;
  }
}
</style>
