<script setup lang="ts">
import { ref, watch, onMounted, nextTick, computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { supabase } from '@/utils/supabase'
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera'

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

// -------------------- SHOP INFO --------------------
const shopName = ref('')
const description = ref('')
const openTime = ref('')
const closeTime = ref('')
const avatarUrl = ref<string | null>(null)
const physicalUrl = ref<string | null>(null)
const deliveryOptions = ref<string[]>([])
const paymentOptions = ref<string[]>([])
const meetUpDetails = ref('')
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
const debugInfo = ref('')
const currentUser = ref<any>(null)

// Debug Supabase client
console.log('🔧 Supabase client initialized:', {
  hasAuth: !!supabase.auth,
  hasFrom: !!supabase.from,
})

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

// -------------------- TEST FUNCTIONS --------------------
const testSupabaseConnection = async () => {
  try {
    console.log('🔍 Testing Supabase connection...')
    const { data, error } = await supabase.from('shops').select('count').limit(1)

    if (error) {
      console.error('❌ Supabase connection error:', error)
      showSnackbar('Supabase connection failed: ' + error.message, 'error')
    } else {
      console.log('✅ Supabase connection successful')
      showSnackbar('Supabase connection successful!', 'success')
    }
  } catch (err) {
    console.error('❌ Network error:', err)
    showSnackbar('Network error: ' + err, 'error')
  }
}

const checkAuthStatus = async () => {
  console.log('========== CHECKING AUTH STATUS ==========')

  try {
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser()

    console.log('Auth check result:', { user, error })

    if (user) {
      console.log('✅ User is authenticated:', {
        id: user.id,
        email: user.email,
        role: user.role,
      })
      currentUser.value = user
      showSnackbar(`Logged in as: ${user.email}`, 'success')
    } else {
      console.log('❌ No authenticated user found')
      showSnackbar('No user logged in', 'error')
    }

    // Also check session
    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession()
    console.log('Session check:', { session, sessionError })
  } catch (err) {
    console.error('❌ Auth check exception:', err)
    showSnackbar('Auth check failed: ' + err, 'error')
  }

  console.log('========== END AUTH CHECK ==========')
}

const testAuthDirectly = async () => {
  console.log('========== TEST AUTH DIRECTLY ==========')
  try {
    const {
      data: { session },
      error,
    } = await supabase.auth.getSession()
    console.log('Session check:', { session, error })

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()
    console.log('User check:', { user, error: userError })

    if (user) {
      showSnackbar(`Logged in as: ${user.email}`, 'success')
    } else {
      showSnackbar('Not logged in', 'error')
    }
  } catch (err) {
    console.error('Auth test error:', err)
    showSnackbar('Auth test failed', 'error')
  }
}

const testSimpleUpdate = async () => {
  console.log('========== TEST SIMPLE UPDATE ==========')

  if (!currentShopId.value) {
    console.error('❌ No shop ID')
    showSnackbar('No shop ID found', 'error')
    return
  }

  try {
    console.log('Attempting simple update with ID:', currentShopId.value)

    const testValue = { test: 'simple value ' + new Date().toISOString() }
    console.log('Test data:', testValue)

    const { data, error } = await supabase
      .from('shops')
      .update({
        gcash_enabled: true,
        paymongo_config: testValue,
      })
      .eq('id', currentShopId.value)
      .select()

    console.log('Simple update result:', { data, error })

    if (error) {
      console.error('❌ Error details:', {
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
      })
      showSnackbar('Update failed: ' + error.message, 'error')
    } else {
      console.log('✅ Update successful!', data)
      showSnackbar('Test update successful!', 'success')
    }
  } catch (err) {
    console.error('❌ Exception:', err)
    showSnackbar('Exception: ' + err, 'error')
  }

  console.log('========== END TEST ==========')
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
const map = ref<mapboxgl.Map | null>(null)
let shopMarker: mapboxgl.Marker | null = null
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
  // Prevent multiple simultaneous calls
  if (isSavingGcash.value) {
    console.log('⏳ Already saving, please wait...')
    return
  }

  // Clear previous errors
  gcashError.value = ''
  debugInfo.value = ''

  console.log('========== START SAVE GCASH CONFIG ==========')
  console.log('🔍 Checking authentication...')

  isSavingGcash.value = true
  savingGcash.value = true

  let timeoutId: NodeJS.Timeout

  try {
    // Step 1: Get current session
    console.log('🔍 Getting current session...')
    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession()

    if (sessionError) {
      console.error('❌ Session error:', sessionError)
      throw new Error('Session error: ' + sessionError.message)
    }

    if (!session) {
      console.error('❌ No session found')
      throw new Error('You must be logged in')
    }

    const user = session.user
    console.log('✅ Authenticated:', { id: user.id, email: user.email })

    // Step 2: Validate shop ID
    if (!currentShopId.value) {
      console.error('❌ No shop ID')
      throw new Error('No shop ID found')
    }

    console.log('Shop ID:', currentShopId.value)

    // Step 3: Validate inputs
    if (!paymongoPublicKey.value || !paymongoSecretKey.value) {
      console.error('❌ Missing keys')
      throw new Error('Please enter both public and secret keys')
    }

    // Validate key format
    if (!paymongoPublicKey.value.startsWith('pk_')) {
      throw new Error('Invalid public key format. Should start with "pk_"')
    }

    if (!paymongoSecretKey.value.startsWith('sk_')) {
      throw new Error('Invalid secret key format. Should start with "sk_"')
    }

    console.log('Keys validation passed')

    // Step 4: Check if shop exists and verify ownership
    console.log('Checking shop ownership...')
    const { data: shop, error: shopError } = await supabase
      .from('shops')
      .select('id, owner_id, paymongo_config, gcash_enabled')
      .eq('id', currentShopId.value)
      .maybeSingle()

    if (shopError) {
      console.error('❌ Shop fetch error:', shopError)
      throw new Error(`Error fetching shop: ${shopError.message}`)
    }

    if (!shop) {
      console.error('❌ Shop not found')
      throw new Error('Shop not found')
    }

    if (shop.owner_id !== user.id) {
      console.error('❌ Ownership mismatch')
      throw new Error('You do not have permission to update this shop')
    }

    console.log('✅ Ownership verified')

    // Step 5: Prepare data with proper JSONB structure
    const paymongoConfig = {
      public_key: paymongoPublicKey.value.trim(),
      secret_key: paymongoSecretKey.value.trim(),
      webhook_secret: paymongoWebhookSecret.value?.trim() || null,
      test_mode: testMode.value,
      connected_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }

    // Ensure payment_options is an array and includes 'gcash'
    const currentPaymentOptions = paymentOptions.value || []
    const updatedPaymentOptions = [...new Set([...currentPaymentOptions, 'gcash'])]

    // Filter to only allow 'cod' and 'gcash' as per your schema constraint
    const validPaymentOptions = updatedPaymentOptions.filter(
      (opt) => opt === 'cod' || opt === 'gcash',
    )

    console.log('Prepared data:', {
      paymongoConfig,
      validPaymentOptions,
      gcash_enabled: true,
    })

    // Step 6: Attempt update with timeout
    const updatePromise = supabase
      .from('shops')
      .update({
        paymongo_config: paymongoConfig, // This will be stored as JSONB
        gcash_enabled: true,
        payment_options: validPaymentOptions,
        payment_enabled: true, // Enable payments overall
        updated_at: new Date().toISOString(),
      })
      .eq('id', currentShopId.value)
      .eq('owner_id', user.id)
      .select()

    // Create timeout promise
    timeoutId = setTimeout(() => {
      console.log('⏰ Operation timeout reached')
    }, 15000)

    // Execute update
    const { data, error } = await updatePromise

    // Clear timeout
    clearTimeout(timeoutId)

    if (error) {
      console.error('❌ Update error:', error)

      // Check for specific error codes
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
      // Check if the update actually happened but no data returned
      const { data: checkData } = await supabase
        .from('shops')
        .select('gcash_enabled, paymongo_config, payment_options')
        .eq('id', currentShopId.value)
        .single()

      if (checkData?.gcash_enabled) {
        console.log('✅ Update was successful despite no data return')
        // Update local state
        gcashEnabled.value = true
        paymentOptions.value = validPaymentOptions
        showSnackbar('GCash configuration saved successfully!', 'success')
        return
      } else {
        throw new Error('Update failed - no data returned and verification failed')
      }
    }

    console.log('✅ Update successful!', data[0])

    // Update local state
    gcashEnabled.value = true
    paymentOptions.value = validPaymentOptions

    showSnackbar('GCash configuration saved successfully!', 'success')
  } catch (error: any) {
    console.error('❌ Error:', error)

    // Clear timeout if it exists
    if (timeoutId) clearTimeout(timeoutId)

    // Provide user-friendly error messages based on error type
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
    console.log('========== END SAVE GCASH CONFIG ==========')
  }
}

// Add this helper function to test RLS policies
const testRlsPolicy = async () => {
  if (!currentShopId.value) {
    showSnackbar('No shop ID', 'error')
    return
  }

  try {
    const {
      data: { user },
    } = await supabase.auth.getUser()

    console.log('Testing RLS policies...')
    console.log('User ID:', user?.id)
    console.log('Shop ID:', currentShopId.value)

    // Test 1: Can we select the shop?
    const { data: selectData, error: selectError } = await supabase
      .from('shops')
      .select('id, owner_id, gcash_enabled')
      .eq('id', currentShopId.value)
      .single()

    console.log('SELECT test:', { selectData, selectError })

    // Test 2: Can we update a simple field?
    const { data: updateData, error: updateError } = await supabase
      .from('shops')
      .update({
        test_field: 'test_value',
        updated_at: new Date().toISOString(),
      })
      .eq('id', currentShopId.value)
      .eq('owner_id', user?.id)
      .select()

    console.log('UPDATE test:', { updateData, updateError })

    if (updateError) {
      showSnackbar(`RLS test failed: ${updateError.message}`, 'error')
    } else {
      showSnackbar('RLS test passed! You can update the shop.', 'success')
    }
  } catch (err) {
    console.error('RLS test error:', err)
    showSnackbar('RLS test failed', 'error')
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
const testDirectUpdate = async () => {
  console.log('========== TEST DIRECT UPDATE ==========')

  if (!currentShopId.value) {
    console.error('❌ No shop ID')
    return
  }

  try {
    // Hardcode the user ID from your logs
    const userId = '4bc1583e-3a3f-4c18-88a5-d6832329f81d' // Your user ID from logs

    const testConfig = {
      public_key: 'pk_test_xxx',
      secret_key: 'sk_test_xxx',
      test_mode: true,
      test_date: new Date().toISOString(),
    }

    console.log('Attempting direct update with hardcoded user...')

    const { data, error } = await supabase
      .from('shops')
      .update({
        paymongo_config: testConfig,
        gcash_enabled: true,
        updated_at: new Date().toISOString(),
      })
      .eq('id', currentShopId.value)
      .eq('owner_id', userId) // Use hardcoded user ID
      .select()

    console.log('Direct update result:', { data, error })

    if (error) {
      console.error('❌ Error:', error)
    } else {
      console.log('✅ Success!', data)
    }
  } catch (err) {
    console.error('❌ Exception:', err)
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
const findRegionCodeByName = (name: string) => {
  return regions.value.find((region) => region.name.includes(name))?.code || null
}

const findProvinceCodeByName = (name: string) => {
  return provinces.value.find((province) => province.name === name)?.code || null
}

const findCityCodeByName = (name: string) => {
  return cities.value.find((city) => city.name === name)?.code || null
}

const findBarangayCodeByName = (name: string) => {
  return barangaysList.value.find((barangay) => barangay.name === name)?.code || null
}

// -------------------- REVERSE GEOCODE --------------------
const reverseGeocode = async (lat: number, lng: number): Promise<string> => {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}`,
    )
    const data = await res.json()

    if (data?.display_name) {
      const address = data.display_name
      fullAddress.value = address
      showSnackbar(`📍 Address detected: ${address}`, 'success')
      return address
    } else {
      showSnackbar('Address not found for this location', 'error')
      return ''
    }
  } catch (err) {
    console.error('Reverse geocoding failed:', err)
    showSnackbar('Failed to fetch address', 'error')
    return ''
  }
}

// -------------------- AUTOFILL ADDRESS FROM GEOCODE --------------------
const autofillAddressFromGeocode = async (addressString: string) => {
  if (!addressString) return

  try {
    const lowerAddress = addressString.toLowerCase()

    // Try to find region
    if (lowerAddress.includes('caraga')) {
      const caragaRegion = regions.value.find((r) => r.name.toLowerCase().includes('caraga'))
      if (caragaRegion) {
        selectedRegion.value = caragaRegion.code
        address.region.value = caragaRegion.name
      }
    }

    // Try to find province (Agusan del Norte)
    if (lowerAddress.includes('agusan del norte')) {
      const agusanProvince = provinces.value.find((p) =>
        p.name.toLowerCase().includes('agusan del norte'),
      )
      if (agusanProvince) {
        selectedProvince.value = agusanProvince.code
        address.province.value = agusanProvince.name
      }
    }

    // Try to find city (Butuan)
    if (lowerAddress.includes('butuan')) {
      const butuanCity = cities.value.find((c) => c.name.toLowerCase().includes('butuan'))
      if (butuanCity) {
        selectedCity.value = butuanCity.code
        address.city.value = butuanCity.name
      }
    }

    // Set the full detected address
    fullAddress.value = addressString
  } catch (err) {
    console.error('Error autofilling address:', err)
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
      latitude.value = lngLat.lat
      longitude.value = lngLat.lng
      await saveCoordinates(lngLat.lat, lngLat.lng)
      await reverseGeocode(lngLat.lat, lngLat.lng)
    })

    map.value.on('click', async (e) => {
      const { lng, lat } = e.lngLat
      latitude.value = lat
      longitude.value = lng
      shopMarker?.setLngLat([lng, lat])
      await saveCoordinates(lat, lng)
      await reverseGeocode(lat, lng)
    })

    map.value.on('load', () => {
      mapInitialized.value = true
      console.log('Mapbox map loaded successfully')
    })

    map.value.on('error', (e) => {
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
        manual_status: 'auto',
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
  if (map.value) {
    map.value.setCenter([longitude.value, latitude.value])
    shopMarker?.setLngLat([longitude.value, latitude.value])
  }
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
    const res = await fetch(
      `https://psgc.cloud/api/provinces/${provinceCode}/cities-municipalities`,
    )
    const data = await res.json()
    cities.value = data.sort((a, b) => a.name.localeCompare(b.name))

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

    console.log('Raw loaded data:', data)

    currentShopId.value = data.id
    avatarUrl.value = data.logo_url
    physicalUrl.value = data.physical_store
    shopName.value = data.business_name || ''
    description.value = data.description || ''
    openTime.value = data.open_time || ''
    closeTime.value = data.close_time || ''

    address.barangay.value = data.barangay || ''
    address.building.value = data.building || ''
    address.street.value = data.street || ''
    address.postal.value = data.postal || ''
    address.house_no.value = data.house_no || ''
    address.city.value = data.city || ''
    address.province.value = data.province || ''
    address.region.value = data.region || ''

    latitude.value = data.latitude || 8.9489
    longitude.value = data.longitude || 125.5406
    fullAddress.value = data.detected_address || ''

    deliveryOptions.value = data.delivery_options || []
    paymentOptions.value = data.payment_options || []
    openDays.value = data.open_days || [1, 2, 3, 4, 5, 6]

    validIdFrontUrl.value = data.valid_id_front || null
    validIdBackUrl.value = data.valid_id_back || null
    meetUpDetails.value = data.meetup_details || ''

    // Load GCash config if exists
    if (data.paymongo_config) {
      paymongoPublicKey.value = data.paymongo_config.public_key || ''
      paymongoSecretKey.value = data.paymongo_config.secret_key || ''
      paymongoWebhookSecret.value = data.paymongo_config.webhook_secret || ''
      testMode.value = data.paymongo_config.test_mode !== false
    }
    gcashEnabled.value = data.gcash_enabled || false

    console.log('After setting values:', {
      shopName: shopName.value,
      description: description.value,
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
      if (mapInitialized.value && currentStep.value === 6) {
        map.value?.setCenter([coords.lon, coords.lat])
        shopMarker?.setLngLat([coords.lon, coords.lat])
      }
    }
  }
})

// Update map when full address changes
watch(fullAddress, async (newVal) => {
  if (!newVal || !mapInitialized.value || currentStep.value !== 6) return

  const coords = await getCoordinatesFromAddress(newVal)
  if (coords) {
    latitude.value = coords.lat
    longitude.value = coords.lon
    map.value?.setCenter([coords.lon, coords.lat])
    shopMarker?.setLngLat([coords.lon, coords.lat])
    await saveCoordinates(coords.lat, coords.lon)
  }
})

// -------------------- GET LOCATION --------------------
const getLocation = () => {
  if (!navigator.geolocation) {
    showSnackbar('Geolocation not supported', 'error')
    return
  }

  addressOption.value = 'map'

  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      latitude.value = pos.coords.latitude
      longitude.value = pos.coords.longitude

      if (mapInitialized.value && currentStep.value === 6) {
        map.value?.setCenter([longitude.value, latitude.value])
        map.value?.setZoom(17)
        shopMarker?.setLngLat([longitude.value, latitude.value])
      }

      const detectedAddress = await reverseGeocode(latitude.value, longitude.value)
      await autofillAddressFromGeocode(detectedAddress)
      await saveCoordinates(latitude.value, longitude.value)
    },
    (err) => {
      console.error(err)
      showSnackbar('Failed to get location', 'error')
    },
    { enableHighAccuracy: true, timeout: 10000 },
  )
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

    console.log('Current user:', user.id)
    console.log('Current shop ID:', currentShopId.value)

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
      meetup_details: meetUpDetails.value || null,
      detected_address: fullAddress.value || null,
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

    console.log('Shop data to save:', shopData)

    let savedShopId
    let result

    if (!currentShopId.value) {
      // Insert new shop
      const insertData = {
        ...shopData,
        owner_id: user.id,
        status: 'pending',
      }

      console.log('Inserting new shop...')

      const { data, error } = await supabase.from('shops').insert(insertData).select()

      console.log('Insert response:', { data, error })

      if (error) throw error

      if (!data || data.length === 0) {
        throw new Error('Insert succeeded but no data returned')
      }

      result = data[0]
      savedShopId = data[0].id
      console.log('Insert successful:', data[0])
    } else {
      // Update existing shop
      console.log('Updating shop with ID:', currentShopId.value)

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

      console.log('Update response:', { data, error })

      if (error) {
        console.error('Update error:', error)
        throw error
      }

      if (!data || data.length === 0) {
        throw new Error('Update failed - no data returned. Check RLS policies.')
      }

      console.log('Update successful:', data[0])
      result = data[0]
      savedShopId = currentShopId.value
    }

    showSnackbar('Shop saved successfully!', 'success')

    setTimeout(() => {
      localStorage.setItem('lastCreatedShopId', savedShopId)
      router.push({
        path: '/statusshopcreation',
        query: { shopId: savedShopId },
      })
    }, 1500)
  } catch (err) {
    console.error('Save shop error:', err)
    console.error('Error details:', {
      message: err.message,
      code: err.code,
      details: err.details,
      hint: err.hint,
    })
    showSnackbar(err.message || 'Failed to save shop', 'error')
  } finally {
    saving.value = false
  }
}
const diagnoseAuth = async () => {
  console.log('========== AUTH DIAGNOSTICS ==========')

  try {
    // Test 1: Check if we can get session (fast)
    console.log('Test 1: getSession()')
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
    console.log('Session result:', {
      hasSession: !!sessionData.session,
      user: sessionData.session?.user?.email,
      expiresAt: sessionData.session?.expires_at
        ? new Date(sessionData.session.expires_at * 1000).toLocaleString()
        : 'N/A',
      error: sessionError,
    })

    // Test 2: Check if we can refresh session
    console.log('Test 2: refreshSession()')
    const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession()
    console.log('Refresh result:', {
      success: !!refreshData.session,
      user: refreshData.session?.user?.email,
      error: refreshError,
    })

    // Test 3: Check current shop ID and ownership
    if (currentShopId.value) {
      console.log('Test 3: Check shop ownership')
      const { data: shop, error: shopError } = await supabase
        .from('shops')
        .select('id, owner_id, business_name')
        .eq('id', currentShopId.value)
        .single()

      console.log('Shop check:', {
        shop: shop,
        currentUserId: sessionData.session?.user?.id,
        isOwner: shop?.owner_id === sessionData.session?.user?.id,
        error: shopError,
      })
    }

    showSnackbar('Auth diagnostics complete - check console', 'success')
  } catch (err) {
    console.error('Diagnostic error:', err)
    showSnackbar('Diagnostic failed', 'error')
  }

  console.log('========== END DIAGNOSTICS ==========')
}
// -------------------- MOUNT --------------------
onMounted(async () => {
  console.log('🔧 Component mounted, running diagnostics...')
  await testSupabaseConnection()
  await checkAuthStatus()
  await fetchRegions()
  await nextTick()

  if (shopId.value) {
    await loadShopData()
  }
})

watch([selectedRegion, selectedProvince, selectedCity], ([region, province, city]) => {
  console.log('Current selections:', {
    region: region ? regions.value.find((r) => r.code === region)?.name : 'None',
    province: province ? provinces.value.find((p) => p.code === province)?.name : 'None',
    city: city ? cities.value.find((c) => c.code === city)?.name : 'None',
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
      <div class="form-section pa-4" v-if="!loadingShopData" :key="currentShopId">
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
            <v-checkbox v-model="deliveryOptions" label="Deliver or Call a Rider" value="courier" />
            <v-checkbox v-model="deliveryOptions" label="Pickup" value="pickup" />
            <v-checkbox v-model="deliveryOptions" label="Meet-up" value="meetup" />
            <v-text-field
              v-if="deliveryOptions.includes('meetup')"
              v-model="meetUpDetails"
              label="Meet-up details"
              outlined
              class="mt-2"
            />
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

            <!-- Debug Info (visible during development) -->
            <v-alert v-if="debugInfo" type="info" variant="tonal" class="mb-4" dense>
              <pre class="text-caption">{{ debugInfo }}</pre>
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

                  <!-- Diagnostic Buttons - UPDATED with more options -->
                  <v-col cols="12">
                    <v-row>
                      <v-col cols="4">
                        <v-btn
                          color="info"
                          variant="outlined"
                          @click="testSupabaseConnection"
                          block
                          size="x-small"
                        >
                          Test DB
                        </v-btn>
                      </v-col>
                      <v-col cols="4">
                        <v-btn
                          color="info"
                          variant="outlined"
                          @click="checkAuthStatus"
                          block
                          size="x-small"
                        >
                          Check Auth
                        </v-btn>
                      </v-col>
                      <v-col cols="4">
                        <v-btn
                          color="purple"
                          variant="outlined"
                          @click="testAuthDirectly"
                          block
                          size="x-small"
                        >
                          Test Auth
                        </v-btn>
                      </v-col>
                    </v-row>
                    <v-btn
                      color="warning"
                      variant="outlined"
                      @click="testSimpleUpdate"
                      block
                      class="mt-2"
                      size="small"
                    >
                      <v-icon left>mdi-test-tube</v-icon>
                      Test Simple Update
                    </v-btn>
                  </v-col>

                  <!-- Add this near your other diagnostic buttons -->
                  <v-col cols="12">
                    <v-btn
                      color="info"
                      variant="outlined"
                      @click="diagnoseAuth"
                      block
                      size="small"
                      class="mt-2"
                    >
                      <v-icon left>mdi-stethoscope</v-icon>
                      Run Auth Diagnostics
                    </v-btn>
                  </v-col>
                  <!-- Add this near your other diagnostic buttons in step 5 -->
                  <v-col cols="12">
                    <v-btn
                      color="info"
                      variant="outlined"
                      @click="testRlsPolicy"
                      block
                      size="small"
                      class="mt-2"
                    >
                      <v-icon left>mdi-shield-lock</v-icon>
                      Test RLS Policies
                    </v-btn>
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
            <v-radio-group v-model="addressOption" inline class="mb-4">
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
                  :disabled="!searchQuery.trim()"
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
            <v-btn icon @click="getLocation" class="locate-btn" title="Detect Address">
              <v-icon>mdi-crosshairs-gps</v-icon>
            </v-btn>
          </div>

          <div v-if="addressOption === 'map'" class="pa-4">
            <v-btn block color="primary" @click="getLocation" class="mt-2 mb-4" size="large">
              <v-icon left>mdi-crosshairs-gps</v-icon>
              Detect Address from Current Location
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
      <v-dialog v-model="showPicker" max-width="400">
        <v-card>
          <v-card-title class="headline">Pick Image Source</v-card-title>
          <v-card-text class="text-center"> Choose how you want to upload the image </v-card-text>
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
/* Add these Mapbox-specific styles */
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
