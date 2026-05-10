<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/utils/supabase'
import { createNotificationRecordIfEnabled } from '@/utils/notificationPreferences'
import { isOrderCancellationRequestedStatus } from '@/utils/orderStatus'
import PullToRefreshWrapper from '@/components/PullToRefreshWrapper.vue'
import {
  buildSellerDashboardMetrics,
  fetchSellerDashboardSnapshot,
  fetchSellerOrders,
  fetchSellerProducts,
  type SellerDashboardOrder,
  type SellerDashboardProduct,
  type SellerDashboardShop,
} from '@/services/sellerDashboard'
import { fetchShopVisitSummary, getEmptyShopVisitSummary } from '@/services/shopVisitTracking'
import SellerMetricCard from '@/mainsite/seller/components/SellerMetricCard.vue'
import {
  buildSellerAnalyticsRoute,
  buildSellerOrdersRoute,
  buildSellerProductsRoute,
} from '@/mainsite/seller/sellerNavigation'

const router = useRouter()

const shopId = ref<string | null>(null)
const shopOwnerUserId = ref<string | null>(null)
const businessAvatar = ref('')
const coverPhoto = ref('')
const businessName = ref('')
const description = ref('')
const timeOpen = ref('')
const timeClose = ref('')
const manualStatus = ref('auto')
const address = ref('')
const loading = ref(false)
const loadingDashboard = ref(false)
const ordersError = ref('')
const isMobile = ref(window.innerWidth < 768)

const products = ref<SellerDashboardProduct[]>([])
const orders = ref<SellerDashboardOrder[]>([])
const visitSummary = ref(getEmptyShopVisitSummary())

let ordersSubscription: ReturnType<typeof supabase.channel> | null = null
let productsSubscription: ReturnType<typeof supabase.channel> | null = null
let visitsSubscription: ReturnType<typeof supabase.channel> | null = null

const goBack = () => router.back()

const updateMobileState = () => {
  isMobile.value = window.innerWidth < 768
}

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(Number(value || 0))

const formatCompactNumber = (value: number) =>
  new Intl.NumberFormat('en-PH', {
    notation: Number(value || 0) >= 1000 ? 'compact' : 'standard',
    maximumFractionDigits: Number(value || 0) >= 1000 ? 1 : 0,
  }).format(Number(value || 0))

const convertTo12Hour = (time24: string) => {
  if (!time24 || time24 === 'N/A') return 'N/A'

  try {
    const [hours, minutes] = time24.split(':')
    const hour = Number.parseInt(hours, 10)
    const minute = minutes || '00'

    if (Number.isNaN(hour)) return time24

    const period = hour >= 12 ? 'PM' : 'AM'
    const hour12 = hour % 12 || 12

    return `${hour12}:${minute} ${period}`
  } catch (error) {
    console.error('Error converting time:', error)
    return time24
  }
}

const orderCounts = computed(() => {
  let cancelRequests = 0

  orders.value.forEach((order) => {
    if (isOrderCancellationRequestedStatus(order.status)) {
      cancelRequests += 1
    }
  })

  return {
    cancel_requests: cancelRequests,
  }
})

const dashboardMetrics = computed(() =>
  buildSellerDashboardMetrics({
    orders: orders.value,
    products: products.value,
  }),
)

const overviewCards = computed(() => [
  {
    title: 'Sales Overview',
    value: formatCurrency(dashboardMetrics.value.monthlySales),
    caption: `Today ${formatCurrency(dashboardMetrics.value.dailySales)}`,
    icon: 'mdi-chart-line',
    tone: 'primary' as const,
    to: buildSellerAnalyticsRoute('sales'),
    featured: true,
  },
  {
    title: 'Total Revenue',
    value: formatCurrency(dashboardMetrics.value.totalRevenue),
    caption: 'Delivered and paid orders',
    icon: 'mdi-cash-multiple',
    tone: 'success' as const,
    to: buildSellerAnalyticsRoute('sales'),
  },
  {
    title: 'Total Orders',
    value: formatCompactNumber(dashboardMetrics.value.totalOrders),
    caption: `${dashboardMetrics.value.completedOrders} completed`,
    icon: 'mdi-receipt-text-outline',
    tone: 'info' as const,
    to: buildSellerOrdersRoute('all'),
  },
  {
    title: 'Pending Orders',
    value: formatCompactNumber(dashboardMetrics.value.pendingOrders),
    caption: `${dashboardMetrics.value.processingOrders} processing`,
    icon: 'mdi-timer-sand',
    tone: 'warning' as const,
    to: buildSellerOrdersRoute('pending'),
  },
  {
    title: 'Cancel Order Requests',
    value: formatCompactNumber(orderCounts.value.cancel_requests),
    caption: 'Customers waiting for your decision',
    icon: 'mdi-alert-circle-outline',
    tone: 'warning' as const,
    to: buildSellerOrdersRoute('cancel-requests'),
  },
  {
    title: 'Completed Orders',
    value: formatCompactNumber(dashboardMetrics.value.completedOrders),
    caption: 'Delivered to customers',
    icon: 'mdi-check-decagram',
    tone: 'success' as const,
    to: buildSellerOrdersRoute('completed'),
  },
  {
    title: 'Cancelled Orders',
    value: formatCompactNumber(dashboardMetrics.value.cancelledOrders),
    caption: 'Orders not fulfilled',
    icon: 'mdi-close-circle-outline',
    tone: 'error' as const,
    to: buildSellerOrdersRoute('cancelled'),
  },
  {
    title: 'Store Visits',
    value: formatCompactNumber(visitSummary.value.totalVisits),
    caption: visitSummary.value.hasVisitTracking
      ? `${formatCompactNumber(visitSummary.value.uniqueVisitors)} unique visitors`
      : 'Visit tracking not active yet',
    icon: 'mdi-storefront-outline',
    tone: 'secondary' as const,
    to: buildSellerAnalyticsRoute('visits'),
    featured: true,
  },
  {
    title: 'Total Products',
    value: formatCompactNumber(dashboardMetrics.value.totalProducts),
    caption: `${dashboardMetrics.value.lowStockProducts} low stock`,
    icon: 'mdi-package-variant-closed',
    tone: 'primary' as const,
    to: buildSellerProductsRoute('all'),
  },
  {
    title: 'Low Stock',
    value: formatCompactNumber(dashboardMetrics.value.lowStockProducts),
    caption: `${dashboardMetrics.value.outOfStockProducts} out of stock`,
    icon: 'mdi-alert-outline',
    tone: 'warning' as const,
    to: buildSellerProductsRoute('low-stock'),
  },
  {
    title: 'Total Buyers',
    value: formatCompactNumber(dashboardMetrics.value.totalCustomers),
    caption: 'Customers who ordered',
    icon: 'mdi-account-group-outline',
    tone: 'info' as const,
    to: buildSellerAnalyticsRoute('customers'),
    featured: true,
  },
])

const handleUserShopRefresh = async () => {
  ordersError.value = ''

  try {
    await fetchShopData()

    if (ordersError.value) {
      throw new Error(ordersError.value)
    }
  } catch (error) {
    console.error('Refresh failed:', error)
    ordersError.value = 'Failed to refresh shop data. Please try again.'
  }
}

const ensureSellerCancellationNotifications = async (
  ordersToCheck: SellerDashboardOrder[] = [],
) => {
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

const applyShopDetails = (shop: SellerDashboardShop | null, ownerId: string) => {
  shopOwnerUserId.value = ownerId
  shopId.value = shop?.id || null
  businessName.value = shop?.business_name || 'No shop name'
  description.value = shop?.description || 'No description provided'
  timeOpen.value = convertTo12Hour(shop?.open_time || '') || 'Not set'
  timeClose.value = convertTo12Hour(shop?.close_time || '') || 'Not set'
  businessAvatar.value = shop?.logo_url || ''
  coverPhoto.value = shop?.physical_store || ''
  manualStatus.value = shop?.manual_status || 'auto'

  address.value = [
    shop?.house_no,
    shop?.building,
    shop?.street,
    shop?.barangay,
    'Butuan City',
    'Agusan del Norte',
    'CARAGA',
    shop?.postal,
  ]
    .filter(Boolean)
    .join(', ')
}

const fetchOrders = async () => {
  if (!shopId.value) {
    orders.value = []
    return
  }

  try {
    const nextOrders = await fetchSellerOrders(shopId.value)
    orders.value = nextOrders
    await ensureSellerCancellationNotifications(nextOrders)
  } catch (error) {
    console.error('Error loading orders:', error)
    ordersError.value = 'Error loading orders. Please try again.'
    orders.value = []
  }
}

const fetchShopData = async () => {
  loadingDashboard.value = true
  ordersError.value = ''

  try {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      throw new Error('User not logged in')
    }

    const snapshot = await fetchSellerDashboardSnapshot(user.id)

    applyShopDetails(snapshot.shop, user.id)
    orders.value = snapshot.orders
    products.value = snapshot.products
    visitSummary.value = snapshot.visits

    if (snapshot.shop?.id) {
      await ensureSellerCancellationNotifications(snapshot.orders)
    }
  } catch (error: any) {
    console.error('Error loading shop info:', error?.message ?? error, error)
    ordersError.value = 'Failed to load shop information. Please try again.'
    orders.value = []
    products.value = []
    visitSummary.value = getEmptyShopVisitSummary()
  } finally {
    loadingDashboard.value = false
  }
}

const refreshDashboardSupplements = async () => {
  if (!shopId.value) {
    products.value = []
    visitSummary.value = getEmptyShopVisitSummary()
    return
  }

  try {
    const [nextProducts, nextVisitSummary] = await Promise.all([
      fetchSellerProducts(shopId.value),
      fetchShopVisitSummary(shopId.value),
    ])

    products.value = nextProducts
    visitSummary.value = nextVisitSummary
  } catch (error) {
    console.warn('Could not refresh seller dashboard supplements:', error)
  }
}

const stopOrdersSubscription = () => {
  if (!ordersSubscription) return
  supabase.removeChannel(ordersSubscription)
  ordersSubscription = null
}

const stopProductsSubscription = () => {
  if (!productsSubscription) return
  supabase.removeChannel(productsSubscription)
  productsSubscription = null
}

const stopVisitsSubscription = () => {
  if (!visitsSubscription) return
  supabase.removeChannel(visitsSubscription)
  visitsSubscription = null
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
        await fetchOrders()
      },
    )
    .subscribe()
}

const subscribeToProducts = (targetShopId: string | null) => {
  stopProductsSubscription()

  if (!targetShopId) return

  productsSubscription = supabase
    .channel(`usershop-products-${targetShopId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'products',
        filter: `shop_id=eq.${targetShopId}`,
      },
      async () => {
        await refreshDashboardSupplements()
      },
    )
    .subscribe()
}

const subscribeToVisits = (targetShopId: string | null) => {
  stopVisitsSubscription()

  if (!targetShopId) return

  visitsSubscription = supabase
    .channel(`usershop-visits-${targetShopId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'shop_visits',
        filter: `shop_id=eq.${targetShopId}`,
      },
      async () => {
        const nextVisitSummary = await fetchShopVisitSummary(targetShopId)
        visitSummary.value = nextVisitSummary
      },
    )
    .subscribe()
}

const toggleShopStatus = async () => {
  try {
    loading.value = true

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      throw new Error('User not logged in')
    }

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
      open: 'Shop is now OPEN',
      closed: 'Shop is now CLOSED',
      auto: 'Shop is now AUTOMATIC',
    }

    alert(statusMessages[newStatus])
  } catch (error) {
    console.error('Error updating shop status:', error)
    alert('Failed to update status')
  } finally {
    loading.value = false
  }
}

const getCurrentStatusDisplay = () => {
  if (manualStatus.value === 'open') {
    return {
      text: 'Open',
      color: 'success',
      icon: 'mdi-store-check',
      buttonText: 'Close Shop',
      buttonColor: 'red-darken-2',
    }
  }

  if (manualStatus.value === 'closed') {
    return {
      text: 'Closed',
      color: 'error',
      icon: 'mdi-store-remove',
      buttonText: 'Auto Mode',
      buttonColor: 'blue-darken-2',
    }
  }

  return {
    text: 'Auto',
    color: 'primary',
    icon: 'mdi-clock',
    buttonText: 'Open Shop',
    buttonColor: 'green-darken-2',
  }
}

const isShopCurrentlyOpen = () => {
  if (manualStatus.value === 'open') return true
  if (manualStatus.value === 'closed') return false

  const currentHour = new Date().getHours()
  return currentHour >= 8 && currentHour < 20
}

const deleteShop = async () => {
  if (!confirm('Delete your shop? This cannot be undone.')) {
    return
  }

  try {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      throw new Error('User not found')
    }

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

    alert('Shop deleted')
    router.push('/')
  } catch (error) {
    console.error('Delete shop error:', error)
    alert('Failed to delete shop')
  }
}

const editShop = () => {
  if (!shopId.value) {
    alert('Shop ID not found')
    return
  }

  router.push({
    name: 'shop-build',
    params: { id: shopId.value },
  })
}

const goToProducts = () => {
  router.push(buildSellerProductsRoute('all'))
}

const goToOrders = () => {
  router.push(buildSellerOrdersRoute('all'))
}

const goToAnalytics = () => {
  router.push(buildSellerAnalyticsRoute('sales'))
}

watch(shopId, (nextShopId) => {
  if (nextShopId) {
    subscribeToOrders(nextShopId)
    subscribeToProducts(nextShopId)
    subscribeToVisits(nextShopId)
  } else {
    stopOrdersSubscription()
    stopProductsSubscription()
    stopVisitsSubscription()
  }
})

onMounted(() => {
  fetchShopData()
  window.addEventListener('resize', updateMobileState)
})

onUnmounted(() => {
  stopOrdersSubscription()
  stopProductsSubscription()
  stopVisitsSubscription()
  window.removeEventListener('resize', updateMobileState)
})
</script>

<template>
  <v-app>
    <PullToRefreshWrapper :on-refresh="handleUserShopRefresh">
      <v-app-bar
        class="top-bar"
        flat
        color="primary"
        dark
        elevation="2"
        :height="isMobile ? '56' : '64'"
      >
        <v-btn icon @click="goBack" class="mr-1" size="small">
          <v-icon>mdi-arrow-left</v-icon>
        </v-btn>
        <v-toolbar-title class="text-subtitle-1 font-weight-bold">My Shop</v-toolbar-title>
        <v-spacer />

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

      <v-main class="background-gradient seller-shop-main" :class="{ 'mobile-padding': isMobile }">
        <v-container class="pa-0 cover-container">
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

          <div class="avatar-wrapper" :style="{ marginTop: isMobile ? '-35px' : '-50px' }">
            <v-avatar :size="isMobile ? 70 : 100" class="avatar-border elevation-4">
              <v-img v-if="businessAvatar" :src="businessAvatar" cover />
              <v-icon v-else :size="isMobile ? 32 : 48" color="primary">mdi-store</v-icon>
            </v-avatar>
          </div>
        </v-container>

        <v-container
          class="seller-shop-section seller-shop-section--business"
          :class="isMobile ? 'px-3 py-2' : 'py-2'"
        >
          <v-card class="business-card elevation-2" :rounded="isMobile ? 'lg' : 'xl'">
            <v-card-text
              :class="
                isMobile ? 'pa-4 business-card__content' : 'pa-6 text-center business-card__content'
              "
            >
              <h2 class="business-card__title text-subtitle-1 font-weight-bold text-primary mb-1">
                {{ businessName }}
              </h2>
              <p class="business-card__description text-caption text-medium-emphasis mb-3 line-clamp-2">
                {{ description }}
              </p>

              <v-row class="mb-3 business-meta-grid">
                <v-col cols="12" sm="6" class="pb-2">
                  <v-card variant="outlined" class="info-card pa-2" :rounded="isMobile ? 'md' : 'lg'">
                    <div class="d-flex align-center">
                      <v-icon color="primary" :size="isMobile ? 18 : 24" class="mr-2">
                        mdi-clock-outline
                      </v-icon>
                      <div class="text-left">
                        <div class="text-caption text-medium-emphasis">Hours</div>
                        <div class="text-body-2 font-weight-medium">{{ timeOpen }} - {{ timeClose }}</div>
                      </div>
                    </div>
                  </v-card>
                </v-col>

                <v-col cols="12" sm="6" class="pb-2">
                  <v-card variant="outlined" class="info-card pa-2" :rounded="isMobile ? 'md' : 'lg'">
                    <div class="d-flex align-center">
                      <v-icon color="primary" :size="isMobile ? 18 : 24" class="mr-2">
                        mdi-map-marker
                      </v-icon>
                      <div class="text-left">
                        <div class="text-caption text-medium-emphasis">Location</div>
                        <div class="text-body-2 font-weight-medium line-clamp-1">{{ address }}</div>
                      </div>
                    </div>
                  </v-card>
                </v-col>
              </v-row>

              <v-card class="status-card pa-3 mb-3" variant="outlined" :rounded="isMobile ? 'lg' : 'xl'">
                <div class="text-center status-card__content">
                  <div class="d-flex align-center justify-center mb-2 status-card__state">
                    <v-icon :color="getCurrentStatusDisplay().color" :size="isMobile ? 20 : 24" class="mr-2">
                      {{ getCurrentStatusDisplay().icon }}
                    </v-icon>
                    <span class="text-body-1 font-weight-medium">{{ getCurrentStatusDisplay().text }}</span>
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

                  <p class="text-caption text-medium-emphasis mt-2 status-card__hint">
                    {{
                      manualStatus === 'auto'
                        ? `Currently: ${isShopCurrentlyOpen() ? 'OPEN' : 'CLOSED'}`
                        : 'Manually overridden'
                    }}
                  </p>
                </div>
              </v-card>
            </v-card-text>
          </v-card>
        </v-container>

        <v-container
          class="seller-shop-section seller-shop-section--overview"
          :class="isMobile ? 'px-3 py-2' : 'py-3'"
        >
          <div class="dashboard-section-heading">
            <div>
              <p class="dashboard-eyebrow">Seller dashboard</p>
              <h2 class="dashboard-section-title">Overview</h2>
            </div>
            <v-chip color="primary" variant="tonal" size="small" class="dashboard-live-chip">
              <v-icon start size="14">mdi-chart-box-outline</v-icon>
              Live shop snapshot
            </v-chip>
          </div>

          <template v-if="loadingDashboard">
            <div class="overview-grid">
              <v-skeleton-loader
                v-for="i in 10"
                :key="'overview-skeleton-' + i"
                type="article"
                class="dashboard-card dashboard-card--skeleton"
              />
            </div>
          </template>

          <template v-else>
            <div class="overview-grid">
              <div
                v-for="card in overviewCards"
                :key="card.title"
                class="overview-card-slot"
                :class="{ 'overview-card-slot--featured': card.featured }"
              >
                <SellerMetricCard
                  :title="card.title"
                  :value="card.value"
                  :caption="card.caption"
                  :icon="card.icon"
                  :tone="card.tone"
                  :to="card.to"
                />
              </div>
            </div>
          </template>
        </v-container>

        <v-container
          class="seller-shop-section seller-shop-section--actions"
          :class="isMobile ? 'px-3 py-1' : 'py-2'"
        >
          <div class="management-actions-grid">
            <v-btn
              @click="goToOrders"
              color="primary"
              :size="isMobile ? 'large' : 'x-large'"
              class="action-btn"
              :rounded="isMobile ? 'lg' : 'xl'"
              variant="flat"
              :height="isMobile ? 68 : 60"
            >
              <v-icon start :size="isMobile ? 20 : 24">mdi-receipt-text-outline</v-icon>
              <span class="action-btn__label">Shop Orders</span>
            </v-btn>

            <v-btn
              @click="goToProducts"
              color="secondary"
              :size="isMobile ? 'large' : 'x-large'"
              class="action-btn"
              :rounded="isMobile ? 'lg' : 'xl'"
              variant="flat"
              :height="isMobile ? 68 : 60"
            >
              <v-icon start :size="isMobile ? 20 : 24">mdi-package-variant</v-icon>
              <span class="action-btn__label">Product Management</span>
            </v-btn>

            <v-btn
              @click="goToAnalytics"
              color="info"
              class="action-btn action-btn--subtle"
              :rounded="isMobile ? 'lg' : 'xl'"
              variant="outlined"
              :height="isMobile ? 68 : 60"
            >
              <v-icon start :size="isMobile ? 20 : 24">mdi-chart-line</v-icon>
              <span class="action-btn__label">Sales Analytics</span>
            </v-btn>
          </div>
        </v-container>
      </v-main>
    </PullToRefreshWrapper>
  </v-app>
</template>

<style scoped>
.background-gradient {
  min-height: 100vh;
  background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
}

.seller-shop-main {
  padding-bottom: max(24px, var(--app-safe-area-bottom, env(safe-area-inset-bottom, 0px)));
}

.mobile-padding {
  padding-bottom: 20px;
}

.seller-shop-section {
  position: relative;
}

.top-bar {
  padding-top: var(--app-safe-area-top, env(safe-area-inset-top, 0px));
  padding-left: var(--app-safe-area-left, env(safe-area-inset-left, 0px));
  padding-right: var(--app-safe-area-right, env(safe-area-inset-right, 0px));
}

.cover-container {
  position: relative;
}

.cover-photo,
.cover-placeholder {
  border-radius: 0 0 16px 16px;
}

.cover-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #eeeeee 0%, #e5e2e9 100%);
}

.avatar-wrapper {
  position: relative;
  z-index: 2;
  display: flex;
  justify-content: center;
}

.avatar-border {
  border: 4px solid white;
  background: white;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
}

.business-card {
  border: 1px solid rgba(148, 163, 184, 0.18);
  background: rgba(255, 255, 255, 0.96);
  box-shadow: 0 18px 36px rgba(15, 23, 42, 0.08);
}

.business-card__content {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.business-card__title {
  line-height: 1.2;
}

.business-card__description {
  max-width: 58ch;
  line-height: 1.55;
}

.business-meta-grid {
  margin-top: 2px;
}

.info-card {
  height: 100%;
  border: 1px solid rgba(148, 163, 184, 0.18);
  background: linear-gradient(180deg, #ffffff 0%, #f8fbff 100%);
  transition: all 0.3s ease;
}

.info-card:hover {
  transform: translateY(-1px);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.status-card {
  border: 1px solid rgba(148, 163, 184, 0.24);
  background: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%);
}

.status-card__content {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.status-card__state {
  flex-wrap: wrap;
}

.status-card__hint {
  line-height: 1.5;
}

.status-toggle-btn {
  font-weight: 600;
  box-shadow: 0 2px 8px rgba(196, 187, 187, 0.1);
}

.dashboard-section-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 14px;
}

.dashboard-live-chip {
  box-shadow: inset 0 0 0 1px rgba(59, 130, 246, 0.08);
}

.dashboard-eyebrow {
  margin: 0 0 6px;
  color: #64748b;
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.dashboard-section-title {
  margin: 0;
  color: #0f172a;
  font-size: clamp(1.1rem, 2.8vw, 1.45rem);
  font-weight: 800;
  letter-spacing: -0.02em;
}

.overview-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
  gap: 12px;
}

.overview-card-slot {
  display: flex;
  align-items: stretch;
  min-width: 0;
}

.overview-card-slot > * {
  flex: 1 1 auto;
}

.overview-card-slot--featured {
  grid-column: 1 / -1;
}

.dashboard-card {
  min-height: 144px;
  border: 1px solid rgba(148, 163, 184, 0.16);
  background: rgba(255, 255, 255, 0.96);
  box-shadow: 0 16px 34px rgba(15, 23, 42, 0.08);
}

.dashboard-card--skeleton {
  overflow: hidden;
}

.management-actions-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 12px;
}

.action-btn {
  width: 100%;
  border: none;
  color: white;
  background: linear-gradient(135deg, #667eea 0%, #5668af 100%);
  box-shadow: 0 4px 15px rgba(255, 255, 255, 0.205);
  transition: all 0.3s ease;
}

.action-btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 6px 20px rgba(102, 126, 234, 0.3);
}

.action-btn--subtle {
  color: #1f2937;
  border-color: rgba(148, 163, 184, 0.28);
  background: rgba(255, 255, 255, 0.9);
  box-shadow: 0 10px 24px rgba(15, 23, 42, 0.08);
}

.action-btn :deep(.v-btn__content) {
  width: 100%;
  gap: 8px;
  justify-content: flex-start;
  white-space: normal;
}

.action-btn__label {
  display: inline-block;
  text-align: left;
  line-height: 1.2;
}

.line-clamp-1 {
  display: -webkit-box;
  overflow: hidden;
  text-overflow: ellipsis;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 1;
}

.line-clamp-2 {
  display: -webkit-box;
  overflow: hidden;
  text-overflow: ellipsis;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

@media (max-width: 768px) {
  .v-btn {
    min-height: 36px;
  }

  .seller-shop-section--business,
  .seller-shop-section--overview,
  .seller-shop-section--actions {
    margin-top: 4px;
  }

  .business-card__content {
    gap: 12px;
  }

  .business-card__title,
  .business-card__description {
    text-align: center;
  }

  .dashboard-section-heading {
    align-items: stretch;
    gap: 10px;
  }

  .dashboard-live-chip {
    align-self: flex-start;
    max-width: 100%;
  }

  .overview-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }

  .management-actions-grid {
    grid-template-columns: 1fr;
    gap: 10px;
  }

  .top-bar {
    padding-top: max(var(--app-safe-area-top, env(safe-area-inset-top, 0px)), 0px);
  }

  .v-main {
    padding-bottom: max(var(--app-safe-area-bottom, env(safe-area-inset-bottom, 0px)), 0px);
  }
}

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

  .overview-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .dashboard-live-chip {
    width: 100%;
    justify-content: center;
  }

  .action-btn__label {
    font-size: 0.8rem;
  }
}

@media (min-width: 769px) and (max-width: 1024px) {
  .avatar-wrapper {
    margin-top: -45px;
  }

  .avatar-border {
    width: 90px !important;
    height: 90px !important;
  }
}

@media (prefers-reduced-motion: reduce) {
  .info-card,
  .action-btn {
    transition: none;
  }
}
</style>
