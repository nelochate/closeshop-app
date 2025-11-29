<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { supabase } from '@/utils/supabase'

const route = useRoute()
const router = useRouter()

// 🛒 ITEMS & TRANSACTION STATE
const items = ref<any[]>([])
const fromCart = ref(false)
const cartItemIds = ref<string[]>([])
const transactionNumber = ref('')

// 👤 USER & DELIVERY STATE
const buyer = ref<any>(null)
const address = ref<any>(null)
const addresses = ref<any[]>([])
const showAddressDialog = ref(false)
const deliveryOption = ref('meetup')
const paymentMethod = ref('cash')
const note = ref('')

// 📅 DATE & TIME STATE - FLEXIBLE DATE SELECTION
const showDateTimePicker = ref(false)
const deliveryDate = ref('')
const deliveryTime = ref('')
const selectedHour = ref('')
const selectedMinute = ref('')
const selectedPeriod = ref<'AM' | 'PM'>('AM')

// 🏪 SHOP STATE
const shopSchedule = ref({
  openDays: [1, 2, 3, 4, 5, 6], // Default: Monday to Saturday
  openHour: 9, // Default opening hour
  closeHour: 19, // Default closing hour
  meetupDetails: 'Main Entrance',
  manualStatus: 'auto'
})

// 🎯 INITIALIZATION
onMounted(async () => {
  await initializePage()
})

// 🎫 GENERATE TRANSACTION NUMBER (BASE FUNCTION)
const generateTransactionNumber = () => {
  const timestamp = Date.now().toString(36)
  const random1 = Math.floor(Math.random() * 1e6)
    .toString(36)
    .padStart(5, '0')
  const random2 = Math.floor(Math.random() * 1e6)
    .toString(36)
    .padStart(5, '0')
  return `TX-${timestamp}-${random1}-${random2}`.toUpperCase()
}

// 🎫 GENERATE UNIQUE TRANSACTION NUMBER
const generateUniqueTransactionNumber = async (): Promise<string> => {
  let attempts = 0
  const maxAttempts = 5

  while (attempts < maxAttempts) {
    const candidate = generateTransactionNumber()

    // Check if this transaction number already exists
    const { data: existingOrder, error } = await supabase
      .from('orders')
      .select('transaction_number')
      .eq('transaction_number', candidate)
      .maybeSingle()

    if (error) {
      console.warn('⚠️ Error checking transaction number:', error)
      return candidate
    }

    if (!existingOrder) {
      return candidate
    }

    attempts++
    console.log(`🔄 Transaction number ${candidate} exists, generating new one...`)
  }

  return generateTransactionNumber() + '-' + Math.random().toString(36).substring(2, 4)
}

// 🔄 INITIALIZE PAGE
const initializePage = async () => {
  console.log('🚀 Initializing purchase page...')

  // Generate unique transaction number
  if (!transactionNumber.value) {
    transactionNumber.value = await generateUniqueTransactionNumber()
  }

  // Load items first to get shop_id
  await loadItems()

  // Load shop data (needed for schedule validation)
  await loadShopData()

  // Load user data
  await loadUserData()

  // Initialize date/time with default within 24 hours
  initializeDateTime()

  console.log('✅ Page initialized:', {
    items: items.value,
    transactionNumber: transactionNumber.value,
    buyer: buyer.value,
    address: address.value,
    shopSchedule: shopSchedule.value
  })
}

// 🏪 LOAD SHOP DATA FROM SUPABASE
const loadShopData = async () => {
  try {
    console.log('🏪 Loading shop data for items...')

    let shopId = items.value[0]?.shop_id || items.value[0]?.product?.shop_id

    if (!shopId) {
      console.warn('⚠️ No shop ID found, using default schedule')
      shopSchedule.value = {
        openDays: [0, 1, 2, 3, 4, 5, 6], // Include Sunday (0)
        openHour: 9,
        closeHour: 19,
        meetupDetails: 'Main Entrance',
        manualStatus: 'auto'
      }
      return
    }

    console.log('🔍 Fetching shop data for ID:', shopId)

    const { data: shop, error } = await supabase
      .from('shops')
      .select('open_time, close_time, open_days, manual_status, physical_store, meetup_details')
      .eq('id', shopId)
      .single()

    if (error) {
      console.error('❌ Error fetching shop data:', error)
      // Use default that includes Sunday
      shopSchedule.value = {
        openDays: [0, 1, 2, 3, 4, 5, 6],
        openHour: 9,
        closeHour: 19,
        meetupDetails: 'Main Entrance',
        manualStatus: 'auto'
      }
      return
    }

    console.log('📊 Raw shop data:', shop)

    // Parse open days - CRITICAL FIX
    let openDays = [0, 1, 2, 3, 4, 5, 6] // Default includes Sunday

    if (shop.open_days && Array.isArray(shop.open_days)) {
      openDays = shop.open_days
      console.log('✅ Using shop open_days:', openDays)
    } else {
      console.log('ℹ️ Using default open_days (includes Sunday)')
    }

    // Parse times safely
    const parseTimeToHour = (time: any) => {
      if (!time) return 9 // Default opening

      try {
        if (typeof time === 'string') {
          return parseInt(time.split(':')[0])
        }
        // Handle if it's a Date object or other format
        return 9
      } catch {
        return 9
      }
    }

    const openHour = parseTimeToHour(shop.open_time)
    const closeHour = parseTimeToHour(shop.close_time)

    shopSchedule.value = {
      openDays,
      openHour,
      closeHour,
      meetupDetails: shop.meetup_details || shop.physical_store || 'Main Entrance',
      manualStatus: shop.manual_status || 'auto'
    }

    console.log('✅ Final shop schedule:', shopSchedule.value)
    console.log('🔍 Open days include Sunday (0):', shopSchedule.value.openDays.includes(0))

  } catch (err) {
    console.error('❌ Error loading shop data:', err)
    // Always include Sunday in fallback
    shopSchedule.value = {
      openDays: [0, 1, 2, 3, 4, 5, 6],
      openHour: 9,
      closeHour: 19,
      meetupDetails: 'Main Entrance',
      manualStatus: 'auto'
    }
  }
}

// 📦 LOAD ITEMS WITH MULTIPLE FALLBACKS
const loadItems = async () => {
  console.log('🛒 Loading items...')
  console.log('📍 Route state:', history.state)
  console.log('📍 Route params:', route.params)
  console.log('📍 Route query:', route.query)

  // Method 1: Navigation state (from Buy Now)
  if (history.state?.items && history.state.items.length > 0) {
    console.log('📦 Items found in navigation state')
    items.value = history.state.items.map((item) => ({
      ...item,
      product_id: item.product_id || item.id,
      quantity: item.quantity || 1,
      selectedSize: item.size || item.selectedSize,
      selectedVariety: item.variety || item.selectedVariety,
      varietyData:
        item.varietyData ||
        (item.variety
          ? {
            name: item.variety,
            price: item.varietyPrice || item.price,
          }
          : null),
      price: item.varietyPrice || item.price,
    }))
    fromCart.value = history.state.fromCart || false

    console.log('✅ Items processed from navigation state:', items.value)
    return
  }

  // Method 2: Product ID from route params
  if (route.params.id) {
    console.log('🛍️ Fetching product from route ID:', route.params.id)
    await fetchProductFromId(route.params.id as string)
    return
  }

  // Method 3: Product ID from query params
  if (route.query.productId) {
    console.log('🛍️ Fetching product from query ID:', route.query.productId)
    await fetchProductFromId(route.query.productId as string)
    return
  }

  // Method 4: Fallback to cart items
  console.log('🛒 Falling back to cart items')
  await fetchCartItems()
}

// 🛍️ FETCH SINGLE PRODUCT
const fetchProductFromId = async (productId: string) => {
  try {
    console.log('📡 Fetching product details for:', productId)

    const { data: product, error } = await supabase
      .from('products')
      .select(
        `
        *,
        shop:shops(*)
      `
      )
      .eq('id', productId)
      .single()

    if (error) {
      console.error('❌ Product fetch error:', error)
      throw error
    }

    if (!product) {
      console.error('❌ Product not found')
      await fetchCartItems()
      return
    }

    // Check if we have variety selection from route query
    const selectedVariety = route.query.variety as string
    const selectedSize = route.query.size as string
    let finalPrice = product.price
    let itemName = product.prod_name
    let varietyData = null

    // If variety is selected, find it in the varieties JSONB
    if (selectedVariety && product.varieties) {
      try {
        const varieties = Array.isArray(product.varieties)
          ? product.varieties
          : JSON.parse(product.varieties)

        const variety = varieties.find((v: any) => v.name === selectedVariety)
        if (variety) {
          finalPrice = variety.price || product.price
          itemName = `${product.prod_name} - ${variety.name}`
          varietyData = variety
        }
      } catch (parseError) {
        console.warn('⚠️ Error parsing varieties:', parseError)
      }
    }

    // Transform product to item format
    const mainImage = getMainImage(product.main_img_urls)

    items.value = [
      {
        id: product.id,
        product_id: product.id,
        name: itemName,
        price: finalPrice,
        varietyPrice: finalPrice,
        quantity: 1,
        selectedSize: selectedSize,
        selectedVariety: selectedVariety,
        varietyData: varietyData,
        image: mainImage,
        shop_id: product.shop?.id,
        product: product,
      },
    ]

    fromCart.value = false
    console.log('✅ Product loaded successfully:', items.value)
  } catch (err) {
    console.error('❌ Error fetching product:', err)
    await fetchCartItems()
  }
}

// 🛒 FETCH CART ITEMS
const fetchCartItems = async () => {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      console.log('❌ No user logged in')
      return
    }

    console.log('📡 Fetching cart items for user:', user.id)

    const { data, error } = await supabase
      .from('cart_items')
      .select(
        `
        *,
        product:products (
          *,
          shop:shops (*)
        )
      `
      )
      .order('created_at', { ascending: false })

    if (error) {
      console.error('❌ Cart fetch error:', error)
      throw error
    }

    if (!data || data.length === 0) {
      console.log('🛒 No cart items found')
      items.value = []
      return
    }

    // Transform cart items
    items.value = data.map((item) => {
      const mainImage = getMainImage(item.product?.main_img_urls)

      // Handle variety selection from cart item
      let finalPrice = item.product?.price || 0
      let itemName = item.product?.prod_name || 'Unnamed Product'
      let varietyData = item.variety_data

      // If we have variety_data from cart, use it
      if (item.variety_data) {
        finalPrice = item.variety_data.price || item.product?.price || 0
        itemName = `${item.product?.prod_name} - ${item.variety_data.name}`
      }
      // Fallback to parsing from product varieties
      else if (item.selected_variety && item.product?.varieties) {
        try {
          const varieties = Array.isArray(item.product.varieties)
            ? item.product.varieties
            : JSON.parse(item.product.varieties)

          const variety = varieties.find((v: any) => v.name === item.selected_variety)
          if (variety) {
            finalPrice = variety.price || item.product.price
            itemName = `${item.product.prod_name} - ${variety.name}`
            varietyData = variety
          }
        } catch (parseError) {
          console.warn('⚠️ Error parsing varieties:', parseError)
        }
      }

      return {
        id: item.product_id,
        product_id: item.product_id,
        name: itemName,
        price: finalPrice,
        varietyPrice: finalPrice,
        quantity: item.quantity || 1,
        selectedSize: item.selected_size,
        selectedVariety: item.selected_variety,
        varietyData: varietyData,
        image: mainImage,
        cart_item_id: item.id,
        shop_id: item.product?.shop?.id,
        product: item.product,
      }
    })

    fromCart.value = true
    cartItemIds.value = items.value.map((item) => item.cart_item_id).filter(Boolean)
    console.log('✅ Cart items loaded:', items.value)
  } catch (err) {
    console.error('❌ Error fetching cart items:', err)
    items.value = []
  }
}

// 👤 LOAD USER DATA
const loadUserData = async () => {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      console.log('❌ No authenticated user')
      return
    }

    console.log('📡 Loading user data for:', user.id)

    // Load user profile
    const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()

    buyer.value = profile

    // Load addresses
    await loadUserAddresses()

    console.log('✅ User data loaded:', { buyer: buyer.value, address: address.value })
  } catch (err) {
    console.error('❌ Error loading user data:', err)
  }
}

// 🏠 LOAD USER ADDRESSES
const loadUserAddresses = async () => {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return

    console.log('📡 Loading addresses for user:', user.id)

    const { data: userAddresses, error } = await supabase
      .from('addresses')
      .select('*')
      .eq('user_id', user.id)
      .order('is_default', { ascending: false })
      .order('updated_at', { ascending: false })

    if (error) {
      console.error('❌ Error loading addresses:', error)
      return
    }

    addresses.value = userAddresses || []

    if (addresses.value.length > 0) {
      // Use default address or most recent
      address.value = addresses.value.find((addr) => addr.is_default) || addresses.value[0]
    } else {
      address.value = null
    }

    console.log('✅ Addresses loaded:', addresses.value)
    console.log('✅ Selected address:', address.value)
  } catch (err) {
    console.error('❌ Error loading addresses:', err)
  }
}

// 🏠 SELECT ADDRESS
const selectAddress = (selectedAddress: any) => {
  console.log('📍 Selecting address:', selectedAddress)
  address.value = selectedAddress
  showAddressDialog.value = false
  console.log('✅ Address selected:', address.value)
}

// 🏠 ADD NEW ADDRESS
const addNewAddress = () => {
  showAddressDialog.value = false
  // Navigate to add address page
  router.push({ name: 'edit-address' })
}

// 🏠 FORMAT ADDRESS FOR DISPLAY
const formatAddress = (addr: any): string => {
  if (!addr) return 'No address set'
  
  const addressParts = [
    addr.house_no,
    addr.building,
    addr.street,
    addr.purok ? `Purok ${addr.purok}` : null,
    addr.barangay_name,
    addr.city_name,
    addr.province_name,
    addr.region_name,
    addr.postal_code
  ].filter(Boolean) // Remove null/empty values
  
  return addressParts.join(', ') || 'Address details not complete'
}
// 🕒 INITIALIZE DATE/TIME - IMPROVED
const initializeDateTime = () => {
  const now = new Date()
  console.log('🕒 Initializing date/time, current time:', now.toString())

  // Find next available delivery date
  let deliveryDateObj = new Date(now)
  let attempts = 0
  const maxAttempts = 7

  while (attempts < maxAttempts) {
    const day = deliveryDateObj.getDay()
    const isOpenDay = shopSchedule.value.openDays.includes(day)

    console.log(`🕒 Checking date: ${deliveryDateObj.toDateString()}, day: ${day}, open: ${isOpenDay}`)

    if (isOpenDay) {
      // Check if we can deliver today
      const currentHour = now.getHours()
      const isToday = deliveryDateObj.toDateString() === now.toDateString()

      if (isToday && currentHour < shopSchedule.value.closeHour) {
        // Can deliver today
        break
      } else if (!isToday) {
        // Can deliver on this future date
        break
      }
    }

    // Move to next day
    deliveryDateObj.setDate(deliveryDateObj.getDate() + 1)
    attempts++
  }

  // Format date
  const year = deliveryDateObj.getFullYear()
  const month = (deliveryDateObj.getMonth() + 1).toString().padStart(2, '0')
  const day = deliveryDateObj.getDate().toString().padStart(2, '0')
  deliveryDate.value = `${year}-${month}-${day}`

  // Set default time with proper validation
  const isToday = deliveryDateObj.toDateString() === now.toDateString()

  if (isToday) {
    const currentHour = now.getHours()
    const deliveryHour = Math.max(currentHour + 1, shopSchedule.value.openHour)
    const minutes = now.getMinutes().toString().padStart(2, '0')

    const hour12 = deliveryHour % 12 || 12
    selectedHour.value = hour12.toString().padStart(2, '0')
    selectedMinute.value = minutes
    selectedPeriod.value = deliveryHour >= 12 ? 'PM' : 'AM'

    // Update delivery time immediately
    deliveryTime.value = `${deliveryHour.toString().padStart(2, '0')}:${minutes}`
  } else {
    const hour12 = shopSchedule.value.openHour % 12 || 12
    selectedHour.value = hour12.toString().padStart(2, '0')
    selectedMinute.value = '00'
    selectedPeriod.value = shopSchedule.value.openHour >= 12 ? 'PM' : 'AM'

    // Update delivery time immediately
    deliveryTime.value = `${shopSchedule.value.openHour.toString().padStart(2, '0')}:00`
  }

  console.log('✅ Date/time fully initialized')
}

// 🏪 SHOP HOURS VALIDATION - FIXED DATE HANDLING
const scheduleError = ref('')
const isWithinShopHours = (date: any, time: string): boolean => {
  console.log('🔍 SCHEDULE VALIDATION START:', {
    date,
    time,
    dateType: typeof date,
    dateValue: date
  })
  console.log('🔍 Current shop schedule:', shopSchedule.value)

  // Reset error
  scheduleError.value = ''

  // Basic validation
  if (!date || !time) {
    scheduleError.value = 'Please select both date and time.'
    return false
  }

  try {
    let selectedDateTime: Date

    // Handle different date input types
    if (date instanceof Date) {
      // Date is already a Date object - clone it and set the time
      selectedDateTime = new Date(date)
      console.log('📅 Using existing Date object:', selectedDateTime.toString())
    } else if (typeof date === 'string') {
      // Date is a string - parse it
      selectedDateTime = new Date(date)
      console.log('📅 Parsing date from string:', date)
    } else {
      console.error('❌ Invalid date type:', typeof date)
      scheduleError.value = 'Invalid date selection.'
      return false
    }

    // Validate time format
    const timeRegex = /^([0-1]?[0-9]|2[0-3]):([0-5][0-9])$/
    if (!timeRegex.test(time)) {
      console.error('❌ Invalid time format:', time)
      scheduleError.value = 'Invalid time format. Please select a valid time.'
      return false
    }

    // Parse time components and set them on the date
    const [hours, minutes] = time.split(':').map(Number)

    // Validate time components
    if (isNaN(hours) || isNaN(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
      scheduleError.value = 'Invalid time selected. Please choose a valid time.'
      return false
    }

    // Set the time on the date object
    selectedDateTime.setHours(hours, minutes, 0, 0)

    const now = new Date()

    console.log('🔍 Date analysis:', {
      originalDate: date,
      selectedDateTime: selectedDateTime.toString(),
      selectedDateTimeISO: selectedDateTime.toISOString(),
      hours,
      minutes,
      now: now.toString(),
      isValidDate: !isNaN(selectedDateTime.getTime())
    })

    // Check if selected date is valid
    if (isNaN(selectedDateTime.getTime())) {
      console.error('❌ Invalid date/time combination:', { date, time })
      scheduleError.value = 'Invalid date/time selection. Please try again.'
      return false
    }

    // Check if selected date is in the past
    if (selectedDateTime < now) {
      scheduleError.value = 'Cannot select a date/time in the past. Please choose a future date and time.'
      return false
    }

    // Check if shop is manually closed
    if (shopSchedule.value.manualStatus === 'closed') {
      scheduleError.value = 'Shop is currently closed. Please select another time or contact the seller.'
      return false
    }

    // Get day of week (0 = Sunday, 1 = Monday, etc.)
    const dayOfWeek = selectedDateTime.getDay()
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
    const dayName = dayNames[dayOfWeek]

    console.log('🔍 Day analysis:', {
      dayOfWeek,
      dayName,
      openDays: shopSchedule.value.openDays,
      includesDay: shopSchedule.value.openDays.includes(dayOfWeek)
    })

    // Check if day is within open days
    if (!shopSchedule.value.openDays.includes(dayOfWeek)) {
      scheduleError.value = `Shop is closed on ${dayName}. Please select another day.`
      console.log('❌ Day validation failed - shop closed on:', dayName)
      return false
    }

    // Calculate time in minutes for comparison
    const selectedTimeInMinutes = hours * 60 + minutes
    const openTimeInMinutes = shopSchedule.value.openHour * 60
    const closeTimeInMinutes = shopSchedule.value.closeHour * 60

    console.log('🔍 Time analysis:', {
      selectedTime: time,
      selectedTimeInMinutes,
      openTimeInMinutes,
      closeTimeInMinutes,
      openHour: shopSchedule.value.openHour,
      closeHour: shopSchedule.value.closeHour
    })

    // Check if time is within open hours
    if (selectedTimeInMinutes < openTimeInMinutes) {
      const openTime12 = convertTo12Hour(`${shopSchedule.value.openHour.toString().padStart(2, '0')}:00`)
      scheduleError.value = `Shop opens at ${openTime12}. Please select a later time.`
      return false
    }

    if (selectedTimeInMinutes >= closeTimeInMinutes) {
      const closeTime12 = convertTo12Hour(`${shopSchedule.value.closeHour.toString().padStart(2, '0')}:00`)
      scheduleError.value = `Shop closes at ${closeTime12}. Please select an earlier time.`
      return false
    }

    // Additional check: If selecting today, ensure time is in the future
    const today = new Date()
    const isToday = selectedDateTime.toDateString() === today.toDateString()
    if (isToday) {
      const currentTimeInMinutes = today.getHours() * 60 + today.getMinutes()
      if (selectedTimeInMinutes <= currentTimeInMinutes) {
        scheduleError.value = 'Please select a future time for today\'s delivery.'
        return false
      }
    }

    console.log('✅ Schedule validation PASSED')
    scheduleError.value = ''
    return true

  } catch (error) {
    console.error('❌ Error in schedule validation:', error)
    scheduleError.value = 'Invalid date/time selection. Please try again.'
    return false
  }
}

// 📅 DATE/TIME CONFIRMATION - FIXED
const confirmDateTime = () => {
  updateTime()

  console.log('🕒 Confirming date/time:', {
    date: deliveryDate.value,
    time: deliveryTime.value,
    selectedHour: selectedHour.value,
    selectedMinute: selectedMinute.value,
    period: selectedPeriod.value
  })

  // Validate the selected schedule
  const isValid = isWithinShopHours(deliveryDate.value, deliveryTime.value)

  if (!isValid) {
    console.log('❌ Schedule validation failed:', scheduleError.value)
    alert(scheduleError.value)
    return
  }

  console.log('✅ Schedule confirmed successfully')
  showDateTimePicker.value = false
}

// 🗓️ IMPROVED DATE CHANGE HANDLER
const handleDateChange = (newDate: string) => {
  console.log('📅 Date changed to:', newDate)
  deliveryDate.value = newDate

  // Auto-validate when date changes (only if we have time)
  if (deliveryTime.value && validateTimeComponents()) {
    console.log('🔄 Auto-validating after date change...')
    const isValid = isWithinShopHours(deliveryDate.value, deliveryTime.value)
    if (!isValid) {
      console.log('⚠️ Date change caused validation issue:', scheduleError.value)
    } else {
      console.log('✅ Date change validation passed')
    }
  }
}

// 🗓️ MIN/MAX DATES FOR DATE PICKER
const minDate = computed(() => {
  const today = new Date()
  const year = today.getFullYear()
  const month = (today.getMonth() + 1).toString().padStart(2, '0')
  const day = today.getDate().toString().padStart(2, '0')
  return `${year}-${month}-${day}`
})

const maxDate = computed(() => {
  const max = new Date()
  max.setDate(max.getDate() + 30)
  const year = max.getFullYear()
  const month = (max.getMonth() + 1).toString().padStart(2, '0')
  const day = max.getDate().toString().padStart(2, '0')
  return `${year}-${month}-${day}`
})

// 🕒 TIME PICKER FUNCTIONS - IMPROVED
const hours12 = Array.from({ length: 12 }, (_, i) => (i + 1).toString().padStart(2, '0'))
const minutes = Array.from({ length: 60 }, (_, i) => i.toString().padStart(2, '0'))

// 🕒 TIME PICKER FUNCTIONS - IMPROVED
const updateTime = () => {
  console.log('🕒 Updating time with:', {
    hour: selectedHour.value,
    minute: selectedMinute.value,
    period: selectedPeriod.value
  })

  // Check if we have all required time components
  if (!selectedHour.value || !selectedMinute.value || !selectedPeriod.value) {
    console.log('⚠️ Time components missing, skipping update')
    return
  }

  try {
    let hourNum = parseInt(selectedHour.value)

    // Validate hour
    if (isNaN(hourNum) || hourNum < 1 || hourNum > 12) {
      console.error('❌ Invalid hour:', selectedHour.value)
      return
    }

    // Convert to 24-hour format
    if (selectedPeriod.value === 'PM' && hourNum < 12) {
      hourNum += 12
    } else if (selectedPeriod.value === 'AM' && hourNum === 12) {
      hourNum = 0
    }

    // Ensure hour is within valid range
    if (hourNum < 0 || hourNum > 23) {
      console.error('❌ Invalid 24-hour time:', hourNum)
      return
    }

    const minuteNum = parseInt(selectedMinute.value)
    if (isNaN(minuteNum) || minuteNum < 0 || minuteNum > 59) {
      console.error('❌ Invalid minute:', selectedMinute.value)
      return
    }

    // Format time as HH:MM
    deliveryTime.value = `${hourNum.toString().padStart(2, '0')}:${selectedMinute.value.padStart(2, '0')}`

    console.log('✅ Time updated successfully:', {
      selectedHour: selectedHour.value,
      selectedMinute: selectedMinute.value,
      period: selectedPeriod.value,
      deliveryTime: deliveryTime.value,
      hour24: hourNum
    })

    // Auto-validate when time changes
    if (deliveryDate.value && deliveryTime.value) {
      console.log('🔄 Auto-validating schedule...')
      const isValid = isWithinShopHours(deliveryDate.value, deliveryTime.value)
      if (!isValid) {
        console.log('⚠️ Time change caused validation issue:', scheduleError.value)
      } else {
        console.log('✅ Time change validation passed')
      }
    }

  } catch (error) {
    console.error('❌ Error updating time:', error)
    scheduleError.value = 'Error setting time. Please try again.'
  }
}

const selectHour = (hour: string) => {
  console.log('⏰ Hour selected:', hour)
  selectedHour.value = hour

  // Validate before updating
  if (validateTimeComponents()) {
    updateTime()
  } else {
    console.log('❌ Hour selection validation failed')
  }
}

const selectMinute = (minute: string) => {
  console.log('⏰ Minute selected:', minute)
  selectedMinute.value = minute

  // Validate before updating
  if (validateTimeComponents()) {
    updateTime()
  } else {
    console.log('❌ Minute selection validation failed')
  }
}

// Watch for period changes with validation
watch(selectedPeriod, (newPeriod) => {
  console.log('🔄 Period changed to:', newPeriod)
  if (validateTimeComponents()) {
    updateTime()
  }
})

// 🕒 HELPER: Convert to 12-hour format
const convertTo12Hour = (time24: string) => {
  if (!time24 || time24 === 'N/A') return 'N/A'

  try {
    const [hours, minutes] = time24.split(':')
    const hour = parseInt(hours)
    const minute = minutes || '00'

    if (isNaN(hour)) return time24

    const period = hour >= 12 ? 'PM' : 'AM'
    const hour12 = hour % 12 || 12

    return `${hour12}:${minute} ${period}`
  } catch (error) {
    console.error('Error converting time:', error)
    return time24
  }
}

// 📅 FORMATTED DATE DISPLAY
const formattedDate = computed(() => {
  if (!deliveryDate.value) return 'Not set'

  const selected = new Date(deliveryDate.value)
  const today = new Date()
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)

  let dateString = selected.toLocaleDateString('en-US', {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })

  // Add relative day indicator
  if (selected.toDateString() === today.toDateString()) {
    dateString = `Today (${dateString})`
  } else if (selected.toDateString() === tomorrow.toDateString()) {
    dateString = `Tomorrow (${dateString})`
  }

  return dateString
})

// 🕒 TIME VALIDATION HELPER
const validateTimeComponents = (): boolean => {
  const hour = parseInt(selectedHour.value)
  const minute = parseInt(selectedMinute.value)

  if (isNaN(hour) || hour < 1 || hour > 12) {
    scheduleError.value = 'Please select a valid hour (1-12).'
    return false
  }

  if (isNaN(minute) || minute < 0 || minute > 59) {
    scheduleError.value = 'Please select a valid minute (0-59).'
    return false
  }

  if (!selectedPeriod.value) {
    scheduleError.value = 'Please select AM or PM.'
    return false
  }

  return true
}

// 🖼️ IMAGE HELPER
const getMainImage = (imgUrls: any, varietyData: any = null): string => {
  // First priority: Use variety image if available
  if (varietyData?.images && varietyData.images.length > 0) {
    const varietyImg = varietyData.images[0]
    if (varietyImg && varietyImg !== '/placeholder.png') {
      return varietyImg
    }
  }

  // Second priority: Use product main image
  if (!imgUrls) return '/placeholder.png'

  if (Array.isArray(imgUrls)) {
    return imgUrls[0] || '/placeholder.png'
  }

  if (typeof imgUrls === 'string') {
    try {
      const parsed = JSON.parse(imgUrls)
      return Array.isArray(parsed) ? parsed[0] : parsed
    } catch {
      return imgUrls
    }
  }

  return '/placeholder.png'
}

// 💰 COMPUTED: TOTAL PRICE
const totalPrice = computed(() => {
  return items.value.reduce((sum, item) => {
    return sum + item.price * (item.quantity || 1)
  }, 0)
})

// ➕/➖ QUANTITY CONTROLS
const increaseQty = (item: any) => {
  item.quantity = (item.quantity || 1) + 1
}

const decreaseQty = (item: any) => {
  if ((item.quantity || 1) > 1) {
    item.quantity--
  }
}

// 📋 DELIVERY OPTIONS
const deliveryOptions = [
  { label: 'Meet Up', value: 'meetup' },
  { label: 'Pickup', value: 'pickup' },
  { label: 'Call a Rider', value: 'rider' },
]

const deliveryOptionsDisplay = computed(() =>
  deliveryOptions.map((opt) =>
    opt.value === 'meetup'
      ? { ...opt, label: `Meet Up (${shopSchedule.value.meetupDetails})` }
      : opt,
  ),
)

// ✅ COMPLETE CHECKOUT FUNCTION
const handleCheckout = async () => {
  // Validation
  if (!buyer.value) {
    alert('Please log in to continue')
    return
  }

  if (!address.value) {
    alert('Please set a delivery address')
    return
  }

  if (!items.value.length) {
    alert('No items to checkout')
    return
  }

  // Validate delivery schedule
  if (!isWithinShopHours(deliveryDate.value, deliveryTime.value)) {
    alert(scheduleError.value || 'Please select a valid delivery schedule')
    return
  }

  console.log('🛒 Starting checkout process...')

  try {
    const shopId = items.value[0]?.shop_id || items.value[0]?.product?.shop_id

    if (!shopId) {
      alert('Shop information not found for items')
      return
    }

    console.log('🏪 Creating order for shop:', shopId)

    // Create single order with shop_id
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .insert({
        user_id: buyer.value.id,
        address_id: address.value.id,
        total_amount: totalPrice.value,
        status: 'pending',
        payment_method: paymentMethod.value,
        transaction_number: transactionNumber.value,
        delivery_option: deliveryOption.value,
        delivery_date: deliveryDate.value,
        delivery_time: deliveryTime.value,
        note: note.value,
        shop_id: shopId,
      })
      .select()
      .single()

    if (orderError) {
      console.error('❌ Order creation error details:', orderError)
      throw orderError
    }

    console.log('✅ Order created with shop_id:', shopId)

    // Create order items
    const orderItems = items.value.map((item) => {
      const isVariety = item.selectedVariety && item.varietyPrice

      return {
        order_id: order.id,
        product_id: item.product_id,
        quantity: item.quantity,
        price: isVariety ? item.varietyPrice : item.price,
        selected_size: item.selectedSize,
        selected_variety: item.selectedVariety,
        variety_data: item.varietyData,
      }
    })

    const { error: itemsError } = await supabase.from('order_items').insert(orderItems)
    if (itemsError) throw itemsError

    console.log('✅ Order items created')

    // Create payment record
    const { error: paymentError } = await supabase.from('payments').insert({
      order_id: order.id,
      amount: totalPrice.value,
      status: 'pending',
      method: paymentMethod.value,
    })

    if (paymentError) throw paymentError

    console.log('✅ Payment record created')

    // Send message to seller
    await sendOrderMessageToSeller(order.id, shopId, items.value)

    // Clean up cart if coming from cart
    if (fromCart.value && cartItemIds.value.length > 0) {
      const { error: cartError } = await supabase
        .from('cart_items')
        .delete()
        .in('id', cartItemIds.value)

      if (cartError) {
        console.warn('⚠️ Cart cleanup warning:', cartError)
      }
    }

    console.log('🎯 Navigating to success page...')

    // Navigate to success page
    router.push({
      name: 'checkout-success',
      params: { orderId: order.id },
      state: {
        orderNumber: transactionNumber.value,
        totalAmount: totalPrice.value,
      },
    })
  } catch (err) {
    console.error('❌ Checkout error:', err)
    alert('Failed to complete checkout. Please try again.')
  }
}

// 💬 SEND ORDER MESSAGE TO SELLER
const sendOrderMessageToSeller = async (orderId: string, shopId: string, shopItems: any[]) => {
  try {
    console.log(`💬 Sending order message to shop: ${shopId}`)

    if (!shopId) {
      console.warn('⚠️ No shop ID provided')
      return
    }

    // Get shop owner
    const { data: shopData, error: shopError } = await supabase
      .from('shops')
      .select('owner_id, business_name')
      .eq('id', shopId)
      .single()

    if (shopError || !shopData) {
      console.error('❌ Error fetching shop data:', shopError)
      return
    }

    const sellerUserId = shopData.owner_id
    const shopName = shopData.business_name

    // Get current user
    const { data: auth } = await supabase.auth.getUser()
    if (!auth.user) {
      console.error('❌ No authenticated user')
      return
    }

    const buyerUserId = auth.user.id

    console.log(`👥 Shop: ${shopName}, Buyer: ${buyerUserId}, Seller: ${sellerUserId}`)

    // Get or create profiles
    let buyerProfile = await getOrCreateProfile(buyerUserId)
    let sellerProfile = await getOrCreateProfile(sellerUserId)

    if (!buyerProfile || !sellerProfile) {
      console.error('❌ Could not get or create profiles')
      return
    }

    console.log('📋 Profile IDs - Buyer:', buyerProfile.id, 'Seller:', sellerProfile.id)

    // Find or create conversation
    const { data: existingConversation, error: convFindError } = await supabase
      .from('conversations')
      .select('id')
      .or(
        `and(user1.eq.${buyerProfile.id},user2.eq.${sellerProfile.id}),and(user1.eq.${sellerProfile.id},user2.eq.${buyerProfile.id})`,
      )
      .maybeSingle()

    if (convFindError) {
      console.error('❌ Error finding conversation:', convFindError)
    }

    let conversationId = existingConversation?.id

    if (!conversationId) {
      console.log('💬 Creating new conversation...')
      const { data: newConversation, error: convCreateError } = await supabase
        .from('conversations')
        .insert({
          user1: buyerProfile.id,
          user2: sellerProfile.id,
        })
        .select('id')
        .single()

      if (convCreateError) {
        console.error('❌ Error creating conversation:', convCreateError)
        return
      }

      conversationId = newConversation?.id
      console.log('✅ Conversation created:', conversationId)
    } else {
      console.log('✅ Existing conversation found:', conversationId)
    }

    if (!conversationId) {
      console.error('❌ No conversation ID available')
      return
    }

    // Create order message
    const itemsSummary = shopItems
      .map((item) => {
        let itemDetails = `${item.name} (x${item.quantity}) - ₱${(item.price * item.quantity).toFixed(2)}`

        if (item.selectedVariety || item.selectedSize) {
          const details = []
          if (item.selectedVariety) details.push(`Variety: ${item.selectedVariety}`)
          if (item.selectedSize) details.push(`Size: ${item.selectedSize}`)
          itemDetails += ` [${details.join(', ')}]`
        }

        return itemDetails
      })
      .join('\n')

    const orderMessage = `🛍️ New Order Received!\n\nShop: ${shopName}\nTransaction #: ${transactionNumber.value}\nTotal Amount: ₱${shopItems.reduce((sum, item) => sum + item.price * item.quantity, 0).toFixed(2)}\n\nItems:\n${itemsSummary}\n\nDelivery: ${deliveryOption.value}\nPayment: ${paymentMethod.value}\nSchedule: ${formattedDate.value} at ${deliveryTime.value}\n\nNote: ${note.value || 'No message'}`

    console.log(`💌 Sending order message to shop ${shopName}:`, conversationId)

    // Send message
    const { error: msgError } = await supabase.from('messages').insert({
      conversation_id: conversationId,
      sender_id: buyerUserId,
      receiver_id: sellerUserId,
      content: orderMessage,
      is_read: false,
    })

    if (msgError) {
      console.error('❌ Error sending order message:', msgError)
      throw msgError
    }

    console.log(`✅ Order message sent to ${shopName} successfully!`)
  } catch (err) {
    console.error('❌ Error in sendOrderMessageToSeller:', err)
    throw err
  }
}

// 🔧 HELPER: GET OR CREATE PROFILE
const getOrCreateProfile = async (userId: string) => {
  try {
    console.log('📋 Checking profile for user:', userId)

    // First, try to get existing profile
    const { data: existingProfile, error: fetchError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()

    if (!fetchError && existingProfile) {
      console.log('✅ Profile found:', existingProfile)
      return existingProfile
    }

    // If profile doesn't exist, create one
    console.log('📝 Creating new profile for user:', userId)

    const { data: newProfile, error: createError } = await supabase
      .from('profiles')
      .insert({
        id: userId,
        first_name: 'User',
        last_name: 'Profile',
        role: 'customer',
        created_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (createError) {
      console.error('❌ Error creating profile:', createError)

      // If insert fails due to constraints, try update (in case of race condition)
      const { data: updatedProfile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single()

      if (updatedProfile) {
        console.log('✅ Profile created by another process:', updatedProfile)
        return updatedProfile
      }

      return null
    }

    console.log('✅ New profile created:', newProfile)
    return newProfile
  } catch (err) {
    console.error('❌ Error in getOrCreateProfile:', err)
    return null
  }
}

// 🐛 DEBUG HELPER
const debugScheduleValidation = () => {
  console.log('🐛 DEBUG SCHEDULE VALIDATION:')
  console.log('deliveryDate:', deliveryDate.value, 'type:', typeof deliveryDate.value)
  console.log('deliveryTime:', deliveryTime.value, 'type:', typeof deliveryTime.value)

  if (deliveryDate.value && deliveryTime.value) {
    const testDate = new Date(deliveryDate.value)
    console.log('Test Date object:', testDate.toString())
    console.log('Test Date valid:', !isNaN(testDate.getTime()))

    const isValid = isWithinShopHours(testDate, deliveryTime.value)
    console.log('Validation result:', isValid)
    console.log('Error message:', scheduleError.value)
  }
}

// Call this temporarily to test
debugScheduleValidation()

// 👀 DEBUG WATCHERS
watch(
  items,
  (newItems) => {
    console.log('🛒 Items updated:', newItems)
  },
  { immediate: true },
)

watch(
  () => route.params,
  (newParams) => {
    console.log('📍 Route params updated:', newParams)
  },
)
</script>

<template>
  <v-app>
    <v-main>

      <!-- Add this debug section temporarily -->
      <v-alert v-if="false" type="info" class="mb-4">
        <strong>Debug Time Info:</strong><br>
        Selected Hour: {{ selectedHour }}<br>
        Selected Minute: {{ selectedMinute }}<br>
        Selected Period: {{ selectedPeriod }}<br>
        Delivery Time: {{ deliveryTime }}<br>
        Delivery Date: {{ deliveryDate }}<br>
        Schedule Error: {{ scheduleError }}<br>
        Shop Hours: {{ shopSchedule.openHour }}:00 - {{ shopSchedule.closeHour }}:00<br>
        Open Days: {{ shopSchedule.openDays }}
      </v-alert>
      <!-- App Bar -->
      <v-app-bar color="#438fda" dark flat>
        <v-btn icon @click="router.back()">
          <v-icon>mdi-arrow-left</v-icon>
        </v-btn>
        <v-toolbar-title class="app-bar-title">
          <strong>Transaction Process</strong>
        </v-toolbar-title>
      </v-app-bar>

      <v-container fluid class="py-4 px-3 main-content">
        <!-- Debug Info -->
        <v-alert v-if="items.length === 0" type="warning" class="mb-4">
          No items loaded. Please go back and try again.
          <br />Transaction #: {{ transactionNumber }}
        </v-alert>

        <!-- Delivery Details -->
        <v-card outlined class="mb-4 card-elevated">
          <v-card-title class="card-title">
            <v-icon color="primary" class="mr-2">mdi-truck-delivery</v-icon>
            Delivery Details
          </v-card-title>
          <v-card-text class="card-content">
            <div class="buyer-info">
              <p>
                <strong>Name:</strong> {{ buyer?.first_name || 'Loading...' }}
                {{ buyer?.last_name }}
              </p>
              <p><strong>Contact:</strong> {{ address?.phone || 'Not set' }}</p>
              <p class="address-line">
                <strong>Address:</strong>
                {{ address ? formatAddress(address) : 'No address set' }}
              </p>
              <p><strong>Transaction No.:</strong> {{ transactionNumber }}</p>
              <p>
                <strong>Delivery Schedule:</strong> {{ formattedDate }}
                {{ deliveryTime ? `at ${convertTo12Hour(deliveryTime)}` : '' }}
              </p>
              <p v-if="scheduleError" class="text-red mt-1">{{ scheduleError }}</p>
              <div class="button-group mt-2">
                <v-btn size="small" color="primary" variant="tonal" @click="showAddressDialog = true"
                  class="action-btn">
                  Change Address
                </v-btn>
                <v-btn size="small" color="primary" variant="tonal" @click="showDateTimePicker = true"
                  class="action-btn">
                  Change Schedule
                </v-btn>
              </div>
            </div>
          </v-card-text>
        </v-card>

        <!-- Items to Purchase -->
        <v-card variant="outlined" class="mb-4 card-elevated">
          <v-card-title class="card-title">
            <v-icon color="primary" class="mr-2">mdi-shopping</v-icon>
            Items to Purchase ({{ items.length }})
          </v-card-title>

          <v-list class="item-list" v-if="items.length > 0">
            <v-list-item v-for="item in items" :key="item.id" class="list-item">
              <template #prepend>
                <v-avatar class="item-avatar" rounded>
                  <v-img :src="getMainImage(item.product?.main_img_urls, item.varietyData)" :alt="item.name" cover
                    class="product-image" />
                </v-avatar>
              </template>

              <v-list-item-title class="item-name">
                {{ item.name }}
                <div v-if="item.selectedVariety || item.selectedSize" class="item-variety-info">
                  <span v-if="item.selectedVariety" class="variety-tag">
                    {{ item.selectedVariety }}
                  </span>
                  <span v-if="item.selectedSize" class="size-tag">
                    Size: {{ item.selectedSize }}
                  </span>
                </div>
              </v-list-item-title>
              <v-list-item-subtitle class="item-price">
                ₱{{ item.price.toLocaleString() }} × {{ item.quantity }}
              </v-list-item-subtitle>
              <v-list-item-subtitle class="item-subtotal">
                Subtotal: ₱{{ (item.price * item.quantity).toLocaleString() }}
              </v-list-item-subtitle>

              <template #append>
                <div class="item-actions">
                  <div class="quantity-controls">
                    <v-btn size="x-small" color="error" variant="tonal" @click="decreaseQty(item)" class="qty-btn"
                      :disabled="item.quantity <= 1">
                      −
                    </v-btn>
                    <span class="quantity-display">{{ item.quantity }}</span>
                    <v-btn size="x-small" color="primary" variant="tonal" @click="increaseQty(item)" class="qty-btn">
                      +
                    </v-btn>
                  </div>
                </div>
              </template>
            </v-list-item>
          </v-list>

          <v-card-text v-else class="text-center text-grey py-8">
            <v-icon size="48" color="grey-lighten-1" class="mb-2">mdi-cart-off</v-icon>
            <div>No items to display</div>
          </v-card-text>

          <v-divider></v-divider>
          <v-card-text class="total-price">
            Total: <strong>₱{{ totalPrice.toLocaleString() }}</strong>
          </v-card-text>
        </v-card>

        <!-- Message to Seller -->
        <v-card outlined class="mb-4 card-elevated">
          <v-card-title class="card-title">
            <v-icon color="primary" class="mr-2">mdi-message-text</v-icon>
            Message to Seller
          </v-card-title>
          <v-card-text>
            <v-textarea v-model="note" label="Write something to the seller..." auto-grow rows="2" outlined dense
              placeholder="Any special instructions or requests..." class="note-textarea"></v-textarea>
          </v-card-text>
        </v-card>

        <!-- Delivery Option -->
        <v-card outlined class="mb-4 card-elevated">
          <v-card-title class="card-title">
            <v-icon color="primary" class="mr-2">mdi-map-marker</v-icon>
            Delivery Option
          </v-card-title>
          <v-card-text>
            <v-select v-model="deliveryOption" :items="deliveryOptionsDisplay" item-title="label" item-value="value"
              label="Select delivery option" outlined dense class="delivery-select"></v-select>
          </v-card-text>
        </v-card>

        <!-- Payment Method -->
        <v-card outlined class="mb-4 card-elevated">
          <v-card-title class="card-title">
            <v-icon color="primary" class="mr-2">mdi-credit-card</v-icon>
            Payment Method
          </v-card-title>
          <v-card-text>
            <v-radio-group v-model="paymentMethod" class="payment-radio-group">
              <v-radio label="Cash on Delivery" value="cash" color="primary" />
            </v-radio-group>
          </v-card-text>
        </v-card>
      </v-container>

      <!-- Fixed Bottom Navigation -->
      <div class="bottom-nav-fixed">
        <div class="bottom-nav-content">
          <div class="total-section">
            <div class="total-label">Total Amount:</div>
            <div class="total-amount">₱{{ totalPrice.toLocaleString() }}</div>
          </div>
          <v-btn color="primary" size="large" @click="handleCheckout" class="place-order-btn"
            :disabled="!items.length || !buyer || !address" :loading="false" block>
            <v-icon left>mdi-check</v-icon>
            Place Order
          </v-btn>
        </div>
      </div>

      <!-- Address Selection Dialog -->
      <v-dialog v-model="showAddressDialog" max-width="500" persistent>
        <v-card class="address-dialog">
          <v-card-title class="address-title">
            <v-icon color="primary" class="mr-2">mdi-map-marker</v-icon>
            Select Delivery Address
          </v-card-title>
          <v-card-text class="address-content">
            <!-- No Addresses State -->
            <div v-if="addresses.length === 0" class="no-addresses">
              <v-icon size="64" color="grey-lighten-2" class="mb-3">mdi-map-marker-off</v-icon>
              <h3 class="text-h6 mb-2">No Addresses Saved</h3>
              <p class="text-body-2 text-medium-emphasis mb-4">
                You haven't saved any addresses yet. Add an address to continue with your order.
              </p>
              <v-btn color="primary" @click="addNewAddress" block>
                <v-icon left>mdi-plus</v-icon>
                Add New Address
              </v-btn>
            </div>

            <!-- Address List -->
            <div v-else class="address-list">
              <div class="address-list-title">Your Saved Addresses</div>
              <v-list class="address-list-items">
                <v-list-item v-for="addr in addresses" :key="addr.id" class="address-item"
                  :class="{ 'address-item-selected': address?.id === addr.id }" @click="selectAddress(addr)">
                  <template #prepend>
                    <v-avatar color="primary" size="40" class="address-avatar">
                      <v-icon color="white" size="20">mdi-home</v-icon>
                    </v-avatar>
                  </template>

                  <v-list-item-title class="address-recipient">
                    {{ addr.recipient_name || 'No name' }}
                    <v-chip v-if="addr.is_default" color="primary" size="x-small" class="ms-2">
                      Default
                    </v-chip>
                  </v-list-item-title>
                  <v-list-item-subtitle class="address-details">
                    <div class="address-line">{{ formatAddress(addr) }}</div>
                    <div v-if="addr.phone" class="address-phone">
                      <v-icon size="14" class="mr-1">mdi-phone</v-icon>
                      {{ addr.phone }}
                    </div>
                  </v-list-item-subtitle>

                  <template #append>
                    <v-icon v-if="address?.id === addr.id" color="primary">mdi-check-circle</v-icon>
                  </template>
                </v-list-item>
              </v-list>

              <v-divider class="my-4"></v-divider>

              <v-btn color="primary" variant="outlined" @click="addNewAddress" block>
                <v-icon left>mdi-plus</v-icon>
                Add New Address
              </v-btn>
            </div>
          </v-card-text>
          <v-card-actions class="address-actions">
            <v-btn text @click="showAddressDialog = false" class="cancel-address-btn">
              Cancel
            </v-btn>
            <v-btn v-if="addresses.length > 0" color="primary" variant="flat" @click="showAddressDialog = false"
              class="confirm-address-btn">
              Confirm Selection
            </v-btn>
          </v-card-actions>
        </v-card>
      </v-dialog>

      <!-- Date & Time Picker Dialog -->
      <v-dialog v-model="showDateTimePicker" max-width="420" class="datetime-dialog">
        <v-card class="datetime-card">
          <v-card-title class="datetime-title">
            Select Delivery Schedule
            <v-chip color="info" size="small" class="ms-2">
              Butuan City Only
            </v-chip>
          </v-card-title>
          <v-card-text class="datetime-content">
            <!-- Use the formatted date string for the date picker -->
            <v-date-picker v-model="deliveryDate" color="primary" elevation="0" show-adjacent-months :min="minDate"
              :max="maxDate" class="date-picker" @update:model-value="handleDateChange"></v-date-picker>

            <!-- Rest of your time picker code remains the same -->
            <v-divider class="my-4"></v-divider>

            <div class="time-section">
              <div class="time-label">Select Time</div>
              <div class="time-wheels">
                <div class="time-wheel">
                  <div class="time-wheel-label">Hour</div>
                  <v-virtual-scroll :items="hours12" height="160" item-height="40">
                    <template #default="{ item }">
                      <div class="time-item" :class="{ active: item === selectedHour }" @click="selectHour(item)">
                        {{ item }}
                      </div>
                    </template>
                  </v-virtual-scroll>
                </div>
                <div class="time-separator">:</div>
                <div class="time-wheel">
                  <div class="time-wheel-label">Minute</div>
                  <v-virtual-scroll :items="minutes" height="160" item-height="40">
                    <template #default="{ item }">
                      <div class="time-item" :class="{ active: item === selectedMinute }" @click="selectMinute(item)">
                        {{ item }}
                      </div>
                    </template>
                  </v-virtual-scroll>
                </div>
              </div>

              <div class="period-toggle">
                <v-btn-toggle v-model="selectedPeriod" color="primary" rounded="pill" divided class="period-buttons">
                  <v-btn value="AM" class="period-btn">AM</v-btn>
                  <v-btn value="PM" class="period-btn">PM</v-btn>
                </v-btn-toggle>
              </div>

              <div class="selected-schedule">
                <div class="schedule-label">Selected Schedule</div>
                <div class="schedule-display">
                  {{ formattedDate }} — {{ selectedHour || '--' }}:{{ selectedMinute || '--' }} {{ selectedPeriod }}
                </div>

                <!-- Real-time validation feedback -->
                <div v-if="deliveryDate && deliveryTime" class="validation-feedback mt-2">
                  <v-alert v-if="scheduleError" type="error" density="compact" class="mb-0">
                    {{ scheduleError }}
                  </v-alert>
                  <v-alert v-else type="success" density="compact" class="mb-0">
                    ✅ This time slot is available!
                  </v-alert>
                </div>

                <div v-else class="text-caption text-medium-emphasis mt-2">
                  Please select both date and time
                </div>
              </div>
            </div>
          </v-card-text>

          <v-card-actions class="datetime-actions">
            <v-btn text @click="showDateTimePicker = false" class="cancel-datetime-btn">
              Cancel
            </v-btn>
            <v-btn color="primary" variant="flat" @click="confirmDateTime" class="confirm-datetime-btn"
              :disabled="!!scheduleError || !deliveryDate || !deliveryTime">
              Confirm Schedule
            </v-btn>
          </v-card-actions>
        </v-card>
      </v-dialog>

    </v-main>
  </v-app>
</template>

<style scoped>
/* Global Styles */
:root {
  --primary-color: #438fda;
  --error-color: #dc2626;
  --success-color: #10b981;
  --text-primary: #333;
  --text-secondary: #666;
  --border-color: #e0e0e0;
  --card-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

/* Main Content */
.main-content {
  padding-bottom: 120px !important;
  background-color: #f8fafc;
}

/* Container & Layout */
.px-3 {
  padding-left: 12px;
  padding-right: 12px;
}

.card-elevated {
  box-shadow: var(--card-shadow) !important;
  border-radius: 12px !important;
  border: 1px solid var(--border-color);
}

.card-title {
  font-size: 1.1rem !important;
  font-weight: 600 !important;
  padding: 16px 20px 8px !important;
  color: var(--text-primary);
  display: flex;
  align-items: center;
}

.card-content {
  padding: 8px 20px 16px !important;
}

/* Buyer Info */
.buyer-info p {
  margin: 6px 0;
  font-size: 0.9rem;
  line-height: 1.4;
}

.address-line {
  word-break: break-word;
}

.text-red {
  color: var(--error-color);
  font-size: 0.85rem;
}

.button-group {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.action-btn {
  font-size: 0.8rem !important;
  min-width: auto !important;
}

/* Items List */
.item-list {
  padding: 0 !important;
}

.list-item {
  padding: 16px !important;
  border-bottom: 1px solid var(--border-color);
  align-items: start;
}

.list-item:last-child {
  border-bottom: none;
}

.item-avatar {
  min-width: 60px !important;
  width: 60px !important;
  height: 60px !important;
}

.product-image {
  border-radius: 8px;
  object-fit: cover;
}

.item-name {
  font-size: 1rem !important;
  font-weight: 600 !important;
  line-height: 1.3;
  margin-bottom: 4px;
  color: var(--text-primary);
}

.item-price {
  font-size: 0.9rem !important;
  color: var(--primary-color) !important;
  font-weight: 600 !important;
}

.item-subtotal {
  font-size: 0.85rem !important;
  color: var(--text-secondary) !important;
  font-weight: 500 !important;
}

.item-actions {
  margin: 0 !important;
  min-width: auto;
}

.quantity-controls {
  display: flex;
  align-items: center;
  gap: 8px;
  justify-content: flex-end;
}

.qty-btn {
  min-width: 32px !important;
  width: 32px !important;
  height: 32px !important;
  font-size: 0.9rem !important;
  font-weight: bold;
}

.quantity-display {
  min-width: 30px;
  text-align: center;
  font-weight: 600;
  font-size: 0.95rem;
  background: #f5f5f5;
  padding: 4px 8px;
  border-radius: 4px;
}

.total-price {
  text-align: right;
  font-weight: 700 !important;
  font-size: 1.2rem !important;
  color: var(--primary-color);
  padding: 16px 20px !important;
  background: #f8fafc;
  border-radius: 0 0 12px 12px;
}

/* Note Textarea */
.note-textarea {
  font-size: 0.9rem;
}

/* Delivery Select */
.delivery-select {
  margin-bottom: 0;
}

/* Payment Method */
.payment-radio-group {
  margin-top: 0;
}

/* Fixed Bottom Navigation */
.bottom-nav-fixed {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  background: white;
  border-top: 1px solid var(--border-color);
  box-shadow: 0 -2px 12px rgba(0, 0, 0, 0.1);
  z-index: 1000;
  padding: 16px;
}

.bottom-nav-content {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  max-width: 800px;
  margin: 0 auto;
}

.total-section {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  flex: 1;
}

.total-label {
  font-size: 0.85rem;
  color: var(--text-secondary);
  font-weight: 500;
  margin-bottom: 2px;
}

.total-amount {
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--primary-color);
  line-height: 1.2;
}

.place-order-btn {
  min-width: 160px;
  font-weight: 600;
  text-transform: none;
  border-radius: 8px;
  height: 52px;
  font-size: 1rem;
  flex-shrink: 0;
}

/* Address Dialog Styles */
.address-dialog {
  border-radius: 16px !important;
  overflow: hidden;
}

.address-title {
  text-align: center;
  font-weight: 700 !important;
  font-size: 1.1rem !important;
  color: var(--primary-color);
  padding: 20px 20px 0 !important;
  display: flex;
  align-items: center;
  justify-content: center;
}

.address-content {
  padding: 16px 20px;
}

.no-addresses {
  text-align: center;
  padding: 20px 0;
}

.address-list-title {
  font-weight: 600;
  font-size: 1rem;
  margin-bottom: 12px;
  color: var(--text-primary);
}

.address-list-items {
  padding: 0 !important;
  max-height: 300px;
  overflow-y: auto;
}

.address-item {
  border: 1px solid var(--border-color);
  border-radius: 8px;
  margin-bottom: 8px;
  padding: 12px !important;
  cursor: pointer;
  transition: all 0.3s ease;
}

.address-item:hover {
  border-color: var(--primary-color);
  background-color: #f0f7ff;
}

.address-item-selected {
  border-color: var(--primary-color);
  background-color: #e3f2fd;
}

.address-avatar {
  margin-right: 12px;
}

.address-recipient {
  font-weight: 600 !important;
  font-size: 0.95rem !important;
  color: var(--text-primary);
  display: flex;
  align-items: center;
  margin-bottom: 4px;
}

.address-details {
  font-size: 0.85rem !important;
  color: var(--text-secondary) !important;
}

.address-line {
  line-height: 1.4;
  margin-bottom: 4px;
}

.address-phone {
  display: flex;
  align-items: center;
  font-size: 0.8rem;
  color: var(--text-secondary);
}

.address-actions {
  justify-content: flex-end;
  gap: 8px;
  padding: 16px 20px 20px;
}

.cancel-address-btn,
.confirm-address-btn {
  min-width: 80px;
}

/* Date Time Picker */
.datetime-dialog {
  max-width: 95vw !important;
}

.datetime-card {
  border-radius: 16px !important;
  overflow: hidden;
}

.datetime-title {
  text-align: center;
  font-weight: 700 !important;
  font-size: 1.1rem !important;
  color: var(--primary-color);
  padding: 20px 20px 0 !important;
}

.datetime-content {
  padding: 16px 20px;
}

.date-picker {
  width: 100%;
}

.time-section {
  text-align: center;
}

.time-label {
  font-weight: 600;
  font-size: 1rem;
  margin-bottom: 12px;
  color: var(--text-primary);
}

.time-wheels {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}

.time-wheel {
  width: 60px;
  background: #f8fafc;
  border-radius: 12px;
  border: 1px solid var(--border-color);
  overflow: hidden;
  text-align: center;
  box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.06);
}

.time-separator {
  font-size: 1.2rem;
  font-weight: 700;
  color: var(--text-secondary);
}

.time-item {
  height: 40px;
  line-height: 40px;
  cursor: pointer;
  font-weight: 500;
  color: var(--text-secondary);
  transition: all 0.25s ease;
  border-radius: 6px;
  margin: 2px;
  font-size: 0.95rem;
}

.time-item:hover {
  background-color: #e3f2fd;
  color: var(--primary-color);
}

.time-item.active {
  background-color: var(--primary-color);
  color: white;
  font-weight: 600;
  transform: scale(1.05);
}

.period-toggle {
  margin: 16px 0;
}

.period-buttons {
  border: 1px solid var(--border-color);
  background: #f9fafb;
}

.period-btn {
  font-weight: 600;
  text-transform: none;
  font-size: 0.9rem;
}

.selected-schedule {
  margin-top: 16px;
  padding: 12px;
  background: #f0f7ff;
  border-radius: 8px;
  border: 1px solid var(--primary-color);
}

.schedule-label {
  font-weight: 600;
  font-size: 0.95rem;
  color: var(--text-primary);
  margin-bottom: 8px;
}

.schedule-display {
  font-size: 1.1rem;
  font-weight: 700;
  color: var(--primary-color);
  line-height: 1.3;
}

.schedule-error {
  font-size: 0.85rem;
  font-weight: 500;
}

.datetime-actions {
  justify-content: flex-end;
  gap: 8px;
  padding: 16px 20px 20px;
}

.cancel-datetime-btn,
.confirm-datetime-btn {
  min-width: 80px;
}

/* App Bar */
.app-bar-title {
  font-size: 1.1rem !important;
  font-weight: 600;
}

.time-wheel-label {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--text-secondary);
  text-align: center;
  margin-bottom: 8px;
  text-transform: uppercase;
}

.validation-feedback {
  font-size: 0.8rem;
}

.time-wheels {
  display: flex;
  justify-content: center;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 16px;
}

.time-wheel {
  width: 70px;
  background: #f8fafc;
  border-radius: 12px;
  border: 1px solid var(--border-color);
  overflow: hidden;
  text-align: center;
  box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.06);
  padding: 8px 0;
}

/* Responsive Design */
@media (max-width: 600px) {
  .px-3 {
    padding-left: 8px;
    padding-right: 8px;
  }

  .card-title {
    font-size: 1rem !important;
    padding: 14px 16px 6px !important;
  }

  .card-content {
    padding: 6px 16px 14px !important;
  }

  .item-avatar {
    min-width: 50px !important;
    width: 50px !important;
    height: 50px !important;
  }

  .item-name {
    font-size: 0.9rem !important;
  }

  .item-price {
    font-size: 0.85rem !important;
  }

  .qty-btn {
    min-width: 28px !important;
    width: 28px !important;
    height: 28px !important;
  }

  .quantity-display {
    font-size: 0.9rem;
  }

  .total-price {
    font-size: 1.1rem !important;
    padding: 14px 16px !important;
  }

  /* Bottom Nav Mobile */
  .bottom-nav-fixed {
    padding: 12px;
  }

  .bottom-nav-content {
    gap: 12px;
  }

  .total-label {
    font-size: 0.8rem;
  }

  .total-amount {
    font-size: 1.3rem;
  }

  .place-order-btn {
    min-width: 140px;
    height: 48px;
    font-size: 0.95rem;
  }

  .datetime-dialog {
    margin: 8px !important;
  }

  .datetime-title {
    font-size: 1rem !important;
    padding: 16px 16px 0 !important;
  }

  .datetime-content {
    padding: 12px 16px;
  }

  .time-wheel {
    width: 55px;
  }

  .time-item {
    height: 36px;
    line-height: 36px;
    font-size: 0.9rem;
  }

  .schedule-display {
    font-size: 1rem;
  }

  .button-group {
    flex-direction: column;
    align-items: stretch;
  }

  .action-btn {
    width: 100%;
    justify-content: center;
  }

  /* Address Dialog Mobile */
  .address-dialog {
    margin: 8px !important;
  }

  .address-title {
    font-size: 1rem !important;
    padding: 16px 16px 0 !important;
  }

  .address-content {
    padding: 12px 16px;
  }

  .address-item {
    padding: 10px !important;
  }

  .address-avatar {
    margin-right: 8px;
  }
}

@media (max-width: 400px) {
  .list-item {
    padding: 12px !important;
  }

  .item-avatar {
    min-width: 45px !important;
    width: 45px !important;
    height: 45px !important;
  }

  .time-wheels {
    gap: 8px;
  }

  .time-wheel {
    width: 50px;
  }

  .time-separator {
    font-size: 1.1rem;
  }

  .datetime-actions {
    padding: 12px 16px 16px;
  }

  .address-actions {
    padding: 12px 16px 16px;
  }

  .bottom-nav-content {
    flex-direction: column;
    gap: 8px;
    align-items: stretch;
  }

  .total-section {
    align-items: center;
    text-align: center;
  }

  .place-order-btn {
    min-width: 100%;
  }
}

/* Animation for buttons and interactive elements */
.qty-btn,
.action-btn,
.place-order-btn,
.time-item,
.period-btn,
.cancel-datetime-btn,
.confirm-datetime-btn,
.address-item {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

/* Ensure proper spacing and alignment */
.v-main {
  background-color: #f8fafc;
  position: relative;
}

.v-container {
  max-width: 800px;
  margin: 0 auto;
}

.item-variety-info {
  margin-top: 4px;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.variety-tag {
  background: #e3f2fd;
  color: #1976d2;
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 0.75rem;
  font-weight: 500;
  border: 1px solid #bbdefb;
}

.size-tag {
  background: #f3e5f5;
  color: #7b1fa2;
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 0.75rem;
  font-weight: 500;
  border: 1px solid #e1bee7;
}
</style>