<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/utils/supabase'
import ShopBuild from './ShopBuild.vue'

const router = useRouter()
const goBack = () => router.back()

// state
const shopId = ref<string | null>(null)
const businessAvatar = ref('')
const coverPhoto = ref('')
const businessName = ref('')
const description = ref('')
const timeOpen = ref('')
const timeClose = ref('')
const manualStatus = ref('auto') // 'open', 'closed', 'auto'
const address = ref('')
const loading = ref(false)

// ORDERS STATE
const orders = ref<any[]>([])
const loadingOrders = ref(false)
const ordersError = ref('')

// transactions
const transactionFilter = ref('all')
const transactionOptions = [
  { title: 'All Orders', value: 'all' },
  { title: 'Pending', value: 'pending' },
  { title: 'Paid', value: 'paid' },
  { title: 'Delivered', value: 'delivered' },
  { title: 'Cancelled', value: 'cancelled' }
]

// COMPUTED: Filtered orders based on selected filter
const filteredOrders = computed(() => {
  if (transactionFilter.value === 'all') {
    return orders.value
  }
  return orders.value.filter(order => {
    if (transactionFilter.value === 'paid') {
      return order.payment_status === 'paid'
    } else if (transactionFilter.value === 'delivered') {
      return order.delivery_status === 'delivered'
    } else {
      return order.status === transactionFilter.value
    }
  })
})

// Function to convert 24-hour time to 12-hour format
const convertTo12Hour = (time24: string) => {
  if (!time24 || time24 === 'N/A') return 'N/A'

  try {
    const [hours, minutes] = time24.split(':')
    const hour = parseInt(hours)
    const minute = minutes || '00'

    if (isNaN(hour)) return time24

    const period = hour >= 12 ? 'PM' : 'AM'
    const hour12 = hour % 12 || 12

    return `${hour12}:${minute} ${period}`
  } catch (error) {
    console.error('Error converting time:', error)
    return time24
  }
}

// FETCH ORDERS FOR THIS SHOP
const fetchOrders = async () => {
  if (!shopId.value) {
    console.log('No shop ID available')
    return
  }

  loadingOrders.value = true
  ordersError.value = ''

  try {
    console.log('🛍️ Fetching orders for shop:', shopId.value)

    const { data, error } = await supabase
      .from('orders')
      .select(`
        id,
        user_id,
        total_amount,
        status,
        payment_method,
        payment_status,
        delivery_status,
        delivery_option,
        delivery_date,
        delivery_time,
        transaction_number,
        created_at,
        note,
        address:addresses(
          recipient_name,
          phone,
          street,
          city_name,
          barangay_name
        ),
        profiles:profiles!orders_user_id_fkey(
          first_name,
          last_name,
          phone
        ),
        order_items(
          id,
          quantity,
          price,
          selected_size,
          selected_variety,
          product:products(
            id,
            prod_name,
            main_img_urls,
            price
          )
        )
      `)
      .eq('shop_id', shopId.value)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('❌ Error fetching orders:', error)
      ordersError.value = 'Failed to load orders'
      throw error
    }

    console.log('✅ Orders loaded:', data?.length || 0)
    orders.value = data || []

  } catch (err) {
    console.error('❌ Error in fetchOrders:', err)
    ordersError.value = 'Error loading orders'
  } finally {
    loadingOrders.value = false
  }
}

// ORDER ACTIONS
const approvePayment = async (orderId: string) => {
  if (!confirm('Mark this payment as approved?')) return

  try {
    const { error } = await supabase
      .from('orders')
      .update({
        payment_status: 'paid',
        updated_at: new Date().toISOString()
      })
      .eq('id', orderId)

    if (error) throw error

    alert('Payment approved successfully')
    await fetchOrders() // Refresh orders
  } catch (err) {
    console.error('Error approving payment:', err)
    alert('Failed to approve payment')
  }
}

const markAsDelivered = async (orderId: string) => {
  if (!confirm('Mark this order as delivered?')) return

  try {
    const { error } = await supabase
      .from('orders')
      .update({
        delivery_status: 'delivered',
        updated_at: new Date().toISOString()
      })
      .eq('id', orderId)

    if (error) throw error

    alert('Order marked as delivered')
    await fetchOrders() // Refresh orders
  } catch (err) {
    console.error('Error updating delivery status:', err)
    alert('Failed to update delivery status')
  }
}

const cancelOrder = async (orderId: string) => {
  if (!confirm('Cancel this order?')) return

  try {
    const { error } = await supabase
      .from('orders')
      .update({
        status: 'cancelled',
        updated_at: new Date().toISOString()
      })
      .eq('id', orderId)

    if (error) throw error

    alert('Order cancelled')
    await fetchOrders() // Refresh orders
  } catch (err) {
    console.error('Error cancelling order:', err)
    alert('Failed to cancel order')
  }
}

// HELPER FUNCTIONS
const getStatusColor = (order: any) => {
  if (order.status === 'cancelled') return 'red'
  if (order.payment_status === 'paid' && order.delivery_status === 'delivered') return 'green'
  if (order.payment_status === 'paid') return 'blue'
  return 'orange'
}

const getStatusText = (order: any) => {
  if (order.status === 'cancelled') return 'Cancelled'
  if (order.payment_status === 'paid' && order.delivery_status === 'delivered') return 'Completed'
  if (order.payment_status === 'paid') return 'Paid - Ready for Delivery'
  return 'Pending Payment'
}

const formatDate = (dateString: string) => {
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  })
}

const getMainImage = (imgUrls: any): string => {
  if (!imgUrls) return '/placeholder.png'

  if (Array.isArray(imgUrls)) {
    return imgUrls[0] || '/placeholder.png'
  }

  if (typeof imgUrls === 'string') {
    try {
      const parsed = JSON.parse(imgUrls)
      return Array.isArray(parsed) ? parsed[0] : parsed
    } catch {
      return imgUrls
    }
  }

  return '/placeholder.png'
}

// fetch shop data
const fetchShopData = async () => {
  try {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) throw new Error('User not logged in')

    const { data, error } = await supabase
      .from('shops')
      .select(
        'id, business_name, description, logo_url, physical_store, open_time, close_time, barangay, building, street, house_no, postal, manual_status, open_days'
      )
      .eq('owner_id', user.id)
      .maybeSingle()

    if (error) throw error

    console.log('Shop info:', data)

    // STORE THE SHOP ID
    shopId.value = data?.id || null

    // assign values to display
    businessName.value = data?.business_name || 'No name'
    description.value = data?.description || 'No description provided'

    // Convert times to 12-hour format
    timeOpen.value = convertTo12Hour(data?.open_time) || 'N/A'
    timeClose.value = convertTo12Hour(data?.close_time) || 'N/A'

    businessAvatar.value = data?.logo_url || ''
    coverPhoto.value = data?.physical_store || ''
    manualStatus.value = data?.manual_status || 'auto'

    // build full address string
    address.value = [
      data?.house_no,
      data?.building,
      data?.street,
      data?.barangay,
      'Butuan City',
      'Agusan del Norte',
      'CARAGA',
      data?.postal,
    ]
      .filter(Boolean)
      .join(', ')

    // Fetch orders after shop data is loaded
    if (shopId.value) {
      await fetchOrders()
    }

  } catch (err) {
    console.error('Error loading shop info:', err.message, err)
  }
}

// Function to toggle between manual open/closed and auto mode
const toggleShopStatus = async () => {
  try {
    loading.value = true

    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) throw new Error('User not logged in')

    let newStatus: 'open' | 'closed' | 'auto'

    // Determine next status based on current status
    if (manualStatus.value === 'auto') {
      newStatus = 'open'
    } else if (manualStatus.value === 'open') {
      newStatus = 'closed'
    } else {
      newStatus = 'auto'
    }

    const { data, error } = await supabase.rpc('update_shop_status', {
      p_owner_id: user.id,
      p_manual_status: newStatus
    })

    if (error) {
      console.error('Supabase RPC error:', error)
      throw error
    }

    if (!data || !data.success) {
      throw new Error('Update failed')
    }

    manualStatus.value = newStatus

    const statusMessages = {
      open: 'Shop is now manually set to OPEN',
      closed: 'Shop is now manually set to CLOSED',
      auto: 'Shop status is now AUTOMATIC (based on business hours)',
    }
    alert(statusMessages[newStatus])
  } catch (err) {
    console.error('Error updating shop status:', err)
    alert('Failed to update shop status: ' + err.message)
  } finally {
    loading.value = false
  }
}

// Helper to get current status display
const getCurrentStatusDisplay = () => {
  if (manualStatus.value === 'open') return {
    text: 'Manually Open',
    color: 'green',
    icon: 'mdi-store-check',
    buttonText: 'Switch to Closed',
    buttonColor: 'red'
  }
  if (manualStatus.value === 'closed') return {
    text: 'Manually Closed',
    color: 'red',
    icon: 'mdi-store-remove',
    buttonText: 'Switch to Auto Mode',
    buttonColor: 'blue'
  }
  return {
    text: 'Auto (Based on Hours)',
    color: 'blue',
    icon: 'mdi-clock',
    buttonText: 'Switch to Open',
    buttonColor: 'green'
  }
}

// Check if shop is currently open based on hours
const isShopCurrentlyOpen = () => {
  if (manualStatus.value === 'open') return true
  if (manualStatus.value === 'closed') return false

  const now = new Date()
  const currentHour = now.getHours()
  return currentHour >= 8 && currentHour < 20
}

// DELETE SHOP
const deleteShop = async () => {
  if (!confirm('Are you sure you want to delete your shop? This action cannot be undone.')) {
    return
  }

  try {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()
    if (userError || !user) throw new Error('User not found')

    const { error } = await supabase.from('shops')
      .delete()
      .eq('owner_id', user.id)

    if (error) throw error

    // Clean up images if they exist
    if (businessAvatar.value) {
      try {
        const oldPath = businessAvatar.value.split('/storage/v1/object/public/Profile/')[1]
        if (oldPath) {
          await supabase.storage.from('Profile').remove([oldPath])
        }
      } catch (storageError) {
        console.warn('Could not delete avatar image:', storageError)
      }
    }

    // Reset all state
    shopId.value = null
    businessAvatar.value = ''
    coverPhoto.value = ''
    businessName.value = ''
    description.value = ''
    timeOpen.value = ''
    timeClose.value = ''
    address.value = ''
    manualStatus.value = 'auto'

    alert('Shop deleted successfully')
    router.push('/')
  } catch (err) {
    console.error('Delete shop error:', err)
    alert('Failed to delete shop: ' + err.message)
  }
}

onMounted(() => {
  fetchShopData()
})

// EDIT SHOP
const editShop = () => {
  if (!shopId.value) {
    alert('Shop ID not found. Please try again.')
    return
  }

  router.push({
    name: 'shop-build',
    params: { id: shopId.value }
  })
}
</script>

<template>
  <v-app>
    <!-- Top Bar -->
    <v-app-bar class="top-bar" flat color="primary" dark>
      <v-btn icon @click="goBack">
        <v-icon>mdi-arrow-left</v-icon>
      </v-btn>
      <v-toolbar-title class="text-h6">Business Profile</v-toolbar-title>

      <!-- Dropdown menu -->
      <v-menu>
        <template #activator="{ props }">
          <v-btn icon v-bind="props">
            <v-icon>mdi-menu</v-icon>
          </v-btn>
        </template>

        <v-list>
          <v-list-item @click="editShop">
            <v-list-item-title>
              <v-icon start small>mdi-pencil</v-icon>
              Edit Shop
            </v-list-item-title>
          </v-list-item>

          <v-list-item @click="deleteShop">
            <v-list-item-title>
              <v-icon start small>mdi-delete</v-icon>
              Delete Shop
            </v-list-item-title>
          </v-list-item>
        </v-list>
      </v-menu>
    </v-app-bar>

    <v-main>
      <!-- Cover + Logo -->
      <v-container class="pa-0">
        <!-- Cover Photo -->
        <v-img v-if="coverPhoto" :src="coverPhoto" height="180" cover class="cover-photo" />
        <div v-else class="cover-placeholder"></div>

        <!-- Avatar overlapping cover -->
        <div class="avatar-wrapper">
          <v-avatar size="96" class="avatar-border">
            <v-img v-if="businessAvatar" :src="businessAvatar" cover />
            <v-icon v-else size="48">mdi-store</v-icon>
          </v-avatar>
        </div>
      </v-container>

      <!-- Business Info Section -->
      <v-container class="py-6">
        <v-sheet rounded="xl" elevation="4" class="pa-6 text-center">
          <h2 class="text-h6 mt-4">{{ businessName }}</h2>
          <p class="text-body-2 text-medium-emphasis">{{ description }}</p>

          <!-- Business hours -->
          <div class="mt-2">
            <p><strong>Opens:</strong> {{ timeOpen }}</p>
            <p><strong>Closes:</strong> {{ timeClose }}</p>

            <!-- Shop Status Control -->
            <div class="status-control mt-4">
              <p class="text-body-2 mb-2">
                <strong>Current Status:</strong>
                <v-chip :color="getCurrentStatusDisplay().color" size="small" class="ml-2">
                  <v-icon start small>{{ getCurrentStatusDisplay().icon }}</v-icon>
                  {{ getCurrentStatusDisplay().text }}
                </v-chip>
              </p>

              <!-- Single toggle button -->
              <v-btn
                :color="getCurrentStatusDisplay().buttonColor"
                :loading="loading"
                @click="toggleShopStatus"
                class="status-toggle-btn"
                size="large"
              >
                <v-icon start>{{ getCurrentStatusDisplay().icon }}</v-icon>
                {{ getCurrentStatusDisplay().buttonText }}
              </v-btn>

              <p class="text-caption text-medium-emphasis mt-2 text-center">
                {{
                  manualStatus === 'auto'
                    ? `Status automatically determined by your business hours. Currently: ${isShopCurrentlyOpen() ? 'OPEN' : 'CLOSED'}`
                    : 'Status manually overridden'
                }}
              </p>

              <!-- Quick status summary -->
              <div class="mt-2">
                <v-chip
                  v-if="manualStatus === 'auto'"
                  :color="isShopCurrentlyOpen() ? 'green' : 'red'"
                  size="small"
                >
                  <v-icon start small>
                    {{ isShopCurrentlyOpen() ? 'mdi-check' : 'mdi-close' }}
                  </v-icon>
                  {{ isShopCurrentlyOpen() ? 'Currently OPEN' : 'Currently CLOSED' }}
                </v-chip>
              </div>
            </div>
          </div>

          <p class="mt-2 text-body-2">
            <v-icon start small>mdi-map-marker</v-icon>
            {{ address }}
          </p>
        </v-sheet>
      </v-container>

      <!-- Transaction Section -->
      <v-divider thickness="3"></v-divider>

      <v-container class="py-4">
        <v-btn color="primary" rounded="lg" class="mb-4" to="/productlist">
          <v-icon start>mdi-package-variant</v-icon>
          My Products
        </v-btn>

        <v-select
          v-model="transactionFilter"
          :items="transactionOptions"
          item-title="title"
          item-value="value"
          label="Filter Orders"
          variant="outlined"
          density="comfortable"
          class="mb-4"
        />

        <!-- Orders Loading State -->
        <div v-if="loadingOrders" class="text-center py-8">
          <v-progress-circular indeterminate color="primary" size="64" />
          <p class="mt-4 text-body-1">Loading orders...</p>
        </div>

        <!-- Orders Error State -->
        <v-alert v-else-if="ordersError" type="error" class="mb-4">
          {{ ordersError }}
          <v-btn variant="text" color="white" @click="fetchOrders" class="ml-2">
            Retry
          </v-btn>
        </v-alert>

        <!-- No Orders State -->
        <div v-else-if="filteredOrders.length === 0" class="text-center py-12">
          <v-icon size="64" color="grey-lighten-2" class="mb-4">mdi-cart-off</v-icon>
          <h3 class="text-h6 text-grey">No orders found</h3>
          <p class="text-body-1 text-grey-lighten-1 mt-2">
            {{
              transactionFilter === 'all'
                ? 'You haven\'t received any orders yet.'
                : `No ${transactionFilter} orders found.`
            }}
          </p>
        </div>

        <!-- Orders List -->
        <div v-else>
          <v-card
            v-for="order in filteredOrders"
            :key="order.id"
            class="mb-4 order-card"
            elevation="2"
          >
            <v-card-text class="pa-4">
              <!-- Order Header -->
              <div class="d-flex justify-space-between align-start mb-3">
                <div>
                  <h4 class="text-h6">Order #{{ order.transaction_number }}</h4>
                  <p class="text-caption text-medium-emphasis">
                    {{ formatDate(order.created_at) }}
                  </p>
                </div>
                <v-chip :color="getStatusColor(order)" size="small">
                  {{ getStatusText(order) }}
                </v-chip>
              </div>

              <!-- Customer Info -->
              <div class="customer-info mb-3">
                <p class="mb-1">
                  <strong>Customer:</strong>
                  {{ order.profiles?.first_name }} {{ order.profiles?.last_name }}
                </p>
                <p class="mb-1">
                  <strong>Contact:</strong>
                  {{ order.profiles?.phone || order.address?.phone || 'N/A' }}
                </p>
                <p class="mb-1">
                  <strong>Address:</strong>
                  {{ order.address?.street }}, {{ order.address?.barangay_name }}, {{ order.address?.city_name }}
                </p>
                <p class="mb-1">
                  <strong>Delivery:</strong>
                  {{ order.delivery_option }} on {{ order.delivery_date }} at {{ order.delivery_time }}
                </p>
              </div>

              <!-- Order Items -->
              <v-divider class="my-3"></v-divider>
              <div class="order-items">
                <h5 class="text-subtitle-1 mb-2">Items:</h5>
                <div
                  v-for="orderItem in order.order_items"
                  :key="orderItem.id"
                  class="d-flex align-center mb-3 order-item"
                >
                  <v-img
                    :src="getMainImage(orderItem.product?.main_img_urls)"
                    width="60"
                    height="60"
                    cover
                    class="rounded-lg mr-3 product-image"
                  />
                  <div class="flex-grow-1">
                    <h6 class="text-body-1 font-weight-medium">
                      {{ orderItem.product?.prod_name || 'Product' }}
                    </h6>
                    <p class="text-caption mb-1">
                      Qty: {{ orderItem.quantity }} × ₱{{ orderItem.price?.toLocaleString() }}
                    </p>
                    <p class="text-caption text-medium-emphasis">
                      Subtotal: ₱{{ (orderItem.quantity * orderItem.price)?.toLocaleString() }}
                    </p>
                    <div v-if="orderItem.selected_size || orderItem.selected_variety" class="text-caption">
                      <span v-if="orderItem.selected_size">Size: {{ orderItem.selected_size }}</span>
                      <span v-if="orderItem.selected_variety"> • Variety: {{ orderItem.selected_variety }}</span>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Order Total & Note -->
              <v-divider class="my-3"></v-divider>
              <div class="d-flex justify-space-between align-center mb-2">
                <strong class="text-h6">Total: ₱{{ order.total_amount?.toLocaleString() }}</strong>
              </div>
              <div v-if="order.note" class="order-note mt-2">
                <strong>Customer Note:</strong> {{ order.note }}
              </div>

              <!-- Action Buttons -->
              <v-divider class="my-3"></v-divider>
              <div class="d-flex justify-space-between flex-wrap gap-2">
                <v-btn
                  color="green"
                  size="small"
                  variant="tonal"
                  v-if="order.payment_status !== 'paid' && order.status !== 'cancelled'"
                  @click="approvePayment(order.id)"
                >
                  <v-icon start small>mdi-check</v-icon>
                  Approve Payment
                </v-btn>

                <v-btn
                  color="blue"
                  size="small"
                  variant="tonal"
                  v-if="order.delivery_status !== 'delivered' && order.status !== 'cancelled' && order.payment_status === 'paid'"
                  @click="markAsDelivered(order.id)"
                >
                  <v-icon start small>mdi-truck-check</v-icon>
                  Mark Delivered
                </v-btn>

                <v-btn
                  color="red"
                  size="small"
                  variant="tonal"
                  v-if="order.status !== 'cancelled'"
                  @click="cancelOrder(order.id)"
                >
                  <v-icon start small>mdi-cancel</v-icon>
                  Cancel Order
                </v-btn>

                <v-btn
                  color="primary"
                  size="small"
                  variant="outlined"
                  @click="$router.push(`/order/${order.id}`)"
                >
                  <v-icon start small>mdi-eye</v-icon>
                  View Details
                </v-btn>
              </div>
            </v-card-text>
          </v-card>
        </div>
      </v-container>
    </v-main>
  </v-app>
</template>

<style scoped>
.top-bar {
  padding-top: 20px;
}

.cover-photo {
  border-bottom-left-radius: 12px;
  border-bottom-right-radius: 12px;
}

.cover-placeholder {
  height: 180px;
  background: linear-gradient(135deg, #e5e7eb, #d1d5db);
  border-bottom-left-radius: 12px;
  border-bottom-right-radius: 12px;
}

.avatar-wrapper {
  display: flex;
  justify-content: center;
  margin-top: -48px;
}

.avatar-border {
  border: 4px solid #fff;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  background: #fff;
}

.status-control {
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 16px;
  background: #f8fafc;
}

.status-toggle-btn {
  min-width: 200px;
  font-weight: 600;
}

.order-card {
  border-radius: 12px;
  transition: all 0.3s ease;
}

.order-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.customer-info {
  background: #f8fafc;
  padding: 12px;
  border-radius: 8px;
  border-left: 4px solid #438fda;
}

.order-item {
  padding: 8px;
  border-radius: 8px;
  transition: background-color 0.2s ease;
}

.order-item:hover {
  background-color: #f5f5f5;
}

.product-image {
  border: 1px solid #e0e0e0;
}

.order-note {
  background: #fff3cd;
  padding: 8px 12px;
  border-radius: 6px;
  border-left: 4px solid #ffc107;
  font-size: 0.9rem;
}

/* Responsive adjustments */
@media (max-width: 600px) {
  .order-card {
    margin-bottom: 16px;
  }

  .customer-info p {
    font-size: 0.8rem;
    margin-bottom: 4px;
  }
}
</style>
