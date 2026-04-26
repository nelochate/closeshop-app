<script setup lang="ts">
import { ref, onMounted, computed, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { supabase } from '@/utils/supabase'
import { notifyCustomerOrderStatus } from '@/utils/orderNotifications'

const route = useRoute()
const router = useRouter()
const orderId = route.params.id as string

// State
const order = ref<any>(null)
const orderItems = ref<any[]>([])
const buyer = ref<any>(null)
const seller = ref<any>(null)
const shop = ref<any>(null)
const shippingAddress = ref<any>(null)
const loading = ref(true)
const error = ref<string | null>(null)
const activeTab = ref('details')
const currentUser = ref<any>(null)
const riderDetails = ref<any>(null)
const userRole = ref<'buyer' | 'seller' | 'rider' | null>(null)

// Timer state
const timeRemaining = ref<number>(300)
const canCancel = ref<boolean>(true)
let timerInterval: number | null = null
let statusSubscription: any = null

// Get current user and determine role
const getCurrentUserAndRole = async () => {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    currentUser.value = user
    
    if (!user) return
    
    // Check if user is buyer (order owner)
    if (order.value && user.id === order.value.user_id) {
      userRole.value = 'buyer'
    }
    // Check if user is seller
    else if (shop.value && user.id === shop.value.owner_id) {
      userRole.value = 'seller'
    }
    // Check if user is rider
    else if (order.value && user.id === order.value.rider_id) {
      userRole.value = 'rider'
    }
    
    console.log('User role:', userRole.value)
  } catch (err) {
    console.error('Error getting user role:', err)
  }
}

// Fetch rider details
const fetchRiderDetails = async () => {
  if (!order.value?.rider_id) return
  
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
    })
    .subscribe()
}

// Fetch order details
const fetchOrderDetails = async () => {
  try {
    loading.value = true
    error.value = null

    const { data: orderData, error: orderError } = await supabase
      .from('orders')
      .select(`
        *,
        order_items (
          id, product_id, quantity, price, selected_size, selected_variety,
          products (id, prod_name, main_img_urls, description, shop_id)
        ),
        buyer:profiles!orders_user_id_fkey (id, first_name, last_name, avatar_url, phone),
        address:addresses!orders_address_id_fkey (
          id, recipient_name, phone, street, postal_code, purok, building, 
          house_no, region_name, province_name, city_name, barangay_name
        )
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

    if (orderItems.value.length > 0 && orderItems.value[0].products?.shop_id) {
      await fetchShopAndSeller(orderItems.value[0].products.shop_id)
    }
    
    await getCurrentUserAndRole()
    
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

// Fetch shop and seller
const fetchShopAndSeller = async (shopId: string) => {
  try {
    const { data: shopData } = await supabase
      .from('shops')
      .select('*')
      .eq('id', shopId)
      .single()
    
    if (shopData) {
      shop.value = shopData
      const { data: sellerData } = await supabase
        .from('profiles')
        .select('id, first_name, last_name, avatar_url, phone')
        .eq('id', shopData.owner_id)
        .single()
      if (sellerData) seller.value = sellerData
    }
  } catch (err) {
    console.error('Error fetching shop:', err)
  }
}

// Computed properties
const subtotal = computed(() => {
  return orderItems.value.reduce((sum, item) => sum + (item.price * item.quantity), 0)
})

const totalAmount = computed(() => order.value?.total_amount || subtotal.value)

const statusColor = computed(() => {
  const status = order.value?.status
  const colors: Record<string, string> = {
    pending_approval: 'warning',
    waiting_for_rider: 'info',
    accepted_by_rider: 'primary',
    picked_up: 'purple',
    delivered: 'success',
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
    cancelled: 'Cancelled'
  }
  return texts[status] || status
})

const isBuyer = computed(() => userRole.value === 'buyer')
const isSeller = computed(() => userRole.value === 'seller')
const isRider = computed(() => userRole.value === 'rider')

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
  const currentStatus = order.value?.status
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
  const currentStatus = order.value?.status
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
    const { data: { user } } = await supabase.auth.getUser()
    const riderData = await supabase
      .from('Rider_Registration')
      .select('rider_id')
      .eq('profile_id', user?.id)
      .single()
    
    const { error } = await supabase
      .from('orders')
      .update({ 
        status: 'accepted_by_rider',
        accepted_at: new Date().toISOString(),
        rider_id: riderData.data?.rider_id
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
  const parts = [
    shippingAddress.value.house_no,
    shippingAddress.value.building,
    shippingAddress.value.street,
    shippingAddress.value.purok,
    shippingAddress.value.barangay_name,
    shippingAddress.value.city_name,
    shippingAddress.value.province_name
  ].filter(Boolean)
  return parts.join(', ')
})

const goBack = () => router.back()
const viewProduct = (productId: string) => router.push(`/viewproduct/${productId}`)
const contactSeller = () => shop.value?.owner_id && router.push(`/chat/${shop.value.owner_id}`)
const contactBuyer = () => buyer.value?.id && router.push(`/chat/${buyer.value.id}`)
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
    <v-app-bar flat color="white" elevation="1">
      <v-btn icon @click="goBack"><v-icon>mdi-arrow-left</v-icon></v-btn>
      <v-toolbar-title class="font-weight-bold">Order Details</v-toolbar-title>
      <v-spacer />
      <v-chip v-if="order?.status" :color="statusColor" variant="flat">
        <v-icon start small>{{ statusIcon }}</v-icon>
        {{ statusDisplayText }}
      </v-chip>
    </v-app-bar>

    <v-main>
      <div v-if="loading" class="loading-container">
        <v-progress-circular indeterminate color="primary" size="64" />
        <p>Loading order details...</p>
      </div>

      <div v-else-if="error" class="error-container">
        <v-icon color="error" size="64">mdi-alert-circle-outline</v-icon>
        <p>{{ error }}</p>
        <v-btn color="primary" @click="fetchOrderDetails">Try Again</v-btn>
      </div>

      <div v-else-if="order" class="order-content">
        <!-- Progress Bar -->
        <div class="progress-section" v-if="order.status !== 'cancelled'">
          <v-progress-linear :model-value="timelineProgress" height="6" color="primary" rounded />
          <div class="progress-text">
            <span v-if="order.status === 'delivered'">🎉 Order Delivered!</span>
            <span v-else-if="order.status === 'picked_up'">🚚 Out for Delivery</span>
            <span v-else-if="order.status === 'accepted_by_rider'">🏍️ Rider on the way</span>
            <span v-else-if="order.status === 'waiting_for_rider'">⏳ Looking for a rider</span>
            <span v-else-if="order.status === 'pending_approval'">📝 Waiting for seller approval</span>
          </div>
        </div>

        <v-tabs v-model="activeTab" color="primary" class="tabs-container">
          <v-tab value="details">Order Details</v-tab>
          <v-tab value="timeline">Timeline</v-tab>
        </v-tabs>

        <v-window v-model="activeTab" class="window-container">
          <!-- Details Tab -->
          <v-window-item value="details">
            <div class="details-content">
              <!-- Cancellation Alert -->
              <v-alert v-if="showCancelButton" :type="timeRemaining > 0 ? 'warning' : 'error'" variant="tonal" class="mb-4">
                <v-row align="center" no-gutters>
                  <v-col cols="auto" class="mr-3">
                    <v-icon>{{ timeRemaining > 0 ? 'mdi-timer-sand' : 'mdi-timer-off' }}</v-icon>
                  </v-col>
                  <v-col>
                    <strong v-if="timeRemaining > 0">Cancel within {{ formatTimeRemaining() }}</strong>
                    <strong v-else>Cancellation window expired</strong>
                  </v-col>
                </v-row>
              </v-alert>

              <!-- Order Summary -->
              <v-card class="mb-4">
                <v-card-title class="section-title"><v-icon left>mdi-receipt</v-icon>Order Summary</v-card-title>
                <v-card-text>
                  <v-row>
                    <v-col cols="6">
                      <div class="info-item"><span class="label">Order ID:</span><span class="value">{{ order.id.slice(0,8) }}...</span></div>
                      <div class="info-item"><span class="label">Order Date:</span><span class="value">{{ formatDate(order.created_at) }}</span></div>
                    </v-col>
                    <v-col cols="6">
                      <div class="info-item"><span class="label">Delivery:</span><span class="value">{{ order.delivery_option || 'Standard' }}</span></div>
                      <div class="info-item"><span class="label">Payment:</span><span class="value">{{ order.payment_method || 'Cash' }}</span></div>
                    </v-col>
                    <v-col cols="12" v-if="order.note">
                      <div class="info-item"><span class="label">Note:</span><span class="value">{{ order.note }}</span></div>
                    </v-col>
                  </v-row>
                </v-card-text>
              </v-card>

              <!-- Rider Info -->
              <v-card class="mb-4" v-if="riderDetails && order.status !== 'pending_approval'">
                <v-card-title class="section-title"><v-icon left>mdi-motorbike</v-icon>Rider Information</v-card-title>
                <v-card-text>
                  <div class="info-item"><span class="label">Name:</span><span class="value">{{ riderDetails.first_name }} {{ riderDetails.last_name }}</span></div>
                  <div class="info-item"><span class="label">Phone:</span><span class="value">{{ riderDetails.phone || 'Not provided' }}</span></div>
                  <v-btn color="primary" variant="outlined" size="small" @click="contactRider" :disabled="!riderDetails?.phone">
                    <v-icon left small>mdi-phone</v-icon>Contact Rider
                  </v-btn>
                </v-card-text>
              </v-card>

              <!-- Products -->
              <v-card class="mb-4">
                <v-card-title class="section-title"><v-icon left>mdi-package-variant</v-icon>Products ({{ orderItems.length }})</v-card-title>
                <v-card-text>
                  <div v-for="item in orderItems" :key="item.id" class="product-item">
                    <v-row align="center">
                      <v-col cols="auto">
                        <v-img :src="getProductImage(item.products)" width="60" height="60" class="product-image" @click="viewProduct(item.product_id)" style="cursor:pointer"/>
                      </v-col>
                      <v-col>
                        <div class="product-name">{{ item.products?.prod_name }}</div>
                        <div class="product-details">
                          <span>Qty: {{ item.quantity }}</span>
                          <span v-if="item.selected_size">Size: {{ item.selected_size }}</span>
                          <span v-if="item.selected_variety">Variety: {{ item.selected_variety }}</span>
                        </div>
                        <div class="product-price">{{ formatCurrency(item.price) }} each</div>
                      </v-col>
                      <v-col cols="auto">
                        <div class="item-total">{{ formatCurrency(item.price * item.quantity) }}</div>
                      </v-col>
                    </v-row>
                  </div>
                </v-card-text>
              </v-card>

              <!-- Price Breakdown -->
              <v-card class="mb-4">
                <v-card-title class="section-title"><v-icon left>mdi-cash</v-icon>Price Breakdown</v-card-title>
                <v-card-text>
                  <div class="price-breakdown">
                    <div class="price-item"><span>Subtotal:</span><span>{{ formatCurrency(subtotal) }}</span></div>
                    <div class="price-item total"><span>Total:</span><span>{{ formatCurrency(totalAmount) }}</span></div>
                  </div>
                </v-card-text>
              </v-card>

              <!-- Delivery Address -->
              <v-card class="mb-4" v-if="shippingAddress">
                <v-card-title class="section-title"><v-icon left>mdi-map-marker</v-icon>Delivery Address</v-card-title>
                <v-card-text>
                  <div class="address-content">
                    <strong>{{ shippingAddress.recipient_name }}</strong>
                    <span v-if="shippingAddress.phone"> • {{ shippingAddress.phone }}</span>
                    <div class="address-details">{{ buildFullAddress }}</div>
                  </div>
                </v-card-text>
              </v-card>
            </div>
          </v-window-item>

          <!-- Timeline Tab -->
          <v-window-item value="timeline">
            <v-card>
              <v-card-title class="section-title"><v-icon left>mdi-timeline</v-icon>Order Timeline</v-card-title>
              <v-card-text>
                <div class="timeline-container">
                  <div v-for="step in timelineSteps" :key="step.key" class="timeline-item"
                    :class="{
                      'timeline-completed': step.status === 'completed',
                      'timeline-current': step.status === 'current',
                      'timeline-pending': step.status === 'pending',
                      'timeline-cancelled': step.status === 'cancelled'
                    }">
                    <div class="timeline-icon">
                      <v-icon :color="step.status === 'completed' ? '#4caf50' : step.status === 'current' ? '#2196f3' : step.status === 'cancelled' ? '#f44336' : '#9e9e9e'">
                        {{ step.icon }}
                      </v-icon>
                    </div>
                    <div class="timeline-content">
                      <div class="timeline-header">
                        <h4>{{ step.title }}</h4>
                        <span class="timeline-date">{{ formatDate(step.date) }}</span>
                      </div>
                      <p>{{ step.description }}</p>
                      <v-chip v-if="step.actor" size="x-small" variant="tonal" class="mt-1">
                        {{ step.actor }}
                      </v-chip>
                    </div>
                  </div>
                </div>

                <div class="timeline-legend">
                  <div class="legend-item"><div class="legend-dot completed"></div><span>Completed</span></div>
                  <div class="legend-item"><div class="legend-dot current"></div><span>Current</span></div>
                  <div class="legend-item"><div class="legend-dot pending"></div><span>Pending</span></div>
                  <div v-if="order.status === 'cancelled'" class="legend-item"><div class="legend-dot cancelled"></div><span>Cancelled</span></div>
                </div>
              </v-card-text>
            </v-card>
          </v-window-item>
        </v-window>
      </div>
    </v-main>

    <!-- Action Buttons Footer -->
    <v-footer app class="action-footer pa-3" color="white" elevation="6" v-if="order && !loading">
      <div class="action-buttons">
        <!-- Buyer Actions -->
        <template v-if="isBuyer">
          <v-btn v-if="showCancelButton" :color="isCancelDisabled ? 'grey' : 'error'" :disabled="isCancelDisabled" @click="cancelOrder">
            <v-icon left>mdi-close-circle</v-icon>{{ getCancelButtonText }}
          </v-btn>
        </template>

        <!-- Seller Actions -->
        <template v-else-if="isSeller">
          <v-btn v-if="order.status === 'pending_approval'" color="success" @click="approveOrder">
            <v-icon left>mdi-check-circle</v-icon>Approve Order
          </v-btn>
          <v-btn v-if="order.status === 'pending_approval'" color="error" variant="outlined" @click="rejectOrder">
            <v-icon left>mdi-close-circle</v-icon>Reject Order
          </v-btn>
          <v-btn v-if="order.status === 'picked_up'" color="success" @click="markAsDelivered">
            <v-icon left>mdi-check</v-icon>Mark Delivered
          </v-btn>
        </template>

        <!-- Rider Actions -->
        <template v-else-if="isRider">
          <v-btn v-if="order.status === 'waiting_for_rider'" color="primary" @click="acceptOrderAsRider">
            <v-icon left>mdi-check-circle</v-icon>Accept Order
          </v-btn>
          <v-btn v-if="order.status === 'accepted_by_rider'" color="warning" @click="markAsPickedUp">
            <v-icon left>mdi-package-up</v-icon>Mark as Picked Up
          </v-btn>
          <v-btn v-if="order.status === 'picked_up'" color="success" @click="markAsDelivered">
            <v-icon left>mdi-check</v-icon>Mark Delivered
          </v-btn>
        </template>

        <v-btn variant="outlined" @click="goBack">Close</v-btn>
      </div>
    </v-footer>
  </v-app>
</template>

<style scoped>
.loading-container, .error-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 60vh;
  text-align: center;
}

.order-content {
  padding-bottom: 80px;
}

.progress-section {
  padding: 16px;
  background: white;
  border-bottom: 1px solid #e0e0e0;
}

.progress-text {
  text-align: center;
  margin-top: 8px;
  font-size: 0.85rem;
  font-weight: 500;
  color: #354d7c;
}

.tabs-container {
  background: white;
  position: sticky;
  top: 0;
  z-index: 100;
}

.window-container {
  padding: 16px;
}

.details-content {
  max-width: 800px;
  margin: 0 auto;
}

.section-title {
  font-size: 1.1rem;
  font-weight: 600;
  padding: 16px;
}

.product-item {
  padding: 12px 0;
  border-bottom: 1px solid #f0f0f0;
}

.product-name {
  font-weight: 600;
  margin-bottom: 4px;
}

.product-details {
  display: flex;
  gap: 12px;
  font-size: 0.85rem;
  color: #666;
  margin-bottom: 4px;
  flex-wrap: wrap;
}

.product-price {
  font-size: 0.9rem;
  color: #666;
}

.item-total {
  font-weight: 600;
  font-size: 1rem;
}

.product-image {
  border-radius: 8px;
  border: 1px solid #f0f0f0;
}

.info-item {
  display: flex;
  justify-content: space-between;
  padding: 8px 0;
}

.label {
  font-weight: 600;
  color: #666;
}

.value {
  color: #333;
  text-align: right;
}

.price-breakdown {
  max-width: 300px;
  margin: 0 auto;
}

.price-item {
  display: flex;
  justify-content: space-between;
  padding: 4px 0;
}

.price-item.total {
  border-top: 2px solid #e0e0e0;
  padding-top: 8px;
  margin-top: 8px;
  font-weight: 700;
  font-size: 1.1rem;
}

.address-content {
  padding: 12px;
  background: #f8f9fa;
  border-radius: 8px;
  font-size: 0.95rem;
  line-height: 1.5;
}

.address-details {
  color: #666;
  margin-top: 8px;
}

/* Timeline Styles */
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

.timeline-icon {
  flex-shrink: 0;
  width: 40px;
  height: 40px;
  background: white;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  z-index: 2;
  border: 2px solid #e0e0e0;
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
  border-color: #e0e0e0;
  background: #f5f5f5;
}

.timeline-cancelled .timeline-icon {
  border-color: #f44336;
  background: #ffebee;
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
  font-size: 1rem;
  font-weight: 600;
  margin: 0;
}

.timeline-date {
  font-size: 0.75rem;
  color: #999;
}

.timeline-content p {
  font-size: 0.85rem;
  color: #666;
  margin: 0;
}

.timeline-item::before {
  content: '';
  position: absolute;
  left: 19px;
  top: 40px;
  bottom: 0;
  width: 2px;
  background: #e0e0e0;
}

.timeline-item:last-child::before {
  display: none;
}

.timeline-completed::before {
  background: #4caf50;
}

.timeline-current::before {
  background: linear-gradient(to bottom, #4caf50 0%, #2196f3 100%);
}

@keyframes pulse {
  0% { box-shadow: 0 0 0 0 rgba(33, 150, 243, 0.4); }
  70% { box-shadow: 0 0 0 6px rgba(33, 150, 243, 0); }
  100% { box-shadow: 0 0 0 0 rgba(33, 150, 243, 0); }
}

.timeline-legend {
  display: flex;
  justify-content: center;
  gap: 24px;
  margin-top: 32px;
  padding-top: 16px;
  border-top: 1px solid #e0e0e0;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.75rem;
  color: #666;
}

.legend-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
}

.legend-dot.completed { background: #4caf50; border: 2px solid #4caf50; }
.legend-dot.current { background: #2196f3; border: 2px solid #2196f3; animation: pulse 2s infinite; }
.legend-dot.pending { background: #e0e0e0; border: 2px solid #e0e0e0; }
.legend-dot.cancelled { background: #f44336; border: 2px solid #f44336; }

.action-footer {
  border-top: 1px solid #e0e0e0;
}

.action-buttons {
  display: flex;
  gap: 12px;
  width: 100%;
  max-width: 800px;
  margin: 0 auto;
  justify-content: flex-end;
}

@media (max-width: 768px) {
  .window-container { padding: 12px; }
  .section-title { padding: 12px; font-size: 1rem; }
  .info-item { flex-direction: column; gap: 4px; }
  .value { text-align: left; }
  .action-buttons { flex-direction: column; }
  .timeline-container { padding-left: 20px; }
  .timeline-icon { width: 32px; height: 32px; }
  .timeline-item::before { left: 15px; top: 32px; }
  .timeline-header { flex-direction: column; gap: 4px; }
}
</style>
