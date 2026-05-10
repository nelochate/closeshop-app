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

const loadOverview = async () => {
  loading.value = true
  errorMessage.value = ''

  try {
    snapshot.value = await fetchAdminDashboardSnapshot()
  } catch (error: any) {
    console.error('Failed to load admin overview:', error)
    errorMessage.value = error?.message || 'Unable to load admin dashboard metrics.'
  } finally {
    loading.value = false
  }
}

const statCards = computed(() => {
  const metrics = snapshot.value

  if (!metrics) return []

  return [
    {
      title: 'Total Shops',
      value: formatAdminCompactNumber(metrics.totalShops),
      caption: `${formatAdminCompactNumber(metrics.declinedShops)} declined or suspended`,
      icon: 'mdi-storefront-outline',
      tone: 'primary' as const,
      to: { name: 'admin-shops' },
    },
    {
      title: 'Active Shops',
      value: formatAdminCompactNumber(metrics.activeShops),
      caption: 'Currently approved to operate',
      icon: 'mdi-store-check-outline',
      tone: 'success' as const,
      to: { name: 'admin-shops', query: { status: 'approved' } },
    },
    {
      title: 'Pending Shop Approvals',
      value: formatAdminCompactNumber(metrics.pendingShopApprovals),
      caption: 'Waiting for admin review',
      icon: 'mdi-store-clock-outline',
      tone: 'warning' as const,
      to: { name: 'admin-shops', query: { status: 'pending' } },
    },
    {
      title: 'Total Riders',
      value: formatAdminCompactNumber(metrics.totalRiders),
      caption: `${formatAdminCompactNumber(metrics.rejectedRiders)} rejected records`,
      icon: 'mdi-bike-fast',
      tone: 'info' as const,
      to: { name: 'admin-riders' },
    },
    {
      title: 'Active Riders',
      value: formatAdminCompactNumber(metrics.activeRiders),
      caption: 'Approved rider accounts',
      icon: 'mdi-bike',
      tone: 'success' as const,
      to: { name: 'admin-riders', query: { status: 'approved' } },
    },
    {
      title: 'Pending Rider Approvals',
      value: formatAdminCompactNumber(metrics.pendingRiderApprovals),
      caption: 'Applications to review',
      icon: 'mdi-progress-clock',
      tone: 'warning' as const,
      to: { name: 'admin-riders', query: { status: 'pending' } },
    },
    {
      title: 'Total Users',
      value: formatAdminCompactNumber(metrics.totalUsers),
      caption: 'Registered user profiles',
      icon: 'mdi-account-group-outline',
      tone: 'secondary' as const,
    },
    {
      title: 'Total Orders',
      value: formatAdminCompactNumber(metrics.totalOrders),
      caption: 'Platform-wide order records',
      icon: 'mdi-receipt-text-outline',
      tone: 'info' as const,
    },
    {
      title: 'Platform Revenue',
      value: formatAdminCurrency(metrics.platformRevenue),
      caption: 'Completed and paid order revenue',
      icon: 'mdi-cash-multiple',
      tone: 'success' as const,
      to: { name: 'admin-analytics' },
    },
    {
      title: 'Shop Ads Revenue',
      value: formatAdminCurrency(metrics.shopAdsRevenue),
      caption: 'Prepared as a monetization preview',
      icon: 'mdi-bullhorn-outline',
      tone: 'primary' as const,
      to: { name: 'admin-analytics' },
      badge: 'Preview',
    },
    {
      title: 'Marketing Purchases Revenue',
      value: formatAdminCurrency(metrics.marketingPurchasesRevenue),
      caption: 'Prepared for future productization',
      icon: 'mdi-rocket-launch-outline',
      tone: 'secondary' as const,
      to: { name: 'admin-analytics' },
      badge: 'Preview',
    },
  ]
})

const approvalQueue = computed(() => {
  const metrics = snapshot.value

  if (!metrics) return []

  return [
    {
      label: 'Shop approvals waiting',
      value: formatAdminCompactNumber(metrics.pendingShopApprovals),
      tone: 'warning',
      to: { name: 'admin-shops', query: { status: 'pending' } },
    },
    {
      label: 'Rider approvals waiting',
      value: formatAdminCompactNumber(metrics.pendingRiderApprovals),
      tone: 'warning',
      to: { name: 'admin-riders', query: { status: 'pending' } },
    },
    {
      label: 'Live shops on platform',
      value: formatAdminCompactNumber(metrics.activeShops),
      tone: 'success',
      to: { name: 'admin-shops', query: { status: 'approved' } },
    },
    {
      label: 'Approved riders available',
      value: formatAdminCompactNumber(metrics.activeRiders),
      tone: 'info',
      to: { name: 'admin-riders', query: { status: 'approved' } },
    },
  ]
})

const managementShortcuts = [
  {
    title: 'Shops Management',
    description: 'Review applications, inspect shop details, and suspend or restore businesses.',
    icon: 'mdi-storefront-outline',
    color: 'primary',
    to: { name: 'admin-shops' },
  },
  {
    title: 'Riders Management',
    description: 'Moderate rider applications, documents, and activation status from one queue.',
    icon: 'mdi-bike-fast',
    color: 'info',
    to: { name: 'admin-riders' },
  },
  {
    title: 'Admin Analytics',
    description: 'Track core platform metrics and preview monetization channels for future rollout.',
    icon: 'mdi-chart-box-outline',
    color: 'secondary',
    to: { name: 'admin-analytics' },
  },
]

onMounted(() => {
  loadOverview()
})
</script>

<template>
  <PullToRefreshWrapper :on-refresh="loadOverview">
    <div class="admin-page-stack">
      <v-alert v-if="errorMessage" type="error" rounded="xl" class="mb-4">
        {{ errorMessage }}
      </v-alert>

      <template v-if="loading">
        <div class="admin-overview-grid">
          <v-skeleton-loader
            v-for="index in 6"
            :key="`admin-overview-skeleton-${index}`"
            type="article"
            class="admin-skeleton-card"
          />
        </div>
      </template>

      <template v-else-if="!snapshot">
        <AdminEmptyState
          icon="mdi-chart-box-outline"
          title="No dashboard data yet"
          description="The admin overview will appear here after platform metrics are available. Pull down to refresh when you are ready."
        />
      </template>

      <template v-else>
        <section>
          <div class="admin-section-heading">
            <div>
              <p class="admin-section-heading__eyebrow">Platform overview</p>
              <h2 class="admin-section-heading__title">Key admin metrics</h2>
            </div>
          </div>

          <div class="admin-overview-grid">
            <AdminStatCard
              v-for="card in statCards"
              :key="card.title"
              :title="card.title"
              :value="card.value"
              :caption="card.caption"
              :icon="card.icon"
              :tone="card.tone"
              :to="card.to"
              :badge="card.badge"
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
  gap: 22px;
}

.admin-section-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
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
  font-size: clamp(1.18rem, 2.3vw, 1.58rem);
}

.admin-overview-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 14px;
}

.admin-section-card {
  border: 1px solid rgba(148, 163, 184, 0.14);
  background: rgba(255, 255, 255, 0.96);
  box-shadow: 0 14px 30px rgba(15, 23, 42, 0.08);
}

.admin-section-card__copy {
  margin: 10px 0 0;
  color: #64748b;
  line-height: 1.6;
}

.admin-queue-list,
.admin-shortcut-list {
  display: grid;
  gap: 12px;
  margin-top: 18px;
}

.admin-queue-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 14px 16px;
  border-radius: 18px;
  border: 1px solid rgba(191, 219, 254, 0.46);
  background: linear-gradient(180deg, #ffffff 0%, #f8fbff 100%);
  color: #0f172a;
  cursor: pointer;
  transition:
    transform 0.2s ease,
    box-shadow 0.2s ease,
    border-color 0.2s ease;
}

.admin-queue-item:hover {
  transform: translateY(-1px);
  border-color: rgba(37, 99, 235, 0.24);
  box-shadow: 0 14px 24px rgba(37, 99, 235, 0.08);
}

.admin-queue-item span {
  color: #475569;
  text-align: left;
}

.admin-queue-item strong {
  color: #0f172a;
  font-size: 1rem;
  font-weight: 800;
}

.admin-shortcut-btn {
  width: 100%;
  min-height: 88px;
  text-transform: none;
}

.admin-shortcut-btn :deep(.v-btn__content) {
  width: 100%;
}

.admin-shortcut-btn__content {
  width: 100%;
  display: flex;
  align-items: flex-start;
  gap: 14px;
  text-align: left;
}

.admin-shortcut-btn__icon {
  width: 42px;
  height: 42px;
  border-radius: 16px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.72);
  flex-shrink: 0;
}

.admin-shortcut-btn__copy {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.admin-shortcut-btn__copy strong {
  color: #0f172a;
  font-size: 0.94rem;
}

.admin-shortcut-btn__copy span {
  color: #475569;
  font-size: 0.82rem;
  line-height: 1.45;
  white-space: normal;
}

.admin-shortcut-btn__chevron {
  color: #64748b;
  margin-left: auto;
}

.admin-skeleton-card {
  border-radius: 24px;
  overflow: hidden;
}

@media (max-width: 1180px) {
  .admin-overview-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@media (max-width: 960px) {
  .admin-overview-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 640px) {
  .admin-page-stack {
    gap: 16px;
  }

  .admin-overview-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
  }

  .admin-section-heading {
    margin-bottom: 12px;
  }

  .admin-queue-item {
    padding: 13px 14px;
  }

  .admin-shortcut-btn {
    min-height: 98px;
  }
}

@media (max-width: 420px) {
  .admin-overview-grid {
    grid-template-columns: 1fr;
  }
}
</style>
