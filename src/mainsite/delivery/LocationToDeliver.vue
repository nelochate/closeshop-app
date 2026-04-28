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
              <p class="location-header__eyebrow">Rider navigation</p>
              <h1>Delivery Route Map</h1>
              <p class="location-header__subtext">
                Keep the pickup point, your current position, and the customer address in one view.
              </p>
            </div>
          </div>

          <v-btn
            variant="flat"
            color="white"
            class="refresh-btn"
            :loading="refreshing"
            @click="refreshAllData"
          >
            <v-icon start size="16">mdi-refresh</v-icon>
            Refresh
          </v-btn>
        </div>
      </header>

      <div v-if="loading" class="state-container">
        <v-progress-circular indeterminate color="#2f7de1" size="56" />
        <p>Loading route details...</p>
      </div>

      <div v-else-if="errorMessage" class="state-container">
        <v-icon size="64" color="error">mdi-alert-circle-outline</v-icon>
        <p>{{ errorMessage }}</p>
        <v-btn color="primary" @click="refreshAllData">Try Again</v-btn>
      </div>

      <div v-else class="location-shell">
        <OrderTrackingMap
          :order-id="String(orderId)"
          :pickup-location="pickupTrackingLocation"
          :delivery-location="deliveryTrackingLocation"
          :rider-location="persistedRiderTrackingLocation"
          viewer-mode="rider"
          :track-own-location="shouldTrackOwnLocation"
          :fullscreen="true"
          title="Live delivery route"
          subtitle="The rider marker uses a standard pin here, while pickup and customer locations stay distinct for faster navigation."
        />

        <div class="detail-grid">
          <v-card class="detail-card" rounded="xl">
            <v-card-title class="detail-card__title">
              <v-icon start>mdi-receipt-text-outline</v-icon>
              Order snapshot
            </v-card-title>
            <v-card-text>
              <div class="detail-row">
                <span>Order</span>
                <strong>{{ orderData?.transaction_number || orderData?.id?.slice(0, 8) }}</strong>
              </div>
              <div class="detail-row">
                <span>Status</span>
                <strong>{{ statusText }}</strong>
              </div>
              <div class="detail-row">
                <span>Shop</span>
                <strong>{{ orderData?.shop?.business_name || 'Unavailable' }}</strong>
              </div>
              <div class="detail-row">
                <span>Customer</span>
                <strong>{{ orderData?.address?.recipient_name || 'Unavailable' }}</strong>
              </div>
            </v-card-text>
          </v-card>

          <v-card class="detail-card" rounded="xl">
            <v-card-title class="detail-card__title">
              <v-icon start>mdi-map-marker-multiple-outline</v-icon>
              Route notes
            </v-card-title>
            <v-card-text>
              <div class="route-note">
                <span class="route-note__label">Pickup</span>
                <strong>{{ pickupTrackingLocation?.name || 'Pickup point' }}</strong>
                <p>{{ pickupTrackingLocation?.address || 'Pickup address unavailable' }}</p>
              </div>
              <div class="route-note">
                <span class="route-note__label">Delivery</span>
                <strong>{{ deliveryTrackingLocation?.name || 'Customer location' }}</strong>
                <p>{{ deliveryTrackingLocation?.address || 'Customer address unavailable' }}</p>
              </div>
            </v-card-text>
          </v-card>
        </div>
      </div>
    </v-main>
  </v-app>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
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

const statusMap = {
  pending_approval: 'Pending approval',
  waiting_for_rider: 'Waiting for rider',
  accepted_by_rider: 'Accepted by rider',
  picked_up: 'Picked up',
  delivered: 'Delivered',
  completed: 'Completed',
  cancelled: 'Cancelled',
}

const statusText = computed(() => statusMap[orderData.value?.status] || orderData.value?.status || 'Unknown')

const shouldTrackOwnLocation = computed(() => {
  return (
    !!currentRiderNumericId.value &&
    orderData.value?.rider_id === currentRiderNumericId.value &&
    ['accepted_by_rider', 'picked_up'].includes(orderData.value?.status)
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
    name: address.recipient_name || 'Customer',
    address: buildDeliveryAddress(address),
    lat: address.latitude,
    lng: address.longitude,
    fallbackQuery: deliveryQuery || undefined,
  })
}

const fetchOrderDetails = async () => {
  loading.value = true
  errorMessage.value = ''

  try {
    const { data, error } = await supabase
      .from('orders')
      .select(`
        *,
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
        address:address_id (
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
      `)
      .eq('id', orderId)
      .single()

    if (error) throw error

    orderData.value = data
    await loadTrackingLocations(data)
  } catch (error) {
    console.error('Unable to load order route details:', error)
    errorMessage.value = error.message || 'Failed to load route details.'
  } finally {
    loading.value = false
  }
}

const refreshAllData = async () => {
  refreshing.value = true

  try {
    await Promise.all([fetchCurrentRider(), fetchOrderDetails()])
  } finally {
    refreshing.value = false
  }
}

onMounted(async () => {
  await refreshAllData()
})
</script>

<style scoped>
.location-page {
  min-height: 100dvh;
  background:
    radial-gradient(circle at top left, rgba(47, 125, 225, 0.12), transparent 28%),
    linear-gradient(180deg, #edf4ff 0%, #f7f9fc 28%, #f4f6fb 100%);
}

.location-header {
  position: sticky;
  top: 0;
  z-index: 20;
  padding-top: env(safe-area-inset-top, 0px);
  background: rgba(11, 37, 69, 0.92);
  backdrop-filter: blur(16px);
  box-shadow: 0 12px 28px rgba(10, 22, 40, 0.12);
}

.location-header__inner {
  max-width: 1280px;
  margin: 0 auto;
  padding: 14px 18px 16px;
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

.refresh-btn {
  color: #102a43 !important;
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

.location-shell {
  max-width: 1280px;
  margin: 0 auto;
  padding: 20px 18px calc(28px + env(safe-area-inset-bottom, 0px));
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.detail-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}

.detail-card {
  border: 1px solid rgba(53, 77, 124, 0.08);
  box-shadow: 0 18px 42px rgba(18, 48, 79, 0.08);
}

.detail-card__title {
  padding: 18px 18px 0;
  color: #12304f;
  font-size: 1rem;
  font-weight: 700;
}

.detail-row {
  display: flex;
  justify-content: space-between;
  gap: 14px;
  padding: 0 0 12px;
  border-bottom: 1px solid rgba(18, 48, 79, 0.06);
  color: #12304f;
}

.detail-row:last-child {
  border-bottom: 0;
  padding-bottom: 0;
}

.detail-row span {
  color: #627d98;
  font-weight: 600;
}

.route-note + .route-note {
  margin-top: 16px;
}

.route-note__label {
  display: block;
  margin-bottom: 6px;
  font-size: 0.74rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #5276b0;
}

.route-note strong {
  display: block;
  color: #12304f;
}

.route-note p {
  margin: 8px 0 0;
  line-height: 1.5;
  color: #52667d;
}

@media (max-width: 840px) {
  .location-header__inner {
    align-items: flex-start;
    flex-direction: column;
  }

  .detail-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 600px) {
  .location-header__inner {
    padding: 12px 14px 14px;
  }

  .location-header h1 {
    font-size: 1.16rem;
  }

  .location-header__subtext {
    font-size: 0.8rem;
  }

  .location-shell {
    padding: 14px 12px calc(24px + env(safe-area-inset-bottom, 0px));
  }

  .detail-row {
    flex-direction: column;
    gap: 4px;
  }
}
</style>
