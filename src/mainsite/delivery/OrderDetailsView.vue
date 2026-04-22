<script setup>
import { ref, onMounted, computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { supabase } from '@/utils/supabase'
import { useAuthUserStore } from '@/stores/authUser'

const router = useRouter()
const route = useRoute()
const authStore = useAuthUserStore()
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

// Helper functions
const formatNumber = (num) => {
  if (!num) return '0'
  return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const formatDateTime = (dateString) => {
  if (!dateString) return ''
  const date = new Date(dateString)
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
}

const getStatusText = (status) => {
  const statusMap = {
    pending_approval: 'Pending Seller Approval',
    waiting_for_rider: 'Available for Pickup',
    accepted_by_rider: 'Accepted by Rider',
    picked_up: 'Picked Up',
    delivered: 'Delivered',
    completed: 'Completed',
    cancelled: 'Cancelled',
  }
  return statusMap[status] || status
}

const getStatusClass = (status) => {
  const classMap = {
    pending: 'status-pending',
    paid: 'status-paid',
    accepted: 'status-accepted',
    picked_up: 'status-picked',
    shipped: 'status-shipped',
    delivered: 'status-delivered',
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
    const { data: { user } } = await supabase.auth.getUser()
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
// Fetch order details
const fetchOrderDetails = async () => {
  loading.value = true
  error.value = null
  try {
    const { data, error: fetchError } = await supabase
      .from('orders')
      .select(`
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
        profiles:user_id (
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
        address:address_id (
          recipient_name,
          phone,
          street,
          building,
          house_no,
          barangay_name,
          city_name,
          province_name
        )
      `)
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

      const profile = data.profiles || {}
      const customerName =
        `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || 'Customer'

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

      const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0)
      const deliveryFee = data.total_amount - subtotal

      order.value = {
        ...data,
        pickup_address: pickupAddress,
        delivery_address: deliveryAddress,
        customer_name: customerName,
        customer_phone: profile.phone || address.phone || '',
        shop_name: shop.business_name || 'Shop',
        pickup_lat: shop.latitude,
        pickup_lng: shop.longitude,
        items: items,
        subtotal: subtotal,
        delivery_fee: deliveryFee,
      }
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
  accepting.value = true
  try {
    const { data, error } = await supabase
      .from('orders')
      .update({
        status: 'accepted_by_rider',
        rider_id: currentRiderNumericId.value,
        accepted_at: new Date().toISOString(),
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
    alert('✅ Order accepted successfully!')
    await fetchOrderDetails()

  } catch (error) {
    console.error('Error accepting order:', error)
    alert('Failed to accept order. Please try again.')
  } finally {
    accepting.value = false
  }
}

// Update order status
const updateOrderStatus = (status) => {
  pendingStatusUpdate.value = status
  showUpdateDialog.value = true
}

const confirmUpdateStatus = async () => {
  updating.value = true
  try {
    const updateData = { status: pendingStatusUpdate.value }

    if (pendingStatusUpdate.value === 'picked_up') {
      updateData.picked_up_at = new Date().toISOString()
    } else if (pendingStatusUpdate.value === 'delivered') {
      updateData.delivered_at = new Date().toISOString()
      updateData.completed_at = new Date().toISOString()
      updateData.rider_earnings = Math.round((order.value.delivery_fee || 0) * 0.8)
    }

    const { error } = await supabase
      .from('orders')
      .update(updateData)
      .eq('id', orderId)

    if (error) throw error

    showUpdateDialog.value = false
    await fetchOrderDetails()
    alert(`Order marked as ${pendingStatusUpdate.value.replace('_', ' ')}!`)
    
    // If delivered, go back to dashboard
    if (pendingStatusUpdate.value === 'delivered') {
      setTimeout(() => {
        router.push('/RiderDashboard')
      }, 1500)
    }
  } catch (error) {
    console.error('Error updating order:', error)
    alert('Failed to update order status. Please try again.')
  } finally {
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
  return order.value?.status === 'waiting_for_rider' && !order.value?.rider_id
})

onMounted(async () => {
  await getCurrentRider()
  await fetchOrderDetails()
})
</script>

<template>
  <v-app>
    <v-main class="order-details-page">
      <div class="header-section">
        <v-btn icon variant="text" class="back-btn" @click="goBack">
          <v-icon size="28">mdi-arrow-left</v-icon>
        </v-btn>
        <h1 class="page-title">Order Details</h1>
        <div style="width: 40px"></div>
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
            <div class="status-chip" :class="getStatusClass(order.status)">
              {{ getStatusText(order.status) }}
            </div>
          </div>

          <!-- Route Information -->
          <v-card class="info-card mb-4" rounded="lg">
            <v-card-title class="info-title">
              <v-icon size="20" color="#354d7c">mdi-map-marker-path</v-icon>
              <span>Route Information</span>
            </v-card-title>
            <v-divider></v-divider>
            <v-card-text class="pa-4">
              <div class="route-info">
                <div class="route-point">
                  <div class="point-marker pickup">P</div>
                  <div class="point-details">
                    <div class="point-label">Pickup Location</div>
                    <div class="point-address">{{ order.pickup_address }}</div>
                    <div class="point-label">Shop: {{ order.shop_name }}</div>
                  </div>
                </div>

                <div class="route-line"></div>

                <div class="route-point">
                  <div class="point-marker delivery">D</div>
                  <div class="point-details">
                    <div class="point-label">Delivery Location</div>
                    <div class="point-address">{{ order.delivery_address }}</div>
                    <div class="point-label">Customer: {{ order.customer_name }}</div>
                    <div class="point-label">Phone: {{ order.customer_phone }}</div>
                  </div>
                </div>
              </div>
              <v-btn color="primary" block class="mt-3" @click="goToLocationToDeliver">
                <v-icon left>mdi-map</v-icon>
                See on Map
              </v-btn>
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
              </div>
            </v-card-text>
          </v-card>

          <!-- Action Buttons -->
          <div class="action-buttons">
            <!-- Accept Button (for waiting_for_rider orders) -->
            <v-btn v-if="isAvailableForAcceptance" color="success" size="large" block @click="acceptOrder"
              :loading="accepting">
              <v-icon left>mdi-check-circle</v-icon>
              Accept Order
            </v-btn>

            <!-- Picked Up Button (for accepted_by_rider orders) -->
            <v-btn v-else-if="order.status === 'accepted_by_rider' && isMyOrder" color="warning" size="large" block
              @click="updateOrderStatus('picked_up')">
              <v-icon left>mdi-truck</v-icon>
              Mark as Picked Up
            </v-btn>

            <!-- Delivered Button (for picked_up orders) -->
            <v-btn v-else-if="order.status === 'picked_up' && isMyOrder" color="success" size="large" block
              @click="updateOrderStatus('delivered')">
              <v-icon left>mdi-check-circle</v-icon>
              Mark as Delivered
            </v-btn>

            <!-- Message for completed orders -->
            <v-alert v-else-if="order.status === 'delivered' || order.status === 'completed'" type="success"
              variant="tonal" class="mb-0">
              <div class="d-flex align-center">
                <span>This order has been completed. Thank you for your delivery!</span>
              </div>
            </v-alert>

            <!-- Message for orders waiting for seller approval -->
            <v-alert v-else-if="order.status === 'pending_approval'" type="info" variant="tonal" class="mb-0">
              <div class="d-flex align-center">
                <v-icon left class="mr-2">mdi-clock-outline</v-icon>
                <span>This order is waiting for seller approval.</span>
              </div>
            </v-alert>

            <!-- Message for orders assigned to other riders -->
            <v-alert v-else-if="order.rider_id && !isMyOrder && order.status !== 'delivered'" type="warning"
              variant="tonal" class="mb-0">
              <div class="d-flex align-center">
                <v-icon left class="mr-2">mdi-alert</v-icon>
                <span>This order has been accepted by another rider.</span>
              </div>
            </v-alert>
          </div>
        </div>
      </v-container>
    </v-main>

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

    <!-- Update Status Dialog -->
    <v-dialog v-model="showUpdateDialog" max-width="400">
      <v-card>
        <v-card-title class="text-h6">Update Order Status</v-card-title>
        <v-card-text>
          <p>
            Are you sure you want to mark this order as <strong>{{ updateStatusText }}</strong>?
          </p>
        </v-card-text>
        <v-card-actions>
          <v-btn variant="text" @click="showUpdateDialog = false">Cancel</v-btn>
          <v-spacer></v-spacer>
          <v-btn color="primary" :loading="updating" @click="confirmUpdateStatus">Confirm</v-btn>
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

<style scoped>
.order-details-page {
  background: linear-gradient(135deg, #f5f7fa 0%, #ffffff 100%);
  min-height: 100vh;
}

.header-section {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 16px;
  background: linear-gradient(135deg, #354d7c, #5276b0);
  color: white;
  position: sticky;
  top: 0;
  z-index: 100;
}

.back-btn {
  color: white !important;
  background: rgba(255, 255, 255, 0.1) !important;
}

.page-title {
  font-size: 1.5rem;
  font-weight: 600;
  margin: 0;
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

.status-pending {
  background: #fff3e0;
  color: #ff9800;
}

.status-accepted {
  background: #e3f2fd;
  color: #2196f3;
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

.info-card {
  overflow: hidden;
}

.info-title {
  font-weight: 600;
  color: #354d7c;
  font-size: 1rem;
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

.action-buttons {
  margin-top: 16px;
  margin-bottom: 32px;
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

@media (max-width: 600px) {
  .page-title {
    font-size: 1.2rem;
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
}
</style>