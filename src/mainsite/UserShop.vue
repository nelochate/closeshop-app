<script setup lang="ts">
import { ref, onMounted, computed, watch, onUnmounted } from 'vue'
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
const meetupDetails = ref('')

// Orders state
const orders = ref<any[]>([])
const loadingOrders = ref(false)
const ordersError = ref('')

// Mobile state
const isMobile = ref(window.innerWidth < 768)
const activeOrderTab = ref('all')

// Update mobile state on resize
const updateMobileState = () => {
  isMobile.value = window.innerWidth < 768
}

// Transactions - simplified for mobile
const transactionOptions = [
  { title: 'All', value: 'all', icon: 'mdi-format-list-bulleted' },
  { title: 'Pending', value: 'pending', icon: 'mdi-clock-outline' },
  { title: 'Paid', value: 'paid', icon: 'mdi-check-circle' },
  { title: 'Delivered', value: 'delivered', icon: 'mdi-truck-check' },
  { title: 'Cancelled', value: 'cancelled', icon: 'mdi-cancel' },
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

// Enhanced fetchOrders function with error handling for mobile
const fetchOrders = async () => {
  if (!shopId.value) {
    console.log('❌ No shop ID available')
    return
  }

  loadingOrders.value = true
  ordersError.value = ''

  try {
    console.log('🛍️ Fetching orders for shop:', shopId.value)

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

// Order actions with mobile confirmation
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

    alert('✅ Payment approved')
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
    alert('❌ Failed to update status')
  }
}

const cancelOrder = async (orderId: string) => {
  if (!confirm('Cancel this order? This cannot be undone.')) return

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
  if (activeOrderTab.value === 'all') {
    return orders.value
  }

  return orders.value.filter((order) => {
    switch (activeOrderTab.value) {
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

// Mobile-friendly status helpers
const getStatusText = (order: any): string => {
  if (isMobile.value) {
    // Shorter text for mobile
    if (order.status === 'cancelled' || order.payment_status === 'cancelled') {
      return 'Cancelled'
    }
    if (order.payment_status === 'pending') {
      return 'Pending'
    }
    if (order.payment_status === 'paid' && order.delivery_status === 'delivered') {
      return 'Delivered'
    }
    if (order.payment_status === 'paid' && order.delivery_status === 'shipped') {
      return 'Shipped'
    }
    if (order.payment_status === 'paid') {
      return 'Paid'
    }
    return 'Processing'
  }

  // Full text for desktop
  if (order.status === 'cancelled' || order.payment_status === 'cancelled') {
    return 'Cancelled ❌'
  }
  if (order.payment_status === 'pending') {
    return 'Pending Payment ⏳'
  }
  if (order.payment_status === 'paid' && order.delivery_status === 'delivered') {
    return 'Delivered ✅'
  }
  if (order.payment_status === 'paid' && order.delivery_status === 'shipped') {
    return 'Shipped 🚚'
  }
  if (order.payment_status === 'paid' && order.delivery_status === 'pending') {
    return 'Paid - Ready for Dispatch 📦'
  }
  if (order.payment_status === 'paid') {
    return 'Paid - Processing 📋'
  }
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
  if (order.status === 'delivered') return 'mdi-check-circle'
  if (order.status === 'shipped') return 'mdi-truck'
  if (order.status === 'paid') return 'mdi-check'
  if (order.status === 'pending') return 'mdi-clock-outline'
  return 'mdi-help-circle'
}

// Mobile-friendly date formatting
const formatDate = (dateString: string) => {
  const date = new Date(dateString)
  const now = new Date()
  const diffTime = Math.abs(now.getTime() - date.getTime())
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))

  if (diffDays === 0) {
    return 'Today, ' + date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
  } else if (diffDays === 1) {
    return 'Yesterday, ' + date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
  } else if (diffDays < 7) {
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  return isMobile.value
    ? date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
}

const formatPaymentInfo = (order: any): string => {
  if (!order.payments || order.payments.length === 0) {
    return 'No payment info'
  }
  const payment = order.payments[0]
  return `${payment.method || 'Unknown'} - ${payment.status || 'Unknown'}`
}

const getPaymentStatus = (order: any): string => {
  if (order.payment_status === 'paid') {
    const payment = order.payments?.[0]
    if (payment?.transaction_id) {
      return isMobile.value
        ? `ID: ${payment.transaction_id.substring(0, 8)}...`
        : `Transaction ID: ${payment.transaction_id}`
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

// Mobile-friendly address formatting
const formatFullAddress = (address: any): string => {
  if (!address) {
    return 'Address not available'
  }

  try {
    if (isMobile.value) {
      // Short format for mobile
      const shortParts = [address.house_no, address.street, address.barangay_name].filter(
        (part) => part && part.trim() !== '' && part !== 'null' && part !== 'undefined',
      )

      if (shortParts.length > 0) {
        return shortParts.join(', ')
      }
    }

    // Full format for desktop
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

    return parts.join(', ') || 'Address incomplete'
  } catch (error) {
    console.error('❌ Error formatting address:', error, address)
    return 'Error loading address'
  }
}

// Fetch shop data - UPDATED TO INCLUDE meetup_details
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
        'id, business_name, description, logo_url, physical_store, open_time, close_time, barangay, building, street, house_no, postal, manual_status, open_days, meetup_details',
      )
      .eq('owner_id', user.id)
      .maybeSingle()

    if (error) throw error

    console.log('🏪 Shop info:', data)
    shopId.value = data?.id || null
    businessName.value = data?.business_name || 'No shop name'
    description.value = data?.description || 'No description provided'
    timeOpen.value = convertTo12Hour(data?.open_time) || 'Not set'
    timeClose.value = convertTo12Hour(data?.close_time) || 'Not set'
    businessAvatar.value = data?.logo_url || ''
    coverPhoto.value = data?.physical_store || ''
    manualStatus.value = data?.manual_status || 'auto'
    meetupDetails.value = data?.meetup_details || ''

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

    if (shopId.value) {
      await fetchOrders()
    }
  } catch (err) {
    console.error('❌ Error loading shop info:', err.message, err)
  }
}

const getOrderItemImage = (orderItem: any): string => {
  if (orderItem.variety_data?.images && orderItem.variety_data.images.length > 0) {
    const varietyImg = orderItem.variety_data.images[0]
    if (varietyImg && varietyImg !== '/placeholder.png') {
      return varietyImg
    }
  }

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

  if (isMobile.value) {
    // Truncate for mobile
    if (productName.length > 30) {
      productName = productName.substring(0, 27) + '...'
    }
  }

  if (orderItem.selected_variety) {
    productName += ` - ${orderItem.selected_variety}`
  }
  if (orderItem.selected_size) {
    productName += ` (${orderItem.selected_size})`
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
      open: '✅ Shop is now OPEN',
      closed: '🔒 Shop is now CLOSED',
      auto: '🤖 Shop is now AUTOMATIC',
    }
    alert(statusMessages[newStatus])
  } catch (err) {
    console.error('Error updating shop status:', err)
    alert('❌ Failed to update status')
  } finally {
    loading.value = false
  }
}

// Helper to get current status display
const getCurrentStatusDisplay = () => {
  if (manualStatus.value === 'open')
    return {
      text: '🟢 Open',
      color: 'success',
      icon: 'mdi-store-check',
      buttonText: 'Close Shop',
      buttonColor: 'red-darken-2',
    }
  if (manualStatus.value === 'closed')
    return {
      text: '🔴 Closed',
      color: 'error',
      icon: 'mdi-store-remove',
      buttonText: 'Auto Mode',
      buttonColor: 'blue-darken-2',
    }
  return {
    text: '🤖 Auto',
    color: 'primary',
    icon: 'mdi-clock',
    buttonText: 'Open Shop',
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
  if (!confirm('Delete your shop? This cannot be undone.')) {
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

    shopId.value = null
    businessAvatar.value = ''
    coverPhoto.value = ''
    businessName.value = ''
    description.value = ''
    timeOpen.value = ''
    timeClose.value = ''
    address.value = ''
    manualStatus.value = 'auto'
    meetupDetails.value = ''

    alert('✅ Shop deleted')
    router.push('/')
  } catch (err) {
    console.error('Delete shop error:', err)
    alert('❌ Failed to delete shop')
  }
}

onMounted(() => {
  fetchShopData()
  window.addEventListener('resize', updateMobileState)
})

// Cleanup
onUnmounted(() => {
  window.removeEventListener('resize', updateMobileState)
})

// Edit shop
const editShop = () => {
  if (!shopId.value) {
    alert('❌ Shop ID not found')
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
    return isMobile.value && order.transaction_number.length > 12
      ? `${order.transaction_number.substring(0, 10)}...`
      : order.transaction_number
  }

  if (order.id) {
    const shortId = order.id.substring(0, 8).toUpperCase()
    return isMobile.value ? `ORD-${shortId}` : `ORDER-${shortId}`
  }

  return 'No ID'
}

// Function to format delivery option with meetup details - IMPROVED VERSION
const getOrderDeliveryDisplay = (order: any): string => {
  if (!order.delivery_option) return 'Not specified'
  
  // Debug log to see what's in the database
  console.log('DEBUG - Delivery option:', order.delivery_option)
  
  // Normalize the delivery option
  const deliveryOption = order.delivery_option.toLowerCase().trim()
  
  // List of delivery options that should show as "Meetup(place)"
  const meetupVariations = [
    'meetup',
    'pickup',
    'meetup/pickup',
    'pick-up',
    'meet-up',
    'pick up',
    'meet up',
    'self-pickup',
    'self-pick-up',
    'store pickup',
    'in-store pickup'
  ]
  
  // Check if it's a meetup variation
  const isMeetup = meetupVariations.some(variation => 
    deliveryOption === variation || 
    deliveryOption.includes(variation) ||
    deliveryOption.replace(/\s+/g, '') === variation.replace(/\s+/g, '') ||
    deliveryOption.replace(/[-\s]/g, '') === variation.replace(/[-\s]/g, '')
  )
  
  if (isMeetup) {
    const meetupPlace = meetupDetails.value || ''
    
    if (meetupPlace) {
      if (isMobile.value && meetupPlace.length > 15) {
        return `Meetup(${meetupPlace.substring(0, 12)}...)`
      }
      return `Meetup(${meetupPlace})`
    }
    return 'Meetup'
  }
  
  // For non-meetup options, return the original value
  // But clean it up a bit
  const displayOption = order.delivery_option.trim()
  
  // Common delivery option formatting
  const optionMap: Record<string, string> = {
    'delivery': 'Delivery',
    'standard': 'Standard Delivery',
    'standard delivery': 'Standard Delivery',
    'express': 'Express Delivery',
    'express delivery': 'Express Delivery',
    'same day': 'Same Day Delivery',
    'same day delivery': 'Same Day Delivery',
    'next day': 'Next Day Delivery',
    'next day delivery': 'Next Day Delivery',
    'shipping': 'Shipping',
    'door to door': 'Door-to-Door Delivery',
    'door-to-door': 'Door-to-Door Delivery'
  }
  
  // Return formatted version if available, otherwise capitalize first letter
  const formattedOption = optionMap[deliveryOption]
  if (formattedOption) {
    return formattedOption
  }
  
  // Capitalize first letter of each word for display
  return displayOption
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ')
}
</script>

<template>
  <v-app>
    <!-- Top Bar - Mobile Optimized -->
    <v-app-bar
      class="top-bar"
      flat
      color="primary"
      dark
      elevation="2"
      :height="isMobile ? '56' : '64'"
    >
      <v-btn icon @click="goBack" class="mr-1" size="small">
        <v-icon>{{ isMobile ? 'mdi-arrow-left' : 'mdi-arrow-left' }}</v-icon>
      </v-btn>
      <v-toolbar-title class="text-subtitle-1 font-weight-bold">
        {{ isMobile ? 'My Shop' : 'My Shop' }}
      </v-toolbar-title>
      <v-spacer></v-spacer>

      <!-- Refresh Button -->
      <v-btn icon @click="refreshOrders" class="mr-1" :loading="loadingOrders" size="small">
        <v-icon>{{ isMobile ? 'mdi-refresh' : 'mdi-refresh' }}</v-icon>
      </v-btn>

      <!-- Mobile Dropdown -->
      <v-menu :close-on-content-click="true">
        <template #activator="{ props }">
          <v-btn icon v-bind="props" size="small">
            <v-icon>mdi-dots-vertical</v-icon>
          </v-btn>
        </template>
        <v-list density="compact" nav>
          <v-list-item @click="editShop" class="text-primary">
            <template #prepend>
              <v-icon color="primary" size="small">mdi-pencil</v-icon>
            </template>
            <v-list-item-title class="text-caption">Edit Shop</v-list-item-title>
          </v-list-item>
          <v-list-item @click="deleteShop" class="text-error">
            <template #prepend>
              <v-icon color="error" size="small">mdi-delete</v-icon>
            </template>
            <v-list-item-title class="text-caption">Delete Shop</v-list-item-title>
          </v-list-item>
        </v-list>
      </v-menu>
    </v-app-bar>

    <v-main class="background-gradient" :class="{ 'mobile-padding': isMobile }">
      <!-- Cover + Logo - Mobile Optimized -->
      <v-container class="pa-0 cover-container">
        <!-- Cover Photo -->
        <v-img
          v-if="coverPhoto"
          :src="coverPhoto"
          :height="isMobile ? 120 : 160"
          cover
          class="cover-photo"
          gradient="to bottom, rgba(0,0,0,0.2), rgba(0,0,0,0.6)"
        />
        <div v-else class="cover-placeholder" :style="{ height: isMobile ? '120px' : '160px' }">
          <v-icon :size="isMobile ? 48 : 64" color="white">mdi-store-front</v-icon>
        </div>

        <!-- Avatar overlapping cover -->
        <div class="avatar-wrapper" :style="{ marginTop: isMobile ? '-35px' : '-50px' }">
          <v-avatar :size="isMobile ? 70 : 100" class="avatar-border elevation-4">
            <v-img v-if="businessAvatar" :src="businessAvatar" cover />
            <v-icon v-else :size="isMobile ? 32 : 48" color="primary">mdi-store</v-icon>
          </v-avatar>
        </div>
      </v-container>

      <!-- Business Info Section - Mobile Optimized -->
      <v-container :class="isMobile ? 'px-3 py-2' : 'py-2'">
        <v-card class="business-card elevation-2" :rounded="isMobile ? 'lg' : 'xl'">
          <v-card-text :class="isMobile ? 'pa-4' : 'pa-6 text-center'">
            <h2 class="text-subtitle-1 font-weight-bold text-primary mb-1">{{ businessName }}</h2>
            <p class="text-caption text-medium-emphasis mb-3 line-clamp-2">{{ description }}</p>

            <!-- Business Info Grid -->
            <v-row class="mb-3">
              <v-col cols="12" sm="6" class="pb-2">
                <v-card variant="outlined" class="info-card pa-2" :rounded="isMobile ? 'md' : 'lg'">
                  <div class="d-flex align-center">
                    <v-icon color="primary" :size="isMobile ? 18 : 24" class="mr-2"
                      >mdi-clock-outline</v-icon
                    >
                    <div class="text-left">
                      <div class="text-caption text-medium-emphasis">Hours</div>
                      <div class="text-body-2 font-weight-medium">
                        {{ timeOpen }} - {{ timeClose }}
                      </div>
                    </div>
                  </div>
                </v-card>
              </v-col>
              <v-col cols="12" sm="6" class="pb-2">
                <v-card variant="outlined" class="info-card pa-2" :rounded="isMobile ? 'md' : 'lg'">
                  <div class="d-flex align-center">
                    <v-icon color="primary" :size="isMobile ? 18 : 24" class="mr-2"
                      >mdi-map-marker</v-icon
                    >
                    <div class="text-left">
                      <div class="text-caption text-medium-emphasis">Location</div>
                      <div class="text-body-2 font-weight-medium line-clamp-1">{{ address }}</div>
                    </div>
                  </div>
                </v-card>
              </v-col>
            </v-row>

            <!-- Shop Status Control - Mobile Optimized -->
            <v-card
              class="status-card pa-3 mb-3"
              variant="outlined"
              :rounded="isMobile ? 'lg' : 'xl'"
            >
              <div class="text-center">
                <div class="d-flex align-center justify-center mb-2">
                  <v-icon
                    :color="getCurrentStatusDisplay().color"
                    :size="isMobile ? 20 : 24"
                    class="mr-2"
                  >
                    {{ getCurrentStatusDisplay().icon }}
                  </v-icon>
                  <span class="text-body-1 font-weight-medium">{{
                    getCurrentStatusDisplay().text
                  }}</span>
                </div>

                <v-btn
                  :color="getCurrentStatusDisplay().buttonColor"
                  :loading="loading"
                  @click="toggleShopStatus"
                  class="status-toggle-btn"
                  :size="isMobile ? 'small' : 'large'"
                  :rounded="isMobile ? 'md' : 'lg'"
                  variant="flat"
                  block
                >
                  <v-icon :start="!isMobile">{{ getCurrentStatusDisplay().icon }}</v-icon>
                  <span class="ml-1">{{ getCurrentStatusDisplay().buttonText }}</span>
                </v-btn>

                <p class="text-caption text-medium-emphasis mt-2">
                  {{
                    manualStatus === 'auto'
                      ? `Currently: ${isShopCurrentlyOpen() ? '🟢 OPEN' : '🔴 CLOSED'}`
                      : 'Manually overridden'
                  }}
                </p>
              </div>
            </v-card>
          </v-card-text>
        </v-card>
      </v-container>

      <!-- Quick Actions Section -->
      <v-container :class="isMobile ? 'px-3 py-1' : 'py-2'">
        <v-row>
          <v-col cols="12">
            <v-btn
              @click="goToProducts"
              color="secondary"
              :size="isMobile ? 'large' : 'x-large'"
              class="action-btn"
              :rounded="isMobile ? 'lg' : 'xl'"
              variant="flat"
              block
              :height="isMobile ? 50 : 60"
            >
              <v-icon :start="!isMobile" :size="isMobile ? 20 : 28">mdi-package-variant</v-icon>
              <div class="text-left flex-grow-1">
                <div
                  :class="isMobile ? 'text-body-2 font-weight-bold' : 'text-h6 font-weight-bold'"
                >
                  Product Management
                </div>
                <div class="text-caption d-none d-sm-block">Manage your inventory and products</div>
              </div>
              <v-icon end>mdi-chevron-right</v-icon>
            </v-btn>
          </v-col>
        </v-row>
      </v-container>

      <!-- Orders Section - Mobile Optimized -->
      <v-container :class="isMobile ? 'px-3 py-3' : 'py-4'">
        <v-card class="elevation-1" :rounded="isMobile ? 'lg' : 'xl'">
          <v-card-title class="d-flex align-center" :class="isMobile ? 'pa-3' : 'pa-4'">
            <v-icon color="primary" :size="isMobile ? 20 : 24" class="mr-2">mdi-shopping</v-icon>
            <span
              :class="isMobile ? 'text-subtitle-2 font-weight-bold' : 'text-h5 font-weight-bold'"
            >
              Customer Orders
            </span>
            <v-spacer></v-spacer>
            <v-chip color="primary" variant="flat" :size="isMobile ? 'small' : 'default'">
              {{ filteredOrders.length }}
            </v-chip>
          </v-card-title>

          <v-card-text :class="isMobile ? 'pa-3' : 'pa-4'">
            <!-- Mobile Tabs for Order Filter -->
            <v-tabs v-model="activeOrderTab" v-if="isMobile" grow class="mb-4" color="primary">
              <v-tab
                v-for="option in transactionOptions"
                :key="option.value"
                :value="option.value"
                class="text-caption"
              >
                <v-icon :size="16" class="mr-1">{{ option.icon }}</v-icon>
                {{ option.title }}
              </v-tab>
            </v-tabs>

            <!-- Desktop Select for Order Filter -->
            <v-select
              v-else
              v-model="activeOrderTab"
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
            <div v-if="loadingOrders" class="text-center" :class="isMobile ? 'py-8' : 'py-12'">
              <v-progress-circular indeterminate color="primary" :size="isMobile ? 48 : 64" />
              <p class="mt-3 text-body-2 text-medium-emphasis">Loading orders...</p>
            </div>

            <!-- Orders Error State -->
            <v-alert
              v-else-if="ordersError"
              type="error"
              class="mb-3"
              :rounded="isMobile ? 'md' : 'lg'"
            >
              <div class="d-flex align-center">
                <v-icon :size="isMobile ? 18 : 20" class="mr-2">mdi-alert-circle</v-icon>
                <div class="text-caption">{{ ordersError }}</div>
                <v-spacer></v-spacer>
                <v-btn
                  variant="text"
                  color="white"
                  @click="fetchOrders"
                  size="x-small"
                  class="ml-1"
                >
                  Retry
                </v-btn>
              </div>
            </v-alert>

            <!-- No Orders State -->
            <div
              v-else-if="filteredOrders.length === 0"
              :class="isMobile ? 'text-center py-8' : 'text-center py-12'"
            >
              <v-icon :size="isMobile ? 64 : 96" color="grey-lighten-2" class="mb-3"
                >mdi-cart-off</v-icon
              >
              <h3 :class="isMobile ? 'text-subtitle-2 text-grey mb-1' : 'text-h5 text-grey mb-2'">
                No orders found
              </h3>
              <p
                :class="
                  isMobile
                    ? 'text-caption text-grey-lighten-1 mb-3'
                    : 'text-body-1 text-grey-lighten-1 mb-4'
                "
              >
                {{
                  activeOrderTab === 'all'
                    ? "You haven't received any orders yet."
                    : `No ${activeOrderTab} orders.`
                }}
              </p>
              <v-btn
                @click="refreshOrders"
                color="primary"
                variant="outlined"
                :size="isMobile ? 'small' : 'default'"
              >
                <v-icon :start="!isMobile">mdi-refresh</v-icon>
                Refresh
              </v-btn>
            </div>

            <!-- Orders List - Mobile Optimized -->
            <div v-else class="orders-container">
              <v-card
                v-for="order in filteredOrders"
                :key="order.id"
                class="mb-3 order-card elevation-1"
                :rounded="isMobile ? 'lg' : 'xl'"
              >
                <v-card-text :class="isMobile ? 'pa-3' : 'pa-4'">
                  <!-- Order Header - Mobile Optimized -->
                  <div class="d-flex justify-space-between align-start mb-3">
                    <div class="flex-grow-1">
                      <div class="d-flex align-center mb-1">
                        <h4 class="text-subtitle-2 font-weight-bold text-primary mr-2">
                          #{{ getTransactionNumber(order) }}
                        </h4>
                        <v-chip
                          :color="getStatusColor(order)"
                          :size="isMobile ? 'x-small' : 'small'"
                          variant="flat"
                          class="ml-auto"
                        >
                          <v-icon :start="!isMobile" :size="isMobile ? 12 : 14">{{
                            getStatusIcon(order)
                          }}</v-icon>
                          {{ getStatusText(order) }}
                        </v-chip>
                      </div>
                      <div class="d-flex align-center flex-wrap gap-1">
                        <p class="text-caption text-medium-emphasis">
                          <v-icon :size="isMobile ? 12 : 14" class="mr-1">mdi-calendar</v-icon>
                          {{ formatDate(order.created_at) }}
                        </p>
                      </div>
                    </div>
                  </div>

                  <!-- Customer Info - Mobile Collapsible -->
                  <v-expansion-panels v-if="isMobile">
                    <v-expansion-panel elevation="0">
                      <v-expansion-panel-title class="px-0" :hide-actions="true">
                        <template #default="{ expanded }">
                          <div class="d-flex align-center w-100">
                            <v-avatar size="36" color="primary" class="mr-2">
                              <v-img
                                v-if="order.user?.avatar_url"
                                :src="order.user.avatar_url"
                                alt="Customer"
                              />
                              <span v-else class="text-white text-caption">
                                {{ order.user?.first_name?.[0] }}{{ order.user?.last_name?.[0] }}
                              </span>
                            </v-avatar>
                            <div class="flex-grow-1">
                              <div class="text-caption font-weight-medium">
                                {{ order.user?.first_name }} {{ order.user?.last_name }}
                              </div>
                              <div class="text-caption text-medium-emphasis">
                                {{ order.address?.phone || order.user?.phone || 'N/A' }}
                              </div>
                            </div>
                            <v-icon :size="16">{{
                              expanded ? 'mdi-chevron-up' : 'mdi-chevron-down'
                            }}</v-icon>
                          </div>
                        </template>
                      </v-expansion-panel-title>
                      <v-expansion-panel-text class="px-0">
                        <!-- Customer Details Content -->
                        <div class="mt-2">
                          <v-divider class="my-2"></v-divider>

                          <div class="customer-details-mobile">
                            <div class="detail-item mb-2">
                              <v-icon size="14" class="mr-1 text-primary">mdi-truck</v-icon>
                              <span class="text-caption font-weight-medium">Delivery:</span>
                              <span class="text-caption ml-1">{{
                                getOrderDeliveryDisplay(order)
                              }}</span>
                            </div>

                            <div v-if="order.delivery_date" class="detail-item mb-2">
                              <v-icon size="14" class="mr-1 text-primary"
                                >mdi-calendar-clock</v-icon
                              >
                              <span class="text-caption font-weight-medium">Schedule:</span>
                              <span class="text-caption ml-1">
                                {{
                                  new Date(order.delivery_date).toLocaleDateString('en-US', {
                                    month: 'short',
                                    day: 'numeric',
                                  })
                                }}
                                {{
                                  order.delivery_time ? convertTo12Hour(order.delivery_time) : ''
                                }}
                              </span>
                            </div>

                            <div class="detail-item mb-2">
                              <v-icon size="14" class="mr-1 text-primary">mdi-credit-card</v-icon>
                              <span class="text-caption font-weight-medium">Payment:</span>
                              <span class="text-caption ml-1">{{
                                order.payment_method || 'Cash'
                              }}</span>
                            </div>

                            <div class="detail-item">
                              <v-icon size="14" class="mr-1 text-primary">mdi-cash</v-icon>
                              <span class="text-caption font-weight-medium">Status:</span>
                              <span class="text-caption ml-1">{{ getPaymentStatus(order) }}</span>
                            </div>
                          </div>

                          <v-divider class="my-2"></v-divider>

                          <!-- Address Display -->
                          <div v-if="order.address" class="mt-2">
                            <div class="d-flex align-start">
                              <v-icon size="14" class="mr-1 mt-1 text-primary"
                                >mdi-map-marker</v-icon
                              >
                              <div class="text-caption">
                                <strong>Delivery Address:</strong><br />
                                {{ formatFullAddress(order.address) }}
                              </div>
                            </div>
                            <v-btn
                              color="primary"
                              size="x-small"
                              variant="flat"
                              @click="viewInMap(order.id)"
                              rounded="sm"
                              block
                              class="mt-2"
                            >
                              <v-icon start size="12">mdi-map</v-icon>
                              View Map
                            </v-btn>
                          </div>
                        </div>
                      </v-expansion-panel-text>
                    </v-expansion-panel>
                  </v-expansion-panels>

                  <!-- Desktop Customer Info -->
                  <v-card v-else variant="outlined" class="customer-card pa-3 mb-3" rounded="lg">
                    <div class="d-flex align-center mb-2">
                      <v-avatar size="40" color="primary" class="mr-3">
                        <v-img
                          v-if="order.user?.avatar_url"
                          :src="order.user.avatar_url"
                          alt="Customer"
                        />
                        <span v-else class="text-white text-caption">
                          {{ order.user?.first_name?.[0] }}{{ order.user?.last_name?.[0] }}
                        </span>
                      </v-avatar>
                      <div>
                        <div class="text-subtitle-2 font-weight-bold">
                          {{ order.user?.first_name }} {{ order.user?.last_name }}
                        </div>
                        <div class="text-caption text-medium-emphasis">
                          {{ order.address?.phone || order.user?.phone || 'N/A' }}
                        </div>
                      </div>
                    </div>

                    <v-divider class="my-2"></v-divider>

                    <v-row class="text-caption">
                      <v-col cols="6" class="pb-1">
                        <div class="font-weight-medium mb-1">Delivery:</div>
                        <div>{{ getOrderDeliveryDisplay(order) }}</div>
                      </v-col>
                      <v-col cols="6" class="pb-1">
                        <div class="font-weight-medium mb-1">Payment:</div>
                        <div>{{ order.payment_method || 'Cash' }}</div>
                      </v-col>
                    </v-row>

                    <v-divider class="my-2"></v-divider>

                    <div v-if="order.address" class="mt-2">
                      <div class="d-flex align-start mb-1">
                        <v-icon size="16" class="mr-2 mt-1 text-primary">mdi-map-marker</v-icon>
                        <div class="text-caption">
                          <strong>Address:</strong> {{ formatFullAddress(order.address) }}
                        </div>
                      </div>
                      <v-btn
                        color="primary"
                        size="x-small"
                        variant="flat"
                        @click="viewInMap(order.id)"
                        rounded="sm"
                        block
                        class="mt-1"
                      >
                        <v-icon start size="12">mdi-map</v-icon>
                        View in Map
                      </v-btn>
                    </div>
                  </v-card>

                  <!-- Order Items - Mobile Optimized -->
                  <div class="order-items-section mb-3">
                    <h5
                      :class="
                        isMobile
                          ? 'text-caption font-weight-bold mb-2'
                          : 'text-subtitle-1 font-weight-bold mb-3'
                      "
                    >
                      Items ({{ order.order_items?.length || 0 }})
                    </h5>

                    <!-- No items state -->
                    <v-alert
                      v-if="!order.order_items || order.order_items.length === 0"
                      type="warning"
                      density="compact"
                      class="mb-2"
                      :rounded="isMobile ? 'md' : 'lg'"
                    >
                      <div class="d-flex align-start">
                        <v-icon :size="isMobile ? 16 : 18" color="warning" class="mr-2 mt-1"
                          >mdi-alert</v-icon
                        >
                        <div class="text-caption">No order items found</div>
                      </div>
                    </v-alert>

                    <!-- Order items list - Mobile Collapsible -->
                    <v-expansion-panels
                      v-if="isMobile && order.order_items && order.order_items.length > 3"
                    >
                      <v-expansion-panel elevation="0">
                        <v-expansion-panel-title class="px-0" :hide-actions="true">
                          <template #default="{ expanded }">
                            <div class="d-flex align-center w-100">
                              <div class="text-caption font-weight-medium">
                                View all {{ order.order_items.length }} items
                              </div>
                              <v-spacer></v-spacer>
                              <v-icon :size="16">{{
                                expanded ? 'mdi-chevron-up' : 'mdi-chevron-down'
                              }}</v-icon>
                            </div>
                          </template>
                        </v-expansion-panel-title>
                        <v-expansion-panel-text class="px-0">
                          <!-- All items -->
                          <div
                            v-for="(orderItem, index) in order.order_items"
                            :key="orderItem.id"
                            class="order-item-mobile mb-2"
                          >
                            <div class="d-flex align-center">
                              <v-img
                                :src="getOrderItemImage(orderItem)"
                                width="40"
                                height="40"
                                cover
                                class="rounded-md mr-2"
                                :alt="getProductDisplayName(orderItem)"
                              />
                              <div class="flex-grow-1">
                                <div class="text-caption font-weight-medium line-clamp-1">
                                  {{ getProductDisplayName(orderItem) }}
                                </div>
                                <div class="d-flex justify-space-between">
                                  <div class="text-caption text-medium-emphasis">
                                    {{ orderItem.quantity || 1 }} × ₱{{
                                      getProductPrice(orderItem).toLocaleString()
                                    }}
                                  </div>
                                  <div class="text-caption font-weight-medium">
                                    ₱{{ getProductSubtotal(orderItem).toLocaleString() }}
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        </v-expansion-panel-text>
                      </v-expansion-panel>
                    </v-expansion-panels>

                    <!-- First few items always visible on mobile -->
                    <div v-if="order.order_items && order.order_items.length > 0">
                      <div
                        v-for="(orderItem, index) in isMobile
                          ? order.order_items.slice(0, 3)
                          : order.order_items"
                        :key="orderItem.id"
                        class="order-item-mobile mb-2"
                      >
                        <div class="d-flex align-center">
                          <v-img
                            :src="getOrderItemImage(orderItem)"
                            :width="isMobile ? 40 : 60"
                            :height="isMobile ? 40 : 60"
                            cover
                            class="rounded-md mr-2"
                            :alt="getProductDisplayName(orderItem)"
                          />
                          <div class="flex-grow-1">
                            <div
                              :class="
                                isMobile
                                  ? 'text-caption font-weight-medium line-clamp-1'
                                  : 'text-body-2 font-weight-medium'
                              "
                            >
                              {{ getProductDisplayName(orderItem) }}
                            </div>
                            <div class="d-flex justify-space-between align-center mt-1">
                              <div
                                :class="
                                  isMobile
                                    ? 'text-caption text-medium-emphasis'
                                    : 'text-body-2 text-medium-emphasis'
                                "
                              >
                                {{ orderItem.quantity || 1 }} × ₱{{
                                  getProductPrice(orderItem).toLocaleString()
                                }}
                                <span v-if="orderItem.selected_size" class="ml-1">
                                  • Size: {{ orderItem.selected_size }}
                                </span>
                              </div>
                              <div
                                :class="
                                  isMobile
                                    ? 'text-caption font-weight-bold text-primary'
                                    : 'text-body-1 font-weight-bold text-primary'
                                "
                              >
                                ₱{{ getProductSubtotal(orderItem).toLocaleString() }}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <!-- Order Summary - Mobile Optimized -->
                  <div class="order-summary mt-3 pt-2 border-top">
                    <div class="d-flex justify-space-between align-center">
                      <div>
                        <div
                          :class="
                            isMobile
                              ? 'text-caption font-weight-medium'
                              : 'text-body-2 font-weight-medium'
                          "
                        >
                          Order Total
                        </div>
                        <div
                          :class="
                            isMobile
                              ? 'text-caption text-medium-emphasis'
                              : 'text-caption text-medium-emphasis'
                          "
                        >
                          {{ order.order_items?.length || 0 }} items
                        </div>
                      </div>
                      <div class="text-right">
                        <div
                          :class="
                            isMobile
                              ? 'text-subtitle-2 font-weight-bold text-primary'
                              : 'text-h6 font-weight-bold text-primary'
                          "
                        >
                          ₱{{ order.total_amount?.toLocaleString() || '0' }}
                        </div>
                        <div
                          v-if="order.payments?.[0]?.amount"
                          :class="
                            isMobile
                              ? 'text-caption text-medium-emphasis'
                              : 'text-caption text-medium-emphasis'
                          "
                        >
                          Paid: ₱{{ order.payments[0].amount.toLocaleString() }}
                        </div>
                      </div>
                    </div>
                  </div>

                  <!-- Order Note - Mobile Optimized -->
                  <div v-if="order.note" class="order-note mt-2">
                    <div class="d-flex align-start">
                      <v-icon :size="isMobile ? 14 : 16" class="mr-1 mt-1 text-primary"
                        >mdi-message-text</v-icon
                      >
                      <div
                        :class="
                          isMobile
                            ? 'text-caption text-medium-emphasis'
                            : 'text-caption text-medium-emphasis'
                        "
                      >
                        <strong>Note:</strong> {{ order.note }}
                      </div>
                    </div>
                  </div>

                  <!-- Action Buttons - Mobile Optimized -->
                  <div class="order-actions mt-3">
                    <div class="d-flex flex-wrap gap-1">
                      <!-- Approve Payment Button -->
                      <v-btn
                        color="success"
                        :size="isMobile ? 'x-small' : 'small'"
                        variant="flat"
                        v-if="order.payment_status === 'pending' && order.status !== 'cancelled'"
                        @click="approvePayment(order.id)"
                        :rounded="isMobile ? 'sm' : 'lg'"
                        class="action-button flex-grow-1"
                        :block="isMobile"
                      >
                        <v-icon :start="!isMobile" :size="isMobile ? 12 : 14">mdi-check</v-icon>
                        <span class="ml-1">Approve</span>
                      </v-btn>

                      <!-- Mark as Delivered Button -->
                      <v-btn
                        color="info"
                        :size="isMobile ? 'x-small' : 'small'"
                        variant="flat"
                        v-if="
                          order.payment_status === 'paid' &&
                          order.delivery_status !== 'delivered' &&
                          order.status !== 'cancelled'
                        "
                        @click="markAsDelivered(order.id)"
                        :rounded="isMobile ? 'sm' : 'lg'"
                        class="action-button flex-grow-1"
                        :block="isMobile"
                      >
                        <v-icon :start="!isMobile" :size="isMobile ? 12 : 14"
                          >mdi-truck-check</v-icon
                        >
                        <span class="ml-1">Deliver</span>
                      </v-btn>

                      <!-- Cancel Order Button -->
                      <v-btn
                        color="error"
                        :size="isMobile ? 'x-small' : 'small'"
                        variant="outlined"
                        v-if="order.status !== 'cancelled' && order.payment_status !== 'cancelled'"
                        @click="cancelOrder(order.id)"
                        :rounded="isMobile ? 'sm' : 'lg'"
                        class="action-button flex-grow-1"
                        :block="isMobile"
                      >
                        <v-icon :start="!isMobile" :size="isMobile ? 12 : 14">mdi-cancel</v-icon>
                        <span class="ml-1">Cancel</span>
                      </v-btn>

                      <!-- View Details Button -->
                      <v-btn
                        color="primary"
                        :size="isMobile ? 'x-small' : 'small'"
                        variant="outlined"
                        @click="$router.push(`/orderdetails/${order.id}`)"
                        :rounded="isMobile ? 'sm' : 'lg'"
                        class="action-button flex-grow-1"
                        :block="isMobile"
                      >
                        <v-icon :start="!isMobile" :size="isMobile ? 12 : 14">mdi-eye</v-icon>
                        <span class="ml-1">Details</span>
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
/* Base Styles */
.background-gradient {
  background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
  min-height: 100vh;
}

.mobile-padding {
  padding-bottom: 20px;
}

/* Top Bar */
.top-bar {
  padding-top: env(safe-area-inset-top, 0px);
  padding-left: env(safe-area-inset-left, 0px);
  padding-right: env(safe-area-inset-right, 0px);
}

/* Cover Section */
.cover-container {
  position: relative;
}

.cover-photo {
  border-radius: 0 0 16px 16px;
}

.cover-placeholder {
  background: linear-gradient(135deg, #eeeeee 0%, #e5e2e9 100%);
  border-radius: 0 0 16px 16px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.avatar-wrapper {
  display: flex;
  justify-content: center;
  position: relative;
  z-index: 2;
}

.avatar-border {
  border: 4px solid white;
  background: white;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
}

/* Business Card */
.business-card {
  border: 1px solid #e0e0e0;
}

.info-card {
  transition: all 0.3s ease;
  border: 1px solid #e0e0e0;
  height: 100%;
}

.info-card:hover {
  transform: translateY(-1px);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

/* Status Card */
.status-card {
  background: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%);
  border: 1px solid #cbd5e0;
}

.status-toggle-btn {
  font-weight: 600;
  box-shadow: 0 2px 8px rgba(196, 187, 187, 0.1);
}

/* Action Button */
.action-btn {
  background: linear-gradient(135deg, #667eea 0%, #5668af 100%);
  color: white;
  box-shadow: 0 4px 15px rgba(255, 255, 255, 0.205);
  transition: all 0.3s ease;
  border: none;
}

.action-btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 6px 20px rgba(102, 126, 234, 0.3);
}

/* Orders Container */
.orders-container {
  max-height: calc(100vh - 400px);
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
}

.orders-container::-webkit-scrollbar {
  width: 4px;
}

.orders-container::-webkit-scrollbar-track {
  background: #f1f1f1;
  border-radius: 10px;
}

.orders-container::-webkit-scrollbar-thumb {
  background: #c1c1c1;
  border-radius: 10px;
}

/* Order Card */
.order-card {
  transition: all 0.2s ease;
  border: 1px solid #e0e0e0;
}

.order-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

/* Customer Card */
.customer-card {
  background: linear-gradient(135deg, #f0f7ff 0%, #e3f2fd 100%);
  border: 1px solid #bbdefb;
}

.customer-details-mobile .detail-item {
  display: flex;
  align-items: center;
}

/* Order Items */
.order-item-mobile {
  padding: 8px 0;
  border-bottom: 1px solid #f0f0f0;
}

.order-item-mobile:last-child {
  border-bottom: none;
}

/* Order Summary */
.border-top {
  border-top: 1px solid #e0e0e0;
}

/* Order Note */
.order-note {
  background: #fff3cd;
  border-radius: 8px;
  padding: 8px;
  border-left: 3px solid #ffc107;
}

/* Action Buttons */
.order-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.action-button {
  min-width: auto;
}

/* Utility Classes */
.line-clamp-1 {
  display: -webkit-box;
  -webkit-line-clamp: 1;
  -webkit-box-orient: vertical;
  overflow: hidden;
  text-overflow: ellipsis;
}

.line-clamp-2 {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Touch-friendly sizes */
@media (max-width: 768px) {
  .v-btn {
    min-height: 36px;
  }

  .v-chip {
    min-height: 20px;
    font-size: 0.7rem;
  }

  .v-icon {
    font-size: 1.2rem;
  }

  /* Safe area for iPhone notch */
  .top-bar {
    padding-top: max(env(safe-area-inset-top), 0px);
  }

  .v-main {
    padding-bottom: max(env(safe-area-inset-bottom), 0px);
  }
}

/* Extra small devices */
@media (max-width: 375px) {
  .avatar-wrapper {
    margin-top: -30px;
  }

  .avatar-border {
    width: 60px !important;
    height: 60px !important;
  }

  .v-toolbar-title {
    font-size: 0.9rem;
  }

  .order-actions .v-btn {
    font-size: 0.7rem;
    padding: 0 8px;
  }
}

/* Tablet optimization */
@media (min-width: 769px) and (max-width: 1024px) {
  .avatar-wrapper {
    margin-top: -45px;
  }

  .avatar-border {
    width: 90px !important;
    height: 90px !important;
  }
}

/* Dark mode support */
@media (prefers-color-scheme: dark) {
  .business-card,
  .info-card,
  .order-card {
    background: #ffffff;
    border-color: #000000;
  }

  .customer-card {
    background: #ffffff;
    border-color: #3d3d5c;
  }
}

/* High contrast mode */
@media (prefers-contrast: high) {
  .border-top {
    border-top: 2px solid #ffffff;
  }

  .order-item-mobile {
    border-bottom: 2px solid #000;
  }
}

/* Reduced motion */
@media (prefers-reduced-motion: reduce) {
  .info-card,
  .order-card,
  .action-btn {
    transition: none;
  }
}

/* Print styles */
@media print {
  .top-bar,
  .order-actions,
  .action-btn {
    display: none !important;
  }

  .orders-container {
    max-height: none;
    overflow: visible;
  }
}
</style>