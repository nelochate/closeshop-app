<template>
  <v-app>
    <v-main class="order-details-page">
      <div class="header-section">
        <div class="header-section__inner">
          <div class="header-section__lead">
            <v-btn icon variant="text" class="back-btn" @click="goBack">
              <v-icon size="28">mdi-arrow-left</v-icon>
            </v-btn>
            <h1 class="page-title">Order Details</h1>
          </div>
        </div>
      </div>

      <v-container class="pa-4">
        <!-- Loading State -->
        <div v-if="loading" class="text-center pa-8">
          <v-progress-circular indeterminate color="#354d7c" size="64"></v-progress-circular>
          <p class="mt-4">Loading order details...</p>
        </div>

        <!-- Error State -->
        <div v-else-if="error" class="text-center pa-8">
          <v-icon size="80" color="error">mdi-alert-circle</v-icon>
          <h3 class="mt-4">Error Loading Order</h3>
          <p class="text-grey">{{ error }}</p>
          <v-btn color="primary" @click="goBack">Go Back</v-btn>
        </div>

        <!-- Order Details -->
        <div v-else-if="order" class="order-details-container">
          <!-- Order Status -->
          <div class="order-status-section">
            <div class="status-chip" :class="getStatusClass(order)">
              {{ getStatusText(order) }}
            </div>
            <p class="status-caption">{{ trackingMapTitle }}</p>
          </div>

          <!-- Route Information -->
          <v-card class="info-card mb-4 tracking-section-card" rounded="xl">
            <v-card-title class="info-title">
              <v-icon size="20" color="#354d7c">mdi-map-marker-path</v-icon>
              <span>Live Delivery Map</span>
            </v-card-title>
            <v-divider></v-divider>
            <v-card-text class="pa-4">
              <OrderTrackingMap
                :order-id="String(orderId)"
                :pickup-location="pickupTrackingLocation"
                :delivery-location="deliveryTrackingLocation"
                :rider-location="persistedRiderTrackingLocation"
                viewer-mode="rider"
                :track-own-location="shouldTrackOwnLocation"
                :title="trackingMapTitle"
                subtitle="Use the map below to compare your current position, the pickup point, and the customer address."
                :show-fullscreen-button="true"
                @open-fullscreen="goToLocationToDeliver"
              />

              <div class="route-summary-grid">
                <div class="route-summary-item">
                  <span class="route-summary-label">Pickup</span>
                  <strong>{{ order.shop_name }}</strong>
                  <span>{{ order.pickup_address }}</span>
                </div>
                <div class="route-summary-item">
                  <span class="route-summary-label">Customer</span>
                  <strong>{{ order.customer_name }}</strong>
                  <span>{{ order.delivery_address }}</span>
                </div>
                <div class="route-summary-item">
                  <span class="route-summary-label">Contact</span>
                  <strong>{{ order.customer_phone || 'No phone provided' }}</strong>
                  <span>Reach the customer if delivery details need confirmation.</span>
                </div>
              </div>
            </v-card-text>
          </v-card>

          <!-- Order Items -->
          <v-card class="info-card mb-4" rounded="lg">
            <v-card-title class="info-title">
              <v-icon size="20" color="#354d7c">mdi-shopping-bag</v-icon>
              <span>Order Items</span>
            </v-card-title>
            <v-divider></v-divider>
            <v-card-text class="pa-0">
              <v-table density="compact">
                <thead>
                  <tr>
                    <th>Image</th>
                    <th>Item</th>
                    <th class="text-center">Qty</th>
                    <th class="text-right">Price</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="item in order.items" :key="item.id">
                    <td style="width: 50px">
                      <div @click="viewFullImage(item.image, item.name)" style="cursor: pointer">
                        <v-img
                          v-if="item.image"
                          :src="item.image"
                          width="40"
                          height="40"
                          class="rounded"
                          cover
                          @error="handleImageError"
                        >
                          <template #placeholder>
                            <v-icon>mdi-package</v-icon>
                          </template>
                        </v-img>
                        <v-icon v-else>mdi-package</v-icon>
                      </div>
                    </td>
                    <td>{{ item.name }}</td>
                    <td class="text-center">x{{ item.quantity }}</td>
                    <td class="text-right">₱{{ formatNumber(item.price * item.quantity) }}</td>
                  </tr>
                  <tr class="subtotal-row">
                    <td colspan="3" class="text-right font-weight-bold">Subtotal:</td>
                    <td class="text-right">₱{{ formatNumber(order.subtotal) }}</td>
                  </tr>
                  <tr>
                    <td colspan="3" class="text-right">Delivery Fee:</td>
                    <td class="text-right">₱{{ formatNumber(order.delivery_fee) }}</td>
                  </tr>
                  <tr class="total-row">
                    <td colspan="3" class="text-right font-weight-bold">Total:</td>
                    <td class="text-right font-weight-bold">
                      ₱{{ formatNumber(order.total_amount) }}
                    </td>
                  </tr>
                </tbody>
              </v-table>
            </v-card-text>
          </v-card>

          <!-- Payment Information -->
          <v-card class="info-card mb-4" rounded="lg">
            <v-card-title class="info-title">
              <v-icon size="20" color="#354d7c">mdi-credit-card</v-icon>
              <span>Payment Information</span>
            </v-card-title>
            <v-divider></v-divider>
            <v-card-text class="pa-4">
              <div class="payment-info">
                <div class="payment-field">
                  <span class="field-label">Method:</span>
                  <span class="field-value">{{ order.payment_method || 'Cash' }}</span>
                </div>
                <div class="payment-field">
                  <span class="field-label">Delivery Option:</span>
                  <span class="field-value">{{ order.delivery_option || 'Standard' }}</span>
                </div>
                <div class="payment-field" v-if="order.created_at">
                  <span class="field-label">Order Date:</span>
                  <span class="field-value">{{ formatDateTime(order.created_at) }}</span>
                </div>
                <div class="payment-field" v-if="riderPayQuote && riderPayQuote.distanceKm !== null">
                  <span class="field-label">Route:</span>
                  <span class="field-value">{{
                    formatRiderDistanceLabel(riderPayQuote.distanceKm)
                  }}</span>
                </div>
                <div class="payment-field" v-if="riderPayQuote">
                  <span class="field-label">Rider Pay:</span>
                  <span class="field-value">
                    {{ riderPayQuote.isEstimated ? 'Estimated ' : '' }}{{
                      formatPhpAmount(riderPayQuote.totalPay)
                    }}
                  </span>
                </div>
              </div>
            </v-card-text>
          </v-card>

          <!-- Proof of Delivery Section - Only show for delivered/completed orders -->
          <v-card v-if="showDeliveryProofSection" class="info-card mb-4" rounded="lg">
            <v-card-title class="info-title">
              <v-icon size="20" color="#4caf50">mdi-camera</v-icon>
              <span>Proof of Delivery</span>
            </v-card-title>
            <v-divider></v-divider>
            <v-card-text class="pa-4">
              <div v-if="proofOfDeliveryUrl" class="proof-container">
                <div
                  class="proof-image-wrapper"
                  @click="viewFullImage(proofOfDeliveryUrl, 'Proof of Delivery')"
                >
                  <v-img :src="proofOfDeliveryUrl" height="200" cover class="rounded proof-image">
                    <template #placeholder>
                      <div class="d-flex align-center justify-center" style="height: 200px">
                        <v-progress-circular indeterminate color="primary"></v-progress-circular>
                      </div>
                    </template>
                  </v-img>
                </div>
                <div class="text-center mt-3">
                  <v-btn
                    size="small"
                    color="primary"
                    variant="text"
                    @click="viewFullImage(proofOfDeliveryUrl, 'Proof of Delivery')"
                  >
                    <v-icon left size="small">mdi-magnify</v-icon>
                    View Full Size
                  </v-btn>
                </div>
                <div class="proof-info mt-3">
                  <div class="proof-field">
                    <v-icon size="16" color="success" class="mr-1">mdi-check-circle</v-icon>
                    <span class="proof-label">Latest delivery update:</span>
                    <span class="proof-value">{{
                      formatDateTime(order.delivered_at || order.updated_at || order.completed_at)
                    }}</span>
                  </div>
                </div>
              </div>
              <div v-else class="text-center py-4">
                <v-icon size="48" color="grey-lighten-1">mdi-image-off</v-icon>
                <p class="mt-2 text-grey">No proof of delivery image available</p>
              </div>
            </v-card-text>
          </v-card>
        </div>
      </v-container>
    </v-main>

    <div v-if="showActionBar" class="delivery-action-bar">
      <div
        class="delivery-action-bar__inner"
        :class="[
          `delivery-action-bar__inner--${actionBarTone}`,
          { 'delivery-action-bar__inner--has-action': !!primaryAction },
        ]"
      >
        <div class="delivery-action-bar__copy">
          <span class="delivery-action-bar__eyebrow">{{ actionBarEyebrow }}</span>
          <strong class="delivery-action-bar__title">{{ actionBarTitle }}</strong>
          <p class="delivery-action-bar__message">{{ actionBarMessage }}</p>
        </div>

        <v-btn
          v-if="primaryAction"
          :color="primaryAction.color"
          size="large"
          class="delivery-action-bar__button"
          :loading="primaryAction.loading"
          :disabled="primaryAction.disabled"
          @click="primaryAction.onClick"
        >
          <v-icon start>{{ primaryAction.icon }}</v-icon>
          {{ primaryAction.label }}
        </v-btn>
      </div>
    </div>

    <!-- Accept Order Dialog -->
    <v-dialog v-model="showAcceptDialog" max-width="400">
      <v-card>
        <v-card-title class="text-h6">Accept Order</v-card-title>
        <v-card-text>
          <p>Are you sure you want to accept this order?</p>
          <p class="text-caption text-grey">You will have 30 minutes to pick up the order.</p>
          <p class="text-caption text-grey">
            Note: If the order is not picked up or delivered, it will be automatically cancelled and
            you may receive a penalty. Please make sure you can fulfill the order before accepting.
          </p>
        </v-card-text>
        <v-card-actions>
          <v-btn variant="text" @click="showAcceptDialog = false">Cancel</v-btn>
          <v-spacer></v-spacer>
          <v-btn color="primary" :loading="accepting" @click="confirmAcceptOrder">Confirm</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Update Status Dialog (for picked up) -->
    <v-dialog v-model="showUpdateDialog" max-width="400">
      <v-card>
        <v-card-title class="text-h6">Update Order Status</v-card-title>
        <v-card-text>
          <p>
            Are you sure you want to mark this order as <strong>{{ updateStatusText }}</strong
            >?
          </p>
        </v-card-text>
        <v-card-actions>
          <v-btn variant="text" @click="showUpdateDialog = false">Cancel</v-btn>
          <v-spacer></v-spacer>
          <v-btn color="primary" :loading="updating" @click="confirmUpdateStatus">Confirm</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Proof of Delivery Dialog with Capacitor Camera - FIXED VERSION -->
    <v-dialog v-model="showProofDialog" max-width="500">
      <v-card>
        <v-card-title class="text-h6">
          <v-icon left color="success">mdi-camera</v-icon>
          Proof of Delivery
        </v-card-title>
        <v-divider></v-divider>

        <v-card-text class="pa-4">
          <div class="text-center mb-4">
            <p class="font-weight-medium">Take a photo as proof of delivery</p>
            <p class="text-caption text-grey">
              Take a clear photo of the delivered package at the customer's location
            </p>
          </div>

          <!-- Image Preview -->
          <div v-if="proofImagePreview" class="proof-preview mb-4">
            <v-img
              :src="proofImagePreview"
              height="250"
              cover
              class="rounded"
              style="cursor: pointer"
              @click="takePhoto"
            >
              <template #placeholder>
                <div class="d-flex align-center justify-center" style="height: 250px">
                  <v-progress-circular indeterminate color="primary"></v-progress-circular>
                </div>
              </template>
            </v-img>
            <div class="text-center mt-3">
              <v-btn size="small" variant="text" @click="takePhoto">
                <v-icon size="small" left>mdi-camera-retake</v-icon>
                Retake Photo
              </v-btn>
              <v-btn size="small" variant="text" @click="chooseFromGallery" class="ml-2">
                <v-icon size="small" left>mdi-folder-image</v-icon>
                Choose from Gallery
              </v-btn>
            </div>
          </div>

          <!-- Camera Options -->
          <div v-else class="camera-options">
            <div class="d-flex flex-column gap-3">
              <v-btn color="primary" size="large" block @click="takePhoto" class="mb-2" height="56">
                <v-icon left size="28">mdi-camera</v-icon>
                Take Photo
              </v-btn>

              <v-btn size="large" block variant="outlined" @click="chooseFromGallery" height="56">
                <v-icon left size="28">mdi-folder-image</v-icon>
                Choose from Gallery
              </v-btn>
            </div>
            <p class="text-caption text-grey mt-3 text-center">
              Use camera to take a photo or select from gallery
            </p>
          </div>

          <v-alert v-if="!proofImagePreview" type="info" variant="tonal" class="mt-4">
            <div class="d-flex align-center">
              <v-icon left class="mr-2">mdi-information</v-icon>
              <span
                >Please take a clear photo showing the delivered package at the customer's
                location.</span
              >
            </div>
          </v-alert>
        </v-card-text>

        <v-card-actions class="pa-4">
          <v-btn variant="text" @click="showProofDialog = false">Cancel</v-btn>
          <v-spacer></v-spacer>
          <v-btn
            color="success"
            :disabled="!proofImagePreview || uploadingProof"
            :loading="uploadingProof"
            @click="confirmUpdateStatus"
          >
            <v-icon left>mdi-check</v-icon>
            Confirm Delivery
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Full Screen Image Preview Dialog -->
    <v-dialog v-model="showImageDialog" max-width="90vw" @click:outside="showImageDialog = false">
      <v-card class="image-preview-dialog">
        <v-card-title class="dialog-header d-flex justify-space-between align-center">
          <span class="text-h6">{{ selectedProductName }}</span>
          <v-btn icon @click="showImageDialog = false">
            <v-icon>mdi-close</v-icon>
          </v-btn>
        </v-card-title>
        <v-divider></v-divider>
        <v-card-text class="text-center pa-4">
          <v-img
            v-if="selectedImage"
            :src="selectedImage"
            :alt="selectedProductName"
            max-height="70vh"
            max-width="100%"
            contain
            class="mx-auto"
          >
            <template #placeholder>
              <div class="d-flex align-center justify-center" style="height: 300px">
                <v-progress-circular indeterminate color="primary"></v-progress-circular>
              </div>
            </template>
          </v-img>
          <div v-else class="text-center pa-8">
            <v-icon size="64" color="grey">mdi-image-off</v-icon>
            <p class="mt-2">No image available</p>
          </div>
        </v-card-text>
        <v-card-actions class="dialog-actions">
          <v-btn color="primary" @click="showImageDialog = false">Close</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-app>
</template>

<script setup>
import { ref, onMounted, onUnmounted, computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { supabase } from '@/utils/supabase'
import { notifyCustomerOrderStatus, notifySellerOrderStatus } from '@/utils/orderNotifications'
import { ensureOrderAutoCompletionUpToDate } from '@/utils/orderAutoCompletion'
import { formatAppDateTime } from '@/utils/dateTime'
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera'
import OrderTrackingMap from '@/components/OrderTrackingMap.vue'
import {
  buildDeliveryAddress,
  extractPersistedRiderCoordinates,
  resolveTrackingLocation,
} from '@/utils/orderTracking'
import {
  formatPhpAmount,
  formatRiderDistanceLabel,
  resolveOrderRiderEarningsQuote,
} from '@/utils/riderEarnings.js'
import {
  calculateOrderItemsSubtotal,
  resolveOrderDeliveryFee,
} from '@/utils/deliveryPricing.js'

const router = useRouter()
const route = useRoute()
const orderId = route.params.id

// State
const order = ref(null)
const loading = ref(true)
const error = ref(null)
const showAcceptDialog = ref(false)
const showUpdateDialog = ref(false)
const accepting = ref(false)
const updating = ref(false)
const pendingStatusUpdate = ref(null)
const showImageDialog = ref(false)
const selectedImage = ref(null)
const selectedProductName = ref('')
const currentRiderNumericId = ref(null)
const currentRider = ref(null)
const pickupTrackingLocation = ref(null)
const deliveryTrackingLocation = ref(null)
let statusSubscription = null

// State for proof of delivery with Capacitor Camera
const showProofDialog = ref(false)
const proofImage = ref(null)
const proofImagePreview = ref(null)
const uploadingProof = ref(false)

// Helper functions
const formatNumber = (num) => {
  if (!num) return '0'
  return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const formatDateTime = (dateString) => {
  return formatAppDateTime(dateString, {
    fallback: '',
    month: 'short',
    year: 'auto',
  })
}

const riderPayQuote = computed(() => resolveOrderRiderEarningsQuote(order.value))

const proofOfDeliveryUrl = computed(
  () => order.value?.proof_of_delivery_url || order.value?.delivery_proof_url || '',
)
const isOrderCompleted = (orderRecord = null) =>
  !!orderRecord?.completed_at || orderRecord?.status === 'completed'
const hasOrderAwaitingCustomerConfirmation = (orderRecord = null) =>
  ['picked_up', 'delivered'].includes(orderRecord?.status || '') &&
  !!(orderRecord?.proof_of_delivery_url || orderRecord?.delivery_proof_url) &&
  !!orderRecord?.delivered_at &&
  !orderRecord?.completed_at
const hasOrderDeliveryIssue = (orderRecord = null) =>
  orderRecord?.status === 'picked_up' &&
  !!(orderRecord?.proof_of_delivery_url || orderRecord?.delivery_proof_url) &&
  !orderRecord?.delivered_at &&
  !orderRecord?.completed_at
const deliveryIssueMessage =
  'The customer reported that the order was not received. Please coordinate with the seller or the support team for proper resolution.'

const isAwaitingCustomerConfirmation = computed(() =>
  hasOrderAwaitingCustomerConfirmation(order.value),
)
const hasDeliveryIssue = computed(() => hasOrderDeliveryIssue(order.value))
const isCompletedOrder = computed(() => isOrderCompleted(order.value))
const hasLockedDeliveryState = computed(
  () => isCompletedOrder.value || isAwaitingCustomerConfirmation.value,
)
const showDeliveryProofSection = computed(
  () =>
    !!proofOfDeliveryUrl.value ||
    !!order.value?.completed_at ||
    isAwaitingCustomerConfirmation.value ||
    hasDeliveryIssue.value,
)

const getStatusText = (orderRecord) => {
  if (isOrderCompleted(orderRecord)) return 'Completed'
  if (hasOrderDeliveryIssue(orderRecord)) return 'Delivery Issue'
  if (hasOrderAwaitingCustomerConfirmation(orderRecord)) return 'Delivered'

  const status = typeof orderRecord === 'string' ? orderRecord : orderRecord?.status
  const statusMap = {
    pending_approval: 'Pending Seller Approval',
    waiting_for_rider: 'Available for Pickup',
    accepted_by_rider: 'Accepted by Rider',
    picked_up: 'Picked Up',
    completed: 'Completed',
    cancelled: 'Cancelled',
  }
  return statusMap[status] || status
}

const getStatusClass = (orderRecord) => {
  if (isOrderCompleted(orderRecord)) return 'status-completed'
  if (hasOrderDeliveryIssue(orderRecord)) return 'status-issue'
  if (hasOrderAwaitingCustomerConfirmation(orderRecord)) return 'status-delivered'

  const status = typeof orderRecord === 'string' ? orderRecord : orderRecord?.status
  const classMap = {
    pending_approval: 'status-pending',
    waiting_for_rider: 'status-waiting',
    accepted_by_rider: 'status-accepted',
    picked_up: 'status-picked',
    completed: 'status-completed',
    cancelled: 'status-cancelled',
  }
  return classMap[status] || 'status-default'
}

const updateStatusText = computed(() => {
  const statusMap = {
    picked_up: 'Picked Up',
    delivered: 'Delivered',
  }
  return statusMap[pendingStatusUpdate.value] || pendingStatusUpdate.value
})

const handleImageError = (event) => {
  const img = event.target
  img.src = 'https://via.placeholder.com/32?text=No+Image'
  img.onerror = null
}

const viewFullImage = (imageUrl, productName) => {
  selectedImage.value = imageUrl
  selectedProductName.value = productName
  showImageDialog.value = true
}

// Get current rider info
const getCurrentRider = async () => {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return

    const { data, error } = await supabase
      .from('Rider_Registration')
      .select('rider_id, first_name, last_name, email, phone')
      .eq('profile_id', user.id)
      .single()

    if (!error && data) {
      currentRiderNumericId.value = data.rider_id
      currentRider.value = data
    }
  } catch (error) {
    console.error('Error getting rider:', error)
  }
}

const getProfileDisplayName = (profile = {}) => {
  return [profile?.first_name, profile?.last_name]
    .filter((value) => typeof value === 'string' && value.trim())
    .join(' ')
    .trim()
}

const getCustomerDisplayName = ({ address = {}, user = {} } = {}) => {
  return address?.recipient_name?.trim() || getProfileDisplayName(user) || 'Recipient unavailable'
}

const loadTrackingLocations = async (data) => {
  const shop = data?.shop || {}
  const address = data?.address || {}
  const customerName = getCustomerDisplayName({
    address,
    user: data?.user,
  })

  const pickupQuery = [shop.building, shop.street, shop.barangay, shop.city, shop.province]
    .filter(Boolean)
    .join(', ')
  const deliveryQuery = [
    address.house_no,
    address.building,
    address.street,
    address.barangay_name,
    address.city_name,
    address.province_name,
  ]
    .filter(Boolean)
    .join(', ')

  pickupTrackingLocation.value = await resolveTrackingLocation({
    name: shop.business_name || 'Pickup point',
    address: order.value?.pickup_address || 'Store address',
    lat: shop.latitude,
    lng: shop.longitude,
    fallbackQuery: pickupQuery || undefined,
  })

  deliveryTrackingLocation.value = await resolveTrackingLocation({
    name: customerName,
    address: buildDeliveryAddress(address),
    lat: address.latitude,
    lng: address.longitude,
    fallbackQuery: deliveryQuery || undefined,
  })
}

const subscribeToOrderUpdates = () => {
  if (statusSubscription) supabase.removeChannel(statusSubscription)

  statusSubscription = supabase
    .channel(`rider-order-${orderId}`)
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'orders',
        filter: `id=eq.${orderId}`,
      },
      async () => {
        await fetchOrderDetails()
      },
    )
    .subscribe()
}

// Fetch order details
const fetchOrderDetails = async () => {
  loading.value = true
  error.value = null
  pickupTrackingLocation.value = null
  deliveryTrackingLocation.value = null
  try {
    const { data, error: fetchError } = await supabase
      .from('orders')
      .select(
        `
        *,
        order_items (
          id,
          quantity,
          price,
          selected_size,
          selected_variety,
          variety_data,
          products (
            id,
            prod_name,
            main_img_urls,
            price
          )
        ),
        user:profiles!orders_user_id_fkey (
          id,
          first_name,
          last_name,
          phone
        ),
        shop:shop_id (
          business_name,
          building,
          street,
          barangay,
          city,
          province,
          latitude,
          longitude
        ),
        address:addresses!orders_address_id_fkey (
          recipient_name,
          phone,
          street,
          building,
          house_no,
          barangay_name,
          city_name,
          province_name,
          latitude,
          longitude
        )
      `,
      )
      .eq('id', orderId)
      .single()

    if (fetchError) throw fetchError

    if (data) {
      const shop = data.shop || {}
      const pickupAddress =
        [shop.building, shop.street, shop.barangay, shop.city, shop.province]
          .filter(Boolean)
          .join(', ') || 'Store Address'

      const address = data.address || {}
      const user = data.user || {}
      const deliveryAddress =
        [
          address.house_no,
          address.building,
          address.street,
          address.barangay_name,
          address.city_name,
          address.province_name,
        ]
          .filter(Boolean)
          .join(', ') || 'Delivery Address'

      const customerName = getCustomerDisplayName({ address, user })

      const items = (data.order_items || []).map((item) => {
        const product = item.products || {}
        return {
          id: item.id,
          name: product.prod_name || 'Product',
          quantity: item.quantity,
          price: item.price,
          selected_size: item.selected_size,
          selected_variety: item.selected_variety,
          variety_data: item.variety_data,
          image: product.main_img_urls
            ? Array.isArray(product.main_img_urls)
              ? product.main_img_urls[0]
              : product.main_img_urls
            : null,
        }
      })

      const subtotal = calculateOrderItemsSubtotal(items)
      const deliveryFee = resolveOrderDeliveryFee({
        ...data,
        pickup_lat: shop.latitude,
        pickup_lng: shop.longitude,
        delivery_lat: address.latitude,
        delivery_lng: address.longitude,
      }, undefined, subtotal)

      order.value = await ensureOrderAutoCompletionUpToDate({
        ...data,
        pickup_address: pickupAddress,
        delivery_address: deliveryAddress,
        customer_name: customerName,
        customer_phone: data.contact_number || address.phone || user.phone || '',
        shop_name: shop.business_name || 'Shop',
        pickup_lat: shop.latitude,
        pickup_lng: shop.longitude,
        delivery_lat: address.latitude,
        delivery_lng: address.longitude,
        items: items,
        subtotal: subtotal,
        delivery_fee: deliveryFee,
      })

      await loadTrackingLocations(data)
      subscribeToOrderUpdates()
    }
  } catch (err) {
    console.error('Error fetching order:', err)
    error.value = 'Failed to load order details'
  } finally {
    loading.value = false
  }
}

// Accept order
const acceptOrder = () => {
  showAcceptDialog.value = true
}

const confirmAcceptOrder = async () => {
  if (!isAvailableForAcceptance.value || !currentRiderNumericId.value) {
    alert('This order is no longer available for acceptance.')
    showAcceptDialog.value = false
    return
  }

  accepting.value = true
  try {
    const acceptedAt = new Date().toISOString()

    const { data, error } = await supabase
      .from('orders')
      .update({
        status: 'accepted_by_rider',
        rider_id: currentRiderNumericId.value,
        accepted_at: acceptedAt,
      })
      .eq('id', orderId)
      .is('rider_id', null)
      .eq('status', 'waiting_for_rider')
      .select('id')

    if (error) throw error

    if (!data || data.length === 0) {
      alert('⚠️ This order was just taken by another rider!')
      showAcceptDialog.value = false
      await fetchOrderDetails()
      return
    }

    showAcceptDialog.value = false
    try {
      await notifySellerOrderStatus({
        orderId,
        status: 'accepted_by_rider',
        createdAt: acceptedAt,
        orderData: order.value,
      })
    } catch (notificationError) {
      console.warn('Could not notify seller about rider acceptance:', notificationError)
    }
    alert('✅ Order accepted successfully!')
    await fetchOrderDetails()
  } catch (error) {
    console.error('Error accepting order:', error)
    alert('Failed to accept order. Please try again.')
  } finally {
    accepting.value = false
  }
}

// Update order status (for picked up)
const updateOrderStatus = (status) => {
  if (isCompletedOrder.value) {
    alert('This order has already been completed.')
    return
  }

  if (isAwaitingCustomerConfirmation.value) {
    alert('Delivery actions are locked while waiting for customer confirmation.')
    return
  }

  if (!isMyOrder.value) {
    alert('Only the assigned rider can update this order.')
    return
  }

  pendingStatusUpdate.value = status
  showUpdateDialog.value = true
}

// Open proof of delivery dialog
const openProofDialog = () => {
  if (isCompletedOrder.value) {
    alert('This order has already been completed.')
    return
  }

  if (isAwaitingCustomerConfirmation.value) {
    alert('Delivery actions are locked while waiting for customer confirmation.')
    return
  }

  if (!isMyOrder.value) {
    alert('Only the assigned rider can update this order.')
    return
  }

  pendingStatusUpdate.value = 'delivered'
  showProofDialog.value = true
}

// Take photo with Capacitor Camera - FIXED VERSION
const takePhoto = async () => {
  try {
    // Close the dialog first
    showProofDialog.value = false

    // Small delay to ensure dialog is closed
    await new Promise((resolve) => setTimeout(resolve, 100))

    const photo = await Camera.getPhoto({
      resultType: CameraResultType.DataUrl,
      source: CameraSource.Camera,
      quality: 90,
      allowEditing: false,
      saveToGallery: false,
    })

    if (photo && photo.dataUrl) {
      // Convert dataUrl to file
      const response = await fetch(photo.dataUrl)
      const blob = await response.blob()
      const file = new File([blob], `delivery_proof_${Date.now()}.jpg`, { type: 'image/jpeg' })

      proofImagePreview.value = photo.dataUrl
      proofImage.value = file

      // Re-open dialog after photo is taken
      showProofDialog.value = true
    } else {
      // No photo taken, re-open dialog
      showProofDialog.value = true
    }
  } catch (error) {
    // Re-open dialog on error
    showProofDialog.value = true

    // Check if user cancelled
    if (error.message === 'User cancelled photos app') {
      console.log('User cancelled photo selection')
      return
    }

    console.error('Error taking photo:', error)
    alert('Failed to take photo. Please check camera permissions.')
  }
}

// Choose from gallery with Capacitor Camera - FIXED VERSION
const chooseFromGallery = async () => {
  try {
    // Close the dialog first
    showProofDialog.value = false

    // Small delay to ensure dialog is closed
    await new Promise((resolve) => setTimeout(resolve, 100))

    const photo = await Camera.getPhoto({
      resultType: CameraResultType.DataUrl,
      source: CameraSource.Photos,
      quality: 90,
      allowEditing: false,
    })

    if (photo && photo.dataUrl) {
      // Convert dataUrl to file
      const response = await fetch(photo.dataUrl)
      const blob = await response.blob()
      const file = new File([blob], `delivery_proof_${Date.now()}.jpg`, { type: 'image/jpeg' })

      proofImagePreview.value = photo.dataUrl
      proofImage.value = file

      // Re-open dialog after photo is selected
      showProofDialog.value = true
    } else {
      // No photo selected, re-open dialog
      showProofDialog.value = true
    }
  } catch (error) {
    // Re-open dialog on error
    showProofDialog.value = true

    // Check if user cancelled
    if (error.message === 'User cancelled photos app') {
      console.log('User cancelled photo selection')
      return
    }

    console.error('Error choosing from gallery:', error)
    alert('Failed to load image from gallery.')
  }
}

// Upload proof image to Supabase Storage - FIXED VERSION
const uploadProofImage = async () => {
  if (!proofImage.value) return null

  const fileExt = proofImage.value.name.split('.').pop()
  const fileName = `proof_${orderId}_${Date.now()}.${fileExt}`
  const filePath = `delivery_proofs/${fileName}`

  try {
    console.log('Uploading proof image...')

    const { error } = await supabase.storage
      .from('order-proofs')
      .upload(filePath, proofImage.value, {
        cacheControl: '3600',
        upsert: false,
        contentType: `image/${fileExt === 'jpg' ? 'jpeg' : fileExt}`,
      })

    if (error) {
      console.error('Upload error details:', error)
      throw error
    }

    // Get public URL
    const {
      data: { publicUrl },
    } = supabase.storage.from('order-proofs').getPublicUrl(filePath)

    console.log('Upload successful, public URL:', publicUrl)
    return publicUrl
  } catch (error) {
    console.error('Error uploading proof image:', error)
    throw new Error(`Failed to upload proof image: ${error.message}`)
  }
}

// Update order status with proof image - FIXED VERSION
const confirmUpdateStatus = async () => {
  if (isCompletedOrder.value) {
    alert('This order has already been completed.')
    showUpdateDialog.value = false
    showProofDialog.value = false
    pendingStatusUpdate.value = null
    return
  }

  if (isAwaitingCustomerConfirmation.value) {
    alert('Delivery actions are locked while waiting for customer confirmation.')
    showUpdateDialog.value = false
    showProofDialog.value = false
    pendingStatusUpdate.value = null
    return
  }

  if (pendingStatusUpdate.value === 'delivered' && !proofImage.value) {
    alert('Please take a photo as proof of delivery')
    return
  }

  if (!isMyOrder.value || !currentRiderNumericId.value) {
    alert('Only the assigned rider can update this order.')
    showUpdateDialog.value = false
    showProofDialog.value = false
    pendingStatusUpdate.value = null
    return
  }

  uploadingProof.value = true
  updating.value = true
  const statusToApply = pendingStatusUpdate.value
  const statusTimestamp = new Date().toISOString()
  try {
    let proofImageUrl = null

    // Upload proof image if this is a delivery
    if (statusToApply === 'delivered' && proofImage.value) {
      proofImageUrl = await uploadProofImage()
    }

    const updateData = {
      updated_at: statusTimestamp,
    }

    // Add delivery_proof_url if it exists
    if (proofImageUrl) {
      updateData.delivery_proof_url = proofImageUrl
    }

    if (statusToApply === 'picked_up') {
      updateData.status = 'picked_up'
      updateData.picked_up_at = statusTimestamp
    } else if (statusToApply === 'delivered') {
      updateData.delivered_at = statusTimestamp
    }

    const expectedCurrentStatus = statusToApply === 'picked_up' ? 'accepted_by_rider' : 'picked_up'

    let updateQuery = supabase
      .from('orders')
      .update(updateData)
      .eq('id', orderId)
      .eq('rider_id', currentRiderNumericId.value)
      .eq('status', expectedCurrentStatus)
    if (statusToApply === 'delivered') {
      updateQuery = updateQuery.is('delivered_at', null).is('completed_at', null)
    }

    const { data, error } = await updateQuery.select('id')

    if (error) throw error

    if (!data || data.length === 0) {
      throw new Error('This order can only be updated by the rider who accepted it.')
    }

    try {
      await notifyCustomerOrderStatus({
        orderId,
        status: statusToApply,
        createdAt: statusTimestamp,
        orderData: order.value,
      })
    } catch (notificationError) {
      console.warn('Could not notify customer about order status update:', notificationError)
    }

    try {
      await notifySellerOrderStatus({
        orderId,
        status: statusToApply,
        createdAt: statusTimestamp,
        orderData: order.value,
      })
    } catch (notificationError) {
      console.warn('Could not notify seller about order status update:', notificationError)
    }

    showProofDialog.value = false
    showUpdateDialog.value = false
    // Reset proof data
    proofImage.value = null
    proofImagePreview.value = null

    await fetchOrderDetails()
    alert(`Order marked as ${statusToApply.replace('_', ' ')}!`)

    // If delivered, go back to dashboard
    if (statusToApply === 'delivered') {
      setTimeout(() => {
        router.push('/RiderDashboard')
      }, 1500)
    }
  } catch (error) {
    console.error('Error updating order:', error)
    alert(error?.message || 'Failed to update order status. Please try again.')
  } finally {
    uploadingProof.value = false
    updating.value = false
    pendingStatusUpdate.value = null
  }
}

// Navigation
const goBack = () => {
  router.back()
}

const goToLocationToDeliver = () => {
  router.push(`/LocationToDeliver/${orderId}`)
}

// Determine if current rider is assigned to this order
const isMyOrder = computed(() => {
  return order.value?.rider_id === currentRiderNumericId.value
})

// Determine if order is available for acceptance
const isAvailableForAcceptance = computed(() => {
  return (
    order.value?.status === 'waiting_for_rider' && !order.value?.rider_id && !isCompletedOrder.value
  )
})

const shouldTrackOwnLocation = computed(() => {
  return (
    !!currentRiderNumericId.value &&
    !isCompletedOrder.value &&
    !['delivered', 'cancelled'].includes(order.value?.status)
  )
})

const persistedRiderTrackingLocation = computed(() => {
  const persisted = extractPersistedRiderCoordinates(order.value)

  if (!persisted) return null

  return {
    ...persisted,
    name: currentRider.value
      ? `${currentRider.value.first_name || ''} ${currentRider.value.last_name || ''}`.trim() ||
        'Assigned rider'
      : 'Assigned rider',
    address:
      currentRider.value?.phone || `${persisted.lat.toFixed(5)}, ${persisted.lng.toFixed(5)}`,
  }
})

const trackingMapTitle = computed(() => {
  if (hasDeliveryIssue.value) return 'Delivery issue reported - coordination needed'
  if (isCompletedOrder.value) return 'Customer confirmed receipt'
  if (isAwaitingCustomerConfirmation.value) return 'Waiting for customer confirmation'
  if (order.value?.status === 'picked_up') return 'Delivering to customer'
  if (order.value?.status === 'accepted_by_rider') return 'Heading to the pickup point'
  if (isAvailableForAcceptance.value) return 'Ready for pickup'
  return 'Route overview'
})

const canMarkAsPickedUp = computed(() => {
  return (
    isMyOrder.value && order.value?.status === 'accepted_by_rider' && !hasLockedDeliveryState.value
  )
})

const canMarkAsDelivered = computed(() => {
  return isMyOrder.value && order.value?.status === 'picked_up' && !hasLockedDeliveryState.value
})

const primaryAction = computed(() => {
  if (!order.value || isCompletedOrder.value || isAwaitingCustomerConfirmation.value) return null

  if (isAvailableForAcceptance.value) {
    return {
      label: 'Accept Order',
      icon: 'mdi-check-circle',
      color: 'success',
      loading: accepting.value,
      disabled: false,
      onClick: acceptOrder,
    }
  }

  if (canMarkAsPickedUp.value) {
    return {
      label: 'Mark as Picked Up',
      icon: 'mdi-truck',
      color: 'warning',
      loading: updating.value && pendingStatusUpdate.value === 'picked_up',
      disabled: false,
      onClick: () => updateOrderStatus('picked_up'),
    }
  }

  if (canMarkAsDelivered.value) {
    return {
      label: hasDeliveryIssue.value ? 'Reattempt Delivery' : 'Mark as Delivered',
      icon: hasDeliveryIssue.value ? 'mdi-alert-circle' : 'mdi-check-circle',
      color: hasDeliveryIssue.value ? 'warning' : 'success',
      loading: uploadingProof.value,
      disabled: false,
      onClick: openProofDialog,
    }
  }

  return null
})

const actionBarTone = computed(() => {
  if (isCompletedOrder.value) return 'success'
  if (hasDeliveryIssue.value) return 'warning'
  if (primaryAction.value?.label === 'Mark as Picked Up') return 'warning'
  if (primaryAction.value) return 'active'
  if (order.value?.status === 'pending_approval') return 'info'
  if (order.value?.rider_id && !isMyOrder.value) return 'warning'
  return 'info'
})

const actionBarEyebrow = computed(() => {
  if (isCompletedOrder.value) return 'Delivery complete'
  if (isAwaitingCustomerConfirmation.value) return 'Delivery submitted'
  if (primaryAction.value) return 'Next rider action'
  if (order.value?.status === 'pending_approval') return 'Order status'
  if (order.value?.rider_id && !isMyOrder.value) return 'Assignment status'
  return 'Delivery status'
})

const actionBarTitle = computed(() => {
  if (isCompletedOrder.value) return 'This order has been completed.'
  if (isAwaitingCustomerConfirmation.value) return 'Waiting for customer confirmation'
  if (hasDeliveryIssue.value) return 'Delivery issue reported'
  if (isAvailableForAcceptance.value) return 'Ready to accept this order'
  if (canMarkAsPickedUp.value) return 'Pickup is the next step'
  if (canMarkAsDelivered.value) return 'Finish the delivery workflow'
  if (order.value?.status === 'pending_approval') return 'Seller approval is still required'
  if (order.value?.rider_id && !isMyOrder.value) return 'This order is assigned to another rider'
  return 'No rider actions available'
})

const actionBarMessage = computed(() => {
  if (isCompletedOrder.value) {
    return 'Customer confirmation was received, so no further delivery actions are available.'
  }

  if (isAwaitingCustomerConfirmation.value) {
    return 'The proof of delivery has been uploaded. Delivery actions stay locked until the customer responds.'
  }

  if (hasDeliveryIssue.value) {
    return isMyOrder.value
      ? `${deliveryIssueMessage} When the order is ready again, use the action button below to continue.`
      : deliveryIssueMessage
  }

  if (isAvailableForAcceptance.value) {
    return 'Accept this order to begin the rider workflow and unlock the next delivery step.'
  }

  if (canMarkAsPickedUp.value) {
    return 'Once the package is with you, confirm pickup here so the delivery route can move forward.'
  }

  if (canMarkAsDelivered.value) {
    return 'After handing the order to the customer, upload proof and mark it as delivered from here.'
  }

  if (order.value?.status === 'pending_approval') {
    return 'The seller needs to approve this order before any rider can accept it.'
  }

  if (order.value?.rider_id && !isMyOrder.value) {
    return 'Another rider already accepted this order, so delivery actions are unavailable on this screen.'
  }

  return 'This order does not currently need a rider action.'
})

const showActionBar = computed(() => !!order.value && !loading.value && !error.value)

onMounted(async () => {
  await getCurrentRider()
  await fetchOrderDetails()
})

onUnmounted(() => {
  if (statusSubscription) supabase.removeChannel(statusSubscription)
})
</script>

<style scoped>
.order-details-page {
  background: linear-gradient(135deg, #f5f7fa 0%, #ffffff 100%);
  min-height: 100dvh;
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
  max-width: 1180px;
  margin: 0 auto;
  padding: 12px max(16px, env(safe-area-inset-left, 0px)) 12px
    max(16px, env(safe-area-inset-right, 0px));
}

.header-section__lead {
  display: flex;
  align-items: center;
  gap: 12px;
}

.back-btn {
  color: white !important;
}

.page-title {
  font-size: 1.5rem;
  font-weight: 600;
  margin: 0;
}

.order-details-container {
  padding-bottom: calc(180px + env(safe-area-inset-bottom, 0px));
}

.order-status-section {
  text-align: center;
  margin-bottom: 20px;
}

.status-chip {
  display: inline-block;
  padding: 8px 24px;
  border-radius: 30px;
  font-size: 0.9rem;
  font-weight: 600;
}

.status-caption {
  margin: 12px auto 0;
  max-width: 520px;
  color: #52667d;
  font-size: 0.92rem;
  line-height: 1.45;
}

.status-pending {
  background: #fff3e0;
  color: #ff9800;
}

.status-waiting {
  background: #e3f2fd;
  color: #2196f3;
}

.status-accepted {
  background: #e8eaf6;
  color: #3f51b5;
}

.status-picked {
  background: #f3e5f5;
  color: #9c27b0;
}

.status-delivered,
.status-completed {
  background: #e8f5e9;
  color: #4caf50;
}

.status-issue {
  background: #fff4e5;
  color: #b45309;
}

.status-cancelled {
  background: #ffebee;
  color: #f44336;
}

.info-card {
  overflow: hidden;
}

.tracking-section-card {
  border: 1px solid rgba(53, 77, 124, 0.08);
  box-shadow: 0 20px 44px rgba(18, 48, 79, 0.08);
}

.info-title {
  font-weight: 600;
  color: #354d7c;
  font-size: 1rem;
}

.route-summary-grid {
  margin-top: 16px;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.route-summary-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 14px;
  border-radius: 18px;
  background: linear-gradient(180deg, #f8fbff, #eef4fc);
  border: 1px solid rgba(53, 77, 124, 0.07);
  color: #12304f;
}

.route-summary-label {
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #5276b0;
  font-weight: 700;
}

.route-point {
  display: flex;
  gap: 12px;
  margin: 12px 0;
}

.point-marker {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: bold;
  font-size: 0.9rem;
  color: white;
  flex-shrink: 0;
}

.point-marker.pickup {
  background: #4caf50;
}

.point-marker.delivery {
  background: #f44336;
}

.point-details {
  flex: 1;
}

.point-label {
  font-size: 0.7rem;
  color: #999;
  text-transform: uppercase;
}

.point-address {
  font-size: 0.85rem;
  font-weight: 500;
  color: #333;
  margin-bottom: 4px;
}

.route-line {
  width: 2px;
  height: 20px;
  background: #ddd;
  margin-left: 15px;
}

.subtotal-row,
.total-row {
  border-top: 1px solid #eee;
}

.total-row {
  background: #f8fafc;
  font-weight: bold;
}

.payment-info {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.payment-field {
  display: flex;
}

.field-label {
  width: 100px;
  font-size: 0.8rem;
  color: #666;
  font-weight: 500;
}

.field-value {
  flex: 1;
  font-size: 0.9rem;
  color: #333;
}

/* Proof of Delivery Styles */
.proof-container {
  text-align: center;
}

.proof-image-wrapper {
  cursor: pointer;
  border-radius: 12px;
  overflow: hidden;
  transition:
    transform 0.2s ease,
    box-shadow 0.2s ease;
}

.proof-image-wrapper:hover {
  transform: scale(1.02);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.proof-image {
  transition: all 0.3s ease;
}

.proof-info {
  background: #f5f5f5;
  padding: 12px;
  border-radius: 8px;
  display: inline-block;
  width: 100%;
}

.proof-field {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  font-size: 0.85rem;
}

.proof-label {
  color: #666;
  font-weight: 500;
}

.proof-value {
  color: #333;
  font-weight: 600;
}

.delivery-action-bar {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 120;
  padding: 12px max(16px, env(safe-area-inset-left, 0px))
    calc(12px + env(safe-area-inset-bottom, 0px)) max(16px, env(safe-area-inset-right, 0px));
  background: linear-gradient(180deg, rgba(245, 247, 250, 0), rgba(245, 247, 250, 0.88) 28%);
  pointer-events: none;
}

.delivery-action-bar__inner {
  max-width: 1180px;
  margin: 0 auto;
  padding: 16px;
  border-radius: 22px;
  border: 1px solid rgba(53, 77, 124, 0.12);
  background: rgba(255, 255, 255, 0.94);
  box-shadow: 0 -10px 28px rgba(18, 48, 79, 0.12);
  backdrop-filter: blur(18px);
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 16px;
  align-items: center;
  pointer-events: auto;
}

.delivery-action-bar__inner--success {
  border-color: rgba(34, 160, 107, 0.2);
  background: linear-gradient(180deg, rgba(232, 245, 233, 0.95), rgba(255, 255, 255, 0.96));
}

.delivery-action-bar__inner--warning {
  border-color: rgba(245, 158, 11, 0.22);
  background: linear-gradient(180deg, rgba(255, 247, 230, 0.96), rgba(255, 255, 255, 0.96));
}

.delivery-action-bar__inner--info {
  border-color: rgba(63, 131, 199, 0.18);
  background: linear-gradient(180deg, rgba(239, 246, 255, 0.95), rgba(255, 255, 255, 0.96));
}

.delivery-action-bar__inner--active {
  border-color: rgba(47, 125, 225, 0.2);
}

.delivery-action-bar__copy {
  min-width: 0;
}

.delivery-action-bar__eyebrow {
  display: inline-block;
  margin-bottom: 6px;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #5276b0;
}

.delivery-action-bar__title {
  display: block;
  color: #12304f;
  font-size: 1rem;
  line-height: 1.3;
}

.delivery-action-bar__message {
  margin: 6px 0 0;
  color: #52667d;
  font-size: 0.85rem;
  line-height: 1.45;
}

.delivery-action-bar__button {
  min-width: 220px;
  font-weight: 700;
  text-transform: none;
  box-shadow: 0 14px 26px rgba(18, 48, 79, 0.12);
}

.dialog-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: linear-gradient(135deg, #354d7c, #5276b0);
  color: white;
  padding: 16px 20px;
}

.dialog-actions {
  padding: 16px;
}

.image-preview-dialog {
  border-radius: 16px;
  overflow: hidden;
}

.proof-preview {
  cursor: pointer;
}

.gap-3 {
  gap: 12px;
}

@media (max-width: 600px) {
  .header-section__inner {
    padding: 10px max(12px, env(safe-area-inset-left, 0px)) 10px
      max(12px, env(safe-area-inset-right, 0px));
  }

  .page-title {
    font-size: 1.2rem;
  }

  .status-caption {
    font-size: 0.84rem;
  }

  .field-label {
    width: 85px;
    font-size: 0.75rem;
  }

  .field-value {
    font-size: 0.8rem;
  }

  .point-address {
    font-size: 0.75rem;
  }

  .route-summary-grid {
    grid-template-columns: 1fr;
  }

  .proof-field {
    flex-direction: column;
    gap: 4px;
  }

  .order-details-container {
    padding-bottom: calc(220px + env(safe-area-inset-bottom, 0px));
  }

  .delivery-action-bar {
    padding: 10px max(12px, env(safe-area-inset-left, 0px))
      calc(10px + env(safe-area-inset-bottom, 0px)) max(12px, env(safe-area-inset-right, 0px));
  }

  .delivery-action-bar__inner {
    grid-template-columns: 1fr;
    gap: 14px;
    padding: 14px;
  }

  .delivery-action-bar__button {
    width: 100%;
    min-width: 0;
  }
}
</style>
