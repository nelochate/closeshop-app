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
const deliveryOption = ref('meetup')
const paymentMethod = ref('cash')
const note = ref('')

// 📅 DATE & TIME STATE
const showDateTimePicker = ref(false)
const deliveryDate = ref('')
const deliveryTime = ref('')
const selectedHour = ref('')
const selectedMinute = ref('')
const selectedPeriod = ref<'AM' | 'PM'>('AM')

// 🏪 SHOP STATE
const shopSchedule = ref({
  openDays: [1, 2, 3, 4, 5, 6], // Monday to Saturday
  openHour: 9,
  closeHour: 19,
  meetupDetails: 'Main Entrance',
})

// 🎯 INITIALIZATION
onMounted(async () => {
  await initializePage()
})

// 🔄 INITIALIZE PAGE
const initializePage = async () => {
  console.log('🚀 Initializing purchase page...')

  // Generate transaction number first
  transactionNumber.value = generateTransactionNumber()

  // Load items
  await loadItems()

  // Load user data
  await loadUserData()

  // Initialize date/time
  initializeDateTime()

  console.log('✅ Page initialized:', {
    items: items.value,
    transactionNumber: transactionNumber.value,
    buyer: buyer.value,
    address: address.value,
  })
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
    }))
    fromCart.value = history.state.fromCart || false
    return
  }

  // Method 2: Product ID from route params (direct link)
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

    // Transform product to item format
    const mainImage = getMainImage(product.main_img_urls)

    items.value = [
      {
        id: product.id,
        product_id: product.id,
        name: product.prod_name,
        price: product.price,
        quantity: 1,
        size: null,
        variety: null,
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
      `,
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

      return {
        id: item.product_id,
        product_id: item.product_id,
        name: item.product?.prod_name || 'Unnamed Product',
        price: item.product?.price || 0,
        quantity: item.quantity || 1,
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
    const { data: addresses } = await supabase
      .from('addresses')
      .select('*')
      .eq('user_id', user.id)
      .order('is_default', { ascending: false })
      .order('updated_at', { ascending: false })

    if (addresses && addresses.length > 0) {
      // Use default address or most recent
      address.value = addresses.find((addr) => addr.is_default) || addresses[0]
    }

    console.log('✅ User data loaded:', { buyer: buyer.value, address: address.value })
  } catch (err) {
    console.error('❌ Error loading user data:', err)
  }
}

// 🕒 INITIALIZE DATE/TIME
const initializeDateTime = () => {
  const now = new Date()

  // Set date (YYYY-MM-DD)
  const year = now.getFullYear()
  const month = (now.getMonth() + 1).toString().padStart(2, '0')
  const day = now.getDate().toString().padStart(2, '0')
  deliveryDate.value = `${year}-${month}-${day}`

  // Set time (12-hour format)
  const hours = now.getHours()
  const minutes = now.getMinutes().toString().padStart(2, '0')

  const hour12 = hours % 12 || 12
  selectedHour.value = hour12.toString().padStart(2, '0')
  selectedMinute.value = minutes
  selectedPeriod.value = hours >= 12 ? 'PM' : 'AM'

  // Set 24-hour format for delivery
  deliveryTime.value = `${hours.toString().padStart(2, '0')}:${minutes}`
}

// 🎫 GENERATE TRANSACTION NUMBER
const generateTransactionNumber = () => {
  const timestamp = Date.now().toString(36)
  const random = Math.floor(Math.random() * 1e6)
    .toString(36)
    .padStart(5, '0')
  return `TX-${timestamp}-${random}`.toUpperCase()
}

// 🖼️ IMAGE HELPER
const getMainImage = (imgUrls: any): string => {
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

// 🕒 TIME PICKER FUNCTIONS
const hours12 = Array.from({ length: 12 }, (_, i) => (i + 1).toString().padStart(2, '0'))
const minutes = Array.from({ length: 60 }, (_, i) => i.toString().padStart(2, '0'))

const updateTime = () => {
  let hourNum = parseInt(selectedHour.value)
  if (selectedPeriod.value === 'PM' && hourNum < 12) hourNum += 12
  if (selectedPeriod.value === 'AM' && hourNum === 12) hourNum = 0
  deliveryTime.value = `${hourNum.toString().padStart(2, '0')}:${selectedMinute.value}`
}

const selectHour = (hour: string) => {
  selectedHour.value = hour
  updateTime()
}

const selectMinute = (minute: string) => {
  selectedMinute.value = minute
  updateTime()
}

watch(selectedPeriod, updateTime)

// 📅 DATE/TIME CONFIRMATION
const confirmDateTime = () => {
  updateTime()
  if (!isWithinShopHours(deliveryDate.value, deliveryTime.value)) {
    alert(scheduleError.value)
    return
  }
  showDateTimePicker.value = false
}

// 🏪 SHOP HOURS VALIDATION
const scheduleError = ref('')
const isWithinShopHours = (date: string, time: string) => {
  if (!date || !time) return false

  const selected = new Date(`${date}T${time}`)
  const day = selected.getDay()
  const hour = selected.getHours()

  if (!shopSchedule.value.openDays.includes(day)) {
    scheduleError.value = 'Shop is closed on that day.'
    return false
  }

  if (hour < shopSchedule.value.openHour || hour >= shopSchedule.value.closeHour) {
    scheduleError.value = `Please select between ${shopSchedule.value.openHour}:00 and ${shopSchedule.value.closeHour}:00.`
    return false
  }

  scheduleError.value = ''
  return true
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

// 📅 FORMATTED DATE DISPLAY
const formattedDate = computed(() => {
  if (!deliveryDate.value) return 'Not set'
  const date = new Date(deliveryDate.value)
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
})
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

  console.log('🛒 Starting checkout process...')
  console.log('Items:', items.value)

  try {
    // Since each user has only 1 shop, get the shop_id from the first item
    const shopId = items.value[0]?.shop_id
    
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
        shop_id: shopId, // ✅ SET THE SHOP ID
      })
      .select()
      .single()

    if (orderError) throw orderError

    console.log('✅ Order created with shop_id:', shopId)

    // Create order items
    const orderItems = items.value.map((item) => ({
      order_id: order.id,
      product_id: item.product_id,
      quantity: item.quantity,
      price: item.price,
      selected_size: item.size,
      selected_variety: item.variety,
    }))

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
// 💬 SEND ORDER MESSAGES TO ALL SELLERS (for cart checkout)
const sendOrderMessagesToSellers = async (orderId: string) => {
  try {
    console.log('💬 Sending order messages to all sellers...')

    // Group items by shop
    const itemsByShop = {}
    items.value.forEach((item) => {
      const shopId = item.shop_id
      if (!shopId) {
        console.warn('⚠️ Item missing shop_id:', item)
        return
      }

      if (!itemsByShop[shopId]) {
        itemsByShop[shopId] = []
      }
      itemsByShop[shopId].push(item)
    })

    console.log('🏪 Items grouped by shop:', itemsByShop)

    // Send message to each shop
    const promises = Object.keys(itemsByShop).map(async (shopId) => {
      const shopItems = itemsByShop[shopId]
      await sendOrderMessageToSeller(orderId, shopId, shopItems)
    })

    await Promise.all(promises)
    console.log('✅ All order messages sent successfully!')
  } catch (err) {
    console.error('❌ Error in sendOrderMessagesToSellers:', err)
    // Don't throw here to avoid blocking checkout
  }
}

// 💬 SEND ORDER MESSAGE TO SPECIFIC SELLER
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

    // Create order message for this shop's items
    const itemsSummary = shopItems
      .map(
        (item) => `${item.name} (x${item.quantity}) - ₱${(item.price * item.quantity).toFixed(2)}`,
      )
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
    throw err // Re-throw to handle in parent function
  }
}

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

    // Get user email from auth to use in profile
    const { data: userData } = await supabase.auth.admin.getUserById(userId)
    const userEmail = userData?.user?.email || ''

    const { data: newProfile, error: createError } = await supabase
      .from('profiles')
      .insert({
        id: userId,
        first_name: 'Seller', // Default name
        last_name: 'User',
        role: 'seller',
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
</script>

<template>
  <!-- Your template remains the same -->
  <v-app>
    <v-main>
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
        <!-- Debug Info (remove in production) -->
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
                {{ address ? `${address.street}, ${address.city_name}` : 'No address set' }}
              </p>
              <p><strong>Transaction No.:</strong> {{ transactionNumber }}</p>
              <p>
                <strong>Delivery Schedule:</strong> {{ formattedDate }}
                {{ deliveryTime ? `at ${deliveryTime}` : '' }}
              </p>
              <p v-if="scheduleError" class="text-red mt-1">{{ scheduleError }}</p>
              <div class="button-group mt-2">
                <v-btn size="small" color="primary" variant="tonal" class="action-btn">
                  Change Address
                </v-btn>
                <v-btn
                  size="small"
                  color="primary"
                  variant="tonal"
                  @click="showDateTimePicker = true"
                  class="action-btn"
                >
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
                  <v-img :src="item.image" :alt="item.name" cover class="product-image" />
                </v-avatar>
              </template>

              <v-list-item-title class="item-name">
                {{ item.name }}
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
                    <v-btn
                      size="x-small"
                      color="error"
                      variant="tonal"
                      @click="decreaseQty(item)"
                      class="qty-btn"
                      :disabled="item.quantity <= 1"
                    >
                      −
                    </v-btn>
                    <span class="quantity-display">{{ item.quantity }}</span>
                    <v-btn
                      size="x-small"
                      color="primary"
                      variant="tonal"
                      @click="increaseQty(item)"
                      class="qty-btn"
                    >
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
            <v-textarea
              v-model="note"
              label="Write something to the seller..."
              auto-grow
              rows="2"
              outlined
              dense
              placeholder="Any special instructions or requests..."
              class="note-textarea"
            ></v-textarea>
          </v-card-text>
        </v-card>

        <!-- Delivery Option -->
        <v-card outlined class="mb-4 card-elevated">
          <v-card-title class="card-title">
            <v-icon color="primary" class="mr-2">mdi-map-marker</v-icon>
            Delivery Option
          </v-card-title>
          <v-card-text>
            <v-select
              v-model="deliveryOption"
              :items="deliveryOptionsDisplay"
              item-title="label"
              item-value="value"
              label="Select delivery option"
              outlined
              dense
              class="delivery-select"
            ></v-select>
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
          <v-btn
            color="primary"
            size="large"
            @click="handleCheckout"
            class="place-order-btn"
            :disabled="!items.length || !buyer || !address"
            :loading="false"
            block
          >
            <v-icon left>mdi-check</v-icon>
            Place Order
          </v-btn>
        </div>
      </div>

      <!-- Date & Time Picker Dialog -->
      <v-dialog v-model="showDateTimePicker" max-width="420" class="datetime-dialog">
        <v-card class="datetime-card">
          <v-card-title class="datetime-title"> Select Delivery Schedule </v-card-title>
          <v-card-text class="datetime-content">
            <v-date-picker
              v-model="deliveryDate"
              color="primary"
              elevation="0"
              show-adjacent-months
              class="date-picker"
            ></v-date-picker>
            <v-divider class="my-4"></v-divider>
            <div class="time-section">
              <div class="time-label">Select Time</div>
              <div class="time-wheels">
                <div class="time-wheel">
                  <v-virtual-scroll :items="hours12" height="160" item-height="40">
                    <template #default="{ item }">
                      <div
                        class="time-item"
                        :class="{ active: item === selectedHour }"
                        @click="selectHour(item)"
                      >
                        {{ item }}
                      </div>
                    </template>
                  </v-virtual-scroll>
                </div>
                <div class="time-separator">:</div>
                <div class="time-wheel">
                  <v-virtual-scroll :items="minutes" height="160" item-height="40">
                    <template #default="{ item }">
                      <div
                        class="time-item"
                        :class="{ active: item === selectedMinute }"
                        @click="selectMinute(item)"
                      >
                        {{ item }}
                      </div>
                    </template>
                  </v-virtual-scroll>
                </div>
              </div>
              <div class="period-toggle">
                <v-btn-toggle
                  v-model="selectedPeriod"
                  color="primary"
                  rounded="pill"
                  divided
                  class="period-buttons"
                >
                  <v-btn value="AM" class="period-btn">AM</v-btn>
                  <v-btn value="PM" class="period-btn">PM</v-btn>
                </v-btn-toggle>
              </div>
              <div class="selected-schedule">
                <div class="schedule-label">Selected Schedule</div>
                <div class="schedule-display">
                  {{ formattedDate }} — {{ selectedHour }}:{{ selectedMinute }} {{ selectedPeriod }}
                </div>
              </div>
            </div>
          </v-card-text>
          <v-card-actions class="datetime-actions">
            <v-btn text @click="showDateTimePicker = false" class="cancel-datetime-btn">
              Cancel
            </v-btn>
            <v-btn
              color="primary"
              variant="flat"
              @click="confirmDateTime"
              class="confirm-datetime-btn"
            >
              Confirm
            </v-btn>
          </v-card-actions>
        </v-card>
      </v-dialog>
    </v-main>
  </v-app>
</template>

<!-- Your styles remain the same -->
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
.confirm-datetime-btn {
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
</style>
