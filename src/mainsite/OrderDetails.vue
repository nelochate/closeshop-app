<script setup lang="ts">
import { ref, onMounted, computed, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { supabase } from '@/utils/supabase'

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

// Timer state - Initialize with default values
const timeRemaining = ref<number>(300) // Start with 5 minutes (300 seconds)
const canCancel = ref<boolean>(true) // Start as true until we verify
let timerInterval: number | null = null

// Get current user
const getCurrentUser = async () => {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    currentUser.value = user
  } catch (err) {
    console.error('Error getting current user:', err)
  }
}

// Calculate time remaining for cancellation
const calculateTimeRemaining = () => {
  if (!order.value || !order.value.created_at) {
    console.log('No order or created_at, returning default 300')
    return 300 // Default to 5 minutes if no data
  }
  
  const orderCreatedAt = new Date(order.value.created_at).getTime()
  const currentTime = new Date().getTime()
  const timeElapsed = (currentTime - orderCreatedAt) / 1000 // in seconds
  const maxCancelTime = 5 * 60 // 5 minutes in seconds
  
  const remaining = Math.max(0, maxCancelTime - timeElapsed)
  console.log(`Time remaining: ${remaining} seconds (elapsed: ${timeElapsed})`)
  return Math.floor(remaining)
}

// Format time remaining as MM:SS
const formatTimeRemaining = () => {
  const remaining = timeRemaining.value
  if (remaining <= 0) return '00:00'
  
  const minutes = Math.floor(remaining / 60)
  const seconds = remaining % 60
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
}

// Start the cancellation timer
const startCancelTimer = () => {
  console.log('🚀 Starting cancel timer...')
  
  // Clear existing timer if any
  if (timerInterval) {
    clearInterval(timerInterval)
    timerInterval = null
  }
  
  // Calculate initial time remaining
  const initialRemaining = calculateTimeRemaining()
  timeRemaining.value = initialRemaining
  canCancel.value = initialRemaining > 0 && order.value?.status === 'pending'
  
  console.log(`Initial state - Remaining: ${initialRemaining}, CanCancel: ${canCancel.value}, Status: ${order.value?.status}`)
  
  // Start interval to update timer
  if (initialRemaining > 0 && order.value?.status === 'pending') {
    timerInterval = setInterval(() => {
      const newRemaining = calculateTimeRemaining()
      timeRemaining.value = newRemaining
      canCancel.value = newRemaining > 0 && order.value?.status === 'pending'
      
      console.log(`Timer tick - Remaining: ${newRemaining}, CanCancel: ${canCancel.value}`)
      
      // Stop timer when time runs out
      if (newRemaining <= 0) {
        if (timerInterval) {
          clearInterval(timerInterval)
          timerInterval = null
        }
        canCancel.value = false
        console.log('⏰ Timer expired - Cancel button disabled')
      }
    }, 1000)
  } else {
    console.log('Timer not started - conditions not met:', {
      remaining: initialRemaining,
      status: order.value?.status
    })
  }
}

// Cancel order with time check
const cancelOrder = async () => {
  console.log('Cancel button clicked')
  
  // Double-check if cancellation is still allowed
  const remaining = calculateTimeRemaining()
  
  if (remaining <= 0) {
    alert('Cancellation window has expired. You can no longer cancel this order.')
    canCancel.value = false
    return
  }
  
  // Confirm cancellation
  const confirmed = confirm(
    `Are you sure you want to cancel this order?\n\n` +
    `You have ${formatTimeRemaining()} left to cancel.`
  )
  
  if (!confirmed) return
  
  try {
    const { error } = await supabase
      .from('orders')
      .update({ 
        status: 'cancelled',
        cancelled_at: new Date().toISOString()
      })
      .eq('id', orderId)
    
    if (error) throw error
    
    // Stop the timer
    if (timerInterval) {
      clearInterval(timerInterval)
      timerInterval = null
    }
    
    // Refresh order details
    await fetchOrderDetails()
    
    alert('Order has been cancelled successfully.')
    
  } catch (err) {
    console.error('Error cancelling order:', err)
    alert('Failed to cancel order. Please try again.')
  }
}

// Fetch order details
const fetchOrderDetails = async () => {
  try {
    loading.value = true
    error.value = null

    console.log('📦 Fetching order:', orderId)

    const { data: orderData, error: orderError } = await supabase
      .from('orders')
      .select(`
        *,
        order_items (
          id,
          product_id,
          quantity,
          price,
          selected_size,
          selected_variety,
          products (
            id,
            prod_name,
            main_img_urls,
            description,
            shop_id
          )
        ),
        buyer:profiles!orders_user_id_fkey (
          id,
          first_name,
          last_name,
          avatar_url,
          phone
        ),
        address:addresses!orders_address_id_fkey (
          id,
          recipient_name,
          phone,
          street,
          postal_code,
          purok,
          building,
          house_no,
          region_name,
          province_name,
          city_name,
          barangay_name
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

    console.log('Order details loaded:', {
      status: order.value?.status,
      created_at: order.value?.created_at,
      user_id: order.value?.user_id,
      current_user_id: currentUser.value?.id
    })

    if (orderItems.value.length > 0 && orderItems.value[0].products?.shop_id) {
      await fetchShopAndSeller(orderItems.value[0].products.shop_id)
    }
    
    // Start the cancellation timer for pending orders
    if (order.value?.status === 'pending') {
      console.log('Order is pending, starting timer...')
      startCancelTimer()
    } else {
      console.log('Order is not pending, timer not started')
      canCancel.value = false
      timeRemaining.value = 0
    }

    console.log('✅ Order loaded:', order.value)

  } catch (err: any) {
    console.error('❌ Error fetching order:', err)
    error.value = err.message || 'Failed to load order details'
  } finally {
    loading.value = false
  }
}

// Fetch shop and seller information
const fetchShopAndSeller = async (shopId: string) => {
  try {
    const { data: shopData, error: shopError } = await supabase
      .from('shops')
      .select('*')
      .eq('id', shopId)
      .single()

    if (shopError) throw shopError

    shop.value = shopData

    if (shopData.owner_id) {
      const { data: sellerData, error: sellerError } = await supabase
        .from('profiles')
        .select('id, first_name, last_name, avatar_url, phone')
        .eq('id', shopData.owner_id)
        .single()

      if (sellerError) {
        console.error('Error fetching seller profile:', sellerError)
      } else {
        seller.value = sellerData
      }
    }

  } catch (err) {
    console.error('❌ Error fetching shop/seller:', err)
  }
}

// Computed properties
const subtotal = computed(() => {
  return orderItems.value.reduce((sum, item) => sum + (item.price * item.quantity), 0)
})

const totalAmount = computed(() => {
  return order.value?.total_amount || subtotal.value
})

const statusColor = computed(() => {
  const status = order.value?.status
  switch (status) {
    case 'pending': return 'warning'
    case 'paid': return 'info'
    case 'shipped': return 'primary'
    case 'delivered': return 'success'
    case 'cancelled': return 'error'
    default: return 'grey'
  }
})

const statusIcon = computed(() => {
  const status = order.value?.status
  switch (status) {
    case 'pending': return 'mdi-clock-outline'
    case 'paid': return 'mdi-credit-card-check'
    case 'shipped': return 'mdi-truck-delivery'
    case 'delivered': return 'mdi-check-circle'
    case 'cancelled': return 'mdi-close-circle'
    default: return 'mdi-help-circle'
  }
})

// Check user roles for action buttons
const isBuyer = computed(() => {
  const result = currentUser.value?.id === order.value?.user_id
  console.log(`Is buyer: ${result} (Current: ${currentUser.value?.id}, Order user: ${order.value?.user_id})`)
  return result
})

const isSeller = computed(() => {
  return currentUser.value?.id === shop.value?.owner_id
})

// Show cancel button always for pending orders, but control enabled state
const showCancelButton = computed(() => {
  const show = isBuyer.value && order.value?.status === 'pending'
  console.log(`Show cancel button: ${show}`)
  return show
})

// Check if cancel button should be disabled
const isCancelDisabled = computed(() => {
  const disabled = !canCancel.value || timeRemaining.value <= 0
  console.log(`Cancel disabled: ${disabled} (canCancel: ${canCancel.value}, timeRemaining: ${timeRemaining.value})`)
  return disabled
})

// Get cancel button text based on timer state
const getCancelButtonText = computed(() => {
  if (timeRemaining.value <= 0) {
    return 'Cancellation Unavailable'
  }
  return `Cancel Order (${formatTimeRemaining()})`
})

// Format date
const formatDate = (dateString: string) => {
  if (!dateString) return 'Not set'
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

// Format time
const formatTime = (timeString: string) => {
  if (!timeString) return 'Not set'
  try {
    const [hours, minutes] = timeString.split(':')
    const hour = parseInt(hours)
    const period = hour >= 12 ? 'PM' : 'AM'
    const hour12 = hour % 12 || 12
    return `${hour12}:${minutes} ${period}`
  } catch {
    return timeString
  }
}

// Format currency
const formatCurrency = (amount: number) => {
  return `₱${amount?.toFixed(2) || '0.00'}`
}

// Get product image
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

// Build full address from address object
const buildFullAddress = computed(() => {
  if (!shippingAddress.value) return 'No shipping address provided'
  
  const address = shippingAddress.value
  const parts = [
    address.house_no,
    address.building,
    address.street,
    address.purok,
    address.barangay_name,
    address.city_name,
    address.province_name,
    address.region_name,
    address.postal_code
  ].filter(Boolean)
  
  return parts.join(', ')
})

// Navigation functions
const goBack = () => router.back()
const viewProduct = (productId: string) => {
  router.push(`/viewproduct/${productId}`)
}
const contactSeller = () => {
  if (shop.value?.owner_id) {
    router.push(`/chat/${shop.value.owner_id}`)
  }
}
const contactBuyer = () => {
  if (buyer.value?.id) {
    router.push(`/chat/${buyer.value.id}`)
  }
}

// Action functions
const markAsShipped = async () => {
  try {
    const { error } = await supabase
      .from('orders')
      .update({ status: 'shipped' })
      .eq('id', orderId)
    
    if (error) throw error
    
    await fetchOrderDetails()
  } catch (err) {
    console.error('Error marking as shipped:', err)
  }
}

const markAsDelivered = async () => {
  try {
    const { error } = await supabase
      .from('orders')
      .update({ status: 'delivered' })
      .eq('id', orderId)
    
    if (error) throw error
    
    await fetchOrderDetails()
  } catch (err) {
    console.error('Error marking as delivered:', err)
  }
}

// Clean up timer on component unmount
onUnmounted(() => {
  if (timerInterval) {
    clearInterval(timerInterval)
    timerInterval = null
  }
})

// Initialize
onMounted(async () => {
  console.log('Component mounted, initializing...')
  await getCurrentUser()
  await fetchOrderDetails()
})
</script>

<template>
  <v-app>
    <!-- Header -->
    <v-app-bar flat color="white" elevation="1">
      <v-btn icon @click="goBack">
        <v-icon>mdi-arrow-left</v-icon>
      </v-btn>
      <v-toolbar-title class="font-weight-bold">Order Details</v-toolbar-title>
      <v-spacer />
      <v-chip v-if="order?.status" :color="statusColor" variant="flat" class="mr-2">
        <v-icon start small>{{ statusIcon }}</v-icon>
        {{ order.status.toUpperCase() }}
      </v-chip>
    </v-app-bar>

    <v-main>
      <!-- Loading State -->
      <div v-if="loading" class="loading-container">
        <v-progress-circular indeterminate color="primary" size="64" />
        <p class="text-h6 mt-4">Loading order details...</p>
      </div>

      <!-- Error State -->
      <div v-else-if="error" class="error-container">
        <v-icon color="error" size="64">mdi-alert-circle-outline</v-icon>
        <p class="text-h6 mt-4">{{ error }}</p>
        <v-btn color="primary" class="mt-4" @click="fetchOrderDetails">
          Try Again
        </v-btn>
        <v-btn variant="outlined" class="mt-2" @click="goBack">
          Go Back
        </v-btn>
      </div>

      <!-- Order Content -->
      <div v-else-if="order" class="order-content">
        <!-- Tabs -->
        <v-tabs v-model="activeTab" color="primary" class="tabs-container">
          <v-tab value="details">Details</v-tab>
          <v-tab value="timeline">Timeline</v-tab>
        </v-tabs>

        <v-window v-model="activeTab" class="window-container">
          <!-- Details Tab -->
          <v-window-item value="details">
            <div class="details-content">
              
              <!-- Cancellation Timer Alert -->
              <v-alert
                v-if="showCancelButton"
                :type="timeRemaining > 0 ? 'warning' : 'error'"
                variant="tonal"
                class="mb-4"
                dense
              >
                <v-row align="center" no-gutters>
                  <v-col cols="auto" class="mr-3">
                    <v-icon>{{ timeRemaining > 0 ? 'mdi-timer-sand' : 'mdi-timer-off' }}</v-icon>
                  </v-col>
                  <v-col>
                    <strong>
                      <span v-if="timeRemaining > 0">
                        Cancel within {{ formatTimeRemaining() }}
                      </span>
                      <span v-else>
                        Cancellation window has expired
                      </span>
                    </strong>
                    <span class="d-block text-caption">
                      <span v-if="timeRemaining > 0">
                        You can only cancel this order within 5 minutes of placing it.
                      </span>
                      <span v-else>
                        This order can no longer be cancelled. Please contact support if you need assistance.
                      </span>
                    </span>
                  </v-col>
                </v-row>
              </v-alert>

              <!-- Order Summary -->
              <v-card class="mb-4" elevation="1">
                <v-card-title class="section-title">
                  <v-icon left>mdi-receipt</v-icon>
                  Order Summary
                </v-card-title>
                <v-card-text>
                  <v-row>
                    <v-col cols="6">
                      <div class="info-item">
                        <span class="label">Order ID:</span>
                        <span class="value">{{ order.id }}</span>
                      </div>
                      <div class="info-item">
                        <span class="label">Transaction #:</span>
                        <span class="value">{{ order.transaction_number || 'N/A' }}</span>
                      </div>
                    </v-col>
                    <v-col cols="6">
                      <div class="info-item">
                        <span class="label">Order Date:</span>
                        <span class="value">{{ formatDate(order.created_at) }}</span>
                      </div>
                      <div class="info-item">
                        <span class="label">Delivery Option:</span>
                        <span class="value">{{ order.delivery_option || 'Standard' }}</span>
                      </div>
                    </v-col>
                    <v-col cols="6">
                      <div class="info-item">
                        <span class="label">Payment Method:</span>
                        <span class="value">{{ order.payment_method || 'Cash on Delivery' }}</span>
                      </div>
                    </v-col>
                    <v-col cols="6">
                      <div class="info-item">
                        <span class="label">Delivery Date/Time:</span>
                        <span class="value">
                          <span v-if="order.delivery_date">{{ formatDate(order.delivery_date) }}</span>
                          <span v-if="order.delivery_time"> at {{ formatTime(order.delivery_time) }}</span>
                          <span v-if="!order.delivery_date && !order.delivery_time">Not scheduled</span>
                        </span>
                      </div>
                    </v-col>
                    <v-col cols="12" v-if="order.note">
                      <div class="info-item">
                        <span class="label">Order Note:</span>
                        <span class="value">{{ order.note }}</span>
                      </div>
                    </v-col>
                  </v-row>
                </v-card-text>
              </v-card>

              <!-- Products -->
              <v-card class="mb-4" elevation="1">
                <v-card-title class="section-title">
                  <v-icon left>mdi-package-variant</v-icon>
                  Products ({{ orderItems.length }})
                </v-card-title>
                <v-card-text>
                  <div v-for="item in orderItems" :key="item.id" class="product-item">
                    <v-row align="center">
                      <v-col cols="auto">
                        <v-img
                          :src="getProductImage(item.products)"
                          :alt="item.products?.prod_name"
                          width="60"
                          height="60"
                          class="product-image"
                          @click="viewProduct(item.product_id)"
                          style="cursor: pointer;"
                        />
                      </v-col>
                      <v-col>
                        <div class="product-name">{{ item.products?.prod_name }}</div>
                        <div class="product-details">
                          <span class="quantity">Qty: {{ item.quantity }}</span>
                          <span v-if="item.selected_size" class="size">Size: {{ item.selected_size }}</span>
                          <span v-if="item.selected_variety" class="variety">Variety: {{ item.selected_variety }}</span>
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

              <!-- Buyer Information -->
              <v-card class="mb-4" elevation="1">
                <v-card-title class="section-title">
                  <v-icon left>mdi-account-outline</v-icon>
                  Buyer Information
                </v-card-title>
                <v-card-text>
                  <v-row>
                    <v-col cols="12" sm="6">
                      <div class="info-item">
                        <span class="label">Name:</span>
                        <span class="value">{{ buyer?.first_name }} {{ buyer?.last_name }}</span>
                      </div>
                      <div class="info-item">
                        <span class="label">Phone:</span>
                        <span class="value">{{ buyer?.phone || 'Not provided' }}</span>
                      </div>
                    </v-col>
                    <v-col cols="12" sm="6">
                      <v-btn 
                        color="primary" 
                        variant="outlined" 
                        size="small" 
                        class="mt-2"
                        @click="contactBuyer"
                        :disabled="!buyer?.id"
                      >
                        <v-icon left small>mdi-message</v-icon>
                        Contact Buyer
                      </v-btn>
                    </v-col>
                  </v-row>
                </v-card-text>
              </v-card>

              <!-- Seller Information -->
              <v-card class="mb-4" elevation="1" v-if="shop">
                <v-card-title class="section-title">
                  <v-icon left>mdi-store</v-icon>
                  Seller Information
                </v-card-title>
                <v-card-text>
                  <v-row>
                    <v-col cols="12" sm="6">
                      <div class="info-item">
                        <span class="label">Shop Name:</span>
                        <span class="value">{{ shop.business_name }}</span>
                      </div>
                      <div class="info-item" v-if="seller">
                        <span class="label">Seller:</span>
                        <span class="value">{{ seller.first_name }} {{ seller.last_name }}</span>
                      </div>
                    </v-col>
                    <v-col cols="12" sm="6">
                      <div class="info-item" v-if="seller">
                        <span class="label">Phone:</span>
                        <span class="value">{{ seller.phone || 'Not provided' }}</span>
                      </div>
                      <v-btn 
                        color="primary" 
                        variant="outlined" 
                        size="small" 
                        class="mt-2"
                        @click="contactSeller"
                        :disabled="!shop?.owner_id"
                      >
                        <v-icon left small>mdi-message</v-icon>
                        Contact Seller
                      </v-btn>
                    </v-col>
                  </v-row>
                </v-card-text>
              </v-card>

              <!-- Shipping Address -->
              <v-card class="mb-4" elevation="1" v-if="shippingAddress">
                <v-card-title class="section-title">
                  <v-icon left>mdi-map-marker</v-icon>
                  Shipping Address
                </v-card-title>
                <v-card-text>
                  <div class="address-content">
                    <div class="recipient-info">
                      <strong>{{ shippingAddress.recipient_name }}</strong>
                      <span v-if="shippingAddress.phone"> • {{ shippingAddress.phone }}</span>
                    </div>
                    <div class="address-details">
                      {{ buildFullAddress }}
                    </div>
                  </div>
                </v-card-text>
              </v-card>

              <!-- Price Breakdown -->
              <v-card class="mb-4" elevation="1">
                <v-card-title class="section-title">
                  <v-icon left>mdi-cash</v-icon>
                  Price Breakdown
                </v-card-title>
                <v-card-text>
                  <div class="price-breakdown">
                    <div class="price-item">
                      <span class="label">Subtotal:</span>
                      <span class="value">{{ formatCurrency(subtotal) }}</span>
                    </div>
                    <v-divider class="my-2" />
                    <div class="price-item total">
                      <span class="label">Total Amount:</span>
                      <span class="value">{{ formatCurrency(totalAmount) }}</span>
                    </div>
                  </div>
                </v-card-text>
              </v-card>

            </div>
          </v-window-item>

          <!-- Timeline Tab -->
          <v-window-item value="timeline">
            <v-card elevation="1">
              <v-card-title class="section-title">
                <v-icon left>mdi-timeline</v-icon>
                Order Timeline
              </v-card-title>
              <v-card-text>
                <v-timeline align="start" side="end">
                  <v-timeline-item dot-color="primary" size="small">
                    <div class="timeline-content">
                      <div class="timeline-title">Order Placed</div>
                      <div class="timeline-date">{{ formatDate(order.created_at) }}</div>
                      <div class="timeline-description">Order has been successfully placed</div>
                    </div>
                  </v-timeline-item>

                  <v-timeline-item 
                    :dot-color="['paid', 'shipped', 'delivered'].includes(order.status) ? 'primary' : 'grey'" 
                    size="small"
                  >
                    <div class="timeline-content">
                      <div class="timeline-title">Payment Confirmed</div>
                      <div class="timeline-date">
                        {{ order.status !== 'pending' ? 'Confirmed' : 'Pending' }}
                      </div>
                      <div class="timeline-description">Payment has been verified</div>
                    </div>
                  </v-timeline-item>

                  <v-timeline-item 
                    :dot-color="['shipped', 'delivered'].includes(order.status) ? 'primary' : 'grey'" 
                    size="small"
                  >
                    <div class="timeline-content">
                      <div class="timeline-title">Order Shipped</div>
                      <div class="timeline-date">
                        {{ order.status === 'shipped' || order.status === 'delivered' ? 'Shipped' : 'Processing' }}
                      </div>
                      <div class="timeline-description">Order has been shipped to buyer</div>
                    </div>
                  </v-timeline-item>

                  <v-timeline-item 
                    :dot-color="order.status === 'delivered' ? 'success' : 'grey'" 
                    size="small"
                  >
                    <div class="timeline-content">
                      <div class="timeline-title">Order Delivered</div>
                      <div class="timeline-date">
                        {{ order.status === 'delivered' ? 'Delivered' : 'In Transit' }}
                      </div>
                      <div class="timeline-description">Order has been delivered to buyer</div>
                    </div>
                  </v-timeline-item>
                </v-timeline>
              </v-card-text>
            </v-card>
          </v-window-item>
        </v-window>
      </div>
    </v-main>

    <!-- Action Buttons -->
    <v-footer app class="action-footer pa-3" color="white" elevation="6" v-if="order">
      <div class="action-buttons">
        <!-- Buyer Actions -->
        <template v-if="isBuyer">
          <!-- Cancel Button - Always visible but disabled after timer expires -->
          <v-btn
            v-if="showCancelButton"
            :color="isCancelDisabled ? 'grey' : 'error'"
            :variant="isCancelDisabled ? 'outlined' : 'flat'"
            :disabled="isCancelDisabled"
            @click="cancelOrder"
            :class="{ 'cancel-btn': !isCancelDisabled }"
          >
            <v-icon left>{{ isCancelDisabled ? 'mdi-timer-off' : 'mdi-close-circle' }}</v-icon>
            {{ getCancelButtonText }}
          </v-btn>
          
          <v-btn
            v-if="order.status === 'shipped'"
            color="primary"
            variant="flat"
            @click="markAsDelivered"
          >
            <v-icon left>mdi-check</v-icon>
            Mark as Delivered
          </v-btn>
        </template>

        <!-- Seller Actions -->
        <template v-else-if="isSeller">
          <v-btn
            v-if="order.status === 'paid'"
            color="primary"
            variant="flat"
            @click="markAsShipped"
          >
            <v-icon left>mdi-truck</v-icon>
            Mark as Shipped
          </v-btn>
        </template>

        <v-btn variant="outlined" @click="goBack">
          Close
        </v-btn>
      </div>
    </v-footer>
  </v-app>
</template>

<style scoped>
.loading-container,
.error-container {
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
  color: #333;
  padding: 16px;
}

/* Product Items */
.product-item {
  padding: 12px 0;
  border-bottom: 1px solid #f0f0f0;
}

.product-item:last-child {
  border-bottom: none;
}

.product-name {
  font-weight: 600;
  color: #333;
  margin-bottom: 4px;
}

.product-details {
  display: flex;
  gap: 12px;
  font-size: 0.85rem;
  color: #666;
  margin-bottom: 4px;
}

.product-price {
  font-size: 0.9rem;
  color: #666;
}

.item-total {
  font-weight: 600;
  color: #333;
  font-size: 1rem;
}

.product-image {
  border-radius: 8px;
  border: 1px solid #f0f0f0;
}

/* Info Items */
.info-item {
  display: flex;
  justify-content: space-between;
  margin-bottom: 8px;
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

/* Price Breakdown */
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

/* Address */
.address-content {
  padding: 12px;
  background: #f8f9fa;
  border-radius: 8px;
  font-size: 0.95rem;
  line-height: 1.5;
}

.recipient-info {
  margin-bottom: 8px;
  font-size: 1rem;
}

.address-details {
  color: #666;
}

/* Timeline */
.timeline-content {
  padding-left: 16px;
}

.timeline-title {
  font-weight: 600;
  color: #333;
  margin-bottom: 4px;
}

.timeline-date {
  font-size: 0.85rem;
  color: #666;
  margin-bottom: 4px;
}

.timeline-description {
  font-size: 0.9rem;
  color: #666;
}

/* Action Footer */
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

/* Cancel Button Animation - Only when active */
.cancel-btn {
  animation: pulse 2s infinite;
}

@keyframes pulse {
  0% {
    box-shadow: 0 0 0 0 rgba(220, 53, 69, 0.4);
  }
  70% {
    box-shadow: 0 0 0 10px rgba(220, 53, 69, 0);
  }
  100% {
    box-shadow: 0 0 0 0 rgba(220, 53, 69, 0);
  }
}

/* Disabled button style */
.v-btn[disabled] {
  opacity: 0.6;
  cursor: not-allowed;
}

/* Responsive Design */
@media (max-width: 768px) {
  .window-container {
    padding: 12px;
  }
  
  .section-title {
    padding: 12px;
    font-size: 1rem;
  }
  
  .info-item {
    flex-direction: column;
    gap: 4px;
  }
  
  .value {
    text-align: left;
  }
  
  .action-buttons {
    flex-direction: column;
  }
  
  .product-details {
    flex-direction: column;
    gap: 4px;
  }
}

@media (max-width: 480px) {
  .order-content {
    padding-bottom: 120px;
  }
  
  .action-buttons {
    gap: 8px;
  }
}
</style>