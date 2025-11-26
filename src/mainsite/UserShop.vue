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

// Helper functions
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

const buildAddress = (shopData: any) => {
  const addressParts = [
    shopData.house_no,
    shopData.building,
    shopData.street,
    shopData.barangay,
    shopData.city,
    shopData.province,
    shopData.postal,
  ].filter((part) => part && part.trim() !== '')

  return addressParts.join(', ') || shopData.detected_address || ''
}

// Main data fetching functions
const fetchShopData = async () => {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      console.error('❌ No user found')
      return
    }

    const { data: shopData, error: shopError } = await supabase
      .from('shops')
      .select('*')
      .eq('owner_id', user.id)
      .single()

    if (shopError) {
      console.error('❌ Error fetching shop:', shopError)
      if (shopError.code === 'PGRST116') {
        shopId.value = null
      }
      return
    }

    // Map database columns to component state
    shopId.value = shopData.id
    businessAvatar.value = shopData.logo_url || ''
    coverPhoto.value = ''
    businessName.value = shopData.business_name || 'My Business'
    description.value = shopData.description || ''
    timeOpen.value = shopData.open_time || 'N/A'
    timeClose.value = shopData.close_time || 'N/A'
    manualStatus.value = shopData.manual_status || 'auto'
    address.value = buildAddress(shopData) || 'No address set'
  } catch (err) {
    console.error('❌ Error in fetchShopData:', err)
    shopId.value = null
  }
}

const fetchShopOrders = async () => {
  if (!shopId.value) {
    console.log('❌ No shop ID available')
    return
  }

  try {
    ordersLoading.value = true
    console.log('📦 Fetching orders for shop:', shopId.value)

    // SIMPLIFIED APPROACH: Query orders directly by shop_id with all related data
    const { data: ordersData, error: ordersError } = await supabase
      .from('orders')
      .select(
        `
        *,
        order_items (
          *,
          products (
            id,
            prod_name,
            main_img_urls,
            shop_id
          )
        ),
        profiles:user_id (
          id,
          first_name,
          last_name,
          phone
        ),
        addresses (*)
      `,
      )
      .eq('shop_id', shopId.value)
      .order('created_at', { ascending: false })

    if (ordersError) {
      console.error('❌ Error fetching orders:', ordersError)
      throw ordersError
    }

    console.log('✅ Orders found:', ordersData?.length || 0)

    if (!ordersData || ordersData.length === 0) {
      console.log('📭 No orders found for this shop')
      orders.value = []
      return
    }

    console.log('📋 Raw orders data:', ordersData)

    // Transform the data - flatten order items
    orders.value = ordersData.flatMap(
      (order) =>
        order.order_items?.map((item) => ({
          id: item.id, // order_item id
          order_id: order.id,
          product_id: item.product_id,
          product_name: item.products?.prod_name || 'Unknown Product',
          product_img: getProductImage(item.products),
          quantity: item.quantity || 1,
          price: item.price || 0,
          selected_size: item.selected_size || null,
          selected_variety: item.selected_variety || null,
          status: order.status || 'pending',
          created_at: order.created_at,
          updated_at: order.updated_at,
          note: order.note || null,
          total_amount: order.total_amount || 0,
          delivery_option: order.delivery_option || null,
          delivery_date: order.delivery_date || null,
          delivery_time: order.delivery_time || null,
          payment_method: order.payment_method || null,
          transaction_number: order.transaction_number || null,
          buyer: order.profiles
            ? {
                first_name: order.profiles.first_name,
                last_name: order.profiles.last_name,
                phone: order.profiles.phone,
              }
            : null,
          address: order.addresses
            ? {
                street: order.addresses.street,
                city: order.addresses.city_name || order.addresses.city,
                province: order.addresses.province,
                phone: order.addresses.phone,
              }
            : null,
        })) || [],
    )

    console.log('✅ Final transformed orders:', orders.value.length)
    console.log('📊 Orders by status:', {
      pending: orders.value.filter((o) => o.status === 'pending').length,
      paid: orders.value.filter((o) => o.status === 'paid').length,
      shipped: orders.value.filter((o) => o.status === 'shipped').length,
      delivered: orders.value.filter((o) => o.status === 'delivered').length,
      cancelled: orders.value.filter((o) => o.status === 'cancelled').length,
    })

    // Debug: Show sample order if available
    if (orders.value.length > 0) {
      console.log('🔍 Sample order:', orders.value[0])
    }
  } catch (err) {
    console.error('❌ Error in fetchShopOrders:', err)
    orders.value = []
  } finally {
    ordersLoading.value = false
  }
}

const debugOrdersData = async () => {
  if (!shopId.value) {
    console.log('❌ No shop ID for debug')
    return
  }

  try {
    console.log('🐛 DEBUG: Checking orders data...')

    // Check orders directly
    const { data: directOrders, error: directError } = await supabase
      .from('orders')
      .select('id, status, total_amount, shop_id, created_at')
      .eq('shop_id', shopId.value)
      .limit(5)

    console.log('📦 Direct orders with shop_id:', directOrders)
    if (directError) console.error('❌ Direct orders error:', directError)

    // Check if there are any order_items
    if (directOrders && directOrders.length > 0) {
      const orderIds = directOrders.map((o) => o.id)
      const { data: orderItems, error: itemsError } = await supabase
        .from('order_items')
        .select('id, order_id, product_id, quantity, price')
        .in('order_id', orderIds)
        .limit(10)

      console.log('🛒 Order items for these orders:', orderItems)
      if (itemsError) console.error('❌ Order items error:', itemsError)
    }

    // Check products for this shop
    const { data: shopProducts, error: productsError } = await supabase
      .from('products')
      .select('id, prod_name')
      .eq('shop_id', shopId.value)
      .limit(5)

    console.log('📊 Shop products:', shopProducts)
    if (productsError) console.error('❌ Products error:', productsError)
  } catch (err) {
    console.error('🐛 DEBUG Error:', err)
  }
}

// Update your onMounted to include debug
onMounted(async () => {
  await fetchShopData()
  if (shopId.value) {
    await debugOrdersData() // Add this temporarily
    await fetchShopOrders()
  }
})
// Computed properties
const orderStats = computed(() => {
  const pending = orders.value.filter((o) => o.status === 'pending').length
  const processing = orders.value.filter((o) => ['paid', 'shipped'].includes(o.status)).length
  const completed = orders.value.filter((o) => o.status === 'delivered').length
  const cancelled = orders.value.filter((o) => o.status === 'cancelled').length

  return { pending, processing, completed, cancelled }
})

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

  return filtered
})

// Order management functions
const acceptOrder = async (order: any) => {
  if (!confirm('Are you sure you want to accept this order?')) return

  try {
    processingOrder.value = true
    const { error } = await supabase
      .from('orders')
      .update({
        status: 'paid',
        updated_at: new Date().toISOString(),
      })
      .eq('id', order.order_id)

    if (error) throw error

    await fetchShopOrders()
    alert('Order accepted successfully!')
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
    alert('Order rejected successfully!')
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
    alert('Order marked as shipped!')
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
    alert('Order marked as delivered!')
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

  const openTime = timeOpen.value
  if (openTime && openTime !== 'N/A') {
    const [openHour, openMinute] = openTime.split(':').map(Number)

    const closeTime = timeClose.value
    if (closeTime && closeTime !== 'N/A') {
      const [closeHour, closeMinute] = closeTime.split(':').map(Number)

      const currentTotalMinutes = currentHour * 60 + currentMinute
      const openTotalMinutes = openHour * 60 + openMinute
      const closeTotalMinutes = closeHour * 60 + closeMinute

      return currentTotalMinutes >= openTotalMinutes && currentTotalMinutes <= closeTotalMinutes
    }
  }

  return currentHour >= 8 && currentHour < 20
}

// Refresh data
const refreshData = async () => {
  await fetchShopData()
  if (shopId.value) {
    await fetchShopOrders()
  }
}

// Initialize
onMounted(async () => {
  await fetchShopData()
  if (shopId.value) {
    await fetchShopOrders()
  }
})
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

      <!-- In your template, update the cover section -->
      <v-container class="pa-0">
        <div v-if="coverPhoto" class="cover-photo-container">
          <v-img :src="coverPhoto" height="180" cover class="cover-photo" />
        </div>
        <div v-else class="cover-placeholder">
          <v-icon size="48" color="grey-lighten-1">mdi-store-front</v-icon>
          <div class="text-caption text-grey-lighten-1 mt-2">No cover photo</div>
        </div>

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
                    <!-- Add these new fields -->
                    <div>
                      <strong>Transaction #:</strong> {{ order.transaction_number || 'N/A' }}
                    </div>
                    <div><strong>Delivery:</strong> {{ order.delivery_option || 'N/A' }}</div>
                    <div v-if="order.delivery_date">
                      <strong>Schedule:</strong> {{ formatDate(order.delivery_date) }}
                      {{ order.delivery_time }}
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
.cover-placeholder {
  height: 180px;
  background: linear-gradient(135deg, #e5e7eb, #d1d5db);
  border-bottom-left-radius: 12px;
  border-bottom-right-radius: 12px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}
</style>
