<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/utils/supabase'
import { reconcileAutoCompletedOrders } from '@/utils/orderAutoCompletion'
import { formatAppDateTime, getAppTimestampValue, parseAppTimestamp } from '@/utils/dateTime'
import {
  buildRiderEarningsRecordsFromOrders,
  clearRiderEarningsLedgerMissingMark,
  formatPhpAmount,
  formatRiderDistanceLabel,
  isMissingRiderEarningsTableError,
  isRiderEarningsLedgerMarkedMissing,
  markRiderEarningsLedgerMissing,
  resolveOrderDeliveryDistanceKm,
  resolveOrderRiderEarningsQuote,
} from '@/utils/riderEarnings.js'
import { calculateOrderItemsSubtotal, resolveOrderDeliveryFee } from '@/utils/deliveryPricing.js'

const router = useRouter()

// State
const loading = ref(false)
const activeFilter = ref('available')
const currentTime = ref(Date.now())
let currentTimeInterval = null

// Location state
const currentLocation = ref(null)
const locationLoading = ref(false)
const locationWatchId = ref(null)

// Orders data
const orders = ref([])
const ordersSubscription = ref(null)
const earningsRecords = ref([])
const earningsSubscription = ref(null)
const usingOrdersEarningsFallback = ref(false)

// Get current rider info
const currentRider = ref(null)
const currentRiderNumericId = ref(null)

const isAwaitingCustomerConfirmation = (order) => !!order?.delivered_at && !order?.completed_at

const hasDeliveryIssue = (order) =>
  order?.status === 'picked_up' &&
  !!(order?.delivery_proof_url || order?.proof_of_delivery_url) &&
  !order?.delivered_at &&
  !order?.completed_at

const isOrderCompleted = (order) => !!order?.completed_at || order?.status === 'completed'

const isActivePickedUpOrder = (order) =>
  order?.status === 'picked_up' &&
  !hasDeliveryIssue(order) &&
  !isAwaitingCustomerConfirmation(order) &&
  !isOrderCompleted(order)

const getOrderActivityTimestamp = (order) => {
  if (!order) return null

  if (order.status === 'accepted_by_rider') {
    return order.accepted_at || order.updated_at || order.created_at
  }

  if (hasDeliveryIssue(order)) {
    return order.updated_at || order.picked_up_at || order.accepted_at || order.created_at
  }

  if (isActivePickedUpOrder(order)) {
    return order.picked_up_at || order.accepted_at || order.updated_at || order.created_at
  }

  if (isAwaitingCustomerConfirmation(order)) {
    return order.delivered_at || order.updated_at || order.created_at
  }

  if (isOrderCompleted(order)) {
    return order.completed_at || order.delivered_at || order.updated_at || order.created_at
  }

  return order.created_at || order.updated_at || null
}

const getOrderActivityTimestampValue = (order) =>
  getAppTimestampValue(getOrderActivityTimestamp(order))

const sortOrdersByActivityTime = (left, right, direction = 'asc') => {
  const leftValue = getOrderActivityTimestampValue(left)
  const rightValue = getOrderActivityTimestampValue(right)

  return direction === 'desc' ? rightValue - leftValue : leftValue - rightValue
}

const isSameLocalDay = (timestamp, now = Date.now()) => {
  const date = parseAppTimestamp(timestamp)
  if (!date) return false

  const current = new Date(now)

  return (
    date.getFullYear() === current.getFullYear() &&
    date.getMonth() === current.getMonth() &&
    date.getDate() === current.getDate()
  )
}

// Check if rider is approved
const isApproved = ref(false)
const applicationStatus = ref(null)
const loadingProfile = ref(true)

// Computed orders by status
const acceptedOrders = computed(() => {
  return orders.value
    .filter(
      (order) =>
        order.status === 'accepted_by_rider' && order.rider_id === currentRiderNumericId.value,
    )
    .sort((a, b) => sortOrdersByActivityTime(a, b))
})

const availableOrders = computed(() => {
  return orders.value
    .filter((order) => {
      // Only show orders that are waiting_for_rider AND have no rider assigned
      const hasNoRider = !order.rider_id || order.rider_id === null
      const isWaitingForRider = order.status === 'waiting_for_rider'
      return hasNoRider && isWaitingForRider
    })
    .sort((a, b) => sortOrdersByActivityTime(a, b))
})

const pickedUpOrders = computed(() => {
  return orders.value
    .filter(
      (order) =>
        order.status === 'picked_up' &&
        !isAwaitingCustomerConfirmation(order) &&
        !isOrderCompleted(order) &&
        order.rider_id === currentRiderNumericId.value,
    )
    .sort((a, b) => sortOrdersByActivityTime(a, b))
})

const deliveredOrders = computed(() => {
  return orders.value
    .filter(
      (order) =>
        isAwaitingCustomerConfirmation(order) && order.rider_id === currentRiderNumericId.value,
    )
    .sort((a, b) => sortOrdersByActivityTime(a, b, 'desc'))
})

const completedOrders = computed(() => {
  return orders.value
    .filter((order) => isOrderCompleted(order) && order.rider_id === currentRiderNumericId.value)
    .sort((a, b) => sortOrdersByActivityTime(a, b, 'desc'))
})

// Stats
const stats = computed(() => ({
  acceptedOrders: acceptedOrders.value.length,
  availableOrders: availableOrders.value.length,
  pickedUpOrders: pickedUpOrders.value.length,
  deliveredOrders: deliveredOrders.value.length,
  completedToday: completedOrders.value.filter((order) => {
    return isSameLocalDay(getOrderActivityTimestamp(order), currentTime.value)
  }).length,
  todayEarnings: earningsRecords.value
    .filter((record) => isSameLocalDay(record.earned_at, currentTime.value))
    .reduce((sum, record) => sum + Number(record.amount || 0), 0),
  totalEarnings: earningsRecords.value.reduce((sum, record) => sum + Number(record.amount || 0), 0),
}))

// Get filtered orders based on active filter
const filteredOrders = computed(() => {
  switch (activeFilter.value) {
    case 'accepted':
      return acceptedOrders.value
    case 'available':
      return availableOrders.value
    case 'pickedup':
      return pickedUpOrders.value
    case 'delivered':
      return deliveredOrders.value
    case 'completed':
      return completedOrders.value
    default:
      return availableOrders.value
  }
})

// Helper functions
const getOrderTimeLabel = (order) => {
  if (hasDeliveryIssue(order)) return 'Issue reported'
  if (order?.status === 'accepted_by_rider') return 'Accepted'
  if (isActivePickedUpOrder(order)) return 'Picked up'
  if (isAwaitingCustomerConfirmation(order)) return 'Delivered'
  if (isOrderCompleted(order)) return 'Completed'
  if (order?.status === 'waiting_for_rider') return 'Placed'
  return 'Updated'
}

const formatOrderDateTime = (order) => {
  return formatAppDateTime(getOrderActivityTimestamp(order), {
    now: currentTime.value,
    fallback: 'Unknown time',
    relativeDay: true,
    month: 'short',
    year: 'auto',
  })
}

function getOrderPayQuote(order) {
  return resolveOrderRiderEarningsQuote(order)
}

function getPickupDistanceLabel(order) {
  if (order?.pickup_distance_from_rider_km === null || order?.pickup_distance_from_rider_km === undefined) {
    return ''
  }

  return formatRiderDistanceLabel(order.pickup_distance_from_rider_km)
}

function getDeliveryDistanceLabel(order) {
  const distanceKm = resolveOrderDeliveryDistanceKm(order)

  if (distanceKm === null) return ''

  return formatRiderDistanceLabel(distanceKm)
}

const fetchEarningsRecords = async () => {
  if (!currentRiderNumericId.value) {
    earningsRecords.value = []
    return
  }

  if (isRiderEarningsLedgerMarkedMissing()) {
    await fetchFallbackEarningsRecords()
    return
  }

  try {
    const { data, error } = await supabase
      .from('rider_earnings')
      .select(
        `
        id,
        order_id,
        rider_id,
        amount,
        base_pay,
        additional_distance_km,
        additional_pay,
        delivery_distance_km,
        pay_rule,
        status,
        earned_at,
        paid_at,
        created_at,
        order:orders!rider_earnings_order_id_fkey (
          id,
          transaction_number,
          status
        )
      `,
      )
      .eq('rider_id', currentRiderNumericId.value)
      .order('earned_at', { ascending: false })

    if (error) {
      if (isMissingRiderEarningsTableError(error)) {
        markRiderEarningsLedgerMissing()
        console.warn(
          'rider_earnings table is not available in this Supabase project yet. Falling back to completed orders.',
        )
        await fetchFallbackEarningsRecords()
        return
      }

      throw error
    }

    clearRiderEarningsLedgerMissingMark()
    usingOrdersEarningsFallback.value = false
    earningsRecords.value = (data || []).map((record) => ({
      ...record,
      amount: Number(record.amount || 0),
      base_pay: Number(record.base_pay || 0),
      additional_pay: Number(record.additional_pay || 0),
      delivery_distance_km: Number(record.delivery_distance_km || 0),
      additional_distance_km: Number(record.additional_distance_km || 0),
    }))
  } catch (error) {
    console.error('Error fetching rider earnings:', error)
    earningsRecords.value = []
  }
}

const fetchFallbackEarningsRecords = async () => {
  const { data, error } = await supabase
    .from('orders')
    .select(
      `
      *,
      shop:shop_id (
        latitude,
        longitude
      ),
      address:address_id (
        latitude,
        longitude
      )
    `,
    )
    .eq('rider_id', currentRiderNumericId.value)
    .or('completed_at.not.is.null,delivered_at.not.is.null,status.eq.completed')
    .order('updated_at', { ascending: false })

  if (error) throw error

  usingOrdersEarningsFallback.value = true
  earningsRecords.value = buildRiderEarningsRecordsFromOrders(
    data || [],
    currentRiderNumericId.value,
  )
}

// Check rider approval status
const checkRiderApproval = async () => {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      router.push('/login')
      return
    }

    const { data, error } = await supabase
      .from('Rider_Registration')
      .select('status, rider_id, first_name, last_name, email, is_available')
      .eq('profile_id', user.id)
      .single()

    if (error) throw error

    applicationStatus.value = data.status
    isApproved.value = data.status === 'approved'
    currentRiderNumericId.value = data.rider_id
    currentRider.value = data

    console.log('Rider logged in:', {
      name: `${data.first_name} ${data.last_name}`,
      email: data.email,
      rider_id: data.rider_id,
      status: data.status,
    })

    if (!isApproved.value) {
      if (data.status === 'pending') {
        alert('Your rider application is still pending. Please wait for admin approval.')
      } else if (data.status === 'rejected') {
        alert('Your rider application was rejected. Please contact support.')
      }
      router.push('/application-status')
    }
  } catch (error) {
    console.error('Error checking rider status:', error)
    router.push('/application-form')
  } finally {
    loadingProfile.value = false
  }
}

// Location functions
const getCurrentLocation = () => {
  locationLoading.value = true

  if (!navigator.geolocation) {
    alert('Geolocation is not supported by your browser')
    locationLoading.value = false
    return
  }

  navigator.geolocation.getCurrentPosition(
    async (position) => {
      const { latitude, longitude } = position.coords
      currentLocation.value = { latitude, longitude }
      await getAddressFromCoords(latitude, longitude)
      locationLoading.value = false
      filterOrdersByDistance(latitude, longitude)
    },
    (error) => {
      console.error('Location error:', error)
      let errorMessage = 'Unable to get your location. '
      switch (error.code) {
        case error.PERMISSION_DENIED:
          errorMessage += 'Please enable location access in your browser settings.'
          break
        case error.POSITION_UNAVAILABLE:
          errorMessage += 'Location information is unavailable.'
          break
        case error.TIMEOUT:
          errorMessage += 'Location request timed out.'
          break
      }
      alert(errorMessage)
      locationLoading.value = false
    },
    {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0,
    },
  )
}

const getAddressFromCoords = async (lat, lng) => {
  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`,
    )
    const data = await response.json()
    if (data && data.display_name) {
      const addressParts = data.display_name.split(',')
      currentLocation.value.address = addressParts.slice(0, 3).join(', ')
      currentLocation.value.fullAddress = data.display_name
    }
  } catch (error) {
    console.error('Error getting address:', error)
    currentLocation.value.address = `${lat.toFixed(4)}, ${lng.toFixed(4)}`
  }
}

const calculateDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lon2 - lon1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

const filterOrdersByDistance = (lat, lng) => {
  orders.value = orders.value.map((order) => {
    if (order.pickup_lat && order.pickup_lng) {
      const distance = calculateDistance(lat, lng, order.pickup_lat, order.pickup_lng)
      return { ...order, pickup_distance_from_rider_km: Number(distance.toFixed(2)) }
    }
    return order
  })
}

const startWatchingLocation = () => {
  if (navigator.geolocation) {
    locationWatchId.value = navigator.geolocation.watchPosition(
      (position) => {
        const { latitude, longitude } = position.coords
        currentLocation.value = { ...currentLocation.value, latitude, longitude }
        if (currentLocation.value.latitude) {
          filterOrdersByDistance(latitude, longitude)
        }
      },
      (error) => console.error('Watch location error:', error),
      { enableHighAccuracy: true, maximumAge: 30000, timeout: 10000 },
    )
  }
}

const stopWatchingLocation = () => {
  if (locationWatchId.value && navigator.geolocation) {
    navigator.geolocation.clearWatch(locationWatchId.value)
    locationWatchId.value = null
  }
}

// Fetch orders
const fetchOrders = async () => {
  loading.value = true
  try {
    currentTime.value = Date.now()
    console.log('Fetching orders for rider ID:', currentRiderNumericId.value)

    const { data, error } = await supabase
      .from('orders')
      .select(
        `
        *,
        order_items (
          id,
          quantity,
          price,
          selected_size,
          selected_variety,
          variety_data,
          products (
            id,
            prod_name,
            main_img_urls,
            price
          )
        ),
        profiles:user_id (
          first_name,
          last_name,
          phone
        ),
        shop:shop_id (
          business_name,
          building,
          street,
          barangay,
          city,
          province,
          latitude,
          longitude
        ),
        address:address_id (
          recipient_name,
          phone,
          street,
          building,
          house_no,
          barangay_name,
          city_name,
          province_name,
          latitude,
          longitude
        )
      `,
      )
      .or(
        `and(status.eq.waiting_for_rider,rider_id.is.null),rider_id.eq.${currentRiderNumericId.value}`,
      )
      .order('created_at', { ascending: false })

    if (error) throw error

    if (data && data.length > 0) {
      const hydratedOrders = data.map((order) => {
        const shop = order.shop || {}
        const pickupAddress =
          [shop.building, shop.street, shop.barangay, shop.city, shop.province]
            .filter(Boolean)
            .join(', ') || 'Store Address'

        const address = order.address || {}
        const deliveryAddress =
          [
            address.house_no,
            address.building,
            address.street,
            address.barangay_name,
            address.city_name,
            address.province_name,
          ]
            .filter(Boolean)
            .join(', ') || 'Delivery Address'

        const profile = order.profiles || {}
        const customerName =
          `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || 'Customer'

        const items = (order.order_items || []).map((item) => {
          const product = item.products || {}
          return {
            id: item.id,
            name: product.prod_name || 'Product',
            quantity: item.quantity,
            price: item.price,
            selected_size: item.selected_size,
            selected_variety: item.selected_variety,
            variety_data: item.variety_data,
            image: product.main_img_urls
              ? Array.isArray(product.main_img_urls)
                ? product.main_img_urls[0]
                : product.main_img_urls
              : null,
          }
        })

        const subtotal = calculateOrderItemsSubtotal(items)
        const hydratedOrder = {
          ...order,
          pickup_address: pickupAddress,
          delivery_address: deliveryAddress,
          customer_name: customerName,
          customer_phone: order.contact_number || address.phone || profile.phone || '',
          shop_name: shop.business_name || 'Shop',
          pickup_lat: shop.latitude,
          pickup_lng: shop.longitude,
          delivery_lat: address.latitude,
          delivery_lng: address.longitude,
          items: items,
          subtotal: subtotal,
          delivery_fee: resolveOrderDeliveryFee({
            ...order,
            pickup_lat: shop.latitude,
            pickup_lng: shop.longitude,
            delivery_lat: address.latitude,
            delivery_lng: address.longitude,
          }, undefined, subtotal),
          product_summary: items.map((item) => `${item.name} (x${item.quantity})`).join(', '),
        }

        return {
          ...hydratedOrder,
          delivery_distance_km:
            order.delivery_distance_km ?? resolveOrderDeliveryDistanceKm(hydratedOrder),
        }
      })

      orders.value = await reconcileAutoCompletedOrders(hydratedOrders)
    } else {
      orders.value = []
    }
  } catch (error) {
    console.error('Error fetching orders:', error)
    orders.value = []
  } finally {
    loading.value = false
  }
}

// Subscribe to real-time orders
const subscribeToOrders = () => {
  if (ordersSubscription.value) {
    supabase.removeChannel(ordersSubscription.value)
  }

  ordersSubscription.value = supabase
    .channel(`rider-orders-${currentRiderNumericId.value || 'all'}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'orders',
      },
      async () => {
        currentTime.value = Date.now()
        await fetchOrders()
        if (usingOrdersEarningsFallback.value) {
          await fetchFallbackEarningsRecords()
        }
      },
    )
    .subscribe()
}

const subscribeToEarnings = () => {
  if (!currentRiderNumericId.value || usingOrdersEarningsFallback.value) return

  if (earningsSubscription.value) {
    supabase.removeChannel(earningsSubscription.value)
  }

  earningsSubscription.value = supabase
    .channel(`rider-earnings-${currentRiderNumericId.value}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'rider_earnings',
        filter: `rider_id=eq.${currentRiderNumericId.value}`,
      },
      async () => {
        await fetchEarningsRecords()
      },
    )
    .subscribe()
}

// Refresh orders
const refreshOrders = async () => {
  await Promise.all([fetchOrders(), fetchEarningsRecords()])
}

// Navigate to order details
const viewOrderDetails = (order) => {
  router.push({ name: 'rider-order-details', params: { id: order.id } })
}

const goToRiderLocation = () => {
  router.push('/RiderLocation')
}

const goToRiderEarnings = () => {
  router.push({ name: 'rider-earnings' })
}

const handleImageError = (event) => {
  const img = event.target
  img.src = 'https://via.placeholder.com/32?text=No+Image'
  img.onerror = null
}

// Get the starting index for current filter
const getOrderNumber = (index) => {
  return index + 1
}

// Lifecycle
onMounted(async () => {
  currentTime.value = Date.now()
  currentTimeInterval = setInterval(() => {
    currentTime.value = Date.now()
  }, 30000)

  await checkRiderApproval()
  if (isApproved.value && currentRiderNumericId.value) {
    await Promise.all([fetchOrders(), fetchEarningsRecords()])
    getCurrentLocation()
    startWatchingLocation()
    subscribeToOrders()
    subscribeToEarnings()
  }
})

onUnmounted(() => {
  if (ordersSubscription.value) {
    supabase.removeChannel(ordersSubscription.value)
  }
  if (earningsSubscription.value) {
    supabase.removeChannel(earningsSubscription.value)
  }
  if (currentTimeInterval) {
    clearInterval(currentTimeInterval)
    currentTimeInterval = null
  }
  stopWatchingLocation()
})
</script>

<template>
  <v-app>
    <v-main class="rider-dashboard-main">
      <!-- Header -->
      <div class="header-section">
        <div class="header-section__inner">
          <div class="header-section__lead">
            <v-btn icon variant="text" class="back-btn" @click="router.back()">
              <v-icon size="28">mdi-arrow-left</v-icon>
            </v-btn>
            <div class="header-copy">
              <h1 class="page-title">Rider Dashboard</h1>
              <p class="page-subtitle">Track nearby orders and active deliveries in one place.</p>
            </div>
          </div>

          <div class="header-actions">
            <v-btn icon variant="text" class="location-btn" @click="goToRiderLocation">
              <v-icon size="24">mdi-crosshairs-gps</v-icon>
            </v-btn>
            <v-menu>
              <template v-slot:activator="{ props }">
                <v-btn icon variant="text" v-bind="props" class="menu-btn">
                  <v-icon size="24">mdi-dots-vertical</v-icon>
                </v-btn>
              </template>
              <v-list>
                <v-list-item @click="refreshOrders">
                  <template #prepend>
                    <v-icon>mdi-refresh</v-icon>
                  </template>
                  <v-list-item-title>Refresh</v-list-item-title>
                </v-list-item>
                <v-list-item @click="goToRiderLocation">
                  <template #prepend>
                    <v-icon>mdi-crosshairs-gps</v-icon>
                  </template>
                  <v-list-item-title>My Location</v-list-item-title>
                </v-list-item>
              </v-list>
            </v-menu>
          </div>
        </div>
      </div>

      <!-- Location Status Bar -->
      <div v-if="currentLocation && currentLocation.address" class="location-status-bar">
        <v-icon size="16" color="#4caf50">mdi-map-marker</v-icon>
        <span class="location-text">{{ currentLocation.address }}</span>
        <span class="location-update-time">Live</span>
      </div>

      <!-- Stats Cards - Clickable Filters -->
      <div class="stats-container">
        <v-card
          class="stat-card"
          elevation="2"
          :class="{ 'active-filter': activeFilter === 'accepted' }"
          @click="activeFilter = 'accepted'"
        >
          <div class="stat-content">
            <v-icon size="32" color="#2196f3">mdi-check-circle</v-icon>
            <div class="stat-info">
              <div class="stat-value">{{ stats.acceptedOrders }}</div>
              <div class="stat-label">Accepted Orders</div>
            </div>
          </div>
        </v-card>

        <v-card
          class="stat-card"
          elevation="2"
          :class="{ 'active-filter': activeFilter === 'available' }"
          @click="activeFilter = 'available'"
        >
          <div class="stat-content">
            <v-icon size="32" color="#4caf50">mdi-bike-fast</v-icon>
            <div class="stat-info">
              <div class="stat-value">{{ stats.availableOrders }}</div>
              <div class="stat-label">Available Orders</div>
            </div>
          </div>
        </v-card>

        <v-card
          class="stat-card"
          elevation="2"
          :class="{ 'active-filter': activeFilter === 'pickedup' }"
          @click="activeFilter = 'pickedup'"
        >
          <div class="stat-content">
            <v-icon size="32" color="#9c27b0">mdi-truck-delivery</v-icon>
            <div class="stat-info">
              <div class="stat-value">{{ stats.pickedUpOrders }}</div>
              <div class="stat-label">Picked Up</div>
            </div>
          </div>
        </v-card>

        <v-card
          class="stat-card"
          elevation="2"
          :class="{ 'active-filter': activeFilter === 'delivered' }"
          @click="activeFilter = 'delivered'"
        >
          <div class="stat-content">
            <v-icon size="32" color="#00897b">mdi-check-decagram</v-icon>
            <div class="stat-info">
              <div class="stat-value">{{ stats.deliveredOrders }}</div>
              <div class="stat-label">Delivered</div>
            </div>
          </div>
        </v-card>

        <v-card
          class="stat-card"
          elevation="2"
          :class="{ 'active-filter': activeFilter === 'completed' }"
          @click="activeFilter = 'completed'"
        >
          <div class="stat-content">
            <v-icon size="32" color="#4caf50">mdi-history</v-icon>
            <div class="stat-info">
              <div class="stat-value">{{ stats.completedToday }}</div>
              <div class="stat-label">Completed Today</div>
            </div>
          </div>
        </v-card>

        <!-- Earnings Card -->
        <v-card
          class="stat-card stat-card--earnings stat-card--interactive"
          elevation="0"
          role="button"
          tabindex="0"
          aria-label="View rider earnings statement"
          @click="goToRiderEarnings"
          @keydown.enter.prevent="goToRiderEarnings"
          @keydown.space.prevent="goToRiderEarnings"
        >
          <div class="stat-content">
            <v-icon size="32" color="#ff9800">mdi-currency-php</v-icon>
            <div class="stat-info">
              <div class="stat-value">{{ formatPhpAmount(stats.totalEarnings) }}</div>
              <div class="stat-label">Total Earnings</div>
              <div class="stat-caption">Today {{ formatPhpAmount(stats.todayEarnings) }}</div>
            </div>
          </div>
        </v-card>
      </div>

      <!-- Active Filter Status Badge -->
      <div class="active-filter-badge mb-4 mx-4">
        <div
          class="status-badge-large"
          :class="{
            'status-accepted': activeFilter === 'accepted',
            'status-available': activeFilter === 'available',
            'status-picked': activeFilter === 'pickedup',
            'status-delivered': activeFilter === 'delivered',
            'status-completed': activeFilter === 'completed',
          }"
        >
          <v-icon left size="24" class="mr-2">
            <template v-if="activeFilter === 'accepted'">mdi-check-circle</template>
            <template v-else-if="activeFilter === 'available'">mdi-bike-fast</template>
            <template v-else-if="activeFilter === 'pickedup'">mdi-truck-delivery</template>
            <template v-else-if="activeFilter === 'delivered'">mdi-check-decagram</template>
            <template v-else>mdi-history</template>
          </v-icon>
          <span class="status-text">
            <p></p>
            <template v-if="activeFilter === 'accepted'">Accepted Orders</template>
            <template v-else-if="activeFilter === 'available'">Available Orders</template>
            <template v-else-if="activeFilter === 'pickedup'">Picked Up and Issue Orders</template>
            <template v-else-if="activeFilter === 'delivered'"
              >Delivered Awaiting Confirmation</template
            >
            <template v-else>Completed Orders</template>
          </span>
        </div>
      </div>

      <!-- Orders List based on active filter -->
      <div class="orders-section">
        <div v-if="loading" class="text-center pa-8">
          <v-progress-circular indeterminate color="#354d7c"></v-progress-circular>
          <p class="mt-4">Loading orders...</p>
        </div>

        <div v-else-if="filteredOrders.length === 0" class="empty-state">
          <v-icon size="80" color="#ccc">
            <template v-if="activeFilter === 'accepted'">mdi-check-circle-outline</template>
            <template v-else-if="activeFilter === 'available'">mdi-bike-off</template>
            <template v-else-if="activeFilter === 'pickedup'">mdi-truck-off</template>
            <template v-else-if="activeFilter === 'delivered'">mdi-package-check</template>
            <template v-else>mdi-clipboard-check-outline</template>
          </v-icon>
          <h3>No Orders</h3>
          <p>
            <template v-if="activeFilter === 'accepted'"
              >You haven't accepted any orders yet.</template
            >
            <template v-else-if="activeFilter === 'available'"
              >No available orders at the moment.</template
            >
            <template v-else-if="activeFilter === 'pickedup'"
              >Picked up orders and re-delivery issues will appear here.</template
            >
            <template v-else-if="activeFilter === 'delivered'"
              >Orders waiting for customer confirmation will appear here.</template
            >
            <template v-else>Your completed deliveries will appear here.</template>
          </p>
        </div>

        <div v-else class="orders-list">
          <!-- Click Instruction Banner -->
          <div class="instruction-banner mx-4 mb-3">
            <div class="instruction-content">
              <span class="instruction-text"
                >Tap on any order card to view full details and manage delivery status</span
              >
            </div>
          </div>
          <v-card
            v-for="(order, index) in filteredOrders"
            :key="order.id"
            class="order-card"
            :class="{
              'accepted-card': activeFilter === 'accepted',
              'picked-card': activeFilter === 'pickedup',
              'delivered-card': activeFilter === 'delivered',
              'issue-card': hasDeliveryIssue(order),
              'completed-card': activeFilter === 'completed',
            }"
            elevation="2"
            @click="viewOrderDetails(order)"
          >
            <div class="order-header">
              <div class="order-number">
                <span class="order-number-badge">#{{ getOrderNumber(index) }}</span>
                <span class="order-id"
                  >Order #{{ order.transaction_number || order.id.slice(-6) }}</span
                >
              </div>
              <div class="order-time">
                <v-icon size="16">mdi-clock-outline</v-icon>
                {{ getOrderTimeLabel(order) }} • {{ formatOrderDateTime(order) }}
              </div>
            </div>

            <div class="order-shop">
              <v-icon size="14" color="#4caf50">mdi-store</v-icon>
              <span class="shop-name">{{ order.shop_name }}</span>
            </div>

            <div v-if="hasDeliveryIssue(order)" class="order-issue-banner">
              <div class="order-state-chip issue">
                <v-icon size="14">mdi-alert-circle</v-icon>
                Re-delivery Required
              </div>
              <span
                >Customer reported this order was not received. Coordinate with the seller or
                support, then reattempt delivery.</span
              >
            </div>

            <div class="order-products">
              <div class="products-label">
                <v-icon size="14">mdi-package-variant</v-icon>
                Products:
              </div>
              <div class="products-list">
                <div v-for="item in order.items.slice(0, 3)" :key="item.id" class="product-item">
                  <div class="product-image-wrapper">
                    <v-img
                      v-if="item.image"
                      :src="item.image"
                      :alt="item.name"
                      width="32"
                      height="32"
                      class="product-img"
                      cover
                      @error="handleImageError"
                    >
                      <template #placeholder>
                        <v-icon size="20">mdi-package</v-icon>
                      </template>
                    </v-img>
                    <v-icon v-else size="20" color="grey">mdi-package</v-icon>
                  </div>
                  <div class="product-details">
                    <span class="product-name">{{ item.name }}</span>
                    <span class="product-qty">x{{ item.quantity }}</span>
                  </div>
                </div>
                <div v-if="order.items.length > 3" class="more-products">
                  +{{ order.items.length - 3 }} more
                </div>
              </div>
            </div>

            <div class="order-footer">
              <div class="order-metrics">
                <div class="order-distance" v-if="getPickupDistanceLabel(order)">
                  <v-icon size="14">mdi-crosshairs-gps</v-icon>
                  Pickup {{ getPickupDistanceLabel(order) }}
                </div>
                <div class="order-distance" v-if="getDeliveryDistanceLabel(order)">
                  <v-icon size="14">mdi-map-marker-path</v-icon>
                  Route {{ getDeliveryDistanceLabel(order) }}
                </div>
              </div>
              <div class="order-earnings" v-if="getOrderPayQuote(order)">
                <span class="order-earnings__label">
                  {{ getOrderPayQuote(order).isEstimated ? 'Est. Pay' : 'Earned' }}
                </span>
                <strong>{{ formatPhpAmount(getOrderPayQuote(order).totalPay) }}</strong>
                <span class="order-earnings__tier">{{ getOrderPayQuote(order).tierLabel }}</span>
              </div>
            </div>
          </v-card>
        </div>
      </div>
    </v-main>
  </v-app>
</template>

<style scoped>
.rider-dashboard-main {
  background: linear-gradient(135deg, #f5f7fa 0%, #ffffff 100%);
  min-height: 100dvh;
  padding-bottom: calc(80px + env(safe-area-inset-bottom, 0px));
}

.header-section {
  position: sticky;
  top: 0;
  z-index: 100;
  padding-top: env(safe-area-inset-top, 0px);
  background: rgba(11, 37, 69, 0.92);
  color: white;
  box-shadow: 0 12px 28px rgba(10, 22, 40, 0.12);
}

.header-section__inner {
  max-width: 1280px;
  margin: 0 auto;
  padding: 12px max(16px, env(safe-area-inset-left, 0px)) 12px
    max(16px, env(safe-area-inset-right, 0px));
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.header-section__lead {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 12px;
}

.header-copy {
  min-width: 0;
}

.header-actions {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-shrink: 0;
}

.back-btn,
.menu-btn,
.location-btn {
  color: white !important;
}

.page-title {
  font-size: 1.5rem;
  font-weight: 600;
  margin: 0;
}

.page-subtitle {
  margin: 4px 0 0;
  font-size: 0.84rem;
  line-height: 1.4;
  color: rgba(233, 241, 255, 0.88);
}

.location-status-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  background: #e8f5e9;
  border-bottom: 1px solid #c8e6c9;
  font-size: 0.8rem;
  color: #2e7d32;
}

.location-text {
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-weight: 500;
}

/* Stats Cards */
.stats-container {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 12px;
  padding: 16px;
}

.stat-card {
  border-radius: 16px;
  overflow: hidden;
  cursor: pointer;
  transition: all 0.3s ease;
}

.stat-card--earnings {
  background: linear-gradient(135deg, #fff8ef 0%, #ffffff 100%);
  border: 1px solid rgba(255, 152, 0, 0.14);
}

.stat-card--interactive:focus-visible,
.stat-card--interactive:hover {
  border-color: rgba(217, 119, 6, 0.35);
}

.stat-card--interactive:active {
  transform: translateY(0);
  box-shadow: 0 10px 24px rgba(217, 119, 6, 0.18);
}

.stat-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
}

.stat-card.active-filter {
  border: 2px solid #354d7c;
  background: linear-gradient(135deg, #f0f7ff 0%, #e3f2fd 100%);
}

.stat-content {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
}

.stat-value {
  font-size: 1.5rem;
  font-weight: bold;
  color: #354d7c;
  line-height: 1.2;
}

.stat-label {
  font-size: 0.75rem;
  color: #666;
}

.stat-caption {
  margin-top: 4px;
  font-size: 0.72rem;
  color: #8a5c00;
  font-weight: 600;
}

/* Orders List */
.orders-section {
  padding: 0 16px;
}

.orders-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.order-card {
  border-radius: 16px;
  overflow: hidden;
  cursor: pointer;
  transition:
    transform 0.2s,
    box-shadow 0.2s;
  position: relative;
}

.order-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
}

.accepted-card {
  border-left: 4px solid #2196f3;
}

.picked-card {
  border-left: 4px solid #9c27b0;
}

.delivered-card {
  border-left: 4px solid #00897b;
}

.issue-card {
  border-left: 4px solid #f59e0b;
  background: linear-gradient(180deg, #fffdf7 0%, #ffffff 100%);
}

.completed-card {
  border-left: 4px solid #4caf50;
}

/* Active Filter Status Badge */
.active-filter-badge {
  margin-top: 8px;
}

.status-badge-large {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px 24px;
  border-radius: 60px;
  background: white;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  font-weight: 600;
  font-size: 1.1rem;
}

.status-badge-large.status-accepted {
  background: linear-gradient(135deg, #e3f2fd 0%, #bbdefb 100%);
  color: #1976d2;
  border: 1px solid #90caf9;
}

.status-badge-large.status-available {
  background: linear-gradient(135deg, #e8f5e9 0%, #c8e6c9 100%);
  color: #388e3c;
  border: 1px solid #a5d6a7;
}

.status-badge-large.status-picked {
  background: linear-gradient(135deg, #f3e5f5 0%, #e1bee7 100%);
  color: #7b1fa2;
  border: 1px solid #ce93d8;
}

.status-badge-large.status-delivered {
  background: linear-gradient(135deg, #e0f7f4 0%, #b2dfdb 100%);
  color: #00796b;
  border: 1px solid #80cbc4;
}

.status-badge-large.status-completed {
  background: linear-gradient(135deg, #e8f5e9 0%, #c8e6c9 100%);
  color: #2e7d32;
  border: 1px solid #a5d6a7;
}

.status-text {
  font-weight: 700;
}

.order-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 16px 8px 16px;
}

.order-id {
  font-weight: 600;
  color: #354d7c;
  font-size: 0.9rem;
}

.order-time {
  font-size: 0.75rem;
  color: #666;
  display: flex;
  align-items: center;
  gap: 4px;
}

.order-state-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  width: fit-content;
  padding: 6px 10px;
  border-radius: 999px;
  font-size: 0.72rem;
  font-weight: 700;
  line-height: 1;
}

.order-state-chip.issue {
  background: #fff4e5;
  border: 1px solid #f59e0b;
  color: #b45309;
}

.order-shop {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 16px;
  background: #f0f7ff;
  margin: 4px 16px;
  border-radius: 8px;
}

.shop-name {
  font-size: 0.8rem;
  font-weight: 500;
  color: #354d7c;
}

.order-issue-banner {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
  margin: 4px 16px 0;
  padding: 12px;
  border-radius: 12px;
  background: #fff8eb;
  border: 1px solid rgba(245, 158, 11, 0.25);
  color: #9a6700;
  font-size: 0.78rem;
  line-height: 1.45;
}

.order-products {
  padding: 8px 16px;
  background: #f8fafc;
  margin: 8px 16px;
  border-radius: 8px;
}

.products-label {
  font-size: 0.7rem;
  color: #666;
  margin-bottom: 6px;
  display: flex;
  align-items: center;
  gap: 4px;
}

.products-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.product-item {
  display: flex;
  align-items: center;
  gap: 10px;
  background: white;
  padding: 6px 12px;
  border-radius: 12px;
  font-size: 0.75rem;
  border: 1px solid #e0e0e0;
  flex: 1;
  min-width: 140px;
}

.product-image-wrapper {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  overflow: hidden;
  background: #f5f5f5;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  cursor: pointer;
  transition: transform 0.2s ease;
}

.product-image-wrapper:hover {
  transform: scale(1.1);
}

.product-img {
  border-radius: 8px;
  object-fit: cover;
}

.product-details {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.product-name {
  font-weight: 500;
  color: #333;
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}

.product-qty {
  color: #666;
  font-size: 0.7rem;
  font-weight: 500;
  background: #f0f0f0;
  padding: 2px 6px;
  border-radius: 12px;
}

.more-products {
  font-size: 0.7rem;
  color: #999;
  padding: 4px 8px;
  background: #f5f5f5;
  border-radius: 16px;
}

.order-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 16px;
  background: #f8fafc;
  border-top: 1px solid #eee;
}

.order-metrics {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 12px;
}

.order-amount {
  font-weight: bold;
  color: #354d7c;
  font-size: 1rem;
  display: flex;
  align-items: center;
  gap: 2px;
}

.order-distance {
  font-size: 0.75rem;
  color: #666;
  display: flex;
  align-items: center;
  gap: 4px;
}

.order-earnings {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
  color: #2e7d32;
  font-size: 0.75rem;
}

.order-earnings__label {
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: #5276b0;
}

.order-earnings strong {
  font-size: 0.98rem;
  line-height: 1.1;
}

.order-earnings__tier {
  color: #5f6f82;
  font-weight: 600;
}

.empty-state {
  text-align: center;
  padding: 60px 20px;
}

.empty-state h3 {
  margin-top: 16px;
  color: #666;
}

.empty-state p {
  color: #999;
  margin-top: 8px;
}

/* Order Number Styling */
.order-number {
  display: flex;
  align-items: center;
  gap: 10px;
}

.order-number-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 32px;
  height: 32px;
  background: linear-gradient(135deg, #354d7c 0%, #5276b0 100%);
  color: white;
  font-weight: 700;
  font-size: 0.85rem;
  border-radius: 12px;
  padding: 0 10px;
  box-shadow: 0 2px 6px rgba(53, 77, 124, 0.3);
}

.order-id {
  font-weight: 600;
  color: #354d7c;
  font-size: 0.85rem;
}

/* Optional: Add different colors for different filter types */
.accepted-card .order-number-badge {
  background: linear-gradient(135deg, #1976d2 0%, #42a5f5 100%);
}

.picked-card .order-number-badge {
  background: linear-gradient(135deg, #7b1fa2 0%, #ab47bc 100%);
}

.issue-card .order-number-badge {
  background: linear-gradient(135deg, #d97706 0%, #f59e0b 100%);
}

.delivered-card .order-number-badge {
  background: linear-gradient(135deg, #00796b 0%, #26a69a 100%);
}

.completed-card .order-number-badge {
  background: linear-gradient(135deg, #388e3c 0%, #66bb6a 100%);
}

.order-card:not(.accepted-card):not(.picked-card):not(.delivered-card):not(.completed-card):not(
    .issue-card
  )
  .order-number-badge {
  background: linear-gradient(135deg, #055e1d 0%, #229b42 100%);
}

/* Instruction Banner */
.instruction-banner {
  animation: fadeInUp 0.4s ease-out;
}

.instruction-content {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-wrap: wrap;
  gap: 8px;
  padding: 10px 16px;
  background: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%);
  border-radius: 60px;
  border: 1px solid rgba(53, 77, 124, 0.15);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
}

.instruction-text {
  font-size: 0.8rem;
  font-weight: 500;
  color: #354d7c;
  letter-spacing: -0.2px;
}

/* Responsive */
@media (max-width: 600px) {
  .instruction-content {
    padding: 8px 12px;
    flex-wrap: wrap;
    text-align: center;
  }

  .instruction-text {
    font-size: 0.7rem;
  }
}

@media (max-width: 600px) {
  .header-section__inner {
    padding: 10px max(12px, env(safe-area-inset-left, 0px)) 10px
      max(12px, env(safe-area-inset-right, 0px));
    align-items: flex-start;
  }

  .header-section__lead {
    align-items: flex-start;
  }

  .stats-container {
    grid-template-columns: repeat(2, 1fr);
    gap: 8px;
  }

  .stat-value {
    font-size: 1.2rem;
  }

  .page-title {
    font-size: 1.2rem;
  }

  .page-subtitle {
    font-size: 0.74rem;
  }

  .product-item {
    min-width: 120px;
    padding: 4px 8px;
  }

  .product-name {
    max-width: 80px;
    font-size: 0.7rem;
  }

  .product-image-wrapper {
    width: 28px;
    height: 28px;
  }

  .order-shop,
  .order-products {
    margin: 4px 12px;
    padding: 6px 12px;
  }

  .order-footer {
    flex-direction: column;
    align-items: flex-start;
  }

  .order-earnings {
    align-items: flex-start;
  }
}

@media (max-width: 420px) {
  .header-actions {
    gap: 6px;
  }

  .page-subtitle {
    display: none;
  }
}
</style>
