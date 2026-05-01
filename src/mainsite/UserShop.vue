<script setup lang="ts">
import { ref, onMounted, computed, watch, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/utils/supabase'
import { notifyCustomerOrderStatus } from '@/utils/orderNotifications'
import { formatAppDateTime } from '@/utils/dateTime'

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
const approvingOrderId = ref(null)
const currentTime = ref(Date.now())
let currentTimeInterval: ReturnType<typeof setInterval> | null = null
let ordersSubscription: any = null

// Mobile state
const isMobile = ref(window.innerWidth < 768)

// Order section tabs
const activeOrderTab = ref('pending_approval')

// Order counts for each section
const orderCounts = computed(() => {
  const counts = {
    pending_approval: 0,
    waiting_for_rider: 0,
    active: 0,
    delivered: 0,
    cancelled: 0,
    all: orders.value.length
  }
  
  orders.value.forEach(order => {
    if (order.status === 'pending_approval') counts.pending_approval++
    else if (order.status === 'waiting_for_rider') counts.waiting_for_rider++
    else if (order.status === 'accepted_by_rider' || order.status === 'picked_up') counts.active++
    else if (order.status === 'delivered') counts.delivered++
    else if (order.status === 'cancelled') counts.cancelled++
  })
  
  return counts
})

// Approving order state for rider assignment
const pendingApprovalOrders = computed(() => {
  return orders.value.filter(order => order.status === 'pending_approval')
})

const waitingForRiderOrders = computed(() => {
  return orders.value.filter(order => order.status === 'waiting_for_rider')
})

const activeOrdersWithRiders = computed(() => {
  return orders.value.filter(order =>
    order.status === 'accepted_by_rider' ||
    (order.status === 'picked_up' && !order.delivered_at)
  )
})

const deliveredOrders = computed(() => {
  return orders.value.filter(order => isOrderDeliveredState(order))
})

const cancelledOrders = computed(() => {
  return orders.value.filter(order => order.status === 'cancelled')
})

const isOrderCompletedState = (order: any = {}) =>
  !!order.completed_at || order.status === 'completed'

const isOrderDeliveredState = (order: any = {}) =>
  isOrderCompletedState(order) ||
  order.status === 'delivered' ||
  (order.status === 'picked_up' && !!order.delivered_at && !order.completed_at)

// Add these helper functions
const getOrderStatusText = (order: any = {}) => {
  if (isOrderDeliveredState(order)) return isOrderCompletedState(order) ? 'Completed' : 'Delivered'

  const status = order.status
  const statusMap = {
    'pending_approval': 'Pending Approval',
    'waiting_for_rider': 'Waiting for Rider',
    'accepted_by_rider': 'Rider Accepted',
    'picked_up': 'Picked Up',
    'cancelled': 'Cancelled'
  }
  return statusMap[status] || status
}

const getOrderStatusColor = (order: any = {}) => {
  if (isOrderDeliveredState(order)) return 'success'

  const status = order.status
  const colorMap = {
    'pending_approval': 'warning',
    'waiting_for_rider': 'info',
    'accepted_by_rider': 'primary',
    'picked_up': 'warning',
    'cancelled': 'error'
  }
  return colorMap[status] || 'grey'
}

// Approve/reject functions
const approveOrder = async (order) => {
  if (!confirm(`Approve order #${getTransactionNumber(order)}? The order will be made available for riders.`)) {
    return
  }

  approvingOrderId.value = order.id

  try {
    const { data: { user } } = await supabase.auth.getUser()

    const { error } = await supabase
      .from('orders')
      .update({
        status: 'waiting_for_rider',
        approved_at: new Date().toISOString(),
        approved_by: user?.id
      })
      .eq('id', order.id)

    if (error) throw error

    alert('✅ Order approved! Riders can now accept this order.')
    await fetchOrders()

  } catch (error) {
    console.error('Error approving order:', error)
    alert('Failed to approve order. Please try again.')
  } finally {
    approvingOrderId.value = null
  }
}

const rejectOrder = async (order) => {
  if (!confirm(`Reject order #${getTransactionNumber(order)}? This action cannot be undone.`)) {
    return
  }

  try {
    const { error } = await supabase
      .from('orders')
      .update({
        status: 'cancelled',
        payment_status: 'cancelled'
      })
      .eq('id', order.id)

    if (error) throw error

    alert('❌ Order rejected and cancelled.')
    await fetchOrders()

  } catch (error) {
    console.error('Error rejecting order:', error)
    alert('Failed to reject order. Please try again.')
  }
}

const viewOrderDetails = (orderId) => {
  router.push({ name: 'order-details', params: { id: orderId } })
}

// Update mobile state on resize
const updateMobileState = () => {
  isMobile.value = window.innerWidth < 768
}

// Order sections configuration
const orderSections = [
  { 
    id: 'pending_approval', 
    title: 'Pending Approval', 
    icon: 'mdi-clock-outline', 
    color: 'warning',
    bgColor: 'warning-lighten-5',
    borderColor: '#ff9800'
  },
  { 
    id: 'waiting_for_rider', 
    title: 'Waiting for Rider', 
    icon: 'mdi-bike-fast', 
    color: 'info',
    bgColor: 'info-lighten-5',
    borderColor: '#2196f3'
  },
  { 
    id: 'active', 
    title: 'Active Deliveries', 
    icon: 'mdi-truck-delivery', 
    color: 'primary',
    bgColor: 'primary-lighten-5',
    borderColor: '#667eea'
  },
  { 
    id: 'delivered', 
    title: 'Delivered', 
    icon: 'mdi-truck-check', 
    color: 'success',
    bgColor: 'success-lighten-5',
    borderColor: '#4caf50'
  },
  { 
    id: 'cancelled', 
    title: 'Cancelled', 
    icon: 'mdi-cancel', 
    color: 'error',
    bgColor: 'error-lighten-5',
    borderColor: '#f44336'
  }
]

const transactionOptions = [
  { title: 'All Orders', value: 'all' },
  { title: 'Pending Approval', value: 'pending_approval' },
  { title: 'Waiting for Rider', value: 'waiting_for_rider' },
  { title: 'Active Deliveries', value: 'active' },
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

const getProfileDisplayName = (profile: any = {}) =>
  [profile?.first_name, profile?.last_name].filter(Boolean).join(' ').trim()

const getCustomerDisplayName = (order: any = {}) =>
  order.address?.recipient_name?.trim() || getProfileDisplayName(order.user) || 'Customer'

// Fixed fetchOrders function - removing the incorrect rider relationship
const fetchOrders = async () => {
  if (!shopId.value) {
    console.log('❌ No shop ID available')
    return
  }

  loadingOrders.value = true
  ordersError.value = ''
  currentTime.value = Date.now()

  try {
    console.log('🛍️ Fetching orders for shop:', shopId.value)

    const { data: ordersData, error: ordersError } = await supabase
      .from('orders')
      .select(`
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
        user:profiles!orders_user_id_fkey (
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
      `)
      .eq('shop_id', shopId.value)
      .order('created_at', { ascending: false })

    if (ordersError) throw ordersError

    console.log('✅ Orders loaded:', ordersData?.length || 0)

    // Process orders to add rider info separately if needed
    const ordersWithInfo = await Promise.all((ordersData || []).map(async (order) => {
      let riderInfo = null

      if (order.rider_id) {
        const { data: riderData } = await supabase
          .from('Rider_Registration')
          .select('rider_id, first_name, last_name, phone')
          .eq('rider_id', order.rider_id)
          .maybeSingle()

        if (riderData) {
          riderInfo = {
            name: `${riderData.first_name} ${riderData.last_name}`,
            phone: riderData.phone
          }
        }
      }

      const items = (order.order_items || []).map(item => ({
        id: item.id,
        name: item.product?.prod_name || 'Product',
        quantity: item.quantity,
        price: item.price,
        image: item.product?.main_img_urls?.[0] || null
      }))

      return {
        ...order,
        items,
        customer_name: getCustomerDisplayName(order),
        customer_phone: order.address?.phone || order.user?.phone || '',
        rider_details: riderInfo
      }
    }))

    orders.value = ordersWithInfo
  } catch (err) {
    console.error('❌ Error in fetchOrders:', err)
    ordersError.value = 'Error loading orders. Please try again.'
  } finally {
    loadingOrders.value = false
  }
}

const stopOrdersSubscription = () => {
  if (!ordersSubscription) return
  supabase.removeChannel(ordersSubscription)
  ordersSubscription = null
}

const subscribeToOrders = (targetShopId: string | null) => {
  stopOrdersSubscription()

  if (!targetShopId) return

  ordersSubscription = supabase
    .channel(`usershop-orders-${targetShopId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'orders',
        filter: `shop_id=eq.${targetShopId}`,
      },
      async () => {
        currentTime.value = Date.now()
        await fetchOrders()
      },
    )
    .subscribe()
}

const markAsDelivered = async (orderId: string) => {
  if (!confirm('Mark this order as delivered?')) return

  try {
    const deliveredAt = new Date().toISOString()
    const orderToUpdate = orders.value.find((order) => order.id === orderId)

    const { error } = await supabase
      .from('orders')
      .update({
        delivered_at: deliveredAt,
        updated_at: deliveredAt,
      })
      .eq('id', orderId)
      .eq('status', 'picked_up')
      .is('completed_at', null)

    if (error) throw error

    try {
      await notifyCustomerOrderStatus({
        orderId,
        status: 'delivered',
        createdAt: deliveredAt,
        orderData: orderToUpdate,
      })
    } catch (notificationError) {
      console.warn('Could not notify customer about delivered status:', notificationError)
    }

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
  switch (activeOrderTab.value) {
    case 'pending_approval':
      return pendingApprovalOrders.value
    case 'waiting_for_rider':
      return waitingForRiderOrders.value
    case 'active':
      return activeOrdersWithRiders.value
    case 'delivered':
      return deliveredOrders.value
    case 'cancelled':
      return cancelledOrders.value
    default:
      return orders.value
  }
})

// Mobile-friendly status helpers
const getStatusText = (order: any): string => {
  if (isMobile.value) {
    if (order.status === 'cancelled') return 'Cancelled'
    if (isOrderDeliveredState(order)) return isOrderCompletedState(order) ? 'Completed' : 'Delivered'
    if (order.status === 'pending_approval') return 'Pending'
    if (order.status === 'waiting_for_rider') return 'Wait for Rider'
    if (order.status === 'accepted_by_rider') return 'Accepted'
    if (order.status === 'picked_up') return 'Picked Up'
    return 'Processing'
  }

  if (isOrderDeliveredState(order)) return isOrderCompletedState(order) ? 'Completed' : 'Delivered'

  // Full text for desktop
  if (order.status === 'cancelled') return 'Cancelled ❌'
  if (order.status === 'pending_approval') return 'Pending Approval ⏳'
  if (order.status === 'waiting_for_rider') return 'Waiting for Rider 🚚'
  if (order.status === 'accepted_by_rider') return 'Accepted by Rider ✅'
  if (order.status === 'picked_up') return 'Picked Up 📦'
  if (order.status === 'delivered') return 'Delivered ✅'
  return 'Processing 🔄'
}

const getStatusColor = (order: any): string => {
  if (isOrderDeliveredState(order)) return 'success'
  if (order.status === 'cancelled') return 'error'
  if (order.status === 'pending_approval') return 'warning'
  if (order.status === 'waiting_for_rider') return 'info'
  if (order.status === 'accepted_by_rider') return 'primary'
  if (order.status === 'picked_up') return 'warning'
  return 'grey'
}

const getStatusIcon = (order: any): string => {
  if (isOrderDeliveredState(order)) return 'mdi-check-circle'
  if (order.status === 'cancelled') return 'mdi-cancel'
  if (order.status === 'pending_approval') return 'mdi-clock-outline'
  if (order.status === 'waiting_for_rider') return 'mdi-truck-clock'
  if (order.status === 'accepted_by_rider') return 'mdi-check-circle'
  if (order.status === 'picked_up') return 'mdi-truck'
  return 'mdi-help-circle'
}

// Mobile-friendly date formatting
const formatDate = (dateString: string) => {
  return formatAppDateTime(dateString, {
    now: currentTime.value,
    fallback: 'Unknown time',
    relativeDay: true,
    month: 'short',
    year: 'auto',
  })
}

const formatDeliveryDate = (dateString: string) => {
  if (!dateString) return ''

  const localDateMatch = dateString.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (localDateMatch) {
    const [, year, month, day] = localDateMatch
    return new Date(Number(year), Number(month) - 1, Number(day)).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    })
  }

  return formatAppDateTime(dateString, {
    fallback: '',
    month: 'short',
    year: false,
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
      const shortParts = [address.house_no, address.street, address.barangay_name].filter(
        (part) => part && part.trim() !== '' && part !== 'null' && part !== 'undefined',
      )

      if (shortParts.length > 0) {
        return shortParts.join(', ')
      }
    }

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
  currentTime.value = Date.now()
  currentTimeInterval = setInterval(() => {
    currentTime.value = Date.now()
  }, 30000)
  fetchShopData()
  window.addEventListener('resize', updateMobileState)
})

// Cleanup
onUnmounted(() => {
  stopOrdersSubscription()
  if (currentTimeInterval) {
    clearInterval(currentTimeInterval)
    currentTimeInterval = null
  }
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
    subscribeToOrders(newShopId)
  } else {
    stopOrdersSubscription()
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

// Function to format delivery option with meetup details
const getOrderDeliveryDisplay = (order: any): string => {
  if (!order.delivery_option) return 'Not specified'

  const deliveryOption = order.delivery_option.toLowerCase().trim()

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

  const displayOption = order.delivery_option.trim()

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

  const formattedOption = optionMap[deliveryOption]
  if (formattedOption) {
    return formattedOption
  }

  return displayOption
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ')
}
</script>

<template>
  <v-app>
    <!-- Top Bar - Mobile Optimized -->
    <v-app-bar class="top-bar" flat color="primary" dark elevation="2" :height="isMobile ? '56' : '64'">
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
      <!-- Cover + Logo -->
      <v-container class="pa-0 cover-container">
        <v-img v-if="coverPhoto" :src="coverPhoto" :height="isMobile ? 120 : 160" cover class="cover-photo"
          gradient="to bottom, rgba(0,0,0,0.2), rgba(0,0,0,0.6)" />
        <div v-else class="cover-placeholder" :style="{ height: isMobile ? '120px' : '160px' }">
          <v-icon :size="isMobile ? 48 : 64" color="white">mdi-store-front</v-icon>
        </div>

        <div class="avatar-wrapper" :style="{ marginTop: isMobile ? '-35px' : '-50px' }">
          <v-avatar :size="isMobile ? 70 : 100" class="avatar-border elevation-4">
            <v-img v-if="businessAvatar" :src="businessAvatar" cover />
            <v-icon v-else :size="isMobile ? 32 : 48" color="primary">mdi-store</v-icon>
          </v-avatar>
        </div>
      </v-container>

      <!-- Business Info Section -->
      <v-container :class="isMobile ? 'px-3 py-2' : 'py-2'">
        <v-card class="business-card elevation-2" :rounded="isMobile ? 'lg' : 'xl'">
          <v-card-text :class="isMobile ? 'pa-4' : 'pa-6 text-center'">
            <h2 class="text-subtitle-1 font-weight-bold text-primary mb-1">{{ businessName }}</h2>
            <p class="text-caption text-medium-emphasis mb-3 line-clamp-2">{{ description }}</p>

            <v-row class="mb-3">
              <v-col cols="12" sm="6" class="pb-2">
                <v-card variant="outlined" class="info-card pa-2" :rounded="isMobile ? 'md' : 'lg'">
                  <div class="d-flex align-center">
                    <v-icon color="primary" :size="isMobile ? 18 : 24" class="mr-2">mdi-clock-outline</v-icon>
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
                    <v-icon color="primary" :size="isMobile ? 18 : 24" class="mr-2">mdi-map-marker</v-icon>
                    <div class="text-left">
                      <div class="text-caption text-medium-emphasis">Location</div>
                      <div class="text-body-2 font-weight-medium line-clamp-1">{{ address }}</div>
                    </div>
                  </div>
                </v-card>
              </v-col>
            </v-row>

            <v-card class="status-card pa-3 mb-3" variant="outlined" :rounded="isMobile ? 'lg' : 'xl'">
              <div class="text-center">
                <div class="d-flex align-center justify-center mb-2">
                  <v-icon :color="getCurrentStatusDisplay().color" :size="isMobile ? 20 : 24" class="mr-2">
                    {{ getCurrentStatusDisplay().icon }}
                  </v-icon>
                  <span class="text-body-1 font-weight-medium">{{
                    getCurrentStatusDisplay().text
                    }}</span>
                </div>

                <v-btn :color="getCurrentStatusDisplay().buttonColor" :loading="loading" @click="toggleShopStatus"
                  class="status-toggle-btn" :size="isMobile ? 'small' : 'large'" :rounded="isMobile ? 'md' : 'lg'"
                  variant="flat" block>
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
            <v-btn @click="goToProducts" color="secondary" :size="isMobile ? 'large' : 'x-large'" class="action-btn"
              :rounded="isMobile ? 'lg' : 'xl'" variant="flat" block :height="isMobile ? 50 : 60">
              <v-icon :start="!isMobile" :size="isMobile ? 20 : 28">mdi-package-variant</v-icon>
              <div class="text-left flex-grow-1">
                <div :class="isMobile ? 'text-body-2 font-weight-bold' : 'text-h6 font-weight-bold'">
                  Product Management
                </div>
                <div class="text-caption d-none d-sm-block">Manage your inventory and products</div>
              </div>
              <v-icon end>mdi-chevron-right</v-icon>
            </v-btn>
          </v-col>
        </v-row>
      </v-container>

      <!-- NEW: Seller Order Approval Section -->
      <v-container :class="isMobile ? 'px-3 py-3' : 'py-2'">
        <v-card class="elevation-1" :rounded="isMobile ? 'lg' : 'xl'">
          <v-card-title class="d-flex align-center" :class="isMobile ? 'pa-3' : 'pa-4'">
            <v-icon color="warning" :size="isMobile ? 20 : 24" class="mr-2">mdi-clipboard-list</v-icon>
            <span :class="isMobile ? 'text-subtitle-2 font-weight-bold' : 'text-h5 font-weight-bold'">
              Order Approval
            </span>
            <v-chip v-if="pendingApprovalOrders.length" color="warning" class="ml-2"
              :size="isMobile ? 'small' : 'default'">
              {{ pendingApprovalOrders.length }} Pending
            </v-chip>
          </v-card-title>

          <v-card-text :class="isMobile ? 'pa-3' : 'pa-4'">
            <!-- Loading State -->
            <div v-if="loadingOrders" class="text-center py-4">
              <v-progress-circular indeterminate color="warning" :size="40" />
              <p class="mt-2 text-caption">Loading pending orders...</p>
            </div>

            <!-- No Pending Orders -->
            <div v-else-if="pendingApprovalOrders.length === 0" class="text-center py-6">
              <v-icon size="48" color="grey-lighten-2">mdi-check-circle-outline</v-icon>
              <p class="mt-2 text-caption text-grey">No orders waiting for approval</p>
            </div>

            <!-- Pending Orders List -->
            <div v-else>
              <v-card v-for="order in pendingApprovalOrders" :key="order.id" class="mb-3"
                :rounded="isMobile ? 'lg' : 'xl'" variant="outlined" :style="{ borderLeft: '4px solid #ff9800' }">
                <v-card-text :class="isMobile ? 'pa-3' : 'pa-4'">
                  <!-- Order Header -->
                  <div class="d-flex justify-space-between align-start mb-2">
                    <div>
                      <span class="text-subtitle-2 font-weight-bold text-primary">
                        #{{ getTransactionNumber(order) }}
                      </span>
                      <div class="text-caption text-medium-emphasis">
                        {{ formatDate(order.created_at) }}
                      </div>
                    </div>
                    <v-chip color="warning" size="x-small">
                      <v-icon start size="10">mdi-clock-outline</v-icon>
                      Pending Approval
                    </v-chip>
                  </div>

                  <!-- Customer Info -->
                  <div class="d-flex align-center mb-2">
                    <v-avatar size="28" color="primary" class="mr-2">
                      <span class="text-white text-caption">
                        {{ order.customer_name?.charAt(0) || 'C' }}
                      </span>
                    </v-avatar>
                    <div>
                      <div class="text-caption font-weight-medium">{{ order.customer_name }}</div>
                      <div class="text-caption text-medium-emphasis">{{ order.customer_phone }}</div>
                    </div>
                  </div>

                  <!-- Items Summary -->
                  <div class="mb-2">
                    <div class="text-caption font-weight-bold">Items:</div>
                    <div v-for="item in order.items.slice(0, 2)" :key="item.id" class="d-flex align-center mt-1">
                      <v-img :src="item.image || '/placeholder-product.png'" width="28" height="28" cover
                        class="rounded mr-2" />
                      <div class="flex-grow-1">
                        <div class="text-caption">{{ item.name }}</div>
                        <div class="text-caption text-medium-emphasis">
                          {{ item.quantity }} × ₱{{ Number(item.price).toLocaleString() }}
                        </div>
                      </div>
                    </div>
                    <div v-if="order.items.length > 2" class="text-caption text-medium-emphasis mt-1">
                      +{{ order.items.length - 2 }} more items
                    </div>
                  </div>

                  <!-- Total -->
                  <div class="d-flex justify-space-between align-center mb-3 pt-2 border-top">
                    <span class="text-caption font-weight-bold">Total Amount:</span>
                    <span class="text-subtitle-2 font-weight-bold text-primary">
                      ₱{{ Number(order.total_amount).toLocaleString() }}
                    </span>
                  </div>

                  <!-- Action Buttons -->
                  <div class="d-flex gap-2">
                    <v-btn color="success" size="small" variant="flat" @click="approveOrder(order)"
                      :loading="approvingOrderId === order.id" :block="isMobile" class="flex-grow-1">
                      <v-icon start size="14">mdi-check-circle</v-icon>
                      Approve
                    </v-btn>
                    <v-btn color="error" size="small" variant="outlined" @click="rejectOrder(order)" :block="isMobile"
                      class="flex-grow-1">
                      <v-icon start size="14">mdi-close-circle</v-icon>
                      Reject
                    </v-btn>
                    <v-btn color="primary" size="small" variant="outlined" @click="viewOrderDetails(order.id)">
                      <v-icon size="14">mdi-eye</v-icon>
                    </v-btn>
                  </div>
                </v-card-text>
              </v-card>
            </div>
          </v-card-text>
        </v-card>
      </v-container>

      <!-- Also add this section to show active orders with riders (optional, after your existing orders) -->
      <v-container :class="isMobile ? 'px-3 py-3' : 'py-2'">
        <v-card class="elevation-1" :rounded="isMobile ? 'lg' : 'xl'">
          <v-card-title class="d-flex align-center" :class="isMobile ? 'pa-3' : 'pa-4'">
            <v-icon color="primary" :size="isMobile ? 20 : 24" class="mr-2">mdi-motorbike</v-icon>
            <span :class="isMobile ? 'text-subtitle-2 font-weight-bold' : 'text-h5 font-weight-bold'">
              Active Deliveries
            </span>
            <v-chip v-if="activeOrdersWithRiders.length" color="primary" class="ml-2"
              :size="isMobile ? 'small' : 'default'">
              {{ activeOrdersWithRiders.length }}
            </v-chip>
          </v-card-title>

          <v-card-text :class="isMobile ? 'pa-3' : 'pa-4'">
            <div v-if="loadingOrders" class="text-center py-4">
              <v-progress-circular indeterminate color="primary" :size="40" />
            </div>

            <div v-else-if="activeOrdersWithRiders.length === 0" class="text-center py-6">
              <v-icon size="48" color="grey-lighten-2">mdi-truck-off</v-icon>
              <p class="mt-2 text-caption text-grey">No active deliveries</p>
            </div>

            <div v-else>
              <v-card v-for="order in activeOrdersWithRiders" :key="order.id" class="mb-3"
                :rounded="isMobile ? 'lg' : 'xl'" variant="outlined">
                <v-card-text :class="isMobile ? 'pa-3' : 'pa-4'">
                  <div class="d-flex justify-space-between align-start mb-2">
                    <div>
                      <span class="text-subtitle-2 font-weight-bold text-primary">
                        #{{ getTransactionNumber(order) }}
                      </span>
                      <div class="text-caption text-medium-emphasis">
                        {{ formatDate(order.created_at) }}
                      </div>
                    </div>
                    <v-chip :color="getOrderStatusColor(order)" size="x-small">
                      {{ getOrderStatusText(order) }}
                    </v-chip>
                  </div>

                  <!-- Rider Info -->
                  <div v-if="order.rider_details" class="mb-2 pa-2 rounded-lg" style="background: #e3f2fd">
                    <div class="d-flex align-center">
                      <v-icon color="primary" size="18" class="mr-2">mdi-motorbike</v-icon>
                      <div>
                        <div class="text-caption font-weight-bold">Rider: {{ order.rider_details.name }}</div>
                        <div class="text-caption">📞 {{ order.rider_details.phone }}</div>
                      </div>
                    </div>
                  </div>

                  <div class="d-flex justify-space-between align-center">
                    <div class="text-caption">
                      {{ order.items.length }} item(s)
                    </div>
                    <div class="text-caption font-weight-bold text-primary">
                      ₱{{ Number(order.total_amount).toLocaleString() }}
                    </div>
                  </div>
                </v-card-text>
              </v-card>
            </div>
          </v-card-text>
        </v-card>
      </v-container>

      <!-- Orders Section - Mobile Optimized -->
      <v-container :class="isMobile ? 'px-3 py-3' : 'py-4'">
        <!-- Section Header -->
        <div class="d-flex align-center justify-space-between mb-4">
          <div class="d-flex align-center">
            <v-icon color="primary" :size="isMobile ? 24 : 32" class="mr-2">mdi-shopping</v-icon>
            <h2 :class="isMobile ? 'text-h6 font-weight-bold' : 'text-h5 font-weight-bold'">
              Orders Dashboard
            </h2>
          </div>
          <v-chip color="primary" variant="flat" :size="isMobile ? 'small' : 'default'">
            Total: {{ orderCounts.all }}
          </v-chip>
        </div>

        <!-- Status Cards Grid -->
        <v-row class="mb-4">
          <v-col v-for="section in orderSections" :key="section.id" :cols="isMobile ? 6 : 2" class="pb-2">
            <v-card 
              :color="activeOrderTab === section.id ? `${section.color}-lighten-4` : 'white'"
              :class="['status-section-card', { 'active-tab': activeOrderTab === section.id }]"
              :rounded="isMobile ? 'lg' : 'xl'"
              elevation="1"
              @click="activeOrderTab = section.id"
              style="cursor: pointer; transition: all 0.2s ease;"
            >
              <v-card-text :class="isMobile ? 'pa-2 text-center' : 'pa-3 text-center'">
                <v-icon :color="section.color" :size="isMobile ? 28 : 36" class="mb-1">{{ section.icon }}</v-icon>
                <div :class="isMobile ? 'text-caption font-weight-bold' : 'text-subtitle-2 font-weight-bold'" :style="{ color: `var(--v-${section.color}-base)` }">
                  {{ section.title }}
                </div>
                <div :class="isMobile ? 'text-h6 font-weight-bold' : 'text-h4 font-weight-bold'">
                  {{ orderCounts[section.id] }}
                </div>
              </v-card-text>
            </v-card>
          </v-col>
        </v-row>

        <!-- Desktop Select for Order Filter -->
        <v-select v-if="!isMobile" v-model="activeOrderTab" :items="transactionOptions" item-title="title" item-value="value"
          label="Filter Orders" variant="outlined" density="comfortable" prepend-icon="mdi-filter" class="mb-6"
          rounded="lg" />

        <!-- Orders Loading State -->
        <div v-if="loadingOrders" class="text-center" :class="isMobile ? 'py-8' : 'py-12'">
          <v-progress-circular indeterminate color="primary" :size="isMobile ? 48 : 64" />
          <p class="mt-3 text-body-2 text-medium-emphasis">Loading orders...</p>
        </div>

        <!-- Orders Error State -->
        <v-alert v-else-if="ordersError" type="error" class="mb-3" :rounded="isMobile ? 'md' : 'lg'">
          <div class="d-flex align-center">
            <v-icon :size="isMobile ? 18 : 20" class="mr-2">mdi-alert-circle</v-icon>
            <div class="text-caption">{{ ordersError }}</div>
            <v-spacer></v-spacer>
            <v-btn variant="text" color="white" @click="fetchOrders" size="x-small" class="ml-1">
              Retry
            </v-btn>
          </div>
        </v-alert>

        <!-- Orders List - FIXED: Removed max-height to prevent cutting off content -->
        <div v-else class="orders-list">
          <!-- Pending Approval Section Orders -->
          <template v-if="activeOrderTab === 'pending_approval'">
            <v-card v-for="order in filteredOrders" :key="order.id" class="mb-3 order-card elevation-1"
              :rounded="isMobile ? 'lg' : 'xl'">
              <v-card-text :class="isMobile ? 'pa-3' : 'pa-4'">
                <div class="d-flex justify-space-between align-start mb-3">
                  <div>
                    <div class="d-flex align-center mb-1">
                      <h4 class="text-subtitle-2 font-weight-bold text-primary mr-2">
                        #{{ getTransactionNumber(order) }}
                      </h4>
                      <v-chip color="warning" size="x-small">
                        <v-icon start size="10">mdi-clock-outline</v-icon>
                        Pending Approval
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

                <div class="d-flex align-center mb-3">
                  <v-avatar size="36" color="primary" class="mr-2">
                    <v-img v-if="order.user?.avatar_url" :src="order.user.avatar_url" alt="Customer" />
                    <span v-else class="text-white text-caption">
                      {{ order.user?.first_name?.[0] }}{{ order.user?.last_name?.[0] }}
                    </span>
                  </v-avatar>
                  <div>
                    <div class="text-caption font-weight-medium">
                      {{ order.user?.first_name }} {{ order.user?.last_name }}
                    </div>
                    <div class="text-caption text-medium-emphasis">
                      {{ order.address?.phone || order.user?.phone || 'N/A' }}
                    </div>
                  </div>
                </div>

                <div class="mb-3">
                  <div class="text-caption font-weight-bold mb-1">Items:</div>
                  <div v-for="item in order.items.slice(0, 2)" :key="item.id" class="d-flex align-center mt-1">
                    <v-img :src="item.image || '/placeholder-product.png'" width="36" height="36" cover
                      class="rounded mr-2" />
                    <div class="flex-grow-1">
                      <div class="text-caption line-clamp-1">{{ item.name }}</div>
                      <div class="text-caption text-medium-emphasis">
                        {{ item.quantity }} × ₱{{ Number(item.price).toLocaleString() }}
                      </div>
                    </div>
                  </div>
                  <div v-if="order.items.length > 2" class="text-caption text-medium-emphasis mt-1">
                    +{{ order.items.length - 2 }} more items
                  </div>
                </div>

                <div class="d-flex justify-space-between align-center mb-3 pt-2 border-top">
                  <span class="text-caption font-weight-bold">Total Amount:</span>
                  <span class="text-subtitle-2 font-weight-bold text-primary">
                    ₱{{ Number(order.total_amount).toLocaleString() }}
                  </span>
                </div>

                <div class="action-buttons-wrapper">
                  <v-btn color="success" size="small" variant="flat" @click="approveOrder(order)"
                    :loading="approvingOrderId === order.id" :block="isMobile" class="action-btn-small">
                    <v-icon start size="14">mdi-check-circle</v-icon>
                    Approve
                  </v-btn>
                  <v-btn color="error" size="small" variant="outlined" @click="rejectOrder(order)" :block="isMobile"
                    class="action-btn-small">
                    <v-icon start size="14">mdi-close-circle</v-icon>
                    Reject
                  </v-btn>
                  <v-btn color="primary" size="small" variant="outlined" @click="viewOrderDetails(order.id)" class="action-btn-icon">
                    <v-icon size="14">mdi-eye</v-icon>
                  </v-btn>
                </div>
              </v-card-text>
            </v-card>
          </template>

          <!-- Waiting for Rider Section -->
          <template v-else-if="activeOrderTab === 'waiting_for_rider'">
            <v-card v-for="order in filteredOrders" :key="order.id" class="mb-3 order-card elevation-1"
              :rounded="isMobile ? 'lg' : 'xl'">
              <v-card-text :class="isMobile ? 'pa-3' : 'pa-4'">
                <div class="d-flex justify-space-between align-start mb-2">
                  <div>
                    <span class="text-subtitle-2 font-weight-bold text-primary">
                      #{{ getTransactionNumber(order) }}
                    </span>
                    <div class="text-caption text-medium-emphasis">
                      {{ formatDate(order.created_at) }}
                    </div>
                  </div>
                  <v-chip color="info" size="x-small">
                    <v-icon start size="10">mdi-bike-fast</v-icon>
                    Waiting for Rider
                  </v-chip>
                </div>

                <div class="d-flex align-center mb-2">
                  <v-avatar size="28" color="info" class="mr-2">
                    <span class="text-white text-caption">{{ order.customer_name?.charAt(0) || 'C' }}</span>
                  </v-avatar>
                  <div>
                    <div class="text-caption font-weight-medium">{{ order.customer_name }}</div>
                    <div class="text-caption text-medium-emphasis">{{ order.customer_phone }}</div>
                  </div>
                </div>

                <div class="d-flex justify-space-between align-center">
                  <div class="text-caption">{{ order.items.length }} item(s)</div>
                  <div class="text-caption font-weight-bold text-primary">
                    ₱{{ Number(order.total_amount).toLocaleString() }}
                  </div>
                </div>

                <div class="mt-3">
                  <v-btn color="primary" size="x-small" variant="outlined" @click="viewOrderDetails(order.id)" block>
                    View Details
                  </v-btn>
                </div>
              </v-card-text>
            </v-card>
          </template>

          <!-- Active Deliveries Section -->
          <template v-else-if="activeOrderTab === 'active'">
            <v-card v-for="order in filteredOrders" :key="order.id" class="mb-3 order-card elevation-1"
              :rounded="isMobile ? 'lg' : 'xl'">
              <v-card-text :class="isMobile ? 'pa-3' : 'pa-4'">
                <div class="d-flex justify-space-between align-start mb-2">
                  <div>
                    <span class="text-subtitle-2 font-weight-bold text-primary">
                      #{{ getTransactionNumber(order) }}
                    </span>
                    <div class="text-caption text-medium-emphasis">
                      {{ formatDate(order.created_at) }}
                    </div>
                  </div>
                  <v-chip :color="getOrderStatusColor(order.status)" size="x-small">
                    {{ getOrderStatusText(order.status) }}
                  </v-chip>
                </div>

                <div v-if="order.rider_details" class="mb-2 pa-2 rounded-lg" style="background: #e3f2fd">
                  <div class="d-flex align-center">
                    <v-icon color="primary" size="18" class="mr-2">mdi-motorbike</v-icon>
                    <div>
                      <div class="text-caption font-weight-bold">Rider: {{ order.rider_details.name }}</div>
                      <div class="text-caption">📞 {{ order.rider_details.phone }}</div>
                    </div>
                  </div>
                </div>

                <div class="d-flex justify-space-between align-center">
                  <div class="text-caption">{{ order.items.length }} item(s)</div>
                  <div class="text-caption font-weight-bold text-primary">
                    ₱{{ Number(order.total_amount).toLocaleString() }}
                  </div>
                </div>

                <div class="mt-3 action-buttons-wrapper">
                  <v-btn 
                    v-if="order.status === 'picked_up'"
                    color="success" 
                    size="x-small" 
                    variant="flat" 
                    @click="markAsDelivered(order.id)"
                    class="action-btn-small flex-grow-1"
                  >
                    <v-icon start size="12">mdi-truck-check</v-icon>
                    Mark Delivered
                  </v-btn>
                  <v-btn color="primary" size="x-small" variant="outlined" @click="viewOrderDetails(order.id)" class="action-btn-small flex-grow-1">
                    View Details
                  </v-btn>
                </div>
              </v-card-text>
            </v-card>
          </template>

          <!-- Delivered Section -->
          <template v-else-if="activeOrderTab === 'delivered'">
            <v-card v-for="order in filteredOrders" :key="order.id" class="mb-3 order-card elevation-1"
              :rounded="isMobile ? 'lg' : 'xl'">
              <v-card-text :class="isMobile ? 'pa-3' : 'pa-4'">
                <div class="d-flex justify-space-between align-start mb-2">
                  <div>
                    <span class="text-subtitle-2 font-weight-bold text-primary">
                      #{{ getTransactionNumber(order) }}
                    </span>
                    <div class="text-caption text-medium-emphasis">
                      {{ formatDate(order.created_at) }}
                    </div>
                  </div>
                  <v-chip color="success" size="x-small">
                    <v-icon start size="10">mdi-check-circle</v-icon>
                    Delivered
                  </v-chip>
                </div>

                <div class="d-flex align-center mb-2">
                  <v-avatar size="28" color="success" class="mr-2">
                    <span class="text-white text-caption">{{ order.customer_name?.charAt(0) || 'C' }}</span>
                  </v-avatar>
                  <div>
                    <div class="text-caption font-weight-medium">{{ order.customer_name }}</div>
                    <div class="text-caption text-medium-emphasis">{{ order.customer_phone }}</div>
                  </div>
                </div>

                <div class="d-flex justify-space-between align-center">
                  <div class="text-caption">{{ order.items.length }} item(s)</div>
                  <div class="text-caption font-weight-bold text-primary">
                    ₱{{ Number(order.total_amount).toLocaleString() }}
                  </div>
                </div>

                <div class="mt-3">
                  <v-btn color="primary" size="x-small" variant="outlined" @click="viewOrderDetails(order.id)" block>
                    View Details
                  </v-btn>
                </div>
              </v-card-text>
            </v-card>
          </template>

          <!-- Cancelled Section -->
          <template v-else-if="activeOrderTab === 'cancelled'">
            <v-card v-for="order in filteredOrders" :key="order.id" class="mb-3 order-card elevation-1"
              :rounded="isMobile ? 'lg' : 'xl'">
              <v-card-text :class="isMobile ? 'pa-3' : 'pa-4'">
                <div class="d-flex justify-space-between align-start mb-2">
                  <div>
                    <span class="text-subtitle-2 font-weight-bold text-primary">
                      #{{ getTransactionNumber(order) }}
                    </span>
                    <div class="text-caption text-medium-emphasis">
                      {{ formatDate(order.created_at) }}
                    </div>
                  </div>
                  <v-chip color="error" size="x-small">
                    <v-icon start size="10">mdi-cancel</v-icon>
                    Cancelled
                  </v-chip>
                </div>

                <div class="d-flex align-center mb-2">
                  <v-avatar size="28" color="error" class="mr-2">
                    <span class="text-white text-caption">{{ order.customer_name?.charAt(0) || 'C' }}</span>
                  </v-avatar>
                  <div>
                    <div class="text-caption font-weight-medium">{{ order.customer_name }}</div>
                    <div class="text-caption text-medium-emphasis">{{ order.customer_phone }}</div>
                  </div>
                </div>

                <div class="d-flex justify-space-between align-center">
                  <div class="text-caption">{{ order.items.length }} item(s)</div>
                  <div class="text-caption font-weight-bold text-primary">
                    ₱{{ Number(order.total_amount).toLocaleString() }}
                  </div>
                </div>

                <div class="mt-3">
                  <v-btn color="primary" size="x-small" variant="outlined" @click="viewOrderDetails(order.id)" block>
                    View Details
                  </v-btn>
                </div>
              </v-card-text>
            </v-card>
          </template>
        </div>
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

/* Status Section Cards */
.status-section-card {
  transition: all 0.2s ease;
  border: 1px solid #e0e0e0;
}

.status-section-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.status-section-card.active-tab {
  border: 2px solid currentColor;
  transform: translateY(-2px);
}

/* Orders List - FIXED: No max-height, allows full scrolling */
.orders-list {
  width: 100%;
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

/* Action Buttons Wrapper - FIXED: Better layout for buttons */
.action-buttons-wrapper {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  margin-top: 12px;
}

.action-btn-small {
  flex: 1;
  min-width: 0;
}

.action-btn-icon {
  flex-shrink: 0;
  min-width: 36px;
  width: 36px;
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

.border-top {
  border-top: 1px solid #e0e0e0;
}

.gap-2 {
  gap: 8px;
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

  .top-bar {
    padding-top: max(env(safe-area-inset-top), 0px);
  }

  .v-main {
    padding-bottom: max(env(safe-area-inset-bottom), 0px);
  }
  
  .action-buttons-wrapper {
    gap: 6px;
  }
  
  .action-btn-small {
    font-size: 0.7rem;
    padding: 0 8px;
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
  
  .action-buttons-wrapper {
    flex-direction: column;
  }
  
  .action-btn-small,
  .action-btn-icon {
    width: 100%;
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
    background: #1e1e1e;
    border-color: #333;
  }
}

/* Reduced motion */
@media (prefers-reduced-motion: reduce) {
  .info-card,
  .order-card,
  .action-btn,
  .status-section-card {
    transition: none;
  }
}
</style>