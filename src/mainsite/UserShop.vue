<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/utils/supabase'

const router = useRouter()
const goBack = () => router.back()

// State
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

// Orders state
const orders = ref<any[]>([])
const loadingOrders = ref(false)
const ordersError = ref('')

// Transactions
const transactionFilter = ref('all')
const transactionOptions = [
  { title: 'All Orders', value: 'all' },
  { title: 'Pending Payment', value: 'pending' },
  { title: 'Approved', value: 'paid' },
  { title: 'Delivered', value: 'delivered' },
  { title: 'Cancelled', value: 'cancelled' },
]

// Function to convert 24-hour time to 12-hour format
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

// Enhanced fetchOrders function
const fetchOrders = async () => {
  if (!shopId.value) {
    console.log('❌ No shop ID available')
    return
  }

  loadingOrders.value = true
  ordersError.value = ''

  try {
    console.log('🛍️ Fetching orders for shop:', shopId.value)

    // Fetch orders with all necessary relationships
    const { data: ordersData, error: ordersError } = await supabase
      .from('orders')
      .select(
        `
        *,
        address:addresses (
          id,
          recipient_name,
          phone,
          building,
          house_no,
          street,
          purok,
          barangay_name,
          city_name,
          province_name,
          region_name,
          postal_code,
          is_default
        ),
        user:profiles (
          id,
          first_name,
          last_name,
          avatar_url,
          phone
        ),
        order_items (
          id,
          product_id,
          quantity,
          price,
          selected_size,
          selected_variety,
          variety_data,
          created_at,
          product:products (
            id,
            prod_name,
            prod_description,
            main_img_urls,
            price,
            sizes,
            varieties,
            stock
          )
        ),
        payments (
          id,
          amount,
          status,
          transaction_id,
          payment_date,
          method
        )
      `,
      )
      .eq('shop_id', shopId.value)
      .order('created_at', { ascending: false })

    if (ordersError) throw ordersError

    console.log('✅ Orders loaded:', ordersData?.length || 0)
    orders.value = ordersData || []
  } catch (err) {
    console.error('❌ Error in fetchOrders:', err)
    ordersError.value = 'Error loading orders. Please try again.'
  } finally {
    loadingOrders.value = false
  }
}

// Order actions
const approvePayment = async (orderId: string) => {
  if (!confirm('Mark this payment as approved?')) return

  try {
    const { error } = await supabase
      .from('orders')
      .update({
        status: 'paid',
        payment_status: 'paid',
        updated_at: new Date().toISOString(),
      })
      .eq('id', orderId)

    if (error) throw error

    alert('✅ Payment approved successfully')
    await fetchOrders()
  } catch (err) {
    console.error('Error approving payment:', err)
    alert('❌ Failed to approve payment')
  }
}

const markAsDelivered = async (orderId: string) => {
  if (!confirm('Mark this order as delivered?')) return

  try {
    const { error } = await supabase
      .from('orders')
      .update({
        status: 'delivered',
        delivery_status: 'delivered',
        updated_at: new Date().toISOString(),
      })
      .eq('id', orderId)

    if (error) throw error

    alert('✅ Order marked as delivered')
    await fetchOrders()
  } catch (err) {
    console.error('Error updating delivery status:', err)
    alert('❌ Failed to update delivery status')
  }
}

const cancelOrder = async (orderId: string) => {
  if (!confirm('Cancel this order? This action cannot be undone.')) return

  try {
    const { error } = await supabase
      .from('orders')
      .update({
        status: 'cancelled',
        payment_status: 'cancelled',
        delivery_status: 'cancelled',
        updated_at: new Date().toISOString(),
      })
      .eq('id', orderId)

    if (error) throw error

    alert('✅ Order cancelled')
    await fetchOrders()
  } catch (err) {
    console.error('Error cancelling order:', err)
    alert('❌ Failed to cancel order')
  }
}

// Computed: Filtered orders based on selected filter
const filteredOrders = computed(() => {
  if (transactionFilter.value === 'all') {
    return orders.value
  }

  return orders.value.filter((order) => {
    switch (transactionFilter.value) {
      case 'pending':
        return order.payment_status === 'pending' && order.status !== 'cancelled'
      case 'paid':
        return (
          order.payment_status === 'paid' &&
          order.delivery_status !== 'delivered' &&
          order.status !== 'cancelled'
        )
      case 'delivered':
        return order.delivery_status === 'delivered' || order.status === 'delivered'
      case 'cancelled':
        return order.status === 'cancelled' || order.payment_status === 'cancelled'
      default:
        return true
    }
  })
})

// Enhanced status helpers based on your schema
const getStatusText = (order: any): string => {
  // First check if order is cancelled
  if (order.status === 'cancelled' || order.payment_status === 'cancelled') {
    return 'Cancelled ❌'
  }

  // Check payment status
  if (order.payment_status === 'pending') {
    return 'Pending Payment ⏳'
  }

  if (order.payment_status === 'paid') {
    // Check delivery status
    if (order.delivery_status === 'delivered') {
      return 'Delivered ✅'
    }

    if (order.delivery_status === 'shipped') {
      return 'Shipped 🚚'
    }

    if (order.delivery_status === 'pending') {
      return 'Paid - Ready for Dispatch 📦'
    }

    return 'Paid - Processing 📋'
  }

  // Fallback to general status
  if (order.status === 'pending') return 'Order Placed 📝'
  if (order.status === 'paid') return 'Payment Confirmed 💳'
  if (order.status === 'shipped') return 'On the Way 🚚'
  if (order.status === 'delivered') return 'Delivered ✅'

  return 'Processing 🔄'
}

const getStatusColor = (order: any): string => {
  if (order.status === 'cancelled' || order.payment_status === 'cancelled') {
    return 'error'
  }

  if (order.payment_status === 'paid' && order.delivery_status === 'delivered') {
    return 'success'
  }

  if (order.payment_status === 'paid') {
    return 'primary'
  }

  if (order.payment_status === 'pending') {
    return 'warning'
  }

  // Fallback to general status colors
  if (order.status === 'delivered') return 'success'
  if (order.status === 'shipped') return 'info'
  if (order.status === 'paid') return 'primary'
  if (order.status === 'pending') return 'warning'

  return 'grey'
}

const getStatusIcon = (order: any): string => {
  if (order.status === 'cancelled' || order.payment_status === 'cancelled') {
    return 'mdi-cancel'
  }

  if (order.payment_status === 'paid' && order.delivery_status === 'delivered') {
    return 'mdi-check-circle'
  }

  if (order.payment_status === 'paid' && order.delivery_status === 'shipped') {
    return 'mdi-truck'
  }

  if (order.payment_status === 'paid') {
    return 'mdi-check'
  }

  if (order.payment_status === 'pending') {
    return 'mdi-clock-outline'
  }

  // Fallback to general status icons
  if (order.status === 'delivered') return 'mdi-check-circle'
  if (order.status === 'shipped') return 'mdi-truck'
  if (order.status === 'paid') return 'mdi-check'
  if (order.status === 'pending') return 'mdi-clock-outline'

  return 'mdi-help-circle'
}

const formatDate = (dateString: string) => {
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const formatPaymentInfo = (order: any): string => {
  if (!order.payments || order.payments.length === 0) {
    return 'No payment information'
  }

  const payment = order.payments[0]
  return `${payment.method || 'Unknown'} - ${payment.status || 'Unknown'}`
}

const getPaymentStatus = (order: any): string => {
  if (order.payment_status === 'paid') {
    const payment = order.payments?.[0]
    if (payment?.transaction_id) {
      return `Transaction ID: ${payment.transaction_id}`
    }
    return 'Paid'
  }

  if (order.payment_status === 'pending') {
    return 'Awaiting Payment'
  }

  return order.payment_status || 'Unknown'
}

const getMainImage = (imgUrls: any): string => {
  if (!imgUrls) return '/placeholder-product.png'

  if (Array.isArray(imgUrls)) {
    return imgUrls[0] || '/placeholder-product.png'
  }

  if (typeof imgUrls === 'string') {
    try {
      const parsed = JSON.parse(imgUrls)
      return Array.isArray(parsed) ? parsed[0] : parsed
    } catch {
      return imgUrls
    }
  }

  return '/placeholder-product.png'
}

// Enhanced address formatting
const formatFullAddress = (address: any): string => {
  if (!address) {
    return 'Address not available'
  }

  try {
    const parts = [
      address.house_no,
      address.building,
      address.street,
      address.purok,
      address.barangay_name,
      address.city_name,
      address.province_name,
      address.region_name,
      address.postal_code,
    ].filter((part) => part && part.trim() !== '' && part !== 'null' && part !== 'undefined')

    return parts.join(', ') || 'Address details incomplete'
  } catch (error) {
    console.error('❌ Error formatting address:', error, address)
    return 'Error loading address'
  }
}

// Fetch shop data
const fetchShopData = async () => {
  try {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) throw new Error('User not logged in')

    const { data, error } = await supabase
      .from('shops')
      .select(
        'id, business_name, description, logo_url, physical_store, open_time, close_time, barangay, building, street, house_no, postal, manual_status, open_days',
      )
      .eq('owner_id', user.id)
      .maybeSingle()

    if (error) throw error

    console.log('🏪 Shop info:', data)

    // Store the shop ID
    shopId.value = data?.id || null

    // Assign values to display
    businessName.value = data?.business_name || 'No shop name'
    description.value = data?.description || 'No description provided'

    // Convert times to 12-hour format
    timeOpen.value = convertTo12Hour(data?.open_time) || 'Not set'
    timeClose.value = convertTo12Hour(data?.close_time) || 'Not set'

    businessAvatar.value = data?.logo_url || ''
    coverPhoto.value = data?.physical_store || ''
    manualStatus.value = data?.manual_status || 'auto'

    // Build full address string
    address.value = [
      data?.house_no,
      data?.building,
      data?.street,
      data?.barangay,
      'Butuan City',
      'Agusan del Norte',
      'CARAGA',
      data?.postal,
    ]
      .filter(Boolean)
      .join(', ')

    // Fetch orders after shop data is loaded
    if (shopId.value) {
      await fetchOrders()
    }
  } catch (err) {
    console.error('❌ Error loading shop info:', err.message, err)
  }
}

const getOrderItemImage = (orderItem: any): string => {
  // Try variety image first
  if (orderItem.variety_data?.images && orderItem.variety_data.images.length > 0) {
    const varietyImg = orderItem.variety_data.images[0]
    if (varietyImg && varietyImg !== '/placeholder.png') {
      return varietyImg
    }
  }

  // Try product main image
  if (orderItem.product?.main_img_urls) {
    if (Array.isArray(orderItem.product.main_img_urls)) {
      return orderItem.product.main_img_urls[0] || '/placeholder-product.png'
    }

    if (typeof orderItem.product.main_img_urls === 'string') {
      try {
        const parsed = JSON.parse(orderItem.product.main_img_urls)
        return Array.isArray(parsed) ? parsed[0] : parsed
      } catch {
        return orderItem.product.main_img_urls
      }
    }
  }

  return '/placeholder-product.png'
}

const getProductDisplayName = (orderItem: any): string => {
  if (!orderItem || !orderItem.product) {
    return 'Product not available'
  }

  let productName = orderItem.product.prod_name || 'Unnamed Product'

  // Add variety information if available
  if (orderItem.selected_variety) {
    productName += ` - ${orderItem.selected_variety}`
  }

  // Add size information if available
  if (orderItem.selected_size) {
    productName += ` (Size: ${orderItem.selected_size})`
  }

  return productName
}

const getProductPrice = (orderItem: any): number => {
  return orderItem.price || orderItem.product?.price || 0
}

const getProductSubtotal = (orderItem: any): number => {
  const price = getProductPrice(orderItem)
  const quantity = orderItem.quantity || 1
  return price * quantity
}

// Function to toggle between manual open/closed and auto mode
const toggleShopStatus = async () => {
  try {
    loading.value = true

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()
    if (userError || !user) throw new Error('User not logged in')

    let newStatus: 'open' | 'closed' | 'auto'

    // Determine next status based on current status
    if (manualStatus.value === 'auto') {
      newStatus = 'open'
    } else if (manualStatus.value === 'open') {
      newStatus = 'closed'
    } else {
      newStatus = 'auto'
    }

    const { data, error } = await supabase.rpc('update_shop_status', {
      p_owner_id: user.id,
      p_manual_status: newStatus,
    })

    if (error) throw error

    if (!data || !data.success) {
      throw new Error('Update failed')
    }

    manualStatus.value = newStatus

    const statusMessages = {
      open: '✅ Shop is now manually set to OPEN',
      closed: '🔒 Shop is now manually set to CLOSED',
      auto: '🤖 Shop status is now AUTOMATIC (based on business hours)',
    }
    alert(statusMessages[newStatus])
  } catch (err) {
    console.error('Error updating shop status:', err)
    alert('❌ Failed to update shop status: ' + err.message)
  } finally {
    loading.value = false
  }
}

// Helper to get current status display
const getCurrentStatusDisplay = () => {
  if (manualStatus.value === 'open')
    return {
      text: '🟢 Manually Open',
      color: 'success',
      icon: 'mdi-store-check',
      buttonText: 'Switch to Closed',
      buttonColor: 'red-darken-2',
    }
  if (manualStatus.value === 'closed')
    return {
      text: '🔴 Manually Closed',
      color: 'error',
      icon: 'mdi-store-remove',
      buttonText: 'Switch to Auto Mode',
      buttonColor: 'blue-darken-2',
    }
  return {
    text: '🤖 Auto (Based on Hours)',
    color: 'primary',
    icon: 'mdi-clock',
    buttonText: 'Switch to Open',
    buttonColor: 'green-darken-2',
  }
}

// Check if shop is currently open based on hours
const isShopCurrentlyOpen = () => {
  if (manualStatus.value === 'open') return true
  if (manualStatus.value === 'closed') return false

  const now = new Date()
  const currentHour = now.getHours()
  return currentHour >= 8 && currentHour < 20
}

// Delete shop
const deleteShop = async () => {
  if (
    !confirm(
      '🚨 Are you sure you want to delete your shop? This action cannot be undone and all your products and orders will be lost.',
    )
  ) {
    return
  }

  try {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()
    if (userError || !user) throw new Error('User not found')

    const { error } = await supabase.from('shops').delete().eq('owner_id', user.id)

    if (error) throw error

    // Clean up images if they exist
    if (businessAvatar.value) {
      try {
        const oldPath = businessAvatar.value.split('/storage/v1/object/public/Profile/')[1]
        if (oldPath) {
          await supabase.storage.from('Profile').remove([oldPath])
        }
      } catch (storageError) {
        console.warn('Could not delete avatar image:', storageError)
      }
    }

    // Reset all state
    shopId.value = null
    businessAvatar.value = ''
    coverPhoto.value = ''
    businessName.value = ''
    description.value = ''
    timeOpen.value = ''
    timeClose.value = ''
    address.value = ''
    manualStatus.value = 'auto'

    alert('✅ Shop deleted successfully')
    router.push('/')
  } catch (err) {
    console.error('Delete shop error:', err)
    alert('❌ Failed to delete shop: ' + err.message)
  }
}

onMounted(() => {
  fetchShopData()
})

// Edit shop
const editShop = () => {
  if (!shopId.value) {
    alert('❌ Shop ID not found. Please try again.')
    return
  }

  router.push({
    name: 'shop-build',
    params: { id: shopId.value },
  })
}

// Navigate to products
const goToProducts = () => {
  router.push('/productlist')
}

// Refresh orders
const refreshOrders = () => {
  fetchOrders()
}

// Watch for shopId changes to fetch orders
watch(shopId, (newShopId) => {
  if (newShopId) {
    fetchOrders()
  }
})

// View in map
const viewInMap = (orderId: string) => {
  router.push({
    name: 'order-map',
    params: { id: orderId },
  })
}

// Helper to get display transaction number
const getTransactionNumber = (order: any): string => {
  if (order.transaction_number) {
    return order.transaction_number
  }

  // Fallback to order ID if no transaction number
  if (order.id) {
    return `ORDER-${order.id.substring(0, 8).toUpperCase()}`
  }

  return 'No Transaction Number'
}
</script>

<template>
  <v-app>
    <!-- Top Bar -->
    <v-app-bar class="top-bar" flat color="primary" dark elevation="4">
      <v-btn icon @click="goBack" class="mr-2">
        <v-icon>mdi-arrow-left</v-icon>
      </v-btn>
      <v-toolbar-title class="text-h6 font-weight-bold">My Shop</v-toolbar-title>
      <v-spacer></v-spacer>

      <!-- Refresh Button -->
      <v-btn icon @click="refreshOrders" class="mr-2" :loading="loadingOrders">
        <v-icon>mdi-refresh</v-icon>
      </v-btn>

      <!-- Dropdown menu -->
      <v-menu>
        <template #activator="{ props }">
          <v-btn icon v-bind="props" class="ml-2">
            <v-icon>mdi-dots-vertical</v-icon>
          </v-btn>
        </template>

        <v-list density="compact">
          <v-list-item @click="editShop" class="text-primary">
            <template #prepend>
              <v-icon color="primary">mdi-pencil</v-icon>
            </template>
            <v-list-item-title class="text-primary">Edit Shop</v-list-item-title>
          </v-list-item>

          <v-list-item @click="deleteShop" class="text-error">
            <template #prepend>
              <v-icon color="error">mdi-delete</v-icon>
            </template>
            <v-list-item-title class="text-error">Delete Shop</v-list-item-title>
          </v-list-item>
        </v-list>
      </v-menu>
    </v-app-bar>

    <v-main class="background-gradient">
      <!-- Cover + Logo -->
      <v-container class="pa-0 cover-container">
        <!-- Cover Photo -->
        <v-img
          v-if="coverPhoto"
          :src="coverPhoto"
          height="200"
          cover
          class="cover-photo"
          gradient="to bottom, rgba(0,0,0,0.2), rgba(0,0,0,0.6)"
        />
        <div v-else class="cover-placeholder">
          <v-icon size="64" color="white">mdi-store-front</v-icon>
        </div>

        <!-- Avatar overlapping cover -->
        <div class="avatar-wrapper">
          <v-avatar size="100" class="avatar-border elevation-6">
            <v-img v-if="businessAvatar" :src="businessAvatar" cover />
            <v-icon v-else size="48" color="primary">mdi-store</v-icon>
          </v-avatar>
        </div>
      </v-container>

      <!-- Business Info Section -->
      <v-container class="py-2">
        <v-card class="business-card elevation-4" rounded="xl">
          <v-card-text class="text-center pa-6">
            <h2 class="text-h5 font-weight-bold text-primary mb-2">{{ businessName }}</h2>
            <p class="text-body-1 text-medium-emphasis mb-4">{{ description }}</p>

            <!-- Business Info Grid -->
            <v-row class="mb-4">
              <v-col cols="12" sm="6">
                <v-card variant="outlined" class="info-card pa-3" rounded="lg">
                  <div class="d-flex align-center">
                    <v-icon color="primary" class="mr-3">mdi-clock-outline</v-icon>
                    <div class="text-left">
                      <div class="text-caption text-medium-emphasis">Business Hours</div>
                      <div class="text-body-2 font-weight-medium">
                        {{ timeOpen }} - {{ timeClose }}
                      </div>
                    </div>
                  </div>
                </v-card>
              </v-col>
              <v-col cols="12" sm="6">
                <v-card variant="outlined" class="info-card pa-3" rounded="lg">
                  <div class="d-flex align-center">
                    <v-icon color="primary" class="mr-3">mdi-map-marker</v-icon>
                    <div class="text-left">
                      <div class="text-caption text-medium-emphasis">Location</div>
                      <div class="text-body-2 font-weight-medium text-truncate">{{ address }}</div>
                    </div>
                  </div>
                </v-card>
              </v-col>
            </v-row>

            <!-- Shop Status Control -->
            <v-card class="status-card pa-4 mb-4" variant="outlined" rounded="lg">
              <div class="text-center">
                <div class="d-flex align-center justify-center mb-3">
                  <v-icon :color="getCurrentStatusDisplay().color" class="mr-2">
                    {{ getCurrentStatusDisplay().icon }}
                  </v-icon>
                  <span class="text-h6 font-weight-medium">{{
                    getCurrentStatusDisplay().text
                  }}</span>
                </div>

                <v-btn
                  :color="getCurrentStatusDisplay().buttonColor"
                  :loading="loading"
                  @click="toggleShopStatus"
                  class="status-toggle-btn"
                  size="large"
                  rounded="lg"
                  variant="flat"
                  block
                >
                  <v-icon start>{{ getCurrentStatusDisplay().icon }}</v-icon>
                  {{ getCurrentStatusDisplay().buttonText }}
                </v-btn>

                <p class="text-caption text-medium-emphasis mt-3">
                  {{
                    manualStatus === 'auto'
                      ? `🤖 Status automatically determined by your business hours. Currently: ${isShopCurrentlyOpen() ? '🟢 OPEN' : '🔴 CLOSED'}`
                      : '🎛️ Status manually overridden'
                  }}
                </p>
              </div>
            </v-card>
          </v-card-text>
        </v-card>
      </v-container>

      <!-- Quick Actions Section -->
      <v-container class="py-2">
        <v-row>
          <v-col cols="12">
            <v-btn
              @click="goToProducts"
              color="secondary"
              size="x-large"
              class="action-btn"
              rounded="xl"
              variant="flat"
              block
              height="60"
            >
              <v-icon start size="28">mdi-package-variant</v-icon>
              <div class="text-left">
                <div class="text-h6 font-weight-bold">Product Management</div>
                <div class="text-caption">Manage your inventory and products</div>
              </div>
              <v-icon end>mdi-chevron-right</v-icon>
            </v-btn>
          </v-col>
        </v-row>
      </v-container>

      <!-- Orders Section -->
      <v-container class="py-4">
        <v-card class="elevation-2" rounded="xl">
          <v-card-title class="d-flex align-center pa-4">
            <v-icon color="primary" class="mr-3">mdi-shopping</v-icon>
            <span class="text-h5 font-weight-bold">Customer Orders</span>
            <v-spacer></v-spacer>
            <v-chip color="primary" variant="flat">
              {{ filteredOrders.length }} order{{ filteredOrders.length !== 1 ? 's' : '' }}
            </v-chip>
          </v-card-title>

          <v-card-text class="pa-4">
            <!-- Filter -->
            <v-select
              v-model="transactionFilter"
              :items="transactionOptions"
              item-title="title"
              item-value="value"
              label="Filter Orders"
              variant="outlined"
              density="comfortable"
              prepend-icon="mdi-filter"
              class="mb-6"
              rounded="lg"
            />

            <!-- Orders Loading State -->
            <div v-if="loadingOrders" class="text-center py-12">
              <v-progress-circular indeterminate color="primary" size="64" />
              <p class="mt-4 text-body-1 text-medium-emphasis">Loading orders...</p>
            </div>

            <!-- Orders Error State -->
            <v-alert v-else-if="ordersError" type="error" class="mb-4" rounded="lg">
              <div class="d-flex align-center">
                <v-icon class="mr-3">mdi-alert-circle</v-icon>
                <div>{{ ordersError }}</div>
                <v-spacer></v-spacer>
                <v-btn variant="text" color="white" @click="fetchOrders" class="ml-2">
                  <v-icon>mdi-refresh</v-icon>
                  Retry
                </v-btn>
              </div>
            </v-alert>

            <!-- No Orders State -->
            <div v-else-if="filteredOrders.length === 0" class="text-center py-16">
              <v-icon size="96" color="grey-lighten-2" class="mb-4">mdi-cart-off</v-icon>
              <h3 class="text-h5 text-grey mb-2">No orders found</h3>
              <p class="text-body-1 text-grey-lighten-1 mb-4">
                {{
                  transactionFilter === 'all'
                    ? "You haven't received any orders yet."
                    : `No ${transactionFilter} orders found.`
                }}
              </p>
              <v-btn @click="refreshOrders" color="primary" variant="outlined">
                <v-icon start>mdi-refresh</v-icon>
                Refresh
              </v-btn>
            </div>

            <!-- Orders List -->
            <div v-else class="orders-container">
              <v-card
                v-for="order in filteredOrders"
                :key="order.id"
                class="mb-6 order-card elevation-2"
                rounded="xl"
              >
                <v-card-text class="pa-6">
                  <!-- Order Header -->
                  <div class="d-flex justify-space-between align-start mb-4">
                    <div>
                      <h4 class="text-h6 font-weight-bold text-primary">
                        Order #: {{ getTransactionNumber(order) }}
                      </h4>
                      <div class="d-flex align-center flex-wrap gap-2 mt-1">
                        <p class="text-caption text-medium-emphasis mb-0">
                          <v-icon small class="mr-1">mdi-calendar</v-icon>
                          {{ formatDate(order.created_at) }}
                        </p>
                        <v-divider vertical></v-divider>
                        <p class="text-caption text-medium-emphasis mb-0">
                          <v-icon small class="mr-1">mdi-receipt</v-icon>
                          Order ID: {{ order.id.substring(0, 8) }}...
                        </p>
                      </div>
                    </div>
                    <div class="text-right">
                      <v-chip :color="getStatusColor(order)" size="small" variant="flat">
                        <v-icon start small>{{ getStatusIcon(order) }}</v-icon>
                        {{ getStatusText(order) }}
                      </v-chip>
                      <div class="mt-1">
                        <p class="text-caption text-medium-emphasis">
                          Total:
                          <span class="font-weight-bold"
                            >₱{{ order.total_amount?.toLocaleString() || '0' }}</span
                          >
                        </p>
                      </div>
                    </div>
                  </div>

                  <!-- Customer Info -->
                  <v-card variant="outlined" class="customer-card pa-4 mb-4" rounded="lg">
                    <div class="d-flex align-center mb-3">
                      <v-avatar size="48" color="primary" class="mr-3">
                        <v-img
                          v-if="order.user?.avatar_url"
                          :src="order.user.avatar_url"
                          alt="Customer"
                        />
                        <span v-else class="text-white text-h6">
                          {{ order.user?.first_name?.[0] }}{{ order.user?.last_name?.[0] }}
                        </span>
                      </v-avatar>
                      <div>
                        <h5 class="text-subtitle-1 font-weight-bold mb-1">Customer Information</h5>
                        <p class="text-caption text-medium-emphasis mb-0">
                          {{ order.user?.first_name }} {{ order.user?.last_name }}
                        </p>
                      </div>
                    </div>

                    <v-divider class="my-3"></v-divider>

                    <v-row class="customer-details">
                      <v-col cols="12" sm="6" class="pb-1">
                        <div class="d-flex align-center mb-2">
                          <v-icon size="18" class="mr-2 text-primary">mdi-phone</v-icon>
                          <span class="text-caption font-weight-medium">Contact:</span>
                        </div>
                        <p class="text-body-2 ml-4 mb-3">
                          {{ order.address?.phone || order.user?.phone || 'N/A' }}
                        </p>
                      </v-col>

                      <v-col cols="12" sm="6" class="pb-1">
                        <div class="d-flex align-center mb-2">
                          <v-icon size="18" class="mr-2 text-primary">mdi-truck</v-icon>
                          <span class="text-caption font-weight-medium">Delivery Option:</span>
                        </div>
                        <p class="text-body-2 ml-4 mb-3">
                          {{ order.delivery_option || 'Not specified' }}
                        </p>
                      </v-col>

                      <v-col cols="12" sm="6" class="pb-1">
                        <div class="d-flex align-center mb-2">
                          <v-icon size="18" class="mr-2 text-primary">mdi-calendar-clock</v-icon>
                          <span class="text-caption font-weight-medium">Delivery Schedule:</span>
                        </div>
                        <p class="text-body-2 ml-4 mb-3">
                          {{
                            order.delivery_date
                              ? new Date(order.delivery_date).toLocaleDateString('en-US', {
                                  weekday: 'short',
                                  year: 'numeric',
                                  month: 'short',
                                  day: 'numeric',
                                })
                              : 'Not set'
                          }}
                          at
                          {{
                            order.delivery_time ? convertTo12Hour(order.delivery_time) : 'Not set'
                          }}
                        </p>
                      </v-col>
                    </v-row>

                    <!-- Enhanced Address Display -->
                    <v-alert
                      v-if="order.address"
                      type="info"
                      density="compact"
                      class="mt-3"
                      rounded="lg"
                    >
                      <div class="d-flex align-start mb-2">
                        <v-icon color="info" class="mr-2 mt-1">mdi-map-marker</v-icon>
                        <div class="flex-grow-1">
                          <strong class="text-info">Delivery Address:</strong><br />
                          {{ formatFullAddress(order.address) }}
                        </div>
                      </div>

                      <v-btn
                        color="primary"
                        size="x-small"
                        variant="flat"
                        @click="viewInMap(order.id)"
                        rounded="lg"
                        block
                        class="mt-2"
                      >
                        <v-icon start small>mdi-map</v-icon>
                        View in Map
                      </v-btn>
                    </v-alert>
                    <v-alert
                      v-else-if="order.address_id"
                      type="warning"
                      density="compact"
                      class="mt-3"
                      rounded="lg"
                    >
                      <div class="d-flex align-start">
                        <v-icon color="warning" class="mr-2 mt-1">mdi-map-marker-alert</v-icon>
                        <div>
                          <strong>Address Issue:</strong><br />
                          Address ID exists but data couldn't be loaded.
                        </div>
                      </div>
                    </v-alert>
                    <v-alert v-else type="warning" density="compact" class="mt-3" rounded="lg">
                      <div class="d-flex align-start">
                        <v-icon color="warning" class="mr-2 mt-1">mdi-map-marker-off</v-icon>
                        <div>
                          <strong>No Address Information</strong><br />
                          This order doesn't have an address associated with it.
                        </div>
                      </div>
                    </v-alert>

                    <!-- Payment Information -->
                    <v-divider class="my-3"></v-divider>
                    <div class="payment-info mb-3">
                      <h6 class="text-subtitle-2 font-weight-bold mb-2">Payment Information</h6>
                      <v-row>
                        <v-col cols="12" sm="6">
                          <div class="d-flex align-center mb-2">
                            <v-icon size="18" class="mr-2 text-primary">mdi-credit-card</v-icon>
                            <span class="text-caption font-weight-medium">Payment Method:</span>
                          </div>
                          <p class="text-body-2 ml-4">
                            {{ order.payment_method || 'Not specified' }}
                          </p>
                        </v-col>
                        <v-col cols="12" sm="6">
                          <div class="d-flex align-center mb-2">
                            <v-icon size="18" class="mr-2 text-primary">mdi-cash</v-icon>
                            <span class="text-caption font-weight-medium">Payment Status:</span>
                          </div>
                          <p class="text-body-2 ml-4">
                            {{ getPaymentStatus(order) }}
                          </p>
                        </v-col>
                      </v-row>
                      
                      <!-- Show transaction details if available 
                      <div v-if="order.payments && order.payments.length > 0">
                        <v-row>
                          <v-col cols="12" sm="6">
                            <div class="d-flex align-center mb-2">
                              <v-icon size="18" class="mr-2 text-primary">mdi-receipt</v-icon>
                              <span class="text-caption font-weight-medium">Transaction ID:</span>
                            </div>
                            <p class="text-body-2 ml-4">
                              {{ order.payments[0].transaction_id || 'N/A' }}
                            </p>
                          </v-col>
                          <v-col cols="12" sm="6">
                            <div class="d-flex align-center mb-2">
                              <v-icon size="18" class="mr-2 text-primary">mdi-calendar</v-icon>
                              <span class="text-caption font-weight-medium">Payment Date:</span>
                            </div>
                            <p class="text-body-2 ml-4">
                              {{ order.payments[0].payment_date ? formatDate(order.payments[0].payment_date) : 'N/A' }}
                            </p>
                          </v-col>
                        </v-row>
                      </div>
                    -->
                      <!-- Show amount if available -->
                      <div v-if="order.payments && order.payments.length > 0 && order.payments[0].amount">
                        <div class="d-flex align-center mb-2">
                          <v-icon size="18" class="mr-2 text-primary">mdi-cash-multiple</v-icon>
                          <span class="text-caption font-weight-medium">Amount Paid:</span>
                        </div>
                        <p class="text-body-2 ml-4">
                          ₱{{ order.payments[0].amount?.toLocaleString() || '0' }}
                        </p>
                      </div>
                    </div>
                  </v-card>

                  <!-- Order Items -->
                  <div class="order-items-section mb-4">
                    <h5 class="text-subtitle-1 font-weight-bold mb-3">
                      Order Items ({{ order.order_items?.length || 0 }})
                    </h5>

                    <!-- No items state -->
                    <v-alert
                      v-if="!order.order_items || order.order_items.length === 0"
                      type="warning"
                      density="compact"
                      class="mb-3"
                      rounded="lg"
                    >
                      <div class="d-flex align-start">
                        <v-icon color="warning" class="mr-2 mt-1">mdi-alert</v-icon>
                        <div>
                          <strong>No Order Items Found</strong><br />
                          <small>This could be due to RLS policies or missing data.</small>
                        </div>
                      </div>
                    </v-alert>

                    <!-- Order items list -->
                    <div
                      v-for="orderItem in order.order_items"
                      :key="orderItem.id"
                      class="order-item-details"
                    >
                      <v-card variant="outlined" class="mb-3 order-item-card" rounded="lg">
                        <v-card-text class="pa-3">
                          <div class="d-flex align-start">
                            <v-img
                              :src="getOrderItemImage(orderItem)"
                              width="80"
                              height="80"
                              cover
                              class="rounded-lg mr-3 product-image elevation-1"
                              :alt="getProductDisplayName(orderItem)"
                            />
                            <div class="flex-grow-1">
                              <div class="d-flex justify-space-between align-start">
                                <div>
                                  <h6 class="text-body-1 font-weight-medium mb-1">
                                    {{ getProductDisplayName(orderItem) }}
                                  </h6>

                                  <!-- Product Variants -->
                                  <div
                                    v-if="orderItem.selected_size || orderItem.selected_variety"
                                    class="mb-2"
                                  >
                                    <v-chip
                                      v-if="orderItem.selected_size"
                                      size="x-small"
                                      class="mr-1 mb-1"
                                      color="primary"
                                      variant="outlined"
                                    >
                                      Size: {{ orderItem.selected_size }}
                                    </v-chip>
                                    <v-chip
                                      v-if="orderItem.selected_variety"
                                      size="x-small"
                                      color="secondary"
                                      variant="outlined"
                                    >
                                      {{ orderItem.selected_variety }}
                                    </v-chip>
                                  </div>

                                  <!-- Product Description -->
                                  <p
                                    v-if="orderItem.product?.prod_description"
                                    class="text-caption text-medium-emphasis mb-2"
                                  >
                                    {{ orderItem.product.prod_description.substring(0, 100) }}...
                                  </p>
                                </div>

                                <!-- Price -->
                                <div class="text-right">
                                  <p class="text-caption text-medium-emphasis mb-1">Unit Price</p>
                                  <p class="text-body-1 font-weight-bold text-primary">
                                    ₱{{ getProductPrice(orderItem).toLocaleString() }}
                                  </p>
                                </div>
                              </div>

                              <!-- Quantity and Subtotal -->
                              <div class="d-flex justify-space-between align-center mt-2">
                                <div>
                                  <span class="text-caption text-medium-emphasis mr-3"
                                    >Quantity:</span
                                  >
                                  <span class="text-body-2 font-weight-medium">{{
                                    orderItem.quantity || 1
                                  }}</span>
                                </div>
                                <div>
                                  <span class="text-caption text-medium-emphasis mr-2"
                                    >Subtotal:</span
                                  >
                                  <span class="text-body-1 font-weight-bold text-primary">
                                    ₱{{ getProductSubtotal(orderItem).toLocaleString() }}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </div>
                        </v-card-text>
                      </v-card>
                    </div>

                    <!-- Enhanced Order Summary -->
                    <v-card variant="outlined" class="mt-4 summary-card" rounded="lg">
                      <v-card-text class="pa-4">
                        <v-row class="mb-3">
                          <v-col cols="12" sm="6">
                            <div class="text-left">
                              <h6 class="text-subtitle-1 font-weight-bold mb-2">Order Summary</h6>
                              <div class="text-caption text-medium-emphasis">
                                <div class="d-flex justify-space-between mb-1">
                                  <span>Transaction #:</span>
                                  <span class="font-weight-medium">{{ getTransactionNumber(order) }}</span>
                                </div>
                                <div class="d-flex justify-space-between mb-1">
                                  <span>Order Date:</span>
                                  <span>{{ formatDate(order.created_at) }}</span>
                                </div>
                                <div class="d-flex justify-space-between mb-1">
                                  <span>Items:</span>
                                  <span>{{ order.order_items?.length || 0 }}</span>
                                </div>
                                <div class="d-flex justify-space-between mb-1">
                                  <span>Total Units:</span>
                                  <span>
                                    {{
                                      order.order_items?.reduce(
                                        (total: number, item: any) => total + (item.quantity || 1),
                                        0,
                                      ) || 0
                                    }}
                                  </span>
                                </div>
                                <div class="d-flex justify-space-between mb-1">
                                  <span>Payment Method:</span>
                                  <span>{{ order.payment_method || 'Not specified' }}</span>
                                </div>
                                <div class="d-flex justify-space-between">
                                  <span>Delivery Option:</span>
                                  <span>{{ order.delivery_option || 'Not specified' }}</span>
                                </div>
                              </div>
                            </div>
                          </v-col>
                          <v-col cols="12" sm="6">
                            <div class="text-right">
                              <h6 class="text-subtitle-2 text-medium-emphasis mb-2">
                                Total Amount
                              </h6>
                              <h4 class="text-h4 font-weight-bold text-primary">
                                ₱{{ order.total_amount?.toLocaleString() || '0' }}
                              </h4>
                              <p class="text-caption text-medium-emphasis mt-2">
                                Including all applicable taxes and fees
                              </p>
                              <div class="mt-3">
                                <v-chip size="small" :color="getStatusColor(order)" variant="flat">
                                  <v-icon start small>{{ getStatusIcon(order) }}</v-icon>
                                  {{ getStatusText(order) }}
                                </v-chip>
                              </div>
                            </div>
                          </v-col>
                        </v-row>

                        <!-- Order Timeline -->
                        <v-divider class="my-3"></v-divider>
                        <div class="order-timeline mt-3">
                          <h6 class="text-subtitle-2 font-weight-bold mb-2">Order Timeline</h6>
                          <div class="timeline">
                            <div class="timeline-item">
                              <v-icon small color="primary">mdi-check-circle</v-icon>
                              <span class="ml-2 text-caption"
                                >Order Placed: {{ formatDate(order.created_at) }}</span
                              >
                            </div>
                            <div
                              v-if="order.updated_at && order.updated_at !== order.created_at"
                              class="timeline-item"
                            >
                              <v-icon small :color="getStatusColor(order)">{{
                                getStatusIcon(order)
                              }}</v-icon>
                              <span class="ml-2 text-caption"
                                >Last Updated: {{ formatDate(order.updated_at) }}</span
                              >
                            </div>
                            <div v-if="order.delivery_date" class="timeline-item">
                              <v-icon small color="info">mdi-calendar</v-icon>
                              <span class="ml-2 text-caption">
                                Scheduled Delivery:
                                {{
                                  new Date(order.delivery_date).toLocaleDateString('en-US', {
                                    weekday: 'short',
                                    year: 'numeric',
                                    month: 'short',
                                    day: 'numeric',
                                  })
                                }}
                                at
                                {{
                                  order.delivery_time ? convertTo12Hour(order.delivery_time) : ''
                                }}
                              </span>
                            </div>
                          </div>
                        </div>
                      </v-card-text>
                    </v-card>
                  </div>

                  <!-- Order Note -->
                  <v-divider class="my-4"></v-divider>
                  <div v-if="order.note" class="order-note mt-3">
                    <v-alert type="info" density="compact" rounded="lg">
                      <div class="d-flex align-start">
                        <v-icon color="info" class="mr-2 mt-1">mdi-message-text</v-icon>
                        <div>
                          <strong class="text-info">Customer Note:</strong><br />
                          {{ order.note }}
                        </div>
                      </div>
                    </v-alert>
                  </div>

                  <div v-else class="text-caption text-medium-emphasis mt-2">
                    <v-icon small class="mr-1">mdi-information</v-icon>
                    No special instructions from customer
                  </div>

                  <!-- Action Buttons -->
                  <v-divider class="my-4"></v-divider>
                  <div class="order-actions">
                    <div class="d-flex flex-wrap gap-2 justify-center justify-sm-start my-2">
                      <!-- Approve Payment Button -->
                      <v-btn
                        color="success"
                        size="small"
                        variant="flat"
                        v-if="order.payment_status === 'pending' && order.status !== 'cancelled'"
                        @click="approvePayment(order.id)"
                        rounded="lg"
                        class="action-button my-2"
                      >
                        <v-icon start small>mdi-check</v-icon>
                        Approve Payment
                      </v-btn>

                      <!-- Mark as Delivered Button -->
                      <v-btn
                        color="info"
                        size="small"
                        variant="flat"
                        v-if="
                          order.payment_status === 'paid' &&
                          order.delivery_status !== 'delivered' &&
                          order.status !== 'cancelled'
                        "
                        @click="markAsDelivered(order.id)"
                        rounded="lg"
                        class="action-button my-2"
                      >
                        <v-icon start small>mdi-truck-check</v-icon>
                        Mark Delivered
                      </v-btn>

                      <!-- Cancel Order Button -->
                      <v-btn
                        color="error"
                        size="small"
                        variant="outlined"
                        v-if="order.status !== 'cancelled' && order.payment_status !== 'cancelled'"
                        @click="cancelOrder(order.id)"
                        rounded="lg"
                        class="action-button my-2"
                      >
                        <v-icon start small>mdi-cancel</v-icon>
                        Cancel Order
                      </v-btn>

                      <!-- View Details Button -->
                      <v-btn
                        color="primary"
                        size="small"
                        variant="outlined"
                        @click="$router.push(`/orderdetails/${order.id}`)"
                        rounded="lg"
                        class="action-button my-2"
                      >
                        <v-icon start small>mdi-eye</v-icon>
                        View Details
                      </v-btn>
                    </div>
                  </div>
                </v-card-text>
              </v-card>
            </div>
          </v-card-text>
        </v-card>
      </v-container>
    </v-main>
  </v-app>
</template>

<style scoped>
.background-gradient {
  background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
  min-height: 100vh;
}

.top-bar {
  padding-top: 19px;
}

.cover-container {
  position: relative;
}

.cover-photo {
  border-radius: 0 0 24px 24px;
}

.cover-placeholder {
  height: 200px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border-radius: 0 0 24px 24px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.avatar-wrapper {
  display: flex;
  justify-content: center;
  margin-top: -50px;
  position: relative;
  z-index: 2;
}

.avatar-border {
  border: 6px solid white;
  background: white;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
}

.business-card {
  margin-top: 20px;
  border: 1px solid #e0e0e0;
}

.info-card {
  transition: all 0.3s ease;
  border: 1px solid #e0e0e0;
  height: 100%;
}

.info-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
  border-color: #438fda;
}

.status-card {
  background: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%);
  border: 1px solid #cbd5e0;
}

.status-toggle-btn {
  min-width: 200px;
  font-weight: 600;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.action-btn {
  background: linear-gradient(135deg, #667eea 0%, #5668af 100%);
  color: white;
  box-shadow: 0 8px 25px rgba(102, 126, 234, 0.3);
  transition: all 0.3s ease;
  border: none;
}

.action-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 12px 35px rgba(102, 126, 234, 0.4);
}

.orders-container {
  max-height: 70vh;
  overflow-y: auto;
  padding-right: 8px;
}

.orders-container::-webkit-scrollbar {
  width: 6px;
}

.orders-container::-webkit-scrollbar-track {
  background: #f1f1f1;
  border-radius: 10px;
}

.orders-container::-webkit-scrollbar-thumb {
  background: #c1c1c1;
  border-radius: 10px;
}

.orders-container::-webkit-scrollbar-thumb:hover {
  background: #a8a8a8;
}

.order-card {
  transition: all 0.3s ease;
  border: 1px solid #e0e0e0;
}

.order-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.15);
  border-color: #438fda;
}

.customer-card {
  background: linear-gradient(135deg, #f0f7ff 0%, #e3f2fd 100%);
  border: 1px solid #bbdefb;
}

.customer-details .v-col {
  padding-bottom: 8px;
}

.order-item-card {
  transition: all 0.2s ease;
  border: 1px solid #f0f0f0;
}

.order-item-card:hover {
  transform: translateX(4px);
  border-color: #438fda;
  background-color: #fafafa;
}

.product-image {
  border: 2px solid #f0f0f0;
  transition: all 0.3s ease;
}

.product-image:hover {
  border-color: #438fda;
  transform: scale(1.05);
}

.order-note {
  background: linear-gradient(135deg, #fff3cd 0%, #ffeaa7 100%);
  border-radius: 12px;
  border-left: 4px solid #ffc107;
}

.summary-card {
  background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%);
  border: 1px solid #dee2e6;
}

.status-chip {
  font-weight: 600;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.order-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.action-button {
  flex: 1 1 auto;
  min-width: 140px;
}

/* Enhanced status colors */
.status-completed {
  background-color: #e8f5e8;
  color: #1b5e20;
  border: 1px solid #4caf50;
}

.status-delivered {
  background-color: #e3f2fd;
  color: #1565c0;
  border: 1px solid #2196f3;
}

.status-pending {
  background-color: #fff3e0;
  color: #e65100;
  border: 1px solid #ff9800;
}

.status-cancelled {
  background-color: #ffebee;
  color: #c62828;
  border: 1px solid #f44336;
}

/* New styles for enhanced order display */
.order-item-details {
  border-left: 3px solid #4285f4;
  background: #f8f9fa;
}

.payment-info {
  background: linear-gradient(135deg, #f1f8ff 0%, #e3f2fd 100%);
  border-radius: 12px;
  padding: 12px;
  margin-top: 8px;
}

/* Enhanced status badges */
.status-badge {
  font-weight: 600;
  padding: 4px 12px;
  border-radius: 20px;
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

/* Responsive adjustments */
@media (max-width: 960px) {
  .avatar-wrapper {
    margin-top: -40px;
  }

  .avatar-border {
    width: 90px !important;
    height: 90px !important;
  }
}

@media (max-width: 768px) {
  .customer-details .v-col {
    padding-bottom: 12px;
  }

  .order-actions {
    justify-content: center;
  }

  .action-button {
    min-width: 120px;
    flex: 0 1 calc(50% - 8px);
  }
}

@media (max-width: 600px) {
  .cover-photo,
  .cover-placeholder {
    height: 160px;
    border-radius: 0 0 16px 16px;
  }

  .avatar-wrapper {
    margin-top: -30px;
  }

  .avatar-border {
    width: 90px !important;
    height: 90px !important;
    border-width: 4px;
  }

  .business-card {
    margin-top: 10px;
  }

  .action-btn {
    height: 50px;
  }

  .order-card {
    margin-bottom: 16px;
  }

  .customer-info p {
    font-size: 0.8rem;
    margin-bottom: 4px;
  }

  .order-actions {
    flex-direction: column;
  }

  .action-button {
    flex: 1 1 100%;
    width: 100%;
  }

  .customer-details .v-col {
    flex: 0 0 100%;
    max-width: 100%;
  }

  .order-item-details .d-flex {
    flex-direction: column;
  }

  .order-item-details .v-img {
    width: 100% !important;
    height: 150px !important;
    margin-bottom: 12px;
  }
}

@media (max-width: 480px) {
  .cover-photo,
  .cover-placeholder {
    height: 140px;
  }

  .avatar-wrapper {
    margin-top: -25px;
  }

  .avatar-border {
    width: 90px !important;
    height: 90px !important;
  }

  .business-card .v-card-text {
    padding: 16px;
  }

  .status-toggle-btn {
    min-width: unset;
  }

  .order-card .v-card-text {
    padding: 16px;
  }
}

/* Animation for loading states */
@keyframes pulse {
  0% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
  100% {
    opacity: 1;
  }
}

.loading-pulse {
  animation: pulse 2s infinite;
}

/* Custom scrollbar for orders */
.orders-container {
  scrollbar-width: thin;
  scrollbar-color: #c1c1c1 #f1f1f1;
}

/* Order Timeline Styles */
.order-timeline {
  background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%);
  border-radius: 8px;
  padding: 12px;
}

.timeline {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.timeline-item {
  display: flex;
  align-items: center;
  padding: 4px 0;
}

.timeline-item .v-icon {
  margin-right: 8px;
}

.timeline-item span {
  font-size: 0.75rem;
}
</style>