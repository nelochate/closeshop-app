<script setup lang="ts">
import { ref, onMounted, computed, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { supabase } from '@/utils/supabase'
import { notifyCustomerOrderStatus } from '@/utils/orderNotifications'
import OrderTrackingMap from '@/components/OrderTrackingMap.vue'
import {
  buildDeliveryAddress,
  buildShopAddress,
  extractPersistedRiderCoordinates,
  resolveTrackingLocation,
  type TrackingLocation,
  type TrackingViewerMode,
} from '@/utils/orderTracking'

const route = useRoute()
const router = useRouter()
const orderId = route.params.id as string

// State
const order = ref<any>(null)
const orderItems = ref<any[]>([])
const buyer = ref<any>(null)
const shop = ref<any>(null)
const shippingAddress = ref<any>(null)
const loading = ref(true)
const error = ref<string | null>(null)
const activeTab = ref('details')
const currentUser = ref<any>(null)
const riderDetails = ref<any>(null)
const userRole = ref<'buyer' | 'seller' | 'rider' | null>(null)
const currentRiderId = ref<number | null>(null)
const currentRiderProfile = ref<any>(null)
const pickupTrackingLocation = ref<TrackingLocation | null>(null)
const deliveryTrackingLocation = ref<TrackingLocation | null>(null)

// Timer state
const timeRemaining = ref<number>(300)
const canCancel = ref<boolean>(true)
let timerInterval: number | null = null
let statusSubscription: any = null

const fetchCurrentRiderProfile = async (profileId: string) => {
  try {
    const { data, error } = await supabase
      .from('Rider_Registration')
      .select('rider_id, first_name, last_name, phone, email')
      .eq('profile_id', profileId)
      .maybeSingle()

    if (error) {
      console.error('Error fetching current rider profile:', error)
      currentRiderId.value = null
      currentRiderProfile.value = null
      return
    }

    currentRiderId.value = data?.rider_id ?? null
    currentRiderProfile.value = data ?? null
  } catch (err) {
    console.error('Unexpected error fetching current rider profile:', err)
    currentRiderId.value = null
    currentRiderProfile.value = null
  }
}

// Get current user and determine role
const getCurrentUserAndRole = async () => {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    currentUser.value = user
    userRole.value = null
    
    if (!user) return

    await fetchCurrentRiderProfile(user.id)
    
    // Check if user is buyer (order owner)
    if (order.value && user.id === order.value.user_id) {
      userRole.value = 'buyer'
    }
    // Check if user is seller
    else if (shop.value && user.id === shop.value.owner_id) {
      userRole.value = 'seller'
    }
    // Check if user is rider
    else if (
      currentRiderId.value &&
      order.value &&
      (order.value.rider_id === currentRiderId.value ||
        (!order.value.rider_id && order.value.status === 'waiting_for_rider'))
    ) {
      userRole.value = 'rider'
    }
    
    console.log('User role:', userRole.value)
  } catch (err) {
    console.error('Error getting user role:', err)
  }
}

// Fetch rider details
const fetchRiderDetails = async () => {
  if (!order.value?.rider_id) {
    riderDetails.value = null
    return
  }

  if (currentRiderId.value && order.value.rider_id === currentRiderId.value && currentRiderProfile.value) {
    riderDetails.value = currentRiderProfile.value
    return
  }
  
  try {
    const { data, error } = await supabase
      .from('Rider_Registration')
      .select('first_name, last_name, phone, email, rider_id')
      .eq('rider_id', order.value.rider_id)
      .single()
    
    if (!error && data) {
      riderDetails.value = data
    }
  } catch (err) {
    console.error('Error fetching rider details:', err)
  }
}

// Calculate time remaining for cancellation
const calculateTimeRemaining = () => {
  if (!order.value || !order.value.created_at) return 300
  if (order.value.status !== 'pending_approval') return 0
  
  const orderCreatedAt = new Date(order.value.created_at).getTime()
  const currentTime = new Date().getTime()
  const timeElapsed = (currentTime - orderCreatedAt) / 1000
  const maxCancelTime = 5 * 60
  
  return Math.max(0, maxCancelTime - timeElapsed)
}

const formatTimeRemaining = () => {
  const remaining = timeRemaining.value
  if (remaining <= 0) return '00:00'
  const minutes = Math.floor(remaining / 60)
  const seconds = remaining % 60
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
}

const startCancelTimer = () => {
  if (timerInterval) clearInterval(timerInterval)
  
  const initialRemaining = calculateTimeRemaining()
  timeRemaining.value = initialRemaining
  canCancel.value = initialRemaining > 0 && order.value?.status === 'pending_approval'
  
  if (initialRemaining > 0 && order.value?.status === 'pending_approval') {
    timerInterval = setInterval(() => {
      const newRemaining = calculateTimeRemaining()
      timeRemaining.value = newRemaining
      canCancel.value = newRemaining > 0 && order.value?.status === 'pending_approval'
      if (newRemaining <= 0 && timerInterval) {
        clearInterval(timerInterval)
        timerInterval = null
        canCancel.value = false
      }
    }, 1000)
  }
}

const cancelOrder = async () => {
  const remaining = calculateTimeRemaining()
  if (remaining <= 0) {
    alert('Cancellation window has expired.')
    return
  }
  
  if (!confirm(`Cancel this order? You have ${formatTimeRemaining()} left.`)) return
  
  try {
    const { error } = await supabase
      .from('orders')
      .update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
      .eq('id', orderId)
    
    if (error) throw error
    if (timerInterval) clearInterval(timerInterval)
    await fetchOrderDetails()
    alert('Order cancelled successfully.')
  } catch (err) {
    console.error('Error cancelling order:', err)
    alert('Failed to cancel order.')
  }
}

// Subscribe to real-time updates
const subscribeToOrderUpdates = () => {
  if (statusSubscription) supabase.removeChannel(statusSubscription)
  
  statusSubscription = supabase
    .channel(`order-${orderId}`)
    .on('postgres_changes', {
      event: 'UPDATE',
      schema: 'public',
      table: 'orders',
      filter: `id=eq.${orderId}`
    }, (payload) => {
      console.log('Order update:', payload.new.status)
      order.value = { ...order.value, ...payload.new }
      fetchRiderDetails()
      getCurrentUserAndRole()
    })
    .subscribe()
}

// Fetch order details
const fetchOrderDetails = async () => {
  try {
    loading.value = true
    error.value = null
    pickupTrackingLocation.value = null
    deliveryTrackingLocation.value = null

    const { data: orderData, error: orderError } = await supabase
      .from('orders')
      .select(`
        *,
        order_items (
          id, product_id, quantity, price, selected_size, selected_variety,
          products (id, prod_name, main_img_urls, description, shop_id)
        ),
        buyer:profiles!orders_user_id_fkey (id, first_name, last_name, avatar_url, phone),
        address:addresses!orders_address_id_fkey ( * )
      `)
      .eq('id', orderId)
      .single()

    if (orderError) throw orderError
    if (!orderData) throw new Error('Order not found')

    order.value = orderData
    orderItems.value = orderData.order_items || []
    shippingAddress.value = orderData.address
    buyer.value = orderData.buyer

    await fetchRiderDetails()

    const resolvedShopId = orderData.shop_id || orderItems.value[0]?.products?.shop_id

    if (resolvedShopId) {
      await fetchShopDetails(resolvedShopId)
    }

    await loadTrackingLocations()
    
    await getCurrentUserAndRole()

    if (!userRole.value) {
      order.value = null
      orderItems.value = []
      buyer.value = null
      shop.value = null
      shippingAddress.value = null
      riderDetails.value = null
      pickupTrackingLocation.value = null
      deliveryTrackingLocation.value = null
      error.value = 'You do not have access to this order.'
      return
    }
    
    if (order.value?.status === 'pending_approval') startCancelTimer()
    else { canCancel.value = false; timeRemaining.value = 0 }
    
    subscribeToOrderUpdates()
  } catch (err: any) {
    console.error('Error:', err)
    error.value = err.message || 'Failed to load order details'
  } finally {
    loading.value = false
  }
}

// Fetch shop details
const fetchShopDetails = async (shopId: string) => {
  try {
    const { data: shopData } = await supabase
      .from('shops')
      .select('*')
      .eq('id', shopId)
      .single()
    
    if (shopData) {
      shop.value = shopData
    }
  } catch (err) {
    console.error('Error fetching shop:', err)
  }
}

const loadTrackingLocations = async () => {
  const pickupQuery = [
    shop.value?.house_no,
    shop.value?.building,
    shop.value?.street,
    shop.value?.barangay,
    shop.value?.city,
    shop.value?.province,
  ]
    .filter(Boolean)
    .join(', ')

  const deliveryQuery = [
    shippingAddress.value?.house_no,
    shippingAddress.value?.building,
    shippingAddress.value?.street,
    shippingAddress.value?.purok,
    shippingAddress.value?.barangay_name,
    shippingAddress.value?.city_name,
    shippingAddress.value?.province_name,
  ]
    .filter(Boolean)
    .join(', ')

  pickupTrackingLocation.value = await resolveTrackingLocation({
    name: shop.value?.business_name || 'Pickup point',
    address: buildShopAddress(shop.value),
    lat: shop.value?.latitude,
    lng: shop.value?.longitude,
    fallbackQuery: pickupQuery || undefined,
  })

  deliveryTrackingLocation.value = await resolveTrackingLocation({
    name: getPreferredAddressRecipientName(shippingAddress.value) || getProfileDisplayName(buyer.value) || 'Customer',
    address: buildDeliveryAddress(shippingAddress.value),
    lat: shippingAddress.value?.latitude,
    lng: shippingAddress.value?.longitude,
    fallbackQuery: deliveryQuery || undefined,
  })
}

// Computed properties
const subtotal = computed(() => {
  return orderItems.value.reduce((sum, item) => sum + (item.price * item.quantity), 0)
})

const deliveryFee = computed(() => {
  const total = Number(order.value?.total_amount ?? subtotal.value)
  return Math.max(0, total - subtotal.value)
})

const totalAmount = computed(() => order.value?.total_amount || subtotal.value)

const shopDisplayName = computed(() => shop.value?.business_name || 'Shop unavailable')
const orderReferenceText = computed(() => {
  if (order.value?.transaction_number) return `Transaction #${order.value.transaction_number}`
  if (order.value?.id) return `Order #${order.value.id.slice(0, 8)}`
  return 'Order details'
})

const getProfileDisplayName = (profile: any) => {
  const preferredName = [profile?.full_name, profile?.name].find(
    (value) => typeof value === 'string' && value.trim(),
  )

  if (preferredName) return preferredName.trim()

  return [profile?.first_name, profile?.last_name].filter(Boolean).join(' ').trim()
}

const getPreferredAddressRecipientName = (address: any) => {
  const preferredName = [address?.recipient_name, address?.full_name, address?.name].find(
    (value) => typeof value === 'string' && value.trim(),
  )

  return preferredName?.trim() || ''
}

const buyerDisplayName = computed(() => {
  return (
    getPreferredAddressRecipientName(shippingAddress.value) ||
    getProfileDisplayName(buyer.value) ||
    'Customer unavailable'
  )
})

const riderDisplayName = computed(() => {
  if (!riderDetails.value) return 'Assigned rider'
  return getProfileDisplayName(riderDetails.value) || 'Assigned rider'
})

const shopAddress = computed(() => {
  if (!shop.value) return 'Shop address unavailable'
  return buildShopAddress(shop.value)
})

const statusColor = computed(() => {
  const status = order.value?.status
  const colors: Record<string, string> = {
    pending_approval: 'warning',
    waiting_for_rider: 'info',
    accepted_by_rider: 'primary',
    picked_up: 'purple',
    delivered: 'success',
    completed: 'success',
    cancelled: 'error'
  }
  return colors[status] || 'grey'
})

const statusIcon = computed(() => {
  const status = order.value?.status
  const icons: Record<string, string> = {
    pending_approval: 'mdi-clock-outline',
    waiting_for_rider: 'mdi-bike-fast',
    accepted_by_rider: 'mdi-check-circle',
    picked_up: 'mdi-truck-delivery',
    delivered: 'mdi-check-circle',
    completed: 'mdi-check-decagram',
    cancelled: 'mdi-close-circle'
  }
  return icons[status] || 'mdi-help-circle'
})

const statusDisplayText = computed(() => {
  const status = order.value?.status
  const texts: Record<string, string> = {
    pending_approval: 'Pending Approval',
    waiting_for_rider: 'Waiting for Rider',
    accepted_by_rider: 'Rider Accepted',
    picked_up: 'Picked Up',
    delivered: 'Delivered',
    completed: 'Completed',
    cancelled: 'Cancelled'
  }
  return texts[status] || status
})

const isBuyer = computed(() => userRole.value === 'buyer')
const isSeller = computed(() => userRole.value === 'seller')
const isRider = computed(() => userRole.value === 'rider')
const trackingViewerMode = computed<TrackingViewerMode>(() => {
  if (isSeller.value) return 'seller'
  if (isRider.value) return 'rider'
  return 'customer'
})
const shouldTrackOwnLocation = computed(
  () =>
    isRider.value &&
    !!currentRiderId.value &&
    order.value?.rider_id === currentRiderId.value &&
    ['accepted_by_rider', 'picked_up'].includes(order.value?.status),
)
const persistedRiderTrackingLocation = computed<TrackingLocation | null>(() => {
  const persisted = extractPersistedRiderCoordinates(order.value)

  if (!persisted) return null

  return {
    ...persisted,
    name: riderDisplayName.value,
    address:
      riderDetails.value?.phone ||
      `${persisted.lat.toFixed(5)}, ${persisted.lng.toFixed(5)}`,
  }
})
const trackingMapTitle = computed(() => {
  if (order.value?.status === 'picked_up') return 'Order is on the way to the customer'
  if (order.value?.status === 'accepted_by_rider') return 'Rider is heading to the pickup point'
  if (order.value?.status === 'waiting_for_rider') return 'Tracking is ready once a rider accepts'
  if (order.value?.status === 'delivered' || order.value?.status === 'completed') {
    return 'Delivery route completed'
  }
  return 'Follow the delivery journey'
})
const trackingMapSubtitle = computed(() => {
  if (order.value?.status === 'pending_approval') {
    return 'The map is ready, and live rider tracking will appear after approval and assignment.'
  }
  if (!order.value?.rider_id) {
    return 'Pickup and delivery addresses are available now. Live rider sharing starts once the order is assigned.'
  }
  return ''
})

const showCancelButton = computed(() => isBuyer.value && order.value?.status === 'pending_approval')
const isCancelDisabled = computed(() => !canCancel.value || timeRemaining.value <= 0)
const getCancelButtonText = computed(() => {
  if (timeRemaining.value <= 0) return 'Cancellation Unavailable'
  return `Cancel Order (${formatTimeRemaining()})`
})

// Timeline steps based on order status
const timelineSteps = computed(() => {
  const currentStatus = order.value?.status
  
  const steps = [
    {
      key: 'order_placed',
      title: 'Order Placed',
      description: 'Your order has been placed and is waiting for seller approval',
      status: 'completed',
      timestamp: order.value?.created_at,
      icon: 'mdi-cart-check',
      date: order.value?.created_at,
      actor: 'Customer'
    },
    {
      key: 'approved',
      title: 'Order Approved',
      description: 'Seller has approved your order and is looking for a rider',
      status: getStepStatus('approved'),
      timestamp: order.value?.approved_at,
      icon: 'mdi-store-check',
      date: order.value?.approved_at,
      actor: 'Seller'
    },
    {
      key: 'rider_assigned',
      title: 'Rider Assigned',
      description: 'A rider has accepted your order and is on the way',
      status: getStepStatus('rider_assigned'),
      timestamp: order.value?.accepted_at,
      icon: 'mdi-motorbike',
      date: order.value?.accepted_at,
      actor: 'Rider'
    },
    {
      key: 'picked_up',
      title: 'Order Picked Up',
      description: 'Rider has picked up your order and is heading to you',
      status: getStepStatus('picked_up'),
      timestamp: order.value?.picked_up_at,
      icon: 'mdi-package-up',
      date: order.value?.picked_up_at,
      actor: 'Rider'
    },
    {
      key: 'delivered',
      title: 'Order Delivered',
      description: 'Your order has been successfully delivered',
      status: getStepStatus('delivered'),
      timestamp: order.value?.delivered_at,
      icon: 'mdi-home-check',
      date: order.value?.delivered_at,
      actor: 'Rider'
    }
  ]
  
  // If cancelled, mark steps appropriately
  if (currentStatus === 'cancelled') {
    const cancelledDate = order.value?.cancelled_at
    steps.forEach(step => {
      if (step.date && new Date(step.date) <= new Date(cancelledDate)) {
        step.status = 'completed'
      } else if (step.status !== 'completed') {
        step.status = 'cancelled'
      }
    })
  }
  
  return steps
})

const getStepStatus = (stepKey: string): 'completed' | 'current' | 'pending' | 'cancelled' => {
  const currentStatus = order.value?.status === 'completed' ? 'delivered' : order.value?.status
  if (currentStatus === 'cancelled') return 'cancelled'
  
  const statusOrder = ['pending_approval', 'waiting_for_rider', 'accepted_by_rider', 'picked_up', 'delivered']
  const currentIndex = statusOrder.indexOf(currentStatus)
  
  const stepMap: Record<string, number> = {
    order_placed: -1,
    approved: 0,
    rider_assigned: 1,
    picked_up: 2,
    delivered: 3
  }
  
  const stepIndex = stepMap[stepKey]
  
  if (stepIndex < currentIndex) return 'completed'
  if (stepIndex === currentIndex) return 'current'
  return 'pending'
}

const timelineProgress = computed(() => {
  const currentStatus = order.value?.status === 'completed' ? 'delivered' : order.value?.status
  if (currentStatus === 'cancelled') return 0
  if (currentStatus === 'delivered') return 100
  
  const statusOrder = ['pending_approval', 'waiting_for_rider', 'accepted_by_rider', 'picked_up', 'delivered']
  const currentIndex = statusOrder.indexOf(currentStatus)
  if (currentIndex === -1) return 0
  return ((currentIndex + 1) / statusOrder.length) * 100
})

// Action functions based on role
const approveOrder = async () => {
  if (!isSeller.value) return
  if (!confirm('Approve this order? It will be made available for riders.')) return
  
  try {
    const { error } = await supabase
      .from('orders')
      .update({ 
        status: 'waiting_for_rider',
        approved_at: new Date().toISOString()
      })
      .eq('id', orderId)
    
    if (error) throw error
    alert('Order approved! Riders can now accept it.')
    await fetchOrderDetails()
  } catch (err) {
    console.error('Error approving order:', err)
    alert('Failed to approve order.')
  }
}

const rejectOrder = async () => {
  if (!isSeller.value) return
  if (!confirm('Reject this order? This cannot be undone.')) return
  
  try {
    const { error } = await supabase
      .from('orders')
      .update({ 
        status: 'cancelled',
        cancelled_at: new Date().toISOString()
      })
      .eq('id', orderId)
    
    if (error) throw error
    alert('Order rejected.')
    await fetchOrderDetails()
  } catch (err) {
    console.error('Error rejecting order:', err)
    alert('Failed to reject order.')
  }
}

const acceptOrderAsRider = async () => {
  if (!isRider.value) return
  if (!confirm('Accept this order for delivery?')) return
  
  try {
    if (!currentRiderId.value) {
      alert('Rider profile not found.')
      return
    }
    
    const { error } = await supabase
      .from('orders')
      .update({ 
        status: 'accepted_by_rider',
        accepted_at: new Date().toISOString(),
        rider_id: currentRiderId.value
      })
      .eq('id', orderId)
    
    if (error) throw error
    alert('Order accepted! Head to the store to pick it up.')
    await fetchOrderDetails()
  } catch (err) {
    console.error('Error accepting order:', err)
    alert('Failed to accept order.')
  }
}

const markAsPickedUp = async () => {
  if (!isRider.value) return
  if (!confirm('Mark this order as picked up?')) return
  
  try {
    const pickedUpAt = new Date().toISOString()

    const { error } = await supabase
      .from('orders')
      .update({ 
        status: 'picked_up',
        picked_up_at: pickedUpAt
      })
      .eq('id', orderId)
    
    if (error) throw error

    try {
      await notifyCustomerOrderStatus({
        orderId,
        status: 'picked_up',
        createdAt: pickedUpAt,
        orderData: {
          ...order.value,
          shop_name: shop.value?.business_name,
        },
      })
    } catch (notificationError) {
      console.warn('Could not notify customer about picked up status:', notificationError)
    }

    alert('Order marked as picked up. Deliver to customer.')
    await fetchOrderDetails()
  } catch (err) {
    console.error('Error marking as picked up:', err)
    alert('Failed to update status.')
  }
}

const markAsDelivered = async () => {
  if (!isRider.value && !isSeller.value) return
  if (!confirm('Mark this order as delivered?')) return
  
  try {
    const deliveredAt = new Date().toISOString()

    const { error } = await supabase
      .from('orders')
      .update({ 
        status: 'delivered',
        delivered_at: deliveredAt
      })
      .eq('id', orderId)
    
    if (error) throw error

    try {
      await notifyCustomerOrderStatus({
        orderId,
        status: 'delivered',
        createdAt: deliveredAt,
        orderData: {
          ...order.value,
          shop_name: shop.value?.business_name,
        },
      })
    } catch (notificationError) {
      console.warn('Could not notify customer about delivered status:', notificationError)
    }

    alert('Order marked as delivered!')
    await fetchOrderDetails()
  } catch (err) {
    console.error('Error marking as delivered:', err)
    alert('Failed to update status.')
  }
}

// Format functions
const formatDate = (dateString: string) => {
  if (!dateString) return 'Not set'
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit'
  })
}

const formatCurrency = (amount: number) => `₱${amount?.toFixed(2) || '0.00'}`

const getProductImage = (product: any) => {
  if (!product?.main_img_urls) return '/placeholder.png'
  try {
    if (typeof product.main_img_urls === 'string') {
      const parsed = JSON.parse(product.main_img_urls)
      return Array.isArray(parsed) ? parsed[0] : parsed
    }
    if (Array.isArray(product.main_img_urls)) return product.main_img_urls[0]
    return '/placeholder.png'
  } catch { return '/placeholder.png' }
}

const buildFullAddress = computed(() => {
  if (!shippingAddress.value) return 'No shipping address'
  return buildDeliveryAddress(shippingAddress.value)
})

const goBack = () => router.back()
const viewProduct = (productId: string) => router.push({ name: 'product-detail', params: { id: productId } })
const contactSeller = () =>
  shop.value?.owner_id && router.push({ name: 'chatview', params: { id: shop.value.owner_id } })
const contactBuyer = () =>
  buyer.value?.id && router.push({ name: 'chatview', params: { id: buyer.value.id } })
const contactRider = () => riderDetails.value?.phone && (window.location.href = `tel:${riderDetails.value.phone}`)

// Cleanup
onUnmounted(() => {
  if (timerInterval) clearInterval(timerInterval)
  if (statusSubscription) supabase.removeChannel(statusSubscription)
})

onMounted(async () => {
  await fetchOrderDetails()
})
</script>

<template>
  <v-app>
    <v-main class="order-page">
      <header class="order-header">
        <div class="order-header__inner">
          <div class="order-header__lead">
            <v-btn icon variant="text" class="header-icon-btn" @click="goBack">
              <v-icon>mdi-arrow-left</v-icon>
            </v-btn>

            <h1>Order Details</h1>
          </div>
        </div>
      </header>

      <div v-if="loading" class="state-container">
        <v-progress-circular indeterminate color="primary" size="64" />
        <p>Loading order details...</p>
      </div>

      <div v-else-if="error" class="state-container">
        <v-icon color="error" size="64">mdi-alert-circle-outline</v-icon>
        <p>{{ error }}</p>
        <v-btn color="primary" @click="fetchOrderDetails">Try Again</v-btn>
      </div>

      <div v-else-if="order" class="order-shell">
        <section class="hero-card">
          <div class="hero-card__top">
            <div class="hero-card__progress">
              <div class="hero-card__meta">
                <v-chip v-if="order?.status" :color="statusColor" variant="tonal" class="order-status-chip">
                  <v-icon start size="16">{{ statusIcon }}</v-icon>
                  {{ statusDisplayText }}
                </v-chip>
                <span class="hero-reference">{{ orderReferenceText }}</span>
              </div>
              <h2>{{ trackingMapTitle }}</h2>
              <p>
                <span v-if="order.status === 'completed'">The order is fully completed.</span>
                <span v-else-if="order.status === 'delivered'">The rider marked the order as delivered.</span>
                <span v-else-if="order.status === 'picked_up'">The order has left the shop and is heading to the customer.</span>
                <span v-else-if="order.status === 'accepted_by_rider'">The rider is moving toward the pickup point.</span>
                <span v-else-if="order.status === 'waiting_for_rider'">The seller approved the order and it is waiting for a rider.</span>
                <span v-else-if="order.status === 'pending_approval'">The seller still needs to approve the order.</span>
                <span v-else-if="order.status === 'cancelled'">This order was cancelled before completion.</span>
              </p>
            </div>
          </div>

          <v-progress-linear
            v-if="order.status !== 'cancelled'"
            :model-value="timelineProgress"
            height="8"
            color="primary"
            rounded
            class="hero-progress-bar"
          />

          <div class="hero-stats">
            <article class="hero-stat">
              <span class="hero-stat__label">Order total</span>
              <strong>{{ formatCurrency(totalAmount) }}</strong>
            </article>
            <article class="hero-stat">
              <span class="hero-stat__label">Delivery option</span>
              <strong>{{ order.delivery_option || 'Standard' }}</strong>
            </article>
            <article class="hero-stat">
              <span class="hero-stat__label">Payment method</span>
              <strong>{{ order.payment_method || 'Cash' }}</strong>
            </article>
            <article class="hero-stat">
              <span class="hero-stat__label">Order placed</span>
              <strong>{{ formatDate(order.created_at) }}</strong>
            </article>
          </div>

          <div class="hero-context">
            <article class="hero-context__item" v-if="shop">
              <span class="hero-context__label">Shop</span>
              <strong>{{ shopDisplayName }}</strong>
            </article>
            <article class="hero-context__item">
              <span class="hero-context__label">Recipient</span>
              <strong>{{ buyerDisplayName }}</strong>
            </article>
          </div>
        </section>

        <v-tabs v-model="activeTab" color="primary" class="tabs-container">
          <v-tab value="details">Overview</v-tab>
          <v-tab value="timeline">Timeline</v-tab>
        </v-tabs>

        <v-window v-model="activeTab" class="window-container">
          <v-window-item value="details">
            <div class="details-content">
              <v-alert
                v-if="showCancelButton"
                :type="timeRemaining > 0 ? 'warning' : 'error'"
                variant="tonal"
                class="mb-4"
              >
                <div class="inline-alert">
                  <v-icon>{{ timeRemaining > 0 ? 'mdi-timer-sand' : 'mdi-timer-off' }}</v-icon>
                  <strong v-if="timeRemaining > 0">Cancel within {{ formatTimeRemaining() }}</strong>
                  <strong v-else>Cancellation window expired</strong>
                </div>
              </v-alert>

              <OrderTrackingMap
                class="mb-4"
                :order-id="orderId"
                :pickup-location="pickupTrackingLocation"
                :delivery-location="deliveryTrackingLocation"
                :rider-location="persistedRiderTrackingLocation"
                :viewer-mode="trackingViewerMode"
                :track-own-location="shouldTrackOwnLocation"
                :title="trackingMapTitle"
                :subtitle="trackingMapSubtitle"
              />

              <div class="content-grid">
                <v-card class="surface-card">
                  <v-card-title class="section-title">
                    <v-icon start>mdi-receipt-text-outline</v-icon>
                    Order summary
                  </v-card-title>
                  <v-card-text>
                    <div class="info-list">
                      <div class="info-item">
                        <span class="label">Order ID</span>
                        <span class="value">{{ order.id.slice(0, 8) }}...</span>
                      </div>
                      <div class="info-item" v-if="order.transaction_number">
                        <span class="label">Transaction #</span>
                        <span class="value">{{ order.transaction_number }}</span>
                      </div>
                      <div class="info-item">
                        <span class="label">Status</span>
                        <span class="value">{{ statusDisplayText }}</span>
                      </div>
                      <div class="info-item">
                        <span class="label">Delivery</span>
                        <span class="value">{{ order.delivery_option || 'Standard' }}</span>
                      </div>
                      <div class="info-item">
                        <span class="label">Payment</span>
                        <span class="value">{{ order.payment_method || 'Cash' }}</span>
                      </div>
                      <div class="info-item" v-if="order.note">
                        <span class="label">Note</span>
                        <span class="value">{{ order.note }}</span>
                      </div>
                    </div>
                  </v-card-text>
                </v-card>

                <v-card class="surface-card" v-if="shop || buyer || shippingAddress">
                  <v-card-title class="section-title">
                    <v-icon start>mdi-store-marker-outline</v-icon>
                    Delivery details
                  </v-card-title>
                  <v-card-text>
                    <div class="info-list">
                      <div class="info-item" v-if="shop">
                        <span class="label">Shop</span>
                        <span class="value">{{ shopDisplayName }}</span>
                      </div>
                      <div class="info-item" v-if="shop">
                        <span class="label">Pickup address</span>
                        <span class="value">{{ shopAddress }}</span>
                      </div>
                      <div class="info-item" v-if="shippingAddress || buyer">
                        <span class="label">Recipient</span>
                        <span class="value">{{ buyerDisplayName }}</span>
                      </div>
                    </div>

                    <div class="detail-actions">
                      <v-btn
                        v-if="shop?.owner_id && !isSeller"
                        color="primary"
                        variant="outlined"
                        size="small"
                        @click="contactSeller"
                      >
                        <v-icon start size="16">mdi-chat-outline</v-icon>
                        Contact shop
                      </v-btn>
                      <v-btn
                        v-if="buyer?.id && !isBuyer"
                        color="primary"
                        variant="outlined"
                        size="small"
                        @click="contactBuyer"
                      >
                        <v-icon start size="16">mdi-chat-outline</v-icon>
                        Contact customer
                      </v-btn>
                    </div>
                  </v-card-text>
                </v-card>

                <v-card class="surface-card" v-if="riderDetails && order.status !== 'pending_approval'">
                  <v-card-title class="section-title">
                    <v-icon start>mdi-motorbike</v-icon>
                    Rider information
                  </v-card-title>
                  <v-card-text>
                    <div class="info-list">
                      <div class="info-item">
                        <span class="label">Name</span>
                        <span class="value">{{ riderDisplayName }}</span>
                      </div>
                      <div class="info-item">
                        <span class="label">Phone</span>
                        <span class="value">{{ riderDetails.phone || 'Not provided' }}</span>
                      </div>
                    </div>

                    <v-btn
                      color="primary"
                      variant="outlined"
                      size="small"
                      @click="contactRider"
                      :disabled="!riderDetails?.phone"
                    >
                      <v-icon start size="16">mdi-phone</v-icon>
                      Contact rider
                    </v-btn>
                  </v-card-text>
                </v-card>
              </div>

              <v-card class="surface-card mb-4">
                <v-card-title class="section-title">
                  <v-icon start>mdi-package-variant-closed</v-icon>
                  Products ({{ orderItems.length }})
                </v-card-title>
                <v-card-text>
                  <div v-for="item in orderItems" :key="item.id" class="product-item">
                    <div class="product-layout">
                      <v-img
                        :src="getProductImage(item.products)"
                        width="68"
                        height="68"
                        class="product-image"
                        cover
                        @click="viewProduct(item.product_id)"
                      />

                      <div class="product-copy">
                        <div class="product-name">{{ item.products?.prod_name }}</div>
                        <div class="product-details">
                          <span>Qty: {{ item.quantity }}</span>
                          <span v-if="item.selected_size">Size: {{ item.selected_size }}</span>
                          <span v-if="item.selected_variety">Variety: {{ item.selected_variety }}</span>
                        </div>
                        <div class="product-price">{{ formatCurrency(item.price) }} each</div>
                      </div>

                      <div class="item-total">{{ formatCurrency(item.price * item.quantity) }}</div>
                    </div>
                  </div>
                </v-card-text>
              </v-card>

              <div class="content-grid content-grid--two">
                <v-card class="surface-card">
                  <v-card-title class="section-title">
                    <v-icon start>mdi-cash-multiple</v-icon>
                    Price breakdown
                  </v-card-title>
                  <v-card-text>
                    <div class="price-breakdown">
                      <div class="price-item"><span>Subtotal</span><span>{{ formatCurrency(subtotal) }}</span></div>
                      <div class="price-item"><span>Delivery fee</span><span>{{ formatCurrency(deliveryFee) }}</span></div>
                      <div class="price-item total"><span>Total</span><span>{{ formatCurrency(totalAmount) }}</span></div>
                    </div>
                  </v-card-text>
                </v-card>

                <v-card class="surface-card" v-if="shippingAddress">
                  <v-card-title class="section-title">
                    <v-icon start>mdi-home-map-marker</v-icon>
                    Delivery address
                  </v-card-title>
                  <v-card-text>
                    <div class="address-content">
                      <strong>{{ buyerDisplayName }}</strong>
                      <span v-if="shippingAddress.phone"> - {{ shippingAddress.phone }}</span>
                      <div class="address-details">{{ buildFullAddress }}</div>
                    </div>
                  </v-card-text>
                </v-card>
              </div>
            </div>
          </v-window-item>

          <v-window-item value="timeline">
            <v-card class="surface-card">
              <v-card-title class="section-title">
                <v-icon start>mdi-timeline-clock-outline</v-icon>
                Order timeline
              </v-card-title>
              <v-card-text>
                <div class="timeline-container">
                  <div
                    v-for="step in timelineSteps"
                    :key="step.key"
                    class="timeline-item"
                    :class="{
                      'timeline-completed': step.status === 'completed',
                      'timeline-current': step.status === 'current',
                      'timeline-pending': step.status === 'pending',
                      'timeline-cancelled': step.status === 'cancelled',
                    }"
                  >
                    <div class="timeline-icon">
                      <v-icon
                        :color="
                          step.status === 'completed'
                            ? '#4caf50'
                            : step.status === 'current'
                              ? '#2196f3'
                              : step.status === 'cancelled'
                                ? '#f44336'
                                : '#9e9e9e'
                        "
                      >
                        {{ step.icon }}
                      </v-icon>
                    </div>

                    <div class="timeline-content">
                      <div class="timeline-header">
                        <h4>{{ step.title }}</h4>
                        <span class="timeline-date">{{ formatDate(step.date) }}</span>
                      </div>
                      <p>{{ step.description }}</p>
                      <v-chip v-if="step.actor" size="x-small" variant="tonal" class="mt-2">
                        {{ step.actor }}
                      </v-chip>
                    </div>
                  </div>
                </div>

                <div class="timeline-legend">
                  <div class="legend-item"><div class="legend-dot completed"></div><span>Completed</span></div>
                  <div class="legend-item"><div class="legend-dot current"></div><span>Current</span></div>
                  <div class="legend-item"><div class="legend-dot pending"></div><span>Pending</span></div>
                  <div v-if="order.status === 'cancelled'" class="legend-item">
                    <div class="legend-dot cancelled"></div>
                    <span>Cancelled</span>
                  </div>
                </div>
              </v-card-text>
            </v-card>
          </v-window-item>
        </v-window>
      </div>
    </v-main>

    <v-footer app class="action-footer" color="white" elevation="6" v-if="order && !loading">
      <div class="action-buttons">
        <template v-if="isBuyer">
          <v-btn
            v-if="showCancelButton"
            :color="isCancelDisabled ? 'grey' : 'error'"
            :disabled="isCancelDisabled"
            @click="cancelOrder"
          >
            <v-icon start>mdi-close-circle</v-icon>
            {{ getCancelButtonText }}
          </v-btn>
        </template>

        <template v-else-if="isSeller">
          <v-btn v-if="order.status === 'pending_approval'" color="success" @click="approveOrder">
            <v-icon start>mdi-check-circle</v-icon>
            Approve order
          </v-btn>
          <v-btn
            v-if="order.status === 'pending_approval'"
            color="error"
            variant="outlined"
            @click="rejectOrder"
          >
            <v-icon start>mdi-close-circle</v-icon>
            Reject order
          </v-btn>
          <v-btn v-if="order.status === 'picked_up'" color="success" @click="markAsDelivered">
            <v-icon start>mdi-check</v-icon>
            Mark delivered
          </v-btn>
        </template>

        <template v-else-if="isRider">
          <v-btn v-if="order.status === 'waiting_for_rider'" color="primary" @click="acceptOrderAsRider">
            <v-icon start>mdi-check-circle</v-icon>
            Accept order
          </v-btn>
          <v-btn v-if="order.status === 'accepted_by_rider'" color="warning" @click="markAsPickedUp">
            <v-icon start>mdi-package-up</v-icon>
            Mark as picked up
          </v-btn>
          <v-btn v-if="order.status === 'picked_up'" color="success" @click="markAsDelivered">
            <v-icon start>mdi-check</v-icon>
            Mark delivered
          </v-btn>
        </template>

        <v-btn variant="outlined" @click="goBack">Close</v-btn>
      </div>
    </v-footer>
  </v-app>
</template>

<style scoped>
.order-page {
  --order-header-offset: calc(env(safe-area-inset-top, 0px) + 60px);
  min-height: 100dvh;
  background: linear-gradient(180deg, #f6f9fc 0%, #eef4fa 100%);
}

.order-header {
  position: sticky;
  top: 0;
  z-index: 20;
  padding-top: env(safe-area-inset-top, 0px);
  background: linear-gradient(135deg, #3f83c7, #295f8d);
  box-shadow: 0 12px 28px rgba(20, 44, 73, 0.16);
}

.order-header__inner {
  max-width: 960px;
  margin: 0 auto;
  padding: 10px 16px 12px;
  display: flex;
  align-items: center;
}

.order-header__lead {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 12px;
}

.header-icon-btn {
  color: white !important;
  background: rgba(255, 255, 255, 0.1) !important;
}

.order-header h1 {
  margin: 0;
  font-size: 1.02rem;
  font-weight: 700;
  line-height: 1.2;
  color: white;
}

.order-status-chip {
  font-weight: 700;
}

.state-container {
  min-height: calc(100dvh - 220px);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  text-align: center;
  padding: 32px 20px 120px;
  color: #12304f;
}

.order-shell {
  max-width: 960px;
  margin: 0 auto;
  padding: 18px 16px calc(120px + env(safe-area-inset-bottom, 0px));
}

.hero-card {
  padding: 18px;
  border-radius: 24px;
  background: rgba(255, 255, 255, 0.96);
  border: 1px solid rgba(53, 77, 124, 0.08);
  color: #12304f;
  box-shadow: 0 18px 42px rgba(18, 48, 79, 0.08);
}

.hero-card__top {
  display: flex;
  gap: 16px;
  align-items: flex-start;
}

.hero-card__progress h2 {
  margin: 0;
  font-size: 1.2rem;
  line-height: 1.25;
  color: #102a43;
}

.hero-card__progress p {
  margin: 8px 0 0;
  max-width: 640px;
  line-height: 1.5;
  color: #52667d;
}

.hero-card__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
  margin-bottom: 10px;
}

.hero-reference {
  font-size: 0.8rem;
  font-weight: 700;
  color: #627d98;
}

.hero-progress-bar {
  margin: 16px 0 18px;
}

.hero-stats {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}

.hero-stat {
  padding: 12px 14px;
  border-radius: 16px;
  background: #f8fbff;
  border: 1px solid rgba(53, 77, 124, 0.08);
}

.hero-stat__label {
  display: block;
  font-size: 0.74rem;
  color: #627d98;
}

.hero-stat strong {
  display: block;
  margin-top: 6px;
  font-size: 0.92rem;
  color: #102a43;
}

.hero-context {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  margin-top: 14px;
}

.hero-context__item {
  padding-top: 14px;
  border-top: 1px solid rgba(18, 48, 79, 0.08);
}

.hero-context__label {
  display: block;
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: #7b8794;
}

.hero-context__item strong {
  display: block;
  margin-top: 6px;
  color: #102a43;
  font-size: 0.94rem;
}

.tabs-container {
  margin-top: 18px;
  background: rgba(255, 255, 255, 0.92);
  border: 1px solid rgba(53, 77, 124, 0.08);
  border-radius: 18px;
  position: sticky;
  top: calc(var(--order-header-offset) + 10px);
  z-index: 15;
  backdrop-filter: blur(14px);
}

.window-container {
  padding-top: 18px;
}

.details-content {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.inline-alert {
  display: flex;
  align-items: center;
  gap: 10px;
}

.content-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
  margin-bottom: 16px;
}

.content-grid--two {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.surface-card {
  border-radius: 20px;
  border: 1px solid rgba(53, 77, 124, 0.08);
  box-shadow: 0 14px 32px rgba(18, 48, 79, 0.07);
}

.section-title {
  font-size: 0.96rem;
  font-weight: 700;
  padding: 16px 16px 0;
  color: #12304f;
}

.info-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.info-item {
  display: flex;
  justify-content: space-between;
  gap: 14px;
  padding: 0 0 10px;
  border-bottom: 1px solid rgba(18, 48, 79, 0.06);
}

.info-item:last-child {
  border-bottom: 0;
  padding-bottom: 0;
}

.label {
  color: #627d98;
  font-weight: 600;
}

.value {
  color: #102a43;
  text-align: right;
  font-weight: 600;
}

.detail-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 16px;
}

.product-item {
  padding: 14px 0;
  border-bottom: 1px solid rgba(18, 48, 79, 0.06);
}

.product-item:last-child {
  border-bottom: 0;
  padding-bottom: 0;
}

.product-layout {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 14px;
  align-items: center;
}

.product-image {
  border-radius: 16px;
  border: 1px solid rgba(18, 48, 79, 0.08);
  cursor: pointer;
}

.product-copy {
  min-width: 0;
}

.product-name {
  font-weight: 700;
  color: #102a43;
}

.product-details {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 6px;
  font-size: 0.84rem;
  color: #627d98;
}

.product-price {
  margin-top: 6px;
  font-size: 0.88rem;
  color: #52667d;
}

.item-total {
  font-weight: 700;
  color: #102a43;
}

.price-breakdown {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.price-item {
  display: flex;
  justify-content: space-between;
  gap: 16px;
}

.price-item.total {
  padding-top: 12px;
  border-top: 2px solid rgba(18, 48, 79, 0.08);
  font-weight: 800;
  color: #102a43;
}

.address-content {
  padding: 16px;
  border-radius: 16px;
  background: linear-gradient(180deg, #f8fbff, #eef4fc);
  font-size: 0.9rem;
  line-height: 1.55;
  color: #12304f;
}

.address-details {
  margin-top: 8px;
  color: #52667d;
}

.timeline-container {
  position: relative;
  padding-left: 40px;
}

.timeline-item {
  position: relative;
  padding-bottom: 32px;
  display: flex;
  gap: 16px;
}

.timeline-item:last-child {
  padding-bottom: 0;
}

.timeline-item::before {
  content: '';
  position: absolute;
  left: 19px;
  top: 40px;
  bottom: 0;
  width: 2px;
  background: #d9e2ec;
}

.timeline-item:last-child::before {
  display: none;
}

.timeline-icon {
  flex-shrink: 0;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  z-index: 2;
  border: 2px solid #d9e2ec;
  background: white;
}

.timeline-content {
  flex: 1;
}

.timeline-header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 8px;
}

.timeline-header h4 {
  margin: 0;
  font-size: 1rem;
  font-weight: 700;
  color: #12304f;
}

.timeline-date {
  font-size: 0.76rem;
  color: #7b8794;
}

.timeline-content p {
  margin: 0;
  color: #52667d;
  line-height: 1.5;
}

.timeline-completed .timeline-icon {
  border-color: #4caf50;
  background: #e8f5e9;
}

.timeline-current .timeline-icon {
  border-color: #2196f3;
  background: #e3f2fd;
  animation: pulse 2s infinite;
}

.timeline-pending .timeline-icon {
  background: #f5f7fa;
}

.timeline-cancelled .timeline-icon {
  border-color: #f44336;
  background: #ffebee;
}

.timeline-completed::before {
  background: #4caf50;
}

.timeline-current::before {
  background: linear-gradient(to bottom, #4caf50 0%, #2196f3 100%);
}

.timeline-legend {
  display: flex;
  justify-content: center;
  flex-wrap: wrap;
  gap: 18px;
  margin-top: 26px;
  padding-top: 16px;
  border-top: 1px solid rgba(18, 48, 79, 0.08);
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.76rem;
  color: #627d98;
}

.legend-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
}

.legend-dot.completed {
  background: #4caf50;
  border: 2px solid #4caf50;
}

.legend-dot.current {
  background: #2196f3;
  border: 2px solid #2196f3;
  animation: pulse 2s infinite;
}

.legend-dot.pending {
  background: #d9e2ec;
  border: 2px solid #d9e2ec;
}

.legend-dot.cancelled {
  background: #f44336;
  border: 2px solid #f44336;
}

.action-footer {
  padding: 12px 16px calc(12px + env(safe-area-inset-bottom, 0px));
  border-top: 1px solid rgba(18, 48, 79, 0.08);
  background: rgba(255, 255, 255, 0.96) !important;
  backdrop-filter: blur(18px);
}

.action-buttons {
  width: 100%;
  max-width: 960px;
  margin: 0 auto;
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 12px;
}

@keyframes pulse {
  0% {
    box-shadow: 0 0 0 0 rgba(33, 150, 243, 0.36);
  }
  70% {
    box-shadow: 0 0 0 8px rgba(33, 150, 243, 0);
  }
  100% {
    box-shadow: 0 0 0 0 rgba(33, 150, 243, 0);
  }
}

@media (max-width: 960px) {
  .hero-card__top {
    flex-direction: column;
    align-items: flex-start;
  }

  .content-grid,
  .content-grid--two {
    grid-template-columns: 1fr;
  }

  .hero-stats,
  .hero-context {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 720px) {
  .order-page {
    --order-header-offset: calc(env(safe-area-inset-top, 0px) + 56px);
  }

  .order-header__inner {
    padding: 8px 12px 10px;
  }

  .order-header h1 {
    font-size: 0.98rem;
  }

  .order-shell {
    padding: 14px 12px calc(124px + env(safe-area-inset-bottom, 0px));
  }

  .hero-card {
    padding: 16px;
    border-radius: 20px;
  }

  .hero-card__progress h2 {
    font-size: 1.08rem;
  }

  .tabs-container {
    top: calc(var(--order-header-offset) + 8px);
  }

  .window-container {
    padding-top: 14px;
  }

  .hero-stats,
  .hero-context {
    grid-template-columns: 1fr;
  }

  .info-item {
    flex-direction: column;
    gap: 4px;
  }

  .value {
    text-align: left;
  }

  .product-layout {
    grid-template-columns: auto 1fr;
  }

  .item-total {
    grid-column: 2;
    justify-self: start;
  }

  .timeline-container {
    padding-left: 22px;
  }

  .timeline-icon {
    width: 32px;
    height: 32px;
  }

  .timeline-item::before {
    left: 15px;
    top: 32px;
  }

  .timeline-header {
    flex-direction: column;
    align-items: flex-start;
  }

  .action-buttons {
    flex-direction: column;
  }
}
</style>
