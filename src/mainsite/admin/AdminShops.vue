<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import PullToRefreshWrapper from '@/components/PullToRefreshWrapper.vue'
import AdminEmptyState from './components/AdminEmptyState.vue'
import AdminPreviewDialog from './components/AdminPreviewDialog.vue'
import {
  fetchAdminShops,
  formatAdminDateTime,
  getAdminStoragePublicUrl,
  getShopAddress,
  getShopIdStatus,
  getShopOwnerEmail,
  getShopOwnerName,
  getShopOwnerPhone,
  setAdminShopStatus,
  type AdminShopRecord,
  type AdminShopStatus,
} from './services/adminService'

const router = useRouter()
const route = useRoute()

const SHOP_FILTERS = ['all', 'pending', 'approved', 'declined'] as const
type ShopFilter = (typeof SHOP_FILTERS)[number]

const normalizeShopFilter = (value: unknown): ShopFilter =>
  typeof value === 'string' && SHOP_FILTERS.includes(value as ShopFilter)
    ? (value as ShopFilter)
    : 'all'

const loading = ref(true)
const errorMessage = ref('')
const searchTerm = ref('')
const shops = ref<AdminShopRecord[]>([])
const selectedShop = ref<AdminShopRecord | null>(null)
const detailDialog = ref(false)
const previewDialog = ref(false)
const previewTitle = ref('')
const previewSource = ref<string | null>(null)
const busyShopId = ref<string | null>(null)

const activeFilter = computed<ShopFilter>(() => normalizeShopFilter(route.query.status))

const loadShops = async () => {
  loading.value = true
  errorMessage.value = ''

  try {
    shops.value = await fetchAdminShops()

    if (selectedShop.value) {
      const freshShop = shops.value.find((shop) => shop.id === selectedShop.value?.id)
      if (freshShop) {
        selectedShop.value = freshShop
      }
    }
  } catch (error: any) {
    console.error('Failed to load admin shops:', error)
    errorMessage.value = error?.message || 'Unable to load shops right now.'
  } finally {
    loading.value = false
  }
}

const shopCounts = computed(() =>
  shops.value.reduce(
    (summary, shop) => {
      const status = String(shop.status || 'pending')

      summary.all += 1

      if (status === 'approved') summary.approved += 1
      else if (status === 'declined') summary.declined += 1
      else summary.pending += 1

      return summary
    },
    {
      all: 0,
      pending: 0,
      approved: 0,
      declined: 0,
    },
  ),
)

const filteredShops = computed(() => {
  const query = searchTerm.value.trim().toLowerCase()

  return shops.value.filter((shop) => {
    const shopStatus = String(shop.status || 'pending')
    const matchesFilter = activeFilter.value === 'all' || shopStatus === activeFilter.value

    if (!matchesFilter) {
      return false
    }

    if (!query) {
      return true
    }

    const haystack = [
      shop.business_name,
      getShopOwnerName(shop),
      getShopOwnerEmail(shop),
      getShopAddress(shop),
      shop.description,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()

    return haystack.includes(query)
  })
})

const filterCards = computed(() => [
  {
    key: 'all' as ShopFilter,
    label: 'All Shops',
    value: shopCounts.value.all,
  },
  {
    key: 'pending' as ShopFilter,
    label: 'Pending',
    value: shopCounts.value.pending,
  },
  {
    key: 'approved' as ShopFilter,
    label: 'Approved',
    value: shopCounts.value.approved,
  },
  {
    key: 'declined' as ShopFilter,
    label: 'Suspended / Rejected',
    value: shopCounts.value.declined,
  },
])

const setFilter = (filter: ShopFilter) => {
  router.replace({
    name: 'admin-shops',
    query: filter === 'all' ? {} : { status: filter },
  })
}

const openShopDetails = (shop: AdminShopRecord) => {
  selectedShop.value = shop
  detailDialog.value = true
}

const previewShopDocument = (path: string | null | undefined, title: string) => {
  const source = getAdminStoragePublicUrl(path || null, 'shop_documents')

  if (!source) {
    return
  }

  previewTitle.value = title
  previewSource.value = source
  previewDialog.value = true
}

const getShopStatusMeta = (status: string | null | undefined) => {
  switch (status) {
    case 'approved':
      return {
        label: 'Approved',
        color: 'success',
        icon: 'mdi-check-decagram',
      }
    case 'declined':
      return {
        label: 'Suspended',
        color: 'error',
        icon: 'mdi-close-circle-outline',
      }
    default:
      return {
        label: 'Pending review',
        color: 'warning',
        icon: 'mdi-clock-outline',
      }
  }
}

const getPrimaryAction = (shop: AdminShopRecord) => {
  const status = String(shop.status || 'pending')

  if (status === 'approved') {
    return {
      label: 'Suspend Shop',
      color: 'error',
      nextStatus: 'declined' as AdminShopStatus,
      disabled: false,
    }
  }

  if (status === 'declined') {
    return {
      label: 'Restore Shop',
      color: 'success',
      nextStatus: 'approved' as AdminShopStatus,
      disabled: false,
    }
  }

  return {
    label: 'Approve Shop',
    color: 'success',
    nextStatus: 'approved' as AdminShopStatus,
    disabled: !getShopIdStatus(shop).canApprove,
  }
}

const getSecondaryAction = (shop: AdminShopRecord) => {
  const status = String(shop.status || 'pending')

  if (status === 'pending') {
    return {
      label: 'Reject Shop',
      color: 'error',
      nextStatus: 'declined' as AdminShopStatus,
    }
  }

  return null
}

const updateShop = async (shop: AdminShopRecord, nextStatus: AdminShopStatus) => {
  const actionLabel =
    nextStatus === 'approved'
      ? String(shop.status) === 'declined'
        ? 'restore'
        : 'approve'
      : String(shop.status) === 'pending'
        ? 'reject'
        : 'suspend'

  if (!confirm(`Are you sure you want to ${actionLabel} ${shop.business_name || 'this shop'}?`)) {
    return
  }

  busyShopId.value = shop.id
  errorMessage.value = ''

  try {
    await setAdminShopStatus(shop.id, nextStatus)
    await loadShops()
  } catch (error: any) {
    console.error('Failed to update shop status:', error)
    errorMessage.value = error?.message || 'Unable to update the selected shop.'
  } finally {
    busyShopId.value = null
  }
}

watch(
  () => route.query.status,
  (value) => {
    const normalized = normalizeShopFilter(value)
    const current = typeof value === 'string' ? value : 'all'

    if (current === normalized) {
      return
    }

    router.replace({
      name: 'admin-shops',
      query: normalized === 'all' ? {} : { status: normalized },
    })
  },
  { immediate: true },
)

onMounted(() => {
  loadShops()
})
</script>

<template>
  <PullToRefreshWrapper :on-refresh="loadShops">
    <div class="admin-page-stack">
    <v-alert v-if="errorMessage" type="error" rounded="xl">
      {{ errorMessage }}
    </v-alert>
    
      <v-card class="admin-toolbar-card" rounded="xl" variant="flat">
      <v-card-text class="pa-4 pa-sm-5">
        <div class="admin-toolbar">
          <div>
            <p class="admin-toolbar__eyebrow">Shop moderation</p>
            <h2 class="admin-toolbar__title">Shops management</h2>
            <p class="admin-toolbar__hint">Pull down to refresh the latest shop applications.</p>
          </div>
        </div>

        <div class="admin-toolbar__search-row">
          <v-text-field
            v-model="searchTerm"
            label="Search shops, owners, or address"
            variant="solo-filled"
            density="comfortable"
            rounded="xl"
            hide-details
            prepend-inner-icon="mdi-magnify"
            class="admin-search-field"
          />
        </div>

        <div class="admin-filter-chip-row">
          <v-chip
            v-for="card in filterCards"
            :key="card.key"
            :color="activeFilter === card.key ? 'primary' : undefined"
            :variant="activeFilter === card.key ? 'flat' : 'outlined'"
            rounded="lg"
            @click="setFilter(card.key)"
          >
            {{ card.label }} ({{ card.value }})
          </v-chip>
        </div>
      </v-card-text>
      </v-card>

    <template v-if="loading">
      <div class="admin-record-grid">
        <v-skeleton-loader
          v-for="index in 4"
          :key="`shop-skeleton-${index}`"
          type="article"
          class="admin-record-skeleton"
        />
      </div>
    </template>

    <template v-else-if="filteredShops.length === 0">
      <AdminEmptyState
        icon="mdi-storefront-outline"
        title="No matching shops found"
        description="Try another status filter or search keyword, or pull down to refresh shop records."
      />
    </template>

    <template v-else>
      <div class="admin-record-grid">
        <v-card
          v-for="shop in filteredShops"
          :key="shop.id"
          class="admin-record-card"
          rounded="xl"
          variant="flat"
        >
          <v-card-text class="pa-4 pa-sm-5">
            <div class="admin-record-card__top">
              <div class="admin-record-card__copy">
                <p class="admin-record-card__eyebrow">Shop record</p>
                <h3 class="admin-record-card__title">{{ shop.business_name || 'Unnamed shop' }}</h3>
                <p class="admin-record-card__subtitle">
                  {{ getShopOwnerName(shop) }} · {{ formatAdminDateTime(shop.created_at) }}
                </p>
              </div>

              <div class="admin-record-card__chips">
                <v-chip
                  :color="getShopStatusMeta(String(shop.status)).color"
                  variant="flat"
                  size="small"
                >
                  <v-icon start size="16">{{ getShopStatusMeta(String(shop.status)).icon }}</v-icon>
                  {{ getShopStatusMeta(String(shop.status)).label }}
                </v-chip>
                <v-chip :color="getShopIdStatus(shop).color" variant="tonal" size="small">
                  <v-icon start size="16">{{ getShopIdStatus(shop).icon }}</v-icon>
                  {{ getShopIdStatus(shop).text }}
                </v-chip>
              </div>
            </div>

            <div class="admin-record-meta-grid">
              <div class="admin-record-meta">
                <span>Owner Email</span>
                <strong>{{ getShopOwnerEmail(shop) }}</strong>
              </div>
              <div class="admin-record-meta">
                <span>Owner Phone</span>
                <strong>{{ getShopOwnerPhone(shop) }}</strong>
              </div>
              <div class="admin-record-meta">
                <span>Location</span>
                <strong>{{ getShopAddress(shop) }}</strong>
              </div>
              <div class="admin-record-meta">
                <span>Review Status</span>
                <strong>{{ getShopIdStatus(shop).description }}</strong>
              </div>
            </div>

            <div class="admin-record-actions">
              <v-btn variant="outlined" rounded="lg" @click="openShopDetails(shop)">
                <v-icon start>mdi-eye-outline</v-icon>
                View Details
              </v-btn>

              <v-spacer />

              <v-btn
                v-if="getSecondaryAction(shop)"
                :color="getSecondaryAction(shop)?.color"
                variant="outlined"
                rounded="lg"
                :loading="busyShopId === shop.id"
                @click="updateShop(shop, getSecondaryAction(shop)!.nextStatus)"
              >
                {{ getSecondaryAction(shop)?.label }}
              </v-btn>

              <v-btn
                :color="getPrimaryAction(shop).color"
                variant="flat"
                rounded="lg"
                :disabled="getPrimaryAction(shop).disabled"
                :loading="busyShopId === shop.id"
                @click="updateShop(shop, getPrimaryAction(shop).nextStatus)"
              >
                {{ getPrimaryAction(shop).label }}
              </v-btn>
            </div>
          </v-card-text>
        </v-card>
      </div>
    </template>

    <v-dialog v-model="detailDialog" max-width="980">
      <v-card v-if="selectedShop" rounded="xl">
        <v-card-title class="d-flex align-center px-5 py-4">
          <div>
            <div class="text-overline text-medium-emphasis">Shop details</div>
            <div class="text-h6 font-weight-bold">{{ selectedShop.business_name }}</div>
          </div>
          <v-spacer />
          <v-chip
            :color="getShopStatusMeta(String(selectedShop.status)).color"
            variant="flat"
            size="small"
            class="mr-3"
          >
            {{ getShopStatusMeta(String(selectedShop.status)).label }}
          </v-chip>
          <v-btn icon size="small" @click="detailDialog = false">
            <v-icon>mdi-close</v-icon>
          </v-btn>
        </v-card-title>

        <v-divider />

        <v-card-text class="pa-5">
          <div class="admin-detail-grid">
            <div class="admin-detail-section">
              <h4>Business information</h4>
              <div class="admin-detail-row">
                <span>Business Name</span>
                <strong>{{ selectedShop.business_name || 'Not provided' }}</strong>
              </div>
              <div class="admin-detail-row">
                <span>Description</span>
                <strong>{{ selectedShop.description || 'No description provided' }}</strong>
              </div>
              <div class="admin-detail-row">
                <span>Applied</span>
                <strong>{{ formatAdminDateTime(selectedShop.created_at) }}</strong>
              </div>
              <div class="admin-detail-row">
                <span>Updated</span>
                <strong>{{ formatAdminDateTime(selectedShop.updated_at) }}</strong>
              </div>
            </div>

            <div class="admin-detail-section">
              <h4>Owner information</h4>
              <div class="admin-detail-row">
                <span>Owner</span>
                <strong>{{ getShopOwnerName(selectedShop) }}</strong>
              </div>
              <div class="admin-detail-row">
                <span>Email</span>
                <strong>{{ getShopOwnerEmail(selectedShop) }}</strong>
              </div>
              <div class="admin-detail-row">
                <span>Phone</span>
                <strong>{{ getShopOwnerPhone(selectedShop) }}</strong>
              </div>
              <div class="admin-detail-row">
                <span>Owner ID</span>
                <strong>{{ selectedShop.owner_id }}</strong>
              </div>
            </div>

            <div class="admin-detail-section">
              <h4>Address and schedule</h4>
              <div class="admin-detail-row">
                <span>Address</span>
                <strong>{{ getShopAddress(selectedShop) }}</strong>
              </div>
              <div class="admin-detail-row">
                <span>Open Time</span>
                <strong>{{ selectedShop.open_time || 'Not set' }}</strong>
              </div>
              <div class="admin-detail-row">
                <span>Close Time</span>
                <strong>{{ selectedShop.close_time || 'Not set' }}</strong>
              </div>
              <div class="admin-detail-row">
                <span>Open Days</span>
                <strong>{{
                  Array.isArray(selectedShop.open_days) && selectedShop.open_days.length
                    ? selectedShop.open_days.join(', ')
                    : 'Default schedule'
                }}</strong>
              </div>
            </div>

            <div class="admin-detail-section">
              <h4>Verification documents</h4>
              <p class="admin-detail-copy">{{ getShopIdStatus(selectedShop).description }}</p>
              <div class="admin-document-actions">
                <v-btn
                  v-if="selectedShop.valid_id_front"
                  color="primary"
                  variant="outlined"
                  rounded="lg"
                  @click="previewShopDocument(selectedShop.valid_id_front, 'Front Valid ID')"
                >
                  <v-icon start>mdi-card-account-details-outline</v-icon>
                  View Front ID
                </v-btn>
                <v-btn
                  v-if="selectedShop.valid_id_back"
                  color="primary"
                  variant="outlined"
                  rounded="lg"
                  @click="previewShopDocument(selectedShop.valid_id_back, 'Back Valid ID')"
                >
                  <v-icon start>mdi-card-bulleted-outline</v-icon>
                  View Back ID
                </v-btn>
              </div>
            </div>
          </div>
        </v-card-text>

        <v-divider />

        <v-card-actions class="px-5 pb-5 pt-4">
          <v-btn variant="outlined" rounded="lg" @click="detailDialog = false">
            Close
          </v-btn>
          <v-spacer />

          <v-btn
            v-if="getSecondaryAction(selectedShop)"
            :color="getSecondaryAction(selectedShop)?.color"
            variant="outlined"
            rounded="lg"
            :loading="busyShopId === selectedShop.id"
            @click="updateShop(selectedShop, getSecondaryAction(selectedShop)!.nextStatus)"
          >
            {{ getSecondaryAction(selectedShop)?.label }}
          </v-btn>

          <v-btn
            :color="getPrimaryAction(selectedShop).color"
            variant="flat"
            rounded="lg"
            :disabled="getPrimaryAction(selectedShop).disabled"
            :loading="busyShopId === selectedShop.id"
            @click="updateShop(selectedShop, getPrimaryAction(selectedShop).nextStatus)"
          >
            {{ getPrimaryAction(selectedShop).label }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <AdminPreviewDialog
      v-model="previewDialog"
      :title="previewTitle"
      :source="previewSource"
    />
    </div>
  </PullToRefreshWrapper>
</template>

<style scoped>
.admin-page-stack {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.admin-summary-card {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
  padding: 16px 18px;
  border-radius: 20px;
  border: 1px solid rgba(148, 163, 184, 0.14);
  background: rgba(255, 255, 255, 0.96);
  box-shadow: 0 12px 28px rgba(15, 23, 42, 0.08);
  color: #0f172a;
  text-align: left;
  cursor: pointer;
  transition:
    transform 0.2s ease,
    border-color 0.2s ease,
    box-shadow 0.2s ease;
}

.admin-summary-card:hover,
.admin-summary-card--active {
  transform: translateY(-1px);
  border-color: rgba(37, 99, 235, 0.24);
  box-shadow: 0 16px 32px rgba(37, 99, 235, 0.1);
}

.admin-summary-card span {
  color: #64748b;
  font-size: 0.84rem;
}

.admin-summary-card strong {
  font-size: 1.34rem;
  font-weight: 800;
  letter-spacing: -0.03em;
}

.admin-toolbar-card,
.admin-record-card {
  border: 1px solid rgba(148, 163, 184, 0.14);
  background: rgba(255, 255, 255, 0.96);
  box-shadow: 0 14px 30px rgba(15, 23, 42, 0.08);
}

.admin-toolbar {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}

.admin-toolbar__eyebrow {
  margin: 0 0 6px;
  color: #64748b;
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.admin-toolbar__title {
  margin: 0;
  color: #0f172a;
  font-size: clamp(1.12rem, 2.2vw, 1.46rem);
  font-weight: 800;
  letter-spacing: -0.03em;
}

.admin-toolbar__hint {
  margin: 8px 0 0;
  color: #64748b;
  line-height: 1.5;
}

.admin-toolbar__search-row {
  margin-top: 16px;
}

.admin-search-field {
  max-width: 620px;
}

.admin-filter-chip-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 14px;
}

.admin-record-grid {
  display: grid;
  gap: 14px;
}

.admin-record-card__top,
.admin-record-actions {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
  flex-wrap: wrap;
}

.admin-record-card__eyebrow {
  margin: 0 0 6px;
  color: #64748b;
  font-size: 0.74rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.admin-record-card__title {
  margin: 0;
  color: #0f172a;
  font-size: 1.08rem;
  font-weight: 800;
}

.admin-record-card__subtitle {
  margin: 8px 0 0;
  color: #64748b;
  line-height: 1.5;
}

.admin-record-card__chips {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.admin-record-meta-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  margin-top: 16px;
}

.admin-record-meta {
  padding: 14px;
  border-radius: 18px;
  border: 1px solid rgba(191, 219, 254, 0.42);
  background: linear-gradient(180deg, #ffffff 0%, #f8fbff 100%);
}

.admin-record-meta span,
.admin-record-meta strong {
  display: block;
}

.admin-record-meta span {
  color: #64748b;
  font-size: 0.78rem;
  margin-bottom: 6px;
}

.admin-record-meta strong {
  color: #0f172a;
  line-height: 1.5;
  word-break: break-word;
}

.admin-record-actions {
  margin-top: 18px;
}

.admin-detail-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.admin-detail-section {
  padding: 16px;
  border-radius: 20px;
  border: 1px solid rgba(148, 163, 184, 0.14);
  background: linear-gradient(180deg, #ffffff 0%, #f8fbff 100%);
}

.admin-detail-section h4 {
  margin: 0 0 14px;
  color: #2563eb;
  font-size: 0.96rem;
  font-weight: 800;
}

.admin-detail-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 12px;
}

.admin-detail-row:last-child {
  margin-bottom: 0;
}

.admin-detail-row span {
  color: #64748b;
  font-size: 0.78rem;
}

.admin-detail-row strong {
  color: #0f172a;
  line-height: 1.55;
  word-break: break-word;
}

.admin-detail-copy {
  margin: 0;
  color: #64748b;
  line-height: 1.6;
}

.admin-document-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 16px;
}

.admin-record-skeleton {
  border-radius: 24px;
  overflow: hidden;
}

@media (max-width: 760px) {
  .admin-page-stack {
    gap: 14px;
  }

  .admin-record-meta-grid,
  .admin-detail-grid {
    grid-template-columns: 1fr;
  }

  .admin-record-actions {
    align-items: stretch;
  }

  .admin-record-actions :deep(.v-btn) {
    width: 100%;
  }
}

@media (max-width: 600px) {
  .admin-toolbar {
    gap: 12px;
  }

  .admin-record-card__top {
    gap: 12px;
  }

  .admin-record-card__chips {
    width: 100%;
  }

  .admin-record-meta {
    padding: 12px;
  }

  .admin-filter-chip-row {
    flex-wrap: nowrap;
    overflow-x: auto;
    padding-bottom: 4px;
    scrollbar-width: none;
  }

  .admin-filter-chip-row::-webkit-scrollbar {
    display: none;
  }

  .admin-filter-chip-row :deep(.v-chip) {
    flex-shrink: 0;
  }
}
</style>
