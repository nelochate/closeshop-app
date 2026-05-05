<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { supabase } from '@/utils/supabase'
import {
  calculateOrderItemsSubtotal,
  calculateOrderTotalAmount,
  resolveOrderDeliveryFee,
} from '@/utils/deliveryPricing.js'

interface AddressRecord {
  id?: string
  recipient_name?: string | null
  full_name?: string | null
  name?: string | null
  phone?: string | null
  house_no?: string | null
  building?: string | null
  street?: string | null
  purok?: string | null
  barangay_name?: string | null
  city_name?: string | null
  province_name?: string | null
  region_name?: string | null
  postal_code?: string | null
}

interface ProfileRecord {
  id?: string
  first_name?: string | null
  last_name?: string | null
  full_name?: string | null
  name?: string | null
  phone?: string | null
}

interface ShopRecord {
  id?: string
  business_name?: string | null
}

interface OrderRecord {
  id: string
  transaction_number?: string | null
  delivery_fee?: number | null
  total_amount?: number | null
  status?: string | null
  payment_status?: string | null
  payment_method?: string | null
  delivery_option?: string | null
  delivery_date?: string | null
  delivery_time?: string | null
  note?: string | null
  created_at?: string | null
  address?: AddressRecord | null
  buyer?: ProfileRecord | null
  shop?: ShopRecord | null
}

interface PaymentRecord {
  id?: string
  status?: string | null
  method?: string | null
  payment_method?: string | null
  amount?: number | null
  created_at?: string | null
}

interface RawOrderItemRecord {
  id?: string
  quantity?: number | null
  price?: number | null
  selected_size?: string | null
  selected_variety?: string | null
  product?: {
    prod_name?: string | null
    main_img_urls?: string | string[] | null
  } | null
}

interface DisplayOrderItem {
  id: string
  name: string
  price: number
  quantity: number
  image: string
  selectedSize: string
  selectedVariety: string
}

const route = useRoute()
const router = useRouter()
const orderId = route.params.orderId as string

const order = ref<OrderRecord | null>(null)
const items = ref<DisplayOrderItem[]>([])
const payment = ref<PaymentRecord | null>(null)
const loading = ref(true)
const error = ref('')

const currencyFormatter = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
})

const normalizeText = (value: unknown) => {
  if (value === null || value === undefined) return ''
  return String(value).trim()
}

const formatCurrency = (value?: number | string | null) =>
  currencyFormatter.format(Number(value ?? 0))

const formatLabel = (value: unknown, fallback = 'Not available') => {
  const text = normalizeText(value)
  if (!text) return fallback

  return text
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

const getProfileDisplayName = (profile?: ProfileRecord | null) => {
  const preferredName = [profile?.full_name, profile?.name].find((value) => normalizeText(value))
  if (preferredName) return normalizeText(preferredName)

  return [profile?.first_name, profile?.last_name]
    .map((value) => normalizeText(value))
    .filter(Boolean)
    .join(' ')
}

const getRecipientName = (address?: AddressRecord | null, profile?: ProfileRecord | null) => {
  const preferredName = [address?.recipient_name, address?.full_name, address?.name].find((value) =>
    normalizeText(value),
  )

  return normalizeText(preferredName) || getProfileDisplayName(profile) || 'Recipient unavailable'
}

const formatPurok = (value: unknown) => {
  const text = normalizeText(value)
  if (!text) return ''
  return /^purok\b/i.test(text) ? text : `Purok ${text}`
}

const formatDeliveryAddress = (address?: AddressRecord | null) => {
  if (!address) return 'Delivery address unavailable'

  const addressParts = [
    address.house_no,
    address.building,
    address.street,
    formatPurok(address.purok),
    address.barangay_name,
    address.city_name,
    address.province_name,
    address.region_name,
    address.postal_code,
  ]
    .map((value) => normalizeText(value))
    .filter(Boolean)

  return addressParts.join(', ') || 'Delivery address unavailable'
}

const parseProductImage = (value: unknown) => {
  if (Array.isArray(value)) {
    return normalizeText(value[0]) || '/no-image.png'
  }

  const text = normalizeText(value)
  if (!text) return '/no-image.png'

  if (text.startsWith('[')) {
    try {
      const parsed = JSON.parse(text)
      if (Array.isArray(parsed)) {
        return normalizeText(parsed[0]) || '/no-image.png'
      }
    } catch {
      return '/no-image.png'
    }
  }

  return text
}

const formatDisplayDate = (value?: string | null) => {
  const text = normalizeText(value)
  if (!text) return 'To be scheduled'

  const source = /^\d{4}-\d{2}-\d{2}$/.test(text) ? `${text}T00:00:00` : text
  const date = new Date(source)

  if (Number.isNaN(date.getTime())) return text

  return date.toLocaleDateString('en-PH', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

const formatDisplayTime = (value?: string | null) => {
  const text = normalizeText(value)
  if (!text) return ''

  const match = text.match(/^(\d{1,2}):(\d{2})/)
  if (!match) return text

  let hours = Number(match[1])
  const minutes = match[2]
  const period = hours >= 12 ? 'PM' : 'AM'

  hours = hours % 12 || 12

  return `${hours}:${minutes} ${period}`
}

const formatDateTime = (value?: string | null) => {
  const text = normalizeText(value)
  if (!text) return 'Not available'

  const date = new Date(text)
  if (Number.isNaN(date.getTime())) return text

  return date.toLocaleString('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

const getStatusColor = (value?: string | null) => {
  const status = normalizeText(value).toLowerCase()

  if (['completed', 'paid', 'approved', 'confirmed', 'success'].includes(status)) return 'success'
  if (['cancelled', 'failed', 'rejected', 'declined'].includes(status)) return 'error'
  if (['pending', 'pending approval', 'pending_approval', 'processing'].includes(status)) {
    return 'warning'
  }

  return 'primary'
}

const subtotal = computed(() => calculateOrderItemsSubtotal(items.value))
const deliveryFee = computed(() =>
  resolveOrderDeliveryFee(order.value || {}, undefined, subtotal.value as any),
)
const totalAmount = computed(() =>
  Number(order.value?.total_amount ?? calculateOrderTotalAmount(subtotal.value, deliveryFee.value)),
)

const buyerName = computed(() => getRecipientName(order.value?.address, order.value?.buyer))
const buyerPhone = computed(
  () =>
    normalizeText((order.value as any)?.contact_number) ||
    normalizeText(order.value?.address?.phone) ||
    normalizeText(order.value?.buyer?.phone) ||
    'No phone number provided',
)
const buyerAddress = computed(() => formatDeliveryAddress(order.value?.address))
const orderStatusLabel = computed(() => formatLabel(order.value?.status, 'Pending'))
const paymentMethodLabel = computed(() =>
  formatLabel(order.value?.payment_method || payment.value?.method, 'Cash'),
)
const paymentStatusLabel = computed(() =>
  formatLabel(payment.value?.status || order.value?.payment_status, 'Pending'),
)
const orderReference = computed(
  () => normalizeText(order.value?.transaction_number) || normalizeText(order.value?.id) || 'N/A',
)
const deliverySchedule = computed(() => {
  const date = normalizeText(order.value?.delivery_date)
  const time = normalizeText(order.value?.delivery_time)

  if (!date && !time) return 'To be scheduled'
  if (date && time) return `${formatDisplayDate(date)} at ${formatDisplayTime(time)}`
  return date ? formatDisplayDate(date) : formatDisplayTime(time)
})

const normalizePaymentRecord = (record: any): PaymentRecord | null => {
  if (!record) return null

  return {
    id: normalizeText(record.id) || undefined,
    status: normalizeText(record.status) || null,
    method: normalizeText(record.method || record.payment_method) || null,
    payment_method: normalizeText(record.payment_method) || null,
    amount: record.amount === null || record.amount === undefined ? null : Number(record.amount),
    created_at: normalizeText(record.created_at) || null,
  }
}

const loadLatestPayment = async (currentOrderId: string) => {
  try {
    const { data, error: paymentError } = await supabase
      .from('payments')
      .select('*')
      .eq('order_id', currentOrderId)

    if (paymentError) {
      console.warn('Could not load payment details for this order:', paymentError)
      return null
    }

    const paymentRows = Array.isArray(data) ? [...data] : []

    paymentRows.sort((left: any, right: any) => {
      const leftTimestamp = Date.parse(normalizeText(left?.created_at))
      const rightTimestamp = Date.parse(normalizeText(right?.created_at))
      const leftIsValid = Number.isFinite(leftTimestamp)
      const rightIsValid = Number.isFinite(rightTimestamp)

      if (leftIsValid && rightIsValid) return rightTimestamp - leftTimestamp
      if (rightIsValid) return 1
      if (leftIsValid) return -1
      return 0
    })

    return normalizePaymentRecord(paymentRows[0])
  } catch (paymentError) {
    console.warn('Could not load payment details for this order:', paymentError)
    return null
  }
}

const loadOrderDetails = async () => {
  if (!orderId) {
    error.value = 'No order ID provided.'
    loading.value = false
    return
  }

  try {
    loading.value = true
    error.value = ''

    const [orderResponse, itemsResponse, paymentResponse] = await Promise.all([
      supabase
        .from('orders')
        .select(`
          *,
          address:addresses!orders_address_id_fkey (
            id,
            recipient_name,
            phone,
            house_no,
            building,
            street,
            purok,
            barangay_name,
            city_name,
            province_name,
            region_name,
            postal_code
          ),
          buyer:profiles!orders_user_id_fkey (
            id,
            first_name,
            last_name,
            phone
          ),
          shop:shop_id (
            id,
            business_name
          )
        `)
        .eq('id', orderId)
        .single(),
      supabase
        .from('order_items')
        .select(`
          id,
          quantity,
          price,
          selected_size,
          selected_variety,
          product:products (
            prod_name,
            main_img_urls
          )
        `)
        .eq('order_id', orderId),
      loadLatestPayment(orderId),
    ])

    if (orderResponse.error) throw orderResponse.error
    if (itemsResponse.error) throw itemsResponse.error

    order.value = orderResponse.data as OrderRecord
    payment.value = paymentResponse

    const orderItems = (itemsResponse.data || []) as RawOrderItemRecord[]
    items.value = orderItems.map((item, index) => ({
      id: normalizeText(item.id) || `${index}`,
      name: normalizeText(item.product?.prod_name) || 'Unknown product',
      price: Number(item.price ?? 0),
      quantity: Number(item.quantity ?? 1),
      image: parseProductImage(item.product?.main_img_urls),
      selectedSize: normalizeText(item.selected_size),
      selectedVariety: normalizeText(item.selected_variety),
    }))
  } catch (err: any) {
    error.value = `Failed to load order details: ${err?.message || 'Unknown error'}`
  } finally {
    loading.value = false
  }
}

onMounted(loadOrderDetails)
</script>

<template>
  <v-app>
      <!-- Top App Bar -->
      <v-app-bar flat elevation="0" class="top-nav" color="#3f83c7">
        <v-btn variant="text" icon @click="router.push('/')" class="back-btn">
          <v-icon>mdi-arrow-left</v-icon>
        </v-btn>
        <v-toolbar-title>
          <strong>Order Summary</strong>
        </v-toolbar-title>
        <v-spacer />
      </v-app-bar>

    <v-main class="success-page">
      <div class="page-shell">
        <div v-if="loading" class="state-card">
          <v-progress-circular indeterminate color="primary" size="56" />
          <p class="state-title">Loading your order details...</p>
          <p class="state-copy">We're preparing your checkout summary.</p>
        </div>

        <div v-else-if="error" class="state-card">
          <v-alert type="error" variant="tonal" class="w-100">
            {{ error }}
          </v-alert>
          <div class="action-stack">
            <v-btn color="primary" size="large" block @click="loadOrderDetails">Try Again</v-btn>
            <v-btn variant="outlined" size="large" block @click="router.push('/')">Go to Home</v-btn>
          </div>
        </div>

        <template v-else>
          <section class="hero-card">
            <div class="hero-header">
              <v-avatar size="30" class="hero-icon">
                <v-icon size="30">mdi-check</v-icon>
              </v-avatar>

              <div class="hero-copy">
                <p class="hero-eyebrow">Order placed</p>
                <h1 class="hero-title">Thank you for your order</h1>
                <p class="hero-description">
                  Your order has been saved successfully. We'll use the selected delivery address
                  below for fulfillment.
                </p>
              </div>
            </div>

            <div class="hero-meta">
              <div class="hero-pill">
                <span class="hero-pill__label">Transaction</span>
                <strong>{{ orderReference }}</strong>
              </div>
              <v-chip
                :color="getStatusColor(order?.status)"
                variant="tonal"
                class="status-chip"
              >
                {{ orderStatusLabel }}
              </v-chip>
            </div>

            <div class="hero-total">
              <span>Total Amount</span>
              <strong>{{ formatCurrency(totalAmount) }}</strong>
            </div>
          </section>

          <div class="content-stack">
            <v-card class="info-card" rounded="xl" elevation="0">
              <v-card-title class="section-title">
                <v-icon start color="primary">mdi-account-circle-outline</v-icon>
                Buyer Info
              </v-card-title>
              <v-card-text class="section-body">
                <div class="info-row">
                  <span class="info-label">Recipient</span>
                  <span class="info-value strong-text">{{ buyerName }}</span>
                </div>
                <div class="info-row">
                  <span class="info-label">Phone</span>
                  <span class="info-value">{{ buyerPhone }}</span>
                </div>
                <div class="info-row">
                  <span class="info-label">Address</span>
                  <span class="info-value address-value">{{ buyerAddress }}</span>
                </div>
              </v-card-text>
            </v-card>

            <v-card class="info-card" rounded="xl" elevation="0">
              <v-card-title class="section-title">
                <v-icon start color="primary">mdi-package-variant-closed-check</v-icon>
                Order Summary
              </v-card-title>
              <v-card-text class="section-body">
                <div class="info-row" v-if="order?.shop?.business_name">
                  <span class="info-label">Shop</span>
                  <span class="info-value">{{ order.shop.business_name }}</span>
                </div>
                <div class="info-row">
                  <span class="info-label">Order Placed</span>
                  <span class="info-value">{{ formatDateTime(order?.created_at) }}</span>
                </div>
                <div class="info-row">
                  <span class="info-label">Delivery</span>
                  <span class="info-value">{{
                    formatLabel(order?.delivery_option, 'Standard Delivery')
                  }}</span>
                </div>
                <div class="info-row">
                  <span class="info-label">Schedule</span>
                  <span class="info-value">{{ deliverySchedule }}</span>
                </div>
                <div class="info-row" v-if="order?.note">
                  <span class="info-label">Note</span>
                  <span class="info-value">{{ order.note }}</span>
                </div>

                <div class="totals-box">
                  <div class="totals-row">
                    <span>Items ({{ items.length }})</span>
                    <strong>{{ formatCurrency(subtotal) }}</strong>
                  </div>
                  <div class="totals-row">
                    <span>Delivery Fee</span>
                    <strong>{{ formatCurrency(deliveryFee) }}</strong>
                  </div>
                  <div class="totals-row totals-row--grand">
                    <span>Total</span>
                    <strong>{{ formatCurrency(totalAmount) }}</strong>
                  </div>
                </div>
              </v-card-text>
            </v-card>

            <v-card class="info-card" rounded="xl" elevation="0">
              <v-card-title class="section-title">
                <v-icon start color="primary">mdi-credit-card-outline</v-icon>
                Payment Info
              </v-card-title>
              <v-card-text class="section-body">
                <div class="info-row">
                  <span class="info-label">Method</span>
                  <span class="info-value">{{ paymentMethodLabel }}</span>
                </div>
                <div class="info-row">
                  <span class="info-label">Payment Status</span>
                  <span class="info-value payment-status">
                    <v-chip
                      :color="getStatusColor(payment?.status || order?.payment_status || 'pending')"
                      variant="tonal"
                      size="small"
                    >
                      {{ paymentStatusLabel }}
                    </v-chip>
                  </span>
                </div>
                <div class="info-row">
                  <span class="info-label">Transaction No.</span>
                  <span class="info-value">{{ orderReference }}</span>
                </div>
                <div class="info-row">
                  <span class="info-label">Amount</span>
                  <span class="info-value strong-text">{{
                    formatCurrency(payment?.amount ?? totalAmount)
                  }}</span>
                </div>
              </v-card-text>
            </v-card>

            <v-card class="info-card" rounded="xl" elevation="0">
              <v-card-title class="section-title">
                <v-icon start color="primary">mdi-format-list-bulleted-square</v-icon>
                Order Items
              </v-card-title>
              <v-card-text class="section-body">
                <div v-if="items.length" class="item-list">
                  <div v-for="item in items" :key="item.id" class="item-row">
                    <v-avatar rounded="lg" size="56" class="item-avatar">
                      <v-img :src="item.image" :alt="item.name" cover />
                    </v-avatar>

                    <div class="item-copy">
                      <div class="item-name">{{ item.name }}</div>
                      <div
                        v-if="item.selectedSize || item.selectedVariety"
                        class="item-variant"
                      >
                        <span v-if="item.selectedSize">Size: {{ item.selectedSize }}</span>
                        <span v-if="item.selectedVariety">
                          Variety: {{ item.selectedVariety }}
                        </span>
                      </div>
                      <div class="item-meta">
                        {{ item.quantity }} x {{ formatCurrency(item.price) }}
                      </div>
                    </div>

                    <div class="item-total">
                      {{ formatCurrency(item.price * item.quantity) }}
                    </div>
                  </div>
                </div>

                <div v-else class="empty-items">
                  <v-icon color="grey-lighten-1" size="28">mdi-package-variant</v-icon>
                  <span>No order items were found for this order.</span>
                </div>
              </v-card-text>
            </v-card>
          </div>

          <div class="action-stack">
            <v-btn color="primary" size="large" block @click="router.push('/')">
              Continue Shopping
            </v-btn>
            <v-btn variant="outlined" size="large" block @click="router.push('/cart')">
              View Cart
            </v-btn>
          </div>
        </template>
      </div>
    </v-main>
  </v-app>
</template>

<style scoped>
/* CSS Variables for safe area insets */
:root {
  --sat: env(safe-area-inset-top);
  --sar: env(safe-area-inset-right);
  --sab: env(safe-area-inset-bottom);
  --sal: env(safe-area-inset-left);
}

/* Top Navigation Bar - Fixed for notches */
.top-nav {
  padding-top: env(safe-area-inset-top);
  background: linear-gradient(135deg, #3f83c7, #2f6ca9) !important;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.12) !important;
}

/* For iOS devices with dynamic island */
@supports (padding-top: env(safe-area-inset-top)) {
  .top-nav {
    padding-top: env(safe-area-inset-top);
    height: calc(56px + env(safe-area-inset-top)) !important;
  }
}

/* For older iOS devices */
@supports (padding-top: constant(safe-area-inset-top)) {
  .top-nav {
    padding-top: constant(safe-area-inset-top);
    height: calc(56px + constant(safe-area-inset-top)) !important;
  }
}

/* Ensure toolbar content is properly aligned */
.top-nav :deep(.v-toolbar__content) {
  height: 56px !important;
  padding-top: 0 !important;
}

.top-nav :deep(.v-toolbar-title) {
  font-size: 1.05rem;
  font-weight: 700;
  letter-spacing: 0.2px;
}

.top-nav :deep(.v-btn) {
  color: white !important;
}

/* iOS support for margin-top */
@supports (padding-top: env(safe-area-inset-top)) {
  .top-nav {
    padding-top: env(safe-area-inset-top);
  }
}

/* Landscape mode adjustment */
@media (orientation: landscape) and (max-height: 500px) {
  .top-nav {
    height: 56px !important;
    padding-top: 0 !important;
  }
}

.success-page {
  min-height: 100vh;
  background:
    radial-gradient(circle at top right, rgba(82, 160, 220, 0.22), transparent 32%),
    linear-gradient(180deg, #f3f8fc 0%, #fbfdff 46%, #ffffff 100%);
}

.page-shell {
  max-width: 760px;
  margin: 0 auto;
  padding: 20px 16px calc(32px + env(safe-area-inset-bottom));
}

.state-card {
  min-height: 60vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  text-align: center;
}

.state-title {
  margin: 0;
  font-size: 1rem;
  font-weight: 700;
  color: #0f172a;
}

.state-copy {
  margin: 0;
  max-width: 320px;
  color: #5f6f82;
}

.hero-card {
  padding: 22px 20px;
  border-radius: 10px;
  color: #ffffff;
  background: linear-gradient(140deg, #2f78bb 0%, #4898d5 48%, #66b3ea 100%);
  box-shadow: 0 24px 60px rgba(47, 120, 187, 0.24);
}

.hero-header {
  display: flex;
  align-items: flex-start;
  gap: 14px;
}

.hero-icon {
  flex-shrink: 0;
  background: rgba(255, 255, 255, 0.16);
  color: #ffffff;
  border: 1px solid rgba(255, 255, 255, 0.18);
}

.hero-copy {
  min-width: 0;
}

.hero-eyebrow {
  margin: 0 0 4px;
  font-size: 0.82rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.78);
}

.hero-title {
  margin: 0;
  font-size: 1.55rem;
  line-height: 1.15;
  font-weight: 800;
}

.hero-description {
  margin: 10px 0 0;
  line-height: 1.6;
  color: rgba(255, 255, 255, 0.88);
}

.hero-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  margin-top: 18px;
}

.hero-pill {
  display: inline-flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  padding: 10px 14px;
  border-radius: 18px;
  background: rgba(4, 21, 60, 0.12);
  border: 1px solid rgba(255, 255, 255, 0.12);
}

.hero-pill strong {
  overflow-wrap: anywhere;
}

.hero-pill__label {
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: rgba(255, 255, 255, 0.7);
}

.status-chip {
  font-weight: 700;
}

.hero-total {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  margin-top: 18px;
  padding-top: 16px;
  border-top: 1px solid rgba(255, 255, 255, 0.18);
}

.hero-total span {
  color: rgba(255, 255, 255, 0.76);
}

.hero-total strong {
  font-size: 1.45rem;
  line-height: 1;
}

.content-stack {
  display: grid;
  gap: 16px;
  margin-top: 18px;
}

.info-card {
  border: 1px solid rgba(200, 216, 232, 0.7);
  background: rgba(255, 255, 255, 0.94);
  box-shadow: 0 18px 44px rgba(16, 24, 40, 0.06);
}

.section-title {
  padding: 18px 18px 6px;
  font-size: 1rem;
  font-weight: 700;
  color: #0f172a;
}

.section-body {
  padding: 6px 18px 18px !important;
}

.info-row {
  display: grid;
  gap: 6px;
}

.info-row + .info-row {
  margin-top: 14px;
}

.info-label {
  font-size: 0.76rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #6b7b90;
}

.info-value {
  color: #152235;
  line-height: 1.58;
  overflow-wrap: anywhere;
}

.strong-text {
  font-weight: 700;
}

.address-value {
  white-space: normal;
}

.payment-status {
  display: flex;
  align-items: center;
}

.totals-box {
  margin-top: 18px;
  padding: 14px;
  border-radius: 18px;
  background: #f6fafd;
  border: 1px solid #e2edf6;
}

.totals-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  color: #334155;
}

.totals-row + .totals-row {
  margin-top: 10px;
}

.totals-row--grand {
  padding-top: 10px;
  border-top: 1px solid #dce8f4;
  font-size: 1rem;
  color: #0f172a;
}

.item-list {
  display: grid;
  gap: 12px;
}

.item-row {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border-radius: 18px;
  border: 1px solid #e3edf6;
  background: #fcfdff;
}

.item-avatar {
  border: 1px solid #d9e7f3;
  background: #eef5fb;
}

.item-copy {
  min-width: 0;
}

.item-name {
  font-weight: 700;
  color: #122033;
  line-height: 1.35;
}

.item-variant {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 12px;
  margin-top: 4px;
  font-size: 0.82rem;
  color: #587088;
}

.item-meta {
  margin-top: 6px;
  font-size: 0.88rem;
  color: #516579;
}

.item-total {
  text-align: right;
  font-weight: 700;
  color: #0f172a;
}

.empty-items {
  display: flex;
  align-items: center;
  gap: 10px;
  color: #64748b;
}

.action-stack {
  display: grid;
  gap: 12px;
  margin-top: 18px;
}

@media (min-width: 768px) {
  .page-shell {
    padding: 28px 24px calc(40px + env(safe-area-inset-bottom));
  }

  .hero-card {
    padding: 26px 24px;
  }

  .content-stack {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .info-card:last-child {
    grid-column: 1 / -1;
  }

  .action-stack {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 600px) {
  .page-shell {
    padding-inline: 14px;
  }

  .hero-card {
    padding: 18px 15px;
    border-radius: 10px;
  }

  .hero-title {
    font-size: 1.35rem;
  }

  .hero-header {
    gap: 12px;
  }

  .hero-total {
    align-items: flex-start;
    flex-direction: column;
  }

  .item-row {
    grid-template-columns: auto minmax(0, 1fr);
  }

  .item-total {
    grid-column: 2;
    text-align: left;
  }
}
</style>
