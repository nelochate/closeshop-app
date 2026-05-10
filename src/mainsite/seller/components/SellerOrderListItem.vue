<script setup lang="ts">
import { computed } from 'vue'
import { formatAppDateTime } from '@/utils/dateTime'
import type { SellerDashboardOrder } from '@/services/sellerDashboard'
import { getSellerOrderStatusColor, getSellerOrderStatusText } from '../sellerOrderState'

const props = defineProps<{
  order: SellerDashboardOrder
  orderIndex: number
  nowTimestamp: number
}>()

const emit = defineEmits<{
  openFull: [orderId: string]
}>()

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(Number(value || 0))

const formatDate = (dateString: string | null | undefined) =>
  formatAppDateTime(dateString || '', {
    now: props.nowTimestamp,
    fallback: 'Unknown time',
    relativeDay: true,
    month: 'short',
    year: 'auto',
  })

const orderIdValue = computed(() => String(props.order.id || ''))
const orderIndexLabel = computed(() => `Order ${String(props.orderIndex + 1).padStart(3, '0')}`)

const orderReference = computed(() => {
  if (props.order.transaction_number) return props.order.transaction_number
  if (props.order.id) return `ORDER-${String(props.order.id).substring(0, 8).toUpperCase()}`
  return 'No order reference'
})

const orderPlacedAt = computed(() =>
  formatDate(props.order.created_at || props.order.updated_at || props.order.completed_at || ''),
)

const customerName = computed(() => props.order.customer_name || 'Customer')
const orderStatusText = computed(() => getSellerOrderStatusText(props.order))
const orderStatusColor = computed(() => getSellerOrderStatusColor(props.order))
</script>

<template>
  <v-card rounded="xl" variant="flat" class="seller-order-item">
    <v-card-text class="pa-4 pa-sm-5">
      <div class="seller-order-item__top">
        <div class="seller-order-item__reference-block">
          <div class="seller-order-item__meta-row">
            <span class="seller-order-item__index">{{ orderIndexLabel }}</span>
            <span class="seller-order-item__label">Order Reference</span>
          </div>
          <div class="seller-order-item__reference">{{ orderReference }}</div>
        </div>
        <v-chip :color="orderStatusColor" size="small" variant="flat" class="seller-order-item__status-chip">
          {{ orderStatusText }}
        </v-chip>
      </div>

      <div class="seller-order-item__summary-grid">
        <div class="seller-order-item__summary-cell seller-order-item__summary-cell--wide">
          <span>Customer</span>
          <strong>{{ customerName }}</strong>
        </div>

        <div class="seller-order-item__summary-cell">
          <span>Total</span>
          <strong>{{ formatCurrency(Number(order.total_amount || 0)) }}</strong>
        </div>

        <div class="seller-order-item__summary-cell">
          <span>Date and Time</span>
          <strong>{{ orderPlacedAt }}</strong>
        </div>
      </div>

      <div class="seller-order-item__actions">
        <v-btn color="primary" rounded="lg" variant="flat" @click="emit('openFull', orderIdValue)">
          View Full Order
        </v-btn>
      </div>
    </v-card-text>
  </v-card>
</template>

<style scoped>
.seller-order-item {
  background: rgba(255, 255, 255, 0.97);
  border: 1px solid rgba(148, 163, 184, 0.16);
  box-shadow: 0 16px 34px rgba(15, 23, 42, 0.08);
}

.seller-order-item__top,
.seller-order-item__actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.seller-order-item__top {
  align-items: flex-start;
}

.seller-order-item__reference-block {
  min-width: 0;
  flex: 1;
}

.seller-order-item__meta-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.seller-order-item__index {
  display: inline-flex;
  align-items: center;
  padding: 6px 10px;
  border-radius: 999px;
  background: rgba(37, 99, 235, 0.1);
  color: #1d4ed8;
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.seller-order-item__label,
.seller-order-item__summary-cell span {
  display: block;
  color: #64748b;
  font-size: 0.8rem;
}

.seller-order-item__reference {
  margin-top: 8px;
  color: #0f172a;
  font-size: 1rem;
  font-weight: 800;
  line-height: 1.25;
  word-break: break-word;
}

.seller-order-item__summary-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  margin-top: 16px;
}

.seller-order-item__summary-cell {
  border: 1px solid rgba(148, 163, 184, 0.18);
  background: linear-gradient(180deg, #ffffff 0%, #f8fbff 100%);
  border-radius: 18px;
  padding: 14px;
}

.seller-order-item__summary-cell--wide {
  grid-column: 1 / -1;
}

.seller-order-item__summary-cell strong {
  display: block;
  margin-top: 6px;
  color: #0f172a;
  font-size: 0.96rem;
  font-weight: 700;
  line-height: 1.4;
}

.seller-order-item__actions {
  margin-top: 16px;
  justify-content: flex-end;
}

.seller-order-item__actions :deep(.v-btn) {
  min-height: 44px;
  font-weight: 700;
}

@media (max-width: 767px) {
  .seller-order-item__top,
  .seller-order-item__actions {
    flex-direction: column;
    align-items: stretch;
  }

  .seller-order-item__summary-grid {
    grid-template-columns: 1fr;
    gap: 10px;
    margin-top: 14px;
  }

  .seller-order-item__status-chip {
    align-self: flex-start;
  }

  .seller-order-item__reference {
    font-size: 0.95rem;
  }

  .seller-order-item__summary-cell {
    padding: 12px;
    border-radius: 16px;
  }

  .seller-order-item__summary-cell strong {
    font-size: 0.92rem;
  }

  .seller-order-item__actions :deep(.v-btn) {
    width: 100%;
  }
}
</style>
