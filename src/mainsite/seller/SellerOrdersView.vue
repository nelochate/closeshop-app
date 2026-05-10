<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { supabase } from '@/utils/supabase'
import { createNotificationRecordIfEnabled } from '@/utils/notificationPreferences'
import { isOrderCancellationRequestedStatus } from '@/utils/orderStatus'
import {
  fetchSellerOrders,
  fetchSellerShopByOwner,
  type SellerDashboardOrder,
} from '@/services/sellerDashboard'
import { filterSellerOrders, getSellerOrderCounts } from './sellerOrderState'
import {
  buildSellerOrdersRoute,
  normalizeSellerOrdersRouteFilter,
  type SellerOrdersRouteFilter,
} from './sellerNavigation'
import PullToRefreshWrapper from '@/components/PullToRefreshWrapper.vue'
import SellerOrderListItem from './components/SellerOrderListItem.vue'

const router = useRouter()
const route = useRoute()

const shopId = ref<string | null>(null)
const shopOwnerUserId = ref<string | null>(null)
const orders = ref<SellerDashboardOrder[]>([])
const loadingOrders = ref(false)
const ordersError = ref('')
const isMobile = ref(window.innerWidth < 768)
const currentTime = ref(Date.now())
const loadingSkeletons = [1, 2, 3, 4]

let currentTimeInterval: ReturnType<typeof setInterval> | null = null
let ordersSubscription: ReturnType<typeof supabase.channel> | null = null

const activeFilter = computed<SellerOrdersRouteFilter>(() =>
  normalizeSellerOrdersRouteFilter(route.query.status),
)

const updateMobileState = () => {
  isMobile.value = window.innerWidth < 768
}

const orderCounts = computed(() => getSellerOrderCounts(orders.value))

const filteredOrders = computed(() => filterSellerOrders(orders.value, activeFilter.value))

const drilldownFilters = computed(() => [
  { label: 'All', value: 'all' as SellerOrdersRouteFilter },
  { label: 'Pending', value: 'pending' as SellerOrdersRouteFilter },
  { label: 'Processing', value: 'processing' as SellerOrdersRouteFilter },
  { label: 'Cancel Requests', value: 'cancel-requests' as SellerOrdersRouteFilter },
  { label: 'Waiting for Rider', value: 'waiting' as SellerOrdersRouteFilter },
  { label: 'Active Deliveries', value: 'shipped' as SellerOrdersRouteFilter },
  { label: 'Completed', value: 'completed' as SellerOrdersRouteFilter },
  { label: 'Cancelled', value: 'cancelled' as SellerOrdersRouteFilter },
])

const activeFilterLabel = computed(
  () => drilldownFilters.value.find((filter) => filter.value === activeFilter.value)?.label || 'Orders',
)

const activeFilterEmptyMessage = computed(() => {
  switch (activeFilter.value) {
    case 'pending':
      return 'New customer orders waiting for your approval will appear here.'
    case 'processing':
      return 'Orders that are waiting for rider assignment or cancellation review will appear here.'
    case 'cancel-requests':
      return 'Customer cancellation requests will show here when they need your response.'
    case 'waiting':
      return 'Approved orders waiting to be picked up by a rider will appear here.'
    case 'shipped':
      return 'Orders accepted or picked up by riders will appear here.'
    case 'completed':
      return 'Delivered and completed orders will be listed here for reference.'
    case 'cancelled':
      return 'Cancelled orders will remain here for record-keeping.'
    default:
      return 'Orders will appear here once customers start purchasing from your shop.'
  }
})

const ensureSellerCancellationNotifications = async (ordersToCheck: SellerDashboardOrder[] = []) => {
  if (!shopOwnerUserId.value) return

  const cancellationOrders = ordersToCheck.filter((order) =>
    isOrderCancellationRequestedStatus(order.status),
  )

  if (cancellationOrders.length === 0) return

  await Promise.all(
    cancellationOrders.map(async (order) => {
      const { data: existingNotification, error: lookupError } = await supabase
        .from('notifications')
        .select('id')
        .eq('user_id', shopOwnerUserId.value)
        .eq('type', 'shipping_update')
        .eq('related_id', order.id)
        .eq('related_type', 'order')
        .eq('title', 'Cancellation Requested')
        .limit(1)
        .maybeSingle()

      if (lookupError || existingNotification?.id) return

      const orderLabel = order.transaction_number ? `order ${order.transaction_number}` : 'the order'
      const customerLabel = order.customer_name ? ` for ${order.customer_name}` : ''

      await createNotificationRecordIfEnabled({
        userId: shopOwnerUserId.value,
        type: 'shipping_update',
        title: 'Cancellation Requested',
        message: `Customer requested cancellation approval for ${orderLabel}${customerLabel}.`,
        relatedId: order.id,
        relatedType: 'order',
        isRead: false,
        createdAt: order.updated_at || new Date().toISOString(),
      })
    }),
  )
}

const fetchOrders = async () => {
  if (!shopId.value) {
    orders.value = []
    return
  }

  loadingOrders.value = true
  ordersError.value = ''
  currentTime.value = Date.now()

  try {
    const nextOrders = await fetchSellerOrders(shopId.value)
    orders.value = nextOrders
    await ensureSellerCancellationNotifications(nextOrders)
  } catch (error) {
    console.error('Error loading seller orders:', error)
    ordersError.value = 'Unable to load seller orders right now.'
    orders.value = []
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
    .channel(`seller-orders-${targetShopId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'orders',
        filter: `shop_id=eq.${targetShopId}`,
      },
      async () => {
        await fetchOrders()
      },
    )
    .subscribe()
}

const loadOrdersPage = async () => {
  loadingOrders.value = true
  ordersError.value = ''

  try {
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      router.replace('/')
      return
    }

    const shop = await fetchSellerShopByOwner(user.id)
    shopOwnerUserId.value = user.id
    shopId.value = shop?.id || null

    subscribeToOrders(shop?.id || null)

    if (!shop?.id) {
      orders.value = []
      loadingOrders.value = false
      return
    }

    await fetchOrders()
  } catch (error) {
    console.error('Failed to initialize seller orders page:', error)
    ordersError.value = 'Unable to load your seller orders.'
    loadingOrders.value = false
  }
}

const viewOrderDetails = (orderId: string) => {
  router.push({ name: 'order-details', params: { id: orderId } })
}

const handleOrdersRefresh = async () => {
  if (shopId.value) {
    await fetchOrders()
    return
  }

  await loadOrdersPage()
}

watch(
  () => route.query.status,
  (status) => {
    const normalizedStatus = normalizeSellerOrdersRouteFilter(status)
    if ((typeof status === 'string' && normalizedStatus === status) || (!status && normalizedStatus === 'all')) {
      return
    }

    router.replace(buildSellerOrdersRoute(normalizedStatus))
  },
  { immediate: true },
)

onMounted(async () => {
  window.addEventListener('resize', updateMobileState)
  currentTimeInterval = setInterval(() => {
    currentTime.value = Date.now()
  }, 30000)
  await loadOrdersPage()
})

onUnmounted(() => {
  stopOrdersSubscription()
  if (currentTimeInterval) {
    clearInterval(currentTimeInterval)
    currentTimeInterval = null
  }
  window.removeEventListener('resize', updateMobileState)
})
</script>

<template>
  <v-app>
    <PullToRefreshWrapper :on-refresh="handleOrdersRefresh">
      <v-app-bar class="seller-orders-bar" flat color="#3f83c7" dark density="comfortable">
        <v-btn icon size="small" class="mr-1" @click="router.back()">
          <v-icon>mdi-arrow-left</v-icon>
        </v-btn>
        <v-toolbar-title class="text-subtitle-1 font-weight-bold">Shop Orders</v-toolbar-title>
      </v-app-bar>

      <v-main class="seller-orders-main pt-9">
        <v-container :class="isMobile ? 'px-3 py-4' : 'pa-6'" fluid>
          <template v-if="loadingOrders && !orders.length">
            <div class="orders-loading-grid">
              <v-card
                v-for="skeleton in loadingSkeletons"
                :key="skeleton"
                rounded="xl"
                variant="flat"
                class="orders-skeleton-card"
              >
                <v-card-text class="pa-4 pa-sm-5">
                  <div class="orders-skeleton-top">
                    <span class="orders-skeleton-block orders-skeleton-block--title"></span>
                    <span class="orders-skeleton-block orders-skeleton-block--status"></span>
                  </div>
                  <div class="orders-skeleton-metrics">
                    <span class="orders-skeleton-block orders-skeleton-block--metric orders-skeleton-block--metric-wide"></span>
                    <span class="orders-skeleton-block orders-skeleton-block--metric"></span>
                    <span class="orders-skeleton-block orders-skeleton-block--metric"></span>
                  </div>
                  <div class="orders-skeleton-actions">
                    <span class="orders-skeleton-block orders-skeleton-block--button"></span>
                  </div>
                </v-card-text>
              </v-card>
            </div>
          </template>

          <template v-else>
            <v-alert v-if="ordersError" type="error" rounded="lg" class="mb-4 pt-8">
              {{ ordersError }}
            </v-alert>

            <div class="orders-filter-chip-row">
              <v-chip
                v-for="filter in drilldownFilters"
                :key="filter.value"
                :color="activeFilter === filter.value ? 'primary' : undefined"
                :variant="activeFilter === filter.value ? 'flat' : 'outlined'"
                size="small"
                class="orders-filter-chip"
                @click="router.push(buildSellerOrdersRoute(filter.value))"
              >
                {{ filter.label }}
              </v-chip>
            </div>

            <div v-if="activeFilter === 'processing'" class="orders-processing-note">
              Includes {{ orderCounts.waiting }} waiting-for-rider orders and {{ orderCounts.cancelRequests }}
              cancellation request{{ orderCounts.cancelRequests === 1 ? '' : 's' }}.
            </div>

            <div v-if="filteredOrders.length === 0" class="orders-empty-card">
              <v-icon size="40" color="primary">mdi-package-variant-closed</v-icon>
              <p class="orders-empty-title">No {{ activeFilterLabel.toLowerCase() }} yet</p>
              <p class="orders-empty-copy">{{ activeFilterEmptyMessage }}</p>
            </div>

            <template v-else>
              <div class="orders-list-header">
                <div>
                  <p class="orders-list-eyebrow">{{ activeFilterLabel }}</p>
                  <h2 class="orders-list-title">
                    {{ filteredOrders.length }} {{ filteredOrders.length === 1 ? 'order' : 'orders' }}
                  </h2>
                </div>
                <p class="orders-list-copy">
                  Open any order to review the full details and take seller actions there.
                </p>
              </div>

              <div class="orders-list">
                <SellerOrderListItem
                  v-for="(order, index) in filteredOrders"
                  :key="order.id"
                  :order="order"
                  :order-index="index"
                  :now-timestamp="currentTime"
                  @open-full="viewOrderDetails"
                />
              </div>
            </template>
          </template>
        </v-container>
      </v-main>
    </PullToRefreshWrapper>
  </v-app>
</template>

<style scoped>
.seller-orders-bar {
  padding-top: var(--app-safe-area-top, env(safe-area-inset-top, 0px));
  background: linear-gradient(135deg, #3f83c7, #2f6ca9) !important;
  color: white !important;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.12) !important;
}

.seller-orders-main {
  padding-top: var(--app-safe-area-top, env(safe-area-inset-top, 0px));
  background:
    radial-gradient(circle at top left, rgba(59, 130, 246, 0.1), transparent 36%),
    linear-gradient(180deg, #f8fafc 0%, #eef4fb 100%);
  min-height: 100vh;
}

.orders-filter-chip-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 12px 0 10px;
}

.orders-filter-chip {
  cursor: pointer;
}

.orders-processing-note {
  margin-bottom: 16px;
  color: #475569;
  font-size: 0.88rem;
}

.orders-list-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  margin: 20px 0 14px;
}

.orders-list-eyebrow {
  margin: 0 0 6px;
  color: #64748b;
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.orders-list-title {
  margin: 0;
  color: #0f172a;
  font-size: clamp(1.2rem, 3vw, 1.7rem);
  font-weight: 800;
  letter-spacing: -0.03em;
}

.orders-list-copy {
  margin: 0;
  max-width: 340px;
  color: #64748b;
  font-size: 0.88rem;
  line-height: 1.55;
  text-align: right;
}

.orders-list,
.orders-loading-grid {
  display: grid;
  gap: 14px;
}

.orders-skeleton-card,
.orders-empty-card {
  background: rgba(255, 255, 255, 0.96);
  border: 1px solid rgba(148, 163, 184, 0.16);
  box-shadow: 0 16px 34px rgba(15, 23, 42, 0.08);
}

.orders-skeleton-card {
  border-radius: 24px;
  overflow: hidden;
}

.orders-skeleton-top,
.orders-skeleton-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.orders-skeleton-block {
  display: block;
  background: linear-gradient(90deg, rgba(226, 232, 240, 0.92), rgba(241, 245, 249, 0.98), rgba(226, 232, 240, 0.92));
  background-size: 200% 100%;
  animation: ordersSkeletonShimmer 1.2s linear infinite;
}

.orders-skeleton-block--title {
  width: min(260px, 72%);
  height: 18px;
  border-radius: 999px;
}

.orders-skeleton-block--status {
  width: 112px;
  height: 28px;
  border-radius: 999px;
}

.orders-skeleton-metrics {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  margin-top: 18px;
}

.orders-skeleton-block--metric {
  height: 74px;
  border-radius: 18px;
}

.orders-skeleton-block--metric-wide {
  grid-column: 1 / -1;
}

.orders-skeleton-actions {
  justify-content: flex-end;
  margin-top: 18px;
}

.orders-skeleton-block--button {
  width: 148px;
  height: 42px;
  border-radius: 14px;
}

.orders-empty-card {
  margin-top: 18px;
  padding: 32px 20px;
  text-align: center;
  border-radius: 24px;
}

.orders-empty-title {
  margin: 14px 0 8px;
  color: #0f172a;
  font-size: 1.05rem;
  font-weight: 700;
}

.orders-empty-copy {
  margin: 0;
  color: #64748b;
  line-height: 1.6;
}

@keyframes ordersSkeletonShimmer {
  0% {
    background-position: 200% 0;
  }

  100% {
    background-position: -200% 0;
  }
}

@media (max-width: 767px) {
  .orders-filter-chip-row {
    flex-wrap: nowrap;
    overflow-x: auto;
    margin-right: -4px;
    padding-bottom: 4px;
    scrollbar-width: none;
  }

  .orders-filter-chip-row::-webkit-scrollbar {
    display: none;
  }

  .orders-filter-chip {
    flex-shrink: 0;
  }

  .orders-list-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 10px;
    margin: 18px 0 12px;
  }

  .orders-list-copy {
    max-width: none;
    text-align: left;
    font-size: 0.84rem;
  }

  .orders-skeleton-top,
  .orders-skeleton-actions {
    flex-wrap: wrap;
  }

  .orders-skeleton-metrics {
    grid-template-columns: 1fr;
  }

  .orders-skeleton-block--button {
    width: 100%;
  }

  .orders-list,
  .orders-loading-grid {
    gap: 12px;
  }

  .orders-empty-card {
    padding: 28px 18px;
  }
}
</style>
