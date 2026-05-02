<template>
  <v-app>
    <v-main class="location-page">
      <header class="location-header">
        <div class="location-header__inner">
          <div class="location-header__lead">
            <v-btn icon variant="text" class="header-icon-btn" @click="goBack">
              <v-icon>mdi-arrow-left</v-icon>
            </v-btn>

            <div>
              <p class="location-header__eyebrow">
                {{ fullScreenViewerMode === 'rider' ? 'Rider navigation' : 'Order tracking' }}
              </p>
              <h1>Full-Screen Delivery Map</h1>
              <p class="location-header__subtext">{{ headerSummary }}</p>
            </div>
          </div>

          <div class="location-header__actions">
            <v-btn
              variant="tonal"
              color="white"
              class="details-btn"
              @click="showMapDetails = !showMapDetails"
            >
              <v-icon start size="16">
                {{ showMapDetails ? 'mdi-eye-off-outline' : 'mdi-eye-outline' }}
              </v-icon>
              {{ showMapDetails ? 'Hide details' : 'Show details' }}
            </v-btn>

            <v-btn
              variant="flat"
              color="white"
              class="refresh-btn"
              :loading="refreshing"
              @click="refreshAllData({ showRefreshing: true })"
            >
              <v-icon start size="16">mdi-refresh</v-icon>
              Refresh
            </v-btn>
          </div>
        </div>
      </header>

      <div v-if="loading" class="state-container">
        <v-progress-circular indeterminate color="#2f7de1" size="56" />
        <p>Loading route details...</p>
      </div>

      <div v-else-if="errorMessage" class="state-container">
        <v-icon size="64" color="error">mdi-alert-circle-outline</v-icon>
        <p>{{ errorMessage }}</p>
        <v-btn color="primary" @click="refreshAllData({ showLoader: true })">Try Again</v-btn>
      </div>

      <div v-else class="location-shell">
        <OrderTrackingMap
          class="location-map"
          :order-id="String(orderId)"
          :pickup-location="pickupTrackingLocation"
          :delivery-location="deliveryTrackingLocation"
          :rider-location="persistedRiderTrackingLocation"
          :viewer-mode="fullScreenViewerMode"
          :track-own-location="shouldTrackOwnLocation"
          :fullscreen="true"
          :panel-collapsed="!showMapDetails"
          :title="trackingTitle"
          :subtitle="trackingSubtitle"
        />
      </div>
    </v-main>
  </v-app>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { supabase } from '@/utils/supabase'
import OrderTrackingMap from '@/components/OrderTrackingMap.vue'
import {
  buildDeliveryAddress,
  buildShopAddress,
  extractPersistedRiderCoordinates,
  resolveTrackingLocation,
} from '@/utils/orderTracking'

const route = useRoute()
const router = useRouter()
const orderId = route.params.orderId

const loading = ref(true)
const refreshing = ref(false)
const errorMessage = ref('')
const orderData = ref(null)
const currentRiderNumericId = ref(null)
const pickupTrackingLocation = ref(null)
const deliveryTrackingLocation = ref(null)
const showMapDetails = ref(typeof window === 'undefined' ? true : window.innerWidth > 1080)

let orderSubscription = null

const statusMap = {
  pending_approval: 'Pending approval',
  waiting_for_rider: 'Waiting for rider',
  accepted_by_rider: 'Accepted by rider',
  picked_up: 'Picked up',
  delivered: 'Delivered',
  completed: 'Completed',
  cancelled: 'Cancelled',
}

const statusText = computed(
  () => statusMap[orderData.value?.status] || orderData.value?.status || 'Unknown',
)

const customerDisplayName = computed(() =>
  getCustomerDisplayName({
    address: orderData.value?.address,
    user: orderData.value?.user,
  }),
)

const orderReference = computed(
  () => orderData.value?.transaction_number || orderData.value?.id?.slice(0, 8) || 'Pending',
)

const headerSummary = computed(() => {
  if (!orderData.value) {
    return 'Keep pickup, delivery, and the live rider location in one focused full-screen view.'
  }

  return [
    `Order ${orderReference.value}`,
    statusText.value,
    orderData.value?.shop?.business_name || 'Shop unavailable',
    customerDisplayName.value,
  ]
    .filter(Boolean)
    .join(' • ')
})

const trackingTitle = computed(() => {
  if (orderData.value?.status === 'picked_up') return 'Delivering to customer'
  if (orderData.value?.status === 'accepted_by_rider') return 'Heading to pickup'
  if (orderData.value?.status === 'waiting_for_rider') return 'Ready for rider pickup'
  return 'Live delivery route'
})

const trackingSubtitle = computed(() => {
  if (showMapDetails.value) {
    return 'The live rider position, the pickup point, and the delivery address update automatically in one place.'
  }

  return 'Map-only mode keeps the route clear while live rider, pickup, and delivery markers continue updating.'
})

const fullScreenViewerMode = computed(() => {
  if (currentRiderNumericId.value && orderData.value?.rider_id === currentRiderNumericId.value) {
    return 'rider'
  }

  return 'customer'
})

const shouldTrackOwnLocation = computed(() => {
  return (
    !!currentRiderNumericId.value &&
    !['delivered', 'completed', 'cancelled'].includes(orderData.value?.status)
  )
})

const persistedRiderTrackingLocation = computed(() => {
  const persisted = extractPersistedRiderCoordinates(orderData.value)

  if (!persisted) return null

  return {
    ...persisted,
    name: 'Assigned rider',
    address: `${persisted.lat.toFixed(5)}, ${persisted.lng.toFixed(5)}`,
  }
})

const goBack = () => {
  router.back()
}

const getProfileDisplayName = (profile = {}) => {
  return [profile?.first_name, profile?.last_name]
    .filter((value) => typeof value === 'string' && value.trim())
    .join(' ')
    .trim()
}

const getCustomerDisplayName = ({ address = {}, user = {} } = {}) => {
  return address?.recipient_name?.trim() || getProfileDisplayName(user) || 'Recipient unavailable'
}

const fetchCurrentRider = async () => {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) return

    const { data, error } = await supabase
      .from('Rider_Registration')
      .select('rider_id')
      .eq('profile_id', user.id)
      .maybeSingle()

    if (error) throw error

    currentRiderNumericId.value = data?.rider_id ?? null
  } catch (error) {
    console.error('Unable to load current rider profile:', error)
    currentRiderNumericId.value = null
  }
}

const loadTrackingLocations = async (data) => {
  const shop = data?.shop || {}
  const address = data?.address || {}
  const customerName = getCustomerDisplayName({
    address,
    user: data?.user,
  })

  const pickupQuery = [
    shop.house_no,
    shop.building,
    shop.street,
    shop.barangay,
    shop.city,
    shop.province,
  ]
    .filter(Boolean)
    .join(', ')

  const deliveryQuery = [
    address.house_no,
    address.building,
    address.street,
    address.purok,
    address.barangay_name,
    address.city_name,
    address.province_name,
  ]
    .filter(Boolean)
    .join(', ')

  pickupTrackingLocation.value = await resolveTrackingLocation({
    name: shop.business_name || 'Pickup point',
    address: buildShopAddress(shop),
    lat: shop.latitude,
    lng: shop.longitude,
    fallbackQuery: pickupQuery || undefined,
  })

  deliveryTrackingLocation.value = await resolveTrackingLocation({
    name: customerName,
    address: buildDeliveryAddress(address),
    lat: address.latitude,
    lng: address.longitude,
    fallbackQuery: deliveryQuery || undefined,
  })
}

const fetchOrderDetails = async ({ silent = false } = {}) => {
  try {
    if (!silent) {
      errorMessage.value = ''
    }

    const { data, error } = await supabase
      .from('orders')
      .select(
        `
        *,
        user:profiles!orders_user_id_fkey (
          id,
          first_name,
          last_name
        ),
        shop:shop_id (
          id,
          business_name,
          house_no,
          building,
          street,
          barangay,
          city,
          province,
          latitude,
          longitude
        ),
        address:addresses!orders_address_id_fkey (
          id,
          recipient_name,
          phone,
          purok,
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
      .eq('id', orderId)
      .single()

    if (error) throw error

    orderData.value = data
    await loadTrackingLocations(data)
  } catch (error) {
    console.error('Unable to load order route details:', error)

    if (!silent) {
      errorMessage.value = error.message || 'Failed to load route details.'
    }
  }
}

const subscribeToOrderUpdates = () => {
  if (!orderId) return

  if (orderSubscription) {
    supabase.removeChannel(orderSubscription)
  }

  orderSubscription = supabase
    .channel(`location-to-deliver-${orderId}`)
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'orders',
        filter: `id=eq.${orderId}`,
      },
      async () => {
        await fetchOrderDetails({ silent: true })
      },
    )
    .subscribe()
}

const refreshAllData = async ({ showLoader = false, showRefreshing = false } = {}) => {
  if (showLoader) {
    loading.value = true
    errorMessage.value = ''
  }

  if (showRefreshing) {
    refreshing.value = true
  }

  try {
    await Promise.all([
      fetchCurrentRider(),
      fetchOrderDetails({ silent: !showLoader && !showRefreshing }),
    ])
  } finally {
    if (showLoader) {
      loading.value = false
    }

    if (showRefreshing) {
      refreshing.value = false
    }
  }
}

onMounted(async () => {
  await refreshAllData({ showLoader: true })
  subscribeToOrderUpdates()
})

onUnmounted(() => {
  if (orderSubscription) {
    supabase.removeChannel(orderSubscription)
    orderSubscription = null
  }
})
</script>

<style scoped>
.location-page {
  height: 100dvh;
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background:
    radial-gradient(circle at top left, rgba(47, 125, 225, 0.12), transparent 28%),
    linear-gradient(180deg, #edf4ff 0%, #f7f9fc 28%, #f4f6fb 100%);
}

.location-header {
  position: sticky;
  top: 0;
  z-index: 20;
  flex-shrink: 0;
  padding-top: env(safe-area-inset-top, 0px);
  background: rgba(11, 37, 69, 0.92);
  backdrop-filter: blur(16px);
  box-shadow: 0 12px 28px rgba(10, 22, 40, 0.12);
}

.location-header__inner {
  width: 100%;
  padding: 14px max(18px, env(safe-area-inset-left, 0px)) 16px
    max(18px, env(safe-area-inset-right, 0px));
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.location-header__lead {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 14px;
}

.location-header__actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.header-icon-btn {
  color: white !important;
  background: rgba(255, 255, 255, 0.1) !important;
}

.location-header__eyebrow {
  margin: 0 0 4px;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: rgba(194, 220, 255, 0.88);
}

.location-header h1 {
  margin: 0;
  font-size: 1.32rem;
  line-height: 1.2;
  color: white;
}

.location-header__subtext {
  margin: 4px 0 0;
  color: rgba(226, 236, 255, 0.82);
  font-size: 0.88rem;
}

.details-btn {
  color: white !important;
  font-weight: 700;
  background: rgba(255, 255, 255, 0.12) !important;
}

.refresh-btn {
  color: #102a43 !important;
  font-weight: 700;
}

.state-container {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  text-align: center;
  padding: 32px 20px calc(32px + env(safe-area-inset-bottom, 0px));
  color: #12304f;
}

.location-shell {
  flex: 1;
  min-height: 0;
  display: flex;
}

.location-map {
  flex: 1;
  min-height: 0;
}

@media (max-width: 840px) {
  .location-header__inner {
    align-items: flex-start;
    flex-direction: column;
  }

  .location-header__actions {
    width: 100%;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 600px) {
  .location-header__inner {
    padding: 12px max(14px, env(safe-area-inset-left, 0px)) 14px
      max(14px, env(safe-area-inset-right, 0px));
  }

  .location-header h1 {
    font-size: 1.16rem;
  }

  .location-header__subtext {
    font-size: 0.8rem;
  }

  .location-header__actions {
    grid-template-columns: 1fr;
  }
}
</style>
