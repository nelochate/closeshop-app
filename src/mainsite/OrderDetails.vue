<script setup lang="ts">
import { ref, onMounted, computed, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { supabase } from '@/utils/supabase'
import { createNotificationRecordIfEnabled } from '@/utils/notificationPreferences'
import {
  notifyAssignedRiderOrderStatus,
  notifyCustomerOrderStatus,
  notifySellerOrderStatus,
} from '@/utils/orderNotifications'
import { ensureOrderAutoCompletionUpToDate } from '@/utils/orderAutoCompletion'
import { formatAppDateTime, getAppTimestampValue } from '@/utils/dateTime'
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera'
import OrderTrackingMap from '@/components/OrderTrackingMap.vue'
import {
  buildDeliveryAddress,
  buildShopAddress,
  extractPersistedRiderCoordinates,
  resolveTrackingLocation,
  type TrackingLocation,
  type TrackingViewerMode,
} from '@/utils/orderTracking'
import {
  calculateOrderItemsSubtotal,
  calculateOrderTotalAmount,
  resolveOrderDeliveryFee,
} from '@/utils/deliveryPricing.js'
import {
  ORDER_CANCEL_REQUESTED_STATUS,
  ORDER_CANCEL_REQUESTED_STATUSES,
  isOrderCancellationRequestedStatus,
  normalizeOrderStatus,
} from '@/utils/orderStatus'

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
const showProofDialog = ref(false)
const proofImage = ref<File | null>(null)
const proofImagePreview = ref<string | null>(null)
const uploadingProof = ref(false)
const showImageDialog = ref(false)
const selectedImage = ref<string | null>(null)
const selectedImageTitle = ref('')
const customerDecisionLoading = ref<'completed' | 'not_received' | null>(null)
const cancellationActionLoading = ref<'cancel' | 'request' | 'approve' | 'decline' | null>(null)
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
    const {
      data: { user },
    } = await supabase.auth.getUser()
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

  if (
    currentRiderId.value &&
    order.value.rider_id === currentRiderId.value &&
    currentRiderProfile.value
  ) {
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

// Subscribe to real-time updates
const subscribeToOrderUpdates = () => {
  if (statusSubscription) supabase.removeChannel(statusSubscription)

  statusSubscription = supabase
    .channel(`order-${orderId}`)
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'orders',
        filter: `id=eq.${orderId}`,
      },
      (payload) => {
        console.log('Order update:', payload.new.status)
        order.value = { ...order.value, ...payload.new }
        fetchRiderDetails()
        getCurrentUserAndRole()
      },
    )
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
      .select(
        `
        *,
        order_items (
          id, product_id, quantity, price, selected_size, selected_variety,
          products (id, prod_name, main_img_urls, description, shop_id)
        ),
        buyer:profiles!orders_user_id_fkey (id, first_name, last_name, avatar_url, phone),
        address:addresses!orders_address_id_fkey ( * )
      `,
      )
      .eq('id', orderId)
      .single()

    if (orderError) throw orderError
    if (!orderData) throw new Error('Order not found')

    order.value = await ensureOrderAutoCompletionUpToDate(orderData)
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
    const { data: shopData } = await supabase.from('shops').select('*').eq('id', shopId).single()

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
    name:
      getPreferredAddressRecipientName(shippingAddress.value) ||
      getProfileDisplayName(buyer.value) ||
      'Customer',
    address: buildDeliveryAddress(shippingAddress.value),
    lat: shippingAddress.value?.latitude,
    lng: shippingAddress.value?.longitude,
    fallbackQuery: deliveryQuery || undefined,
  })
}

// Computed properties
const subtotal = computed(() => {
  return calculateOrderItemsSubtotal(orderItems.value)
})

const deliveryFee = computed(() => {
  return resolveOrderDeliveryFee(order.value || {}, undefined, subtotal.value)
})

const totalAmount = computed(() =>
  Number(order.value?.total_amount ?? calculateOrderTotalAmount(subtotal.value, deliveryFee.value)),
)

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

const deliveryContactNumber = computed(() => {
  const preferredNumber = [
    order.value?.contact_number,
    shippingAddress.value?.phone,
    buyer.value?.phone,
  ].find((value) => typeof value === 'string' && value.trim())

  return preferredNumber?.trim() || ''
})

const riderDisplayName = computed(() => {
  if (!riderDetails.value) return 'Assigned rider'
  return getProfileDisplayName(riderDetails.value) || 'Assigned rider'
})

const deliveryProofUrl = computed(
  () => order.value?.proof_of_delivery_url || order.value?.delivery_proof_url || '',
)
const isOrderCompleted = computed(
  () => !!order.value?.completed_at || order.value?.status === 'completed',
)
const isAwaitingCustomerConfirmation = computed(
  () =>
    ['picked_up', 'delivered'].includes(order.value?.status || '') &&
    !!deliveryProofUrl.value &&
    !!order.value?.delivered_at &&
    !order.value?.completed_at,
)
const hasDeliveryIssue = computed(
  () =>
    order.value?.status === 'picked_up' &&
    !!deliveryProofUrl.value &&
    !order.value?.delivered_at &&
    !order.value?.completed_at,
)
const deliveryProofMetaLabel = computed(() =>
  hasDeliveryIssue.value ? 'Latest issue update' : 'Uploaded by rider',
)
const deliveryProofMetaValue = computed(() => {
  const timestamp =
    order.value?.delivered_at || order.value?.completed_at || order.value?.updated_at
  return timestamp ? formatDate(timestamp) : 'Recently'
})
const deliveryIssueRoleMessage = computed(() => {
  if (isBuyer.value) {
    return 'You reported that the order was not received. Please wait while the issue is being handled.'
  }
  if (isSeller.value) {
    return 'The customer reported that the order was not received. Please coordinate with the rider for resolution.'
  }
  if (isRider.value) {
    return 'The customer reported that the order was not received. Please coordinate with the seller or the support team for proper resolution.'
  }
  return 'A delivery issue was reported for this order and it is waiting for resolution.'
})
const reattemptDeliveryButtonText = computed(() =>
  hasDeliveryIssue.value ? 'Reattempt delivery' : 'Upload proof & mark delivered',
)

const shopAddress = computed(() => {
  if (!shop.value) return 'Shop address unavailable'
  return buildShopAddress(shop.value)
})

const statusColor = computed(() => {
  if (isOrderCompleted.value) return 'success'
  if (hasDeliveryIssue.value) return 'warning'
  if (isAwaitingCustomerConfirmation.value) return 'success'

  const status = normalizeOrderStatus(order.value?.status)
  const colors: Record<string, string> = {
    pending_approval: 'warning',
    waiting_for_rider: 'info',
    cancel_requested: 'warning',
    accepted_by_rider: 'primary',
    picked_up: 'purple',
    completed: 'success',
    cancelled: 'error',
  }
  return colors[status] || 'grey'
})

const statusIcon = computed(() => {
  if (isOrderCompleted.value) return 'mdi-check-decagram'
  if (hasDeliveryIssue.value) return 'mdi-alert-circle'
  if (isAwaitingCustomerConfirmation.value) return 'mdi-check-circle'

  const status = normalizeOrderStatus(order.value?.status)
  const icons: Record<string, string> = {
    pending_approval: 'mdi-clock-outline',
    waiting_for_rider: 'mdi-bike-fast',
    cancel_requested: 'mdi-timer-sand',
    accepted_by_rider: 'mdi-check-circle',
    picked_up: 'mdi-truck-delivery',
    completed: 'mdi-check-decagram',
    cancelled: 'mdi-close-circle',
  }
  return icons[status] || 'mdi-help-circle'
})

const statusDisplayText = computed(() => {
  if (isOrderCompleted.value) return 'Completed'
  if (hasDeliveryIssue.value) return 'Delivery Issue Reported'
  if (isAwaitingCustomerConfirmation.value) return 'Delivered'

  const status = normalizeOrderStatus(order.value?.status)
  const texts: Record<string, string> = {
    pending_approval: 'Pending Approval',
    waiting_for_rider: 'Waiting for Rider',
    cancel_requested: 'Cancellation Requested',
    accepted_by_rider: 'Rider Accepted',
    picked_up: 'Picked Up',
    completed: 'Completed',
    cancelled: 'Cancelled',
  }
  return texts[status] || status
})

const isBuyer = computed(() => userRole.value === 'buyer')
const isSeller = computed(() => userRole.value === 'seller')
const isRider = computed(() => userRole.value === 'rider')
const showReviewOrderButton = computed(() => isBuyer.value && isOrderCompleted.value)
const canBuyerCancelDirectly = computed(
  () => isBuyer.value && order.value?.status === 'pending_approval',
)
const canBuyerRequestCancellation = computed(
  () =>
    isBuyer.value && order.value?.status === 'waiting_for_rider' && !order.value?.rider_id,
)
const isCancellationRequestedOrder = computed(() =>
  isOrderCancellationRequestedStatus(order.value?.status),
)
const hasPendingCancellationRequest = computed(
  () => isBuyer.value && isCancellationRequestedOrder.value,
)
const isBuyerCancellationLocked = computed(
  () => isBuyer.value && ['accepted_by_rider', 'picked_up'].includes(order.value?.status || ''),
)
const showBuyerCancelButton = computed(
  () =>
    canBuyerCancelDirectly.value ||
    canBuyerRequestCancellation.value ||
    hasPendingCancellationRequest.value ||
    isBuyerCancellationLocked.value,
)
const isBuyerCancelButtonDisabled = computed(
  () => hasPendingCancellationRequest.value || isBuyerCancellationLocked.value,
)
const buyerCancelButtonText = computed(() => {
  if (canBuyerCancelDirectly.value) return 'Cancel Order'
  if (canBuyerRequestCancellation.value) return 'Request Cancellation'
  if (hasPendingCancellationRequest.value) return 'Cancellation Requested'
  if (isBuyerCancellationLocked.value) return 'Cancellation Unavailable'
  return 'Cancel Order'
})
const buyerCancellationNotice = computed(() => {
  if (!isBuyer.value || !order.value) return null

  if (canBuyerCancelDirectly.value) {
    return {
      type: 'info',
      icon: 'mdi-close-circle-outline',
      title: 'You can cancel this order right away',
      message:
        'The seller has not approved the order yet, so cancelling now will immediately stop it.',
    }
  }

  if (canBuyerRequestCancellation.value) {
    return {
      type: 'warning',
      icon: 'mdi-store-check-outline',
      title: 'Seller approval is required to cancel now',
      message:
        'This order was already approved by the seller. You can still request cancellation while no rider has accepted it.',
    }
  }

  if (hasPendingCancellationRequest.value) {
    return {
      type: 'info',
      icon: 'mdi-timer-sand',
      title: 'Cancellation request sent',
      message:
        'The seller still needs to approve this cancellation request before the order is cancelled.',
    }
  }

  if (isBuyerCancellationLocked.value) {
    return {
      type: 'error',
      icon: 'mdi-lock-outline',
      title: 'Cancellation unavailable',
      message: 'Order can no longer be cancelled because it is already assigned to a rider',
    }
  }

  return null
})
const trackingViewerMode = computed<TrackingViewerMode>(() => {
  if (isSeller.value) return 'seller'
  if (isRider.value) return 'rider'
  return 'customer'
})
const shouldTrackOwnLocation = computed(
  () =>
    isRider.value &&
    !!currentRiderId.value &&
    !['delivered', 'completed', 'cancelled'].includes(order.value?.status),
)
const persistedRiderTrackingLocation = computed<TrackingLocation | null>(() => {
  const persisted = extractPersistedRiderCoordinates(order.value)

  if (!persisted) return null

  return {
    ...persisted,
    name: riderDisplayName.value,
    address:
      persisted.address ||
      riderDetails.value?.phone ||
      `${persisted.lat.toFixed(5)}, ${persisted.lng.toFixed(5)}`,
  }
})
const trackingMapTitle = computed(() => {
  if (hasDeliveryIssue.value) return 'Delivery issue reported by the customer'
  if (isOrderCompleted.value) return 'Customer confirmed the delivery'
  if (isAwaitingCustomerConfirmation.value) {
    return 'Delivery completed and waiting for customer confirmation'
  }
  if (isCancellationRequestedOrder.value) {
    return 'Cancellation request pending seller approval'
  }
  if (order.value?.status === 'picked_up') return 'Order is on the way to the customer'
  if (order.value?.status === 'accepted_by_rider') return 'Rider is heading to the pickup point'
  if (order.value?.status === 'waiting_for_rider') return 'Tracking is ready once a rider accepts'
  return 'Follow the delivery journey'
})
const trackingMapSubtitle = computed(() => {
  if (hasDeliveryIssue.value) {
    return deliveryIssueRoleMessage.value
  }
  if (isAwaitingCustomerConfirmation.value) {
    return 'The proof of delivery has been uploaded and the order is waiting for customer confirmation.'
  }
  if (isCancellationRequestedOrder.value) {
    if (isBuyer.value) {
      return 'Your cancellation request is on hold until the seller decides whether to approve it.'
    }
    if (isSeller.value) {
      return 'The customer requested cancellation before rider assignment. Review the request below.'
    }
    return 'This order is waiting for the seller to respond to a cancellation request.'
  }
  if (order.value?.status === 'pending_approval') {
    return 'The map is ready, and live rider tracking will appear after approval and assignment.'
  }
  if (isRider.value && !order.value?.rider_id && currentRiderId.value) {
    return 'Your current rider location is shown right away so you can compare it with the pickup and delivery points before accepting.'
  }
  if (!order.value?.rider_id) {
    return 'Pickup and delivery addresses are available now. Live rider sharing starts once the order is assigned.'
  }
  if (order.value?.status === 'accepted_by_rider') {
    return 'The assigned rider can already be tracked on the map before pickup, and the route will keep updating automatically.'
  }
  if (order.value?.status === 'picked_up') {
    return 'The rider location updates live while the order is on the way to the customer.'
  }
  return ''
})

const isAssignedRider = computed(
  () => !!currentRiderId.value && order.value?.rider_id === currentRiderId.value,
)
const canMarkAsPickedUp = computed(
  () => isAssignedRider.value && order.value?.status === 'accepted_by_rider',
)
const canMarkAsDelivered = computed(
  () =>
    isAssignedRider.value &&
    order.value?.status === 'picked_up' &&
    !isAwaitingCustomerConfirmation.value,
)
const showDeliveryProofSection = computed(
  () =>
    !!deliveryProofUrl.value ||
    !!order.value?.completed_at ||
    isAwaitingCustomerConfirmation.value ||
    hasDeliveryIssue.value,
)
const showCustomerDeliveryActions = computed(
  () => isBuyer.value && isAwaitingCustomerConfirmation.value,
)
const deliveryConfirmationAlertType = computed(() => {
  if (isOrderCompleted.value) return 'success'
  if (hasDeliveryIssue.value) return 'warning'
  return 'info'
})
const deliveryConfirmationTitle = computed(() => {
  if (isOrderCompleted.value) return 'Order receipt confirmed'
  if (hasDeliveryIssue.value) return 'Delivery issue reported'
  if (isAwaitingCustomerConfirmation.value && isBuyer.value) {
    return 'Please review and confirm this delivery'
  }
  if (isAwaitingCustomerConfirmation.value) return 'Waiting for customer confirmation'
  return 'Delivery proof available'
})
const deliveryConfirmationMessage = computed(() => {
  if (isOrderCompleted.value) {
    return `The customer confirmed receipt${order.value?.completed_at ? ` on ${formatDate(order.value.completed_at)}` : ''}.`
  }

  if (hasDeliveryIssue.value) {
    return deliveryIssueRoleMessage.value
  }

  if (isBuyer.value) {
    return 'Check the proof of delivery below, then confirm if the order arrived or report an issue if it did not.'
  }

  if (isAwaitingCustomerConfirmation.value) {
    return 'The rider uploaded proof of delivery. The customer can now confirm receipt or report a delivery issue.'
  }

  return 'The latest delivery proof is attached to this order for reference.'
})
const getTimelineStatus = () => {
  if (isOrderCompleted.value) return 'delivered'
  if (hasDeliveryIssue.value) return 'delivery_issue'
  if (isAwaitingCustomerConfirmation.value) return 'delivered'
  if (isCancellationRequestedOrder.value) return 'waiting_for_rider'
  return order.value?.status
}

// Timeline steps based on order status
const timelineSteps = computed(() => {
  const currentStatus = getTimelineStatus()

  const steps = [
    {
      key: 'order_placed',
      title: 'Order Placed',
      description: 'Your order has been placed and is waiting for seller approval',
      status: 'completed',
      timestamp: order.value?.created_at,
      icon: 'mdi-cart-check',
      date: order.value?.created_at,
      actor: 'Customer',
    },
    {
      key: 'approved',
      title: 'Order Approved',
      description: 'Seller has approved your order and is looking for a rider',
      status: getStepStatus('approved'),
      timestamp: order.value?.approved_at,
      icon: 'mdi-store-check',
      date: order.value?.approved_at,
      actor: 'Seller',
    },
    {
      key: 'rider_assigned',
      title: 'Rider Assigned',
      description: 'A rider has accepted your order and is on the way',
      status: getStepStatus('rider_assigned'),
      timestamp: order.value?.accepted_at,
      icon: 'mdi-motorbike',
      date: order.value?.accepted_at,
      actor: 'Rider',
    },
    {
      key: 'picked_up',
      title: 'Order Picked Up',
      description: 'Rider has picked up your order and is heading to you',
      status: getStepStatus('picked_up'),
      timestamp: order.value?.picked_up_at,
      icon: 'mdi-package-up',
      date: order.value?.picked_up_at,
      actor: 'Rider',
    },
    {
      key: 'delivered',
      title: 'Order Delivered',
      description: 'Your order has been successfully delivered',
      status: getStepStatus('delivered'),
      timestamp: order.value?.delivered_at,
      icon: 'mdi-home-check',
      date: order.value?.delivered_at,
      actor: 'Rider',
    },
  ]

  if (hasDeliveryIssue.value) {
    steps.push({
      key: 'delivery_issue',
      title: 'Delivery Issue Reported',
      description:
        'The customer reported that the order was not received and the case is waiting for resolution.',
      status: getStepStatus('delivery_issue'),
      timestamp: order.value?.updated_at,
      icon: 'mdi-alert-circle',
      date: order.value?.updated_at,
      actor: 'Customer',
    })
  }

  // If cancelled, mark steps appropriately
  if (currentStatus === 'cancelled') {
    const cancelledDate = order.value?.cancelled_at
    const cancelledDateValue = getAppTimestampValue(cancelledDate)

    steps.forEach((step) => {
      const stepDateValue = getAppTimestampValue(step.date)

      if (stepDateValue && cancelledDateValue && stepDateValue <= cancelledDateValue) {
        step.status = 'completed'
      } else if (step.status !== 'completed') {
        step.status = 'cancelled'
      }
    })
  }

  return steps
})

const getStepStatus = (
  stepKey: string,
): 'completed' | 'current' | 'pending' | 'cancelled' | 'issue' => {
  const currentStatus = getTimelineStatus()
  if (currentStatus === 'cancelled') return 'cancelled'

  const statusOrder = [
    'pending_approval',
    'waiting_for_rider',
    'accepted_by_rider',
    'picked_up',
    'delivered',
    'delivery_issue',
  ]
  const currentIndex = statusOrder.indexOf(currentStatus)

  const stepMap: Record<string, number> = {
    order_placed: -1,
    approved: 0,
    rider_assigned: 1,
    picked_up: 2,
    delivered: 3,
    delivery_issue: 4,
  }

  const stepIndex = stepMap[stepKey]

  if (stepKey === 'delivery_issue' && currentStatus === 'delivery_issue') return 'issue'
  if (stepIndex < currentIndex) return 'completed'
  if (stepIndex === currentIndex) return 'current'
  return 'pending'
}

const timelineProgress = computed(() => {
  const currentStatus = getTimelineStatus()
  if (currentStatus === 'cancelled') return 0
  if (currentStatus === 'delivered' || currentStatus === 'delivery_issue') return 100

  const statusOrder = [
    'pending_approval',
    'waiting_for_rider',
    'accepted_by_rider',
    'picked_up',
    'delivered',
    'delivery_issue',
  ]
  const currentIndex = statusOrder.indexOf(currentStatus)
  if (currentIndex === -1) return 0
  return ((currentIndex + 1) / statusOrder.length) * 100
})

// Action functions based on role
const getOrderNotificationData = () => ({
  ...order.value,
  address: shippingAddress.value,
  buyer: buyer.value,
  shop: shop.value,
  shop_owner_id: shop.value?.owner_id,
  shop_name: shop.value?.business_name,
  transaction_number: order.value?.transaction_number,
  customer_name: buyerDisplayName.value,
})

const createSellerCancellationRequestFallbackNotification = async (createdAt: string) => {
  const sellerUserId = shop.value?.owner_id
  if (!sellerUserId || sellerUserId === currentUser.value?.id) {
    return { created: false, reason: 'missing-seller-or-actor-is-recipient' }
  }

  const orderLabel = order.value?.transaction_number
    ? `order ${order.value.transaction_number}`
    : 'the order'
  const customerLabel = buyerDisplayName.value ? ` for ${buyerDisplayName.value}` : ''

  const notificationResult = await createNotificationRecordIfEnabled({
    userId: sellerUserId,
    type: 'shipping_update',
    title: 'Cancellation Requested',
    message: `Customer requested cancellation approval for ${orderLabel}${customerLabel}.`,
    relatedId: orderId,
    relatedType: 'order',
    isRead: false,
    createdAt,
  })

  if (!notificationResult.created && notificationResult.reason !== 'disabled-by-user-preference') {
    throw notificationResult
  }

  return { created: true, reason: 'fallback-created' }
}

const cancelOrder = async () => {
  if (!isBuyer.value || !currentUser.value?.id) return

  if (isBuyerCancellationLocked.value) {
    alert('Order can no longer be cancelled because it is already assigned to a rider')
    return
  }

  if (hasPendingCancellationRequest.value) {
    alert('Cancellation request already sent. Please wait for the seller to respond.')
    return
  }

  if (canBuyerCancelDirectly.value) {
    if (!confirm('Cancel this order now? This will immediately mark it as cancelled.')) return

    const cancelledAt = new Date().toISOString()
    cancellationActionLoading.value = 'cancel'

    try {
      const { data, error } = await supabase
        .from('orders')
        .update({
          status: 'cancelled',
          payment_status: 'cancelled',
          cancelled_at: cancelledAt,
          updated_at: cancelledAt,
        })
        .eq('id', orderId)
        .eq('user_id', currentUser.value.id)
        .eq('status', 'pending_approval')
        .select('id')

      if (error) throw error

      if (!data || data.length === 0) {
        await fetchOrderDetails()
        alert('This order was already updated and can no longer be cancelled directly.')
        return
      }

      await fetchOrderDetails()
      alert('Order cancelled successfully.')
      return
    } catch (err) {
      console.error('Error cancelling order:', err)
      alert('Failed to cancel order.')
      return
    } finally {
      cancellationActionLoading.value = null
    }
  }

  if (canBuyerRequestCancellation.value) {
    if (!confirm('Request cancellation for this approved order? The seller must approve it first.')) {
      return
    }

    const requestedAt = new Date().toISOString()
    cancellationActionLoading.value = 'request'

    try {
      const { data, error } = await supabase
        .from('orders')
        .update({
          status: ORDER_CANCEL_REQUESTED_STATUS,
          updated_at: requestedAt,
        })
        .eq('id', orderId)
        .eq('user_id', currentUser.value.id)
        .eq('status', 'waiting_for_rider')
        .is('rider_id', null)
        .select('id')

      if (error) throw error

      if (!data || data.length === 0) {
        await fetchOrderDetails()
        alert('Order can no longer be cancelled because it is already assigned to a rider')
        return
      }

      try {
        const notificationResult = await notifySellerOrderStatus({
          orderId,
          status: ORDER_CANCEL_REQUESTED_STATUS,
          createdAt: requestedAt,
          actorUserId: currentUser.value.id,
          orderData: getOrderNotificationData(),
        })

        if (!notificationResult?.created) {
          console.warn(
            'Seller cancellation request notification was not created:',
            notificationResult?.reason || 'unknown',
          )

          if (notificationResult?.reason === 'missing-context') {
            await createSellerCancellationRequestFallbackNotification(requestedAt)
          }
        }
      } catch (notificationError) {
        console.warn('Could not notify seller about the cancellation request:', notificationError)

        try {
          await createSellerCancellationRequestFallbackNotification(requestedAt)
        } catch (fallbackNotificationError) {
          console.warn(
            'Fallback seller cancellation request notification also failed:',
            fallbackNotificationError,
          )
        }
      }

      await fetchOrderDetails()
      alert('Cancellation request sent. Please wait for the seller to approve it.')
    } catch (err) {
      console.error('Error requesting cancellation:', err)
      if (
        err?.code === '23514' &&
        typeof err?.message === 'string' &&
        err.message.includes('orders_status_check')
      ) {
        alert(
          'Cancellation requests are not enabled in the database yet. Run the latest orders status constraint migration, then try again.',
        )
      } else {
        alert('Failed to send the cancellation request.')
      }
    } finally {
      cancellationActionLoading.value = null
    }
  }
}

const approveOrder = async () => {
  if (!isSeller.value) return
  if (!confirm('Approve this order? It will be made available for riders.')) return

  try {
    const { error } = await supabase
      .from('orders')
      .update({
        status: 'waiting_for_rider',
        approved_at: new Date().toISOString(),
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

const approveCancellationRequest = async () => {
  if (!isSeller.value || !isCancellationRequestedOrder.value) return
  if (!confirm('Approve this cancellation request and cancel the order?')) return

  const cancelledAt = new Date().toISOString()
  cancellationActionLoading.value = 'approve'

  try {
    const { data, error } = await supabase
      .from('orders')
      .update({
        status: 'cancelled',
        payment_status: 'cancelled',
        cancelled_at: cancelledAt,
        updated_at: cancelledAt,
      })
      .eq('id', orderId)
      .in('status', ORDER_CANCEL_REQUESTED_STATUSES)
      .is('rider_id', null)
      .select('id')

    if (error) throw error

    if (!data || data.length === 0) {
      await fetchOrderDetails()
      alert('This cancellation request is no longer available to approve.')
      return
    }

    try {
      await notifyCustomerOrderStatus({
        orderId,
        status: 'cancelled',
        createdAt: cancelledAt,
        orderData: getOrderNotificationData(),
      })
    } catch (notificationError) {
      console.warn('Could not notify customer about the approved cancellation:', notificationError)
    }

    alert('Cancellation approved. Order marked as cancelled.')
    await fetchOrderDetails()
  } catch (err) {
    console.error('Error approving cancellation request:', err)
    alert('Failed to approve the cancellation request.')
  } finally {
    cancellationActionLoading.value = null
  }
}

const declineCancellationRequest = async () => {
  if (!isSeller.value || !isCancellationRequestedOrder.value) return
  if (!confirm('Decline this cancellation request and return the order to waiting for rider?')) {
    return
  }

  const respondedAt = new Date().toISOString()
  cancellationActionLoading.value = 'decline'

  try {
    const { data, error } = await supabase
      .from('orders')
      .update({
        status: 'waiting_for_rider',
        updated_at: respondedAt,
      })
      .eq('id', orderId)
      .in('status', ORDER_CANCEL_REQUESTED_STATUSES)
      .is('rider_id', null)
      .select('id')

    if (error) throw error

    if (!data || data.length === 0) {
      await fetchOrderDetails()
      alert('This cancellation request is no longer available to decline.')
      return
    }

    try {
      await notifyCustomerOrderStatus({
        orderId,
        status: 'cancellation_request_declined',
        createdAt: respondedAt,
        orderData: getOrderNotificationData(),
      })
    } catch (notificationError) {
      console.warn('Could not notify customer about the declined cancellation request:', notificationError)
    }

    alert('Cancellation request declined. Order returned to waiting for rider.')
    await fetchOrderDetails()
  } catch (err) {
    console.error('Error declining cancellation request:', err)
    alert('Failed to decline the cancellation request.')
  } finally {
    cancellationActionLoading.value = null
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
        cancelled_at: new Date().toISOString(),
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

    const acceptedAt = new Date().toISOString()

    const { data, error } = await supabase
      .from('orders')
      .update({
        status: 'accepted_by_rider',
        accepted_at: acceptedAt,
        rider_id: currentRiderId.value,
      })
      .eq('id', orderId)
      .is('rider_id', null)
      .eq('status', 'waiting_for_rider')
      .select('id')

    if (error) throw error

    if (!data || data.length === 0) {
      alert('This order is no longer available for rider acceptance.')
      await fetchOrderDetails()
      return
    }

    try {
      await notifySellerOrderStatus({
        orderId,
        status: 'accepted_by_rider',
        createdAt: acceptedAt,
        actorUserId: currentUser.value?.id,
        orderData: {
          ...order.value,
          address: shippingAddress.value,
          buyer: buyer.value,
          shop: shop.value,
          shop_name: shop.value?.business_name,
        },
      })
    } catch (notificationError) {
      console.warn('Could not notify seller about rider acceptance:', notificationError)
    }

    alert('Order accepted! Head to the store to pick it up.')
    await fetchOrderDetails()
  } catch (err) {
    console.error('Error accepting order:', err)
    alert('Failed to accept order.')
  }
}

const markAsPickedUp = async () => {
  if (!canMarkAsPickedUp.value || !currentRiderId.value) {
    alert('Only the rider who accepted this order can mark it as picked up.')
    return
  }
  if (!confirm('Mark this order as picked up?')) return

  try {
    const pickedUpAt = new Date().toISOString()

    const { data, error } = await supabase
      .from('orders')
      .update({
        status: 'picked_up',
        picked_up_at: pickedUpAt,
      })
      .eq('id', orderId)
      .eq('rider_id', currentRiderId.value)
      .eq('status', 'accepted_by_rider')
      .select('id')

    if (error) throw error

    if (!data || data.length === 0) {
      throw new Error('This order can only be updated by the rider who accepted it.')
    }

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

    try {
      await notifySellerOrderStatus({
        orderId,
        status: 'picked_up',
        createdAt: pickedUpAt,
        actorUserId: currentUser.value?.id,
        orderData: {
          ...order.value,
          address: shippingAddress.value,
          buyer: buyer.value,
          shop: shop.value,
          shop_name: shop.value?.business_name,
        },
      })
    } catch (notificationError) {
      console.warn('Could not notify seller about picked up status:', notificationError)
    }

    alert('Order marked as picked up. Deliver to customer.')
    await fetchOrderDetails()
  } catch (err) {
    console.error('Error marking as picked up:', err)
    alert(err instanceof Error ? err.message : 'Failed to update status.')
  }
}

const resetProofDraft = () => {
  proofImage.value = null
  proofImagePreview.value = null
}

const closeProofDialog = () => {
  showProofDialog.value = false
  resetProofDraft()
}

const openProofDialog = () => {
  if (!canMarkAsDelivered.value) {
    alert('Only the rider who accepted this order can mark it as delivered.')
    return
  }

  showProofDialog.value = true
}

const viewFullImage = (imageUrl: string, title: string) => {
  selectedImage.value = imageUrl
  selectedImageTitle.value = title
  showImageDialog.value = true
}

const takePhoto = async () => {
  try {
    showProofDialog.value = false
    await new Promise((resolve) => setTimeout(resolve, 100))

    const photo = await Camera.getPhoto({
      resultType: CameraResultType.DataUrl,
      source: CameraSource.Camera,
      quality: 90,
      allowEditing: false,
      saveToGallery: false,
    })

    if (photo?.dataUrl) {
      const response = await fetch(photo.dataUrl)
      const blob = await response.blob()
      proofImage.value = new File([blob], `delivery_proof_${Date.now()}.jpg`, {
        type: 'image/jpeg',
      })
      proofImagePreview.value = photo.dataUrl
    }
  } catch (error: any) {
    if (error?.message !== 'User cancelled photos app') {
      console.error('Error taking delivery proof photo:', error)
      alert('Failed to open the camera. Please check camera permissions and try again.')
    }
  } finally {
    showProofDialog.value = true
  }
}

const chooseFromGallery = async () => {
  try {
    showProofDialog.value = false
    await new Promise((resolve) => setTimeout(resolve, 100))

    const photo = await Camera.getPhoto({
      resultType: CameraResultType.DataUrl,
      source: CameraSource.Photos,
      quality: 90,
      allowEditing: false,
    })

    if (photo?.dataUrl) {
      const response = await fetch(photo.dataUrl)
      const blob = await response.blob()
      proofImage.value = new File([blob], `delivery_proof_${Date.now()}.jpg`, {
        type: 'image/jpeg',
      })
      proofImagePreview.value = photo.dataUrl
    }
  } catch (error: any) {
    if (error?.message !== 'User cancelled photos app') {
      console.error('Error choosing delivery proof image:', error)
      alert('Failed to load an image from the gallery.')
    }
  } finally {
    showProofDialog.value = true
  }
}

const uploadProofImage = async () => {
  if (!proofImage.value) return null

  const fileExt = proofImage.value.name.split('.').pop() || 'jpg'
  const fileName = `proof_${orderId}_${Date.now()}.${fileExt}`
  const filePath = `delivery_proofs/${fileName}`

  const { error: uploadError } = await supabase.storage
    .from('order-proofs')
    .upload(filePath, proofImage.value, {
      cacheControl: '3600',
      upsert: false,
      contentType: `image/${fileExt === 'jpg' ? 'jpeg' : fileExt}`,
    })

  if (uploadError) throw uploadError

  const {
    data: { publicUrl },
  } = supabase.storage.from('order-proofs').getPublicUrl(filePath)

  return publicUrl
}

const markAsDelivered = async () => {
  if (!canMarkAsDelivered.value || !currentRiderId.value) {
    alert('Only the rider who accepted this order can mark it as delivered.')
    return
  }
  if (!proofImage.value) {
    alert('Please add a proof of delivery image before completing this order.')
    return
  }

  try {
    uploadingProof.value = true
    const deliveredAt = new Date().toISOString()
    const proofImageUrl = await uploadProofImage()
    const updateData = {
      delivered_at: deliveredAt,
      delivery_proof_url: proofImageUrl,
      updated_at: deliveredAt,
    }
    const { data, error } = await supabase
      .from('orders')
      .update(updateData)
      .eq('id', orderId)
      .eq('rider_id', currentRiderId.value)
      .eq('status', 'picked_up')
      .is('delivered_at', null)
      .is('completed_at', null)
      .select('id')

    if (error) throw error

    if (!data || data.length === 0) {
      throw new Error('This order can only be updated by the rider who accepted it.')
    }

    closeProofDialog()

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

    try {
      await notifySellerOrderStatus({
        orderId,
        status: 'delivered',
        createdAt: deliveredAt,
        actorUserId: currentUser.value?.id,
        orderData: {
          ...order.value,
          address: shippingAddress.value,
          buyer: buyer.value,
          shop: shop.value,
          shop_name: shop.value?.business_name,
        },
      })
    } catch (notificationError) {
      console.warn('Could not notify seller about delivered status:', notificationError)
    }

    alert('Delivery proof uploaded. Waiting for customer confirmation.')
    await fetchOrderDetails()
  } catch (err) {
    console.error('Error marking as delivered:', err)
    alert(err instanceof Error ? err.message : 'Failed to update status.')
  } finally {
    uploadingProof.value = false
  }
}

const confirmOrderReceived = async () => {
  if (!showCustomerDeliveryActions.value || !currentUser.value?.id) return
  if (!confirm('Confirm that you received this order?')) return

  const completedAt = new Date().toISOString()
  customerDecisionLoading.value = 'completed'

  try {
    const { data, error } = await supabase
      .from('orders')
      .update({
        completed_at: completedAt,
        updated_at: completedAt,
      })
      .eq('id', orderId)
      .eq('user_id', currentUser.value.id)
      .in('status', ['picked_up', 'delivered'])
      .not('delivered_at', 'is', null)
      .is('completed_at', null)
      .select('id')

    if (error) throw error

    if (!data || data.length === 0) {
      throw new Error('This order is no longer waiting for customer confirmation.')
    }

    alert('Order confirmed as received.')
    await fetchOrderDetails()
  } catch (err) {
    console.error('Error confirming delivered order:', err)
    alert(err instanceof Error ? err.message : 'Failed to confirm this order.')
  } finally {
    customerDecisionLoading.value = null
  }
}

const reportOrderNotReceived = async () => {
  if (!showCustomerDeliveryActions.value || !currentUser.value?.id) return
  if (!confirm('Report that this order was not received?')) return

  const reportedAt = new Date().toISOString()
  customerDecisionLoading.value = 'not_received'

  try {
    const { data, error } = await supabase
      .from('orders')
      .update({
        status: 'picked_up',
        delivered_at: null,
        updated_at: reportedAt,
      })
      .eq('id', orderId)
      .eq('user_id', currentUser.value.id)
      .in('status', ['picked_up', 'delivered'])
      .not('delivered_at', 'is', null)
      .is('completed_at', null)
      .select('id')

    if (error) throw error

    if (!data || data.length === 0) {
      throw new Error('This order is no longer waiting for customer confirmation.')
    }

    try {
      await notifySellerOrderStatus({
        orderId,
        status: 'not_received',
        createdAt: reportedAt,
        actorUserId: currentUser.value.id,
        orderData: {
          ...order.value,
          address: shippingAddress.value,
          buyer: buyer.value,
          shop: shop.value,
          shop_name: shop.value?.business_name,
        },
      })
    } catch (notificationError) {
      console.warn('Could not notify seller about the delivery issue:', notificationError)
    }

    try {
      await notifyAssignedRiderOrderStatus({
        orderId,
        status: 'not_received',
        createdAt: reportedAt,
        actorUserId: currentUser.value.id,
        orderData: {
          ...order.value,
          address: shippingAddress.value,
          buyer: buyer.value,
          shop: shop.value,
          shop_name: shop.value?.business_name,
        },
      })
    } catch (notificationError) {
      console.warn(
        'Could not notify the assigned rider about the delivery issue:',
        notificationError,
      )
    }

    alert('Delivery issue reported. The shop owner and assigned rider have been notified.')
    await fetchOrderDetails()
  } catch (err) {
    console.error('Error reporting order not received:', err)
    alert(err instanceof Error ? err.message : 'Failed to report this delivery issue.')
  } finally {
    customerDecisionLoading.value = null
  }
}

// Format functions
const formatDate = (dateString: string) => {
  return formatAppDateTime(dateString, {
    fallback: 'Not set',
    month: 'long',
    year: 'numeric',
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
  } catch {
    return '/placeholder.png'
  }
}

const buildFullAddress = computed(() => {
  if (!shippingAddress.value) return 'No shipping address'
  return buildDeliveryAddress(shippingAddress.value)
})

const goBack = () => router.back()
const goToFullscreenMap = () => router.push({ name: 'LocationToDeliver', params: { orderId } })
const goToRateOrder = () => router.push({ name: 'rateview', params: { orderId } })
const viewProduct = (productId: string) =>
  router.push({ name: 'product-detail', params: { id: productId } })
const contactSeller = () =>
  shop.value?.owner_id && router.push({ name: 'chatview', params: { id: shop.value.owner_id } })
const contactBuyer = () =>
  buyer.value?.id && router.push({ name: 'chatview', params: { id: buyer.value.id } })
const contactRider = () =>
  riderDetails.value?.phone && (window.location.href = `tel:${riderDetails.value.phone}`)

// Cleanup
onUnmounted(() => {
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
                <v-chip
                  v-if="order?.status"
                  :color="statusColor"
                  variant="tonal"
                  class="order-status-chip"
                >
                  <v-icon start size="16">{{ statusIcon }}</v-icon>
                  {{ statusDisplayText }}
                </v-chip>
                <span class="hero-reference">{{ orderReferenceText }}</span>
              </div>
              <h2>{{ trackingMapTitle }}</h2>
              <p>
                <span v-if="isOrderCompleted"
                  >The customer confirmed receipt and the order is completed. If the items still
                  need a review, you can submit it anytime from here.</span
                >
                <span v-else-if="hasDeliveryIssue">{{ deliveryIssueRoleMessage }}</span>
                <span v-else-if="isAwaitingCustomerConfirmation"
                  >The rider marked the order as delivered and the customer can now confirm
                  receipt.</span
                >
                <span v-else-if="order.status === 'picked_up'"
                  >The order has left the shop and is heading to the customer.</span
                >
                <span v-else-if="order.status === 'accepted_by_rider'"
                  >The rider is moving toward the pickup point.</span
                >
                <span v-else-if="order.status === 'waiting_for_rider'"
                  >The seller approved the order and it is waiting for a rider.</span
                >
                <span v-else-if="isCancellationRequestedOrder"
                  >A buyer cancellation request is waiting for seller approval.</span
                >
                <span v-else-if="order.status === 'pending_approval'"
                  >The seller still needs to approve the order.</span
                >
                <span v-else-if="order.status === 'cancelled'"
                  >This order was cancelled before completion.</span
                >
              </p>
              <v-btn
                v-if="showReviewOrderButton"
                color="secondary"
                variant="tonal"
                class="hero-review-cta"
                @click="goToRateOrder"
              >
                <v-icon start>mdi-star-outline</v-icon>
                Review items
              </v-btn>
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
                v-if="buyerCancellationNotice"
                :type="buyerCancellationNotice.type"
                variant="tonal"
                class="mb-4"
              >
                <div class="delivery-confirmation-copy">
                  <div class="inline-alert">
                    <v-icon>{{ buyerCancellationNotice.icon }}</v-icon>
                    <strong>{{ buyerCancellationNotice.title }}</strong>
                  </div>
                  <span>{{ buyerCancellationNotice.message }}</span>
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
                :show-fullscreen-button="true"
                @open-fullscreen="goToFullscreenMap"
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

                <v-card
                  class="surface-card"
                  v-if="riderDetails && order.status !== 'pending_approval'"
                >
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

              <v-card v-if="showDeliveryProofSection" class="surface-card">
                <v-card-title class="section-title">
                  <v-icon start>mdi-camera</v-icon>
                  Proof of delivery
                </v-card-title>
                <v-card-text>
                  <div v-if="deliveryProofUrl" class="proof-card">
                    <div
                      class="proof-image-frame"
                      @click="viewFullImage(deliveryProofUrl, 'Proof of Delivery')"
                    >
                      <v-img :src="deliveryProofUrl" height="220" cover class="proof-image">
                        <template #placeholder>
                          <div class="proof-image-placeholder">
                            <v-progress-circular indeterminate color="primary" />
                          </div>
                        </template>
                      </v-img>
                    </div>

                    <div class="proof-meta">
                      <div class="proof-meta__row">
                        <span>{{ deliveryProofMetaLabel }}</span>
                        <strong>{{ deliveryProofMetaValue }}</strong>
                      </div>
                      <p>
                        The proof image is visible to the buyer, seller, and rider for delivery
                        transparency.
                      </p>
                    </div>

                    <div class="detail-actions">
                      <v-btn
                        color="primary"
                        variant="outlined"
                        size="small"
                        @click="viewFullImage(deliveryProofUrl, 'Proof of Delivery')"
                      >
                        <v-icon start size="16">mdi-magnify</v-icon>
                        View full image
                      </v-btn>
                    </div>
                  </div>

                  <div v-else class="proof-empty-state">
                    <v-icon size="36" color="grey">mdi-image-off-outline</v-icon>
                    <div>
                      <strong>Proof image not available yet</strong>
                      <p v-if="canMarkAsDelivered">
                        Add a delivery photo before you complete this delivery attempt.
                      </p>
                      <p v-else>
                        The proof of delivery image has not been attached to this order yet.
                      </p>
                    </div>
                  </div>
                </v-card-text>
              </v-card>

              <v-alert
                v-if="showDeliveryProofSection"
                :type="deliveryConfirmationAlertType"
                variant="tonal"
              >
                <div class="delivery-confirmation-copy">
                  <strong>{{ deliveryConfirmationTitle }}</strong>
                  <span>{{ deliveryConfirmationMessage }}</span>
                </div>
              </v-alert>

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
                          <span v-if="item.selected_variety"
                            >Variety: {{ item.selected_variety }}</span
                          >
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
                      <div class="price-item">
                        <span>Subtotal</span><span>{{ formatCurrency(subtotal) }}</span>
                      </div>
                      <div class="price-item">
                        <span>Delivery fee</span><span>{{ formatCurrency(deliveryFee) }}</span>
                      </div>
                      <div class="price-item total">
                        <span>Total</span><span>{{ formatCurrency(totalAmount) }}</span>
                      </div>
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
                      <span v-if="deliveryContactNumber"> - {{ deliveryContactNumber }}</span>
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
                      'timeline-issue': step.status === 'issue',
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
                              : step.status === 'issue'
                                ? '#f59e0b'
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
                  <div class="legend-item">
                    <div class="legend-dot completed"></div>
                    <span>Completed</span>
                  </div>
                  <div class="legend-item">
                    <div class="legend-dot current"></div>
                    <span>Current</span>
                  </div>
                  <div v-if="hasDeliveryIssue" class="legend-item">
                    <div class="legend-dot issue"></div>
                    <span>Issue</span>
                  </div>
                  <div class="legend-item">
                    <div class="legend-dot pending"></div>
                    <span>Pending</span>
                  </div>
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
            v-if="showBuyerCancelButton"
            :color="canBuyerRequestCancellation ? 'warning' : isBuyerCancelButtonDisabled ? 'grey' : 'error'"
            :variant="isBuyerCancelButtonDisabled ? 'outlined' : undefined"
            :disabled="isBuyerCancelButtonDisabled"
            :loading="
              cancellationActionLoading === 'cancel' || cancellationActionLoading === 'request'
            "
            @click="cancelOrder"
          >
            <v-icon start>mdi-close-circle</v-icon>
            {{ buyerCancelButtonText }}
          </v-btn>
          <v-btn
            v-if="showCustomerDeliveryActions"
            color="error"
            variant="outlined"
            :loading="customerDecisionLoading === 'not_received'"
            :disabled="customerDecisionLoading !== null"
            @click="reportOrderNotReceived"
          >
            <v-icon start>mdi-alert-circle-outline</v-icon>
            Order Not Received
          </v-btn>
          <v-btn
            v-if="showCustomerDeliveryActions"
            color="success"
            :loading="customerDecisionLoading === 'completed'"
            :disabled="customerDecisionLoading !== null"
            @click="confirmOrderReceived"
          >
            <v-icon start>mdi-check-circle</v-icon>
            Order Received
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
          <v-btn
            v-if="isCancellationRequestedOrder"
            color="error"
            :loading="cancellationActionLoading === 'approve'"
            @click="approveCancellationRequest"
          >
            <v-icon start>mdi-check-circle</v-icon>
            Approve cancellation
          </v-btn>
          <v-btn
            v-if="isCancellationRequestedOrder"
            color="warning"
            variant="outlined"
            :loading="cancellationActionLoading === 'decline'"
            @click="declineCancellationRequest"
          >
            <v-icon start>mdi-arrow-u-left-top</v-icon>
            Keep order active
          </v-btn>
        </template>

        <template v-else-if="isRider">
          <v-btn
            v-if="order.status === 'waiting_for_rider'"
            color="primary"
            @click="acceptOrderAsRider"
          >
            <v-icon start>mdi-check-circle</v-icon>
            Accept order
          </v-btn>
        </template>

        <v-btn v-if="canMarkAsPickedUp" color="warning" @click="markAsPickedUp">
          <v-icon start>mdi-package-up</v-icon>
          Mark as picked up
        </v-btn>
        <v-btn v-if="canMarkAsDelivered" color="success" @click="openProofDialog">
          <v-icon start>mdi-camera</v-icon>
          {{ reattemptDeliveryButtonText }}
        </v-btn>

        <v-btn variant="outlined" @click="goBack">Close</v-btn>
      </div>
    </v-footer>

    <v-dialog v-model="showProofDialog" max-width="520">
      <v-card>
        <v-card-title class="text-h6">
          <v-icon start color="success">mdi-camera</v-icon>
          Proof of Delivery
        </v-card-title>
        <v-divider />
        <v-card-text class="pa-4">
          <div class="proof-dialog-copy">
            <strong>Add a delivery photo before completing this order.</strong>
            <p>The buyer and shop owner will be able to see this image in order details.</p>
          </div>

          <div v-if="proofImagePreview" class="proof-preview">
            <v-img
              :src="proofImagePreview"
              height="240"
              cover
              class="proof-image"
              @click="viewFullImage(proofImagePreview, 'Proof Preview')"
            />
            <div class="detail-actions mt-3">
              <v-btn size="small" variant="text" @click="takePhoto">
                <v-icon start size="16">mdi-camera-retake</v-icon>
                Retake photo
              </v-btn>
              <v-btn size="small" variant="text" @click="chooseFromGallery">
                <v-icon start size="16">mdi-folder-image</v-icon>
                Choose from gallery
              </v-btn>
            </div>
          </div>

          <div v-else class="proof-source-actions">
            <v-btn color="primary" variant="outlined" @click="takePhoto">
              <v-icon start>mdi-camera</v-icon>
              Take photo
            </v-btn>
            <v-btn color="primary" variant="outlined" @click="chooseFromGallery">
              <v-icon start>mdi-folder-image</v-icon>
              Choose from gallery
            </v-btn>
          </div>
        </v-card-text>
        <v-card-actions>
          <v-btn variant="text" @click="closeProofDialog">Cancel</v-btn>
          <v-spacer />
          <v-btn
            color="success"
            :loading="uploadingProof"
            :disabled="!proofImage"
            @click="markAsDelivered"
          >
            Upload & mark delivered
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog v-model="showImageDialog" max-width="90vw">
      <v-card class="image-viewer-card">
        <div class="image-viewer-head">
          <strong>{{ selectedImageTitle || 'Image Preview' }}</strong>
          <v-btn icon variant="text" @click="showImageDialog = false">
            <v-icon>mdi-close</v-icon>
          </v-btn>
        </div>
        <v-divider />
        <v-card-text class="pa-2">
          <v-img
            v-if="selectedImage"
            :src="selectedImage"
            max-height="70vh"
            contain
            class="image-viewer-preview"
          />
        </v-card-text>
      </v-card>
    </v-dialog>
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
  background: rgba(11, 37, 69, 0.92);
  box-shadow: 0 12px 28px rgba(20, 44, 73, 0.16);
}

.order-header__inner {
  max-width: 960px;
  margin: 0 auto;
  padding: 10px max(16px, env(safe-area-inset-left, 0px)) 12px
    max(16px, env(safe-area-inset-right, 0px));
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

.hero-review-cta {
  margin-top: 14px;
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

.proof-card {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.proof-image-frame {
  border-radius: 18px;
  overflow: hidden;
  border: 1px solid rgba(18, 48, 79, 0.08);
  cursor: pointer;
}

.proof-image,
.image-viewer-preview {
  border-radius: 18px;
}

.proof-image-placeholder {
  height: 220px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(180deg, #f8fbff, #eef4fc);
}

.proof-meta {
  padding: 14px 16px;
  border-radius: 16px;
  background: linear-gradient(180deg, #f8fbff, #eef4fc);
  color: #12304f;
}

.proof-meta__row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: center;
  margin-bottom: 8px;
}

.proof-meta p {
  margin: 0;
  font-size: 0.88rem;
  line-height: 1.5;
  color: #52667d;
}

.proof-empty-state {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  padding: 16px;
  border-radius: 16px;
  background: linear-gradient(180deg, #f8fbff, #eef4fc);
}

.proof-empty-state strong {
  display: block;
  color: #12304f;
}

.proof-empty-state p {
  margin: 6px 0 0;
  color: #627d98;
  font-size: 0.88rem;
}

.delivery-confirmation-copy {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.delivery-confirmation-copy strong {
  color: #12304f;
}

.delivery-confirmation-copy span {
  line-height: 1.5;
}

.proof-dialog-copy strong {
  display: block;
  color: #12304f;
}

.proof-dialog-copy p {
  margin: 8px 0 0;
  color: #627d98;
  line-height: 1.5;
}

.proof-preview {
  margin-top: 16px;
}

.proof-source-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 16px;
}

.image-viewer-card {
  border-radius: 24px;
  overflow: hidden;
}

.image-viewer-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 16px;
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

.timeline-issue .timeline-icon {
  border-color: #f59e0b;
  background: #fff7e6;
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

.timeline-issue::before {
  background: #f59e0b;
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

.legend-dot.issue {
  background: #f59e0b;
  border: 2px solid #f59e0b;
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
    padding: 8px max(12px, env(safe-area-inset-left, 0px)) 10px
      max(12px, env(safe-area-inset-right, 0px));
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

  .proof-meta__row,
  .proof-empty-state {
    flex-direction: column;
    align-items: flex-start;
  }

  .proof-source-actions {
    flex-direction: column;
  }

  .proof-source-actions :deep(.v-btn) {
    width: 100%;
  }

  .action-buttons {
    flex-direction: column;
  }
}
</style>
