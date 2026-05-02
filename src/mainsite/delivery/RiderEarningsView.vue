<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/utils/supabase'
import { formatAppDateTime, parseAppTimestamp } from '@/utils/dateTime'
import {
  buildRiderEarningsRecordsFromOrders,
  clearRiderEarningsLedgerMissingMark,
  formatPhpAmount,
  formatRiderDistanceLabel,
  isMissingRiderEarningsTableError,
  isRiderEarningsLedgerMarkedMissing,
  markRiderEarningsLedgerMissing,
} from '@/utils/riderEarnings.js'

const router = useRouter()

const loading = ref(true)
const error = ref('')
const selectedPeriod = ref('today')
const currentTime = ref(Date.now())
const earningsRecords = ref([])
const currentRiderNumericId = ref(null)
const usingOrdersEarningsFallback = ref(false)
let currentTimeInterval = null
let earningsSubscription = null

const periodOptions = [
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'This Week' },
  { value: 'all', label: 'All Time' },
]

const normalizeAmount = (value) => {
  const parsed = Number(value || 0)
  return Number.isFinite(parsed) ? parsed : 0
}

const getCurrentRider = async () => {
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    router.push('/login')
    return null
  }

  const { data, error: riderError } = await supabase
    .from('Rider_Registration')
    .select('rider_id, first_name, last_name')
    .eq('profile_id', user.id)
    .single()

  if (riderError) throw riderError

  currentRiderNumericId.value = data?.rider_id ?? null
  return data
}

const fetchEarningsStatement = async () => {
  if (!currentRiderNumericId.value) {
    earningsRecords.value = []
    return
  }

  loading.value = true
  error.value = ''

  if (isRiderEarningsLedgerMarkedMissing()) {
    try {
      await fetchFallbackEarningsStatement()
      return
    } finally {
      loading.value = false
    }
  }

  try {
    const { data, error: fetchError } = await supabase
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

    if (fetchError) {
      if (isMissingRiderEarningsTableError(fetchError)) {
        markRiderEarningsLedgerMissing()
        console.warn(
          'rider_earnings table is not available in this Supabase project yet. Falling back to completed orders.',
        )
        await fetchFallbackEarningsStatement()
        return
      }

      throw fetchError
    }

    clearRiderEarningsLedgerMissingMark()
    usingOrdersEarningsFallback.value = false
    earningsRecords.value = (data || []).map((record) => ({
      ...record,
      amount: normalizeAmount(record.amount),
      base_pay: normalizeAmount(record.base_pay),
      additional_pay: normalizeAmount(record.additional_pay),
      delivery_distance_km: normalizeAmount(record.delivery_distance_km),
      additional_distance_km: Number(record.additional_distance_km || 0),
    }))
  } catch (fetchError) {
    console.error('Error fetching rider earnings statement:', fetchError)
    error.value = fetchError?.message || 'Failed to load earnings statement.'
    earningsRecords.value = []
  } finally {
    loading.value = false
  }
}

const fetchFallbackEarningsStatement = async () => {
  const { data, error: fetchError } = await supabase
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

  if (fetchError) throw fetchError

  usingOrdersEarningsFallback.value = true
  earningsRecords.value = buildRiderEarningsRecordsFromOrders(data || [], currentRiderNumericId.value)
}

const subscribeToEarnings = () => {
  if (!currentRiderNumericId.value) return

  if (earningsSubscription) {
    supabase.removeChannel(earningsSubscription)
  }

  const table = usingOrdersEarningsFallback.value ? 'orders' : 'rider_earnings'
  const channelName = usingOrdersEarningsFallback.value
    ? `rider-order-earnings-fallback-${currentRiderNumericId.value}`
    : `rider-earnings-statement-${currentRiderNumericId.value}`

  earningsSubscription = supabase
    .channel(channelName)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table,
        filter: `rider_id=eq.${currentRiderNumericId.value}`,
      },
      async () => {
        await fetchEarningsStatement()
      },
    )
    .subscribe()
}

const isWithinSelectedPeriod = (timestamp) => {
  if (selectedPeriod.value === 'all') return true

  const date = parseAppTimestamp(timestamp)
  if (!date) return false

  const now = new Date(currentTime.value)

  if (selectedPeriod.value === 'today') {
    return (
      date.getFullYear() === now.getFullYear() &&
      date.getMonth() === now.getMonth() &&
      date.getDate() === now.getDate()
    )
  }

  const periodStart = new Date(now)
  periodStart.setHours(0, 0, 0, 0)
  periodStart.setDate(periodStart.getDate() - 6)

  return date.getTime() >= periodStart.getTime()
}

const filteredEarnings = computed(() =>
  earningsRecords.value.filter((record) => isWithinSelectedPeriod(record.earned_at)),
)

const summary = computed(() => {
  const totalEarnings = filteredEarnings.value.reduce((sum, record) => sum + record.amount, 0)
  const paidTotal = filteredEarnings.value
    .filter((record) => record.status === 'paid')
    .reduce((sum, record) => sum + record.amount, 0)
  const pendingTotal = filteredEarnings.value
    .filter((record) => record.status !== 'paid')
    .reduce((sum, record) => sum + record.amount, 0)

  return {
    totalEarnings,
    completedDeliveries: filteredEarnings.value.length,
    paidTotal,
    pendingTotal,
    paidCount: filteredEarnings.value.filter((record) => record.status === 'paid').length,
    pendingCount: filteredEarnings.value.filter((record) => record.status !== 'paid').length,
  }
})

const getOrderReference = (record) => {
  return (
    record?.order?.transaction_number ||
    record?.order_id?.slice(0, 8)?.toUpperCase?.() ||
    record?.order_id ||
    'Order'
  )
}

const getStatusColor = (status) => {
  return status === 'paid' ? 'success' : 'warning'
}

const getStatusLabel = (status) => {
  return status === 'paid' ? 'Paid' : 'Pending'
}

const formatEarnedAt = (timestamp) =>
  formatAppDateTime(timestamp, {
    now: currentTime.value,
    relativeDay: true,
    fallback: 'Unknown completion time',
    month: 'short',
    year: 'auto',
  })

const refreshStatement = async () => {
  await fetchEarningsStatement()
  subscribeToEarnings()
}

onMounted(async () => {
  currentTime.value = Date.now()
  currentTimeInterval = setInterval(() => {
    currentTime.value = Date.now()
  }, 30000)

  try {
    await getCurrentRider()
    await fetchEarningsStatement()
    subscribeToEarnings()
  } catch (mountError) {
    console.error('Error loading rider earnings statement:', mountError)
    error.value = mountError?.message || 'Unable to load rider earnings.'
    loading.value = false
  }
})

onUnmounted(() => {
  if (earningsSubscription) {
    supabase.removeChannel(earningsSubscription)
    earningsSubscription = null
  }

  if (currentTimeInterval) {
    clearInterval(currentTimeInterval)
    currentTimeInterval = null
  }
})
</script>

<template>
  <v-app>
    <v-main class="earnings-page">
      <div class="header-section">
        <div class="header-section__inner">
          <div class="header-section__lead">
            <v-btn icon variant="text" class="back-btn" @click="router.back()">
              <v-icon size="28">mdi-arrow-left</v-icon>
            </v-btn>
            <div class="header-copy">
              <h1 class="page-title">Earnings Statement</h1>
              <p class="page-subtitle">Track each delivery payout and see exactly how totals add up.</p>
            </div>
          </div>

          <v-btn icon variant="text" class="refresh-btn" @click="refreshStatement">
            <v-icon size="24">mdi-refresh</v-icon>
          </v-btn>
        </div>
      </div>

      <div class="page-shell">
        <div class="filter-row">
          <v-btn
            v-for="option in periodOptions"
            :key="option.value"
            :variant="selectedPeriod === option.value ? 'flat' : 'outlined'"
            :color="selectedPeriod === option.value ? 'primary' : 'grey-darken-1'"
            class="filter-chip"
            @click="selectedPeriod = option.value"
          >
            {{ option.label }}
          </v-btn>
        </div>

        <div v-if="loading" class="state-card">
          <v-progress-circular indeterminate color="primary" size="56" />
          <p class="state-title">Loading earnings statement...</p>
        </div>

        <div v-else-if="error" class="state-card">
          <v-alert type="error" variant="tonal" class="w-100">{{ error }}</v-alert>
          <v-btn color="primary" size="large" @click="refreshStatement">Try Again</v-btn>
        </div>

        <template v-else>
          <section class="summary-card">
            <div class="summary-card__hero">
              <span class="summary-card__eyebrow">Selected period</span>
              <h2 class="summary-card__amount">{{ formatPhpAmount(summary.totalEarnings) }}</h2>
              <p class="summary-card__caption">
                {{ summary.completedDeliveries }} completed deliveries in
                {{ periodOptions.find((option) => option.value === selectedPeriod)?.label.toLowerCase() }}
              </p>
            </div>

            <div class="summary-grid">
              <div class="summary-metric">
                <span class="summary-metric__label">Completed Deliveries</span>
                <strong>{{ summary.completedDeliveries }}</strong>
              </div>
              <div class="summary-metric">
                <span class="summary-metric__label">Pending Payout</span>
                <strong>{{ formatPhpAmount(summary.pendingTotal) }}</strong>
                <small>{{ summary.pendingCount }} deliveries</small>
              </div>
              <div class="summary-metric">
                <span class="summary-metric__label">Paid Out</span>
                <strong>{{ formatPhpAmount(summary.paidTotal) }}</strong>
                <small>{{ summary.paidCount }} deliveries</small>
              </div>
            </div>
          </section>

          <div v-if="filteredEarnings.length === 0" class="empty-state">
            <v-icon size="72" color="grey-lighten-1">mdi-wallet-outline</v-icon>
            <h3>No earnings found</h3>
            <p>No delivery earnings match the selected period yet.</p>
          </div>

          <div v-else class="statement-list">
            <v-card
              v-for="record in filteredEarnings"
              :key="record.id"
              class="statement-card"
              elevation="0"
              rounded="xl"
            >
              <div class="statement-card__header">
                <div>
                  <div class="statement-card__title">Order #{{ getOrderReference(record) }}</div>
                  <div class="statement-card__meta">{{ formatEarnedAt(record.earned_at) }}</div>
                </div>
                <v-chip
                  :color="getStatusColor(record.status)"
                  variant="tonal"
                  size="small"
                  class="statement-card__status"
                >
                  {{ getStatusLabel(record.status) }}
                </v-chip>
              </div>

              <div class="statement-card__body">
                <div class="statement-row">
                  <span class="statement-row__label">Delivery distance</span>
                  <strong>{{ formatRiderDistanceLabel(record.delivery_distance_km) }}</strong>
                </div>
                <div class="statement-row">
                  <span class="statement-row__label">Base pay</span>
                  <strong>{{ formatPhpAmount(record.base_pay) }}</strong>
                </div>
                <div class="statement-row" v-if="record.additional_pay > 0">
                  <span class="statement-row__label">
                    Extra distance pay
                    <small>+{{ record.additional_distance_km }} km</small>
                  </span>
                  <strong>{{ formatPhpAmount(record.additional_pay) }}</strong>
                </div>
                <div class="statement-row statement-row--total">
                  <span class="statement-row__label">Total earned</span>
                  <strong>{{ formatPhpAmount(record.amount) }}</strong>
                </div>
              </div>
            </v-card>
          </div>
        </template>
      </div>
    </v-main>
  </v-app>
</template>

<style scoped>
.earnings-page {
  min-height: 100dvh;
  background:
    radial-gradient(circle at top right, rgba(255, 183, 77, 0.12), transparent 28%),
    linear-gradient(180deg, #f8fafc 0%, #ffffff 100%);
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
  max-width: 960px;
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

.back-btn,
.refresh-btn {
  color: white !important;
}

.page-title {
  margin: 0;
  font-size: 1.4rem;
  font-weight: 700;
}

.page-subtitle {
  margin: 4px 0 0;
  font-size: 0.84rem;
  line-height: 1.45;
  color: rgba(233, 241, 255, 0.86);
}

.page-shell {
  max-width: 960px;
  margin: 0 auto;
  padding: 18px 16px calc(32px + env(safe-area-inset-bottom, 0px));
}

.filter-row {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 16px;
}

.filter-chip {
  text-transform: none;
  border-radius: 999px;
  font-weight: 700;
}

.state-card,
.empty-state {
  min-height: 40vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  text-align: center;
}

.state-title,
.empty-state h3 {
  margin: 0;
  color: #12304f;
}

.empty-state p {
  margin: 0;
  color: #5f6f82;
}

.summary-card {
  padding: 20px;
  border-radius: 28px;
  background: linear-gradient(135deg, #fff7e8 0%, #ffffff 100%);
  border: 1px solid rgba(255, 152, 0, 0.18);
  box-shadow: 0 20px 48px rgba(15, 23, 42, 0.08);
}

.summary-card__hero {
  margin-bottom: 18px;
}

.summary-card__eyebrow {
  display: inline-block;
  margin-bottom: 6px;
  font-size: 0.74rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #d97706;
  font-weight: 700;
}

.summary-card__amount {
  margin: 0;
  font-size: 2rem;
  line-height: 1.05;
  color: #12304f;
}

.summary-card__caption {
  margin: 10px 0 0;
  color: #5f6f82;
  line-height: 1.5;
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.summary-metric {
  padding: 14px;
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.92);
  border: 1px solid rgba(217, 119, 6, 0.08);
  display: flex;
  flex-direction: column;
  gap: 6px;
  color: #12304f;
}

.summary-metric__label {
  font-size: 0.76rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #8b6a2b;
  font-weight: 700;
}

.summary-metric small {
  color: #6b7b90;
}

.statement-list {
  display: grid;
  gap: 14px;
  margin-top: 18px;
}

.statement-card {
  border: 1px solid rgba(200, 216, 232, 0.7);
  background: rgba(255, 255, 255, 0.96);
  box-shadow: 0 16px 36px rgba(16, 24, 40, 0.05);
  padding: 18px;
}

.statement-card__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
}

.statement-card__title {
  font-size: 1rem;
  font-weight: 700;
  color: #12304f;
}

.statement-card__meta {
  margin-top: 4px;
  font-size: 0.82rem;
  color: #6b7b90;
}

.statement-card__body {
  display: grid;
  gap: 10px;
}

.statement-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  color: #12304f;
}

.statement-row__label {
  color: #5f6f82;
  display: inline-flex;
  flex-direction: column;
  gap: 2px;
}

.statement-row__label small {
  color: #8aa0b8;
}

.statement-row--total {
  padding-top: 10px;
  border-top: 1px solid #e6eef6;
}

.statement-row--total strong {
  color: #d97706;
}

@media (max-width: 700px) {
  .summary-grid {
    grid-template-columns: 1fr;
  }

  .statement-card__header,
  .statement-row {
    flex-direction: column;
    align-items: flex-start;
  }

  .statement-card__status {
    align-self: flex-start;
  }
}

@media (max-width: 600px) {
  .header-section__inner {
    padding: 10px max(12px, env(safe-area-inset-left, 0px)) 10px
      max(12px, env(safe-area-inset-right, 0px));
  }

  .page-title {
    font-size: 1.2rem;
  }

  .page-subtitle {
    font-size: 0.76rem;
  }

  .page-shell {
    padding-inline: 14px;
  }

  .summary-card {
    padding: 18px;
    border-radius: 24px;
  }

  .summary-card__amount {
    font-size: 1.7rem;
  }
}
</style>
