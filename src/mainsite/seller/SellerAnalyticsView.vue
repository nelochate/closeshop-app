<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { supabase } from '@/utils/supabase'
import {
  LOW_STOCK_THRESHOLD,
  fetchSellerDashboardSnapshot,
  type SellerDashboardProduct,
  type SellerDashboardSnapshot,
} from '@/services/sellerDashboard'
import {
  buildSellerAnalyticsRoute,
  buildSellerOrdersRoute,
  buildSellerProductsRoute,
  normalizeSellerAnalyticsSection,
  type SellerAnalyticsSection,
} from './sellerNavigation'
import PullToRefreshWrapper from '@/components/PullToRefreshWrapper.vue'
import SellerMetricCard from './components/SellerMetricCard.vue'
import SellerSummaryTile from './components/SellerSummaryTile.vue'

const router = useRouter()
const route = useRoute()

const isMobile = ref(window.innerWidth < 768)
const sellerAppBarHeight = computed(() => (isMobile.value ? 64 : 72))
const loading = ref(true)
const errorMessage = ref('')
const snapshot = ref<SellerDashboardSnapshot | null>(null)
const businessName = ref('Seller Shop')
const focusedSection = computed(() => normalizeSellerAnalyticsSection(route.query.section))
const hasSalesRevenue = computed(() =>
  (snapshot.value?.salesSeries || []).some((point) => Number(point.revenue || 0) > 0),
)
const maxSalesRevenue = computed(() =>
  Math.max(1, ...(snapshot.value?.salesSeries || []).map((point) => Number(point.revenue || 0))),
)

let ordersSubscription: ReturnType<typeof supabase.channel> | null = null
let productsSubscription: ReturnType<typeof supabase.channel> | null = null
let visitsSubscription: ReturnType<typeof supabase.channel> | null = null

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
    notation: value >= 1000 ? 'compact' : 'standard',
    maximumFractionDigits: value >= 1000 ? 1 : 0,
  }).format(Number(value || 0))

const formatCurrencyShort = (value: number) => {
  const normalized = Number(value || 0)

  if (normalized >= 1000) {
    return `PHP ${formatCompactNumber(normalized)}`
  }

  return `PHP ${new Intl.NumberFormat('en-PH', { maximumFractionDigits: 0 }).format(normalized)}`
}

const setFocusedSection = (section: SellerAnalyticsSection) => {
  router.replace(buildSellerAnalyticsRoute(section))
}

const handleAnalyticsRefresh = async () => {
  await loadAnalytics()
}

const stopSubscriptions = () => {
  if (ordersSubscription) {
    supabase.removeChannel(ordersSubscription)
    ordersSubscription = null
  }

  if (productsSubscription) {
    supabase.removeChannel(productsSubscription)
    productsSubscription = null
  }

  if (visitsSubscription) {
    supabase.removeChannel(visitsSubscription)
    visitsSubscription = null
  }
}

const subscribeToAnalyticsChanges = (shopId: string | null) => {
  stopSubscriptions()

  if (!shopId) return

  const refresh = async () => {
    await loadAnalytics(false)
  }

  ordersSubscription = supabase
    .channel(`seller-analytics-orders-${shopId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'orders',
        filter: `shop_id=eq.${shopId}`,
      },
      refresh,
    )
    .subscribe()

  productsSubscription = supabase
    .channel(`seller-analytics-products-${shopId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'products',
        filter: `shop_id=eq.${shopId}`,
      },
      refresh,
    )
    .subscribe()

  visitsSubscription = supabase
    .channel(`seller-analytics-visits-${shopId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'shop_visits',
        filter: `shop_id=eq.${shopId}`,
      },
      refresh,
    )
    .subscribe()
}

const loadAnalytics = async (showLoader = true) => {
  if (showLoader) loading.value = true
  errorMessage.value = ''

  try {
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      router.replace('/')
      return
    }

    const nextSnapshot = await fetchSellerDashboardSnapshot(user.id)
    snapshot.value = nextSnapshot
    businessName.value = nextSnapshot.shop?.business_name || 'Seller Shop'
    subscribeToAnalyticsChanges(nextSnapshot.shop?.id || null)
  } catch (error) {
    console.error('Failed to load seller analytics:', error)
    errorMessage.value = 'Unable to load seller analytics right now.'
  } finally {
    loading.value = false
  }
}

const overviewCards = computed(() => {
  const metrics = snapshot.value?.metrics

  if (!metrics) return []

  return [
    {
      title: 'Monthly Revenue',
      value: formatCurrency(metrics.monthlySales),
      caption: `Today ${formatCurrency(metrics.dailySales)}`,
      icon: 'mdi-calendar-month',
      tone: 'primary' as const,
    },
    {
      title: 'Total Revenue',
      value: formatCurrency(metrics.totalRevenue),
      caption: 'Completed, paid sales only',
      icon: 'mdi-cash-multiple',
      tone: 'success' as const,
    },
    {
      title: 'Total Buyers',
      value: formatCompactNumber(metrics.totalCustomers),
      caption: `${formatCompactNumber(metrics.totalOrders)} total orders`,
      icon: 'mdi-account-group-outline',
      tone: 'info' as const,
      to: buildSellerOrdersRoute('all'),
    },
    {
      title: 'Units Sold',
      value: formatCompactNumber(metrics.totalUnitsSold),
      caption: `${formatCompactNumber(metrics.totalProducts)} active products`,
      icon: 'mdi-package-variant-closed',
      tone: 'secondary' as const,
      to: buildSellerProductsRoute('all'),
    },
  ]
})

const salesTiles = computed(() => {
  const metrics = snapshot.value?.metrics

  if (!metrics) return []

  return [
    {
      title: 'Today',
      value: formatCurrency(metrics.dailySales),
      icon: 'mdi-calendar-today',
      tone: 'primary' as const,
    },
    {
      title: 'This Week',
      value: formatCurrency(metrics.weeklySales),
      icon: 'mdi-calendar-week',
      tone: 'info' as const,
    },
    {
      title: 'This Month',
      value: formatCurrency(metrics.monthlySales),
      icon: 'mdi-calendar-month',
      tone: 'success' as const,
    },
  ]
})

const salesChart = computed(() => {
  const width = 100
  const height = 64
  const padding = { top: 8, right: 3, bottom: 8, left: 3 }
  const chartWidth = width - padding.left - padding.right
  const chartHeight = height - padding.top - padding.bottom
  const scaleMax = hasSalesRevenue.value ? maxSalesRevenue.value : 1
  const series = snapshot.value?.salesSeries || []

  const points = series.map((point, index) => {
    const x =
      series.length <= 1 ? width / 2 : padding.left + (index / (series.length - 1)) * chartWidth
    const yRatio = hasSalesRevenue.value ? Number(point.revenue || 0) / scaleMax : 0
    const y = padding.top + chartHeight - yRatio * chartHeight

    return {
      ...point,
      x: Number(x.toFixed(2)),
      y: Number(y.toFixed(2)),
      revenueLabel: formatCurrencyShort(Number(point.revenue || 0)),
    }
  })

  const linePath = points
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`)
    .join(' ')

  const areaPath =
    points.length > 0
      ? `${linePath} L ${points[points.length - 1].x} ${height - padding.bottom} L ${points[0].x} ${height - padding.bottom} Z`
      : ''

  const guideValues = hasSalesRevenue.value ? [scaleMax, scaleMax / 2, 0] : [0]
  const guides = guideValues.map((value, index) => {
    const yRatio = scaleMax > 0 ? value / scaleMax : 0
    const y = padding.top + chartHeight - yRatio * chartHeight

    return {
      key: `guide-${index}-${value}`,
      y: Number(y.toFixed(2)),
      label: formatCurrencyShort(value),
    }
  })

  return {
    points,
    linePath,
    areaPath,
    guides,
  }
})

const salesChartSummary = computed(() => {
  const totalOrders = (snapshot.value?.salesSeries || []).reduce(
    (sum, point) => sum + Number(point.orders || 0),
    0,
  )

  if (!totalOrders) {
    return 'Waiting for your first completed paid order.'
  }

  return `${totalOrders} completed order${totalOrders === 1 ? '' : 's'} recorded in the last 7 days.`
})

const visitTiles = computed(() => {
  const visits = snapshot.value?.visits
  if (!visits) return []

  return [
    {
      title: 'Total Visits',
      value: formatCompactNumber(visits.totalVisits),
      subtitle: visits.hasVisitTracking ? 'All recorded page opens' : 'Tracking not active yet',
      icon: 'mdi-eye-outline',
      tone: 'info' as const,
    },
    {
      title: 'Unique Visitors',
      value: formatCompactNumber(visits.uniqueVisitors),
      subtitle: 'Session-level unique traffic',
      icon: 'mdi-account-eye-outline',
      tone: 'secondary' as const,
    },
    {
      title: 'Last 7 Days',
      value: formatCompactNumber(visits.last7DaysVisits),
      subtitle: 'Recent shop traffic',
      icon: 'mdi-chart-timeline-variant',
      tone: 'primary' as const,
    },
    {
      title: 'Last 30 Days',
      value: formatCompactNumber(visits.last30DaysVisits),
      subtitle: 'Rolling monthly interest',
      icon: 'mdi-calendar-range',
      tone: 'success' as const,
    },
  ]
})

const inventoryTiles = computed(() => {
  const metrics = snapshot.value?.metrics
  if (!metrics) return []

  return [
    {
      title: 'Active Products',
      value: formatCompactNumber(metrics.totalProducts),
      subtitle: 'Products listed in your shop',
      icon: 'mdi-package-variant',
      tone: 'primary' as const,
      to: buildSellerProductsRoute('all'),
    },
    {
      title: 'Low Stock',
      value: formatCompactNumber(metrics.lowStockProducts),
      subtitle: `Below ${LOW_STOCK_THRESHOLD} units`,
      icon: 'mdi-alert-outline',
      tone: 'warning' as const,
      to: buildSellerProductsRoute('low-stock'),
    },
    {
      title: 'Out of Stock',
      value: formatCompactNumber(metrics.outOfStockProducts),
      subtitle: 'Needs restocking',
      icon: 'mdi-package-variant-closed',
      tone: 'error' as const,
      to: buildSellerProductsRoute('out-of-stock'),
    },
  ]
})

const orderTiles = computed(() => {
  const metrics = snapshot.value?.metrics
  if (!metrics) return []

  return [
    {
      title: 'Pending',
      value: formatCompactNumber(metrics.pendingOrders),
      subtitle: 'Waiting for your approval',
      icon: 'mdi-clock-outline',
      tone: 'warning' as const,
      to: buildSellerOrdersRoute('pending'),
    },
    {
      title: 'Processing',
      value: formatCompactNumber(metrics.processingOrders),
      subtitle: 'Queued for dispatch',
      icon: 'mdi-progress-clock',
      tone: 'info' as const,
      to: buildSellerOrdersRoute('processing'),
    },
    {
      title: 'Completed',
      value: formatCompactNumber(metrics.completedOrders),
      subtitle: 'Delivered to customers',
      icon: 'mdi-truck-check-outline',
      tone: 'success' as const,
      to: buildSellerOrdersRoute('completed'),
    },
    {
      title: 'Cancelled',
      value: formatCompactNumber(metrics.cancelledOrders),
      subtitle: 'Closed without fulfillment',
      icon: 'mdi-cancel',
      tone: 'error' as const,
      to: buildSellerOrdersRoute('cancelled'),
    },
  ]
})

const lowStockProducts = computed(() => snapshot.value?.lowStockItems || [])
const topProducts = computed(() => snapshot.value?.topProducts || [])

const topProductLabel = (product: SellerDashboardProduct) => `${Number(product.sold || 0)} sold`
const stockLabel = (product: SellerDashboardProduct) => `${Number(product.stock || 0)} remaining`

watch(
  () => route.query.section,
  () => {
    if (!route.query.section) return
    const validSection = normalizeSellerAnalyticsSection(route.query.section)
    if (validSection !== route.query.section) {
      router.replace({ name: 'seller-analytics', query: validSection === 'sales' ? {} : { section: validSection } })
    }
  },
)

onMounted(async () => {
  window.addEventListener('resize', updateMobileState)
  await loadAnalytics()
})

onUnmounted(() => {
  stopSubscriptions()
  window.removeEventListener('resize', updateMobileState)
})
</script>

<template>
  <v-app
    class="seller-analytics-app"
    :style="{ '--seller-app-bar-height': `${sellerAppBarHeight}px` }"
  >
    <PullToRefreshWrapper :on-refresh="handleAnalyticsRefresh">
      <v-app-bar
        class="seller-analytics-bar"
        flat
        color="#3f83c7"
        dark
        density="comfortable"
        :height="sellerAppBarHeight"
      >
        <v-btn icon size="small" class="mr-1" @click="router.back()">
          <v-icon>mdi-arrow-left</v-icon>
        </v-btn>
        <v-toolbar-title class="text-subtitle-1 font-weight-bold">Shop Analytics</v-toolbar-title>
      </v-app-bar>

      <v-main class="seller-analytics-main">
        <v-container :class="isMobile ? 'px-3 py-4' : 'pa-6'" fluid>
          <section class="analytics-hero">
            <div class="analytics-focus-chips">
              <v-chip
                :color="focusedSection === 'sales' ? 'primary' : 'default'"
                :variant="focusedSection === 'sales' ? 'flat' : 'outlined'"
                @click="setFocusedSection('sales')"
              >
                Sales
              </v-chip>
              <v-chip
                :color="focusedSection === 'visits' ? 'info' : 'default'"
                :variant="focusedSection === 'visits' ? 'flat' : 'outlined'"
                @click="setFocusedSection('visits')"
              >
                Visits
              </v-chip>
              <v-chip
                :color="focusedSection === 'inventory' ? 'warning' : 'default'"
                :variant="focusedSection === 'inventory' ? 'flat' : 'outlined'"
                @click="setFocusedSection('inventory')"
              >
                Inventory
              </v-chip>
              <v-chip
                :color="focusedSection === 'customers' ? 'secondary' : 'default'"
                :variant="focusedSection === 'customers' ? 'flat' : 'outlined'"
                @click="setFocusedSection('customers')"
              >
                Buyers
              </v-chip>
            </div>
          </section>

          <v-alert v-if="errorMessage" type="error" rounded="lg" class="mb-4">
            {{ errorMessage }}
          </v-alert>

          <template v-if="loading">
            <div class="analytics-panel-stack mt-4">
              <v-skeleton-loader type="article" class="analytics-panel-skeleton" />
            </div>
          </template>

          <template v-else-if="!snapshot?.shop?.id">
            <v-card rounded="xl" variant="flat" class="analytics-empty-card">
              <v-card-text class="text-center py-10">
                <v-icon size="54" color="primary">mdi-storefront-outline</v-icon>
                <h2 class="text-h6 font-weight-bold mt-4">No seller shop found</h2>
                <p class="analytics-empty-copy">
                  Create your shop first to unlock seller analytics and dashboard shortcuts.
                </p>
                <v-btn color="primary" rounded="lg" class="mt-4" @click="router.push({ name: 'shop-build' })">
                  Create Shop
                </v-btn>
              </v-card-text>
            </v-card>
          </template>

          <template v-else>
            <div class="analytics-panel-stack mt-4">
              <v-card
                v-if="focusedSection === 'sales'"
                rounded="xl"
                variant="flat"
                class="analytics-panel"
                :class="{ 'analytics-panel--focused': focusedSection === 'sales' }"
              >
                <v-card-text class="pa-4 pa-sm-5">
                  <div class="analytics-panel__header">
                    <div>
                      <p class="analytics-panel__eyebrow">Revenue trend</p>
                      <h2 class="analytics-panel__title">Sales performance</h2>
                    </div>
                    <v-btn variant="text" color="primary" size="small" @click="router.push(buildSellerOrdersRoute('completed'))">
                      View completed orders
                    </v-btn>
                  </div>

                  <div class="analytics-tile-grid">
                    <SellerSummaryTile
                      v-for="tile in salesTiles"
                      :key="tile.title"
                      :title="tile.title"
                      :value="tile.value"
                      :icon="tile.icon"
                      :tone="tile.tone"
                    />
                  </div>

                  <div v-if="snapshot.salesSeries.length > 0" class="analytics-chart-card">
                    <div class="analytics-chart-card__top">
                      <div>
                        <p class="analytics-chart-card__eyebrow">Last 7 days</p>
                        <h3 class="analytics-chart-card__title">Sales line graph</h3>
                      </div>
                      <div class="analytics-chart-card__legend">
                        <span class="analytics-chart-card__legend-dot"></span>
                        Revenue from completed paid orders
                      </div>
                    </div>

                    <div class="analytics-line-chart">
                      <div class="analytics-line-chart__axis">
                        <span
                          v-for="guide in salesChart.guides"
                          :key="`${guide.key}-label`"
                          class="analytics-line-chart__axis-label"
                        >
                          {{ guide.label }}
                        </span>
                      </div>

                      <div class="analytics-line-chart__surface">
                        <svg
                          viewBox="0 0 100 64"
                          preserveAspectRatio="none"
                          class="analytics-line-chart__svg"
                          aria-hidden="true"
                        >
                          <line
                            v-for="guide in salesChart.guides"
                            :key="guide.key"
                            x1="0"
                            :y1="guide.y"
                            x2="100"
                            :y2="guide.y"
                            class="analytics-line-chart__guide"
                          />
                          <path :d="salesChart.areaPath" class="analytics-line-chart__area" />
                          <path :d="salesChart.linePath" class="analytics-line-chart__path" />
                          <circle
                            v-for="point in salesChart.points"
                            :key="point.label"
                            :cx="point.x"
                            :cy="point.y"
                            r="2.4"
                            class="analytics-line-chart__point"
                            :class="{ 'analytics-line-chart__point--today': point.isToday }"
                          />
                        </svg>
                      </div>

                      <div class="analytics-line-chart__labels">
                        <div
                          v-for="point in salesChart.points"
                          :key="`${point.label}-detail`"
                          class="analytics-line-chart__label"
                        >
                          <span class="analytics-line-chart__label-day">{{ point.shortLabel }}</span>
                          <span class="analytics-line-chart__label-value">{{ point.revenueLabel }}</span>
                        </div>
                      </div>
                    </div>

                    <div class="analytics-chart-card__footer">
                      {{ salesChartSummary }}
                    </div>
                  </div>
                  <div v-else class="analytics-empty-note">
                    Completed and paid orders will start filling this chart once your first successful sales come in.
                  </div>
                </v-card-text>
              </v-card>

              <v-card
                v-else-if="focusedSection === 'visits'"
                rounded="xl"
                variant="flat"
                class="analytics-panel"
                :class="{ 'analytics-panel--focused': focusedSection === 'visits' }"
              >
                <v-card-text class="pa-4 pa-sm-5">
                  <div class="analytics-panel__header">
                    <div>
                      <p class="analytics-panel__eyebrow">Shop visibility</p>
                      <h2 class="analytics-panel__title">Traffic insights</h2>
                    </div>
                  </div>

                  <div class="analytics-tile-grid">
                    <SellerSummaryTile
                      v-for="tile in visitTiles"
                      :key="tile.title"
                      :title="tile.title"
                      :value="tile.value"
                      :subtitle="tile.subtitle"
                      :icon="tile.icon"
                      :tone="tile.tone"
                    />
                  </div>

                  <div v-if="!snapshot.visits.hasVisitTracking" class="analytics-empty-note">
                    Visit tracking is waiting for the Supabase analytics migration to be enabled.
                  </div>
                </v-card-text>
              </v-card>

              <v-card
                v-else-if="focusedSection === 'inventory'"
                rounded="xl"
                variant="flat"
                class="analytics-panel"
                :class="{ 'analytics-panel--focused': focusedSection === 'inventory' }"
              >
                <v-card-text class="pa-4 pa-sm-5">
                  <div class="analytics-panel__header">
                    <div>
                      <p class="analytics-panel__eyebrow">Inventory pulse</p>
                      <h2 class="analytics-panel__title">Stock watch</h2>
                    </div>
                    <v-btn variant="text" color="primary" size="small" @click="router.push(buildSellerProductsRoute('all'))">
                      Manage products
                    </v-btn>
                  </div>

                  <div class="analytics-tile-grid">
                    <SellerSummaryTile
                      v-for="tile in inventoryTiles"
                      :key="tile.title"
                      :title="tile.title"
                      :value="tile.value"
                      :subtitle="tile.subtitle"
                      :icon="tile.icon"
                      :tone="tile.tone"
                      :to="tile.to"
                    />
                  </div>

                  <div class="analytics-list-grid">
                    <div class="analytics-list-card">
                      <div class="analytics-list-card__header">
                        <span>Low stock watch</span>
                        <span>{{ lowStockProducts.length }}</span>
                      </div>
                      <div v-if="lowStockProducts.length" class="analytics-list">
                        <div v-for="product in lowStockProducts" :key="product.id" class="analytics-list__item">
                          <div>
                            <strong>{{ product.prod_name }}</strong>
                            <span>{{ stockLabel(product) }}</span>
                          </div>
                          <v-chip color="warning" size="x-small" variant="flat">Low</v-chip>
                        </div>
                      </div>
                      <div v-else class="analytics-empty-inline">
                        No low stock items right now.
                      </div>
                    </div>

                    <div class="analytics-list-card">
                      <div class="analytics-list-card__header">
                        <span>Top selling</span>
                        <span>{{ topProducts.length }}</span>
                      </div>
                      <div v-if="topProducts.length" class="analytics-list">
                        <div v-for="product in topProducts" :key="product.id" class="analytics-list__item">
                          <div>
                            <strong>{{ product.prod_name }}</strong>
                            <span>{{ topProductLabel(product) }}</span>
                          </div>
                          <v-chip color="success" size="x-small" variant="flat">Top</v-chip>
                        </div>
                      </div>
                      <div v-else class="analytics-empty-inline">
                        Product rankings will appear after your first sales.
                      </div>
                    </div>
                  </div>
                </v-card-text>
              </v-card>

              <v-card
                v-else
                rounded="xl"
                variant="flat"
                class="analytics-panel"
                :class="{ 'analytics-panel--focused': focusedSection === 'customers' }"
              >
                <v-card-text class="pa-4 pa-sm-5">
                  <div class="analytics-panel__header">
                    <div>
                      <p class="analytics-panel__eyebrow">Buyer signals</p>
                      <h2 class="analytics-panel__title">Order health</h2>
                    </div>
                    <v-btn variant="text" color="primary" size="small" @click="router.push(buildSellerOrdersRoute('all'))">
                      Open shop orders
                    </v-btn>
                  </div>

                  <div class="analytics-tile-grid">
                    <SellerSummaryTile
                      v-for="tile in orderTiles"
                      :key="tile.title"
                      :title="tile.title"
                      :value="tile.value"
                      :subtitle="tile.subtitle"
                      :icon="tile.icon"
                      :tone="tile.tone"
                      :to="tile.to"
                    />
                  </div>
                </v-card-text>
              </v-card>
            </div>
          </template>
        </v-container>
      </v-main>
    </PullToRefreshWrapper>
  </v-app>
</template>

<style scoped>
.seller-analytics-app {
  background: #f8fafc;
}

.seller-analytics-bar {
  padding-top: var(--app-safe-area-top, env(safe-area-inset-top, 0px));
  padding-left: max(8px, var(--app-safe-area-left, env(safe-area-inset-left, 0px)));
  padding-right: max(8px, var(--app-safe-area-right, env(safe-area-inset-right, 0px)));
  background: linear-gradient(135deg, #3f83c7, #2f6ca9) !important;
  color: white !important;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.12) !important;
}

.seller-analytics-bar :deep(.v-toolbar__content) {
  min-height: var(--seller-app-bar-height) !important;
  padding-inline: 0;
}

.seller-analytics-main {
  padding-top: calc(
    var(--seller-app-bar-height) + var(--app-safe-area-top, env(safe-area-inset-top, 0px)) + 10px
  );
  padding-bottom: var(--app-safe-area-bottom, env(safe-area-inset-bottom, 0px));
  background:
    radial-gradient(circle at top left, rgba(59, 130, 246, 0.1), transparent 38%),
    linear-gradient(180deg, #f8fafc 0%, #eef4fb 100%);
  min-height: 100vh;
}

.analytics-hero {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
  margin-bottom: 16px;
}

.analytics-eyebrow,
.analytics-panel__eyebrow {
  margin: 0 0 6px;
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #64748b;
}

.analytics-title,
.analytics-panel__title {
  margin: 0;
  color: #0f172a;
  font-weight: 800;
  letter-spacing: -0.03em;
}

.analytics-title {
  font-size: clamp(1.4rem, 4vw, 2rem);
}

.analytics-copy {
  margin: 10px 0 0;
  color: #475569;
  max-width: 560px;
  line-height: 1.6;
}

.analytics-focus-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.analytics-overview-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 12px;
}

.analytics-panel-stack {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 16px;
}

.analytics-panel-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}

.analytics-panel,
.analytics-empty-card {
  background: rgba(255, 255, 255, 0.96);
  border: 1px solid rgba(148, 163, 184, 0.16);
  box-shadow: 0 16px 34px rgba(15, 23, 42, 0.08);
}

.analytics-panel--focused {
  border-color: rgba(59, 130, 246, 0.28);
  box-shadow: 0 18px 36px rgba(37, 99, 235, 0.14);
}

.analytics-panel__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 14px;
}

.analytics-tile-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 12px;
}

.analytics-chart-card {
  margin-top: 18px;
  padding: 16px;
  border-radius: 24px;
  background:
    radial-gradient(circle at top, rgba(59, 130, 246, 0.16), transparent 45%),
    linear-gradient(180deg, #f8fbff 0%, #eef6ff 100%);
  border: 1px solid rgba(147, 197, 253, 0.36);
}

.analytics-chart-card__top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.analytics-chart-card__eyebrow {
  margin: 0 0 6px;
  color: #64748b;
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.analytics-chart-card__title {
  margin: 0;
  color: #0f172a;
  font-size: 1rem;
  font-weight: 800;
  letter-spacing: -0.02em;
}

.analytics-chart-card__legend {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: #475569;
  font-size: 0.82rem;
  font-weight: 600;
}

.analytics-chart-card__legend-dot {
  width: 10px;
  height: 10px;
  border-radius: 999px;
  flex-shrink: 0;
  background: #2563eb;
  box-shadow: 0 0 0 4px rgba(37, 99, 235, 0.12);
}

.analytics-line-chart {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.analytics-line-chart__axis {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: wrap;
}

.analytics-line-chart__axis-label {
  color: #64748b;
  font-size: 0.72rem;
  font-weight: 700;
}

.analytics-line-chart__surface {
  width: 100%;
  min-height: 220px;
}

.analytics-line-chart__svg {
  display: block;
  width: 100%;
  height: 220px;
  overflow: visible;
}

.analytics-line-chart__guide {
  stroke: rgba(148, 163, 184, 0.6);
  stroke-width: 0.7;
  stroke-dasharray: 4 4;
}

.analytics-line-chart__area {
  fill: rgba(37, 99, 235, 0.12);
}

.analytics-line-chart__path {
  fill: none;
  stroke: #2563eb;
  stroke-width: 2.25;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.analytics-line-chart__point {
  fill: white;
  stroke: #2563eb;
  stroke-width: 1.8;
}

.analytics-line-chart__point--today {
  fill: #ecfeff;
  stroke: #059669;
}

.analytics-line-chart__labels {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 8px;
}

.analytics-line-chart__label {
  min-width: 0;
  text-align: center;
}

.analytics-line-chart__label-day,
.analytics-line-chart__label-value {
  display: block;
}

.analytics-line-chart__label-day {
  color: #0f172a;
  font-size: 0.76rem;
  font-weight: 700;
}

.analytics-line-chart__label-value {
  margin-top: 4px;
  color: #64748b;
  font-size: 0.72rem;
  line-height: 1.35;
}

.analytics-chart-card__footer {
  margin-top: 14px;
  color: #475569;
  font-size: 0.84rem;
  line-height: 1.55;
}

.analytics-list-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 12px;
  margin-top: 16px;
}

.analytics-list-card {
  border: 1px solid rgba(148, 163, 184, 0.18);
  background: linear-gradient(180deg, #ffffff 0%, #f8fbff 100%);
  border-radius: 20px;
  padding: 16px;
}

.analytics-list-card__header {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  font-size: 0.92rem;
  font-weight: 700;
  color: #0f172a;
}

.analytics-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 12px;
}

.analytics-list__item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 0;
  border-bottom: 1px solid rgba(226, 232, 240, 0.8);
}

.analytics-list__item:last-child {
  padding-bottom: 0;
  border-bottom: none;
}

.analytics-list__item strong,
.analytics-list__item span {
  display: block;
}

.analytics-list__item span {
  margin-top: 4px;
  color: #64748b;
  font-size: 0.8rem;
}

.analytics-empty-copy,
.analytics-empty-inline,
.analytics-empty-note {
  color: #64748b;
  line-height: 1.6;
}

.analytics-empty-note {
  margin-top: 14px;
}

.analytics-panel-skeleton,
.analytics-skeleton-card {
  border-radius: 24px;
  overflow: hidden;
}

@media (max-width: 960px) {
  .analytics-panel-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 767px) {
  .seller-analytics-main {
    padding-top: calc(
      var(--seller-app-bar-height) + var(--app-safe-area-top, env(safe-area-inset-top, 0px)) + 8px
    );
  }

  .analytics-focus-chips {
    flex-wrap: nowrap;
    overflow-x: auto;
    padding-bottom: 4px;
    scrollbar-width: none;
  }

  .analytics-focus-chips::-webkit-scrollbar {
    display: none;
  }

  .analytics-focus-chips :deep(.v-chip) {
    flex-shrink: 0;
  }

  .analytics-panel__header :deep(.v-btn) {
    width: 100%;
    justify-content: flex-start;
  }

  .analytics-line-chart__axis {
    align-items: flex-start;
  }

  .analytics-line-chart__surface {
    min-height: 190px;
  }

  .analytics-line-chart__svg {
    height: 190px;
  }

  .analytics-line-chart__labels {
    grid-template-columns: repeat(auto-fit, minmax(72px, 1fr));
    gap: 10px;
  }

  .analytics-overview-grid,
  .analytics-tile-grid,
  .analytics-list-grid {
    grid-template-columns: 1fr;
  }
}
</style>
