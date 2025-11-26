<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/utils/supabase'

const router = useRouter()
const goBack = () => router.back()

// state
const shopId = ref<string | null>(null)
const businessAvatar = ref('')
const coverPhoto = ref('')
const businessName = ref('')
const description = ref('')
const timeOpen = ref('')
const timeClose = ref('')
const manualStatus = ref('auto')
const address = ref('')
const loading = ref(false)

// transactions
const transactionFilter = ref('pending')
const transactionOptions = [
  { title: 'Pending Orders', value: 'pending' },
  { title: 'Processing Orders', value: 'processing' },
  { title: 'Completed Orders', value: 'completed' },
  { title: 'Cancelled Orders', value: 'cancelled' },
]

// Orders state
const orders = ref<any[]>([])
const ordersLoading = ref(false)
const selectedOrder = ref<any>(null)
const rejectDialog = ref(false)
const rejectReason = ref('')
const processingOrder = ref(false)

// Add this missing function - place it after your state declarations
const getProductImage = (product: any) => {
  if (!product?.main_img_urls) return '/placeholder.png'
  try {
    if (typeof product.main_img_urls === 'string') {
      const parsed = JSON.parse(product.main_img_urls)
      return Array.isArray(parsed) ? parsed[0] : parsed
    }
    if (Array.isArray(product.main_img_urls)) {
      return product.main_img_urls[0]
    }
    return '/placeholder.png'
  } catch {
    return '/placeholder.png'
  }
}
// Fetch shop data
const fetchShopData = async () => {
  try {
    console.log('🛍️ Fetching shop data...')
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      console.error('❌ No user found')
      return
    }

    // Get shop data
    const { data: shopData, error: shopError } = await supabase
      .from('shops')
      .select('*')
      .eq('owner_id', user.id)
      .single()

    if (shopError) {
      console.error('❌ Error fetching shop:', shopError)
      if (shopError.code === 'PGRST116') {
        console.log('No shop found for user')
        shopId.value = null
      }
      return
    }

    console.log('✅ Shop data:', shopData)
    shopId.value = shopData.id
    businessAvatar.value = shopData.avatar_url || ''
    coverPhoto.value = shopData.cover_photo || ''
    businessName.value = shopData.business_name || 'My Business'
    description.value = shopData.description || ''
    timeOpen.value = shopData.time_open || 'N/A'
    timeClose.value = shopData.time_close || 'N/A'
    manualStatus.value = shopData.manual_status || 'auto'
    address.value = shopData.address || 'No address set'
  } catch (err) {
    console.error('❌ Error in fetchShopData:', err)
    shopId.value = null
  }
}
// Replace your current fetchShopOrders with this corrected version
const fetchShopOrders = async () => {
  if (!shopId.value) {
    console.log('❌ No shop ID available')
    return
  }

  try {
    ordersLoading.value = true
    console.log('📦 Fetching orders for shop:', shopId.value)

    // Step 1: Get all products for this shop
    const { data: products, error: productsError } = await supabase
      .from('products')
      .select('id, prod_name, main_img_urls')
      .eq('shop_id', shopId.value)

    if (productsError) {
      console.error('❌ Error fetching products:', productsError)
      throw productsError
    }

    console.log('✅ Products found:', products?.length || 0)

    if (!products || products.length === 0) {
      orders.value = []
      return
    }

    const productIds = products.map((p) => p.id)
    console.log('📋 Product IDs:', productIds)

    // Step 2: Get order items for these products
    const { data: orderItems, error: itemsError } = await supabase
      .from('order_items')
      .select('*')
      .in('product_id', productIds)
      .order('created_at', { ascending: false })

    if (itemsError) {
      console.error('❌ Error fetching order items:', itemsError)
      throw itemsError
    }

    console.log('✅ Order items found:', orderItems?.length || 0)

    if (!orderItems || orderItems.length === 0) {
      orders.value = []
      return
    }

    // Step 3: Get the actual orders for these order items
    const orderIds = orderItems.map((item) => item.order_id)
    console.log('📋 Order IDs:', orderIds)

    const { data: ordersData, error: ordersError } = await supabase
      .from('orders')
      .select('*')
      .in('id', orderIds)

    if (ordersError) {
      console.error('❌ Error fetching orders:', ordersError)
      throw ordersError
    }

    console.log('✅ Orders found:', ordersData?.length || 0)
    console.log('📋 Orders data:', ordersData) // Add this to debug

    // Step 4: Get buyer information for these orders
    const buyerIds = [...new Set(ordersData?.map((order) => order.user_id).filter(Boolean) || [])]
    console.log('📋 Buyer IDs:', buyerIds)

    let buyers = []
    if (buyerIds.length > 0) {
      const { data: buyersData, error: buyersError } = await supabase
        .from('profiles')
        .select('id, first_name, last_name, phone')
        .in('id', buyerIds)

      if (buyersError) {
        console.error('❌ Error fetching buyers:', buyersError)
      } else {
        buyers = buyersData || []
        console.log('✅ Buyers data:', buyers) // Add this to debug
      }
    }

    console.log('✅ Buyers found:', buyers.length)

    // Step 5: Combine all the data - FIXED: Check if data exists
    orders.value = orderItems.map((item) => {
      const order = ordersData?.find((o) => o.id === item.order_id)
      const product = products?.find((p) => p.id === item.product_id)
      const buyer = buyers?.find((b) => b.id === order?.user_id)

      // Debug each item
      console.log('🔍 Processing order item:', {
        itemId: item.id,
        orderId: item.order_id,
        productId: item.product_id,
        foundOrder: !!order,
        foundProduct: !!product,
        foundBuyer: !!buyer,
        orderStatus: order?.status,
      })

      return {
        id: item.id,
        order_id: order?.id,
        product_id: item.product_id,
        product_name: product?.prod_name || 'Unknown Product',
        product_img: getProductImage(product),
        quantity: item.quantity || 1,
        price: item.price || 0,
        selected_size: item.selected_size || null,
        selected_variety: item.selected_variety || null,
        status: order?.status || 'pending',
        created_at: order?.created_at || item.created_at,
        updated_at: order?.updated_at,
        note: order?.note || null,
        buyer: buyer
          ? {
              first_name: buyer.first_name,
              last_name: buyer.last_name,
              phone: buyer.phone,
            }
          : null,
      }
    })

    console.log('✅ Final transformed orders:', orders.value)
  } catch (err) {
    console.error('❌ Error in fetchShopOrders:', err)
    orders.value = []
  } finally {
    ordersLoading.value = false
  }
}
const debugOrders = async () => {
  if (!shopId.value) {
    console.log('❌ No shop ID for debug')
    return
  }

  try {
    console.log('🐛 DEBUG: Checking database state...')

    // Check products
    const { data: products, error: productsError } = await supabase
      .from('products')
      .select('id, prod_name, main_img_urls')
      .eq('shop_id', shopId.value)

    console.log('🐛 DEBUG - Products:', products)
    if (productsError) console.error('🐛 DEBUG - Products error:', productsError)

    // Check order_items for our products
    if (products && products.length > 0) {
      const productIds = products.map(p => p.id)
      const { data: relatedOrderItems, error: relatedError } = await supabase
        .from('order_items')
        .select(`
          *,
          orders (
            id,
            status,
            user_id,
            created_at
          )
        `)
        .in('product_id', productIds)
        .limit(10)

      console.log('🐛 DEBUG - Related order items with orders:', relatedOrderItems)
      if (relatedError) console.error('🐛 DEBUG - Related order items error:', relatedError)
    }

  } catch (err) {
    console.error('🐛 DEBUG - Error:', err)
  }
}
// Update test function to use correct column names
const testDatabaseConnection = async () => {
  try {
    console.log('🧪 Testing database connection...')

    // Test 1: Check if we have any orders at all
    const { data: testOrders, error: testError } = await supabase
      .from('orders')
      .select('*')
      .limit(5)

    console.log('🧪 Test orders:', testOrders)
    if (testError) console.error('🧪 Test orders error:', testError)

    // Test 2: Check if we have any order_items
    const { data: testItems, error: testItemsError } = await supabase
      .from('order_items')
      .select('*')
      .limit(5)

    console.log('🧪 Test order items:', testItems)
    if (testItemsError) console.error('🧪 Test order items error:', testItemsError)

    // Test 3: Check if any order_items belong to our products - FIXED COLUMN NAME
    if (shopId.value) {
      const { data: shopProducts, error: shopProductsError } = await supabase
        .from('products')
        .select('id, prod_name') // Changed from product_name to prod_name
        .eq('shop_id', shopId.value)

      console.log('🧪 Shop products:', shopProducts)
      if (shopProductsError) console.error('🧪 Shop products error:', shopProductsError)

      if (shopProducts && shopProducts.length > 0) {
        const productIds = shopProducts.map((p) => p.id)
        const { data: relatedOrderItems, error: relatedError } = await supabase
          .from('order_items')
          .select('*')
          .in('product_id', productIds)
          .limit(5)

        console.log('🧪 Related order items:', relatedOrderItems)
        if (relatedError) console.error('🧪 Related order items error:', relatedError)
      }
    }
  } catch (err) {
    console.error('🧪 Test error:', err)
  }
}

// Call this in your onMounted to test
onMounted(async () => {
  await fetchShopData()
  if (shopId.value) {
    await testDatabaseConnection() // Add this for testing
    await debugOrders()
    await fetchShopOrders()
  }
})
// Add this computed property to help with debugging
const debugInfo = computed(() => {
  return {
    shopId: shopId.value,
    totalOrders: orders.value.length,
    ordersByStatus: {
      pending: orders.value.filter((o) => o.status === 'pending').length,
      paid: orders.value.filter((o) => o.status === 'paid').length,
      shipped: orders.value.filter((o) => o.status === 'shipped').length,
      delivered: orders.value.filter((o) => o.status === 'delivered').length,
      cancelled: orders.value.filter((o) => o.status === 'cancelled').length,
    },
    sampleOrder: orders.value[0] || null,
  }
})
// Call this in onMounted to debug
onMounted(async () => {
  await fetchShopData()
  if (shopId.value) {
    await debugOrders() // Add this for debugging
    await fetchShopOrders()
  }
})
// Order Statistics - Update to match new structure
const orderStats = computed(() => {
  const pending = orders.value.filter((o) => o.status === 'pending').length
  const processing = orders.value.filter((o) => ['paid', 'shipped'].includes(o.status)).length
  const completed = orders.value.filter((o) => o.status === 'delivered').length
  const cancelled = orders.value.filter((o) => o.status === 'cancelled').length

  return { pending, processing, completed, cancelled }
})

// Filter orders based on selected filter
const filteredOrders = computed(() => {
  if (!orders.value || orders.value.length === 0) {
    return []
  }

  let filtered = []
  switch (transactionFilter.value) {
    case 'pending':
      filtered = orders.value.filter((order) => order.status === 'pending')
      break
    case 'processing':
      filtered = orders.value.filter((order) => ['paid', 'shipped'].includes(order.status))
      break
    case 'completed':
      filtered = orders.value.filter((order) => order.status === 'delivered')
      break
    case 'cancelled':
      filtered = orders.value.filter((order) => order.status === 'cancelled')
      break
    default:
      filtered = orders.value
  }

  console.log(`🔍 Filtered ${filtered.length} orders for status: ${transactionFilter.value}`)
  return filtered
})

// Order management functions
const acceptOrder = async (order: any) => {
  if (!confirm('Are you sure you want to accept this order?')) return

  try {
    processingOrder.value = true
    console.log('✅ Accepting order:', order.order_id)

    const { error } = await supabase
      .from('orders')
      .update({
        status: 'paid',
        updated_at: new Date().toISOString(),
      })
      .eq('id', order.order_id)

    if (error) throw error

    // Refresh orders to show updated status
    await fetchShopOrders()

    alert('Order accepted successfully! The order is now marked as paid and ready for processing.')
  } catch (err) {
    console.error('❌ Error accepting order:', err)
    alert('Failed to accept order. Please try again.')
  } finally {
    processingOrder.value = false
  }
}

const rejectOrder = async (order: any) => {
  if (!rejectReason.value.trim()) {
    alert('Please provide a reason for rejection')
    return
  }

  if (!confirm('Are you sure you want to reject this order? This action cannot be undone.')) return

  try {
    processingOrder.value = true
    console.log('❌ Rejecting order:', order.order_id)

    const { error } = await supabase
      .from('orders')
      .update({
        status: 'cancelled',
        note: rejectReason.value.trim(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', order.order_id)

    if (error) throw error

    await fetchShopOrders()
    rejectDialog.value = false
    rejectReason.value = ''

    alert('Order rejected successfully! The buyer has been notified.')
  } catch (err) {
    console.error('❌ Error rejecting order:', err)
    alert('Failed to reject order. Please try again.')
  } finally {
    processingOrder.value = false
  }
}

const markAsShipped = async (order: any) => {
  if (!confirm('Mark this order as shipped?')) return

  try {
    processingOrder.value = true

    const { error } = await supabase
      .from('orders')
      .update({
        status: 'shipped',
        updated_at: new Date().toISOString(),
      })
      .eq('id', order.order_id)

    if (error) throw error

    await fetchShopOrders()
    alert('Order marked as shipped! The buyer has been notified.')
  } catch (err) {
    console.error('Error marking as shipped:', err)
    alert('Failed to mark as shipped. Please try again.')
  } finally {
    processingOrder.value = false
  }
}

const markAsDelivered = async (order: any) => {
  if (!confirm('Mark this order as delivered?')) return

  try {
    processingOrder.value = true

    const { error } = await supabase
      .from('orders')
      .update({
        status: 'delivered',
        updated_at: new Date().toISOString(),
      })
      .eq('id', order.order_id)

    if (error) throw error

    await fetchShopOrders()
    alert('Order marked as delivered! Transaction completed successfully.')
  } catch (err) {
    console.error('Error marking as delivered:', err)
    alert('Failed to mark as delivered. Please try again.')
  } finally {
    processingOrder.value = false
  }
}

const openRejectDialog = (order: any) => {
  selectedOrder.value = order
  rejectDialog.value = true
  rejectReason.value = ''
}

// Utility functions
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
  } catch {
    return time24
  }
}

const formatCurrency = (amount: number) => {
  return `₱${amount?.toFixed(2) || '0.00'}`
}

const formatDateTime = (dateString: string) => {
  if (!dateString) return 'Not set'
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const getStatusColor = (status: string) => {
  switch (status) {
    case 'pending':
      return 'orange'
    case 'paid':
      return 'blue'
    case 'shipped':
      return 'purple'
    case 'delivered':
      return 'green'
    case 'cancelled':
      return 'red'
    default:
      return 'grey'
  }
}

const getStatusIcon = (status: string) => {
  switch (status) {
    case 'pending':
      return 'mdi-clock-outline'
    case 'paid':
      return 'mdi-credit-card-check'
    case 'shipped':
      return 'mdi-truck-delivery'
    case 'delivered':
      return 'mdi-check-circle'
    case 'cancelled':
      return 'mdi-close-circle'
    default:
      return 'mdi-help-circle'
  }
}

const getStatusText = (status: string) => {
  switch (status) {
    case 'pending':
      return 'Pending Approval'
    case 'paid':
      return 'Paid - Ready to Ship'
    case 'shipped':
      return 'Shipped'
    case 'delivered':
      return 'Delivered'
    case 'cancelled':
      return 'Cancelled'
    default:
      return status
  }
}

const getOrderItemTotal = (item: any) => {
  return item.price * item.quantity || 0
}

// Shop management functions
const toggleShopStatus = async () => {
  try {
    loading.value = true
    const {
      data: { user },
    } = await supabase.auth.getUser()

    let newStatus: 'open' | 'closed' | 'auto'
    if (manualStatus.value === 'auto') newStatus = 'open'
    else if (manualStatus.value === 'open') newStatus = 'closed'
    else newStatus = 'auto'

    const { data, error } = await supabase.rpc('update_shop_status', {
      p_owner_id: user.id,
      p_manual_status: newStatus,
    })

    if (error) throw error
    if (!data?.success) throw new Error('Update failed')

    manualStatus.value = newStatus
    alert(
      `Shop is now ${newStatus === 'auto' ? 'AUTOMATIC' : 'MANUALLY ' + newStatus.toUpperCase()}`,
    )
  } catch (err) {
    alert('Failed to update shop status')
  } finally {
    loading.value = false
  }
}

const getCurrentStatusDisplay = () => {
  if (manualStatus.value === 'open')
    return {
      text: 'Manually Open',
      color: 'green',
      icon: 'mdi-store-check',
      buttonText: 'Switch to Closed',
      buttonColor: 'red',
    }
  if (manualStatus.value === 'closed')
    return {
      text: 'Manually Closed',
      color: 'red',
      icon: 'mdi-store-remove',
      buttonText: 'Switch to Auto Mode',
      buttonColor: 'blue',
    }
  return {
    text: 'Auto (Based on Hours)',
    color: 'blue',
    icon: 'mdi-clock',
    buttonText: 'Switch to Open',
    buttonColor: 'green',
  }
}

const isShopCurrentlyOpen = () => {
  if (manualStatus.value === 'open') return true
  if (manualStatus.value === 'closed') return false

  // Auto mode: check business hours
  const now = new Date()
  const currentHour = now.getHours()
  const currentMinute = now.getMinutes()

  // Parse open time
  const openTime = timeOpen.value
  if (openTime && openTime !== 'N/A') {
    const [openHour, openMinute] = openTime.split(':').map(Number)

    // Parse close time
    const closeTime = timeClose.value
    if (closeTime && closeTime !== 'N/A') {
      const [closeHour, closeMinute] = closeTime.split(':').map(Number)

      // Check if current time is within business hours
      const currentTotalMinutes = currentHour * 60 + currentMinute
      const openTotalMinutes = openHour * 60 + openMinute
      const closeTotalMinutes = closeHour * 60 + closeMinute

      return currentTotalMinutes >= openTotalMinutes && currentTotalMinutes <= closeTotalMinutes
    }
  }

  // Default to 8 AM - 8 PM if no hours set
  return currentHour >= 8 && currentHour < 20
}

// Refresh data
const refreshData = async () => {
  console.log('🔄 Refreshing data...')
  await fetchShopData()
  if (shopId.value) {
    await fetchShopOrders()
  }
}
</script>

<template>
  <v-app>
    <!-- Update your top bar to include refresh -->
    <v-app-bar class="top-bar" flat color="primary" dark>
      <v-btn icon @click="goBack">
        <v-icon>mdi-arrow-left</v-icon>
      </v-btn>
      <v-toolbar-title class="text-h6">Business Profile</v-toolbar-title>
      <v-spacer></v-spacer>
      <v-btn icon @click="refreshData" title="Refresh Data" :loading="ordersLoading">
        <v-icon>mdi-refresh</v-icon>
      </v-btn>
    </v-app-bar>

    <v-main>
      <!-- Replace your current debug alert with this -->
      <v-alert v-if="shopId" type="info" class="ma-4">
        <strong>Shop Info:</strong>
        Shop ID: {{ shopId }} | Total Orders: {{ orders.length }} | Filtered:
        {{ filteredOrders.length }}
        <br />
        <strong>Status Breakdown:</strong>
        Pending: {{ orderStats.pending }} | Processing: {{ orderStats.processing }} | Completed:
        {{ orderStats.completed }} | Cancelled: {{ orderStats.cancelled }}
      </v-alert>

      <v-alert v-else type="warning" class="ma-4">
        <strong>No Shop Found:</strong> Please create a shop first to view orders.
        <v-btn small @click="fetchShopData" class="ml-2"> Check Again </v-btn>
      </v-alert>

      <!-- Cover + Logo -->
      <v-container class="pa-0">
        <v-img v-if="coverPhoto" :src="coverPhoto" height="180" cover class="cover-photo" />
        <div v-else class="cover-placeholder"></div>

        <!-- Avatar overlapping cover -->
        <div class="avatar-wrapper">
          <v-avatar size="96" class="avatar-border">
            <v-img v-if="businessAvatar" :src="businessAvatar" cover />
            <v-icon v-else size="48">mdi-store</v-icon>
          </v-avatar>
        </div>
      </v-container>

      <!-- Business Info Section -->
      <v-container class="py-6">
        <v-sheet rounded="xl" elevation="4" class="pa-6 text-center">
          <h2 class="text-h6 mt-4">{{ businessName }}</h2>
          <p class="text-body-2 text-medium-emphasis">{{ description }}</p>

          <!-- Business hours -->
          <div class="mt-2">
            <p><strong>Opens:</strong> {{ timeOpen }}</p>
            <p><strong>Closes:</strong> {{ timeClose }}</p>

            <!-- Shop Status Control -->
            <div class="status-control mt-4">
              <p class="text-body-2 mb-2">
                <strong>Current Status:</strong>
                <v-chip :color="getCurrentStatusDisplay().color" size="small" class="ml-2">
                  <v-icon start small>{{ getCurrentStatusDisplay().icon }}</v-icon>
                  {{ getCurrentStatusDisplay().text }}
                </v-chip>
              </p>

              <v-btn
                :color="getCurrentStatusDisplay().buttonColor"
                :loading="loading"
                @click="toggleShopStatus"
                class="status-toggle-btn"
                size="large"
              >
                <v-icon start>{{ getCurrentStatusDisplay().icon }}</v-icon>
                {{ getCurrentStatusDisplay().buttonText }}
              </v-btn>

              <p class="text-caption text-medium-emphasis mt-2 text-center">
                {{
                  manualStatus === 'auto'
                    ? `Status automatically determined by your business hours. Currently: ${isShopCurrentlyOpen() ? 'OPEN' : 'CLOSED'}`
                    : 'Status manually overridden'
                }}
              </p>

              <div class="mt-2">
                <v-chip
                  v-if="manualStatus === 'auto'"
                  :color="isShopCurrentlyOpen() ? 'green' : 'red'"
                  size="small"
                >
                  <v-icon start small>
                    {{ isShopCurrentlyOpen() ? 'mdi-check' : 'mdi-close' }}
                  </v-icon>
                  {{ isShopCurrentlyOpen() ? 'Currently OPEN' : 'Currently CLOSED' }}
                </v-chip>
              </div>
            </div>
          </div>

          <p class="mt-2 text-body-2">
            <v-icon start small>mdi-map-marker</v-icon>
            {{ address }}
          </p>
        </v-sheet>
      </v-container>

      <!-- Transaction Section -->
      <v-divider thickness="3" class="my-4">Transaction</v-divider>

      <v-container class="py-4">
        <v-btn color="primary" rounded="lg" class="mb-4" to="/productlist">
          <v-icon start>mdi-package-variant</v-icon>
          My Products
        </v-btn>

        <!-- Order Statistics -->
        <v-row class="mb-6">
          <v-col cols="6" sm="3">
            <v-card color="orange-lighten-5" class="text-center pa-3">
              <div class="text-h6 font-weight-bold text-orange">
                {{ orderStats.pending }}
              </div>
              <div class="text-caption text-orange">Pending</div>
            </v-card>
          </v-col>
          <v-col cols="6" sm="3">
            <v-card color="blue-lighten-5" class="text-center pa-3">
              <div class="text-h6 font-weight-bold text-blue">
                {{ orderStats.processing }}
              </div>
              <div class="text-caption text-blue">Processing</div>
            </v-card>
          </v-col>
          <v-col cols="6" sm="3">
            <v-card color="green-lighten-5" class="text-center pa-3">
              <div class="text-h6 font-weight-bold text-green">
                {{ orderStats.completed }}
              </div>
              <div class="text-caption text-green">Completed</div>
            </v-card>
          </v-col>
          <v-col cols="6" sm="3">
            <v-card color="red-lighten-5" class="text-center pa-3">
              <div class="text-h6 font-weight-bold text-red">
                {{ orderStats.cancelled }}
              </div>
              <div class="text-caption text-red">Cancelled</div>
            </v-card>
          </v-col>
        </v-row>

        <v-select
          v-model="transactionFilter"
          :items="transactionOptions"
          label="Filter Orders"
          variant="outlined"
          density="comfortable"
          class="mb-4"
        />

        <!-- Orders List - Grid Layout like Buyer Section -->
        <div v-if="ordersLoading" class="text-center py-8">
          <v-progress-circular indeterminate color="primary"></v-progress-circular>
          <p class="mt-2">Loading orders...</p>
        </div>

        <div v-else-if="filteredOrders.length === 0" class="text-center py-8">
          <v-icon size="64" color="grey-lighten-2">mdi-cart-off</v-icon>
          <p class="mt-2 text-grey">
            No
            {{
              transactionOptions.find((opt) => opt.value === transactionFilter)?.title.toLowerCase()
            }}
            found
          </p>
          <p class="text-caption text-grey mt-2" v-if="shopId">
            When customers purchase your products, orders will appear here.
          </p>
        </div>

        <!-- Grid Layout for Orders -->
        <div v-else class="orders-grid">
          <v-row dense>
            <v-col v-for="order in filteredOrders" :key="order.id" cols="12" sm="6" md="4">
              <v-card class="order-card" elevation="2" :class="`status-${order.status}`">
                <!-- Product Image -->
                <v-img :src="order.product_img" height="200px" cover class="product-image" />

                <v-card-title class="product-name">
                  {{ order.product_name || 'Product' }}
                </v-card-title>

                <v-card-subtitle class="pb-0">
                  <div class="d-flex justify-space-between align-center">
                    <v-chip small :color="getStatusColor(order.status)" class="font-weight-bold">
                      <v-icon start small>{{ getStatusIcon(order.status) }}</v-icon>
                      {{ getStatusText(order.status) }}
                    </v-chip>
                    <span class="text-caption text-medium-emphasis">
                      {{ formatDateTime(order.created_at) }}
                    </span>
                  </div>
                </v-card-subtitle>

                <v-card-text class="pt-2">
                  <!-- Order Details -->
                  <div class="order-details">
                    <div><strong>Quantity:</strong> {{ order.quantity }}</div>
                    <div><strong>Price:</strong> {{ formatCurrency(order.price) }}</div>
                    <div>
                      <strong>Total:</strong> {{ formatCurrency(getOrderItemTotal(order)) }}
                    </div>
                    <div v-if="order.selected_size">
                      <strong>Size:</strong> {{ order.selected_size }}
                    </div>
                    <div v-if="order.selected_variety">
                      <strong>Variety:</strong> {{ order.selected_variety }}
                    </div>
                  </div>

                  <!-- Buyer Information -->
                  <div class="buyer-info mt-3" v-if="order.buyer">
                    <div class="text-caption text-medium-emphasis">
                      <strong>Buyer:</strong> {{ order.buyer.first_name }}
                      {{ order.buyer.last_name }}
                    </div>
                    <div v-if="order.buyer.phone" class="text-caption text-medium-emphasis">
                      <strong>Phone:</strong> {{ order.buyer.phone }}
                    </div>
                  </div>

                  <!-- Order Notes -->
                  <div v-if="order.note" class="order-notes mt-2 pa-2 bg-grey-lighten-4 rounded">
                    <strong>Note:</strong> {{ order.note }}
                  </div>
                </v-card-text>

                <!-- Action Buttons -->
                <v-card-actions class="action-buttons">
                  <!-- PENDING ORDERS - Accept/Decline -->
                  <template v-if="order.status === 'pending'">
                    <v-btn
                      color="success"
                      block
                      @click="acceptOrder(order)"
                      :loading="processingOrder"
                      size="small"
                    >
                      <v-icon left>mdi-check</v-icon>
                      Accept Order
                    </v-btn>
                    <v-btn
                      color="error"
                      variant="outlined"
                      block
                      @click="openRejectDialog(order)"
                      :loading="processingOrder"
                      size="small"
                      class="mt-2"
                    >
                      <v-icon left>mdi-close</v-icon>
                      Decline Order
                    </v-btn>
                  </template>

                  <!-- PAID ORDERS - Mark as Shipped -->
                  <template v-else-if="order.status === 'paid'">
                    <v-btn
                      color="primary"
                      block
                      @click="markAsShipped(order)"
                      :loading="processingOrder"
                      size="small"
                    >
                      <v-icon left>mdi-truck</v-icon>
                      Mark as Shipped
                    </v-btn>
                  </template>

                  <!-- SHIPPED ORDERS - Mark as Delivered -->
                  <template v-else-if="order.status === 'shipped'">
                    <v-btn
                      color="success"
                      block
                      @click="markAsDelivered(order)"
                      :loading="processingOrder"
                      size="small"
                    >
                      <v-icon left>mdi-check-circle</v-icon>
                      Mark as Delivered
                    </v-btn>
                  </template>

                  <!-- DELIVERED ORDERS - Completed -->
                  <template v-else-if="order.status === 'delivered'">
                    <div class="completed-status text-center w-100">
                      <v-icon color="success" class="mr-2">mdi-check-circle</v-icon>
                      <span class="text-success font-weight-medium">Order Completed</span>
                    </div>
                  </template>

                  <!-- CANCELLED ORDERS -->
                  <template v-else-if="order.status === 'cancelled'">
                    <div class="cancelled-status text-center w-100">
                      <v-icon color="error" class="mr-2">mdi-close-circle</v-icon>
                      <span class="text-error font-weight-medium">Order Cancelled</span>
                    </div>
                  </template>
                </v-card-actions>
              </v-card>
            </v-col>
          </v-row>
        </div>
      </v-container>
    </v-main>

    <!-- Reject Order Dialog -->
    <v-dialog v-model="rejectDialog" max-width="500">
      <v-card>
        <v-card-title class="d-flex align-center">
          <v-icon color="error" class="mr-2">mdi-alert-circle</v-icon>
          Decline Order
        </v-card-title>
        <v-card-text>
          <p class="mb-3">Please provide a reason for declining this order:</p>
          <v-textarea
            v-model="rejectReason"
            label="Decline Reason"
            variant="outlined"
            rows="3"
            placeholder="Please explain why you are declining this order..."
            required
          ></v-textarea>
        </v-card-text>
        <v-card-actions>
          <v-spacer></v-spacer>
          <v-btn variant="text" @click="rejectDialog = false" :disabled="processingOrder">
            Cancel
          </v-btn>
          <v-btn
            color="error"
            @click="rejectOrder(selectedOrder)"
            :loading="processingOrder"
            :disabled="!rejectReason.trim()"
          >
            <v-icon left>mdi-cancel</v-icon>
            Decline Order
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-app>
</template>

<style scoped>
.top-bar {
  padding-top: 20px;
}
.cover-photo {
  border-bottom-left-radius: 12px;
  border-bottom-right-radius: 12px;
}

.cover-placeholder {
  height: 180px;
  background: linear-gradient(135deg, #e5e7eb, #d1d5db);
  border-bottom-left-radius: 12px;
  border-bottom-right-radius: 12px;
}

.avatar-wrapper {
  display: flex;
  justify-content: center;
  margin-top: -48px;
}

.avatar-border {
  border: 4px solid #fff;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  background: #fff;
}

.status-control {
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 16px;
  background: #f8fafc;
}

.status-toggle-btn {
  min-width: 200px;
  font-weight: 600;
}

/* Grid Layout for Orders */
.orders-grid {
  width: 100%;
}

.order-card {
  border-radius: 12px;
  overflow: hidden;
  transition:
    transform 0.2s ease,
    box-shadow 0.2s ease;
  height: 100%;
}

.order-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.order-card.status-pending {
  border-left: 4px solid #ff9800;
}

.order-card.status-paid {
  border-left: 4px solid #2196f3;
}

.order-card.status-shipped {
  border-left: 4px solid #9c27b0;
}

.order-card.status-delivered {
  border-left: 4px solid #4caf50;
}

.order-card.status-cancelled {
  border-left: 4px solid #f44336;
}

.product-image {
  cursor: pointer;
}

.product-name {
  font-size: 1rem;
  font-weight: 600;
  line-height: 1.2;
  padding-bottom: 8px;
}

.order-details {
  font-size: 0.875rem;
}

.buyer-info {
  border-top: 1px solid #e0e0e0;
  padding-top: 8px;
}

.order-notes {
  font-size: 0.8rem;
  border-left: 3px solid #ff9800;
}

.action-buttons {
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.completed-status,
.cancelled-status {
  padding: 8px;
  border-radius: 6px;
}

.completed-status {
  background-color: #e8f5e8;
}

.cancelled-status {
  background-color: #ffebee;
}

/* Responsive adjustments */
@media (max-width: 768px) {
  .orders-grid .v-col {
    margin-bottom: 16px;
  }

  .order-card {
    margin-bottom: 0;
  }
}

@media (max-width: 600px) {
  .orders-grid .v-col {
    margin-bottom: 12px;
  }

  .product-name {
    font-size: 0.9rem;
  }

  .order-details {
    font-size: 0.8rem;
  }
}
</style>
