<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import PullToRefreshWrapper from '@/components/PullToRefreshWrapper.vue'
import AdminEmptyState from './components/AdminEmptyState.vue'
import AdminStatCard from './components/AdminStatCard.vue'
import {
  fetchAdminDashboardSnapshot,
  formatAdminCompactNumber,
  formatAdminCurrency,
  type AdminDashboardSnapshot,
} from './services/adminService'

const loading = ref(true)
const errorMessage = ref('')
const snapshot = ref<AdminDashboardSnapshot | null>(null)

const loadAnalytics = async () => {
  loading.value = true
  errorMessage.value = ''

  try {
    snapshot.value = await fetchAdminDashboardSnapshot()
  } catch (error: any) {
    console.error('Failed to load admin analytics:', error)
    errorMessage.value = error?.message || 'Unable to load admin analytics.'
  } finally {
    loading.value = false
  }
}

const revenueCards = computed(() => {
  const metrics = snapshot.value

  if (!metrics) return []

  return [
    {
      title: 'Platform Revenue',
      value: formatAdminCurrency(metrics.platformRevenue),
      caption: 'Current total from completed and paid orders',
      icon: 'mdi-cash-multiple',
      tone: 'success' as const,
    },
    {
      title: 'Shop Ads Revenue',
      value: formatAdminCurrency(metrics.shopAdsRevenue),
      caption: 'Preview placeholder for future ad placements',
      icon: 'mdi-bullhorn-outline',
      tone: 'primary' as const,
      badge: 'Preview only',
    },
    {
      title: 'Marketing Purchases Revenue',
      value: formatAdminCurrency(metrics.marketingPurchasesRevenue),
      caption: 'Preview placeholder for seller promotion packages',
      icon: 'mdi-rocket-launch-outline',
      tone: 'secondary' as const,
      badge: 'Preview only',
    },
  ]
})

const healthCards = computed(() => {
  const metrics = snapshot.value

  if (!metrics) return []

  return [
    {
      title: 'Total Orders',
      value: formatAdminCompactNumber(metrics.totalOrders),
      caption: 'All platform order records',
      icon: 'mdi-receipt-text-outline',
      tone: 'info' as const,
    },
    {
      title: 'Total Users',
      value: formatAdminCompactNumber(metrics.totalUsers),
      caption: 'Registered accounts',
      icon: 'mdi-account-group-outline',
      tone: 'primary' as const,
    },
    {
      title: 'Active Shops',
      value: formatAdminCompactNumber(metrics.activeShops),
      caption: `${formatAdminCompactNumber(metrics.pendingShopApprovals)} still in review`,
      icon: 'mdi-store-check-outline',
      tone: 'success' as const,
    },
    {
      title: 'Active Riders',
      value: formatAdminCompactNumber(metrics.activeRiders),
      caption: `${formatAdminCompactNumber(metrics.pendingRiderApprovals)} waiting approval`,
      icon: 'mdi-bike-fast',
      tone: 'warning' as const,
    },
  ]
})

onMounted(() => {
  loadAnalytics()
})
</script>

<template>
  <PullToRefreshWrapper :on-refresh="loadAnalytics">
    <div class="admin-page-stack">
      <v-alert v-if="errorMessage" type="error" rounded="xl">
        {{ errorMessage }}
      </v-alert>

      <template v-if="loading">
        <div class="admin-stats-grid">
          <v-skeleton-loader
            v-for="index in 4"
            :key="`admin-analytics-skeleton-${index}`"
            type="article"
            class="admin-skeleton-card"
          />
        </div>
      </template>

      <template v-else-if="!snapshot">
        <AdminEmptyState
          icon="mdi-chart-box-outline"
          title="No analytics available"
          description="Admin analytics will appear here once platform metrics are ready. Pull down to refresh when data is available."
        />
      </template>

      <template v-else>
        <section>
          <div class="admin-section-heading">
            <div>
              <p class="admin-section-heading__eyebrow">Monetization readiness</p>
              <h2 class="admin-section-heading__title">Revenue channels</h2>
            </div>
          </div>

          <div class="admin-stats-grid admin-stats-grid--three">
            <AdminStatCard
              v-for="card in revenueCards"
              :key="card.title"
              :title="card.title"
              :value="card.value"
              :caption="card.caption"
              :icon="card.icon"
              :tone="card.tone"
              :badge="card.badge"
            />
          </div>
        </section>

        <v-card class="admin-section-card" rounded="xl" variant="flat">
          <v-card-text class="pa-5">
            <p class="admin-section-card__eyebrow">Implementation note</p>
            <h3 class="admin-section-card__title">Prepared for future monetization</h3>
            <p class="admin-section-card__copy">
              Shop advertisement revenue and marketing purchases are intentionally shown as preview metrics for now.
              The cards and analytics structure are ready so real transactions can be connected later without another
              dashboard redesign.
            </p>
          </v-card-text>
        </v-card>

        <section>
          <div class="admin-section-heading">
            <div>
              <p class="admin-section-heading__eyebrow">Platform health</p>
              <h2 class="admin-section-heading__title">Core operating metrics</h2>
            </div>
          </div>

          <div class="admin-stats-grid">
            <AdminStatCard
              v-for="card in healthCards"
              :key="card.title"
              :title="card.title"
              :value="card.value"
              :caption="card.caption"
              :icon="card.icon"
              :tone="card.tone"
            />
          </div>
        </section>
      </template>
    </div>
  </PullToRefreshWrapper>
</template>

<style scoped>
.admin-page-stack {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.admin-section-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
  flex-wrap: wrap;
  margin-bottom: 14px;
}

.admin-section-heading__eyebrow,
.admin-section-card__eyebrow {
  margin: 0 0 6px;
  color: #64748b;
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.admin-section-heading__title,
.admin-section-card__title {
  margin: 0;
  color: #0f172a;
  font-weight: 800;
  letter-spacing: -0.03em;
}

.admin-section-heading__title {
  font-size: clamp(1.12rem, 2.2vw, 1.46rem);
}

.admin-stats-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 14px;
}

.admin-stats-grid--three {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.admin-section-card {
  border: 1px solid rgba(148, 163, 184, 0.14);
  background: rgba(255, 255, 255, 0.96);
  box-shadow: 0 14px 30px rgba(15, 23, 42, 0.08);
}

.admin-section-card__copy {
  margin: 10px 0 0;
  color: #64748b;
  line-height: 1.65;
}

.admin-skeleton-card {
  border-radius: 24px;
  overflow: hidden;
}

@media (max-width: 1100px) {
  .admin-stats-grid,
  .admin-stats-grid--three {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 640px) {
  .admin-page-stack {
    gap: 16px;
  }

  .admin-stats-grid,
  .admin-stats-grid--three {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 420px) {
  .admin-stats-grid,
  .admin-stats-grid--three {
    grid-template-columns: 1fr;
  }
}
</style>
