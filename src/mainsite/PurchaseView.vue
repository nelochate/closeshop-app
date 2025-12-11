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
// 📋 CLIPBOARD STATE
const showCopySuccess = ref(false)
const copyButtonText = ref('Copy')
// 📅 DATE & TIME STATE - FLEXIBLE DATE SELECTION
const showDateTimePicker = ref(false)
const deliveryDate = ref('')
const deliveryTime = ref('')
const selectedHour = ref('')
const selectedMinute = ref('')
const selectedPeriod = ref<'AM' | 'PM'>('AM')

// 👤 CONTACT STATE
const showContactDialog = ref(false)
const contactPhone = ref('')
const contactEmail = ref('')

// 🚫 VALIDATION STATE
const validationErrors = ref<string[]>([])
const isProcessing = ref(false)

// 🏪 SHOP STATE
const shopSchedule = ref({
  openDays: [1, 2, 3, 4, 5, 6], // Default: Monday to Saturday
  openHour: 9, // Default opening hour
  closeHour: 19, // Default closing hour
  meetupDetails: 'Main Entrance',
  manualStatus: 'auto',
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
    shopSchedule: shopSchedule.value,
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
        manualStatus: 'auto',
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
        manualStatus: 'auto',
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
      manualStatus: shop.manual_status || 'auto',
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
      manualStatus: 'auto',
    }
  }
}

// 🐛 DEBUG STATE
const debugState = () => {
  console.log('🔍 DEBUG STATE:')
  console.log('Route params:', route.params)
  console.log('Route query:', route.query)
  console.log('History state:', history.state)
  console.log('Current items:', items.value)

  // Check localStorage
  const savedIds = localStorage.getItem('selectedCartItemIds')
  console.log('LocalStorage IDs:', savedIds)

  // Check cartItemIds
  console.log('cartItemIds:', cartItemIds.value)
}

// 🔍 DEBUG ITEMS FUNCTION
const debugItems = () => {
  console.log('🔍 DEBUG ITEMS:')
  items.value.forEach((item, index) => {
    console.log(`Item ${index + 1}:`, {
      name: item.name,
      hasProduct: !!item.product,
      main_img_urls: item.product?.main_img_urls,
      varietyData: item.varietyData,
      image: item.image, // Check if this is populated
      directImage: item.image, // Check direct image property
    })
    
    // Test the getMainImage function
    const testImage = getMainImage(item.image || item.product?.main_img_urls, item.varietyData)
    console.log(`Test getMainImage result:`, testImage)
  })
}

// 🛒 FETCH CART ITEMS BY IDS (DIRECT)
const fetchCartItemsDirect = async (itemIds: string[]) => {
  console.log('🔍 fetchCartItemsDirect called with IDs:', itemIds)

  try {
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      console.log('❌ No user logged in')
      items.value = []
      return
    }

    // Convert to plain array
    const ids = [...itemIds]
    console.log('🔍 Filtering with IDs:', ids)

    if (ids.length === 0) {
      console.log('⚠️ No IDs to filter')
      items.value = []
      return
    }

    // Fetch with filter
    const { data, error } = await supabase
      .from('cart_items')
      .select(
        `
        *,
        product:products (
          *,
          shop:shops (*)
        )
      `,
      )
      .eq('user_id', user.id)
      .in('id', ids)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('❌ Database error:', error)
      throw error
    }

    console.log(`✅ Found ${data?.length || 0} items in database`)

    if (!data || data.length === 0) {
      console.log('🛒 No cart items found with given IDs')
      items.value = []
      return
    }

    // Transform items
    items.value = data.map((cartItem) => {
      const product = cartItem.product || {}
      const shop = product.shop || {}
      const mainImage = getMainImage(product.main_img_urls)

      // Handle variety data
      let finalPrice = product.price || 0
      let itemName = product.prod_name || 'Unnamed Product'
      let varietyData = cartItem.variety_data
      let itemImage = mainImage

      if (cartItem.variety_data && typeof cartItem.variety_data === 'object') {
        finalPrice = cartItem.variety_data.price || product.price || 0
        itemName = `${product.prod_name || 'Product'} - ${cartItem.variety_data.name || 'Variety'}`
        varietyData = cartItem.variety_data
        
        // Try to get variety image
        if (varietyData?.images && varietyData.images.length > 0) {
          itemImage = varietyData.images[0]
        }
      }

      const transformedItem = {
        id: cartItem.product_id,
        product_id: cartItem.product_id,
        name: itemName,
        price: finalPrice,
        varietyPrice: finalPrice,
        quantity: cartItem.quantity || 1,
        selectedSize: cartItem.selected_size,
        selectedVariety: cartItem.selected_variety,
        varietyData: varietyData,
        image: itemImage, // Use the image we determined
        cart_item_id: cartItem.id,
        shop_id: shop.id || product.shop_id,
        product: product,
      }

      console.log(`✅ Loaded: ${transformedItem.name} (Qty: ${transformedItem.quantity})`, transformedItem.image)
      return transformedItem
    })

    fromCart.value = true
    console.log(`🎯 FINAL: Loaded ${items.value.length} selected items`)
  } catch (err) {
    console.error('❌ Error in fetchCartItemsDirect:', err)
    items.value = []
  }
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
      `,
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

    const quantity = route.query.quantity ? parseInt(route.query.quantity as string) : 1

    let finalPrice = product.price
    let itemName = product.prod_name
    let varietyData = null
    let itemImage = getMainImage(product.main_img_urls)

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
          
          // Try to get variety image
          if (variety.images && variety.images.length > 0) {
            itemImage = variety.images[0]
          }
        }
      } catch (parseError) {
        console.warn('⚠️ Error parsing varieties:', parseError)
      }
    }

    // Transform product to item format
    items.value = [
      {
        id: product.id,
        product_id: product.id,
        name: itemName,
        price: finalPrice,
        varietyPrice: finalPrice,
        quantity: quantity,
        selectedSize: selectedSize,
        selectedVariety: selectedVariety,
        varietyData: varietyData,
        image: itemImage, // Make sure image is set
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

// 🛒 FETCH CART ITEMS - SIMPLE VERSION
const fetchCartItems = async () => {
  console.log('🛒 fetchCartItems called (legacy)')

  // If we have cartItemIds, use direct method
  if (cartItemIds.value && cartItemIds.value.length > 0) {
    await fetchCartItemsDirect(cartItemIds.value)
  } else {
    await fetchAllCartItems()
  }
}

// 📞 LOAD CONTACT INFO
const loadContactInfo = async () => {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return

    // Get contact info from profile - ONLY PHONE
    const { data: profile } = await supabase
      .from('profiles')
      .select('phone')
      .eq('id', user.id)
      .single()

    if (profile) {
      contactPhone.value = profile.phone || ''
    }

    // Clear email since it's not in profile schema
    contactEmail.value = user.email || ''

    // Also check if address has phone
    if (address.value?.phone) {
      contactPhone.value = address.value.phone
    }
  } catch (err) {
    console.error('❌ Error loading contact info:', err)
  }
}

// 🎯 INITIALIZATION - FIXED VERSION
onMounted(async () => {
  console.log('🚀 Purchase View Mounted')

  // Debug first
  debugState()
  
  // Generate transaction number
  if (!transactionNumber.value) {
    transactionNumber.value = await generateUniqueTransactionNumber()
  }

  // Load items FIRST (this sets cartItemIds if needed)
  await loadItems()
  
  // Debug items
  debugItems() // Add this line

  // Load other data
  if (items.value.length > 0) {
    await loadShopData()
  }

  await loadUserData()
  initializeDateTime()

  console.log('✅ Page initialized')
})

// In purchaseview.vue, update the loadItems function:
const loadItems = async () => {
  console.log('🛒 LOAD ITEMS - Starting item loading process')

  // Clear previous items
  items.value = []

  // METHOD 1: Check if items are in history state (most reliable for direct purchase)
  if (history.state?.items && Array.isArray(history.state.items)) {
    console.log('📦 Items found in history state:', history.state.items)

    // Check if it's a direct product purchase
    if (history.state.directProduct || route.query.fromProduct === 'true') {
      console.log('🛍️ Direct product purchase detected')

      // Use items directly from state
      items.value = history.state.items.map((item) => ({
        ...item,
        product_id: item.product_id || item.id,
        quantity: item.quantity || parseInt(route.query.quantity) || 1,
        selectedSize: item.selectedSize || item.size || route.query.size || null,
        selectedVariety: item.selectedVariety || item.variety || route.query.variety || null,
        varietyData: item.varietyData || null,
        price: item.price || item.varietyPrice || 0,
        shop_id: item.shop_id || item.product?.shop_id,
      }))

      fromCart.value = false
      console.log('✅ Loaded direct purchase items:', items.value)
      return
    }

    // Handle cart items from state
    items.value = history.state.items.map((item) => ({
      ...item,
      product_id: item.product_id || item.id,
      quantity: item.quantity || 1,
      selectedSize: item.selectedSize || item.size,
      selectedVariety: item.selectedVariety || item.variety,
      varietyData: item.varietyData || null,
      price: item.price || item.varietyPrice || 0,
      cart_item_id: item.cart_item_id || item.id,
      shop_id: item.shop_id || item.product?.shop_id,
    }))

    fromCart.value = history.state.fromCart || true
    console.log('✅ Loaded items from history state:', items.value.length)
    return
  }

  // METHOD 2: Direct product purchase from query parameters
  if (route.query.productId || route.params.id || route.params.productId) {
    const productId = route.query.productId || route.params.id || route.params.productId
    console.log('🛍️ Direct product purchase via query:', productId)
    await fetchProductFromId(productId as string)
    return
  }

  // METHOD 3: Check query parameters for cart items
  if (route.query.cartItemIds) {
    console.log('📍 IDs from query params:', route.query.cartItemIds)
    try {
      cartItemIds.value = JSON.parse(route.query.cartItemIds as string)
      console.log('✅ Parsed cartItemIds:', cartItemIds.value)
      await fetchCartItemsByIDs(cartItemIds.value)
      return
    } catch (error) {
      console.error('❌ Error parsing cartItemIds:', error)
    }
  }

  // METHOD 4: Check localStorage
  const savedIds = localStorage.getItem('selectedCartItemIds')
  if (savedIds) {
    console.log('📋 Found IDs in localStorage:', savedIds)
    try {
      cartItemIds.value = JSON.parse(savedIds)
      await fetchCartItemsByIDs(cartItemIds.value)
      return
    } catch (error) {
      console.error('❌ Error parsing localStorage IDs:', error)
    }
  }

  // METHOD 5: Fallback - load all cart items
  console.log('⚠️ Fallback: Loading all cart items')
  await fetchAllCartItems()
}

// 🛒 FETCH CART ITEMS BY IDs - SIMPLIFIED
const fetchCartItemsByIDs = async (ids: string[]) => {
  console.log('🔍 fetchCartItemsByIDs called with:', ids)

  try {
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      console.log('❌ No user')
      items.value = []
      return
    }

    if (!ids || ids.length === 0) {
      console.log('⚠️ No IDs provided')
      items.value = []
      return
    }

    // Convert to array if needed
    const idArray = Array.isArray(ids) ? ids : [ids]
    console.log('🔍 Querying with IDs:', idArray)

    const { data, error } = await supabase
      .from('cart_items')
      .select(
        `
        *,
        product:products (
          *,
          shop:shops (*)
        )
      `,
      )
      .eq('user_id', user.id)
      .in('id', idArray)

    if (error) throw error

    console.log(`✅ Found ${data?.length || 0} items`)

    if (!data || data.length === 0) {
      console.log('🛒 No items found')
      items.value = []
      return
    }

    // Transform items
    items.value = data.map((cartItem) => {
      const product = cartItem.product || {}
      const shop = product.shop || {}
      const mainImage = getMainImage(product.main_img_urls)

      let finalPrice = product.price || 0
      let itemName = product.prod_name || 'Unnamed Product'
      let varietyData = cartItem.variety_data
      let itemImage = mainImage

      if (cartItem.variety_data && typeof cartItem.variety_data === 'object') {
        finalPrice = cartItem.variety_data.price || product.price || 0
        itemName = `${product.prod_name || 'Product'} - ${cartItem.variety_data.name || 'Variety'}`
        varietyData = cartItem.variety_data
        
        // Try to get variety image
        if (varietyData?.images && varietyData.images.length > 0) {
          itemImage = varietyData.images[0]
        }
      }

      return {
        id: cartItem.product_id,
        product_id: cartItem.product_id,
        name: itemName,
        price: finalPrice,
        varietyPrice: finalPrice,
        quantity: cartItem.quantity || 1,
        selectedSize: cartItem.selected_size,
        selectedVariety: cartItem.selected_variety,
        varietyData: varietyData,
        image: itemImage, // Use determined image
        cart_item_id: cartItem.id,
        shop_id: shop.id || product.shop_id,
        product: product,
      }
    })

    fromCart.value = true
    console.log(`🎯 Loaded ${items.value.length} items`)
  } catch (err) {
    console.error('❌ Error:', err)
    items.value = []
  }
}

// 🛒 FETCH ALL CART ITEMS
const fetchAllCartItems = async () => {
  console.log('🔍 fetchAllCartItems called')

  try {
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      console.log('❌ No user')
      items.value = []
      return
    }

    const { data, error } = await supabase
      .from('cart_items')
      .select(
        `
        *,
        product:products (
          *,
          shop:shops (*)
        )
      `,
      )
      .eq('user_id', user.id)

    if (error) throw error

    items.value =
      data?.map((cartItem) => {
        const product = cartItem.product || {}
        const shop = product.shop || {}
        const mainImage = getMainImage(product.main_img_urls)

        let finalPrice = product.price || 0
        let itemName = product.prod_name || 'Unnamed Product'
        let varietyData = cartItem.variety_data
        let itemImage = mainImage

        if (cartItem.variety_data && typeof cartItem.variety_data === 'object') {
          finalPrice = cartItem.variety_data.price || product.price || 0
          itemName = `${product.prod_name || 'Product'} - ${cartItem.variety_data.name || 'Variety'}`
          varietyData = cartItem.variety_data
          
          // Try to get variety image
          if (varietyData?.images && varietyData.images.length > 0) {
            itemImage = varietyData.images[0]
          }
        }

        return {
          id: cartItem.product_id,
          product_id: cartItem.product_id,
          name: itemName,
          price: finalPrice,
          varietyPrice: finalPrice,
          quantity: cartItem.quantity || 1,
          selectedSize: cartItem.selected_size,
          selectedVariety: cartItem.selected_variety,
          varietyData: varietyData,
          image: itemImage, // Use determined image
          cart_item_id: cartItem.id,
          shop_id: shop.id || product.shop_id,
          product: product,
        }
      }) || []

    fromCart.value = true
    console.log(`✅ Loaded ${items.value.length} items`)
  } catch (err) {
    console.error('❌ Error:', err)
    items.value = []
  }
}

// 📞 UPDATE CONTACT INFO
const updateContactInfo = async () => {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      alert('Please log in to update contact info')
      return
    }

    // Validate phone
    if (!contactPhone.value || contactPhone.value.trim() === '') {
      alert('Please enter a valid phone number')
      return
    }

    // Basic phone format validation
    const phoneRegex = /^(09|\+639)\d{9}$/
    const cleanPhone = contactPhone.value.replace(/\s+/g, '')
    if (!phoneRegex.test(cleanPhone)) {
      alert('Please enter a valid Philippine phone number (09xxxxxxxxx or +639xxxxxxxxx)')
      return
    }

    // Update profile - ONLY PHONE (no email column)
    const { error: profileError } = await supabase
      .from('profiles')
      .update({
        phone: contactPhone.value,
        // REMOVED: email: contactEmail.value || user.email
      })
      .eq('id', user.id)

    if (profileError) {
      console.error('❌ Profile update error:', profileError)
      throw profileError
    }

    // Also update current address phone if address exists
    if (address.value) {
      const { error: addressError } = await supabase
        .from('addresses')
        .update({ phone: contactPhone.value })
        .eq('id', address.value.id)

      if (addressError) {
        console.warn('⚠️ Could not update address phone:', addressError)
      }
    }

    alert('Contact information updated successfully!')
    showContactDialog.value = false
    await loadUserData() // Refresh user data
  } catch (err) {
    console.error('❌ Error updating contact info:', err)
    alert('Failed to update contact information')
  }
}

// ✅ VALIDATE ALL FIELDS BEFORE CHECKOUT - SIMPLIFIED ADDRESS VALIDATION
const validateAllFields = (): boolean => {
  validationErrors.value = []

  // 1. Check items
  if (!items.value || items.value.length === 0) {
    validationErrors.value.push('No items to purchase')
  }

  // 2. Check buyer info
  if (!buyer.value) {
    validationErrors.value.push('User information not found')
  }

  // 3. Check address - SIMPLIFIED: Just check if an address is selected
  if (!address.value) {
    validationErrors.value.push('Please select a delivery address')
  }
  // REMOVED: No need to check individual address fields since users can only pick from saved addresses

  // 4. Check contact info - REQUIRED
  if (!contactPhone.value || contactPhone.value.trim() === '') {
    validationErrors.value.push('Contact phone number is required')
  } else if (!/^(09|\+639)\d{9}$/.test(contactPhone.value.replace(/\s+/g, ''))) {
    validationErrors.value.push('Please enter a valid Philippine phone number')
  }

  // 5. Check delivery schedule
  if (!deliveryDate.value || !deliveryTime.value) {
    validationErrors.value.push('Delivery schedule is required')
  } else if (!isWithinShopHours(deliveryDate.value, deliveryTime.value)) {
    validationErrors.value.push(scheduleError.value || 'Invalid delivery schedule')
  }

  // 6. Check delivery option
  if (!deliveryOption.value) {
    validationErrors.value.push('Delivery option is required')
  }

  // 7. Check payment method
  if (!paymentMethod.value) {
    validationErrors.value.push('Payment method is required')
  }

  return validationErrors.value.length === 0
}

// 🚨 SHOW VALIDATION ALERTS
const showValidationAlert = () => {
  if (validationErrors.value.length > 0) {
    const errorList = validationErrors.value
      .map((error, index) => `${index + 1}. ${error}`)
      .join('\n')
    alert(`Please complete the following:\n\n${errorList}`)
    return true
  }
  return false
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

    // Load contact info
    await loadContactInfo()

    // Load addresses
    await loadUserAddresses()

    console.log('✅ User data loaded:', { buyer: buyer.value, address: address.value })
  } catch (err) {
    console.error('❌ Error loading user data:', err)
  }
}

// 🏠 LOAD USER ADDRESSES - IMPROVED
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
      .order('is_default', { ascending: false }) // Default addresses first
      .order('updated_at', { ascending: false }) // Recently updated first

    if (error) {
      console.error('❌ Error loading addresses:', error)
      return
    }

    addresses.value = userAddresses || []

    if (addresses.value.length > 0) {
      // Use the first default address (there should be only one due to unique constraint)
      const defaultAddress = addresses.value.find((addr) => addr.is_default)

      if (defaultAddress) {
        address.value = defaultAddress
        console.log('✅ Using default address:', defaultAddress)
      } else {
        // No default address, use the most recent
        address.value = addresses.value[0]
        console.log('ℹ️ No default address, using most recent:', address.value)
      }
    } else {
      address.value = null
      console.log('ℹ️ No addresses found for user')
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

// 🏠 FORMAT ADDRESS FOR DISPLAY - IMPROVED
const formatAddress = (addr: any): string => {
  if (!addr) return 'No address set'

  // Build address parts in a logical order
  const addressParts = []

  // Basic address components
  if (addr.house_no) addressParts.push(addr.house_no)
  if (addr.building) addressParts.push(addr.building)
  if (addr.street) addressParts.push(addr.street)

  // Optional: Purok
  if (addr.purok) addressParts.push(`Purok ${addr.purok}`)

  // Barangay (important for Butuan City)
  if (addr.barangay_name) addressParts.push(addr.barangay_name)

  // City (Butuan City)
  if (addr.city_name) addressParts.push(addr.city_name)

  // Optional: Province
  if (addr.province_name && addr.province_name !== addr.city_name) {
    addressParts.push(addr.province_name)
  }

  // Optional: Region
  if (addr.region_name) addressParts.push(addr.region_name)

  // Optional: Postal Code
  if (addr.postal_code) addressParts.push(addr.postal_code)

  // If no address parts, return a fallback
  if (addressParts.length === 0) {
    return 'Address details not complete'
  }

  // Join with comma separator
  return addressParts.join(', ')
}

// 🏠 SET DEFAULT ADDRESS FUNCTION
const setDefaultAddress = async (addressId: string) => {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return

    // First, unset all other default addresses for this user
    const { error: unsetError } = await supabase
      .from('addresses')
      .update({ is_default: false })
      .eq('user_id', user.id)

    if (unsetError) throw unsetError

    // Then set the selected address as default
    const { error: setError } = await supabase
      .from('addresses')
      .update({ is_default: true })
      .eq('id', addressId)
      .eq('user_id', user.id)

    if (setError) throw setError

    // Reload addresses
    await loadUserAddresses()
    alert('Default address updated successfully!')
  } catch (err) {
    console.error('❌ Error setting default address:', err)
    alert('Failed to set default address')
  }
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

    console.log(
      `🕒 Checking date: ${deliveryDateObj.toDateString()}, day: ${day}, open: ${isOpenDay}`,
    )

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
    dateValue: date,
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
      isValidDate: !isNaN(selectedDateTime.getTime()),
    })

    // Check if selected date is valid
    if (isNaN(selectedDateTime.getTime())) {
      console.error('❌ Invalid date/time combination:', { date, time })
      scheduleError.value = 'Invalid date/time selection. Please try again.'
      return false
    }

    // Check if selected date is in the past
    if (selectedDateTime < now) {
      scheduleError.value =
        'Cannot select a date/time in the past. Please choose a future date and time.'
      return false
    }

    // Check if shop is manually closed
    if (shopSchedule.value.manualStatus === 'closed') {
      scheduleError.value =
        'Shop is currently closed. Please select another time or contact the seller.'
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
      includesDay: shopSchedule.value.openDays.includes(dayOfWeek),
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
      closeHour: shopSchedule.value.closeHour,
    })

    // Check if time is within open hours
    if (selectedTimeInMinutes < openTimeInMinutes) {
      const openTime12 = convertTo12Hour(
        `${shopSchedule.value.openHour.toString().padStart(2, '0')}:00`,
      )
      scheduleError.value = `Shop opens at ${openTime12}. Please select a later time.`
      return false
    }

    if (selectedTimeInMinutes >= closeTimeInMinutes) {
      const closeTime12 = convertTo12Hour(
        `${shopSchedule.value.closeHour.toString().padStart(2, '0')}:00`,
      )
      scheduleError.value = `Shop closes at ${closeTime12}. Please select an earlier time.`
      return false
    }

    // Additional check: If selecting today, ensure time is in the future
    const today = new Date()
    const isToday = selectedDateTime.toDateString() === today.toDateString()
    if (isToday) {
      const currentTimeInMinutes = today.getHours() * 60 + today.getMinutes()
      if (selectedTimeInMinutes <= currentTimeInMinutes) {
        scheduleError.value = "Please select a future time for today's delivery."
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
    period: selectedPeriod.value,
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
    period: selectedPeriod.value,
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
      hour24: hourNum,
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

// 📋 COPY TO CLIPBOARD FUNCTION
const copyToClipboard = async () => {
  try {
    await navigator.clipboard.writeText(transactionNumber.value)
    copyButtonText.value = 'Copied!'
    showCopySuccess.value = true
    
    // Reset button text after 2 seconds
    setTimeout(() => {
      copyButtonText.value = 'Copy'
      showCopySuccess.value = false
    }, 2000)
    
    console.log('✅ Transaction number copied to clipboard')
  } catch (err) {
    console.error('❌ Failed to copy:', err)
    copyButtonText.value = 'Copy Failed'
    
    // Fallback for older browsers
    const textArea = document.createElement('textarea')
    textArea.value = transactionNumber.value
    document.body.appendChild(textArea)
    textArea.select()
    
    try {
      document.execCommand('copy')
      copyButtonText.value = 'Copied!'
      showCopySuccess.value = true
      
      setTimeout(() => {
        copyButtonText.value = 'Copy'
        showCopySuccess.value = false
      }, 2000)
    } catch (fallbackErr) {
      console.error('❌ Fallback copy failed:', fallbackErr)
      copyButtonText.value = 'Failed'
    }
    
    document.body.removeChild(textArea)
  }
}
// 📋 FORMAT TRANSACTION NUMBER FOR DISPLAY
const formattedTransactionNumber = computed(() => {
  if (!transactionNumber.value) return 'Loading...'
  
  // Format as: TX-ABCDEF-12345-67890
  const parts = transactionNumber.value.split('-')
  if (parts.length >= 4) {
    return `${parts[0]}-${parts[1]?.toUpperCase()}-${parts[2]?.toUpperCase()}-${parts[3]?.toUpperCase()}`
  }
  return transactionNumber.value.toUpperCase()
})
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

// 🖼️ IMPROVED IMAGE HELPER FUNCTION
const getMainImage = (imgUrls: any, varietyData: any = null): string => {
  console.log('🖼️ Getting main image:', { imgUrls, varietyData })

  // First priority: Use the image property directly from the item
  if (imgUrls && typeof imgUrls === 'string' && imgUrls !== '/placeholder.png') {
    console.log('📷 Using direct image URL:', imgUrls)
    return imgUrls
  }

  // Second priority: Use variety image if available and valid
  if (varietyData?.images && Array.isArray(varietyData.images) && varietyData.images.length > 0) {
    const varietyImg = varietyData.images[0]
    console.log('📦 Variety image found:', varietyImg)
    if (varietyImg && varietyImg !== '/placeholder.png' && varietyImg.trim() !== '') {
      return varietyImg
    }
  }

  // Third priority: Use product main image URLs
  if (imgUrls) {
    let imageArray = imgUrls
    
    // If it's a string, try to parse it as JSON
    if (typeof imgUrls === 'string') {
      try {
        const parsed = JSON.parse(imgUrls)
        if (Array.isArray(parsed)) {
          imageArray = parsed
        } else if (typeof parsed === 'string') {
          return parsed
        }
      } catch {
        // If parsing fails, use the string as is
        if (imgUrls !== '/placeholder.png') {
          return imgUrls
        }
      }
    }
    
    // If it's an array, get the first valid image
    if (Array.isArray(imageArray) && imageArray.length > 0) {
      const validImage = imageArray.find(img => 
        img && 
        img !== '/placeholder.png' && 
        img.trim() !== '' &&
        (img.startsWith('http') || img.startsWith('/') || img.startsWith('data:'))
      )
      if (validImage) {
        console.log('🏞️ Using array image:', validImage)
        return validImage
      }
    }
  }

  // Fallback to placeholder
  console.log('⚠️ No valid image found, using placeholder')
  return '/placeholder.png'
}

// 🖼️ HANDLE IMAGE LOADING ERRORS
const handleImageError = (event: Event) => {
  const img = event.target as HTMLImageElement
  console.warn('🖼️ Image failed to load:', img.src)
  img.src = '/placeholder.png'
  img.onerror = null // Prevent infinite loop
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
  console.log('🛒 Starting checkout process...')

  // Validate all fields
  if (!validateAllFields()) {
    const errorList = validationErrors.value
      .map((error, index) => `${index + 1}. ${error}`)
      .join('\n')
    alert(`Please complete the following:\n\n${errorList}`)
    return
  }

  console.log('✅ All validations passed')

  // Check if user is logged in
  if (!buyer.value) {
    alert('Please log in to continue')
    return
  }

  // Check if address is selected
  if (!address.value) {
    alert('Please select a delivery address')
    return
  }

  // Check if there are items
  if (!items.value.length) {
    alert('No items to checkout')
    return
  }

  // Validate delivery schedule
  if (!isWithinShopHours(deliveryDate.value, deliveryTime.value)) {
    alert(scheduleError.value || 'Please select a valid delivery schedule')
    return
  }

  try {
    isProcessing.value = true
    console.log('🔄 Processing order...')

    // Get shop ID from the first item
    const shopId = items.value[0]?.shop_id || items.value[0]?.product?.shop_id

    if (!shopId) {
      alert('Shop information not found for items')
      isProcessing.value = false
      return
    }

    console.log('🏪 Creating order for shop:', shopId)

    // 1. Create the order in database
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
      console.error('❌ Order creation error:', orderError)
      alert('Failed to create order. Please try again.')
      isProcessing.value = false
      return
    }

    console.log('✅ Order created:', order)

    // 2. Create order items
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
    if (itemsError) {
      console.error('❌ Order items creation error:', itemsError)
      throw itemsError
    }

    console.log('✅ Order items created')

    // 3. Create payment record
    const { error: paymentError } = await supabase.from('payments').insert({
      order_id: order.id,
      amount: totalPrice.value,
      status: 'pending',
      method: paymentMethod.value,
    })

    if (paymentError) {
      console.error('❌ Payment record creation error:', paymentError)
      throw paymentError
    }

    console.log('✅ Payment record created')

    // 4. Send message to seller
    try {
      await sendOrderMessageToSeller(order.id, shopId, items.value)
    } catch (msgError) {
      console.warn('⚠️ Could not send message to seller:', msgError)
      // Don't fail the order if message fails
    }

    // 5. Clean up cart if coming from cart
    if (fromCart.value && cartItemIds.value.length > 0) {
      try {
        const { error: cartError } = await supabase
          .from('cart_items')
          .delete()
          .in('id', cartItemIds.value)

        if (cartError) {
          console.warn('⚠️ Cart cleanup warning:', cartError)
        } else {
          console.log('✅ Cart cleaned up')
        }
      } catch (cartError) {
        console.warn('⚠️ Cart cleanup error:', cartError)
      }
    }

    console.log('🎯 Navigating to success page...')

    // 6. Navigate to success page
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
  } finally {
    isProcessing.value = false
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
    <v-main class="main-app">
      <!-- Validation Banner -->
      <v-alert
        v-if="validationErrors.length > 0"
        type="warning"
        class="validation-banner mx-3 mt-3"
        density="compact"
        elevation="2"
        border="start"
        border-color="warning"
      >
        <div class="d-flex align-center">
          <v-icon size="20" class="mr-2">mdi-alert-circle-outline</v-icon>
          <div class="flex-grow-1">
            <strong class="text-subtitle-2">Complete required fields:</strong>
            <div class="d-flex flex-wrap gap-1 mt-1">
              <v-chip
                v-for="error in validationErrors"
                :key="error"
                size="x-small"
                color="warning"
                variant="flat"
                class="mr-1 mb-1"
              >
                {{ error }}
              </v-chip>
            </div>
          </div>
          <v-btn
            icon
            size="x-small"
            @click="validationErrors = []"
            class="ml-2"
          >
            <v-icon>mdi-close</v-icon>
          </v-btn>
        </div>
      </v-alert>

      <!-- App Bar -->
      <v-app-bar class="app-bar" color="#438fda" flat>
        <v-btn icon @click="router.back()" variant="text" color="white">
          <v-icon>mdi-arrow-left</v-icon>
        </v-btn>
        <v-toolbar-title class="app-bar-title text-white">
          <strong>Checkout</strong>
        </v-toolbar-title>
        <v-spacer></v-spacer>
      
      </v-app-bar>

      <v-container fluid class="px-3 py-4 main-container">
        <!-- Updated Summary Card with Transaction Number -->
        <v-card class="mb-4 summary-card" elevation="2" rounded="lg">
          <v-card-text class="pa-4">
            <div class="d-flex justify-space-between align-center mb-3">
              <div>
                <div class="text-subtitle-2 text-white">Order Summary</div>
                <div class="text-h5 font-weight-bold text-white">
                  ₱{{ totalPrice.toLocaleString() }}
                </div>
              </div>
              <v-chip color="white" variant="flat" class="text-primary">
                {{ items.length }} item{{ items.length !== 1 ? 's' : '' }}
              </v-chip>
            </div>
            
            <!-- Transaction Number Section -->
            <div class="transaction-section mb-4">
              <div class="d-flex align-center justify-space-between mb-2">
                <div class="text-subtitle-2 text-white">Transaction Number</div>
                <v-tooltip location="top">
                  <template #activator="{ props }">
                    <v-btn
                      v-bind="props"
                      size="x-small"
                      :color="showCopySuccess ? 'success' : 'white'"
                      variant="flat"
                      @click="copyToClipboard"
                      class="copy-btn"
                      :disabled="!transactionNumber"
                    >
                      <v-icon size="small" class="mr-1">
                        {{ showCopySuccess ? 'mdi-check' : 'mdi-content-copy' }}
                      </v-icon>
                      {{ copyButtonText }}
                    </v-btn>
                  </template>
                  <span>{{ showCopySuccess ? 'Copied!' : 'Copy to clipboard' }}</span>
                </v-tooltip>
              </div>
              
              <div class="transaction-number-display pa-3 rounded-lg" @click="copyToClipboard">
                <div class="d-flex align-center justify-center">
                  <v-icon color="primary" size="small" class="mr-2">mdi-receipt-text</v-icon>
                  <div class="text-h6 font-weight-bold text-primary text-center mono-font">
                    {{ formattedTransactionNumber }}
                  </div>
                </div>
                
                <!-- Success Message -->
                <v-slide-y-transition>
                  <div v-if="showCopySuccess" class="copy-success-message mt-2">
                    <v-alert
                      type="success"
                      density="compact"
                      variant="tonal"
                      class="mb-0 text-center"
                    >
                      <v-icon size="small" class="mr-1">mdi-check-circle</v-icon>
                      Transaction number copied to clipboard
                    </v-alert>
                  </div>
                </v-slide-y-transition>
              </div>
            </div>
            
            <!-- Progress Steps -->
            <div class="progress-steps">
              <div class="d-flex justify-space-between align-center">
                <div class="step active">
                  <v-icon color="white" size="small" class="step-icon">mdi-cart</v-icon>
                  <div class="step-label text-caption text-white">Cart</div>
                </div>
                <v-divider class="step-divider" :color="buyer ? 'white' : 'rgba(255,255,255,0.3)'"></v-divider>
                <div class="step" :class="{ active: buyer }">
                  <v-icon :color="buyer ? 'white' : 'rgba(255,255,255,0.3)'" size="small" class="step-icon">
                    mdi-account
                  </v-icon>
                  <div class="step-label text-caption" :class="{ 'text-white': buyer, 'text-white-50': !buyer }">
                    Details
                  </div>
                </div>
                <v-divider class="step-divider" :color="address ? 'white' : 'rgba(255,255,255,0.3)'"></v-divider>
                <div class="step" :class="{ active: address }">
                  <v-icon :color="address ? 'white' : 'rgba(255,255,255,0.3)'" size="small" class="step-icon">
                    mdi-map-marker
                  </v-icon>
                  <div class="step-label text-caption" :class="{ 'text-white': address, 'text-white-50': !address }">
                    Address
                  </div>
                </div>
                <v-divider class="step-divider" :color="deliveryTime ? 'white' : 'rgba(255,255,255,0.3)'"></v-divider>
                <div class="step" :class="{ active: deliveryTime }">
                  <v-icon :color="deliveryTime ? 'white' : 'rgba(255,255,255,0.3)'" size="small" class="step-icon">
                    mdi-clock
                  </v-icon>
                  <div class="step-label text-caption" :class="{ 'text-white': deliveryTime, 'text-white-50': !deliveryTime }">
                    Schedule
                  </div>
                </div>
              </div>
            </div>
          </v-card-text>
        </v-card>

        <!-- Delivery Details Card -->
        <v-card class="mb-4 delivery-card" elevation="1" rounded="lg">
          <v-card-title class="card-title">
            <v-icon color="primary" class="mr-2" size="small">mdi-truck-fast</v-icon>
            Delivery Details
          </v-card-title>
          
          <v-card-text>
            <!-- Buyer Info Section -->
            <div class="info-section mb-4">
              <div class="d-flex align-center justify-space-between mb-2">
                <div class="text-subtitle-2 text-grey-darken-2">Buyer Information</div>
                <v-btn
                  size="x-small"
                  variant="text"
                  color="primary"
                  @click="showContactDialog = true"
                  class="edit-btn"
                >
                  <v-icon size="small">mdi-pencil</v-icon>
                </v-btn>
              </div>
              
              <v-list density="compact" class="info-list">
                <v-list-item class="px-0">
                  <template #prepend>
                    <v-icon size="small" color="grey-darken-1">mdi-account</v-icon>
                  </template>
                  <v-list-item-title class="text-body-2">
                    {{ buyer?.first_name || 'Loading...' }} {{ buyer?.last_name }}
                  </v-list-item-title>
                </v-list-item>
                
                <v-list-item class="px-0">
                  <template #prepend>
                    <v-icon size="small" color="grey-darken-1">mdi-phone</v-icon>
                  </template>
                  <v-list-item-title 
                    class="text-body-2"
                    :class="{ 'text-warning': !contactPhone }"
                  >
                    {{ contactPhone || 'Contact number required' }}
                  </v-list-item-title>
                </v-list-item>
              </v-list>
            </div>

            <!-- Address Section -->
            <div class="info-section mb-4">
              <div class="d-flex align-center justify-space-between mb-2">
                <div class="text-subtitle-2 text-grey-darken-2">Delivery Address</div>
                <v-btn
                  size="x-small"
                  variant="text"
                  color="primary"
                  @click="showAddressDialog = true"
                  class="edit-btn"
                >
                  <v-icon size="small">mdi-pencil</v-icon>
                </v-btn>
              </div>
              
              <div 
                class="address-box pa-3 rounded-lg"
                :class="{ 'border-warning': !address }"
                @click="showAddressDialog = true"
              >
                <div class="d-flex align-start">
                  <v-icon 
                    size="small" 
                    :color="address ? 'success' : 'warning'"
                    class="mr-2 mt-1"
                  >
                    {{ address ? 'mdi-map-marker-check' : 'mdi-map-marker-alert' }}
                  </v-icon>
                  <div class="flex-grow-1">
                    <div class="text-body-2 font-weight-medium">
                      {{ address ? formatAddress(address) : 'Select delivery address' }}
                    </div>
                    <div v-if="address?.phone" class="text-caption text-grey mt-1">
                      <v-icon size="x-small" class="mr-1">mdi-phone</v-icon>
                      {{ address.phone }}
                    </div>
                  </div>
                  <v-icon size="small" color="grey">mdi-chevron-right</v-icon>
                </div>
              </div>
            </div>

            <!-- Schedule Section -->
            <div class="info-section">
              <div class="d-flex align-center justify-space-between mb-2">
                <div class="text-subtitle-2 text-grey-darken-2">Delivery Schedule</div>
                <v-btn
                  size="x-small"
                  variant="text"
                  color="primary"
                  @click="showDateTimePicker = true"
                  class="edit-btn"
                >
                  <v-icon size="small">mdi-pencil</v-icon>
                </v-btn>
              </div>
              
              <div 
                class="schedule-box pa-3 rounded-lg"
                :class="{ 'border-warning': !deliveryTime }"
                @click="showDateTimePicker = true"
              >
                <div class="d-flex align-center">
                  <v-icon 
                    size="small" 
                    :color="deliveryTime ? 'success' : 'warning'"
                    class="mr-2"
                  >
                    {{ deliveryTime ? 'mdi-clock-check' : 'mdi-clock-alert' }}
                  </v-icon>
                  <div class="flex-grow-1">
                    <div class="text-body-2 font-weight-medium">
                      {{ deliveryTime ? `${formattedDate} at ${convertTo12Hour(deliveryTime)}` : 'Select delivery time' }}
                    </div>
                    <div v-if="scheduleError" class="text-caption text-error mt-1">
                      <v-icon size="x-small" class="mr-1">mdi-alert</v-icon>
                      {{ scheduleError }}
                    </div>
                  </div>
                  <v-icon size="small" color="grey">mdi-chevron-right</v-icon>
                </div>
              </div>
            </div>
          </v-card-text>
        </v-card>

        <!-- Items List Card -->
        <v-card class="mb-4 items-card" elevation="1" rounded="lg">
          <v-card-title class="card-title">
            <v-icon color="primary" class="mr-2" size="small">mdi-package-variant</v-icon>
            Order Items ({{ items.length }})
          </v-card-title>
          
          <v-list class="items-list">
            <v-list-item
              v-for="(item, index) in items"
              :key="item.id"
              class="item-row"
              :class="{ 'border-bottom': index < items.length - 1 }"
            >
              <template #prepend>
                <v-avatar rounded size="56" class="item-image">
                  <v-img
                    :src="item.image || getMainImage(item.product?.main_img_urls, item.varietyData)"
                    :alt="item.name"
                    cover
                    @error="handleImageError"
                  >
                    <template #placeholder>
                      <div class="d-flex align-center justify-center fill-height">
                        <v-icon color="grey-lighten-1">mdi-package</v-icon>
                      </div>
                    </template>
                  </v-img>
                </v-avatar>
              </template>

              <v-list-item-title class="item-name">
                <div class="d-flex align-center mb-1">
                  <span class="text-body-1 font-weight-medium">{{ item.name }}</span>
                  <v-chip
                    v-if="item.selectedVariety"
                    size="x-small"
                    color="primary"
                    variant="outlined"
                    class="ml-2"
                  >
                    {{ item.selectedVariety }}
                  </v-chip>
                </div>
                
                <div class="d-flex align-center flex-wrap gap-1 mb-1">
                  <div class="text-body-2 text-primary font-weight-bold">
                    ₱{{ (item.price * item.quantity).toLocaleString() }}
                  </div>
                  <div class="text-caption text-grey">
                    (₱{{ item.price.toLocaleString() }} × {{ item.quantity }})
                  </div>
                </div>
                
                <div v-if="item.selectedSize" class="text-caption text-grey">
                  <v-icon size="x-small" class="mr-1">mdi-ruler</v-icon>
                  Size: {{ item.selectedSize }}
                </div>
              </v-list-item-title>

              <template #append>
                <div class="quantity-control">
                  <v-btn
                    size="x-small"
                    icon
                    variant="text"
                    color="error"
                    @click="decreaseQty(item)"
                    :disabled="item.quantity <= 1"
                    class="qty-btn"
                  >
                    <v-icon>mdi-minus</v-icon>
                  </v-btn>
                  
                  <div class="quantity-value">
                    {{ item.quantity }}
                  </div>
                  
                  <v-btn
                    size="x-small"
                    icon
                    variant="text"
                    color="primary"
                    @click="increaseQty(item)"
                    class="qty-btn"
                  >
                    <v-icon>mdi-plus</v-icon>
                  </v-btn>
                </div>
              </template>
            </v-list-item>
          </v-list>
          
          <v-divider></v-divider>
          
          <v-card-text class="total-section">
            <div class="d-flex justify-space-between align-center">
              <div class="text-subtitle-1 font-weight-medium">Total Amount</div>
              <div class="text-h5 font-weight-bold text-primary">
                ₱{{ totalPrice.toLocaleString() }}
              </div>
            </div>
          </v-card-text>
        </v-card>

        <!-- Options Cards -->
        <div class="options-grid">
          <!-- Delivery Option -->
          <v-card class="option-card" elevation="1" rounded="lg">
            <v-card-text class="pa-3">
              <div class="d-flex align-center mb-2">
                <v-icon color="primary" size="small" class="mr-2">mdi-map-marker-path</v-icon>
                <div class="text-subtitle-2 font-weight-medium">Delivery Method</div>
              </div>
              <v-select
                v-model="deliveryOption"
                :items="deliveryOptionsDisplay"
                item-title="label"
                item-value="value"
                density="compact"
                variant="outlined"
                hide-details
                class="option-select"
              ></v-select>
            </v-card-text>
          </v-card>

          <!-- Payment Method -->
          <v-card class="option-card" elevation="1" rounded="lg">
            <v-card-text class="pa-3">
              <div class="d-flex align-center mb-2">
                <v-icon color="primary" size="small" class="mr-2">mdi-credit-card-outline</v-icon>
                <div class="text-subtitle-2 font-weight-medium">Payment</div>
              </div>
              <v-radio-group v-model="paymentMethod" hide-details class="option-radio">
                <v-radio
                  label="Cash on Delivery"
                  value="cash"
                  color="primary"
                  density="compact"
                >
                  <template #label>
                    <div class="d-flex align-center">
                      <v-icon size="small" class="mr-1">mdi-cash</v-icon>
                      Cash on Delivery
                    </div>
                  </template>
                </v-radio>
              </v-radio-group>
            </v-card-text>
          </v-card>
        </div>

        <!-- Note to Seller -->
        <v-card class="mb-4 note-card" elevation="1" rounded="lg">
          <v-card-title class="card-title">
            <v-icon color="primary" class="mr-2" size="small">mdi-message-text-outline</v-icon>
            Note to Seller
          </v-card-title>
          <v-card-text>
            <v-textarea
              v-model="note"
              label="Add special instructions or requests..."
              rows="2"
              auto-grow
              variant="outlined"
              density="compact"
              hide-details
              class="note-field"
            ></v-textarea>
          </v-card-text>
        </v-card>
      </v-container>

      <!-- Bottom Action Bar -->
      <div class="bottom-action-bar">
        <v-container class="px-3">
          <div class="d-flex align-center justify-space-between">
            <div class="order-summary">
              <div class="text-caption text-grey">Total Amount</div>
              <div class="text-h5 font-weight-bold text-white">
                ₱{{ totalPrice.toLocaleString() }}
              </div>
            </div>
            <v-btn
              color="white"
              size="large"
              @click="handleCheckout"
              :disabled="!items.length || !buyer || !address || isProcessing"
              :loading="isProcessing"
              class="checkout-btn"
              rounded="lg"
              elevation="2"
            >
              <template #prepend>
                <v-icon>mdi-lock-check</v-icon>
              </template>
              {{ isProcessing ? 'Processing...' : 'Complete Order' }}
            </v-btn>
          </div>
        </v-container>
      </div>

      <!-- Toast Notification for Copy Success -->
      <v-snackbar
        v-model="showCopySuccess"
        :timeout="2000"
        color="success"
        location="top"
        class="copy-toast"
      >
        <div class="d-flex align-center">
          <v-icon class="mr-2">mdi-check-circle</v-icon>
          <span>Transaction number copied to clipboard!</span>
        </div>
      </v-snackbar>

      <!-- Address Selection Dialog -->
      <v-dialog v-model="showAddressDialog" max-width="500" scrollable>
        <v-card class="modern-dialog" rounded="lg">
          <v-card-title class="dialog-header">
            <div class="d-flex align-center">
              <v-icon color="primary" class="mr-2">mdi-map-marker</v-icon>
              <div>Select Delivery Address</div>
            </div>
          </v-card-title>
          
          <v-card-text class="dialog-content">
            <!-- Empty State -->
            <div v-if="addresses.length === 0" class="empty-state text-center py-8">
              <v-icon size="64" color="grey-lighten-2" class="mb-3">mdi-home-outline</v-icon>
              <h3 class="text-h6 mb-2">No Addresses</h3>
              <p class="text-body-2 text-grey mb-4">
                Add a delivery address to continue with your order
              </p>
              <v-btn color="primary" @click="addNewAddress" prepend-icon="mdi-plus">
                Add New Address
              </v-btn>
            </div>

            <!-- Address List -->
            <div v-else>
              <div class="address-list">
                <v-list class="px-0">
                  <v-list-item
                    v-for="addr in addresses"
                    :key="addr.id"
                    class="address-item mb-2"
                    :class="{ 'address-item-selected': address?.id === addr.id }"
                    @click="selectAddress(addr)"
                    rounded="lg"
                  >
                    <template #prepend>
                      <v-avatar
                        :color="address?.id === addr.id ? 'primary' : 'grey-lighten-3'"
                        size="40"
                        class="address-icon"
                      >
                        <v-icon :color="address?.id === addr.id ? 'white' : 'grey'">
                          mdi-home
                        </v-icon>
                      </v-avatar>
                    </template>

                    <v-list-item-title class="mb-1">
                      <div class="d-flex align-center">
                        <span class="font-weight-medium">{{ addr.recipient_name || 'No name' }}</span>
                        <v-chip
                          v-if="addr.is_default"
                          size="x-small"
                          color="primary"
                          class="ml-2"
                          density="compact"
                        >
                          Default
                        </v-chip>
                      </div>
                    </v-list-item-title>
                    
                    <v-list-item-subtitle>
                      <div class="text-body-2 mb-1">{{ formatAddress(addr) }}</div>
                      <div v-if="addr.phone" class="text-caption text-grey">
                        <v-icon size="x-small" class="mr-1">mdi-phone</v-icon>
                        {{ addr.phone }}
                      </div>
                    </v-list-item-subtitle>

                    <template #append>
                      <v-icon
                        v-if="address?.id === addr.id"
                        color="primary"
                        size="small"
                      >
                        mdi-check-circle
                      </v-icon>
                    </template>
                  </v-list-item>
                </v-list>
              </div>

              <v-divider class="my-4"></v-divider>
              
              <v-btn
                color="primary"
                variant="outlined"
                block
                @click="addNewAddress"
                prepend-icon="mdi-plus"
              >
                Add New Address
              </v-btn>
            </div>
          </v-card-text>
          
          <v-card-actions class="dialog-actions">
            <v-btn
              variant="text"
              @click="showAddressDialog = false"
              class="flex-grow-1"
            >
              Cancel
            </v-btn>
            <v-btn
              color="primary"
              variant="flat"
              @click="showAddressDialog = false"
              class="flex-grow-1"
              :disabled="!address"
            >
              Confirm
            </v-btn>
          </v-card-actions>
        </v-card>
      </v-dialog>

      <!-- DateTime Picker Dialog -->
      <v-dialog v-model="showDateTimePicker" max-width="420" class="datetime-dialog">
        <v-card class="modern-dialog" rounded="lg">
          <v-card-title class="dialog-header">
            <div class="d-flex align-center">
              <v-icon color="primary" class="mr-2">mdi-clock-outline</v-icon>
              <div>Select Delivery Schedule</div>
            </div>
            <v-chip color="info" size="small" density="compact" class="ml-2">
              Butuan City
            </v-chip>
          </v-card-title>
          
          <v-card-text class="dialog-content">
            <!-- Date Picker -->
            <div class="date-section mb-4">
              <div class="text-subtitle-2 font-weight-medium mb-2">Select Date</div>
              <v-date-picker
                v-model="deliveryDate"
                color="primary"
                elevation="0"
                :min="minDate"
                :max="maxDate"
                class="date-picker"
                @update:model-value="handleDateChange"
              ></v-date-picker>
            </div>

            <v-divider class="my-4"></v-divider>

            <!-- Time Picker -->
            <div class="time-section">
              <div class="text-subtitle-2 font-weight-medium mb-3">Select Time</div>
              
              <div class="time-picker">
                <div class="time-wheel-container">
                  <div class="time-wheel">
                    <div class="wheel-label">Hour</div>
                    <v-virtual-scroll :items="hours12" height="160" item-height="48">
                      <template #default="{ item }">
                        <div
                          class="time-option"
                          :class="{ 'time-option-active': item === selectedHour }"
                          @click="selectHour(item)"
                        >
                          {{ item }}
                        </div>
                      </template>
                    </v-virtual-scroll>
                  </div>
                  
                  <div class="time-separator">
                    <v-icon>mdi-clock</v-icon>
                  </div>
                  
                  <div class="time-wheel">
                    <div class="wheel-label">Minute</div>
                    <v-virtual-scroll :items="minutes" height="160" item-height="48">
                      <template #default="{ item }">
                        <div
                          class="time-option"
                          :class="{ 'time-option-active': item === selectedMinute }"
                          @click="selectMinute(item)"
                        >
                          {{ item }}
                        </div>
                      </template>
                    </v-virtual-scroll>
                  </div>
                </div>

                <!-- AM/PM Toggle -->
                <div class="period-toggle mt-4">
                  <v-btn-toggle
                    v-model="selectedPeriod"
                    color="primary"
                    rounded="pill"
                    mandatory
                    class="period-buttons"
                  >
                    <v-btn value="AM" class="period-btn" rounded="pill">
                      AM
                    </v-btn>
                    <v-btn value="PM" class="period-btn" rounded="pill">
                      PM
                    </v-btn>
                  </v-btn-toggle>
                </div>

                <!-- Selected Schedule Display -->
                <div class="selected-schedule mt-6 pa-3 rounded-lg bg-grey-lighten-4">
                  <div class="text-caption text-grey mb-1">Selected Schedule</div>
                  <div class="d-flex align-center">
                    <v-icon color="primary" size="small" class="mr-2">mdi-calendar-check</v-icon>
                    <div>
                      <div class="text-body-1 font-weight-bold">
                        {{ selectedHour || '--' }}:{{ selectedMinute || '--' }} {{ selectedPeriod }}
                      </div>
                      <div class="text-caption text-grey">{{ formattedDate }}</div>
                    </div>
                  </div>
                  
                  <!-- Validation Feedback -->
                  <div v-if="deliveryDate && deliveryTime" class="mt-3">
                    <v-alert
                      v-if="scheduleError"
                      type="error"
                      density="compact"
                      variant="tonal"
                      class="mb-0"
                    >
                      <v-icon size="small" class="mr-1">mdi-alert</v-icon>
                      {{ scheduleError }}
                    </v-alert>
                    <v-alert
                      v-else
                      type="success"
                      density="compact"
                      variant="tonal"
                      class="mb-0"
                    >
                      <v-icon size="small" class="mr-1">mdi-check-circle</v-icon>
                      Time slot available
                    </v-alert>
                  </div>
                </div>
              </div>
            </div>
          </v-card-text>
          
          <v-card-actions class="dialog-actions">
            <v-btn
              variant="text"
              @click="showDateTimePicker = false"
              class="flex-grow-1"
            >
              Cancel
            </v-btn>
            <v-btn
              color="primary"
              variant="flat"
              @click="confirmDateTime"
              class="flex-grow-1"
              :disabled="!!scheduleError || !deliveryDate || !deliveryTime"
            >
              Confirm Schedule
            </v-btn>
          </v-card-actions>
        </v-card>
      </v-dialog>

      <!-- Contact Dialog -->
      <v-dialog v-model="showContactDialog" max-width="500">
        <v-card class="modern-dialog" rounded="lg">
          <v-card-title class="dialog-header">
            <div class="d-flex align-center">
              <v-icon color="primary" class="mr-2">mdi-phone</v-icon>
              <div>Contact Information</div>
            </div>
          </v-card-title>
          
          <v-card-text class="dialog-content">
            <div class="contact-form">
              <v-alert
                :type="contactPhone ? 'info' : 'warning'"
                density="compact"
                variant="tonal"
                class="mb-4"
              >
                Phone number is required for delivery coordination
              </v-alert>

              <v-text-field
                v-model="contactPhone"
                label="Phone Number *"
                placeholder="09123456789 or +639123456789"
                variant="outlined"
                type="tel"
                :rules="[
                  (v) => !!v || 'Phone number is required',
                  (v) =>
                    /^(09|\+639)\d{9}$/.test(v.replace(/\s+/g, '')) ||
                    'Valid format: 09123456789 or +639123456789',
                ]"
                class="mb-3"
                hide-details="auto"
              ></v-text-field>

              <div class="text-caption text-grey">
                We'll use this number to contact you about your delivery
              </div>
            </div>
          </v-card-text>
          
          <v-card-actions class="dialog-actions">
            <v-btn
              variant="text"
              @click="showContactDialog = false"
              class="flex-grow-1"
            >
              Cancel
            </v-btn>
            <v-btn
              color="primary"
              variant="flat"
              @click="updateContactInfo"
              class="flex-grow-1"
              :disabled="!contactPhone"
            >
              Save
            </v-btn>
          </v-card-actions>
        </v-card>
      </v-dialog>
    </v-main>
  </v-app>
</template>
<style scoped>
/* Main Layout */
.main-app {
  background: linear-gradient(180deg, #f8fafc 0%, #ffffff 100%);
}

.main-container {
  max-width: 800px;
  margin: 0 auto;
  padding-bottom: 100px !important;
}

/* App Bar */
.app-bar {
  box-shadow: 0 2px 12px rgba(67, 143, 218, 0.15);
}

.app-bar-title {
  font-size: 1.1rem;
  letter-spacing: 0.5px;
}

/* Cards */
.summary-card {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
}

.summary-card .text-primary {
  color: white !important;
}

.delivery-card,
.items-card,
.option-card,
.note-card {
  border: 1px solid #e5e7eb;
  transition: all 0.3s ease;
}

.delivery-card:hover,
.items-card:hover,
.option-card:hover,
.note-card:hover {
  border-color: #438fda;
  box-shadow: 0 4px 12px rgba(67, 143, 218, 0.1);
}

.card-title {
  font-size: 1rem;
  font-weight: 600;
  padding: 16px 20px 8px;
  display: flex;
  align-items: center;
}

/* Progress Steps */
.progress-steps {
  padding: 8px 0;
}

.step {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.step-icon {
  background: #f1f5f9;
  border-radius: 50%;
  padding: 8px;
  transition: all 0.3s ease;
}

.step.active .step-icon {
  background: #438fda;
  color: white;
}

.step-divider {
  flex: 1;
  margin: 0 8px;
  height: 2px;
}

.step-label {
  font-weight: 500;
  transition: all 0.3s ease;
}

.step.active .step-label {
  color: #438fda;
  font-weight: 600;
}

/* Info Sections */
.info-section {
  position: relative;
}

.info-list {
  background: #f8fafc;
  border-radius: 8px;
  padding: 8px 0;
}

.address-box,
.schedule-box {
  background: #f8fafc;
  border: 2px solid #e5e7eb;
  cursor: pointer;
  transition: all 0.3s ease;
}

.address-box:hover,
.schedule-box:hover {
  border-color: #438fda;
  background: #f0f7ff;
}

.border-warning {
  border-color: #f59e0b !important;
  background: #fffbeb !important;
}

/* Items List */
.items-list {
  padding: 0;
}

.item-row {
  padding: 16px 20px;
  transition: background-color 0.2s ease;
}

.item-row:hover {
  background-color: #f8fafc;
}

.item-image {
  border: 2px solid #e5e7eb;
}

.item-name {
  padding-right: 16px;
}

.quantity-control {
  display: flex;
  align-items: center;
  gap: 8px;
  background: #f8fafc;
  border-radius: 24px;
  padding: 4px;
}

.qty-btn {
  width: 28px;
  height: 28px;
  min-width: 28px;
}

.quantity-value {
  min-width: 24px;
  text-align: center;
  font-weight: 600;
  font-size: 0.95rem;
}

.total-section {
  background: linear-gradient(to right, #f8fafc, #ffffff);
  border-radius: 0 0 12px 12px;
}

/* Options Grid */
.options-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 16px;
  margin-bottom: 16px;
}

.option-card {
  height: 100%;
}

.option-select,
.option-radio {
  margin-top: 8px;
}

/* Note Card */
.note-field :deep(.v-field) {
  background: #f8fafc;
}

/* Bottom Action Bar */
.bottom-action-bar {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  background: linear-gradient(135deg, #438fda 0%, #3b82f6 100%);
  padding: 12px 0;
  box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.15);
  z-index: 1000;
}

.order-summary {
  color: white;
}

.checkout-btn {
  font-weight: 600;
  letter-spacing: 0.5px;
  text-transform: none;
  min-width: 160px;
}

.checkout-btn:not(:disabled) {
  background: white;
  color: #438fda;
}

.checkout-btn:disabled {
  opacity: 0.5;
}

/* Dialogs */
.modern-dialog {
  overflow: hidden;
}

.dialog-header {
  background: #f8fafc;
  padding: 20px 24px;
  font-weight: 600;
  border-bottom: 1px solid #e5e7eb;
}

.dialog-content {
  padding: 24px;
  max-height: 70vh;
  overflow-y: auto;
}

.dialog-actions {
  padding: 16px 24px;
  border-top: 1px solid #e5e7eb;
  gap: 12px;
}

.empty-state {
  padding: 40px 20px;
}

/* Address Items */
.address-item {
  border: 2px solid #e5e7eb;
  transition: all 0.3s ease;
  cursor: pointer;
}

.address-item:hover {
  border-color: #438fda;
  background: #f0f7ff;
}

.address-item-selected {
  border-color: #438fda;
  background: #f0f7ff;
}

.address-icon {
  transition: all 0.3s ease;
}

/* Date Time Picker */
.date-picker {
  width: 100%;
}

.time-picker {
  text-align: center;
}

.time-wheel-container {
  display: flex;
  justify-content: center;
  align-items: flex-start;
  gap: 16px;
  margin-bottom: 16px;
}

.time-wheel {
  width: 80px;
  background: #f8fafc;
  border-radius: 16px;
  border: 2px solid #e5e7eb;
  overflow: hidden;
  padding: 12px 0;
}

.wheel-label {
  font-size: 0.75rem;
  font-weight: 600;
  color: #6b7280;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 8px;
}

.time-option {
  height: 48px;
  line-height: 48px;
  cursor: pointer;
  font-weight: 500;
  color: #4b5563;
  transition: all 0.2s ease;
  margin: 0 8px;
  border-radius: 12px;
}

.time-option:hover {
  background: #e5e7eb;
  color: #1f2937;
}

.time-option-active {
  background: #438fda;
  color: white;
  font-weight: 600;
  transform: scale(1.05);
}

.time-separator {
  padding-top: 48px;
  color: #9ca3af;
}

.period-buttons {
  background: #f8fafc;
  border: 2px solid #e5e7eb;
  padding: 2px;
}

.period-btn {
  min-width: 64px;
  font-weight: 600;
  letter-spacing: 0.5px;
}

.selected-schedule {
  border: 2px solid #e5e7eb;
}

/* Validation */
.validation-banner {
  border-radius: 8px;
  animation: slideDown 0.3s ease;
}

@keyframes slideDown {
  from {
    transform: translateY(-100%);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}

.text-error {
  color: #dc2626 !important;
}

/* Responsive Design */
@media (max-width: 600px) {
  .main-container {
    padding-left: 12px !important;
    padding-right: 12px !important;
  }
  
  .options-grid {
    grid-template-columns: 1fr;
  }
  
  .time-wheel-container {
    gap: 12px;
  }
  
  .time-wheel {
    width: 70px;
  }
  
  .step-label {
    font-size: 0.7rem;
  }
  
  .checkout-btn {
    min-width: 140px;
    padding: 8px 16px;
  }
}

@media (max-width: 400px) {
  .card-title {
    font-size: 0.9rem;
    padding: 12px 16px 6px;
  }
  
  .item-row {
    padding: 12px 16px;
  }
  
  .item-image {
    width: 48px !important;
    height: 48px !important;
    min-width: 48px !important;
  }
  
  .quantity-control {
    gap: 4px;
  }
  
  .qty-btn {
    width: 24px;
    height: 24px;
    min-width: 24px;
  }
  
  .time-wheel {
    width: 60px;
  }
  
  .time-option {
    height: 40px;
    line-height: 40px;
  }
  
  .time-separator {
    padding-top: 40px;
  }
}

/* Animations */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

/* Utility Classes */
.border-bottom {
  border-bottom: 1px solid #e5e7eb;
}

.text-primary {
  color: #438fda !important;
}

/* Custom Scrollbar */
::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}

::-webkit-scrollbar-track {
  background: #f1f5f9;
  border-radius: 3px;
}

::-webkit-scrollbar-thumb {
  background: #cbd5e1;
  border-radius: 3px;
}

::-webkit-scrollbar-thumb:hover {
  background: #94a3b8;
}

/* Summary Card Enhancements */
.summary-card {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  position: relative;
  overflow: hidden;
}

.summary-card::before {
  content: '';
  position: absolute;
  top: -50%;
  right: -50%;
  width: 200%;
  height: 200%;
  background: radial-gradient(circle, rgba(255,255,255,0.1) 1px, transparent 1px);
  background-size: 20px 20px;
  opacity: 0.3;
  pointer-events: none;
}

.summary-card .text-primary {
  color: white !important;
}

/* Transaction Section */
.transaction-section {
  background: rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(10px);
  border-radius: 12px;
  padding: 12px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  margin-bottom: 16px;
}

.copy-btn {
  transition: all 0.3s ease;
  font-size: 0.75rem;
  letter-spacing: 0.5px;
  border-radius: 20px;
  padding: 4px 12px;
  height: auto;
  min-width: auto;
  text-transform: none;
}

.copy-btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.copy-btn:active {
  transform: scale(0.95);
}

.transaction-number-display {
  background: white;
  border: 2px solid #e5e7eb;
  transition: all 0.3s ease;
  cursor: pointer;
  position: relative;
  overflow: hidden;
}

.transaction-number-display:hover {
  border-color: #438fda;
  box-shadow: 0 4px 12px rgba(67, 143, 218, 0.15);
  transform: translateY(-1px);
}

.transaction-number-display:active {
  transform: scale(0.99);
}

.transaction-number-display .text-primary {
  color: #438fda !important;
  font-family: 'Courier New', 'Roboto Mono', monospace;
  letter-spacing: 1px;
  word-break: break-all;
}

.copy-success-message {
  animation: fadeIn 0.3s ease;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(-10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* Progress Steps in Summary Card */
.step-icon {
  background: rgba(255, 255, 255, 0.2);
  border-radius: 50%;
  padding: 8px;
  transition: all 0.3s ease;
}

.step.active .step-icon {
  background: white;
  color: #667eea;
}

.step-divider {
  flex: 1;
  margin: 0 4px;
  height: 2px;
}

.text-white-50 {
  color: rgba(255, 255, 255, 0.5) !important;
}

/* Toast Notification */
.copy-toast {
  margin-top: 60px;
}

/* Monospace font for transaction number */
.mono-font {
  font-family: 'Courier New', 'Roboto Mono', 'Consolas', monospace;
}

/* Transaction chip in app bar */
.transaction-chip {
  cursor: pointer;
  transition: all 0.3s ease;
}

.transaction-chip:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
}

/* Success animation for copy button */
.copy-btn.success-pulse {
  animation: pulse 0.5s ease;
}

@keyframes pulse {
  0% { transform: scale(1); }
  50% { transform: scale(1.05); }
  100% { transform: scale(1); }
}

/* Mobile Responsiveness for Transaction Section */
@media (max-width: 600px) {
  .transaction-number-display .text-h6 {
    font-size: 1rem;
  }
  
  .copy-btn {
    font-size: 0.7rem;
    padding: 3px 8px;
  }
  
  .transaction-section {
    padding: 8px;
  }
  
  .step-label {
    font-size: 0.65rem;
  }
  
  .copy-toast {
    margin-top: 56px;
  }
}

@media (max-width: 400px) {
  .transaction-number-display .text-h6 {
    font-size: 0.9rem;
    letter-spacing: 0.5px;
  }
  
  .step-label {
    font-size: 0.6rem;
  }
  
  .step-icon {
    padding: 6px;
  }
  
  .transaction-chip .v-chip__content {
    font-size: 0.7rem;
  }
}

/* Ensure text alignment */
.text-center {
  text-align: center;
}
</style>