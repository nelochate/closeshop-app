<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import PullToRefreshWrapper from '@/components/PullToRefreshWrapper.vue'
import AdminEmptyState from './components/AdminEmptyState.vue'
import AdminPreviewDialog from './components/AdminPreviewDialog.vue'
import {
  fetchAdminRiders,
  formatAdminDate,
  formatAdminDateTime,
  getAdminStoragePublicUrl,
  getRiderDocumentStatus,
  getRiderFullName,
  setAdminRiderStatus,
  type AdminRiderRecord,
  type AdminRiderStatus,
} from './services/adminService'

const router = useRouter()
const route = useRoute()

const RIDER_FILTERS = ['all', 'pending', 'approved', 'rejected'] as const
type RiderFilter = (typeof RIDER_FILTERS)[number]

const normalizeRiderFilter = (value: unknown): RiderFilter =>
  typeof value === 'string' && RIDER_FILTERS.includes(value as RiderFilter)
    ? (value as RiderFilter)
    : 'all'

const loading = ref(true)
const errorMessage = ref('')
const searchTerm = ref('')
const riders = ref<AdminRiderRecord[]>([])
const selectedRider = ref<AdminRiderRecord | null>(null)
const detailDialog = ref(false)
const previewDialog = ref(false)
const previewTitle = ref('')
const previewSource = ref<string | null>(null)
const busyRiderId = ref<string | number | null>(null)

const activeFilter = computed<RiderFilter>(() => normalizeRiderFilter(route.query.status))

const getRiderEmail = (rider: AdminRiderRecord) =>
  rider.email || rider.profiles?.email || 'No email provided'

const getRiderPhone = (rider: AdminRiderRecord) =>
  rider.phone || rider.profiles?.phone || 'No phone provided'

const loadRiders = async () => {
  loading.value = true
  errorMessage.value = ''

  try {
    riders.value = await fetchAdminRiders()

    if (selectedRider.value) {
      const freshRider = riders.value.find((rider) => rider.rider_id === selectedRider.value?.rider_id)
      if (freshRider) {
        selectedRider.value = freshRider
      }
    }
  } catch (error: any) {
    console.error('Failed to load admin riders:', error)
    errorMessage.value = error?.message || 'Unable to load rider applications right now.'
  } finally {
    loading.value = false
  }
}

const riderCounts = computed(() =>
  riders.value.reduce(
    (summary, rider) => {
      const status = String(rider.status || 'pending')

      summary.all += 1

      if (status === 'approved') summary.approved += 1
      else if (status === 'rejected') summary.rejected += 1
      else summary.pending += 1

      return summary
    },
    {
      all: 0,
      pending: 0,
      approved: 0,
      rejected: 0,
    },
  ),
)

const filteredRiders = computed(() => {
  const query = searchTerm.value.trim().toLowerCase()

  return riders.value.filter((rider) => {
    const riderStatus = String(rider.status || 'pending')
    const matchesFilter = activeFilter.value === 'all' || riderStatus === activeFilter.value

    if (!matchesFilter) {
      return false
    }

    if (!query) {
      return true
    }

    const haystack = [
      getRiderFullName(rider),
      getRiderEmail(rider),
      getRiderPhone(rider),
      rider.vehicle_type,
      rider.vehicle_brand,
      rider.vehicle_model,
      rider.vehicle_plate,
      rider.city,
      rider.province,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()

    return haystack.includes(query)
  })
})

const filterCards = computed(() => [
  {
    key: 'all' as RiderFilter,
    label: 'All Riders',
    value: riderCounts.value.all,
  },
  {
    key: 'pending' as RiderFilter,
    label: 'Pending',
    value: riderCounts.value.pending,
  },
  {
    key: 'approved' as RiderFilter,
    label: 'Approved',
    value: riderCounts.value.approved,
  },
  {
    key: 'rejected' as RiderFilter,
    label: 'Rejected',
    value: riderCounts.value.rejected,
  },
])

const setFilter = (filter: RiderFilter) => {
  router.replace({
    name: 'admin-riders',
    query: filter === 'all' ? {} : { status: filter },
  })
}

const openRiderDetails = (rider: AdminRiderRecord) => {
  selectedRider.value = rider
  detailDialog.value = true
}

const previewRiderDocument = (path: string | null | undefined, title: string) => {
  const source = getAdminStoragePublicUrl(path || null, 'rider_info')

  if (!source) {
    return
  }

  previewTitle.value = title
  previewSource.value = source
  previewDialog.value = true
}

const getRiderStatusMeta = (status: string | null | undefined) => {
  switch (status) {
    case 'approved':
      return {
        label: 'Approved',
        color: 'success',
        icon: 'mdi-check-decagram',
      }
    case 'rejected':
      return {
        label: 'Rejected',
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

const getPrimaryAction = (rider: AdminRiderRecord) => {
  const status = String(rider.status || 'pending')

  if (status === 'approved') {
    return {
      label: 'Deactivate Rider',
      color: 'error',
      nextStatus: 'rejected' as AdminRiderStatus,
    }
  }

  if (status === 'rejected') {
    return {
      label: 'Re-approve Rider',
      color: 'success',
      nextStatus: 'approved' as AdminRiderStatus,
    }
  }

  return {
    label: 'Approve Rider',
    color: 'success',
    nextStatus: 'approved' as AdminRiderStatus,
  }
}

const getSecondaryAction = (rider: AdminRiderRecord) => {
  const status = String(rider.status || 'pending')

  if (status === 'pending') {
    return {
      label: 'Reject Rider',
      color: 'error',
      nextStatus: 'rejected' as AdminRiderStatus,
    }
  }

  return null
}

const updateRider = async (rider: AdminRiderRecord, nextStatus: AdminRiderStatus) => {
  const actionLabel =
    nextStatus === 'approved'
      ? String(rider.status) === 'rejected'
        ? 're-approve'
        : 'approve'
      : String(rider.status) === 'pending'
        ? 'reject'
        : 'deactivate'

  if (!confirm(`Are you sure you want to ${actionLabel} ${getRiderFullName(rider)}?`)) {
    return
  }

  busyRiderId.value = rider.rider_id
  errorMessage.value = ''

  try {
    await setAdminRiderStatus(rider.rider_id, nextStatus)
    await loadRiders()
  } catch (error: any) {
    console.error('Failed to update rider status:', error)
    errorMessage.value = error?.message || 'Unable to update the selected rider.'
  } finally {
    busyRiderId.value = null
  }
}

watch(
  () => route.query.status,
  (value) => {
    const normalized = normalizeRiderFilter(value)
    const current = typeof value === 'string' ? value : 'all'

    if (current === normalized) {
      return
    }

    router.replace({
      name: 'admin-riders',
      query: normalized === 'all' ? {} : { status: normalized },
    })
  },
  { immediate: true },
)

onMounted(() => {
  loadRiders()
})
</script>

<template>
  <PullToRefreshWrapper :on-refresh="loadRiders">
    <div class="admin-page-stack">
    <v-alert v-if="errorMessage" type="error" rounded="xl">
      {{ errorMessage }}
    </v-alert>

      <v-card class="admin-toolbar-card" rounded="xl" variant="flat">
      <v-card-text class="pa-4 pa-sm-5">
        <div class="admin-toolbar">
          <div>
            <p class="admin-toolbar__eyebrow">Rider moderation</p>
            <h2 class="admin-toolbar__title">Riders management</h2>
            <p class="admin-toolbar__hint">Pull down to refresh rider applications and status updates.</p>
          </div>
        </div>

        <div class="admin-toolbar__search-row">
          <v-text-field
            v-model="searchTerm"
            label="Search riders, vehicle, plate, or city"
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
          :key="`rider-skeleton-${index}`"
          type="article"
          class="admin-record-skeleton"
        />
      </div>
    </template>

    <template v-else-if="filteredRiders.length === 0">
      <AdminEmptyState
        icon="mdi-bike-fast"
        title="No matching riders found"
        description="Try a different status filter or search keyword, or pull down to refresh rider records."
      />
    </template>

    <template v-else>
      <div class="admin-record-grid">
        <v-card
          v-for="rider in filteredRiders"
          :key="rider.rider_id"
          class="admin-record-card"
          rounded="xl"
          variant="flat"
        >
          <v-card-text class="pa-4 pa-sm-5">
            <div class="admin-record-card__top">
              <div class="admin-record-card__copy">
                <p class="admin-record-card__eyebrow">Rider record</p>
                <h3 class="admin-record-card__title">{{ getRiderFullName(rider) }}</h3>
                <p class="admin-record-card__subtitle">
                  {{ getRiderEmail(rider) }} · {{ formatAdminDateTime(rider.application_date) }}
                </p>
              </div>

              <div class="admin-record-card__chips">
                <v-chip
                  :color="getRiderStatusMeta(String(rider.status)).color"
                  variant="flat"
                  size="small"
                >
                  <v-icon start size="16">{{ getRiderStatusMeta(String(rider.status)).icon }}</v-icon>
                  {{ getRiderStatusMeta(String(rider.status)).label }}
                </v-chip>
                <v-chip :color="getRiderDocumentStatus(rider).color" variant="tonal" size="small">
                  <v-icon start size="16">{{ getRiderDocumentStatus(rider).icon }}</v-icon>
                  {{ getRiderDocumentStatus(rider).text }}
                </v-chip>
              </div>
            </div>

            <div class="admin-record-meta-grid">
              <div class="admin-record-meta">
                <span>Phone</span>
                <strong>{{ getRiderPhone(rider) }}</strong>
              </div>
              <div class="admin-record-meta">
                <span>Vehicle</span>
                <strong>{{ rider.vehicle_type || 'Vehicle not set' }}</strong>
              </div>
              <div class="admin-record-meta">
                <span>Plate Number</span>
                <strong>{{ rider.vehicle_plate || 'No plate recorded' }}</strong>
              </div>
              <div class="admin-record-meta">
                <span>Application Review</span>
                <strong>{{ getRiderDocumentStatus(rider).description }}</strong>
              </div>
            </div>

            <div class="admin-record-actions">
              <v-btn variant="outlined" rounded="lg" @click="openRiderDetails(rider)">
                <v-icon start>mdi-eye-outline</v-icon>
                View Details
              </v-btn>

              <v-spacer />

              <v-btn
                v-if="getSecondaryAction(rider)"
                :color="getSecondaryAction(rider)?.color"
                variant="outlined"
                rounded="lg"
                :loading="busyRiderId === rider.rider_id"
                @click="updateRider(rider, getSecondaryAction(rider)!.nextStatus)"
              >
                {{ getSecondaryAction(rider)?.label }}
              </v-btn>

              <v-btn
                :color="getPrimaryAction(rider).color"
                variant="flat"
                rounded="lg"
                :loading="busyRiderId === rider.rider_id"
                @click="updateRider(rider, getPrimaryAction(rider).nextStatus)"
              >
                {{ getPrimaryAction(rider).label }}
              </v-btn>
            </div>
          </v-card-text>
        </v-card>
      </div>
    </template>

    <v-dialog v-model="detailDialog" max-width="980">
      <v-card v-if="selectedRider" rounded="xl">
        <v-card-title class="d-flex align-center px-5 py-4">
          <div>
            <div class="text-overline text-medium-emphasis">Rider details</div>
            <div class="text-h6 font-weight-bold">{{ getRiderFullName(selectedRider) }}</div>
          </div>
          <v-spacer />
          <v-chip
            :color="getRiderStatusMeta(String(selectedRider.status)).color"
            variant="flat"
            size="small"
            class="mr-3"
          >
            {{ getRiderStatusMeta(String(selectedRider.status)).label }}
          </v-chip>
          <v-btn icon size="small" @click="detailDialog = false">
            <v-icon>mdi-close</v-icon>
          </v-btn>
        </v-card-title>

        <v-divider />

        <v-card-text class="pa-5">
          <div class="admin-detail-grid">
            <div class="admin-detail-section">
              <h4>Personal information</h4>
              <div class="admin-detail-row">
                <span>Full Name</span>
                <strong>{{ getRiderFullName(selectedRider) }}</strong>
              </div>
              <div class="admin-detail-row">
                <span>Email</span>
                <strong>{{ getRiderEmail(selectedRider) }}</strong>
              </div>
              <div class="admin-detail-row">
                <span>Phone</span>
                <strong>{{ getRiderPhone(selectedRider) }}</strong>
              </div>
              <div class="admin-detail-row">
                <span>Birthdate</span>
                <strong>{{ formatAdminDate(selectedRider.birthdate) }}</strong>
              </div>
              <div class="admin-detail-row">
                <span>Gender</span>
                <strong>{{ selectedRider.gender || 'Not specified' }}</strong>
              </div>
            </div>

            <div class="admin-detail-section">
              <h4>Address</h4>
              <div class="admin-detail-row">
                <span>Street / Address</span>
                <strong>{{ selectedRider.address || 'No address provided' }}</strong>
              </div>
              <div class="admin-detail-row">
                <span>City</span>
                <strong>{{ selectedRider.city || 'Not set' }}</strong>
              </div>
              <div class="admin-detail-row">
                <span>Province</span>
                <strong>{{ selectedRider.province || 'Not set' }}</strong>
              </div>
              <div class="admin-detail-row">
                <span>Applied</span>
                <strong>{{ formatAdminDateTime(selectedRider.application_date) }}</strong>
              </div>
            </div>

            <div class="admin-detail-section">
              <h4>Vehicle information</h4>
              <div class="admin-detail-row">
                <span>Vehicle Type</span>
                <strong>{{ selectedRider.vehicle_type || 'Not set' }}</strong>
              </div>
              <div class="admin-detail-row">
                <span>Vehicle Brand / Model</span>
                <strong>{{ [selectedRider.vehicle_brand, selectedRider.vehicle_model].filter(Boolean).join(' ') || 'Not set' }}</strong>
              </div>
              <div class="admin-detail-row">
                <span>Vehicle Year / Color</span>
                <strong>{{ [selectedRider.vehicle_year, selectedRider.vehicle_color].filter(Boolean).join(' · ') || 'Not set' }}</strong>
              </div>
              <div class="admin-detail-row">
                <span>Plate Number</span>
                <strong>{{ selectedRider.vehicle_plate || 'Not set' }}</strong>
              </div>
              <div class="admin-detail-row">
                <span>OR/CR Number</span>
                <strong>{{ selectedRider.vehicle_or_cr_number || 'Not set' }}</strong>
              </div>
            </div>

            <div class="admin-detail-section">
              <h4>Documents</h4>
              <p class="admin-detail-copy">{{ getRiderDocumentStatus(selectedRider).description }}</p>
              <div class="admin-document-actions">
                <v-btn
                  v-if="selectedRider.valid_id_url"
                  color="primary"
                  variant="outlined"
                  rounded="lg"
                  @click="previewRiderDocument(selectedRider.valid_id_url, 'Valid ID')"
                >
                  <v-icon start>mdi-card-account-details-outline</v-icon>
                  View Valid ID
                </v-btn>
                <v-btn
                  v-if="selectedRider.drivers_license_url"
                  color="primary"
                  variant="outlined"
                  rounded="lg"
                  @click="previewRiderDocument(selectedRider.drivers_license_url, 'Driver License')"
                >
                  <v-icon start>mdi-card-bulleted-outline</v-icon>
                  View License
                </v-btn>
                <v-btn
                  v-if="selectedRider.or_cr_url"
                  color="primary"
                  variant="outlined"
                  rounded="lg"
                  @click="previewRiderDocument(selectedRider.or_cr_url, 'OR / CR')"
                >
                  <v-icon start>mdi-file-document-outline</v-icon>
                  View OR / CR
                </v-btn>
                <v-btn
                  v-if="selectedRider.nbi_clearance_url"
                  color="primary"
                  variant="outlined"
                  rounded="lg"
                  @click="previewRiderDocument(selectedRider.nbi_clearance_url, 'NBI Clearance')"
                >
                  <v-icon start>mdi-folder-account-outline</v-icon>
                  View NBI Clearance
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
            v-if="getSecondaryAction(selectedRider)"
            :color="getSecondaryAction(selectedRider)?.color"
            variant="outlined"
            rounded="lg"
            :loading="busyRiderId === selectedRider.rider_id"
            @click="updateRider(selectedRider, getSecondaryAction(selectedRider)!.nextStatus)"
          >
            {{ getSecondaryAction(selectedRider)?.label }}
          </v-btn>

          <v-btn
            :color="getPrimaryAction(selectedRider).color"
            variant="flat"
            rounded="lg"
            :loading="busyRiderId === selectedRider.rider_id"
            @click="updateRider(selectedRider, getPrimaryAction(selectedRider).nextStatus)"
          >
            {{ getPrimaryAction(selectedRider).label }}
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
