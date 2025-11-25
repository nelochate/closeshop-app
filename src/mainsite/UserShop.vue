<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/utils/supabase'

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
const manualStatus = ref('auto')
const address = ref('')
const loading = ref(false)

// transactions
const transactionFilter = ref('pending')
const transactionOptions = [
  { title: 'Pending Orders', value: 'pending' },
  { title: 'Processing Orders', value: 'processing' },
  { title: 'Completed Orders', value: 'completed' },
  { title: 'Cancelled Orders', value: 'cancelled' }
]

// Orders state
const orders = ref<any[]>([])
const ordersLoading = ref(false)
const selectedOrder = ref<any>(null)
const rejectDialog = ref(false)
const rejectReason = ref('')
const processingOrder = ref(false)

// CORRECTED: Fetch orders for this shop
const fetchShopOrders = async () => {
  if (!shopId.value) return

  try {
    ordersLoading.value = true
    console.log('Fetching orders for shop:', shopId.value)

    // Query to get orders with products from this shop
    const { data, error } = await supabase
      .from('order_items')
      .select(`
        id,
        order_id,
        quantity,
        price,
        selected_size,
        selected_variety,
        product_id,
        products!inner(
          id,
          prod_name,
          main_img_urls,
          description,
          shop_id
        ),
        orders!inner(
          id,
          user_id,
          total_amount,
          status,
          payment_method,
          created_at,
          delivery_date,
          delivery_time,
          note,
          transaction_number,
          delivery_option,
          buyer:profiles!orders_user_id_fkey(
            first_name,
            last_name,
            avatar_url,
            phone
          ),
          address:addresses!orders_address_id_fkey(
            recipient_name,
            phone,
            street,
            barangay_name,
            city_name,
            province_name
          )
        )
      `)
      .eq('products.shop_id', shopId.value)
      .order('created_at', { ascending: false }, { foreignTable: 'orders' })

    if (error) {
      console.error('Error fetching orders:', error)
      throw error
    }

    console.log('Raw order items data:', data)

    // Transform the data to group by order
    const ordersMap = new Map()
    
    data?.forEach(item => {
      const orderId = item.orders.id
      
      if (!ordersMap.has(orderId)) {
        // Create order entry
        ordersMap.set(orderId, {
          ...item.orders,
          order_items: []
        })
      }
      
      // Add order item
      const order = ordersMap.get(orderId)
      order.order_items.push({
        id: item.id,
        product_id: item.product_id,
        quantity: item.quantity,
        price: item.price,
        selected_size: item.selected_size,
        selected_variety: item.selected_variety,
        products: item.products
      })
    })

    orders.value = Array.from(ordersMap.values())
    console.log('Transformed orders:', orders.value)

  } catch (err) {
    console.error('Error loading orders:', err)
  } finally {
    ordersLoading.value = false
  }
}

// ALTERNATIVE: If above doesn't work, try this direct orders query
const fetchShopOrdersAlternative = async () => {
  if (!shopId.value) return

  try {
    ordersLoading.value = true

    // First get all products from this shop
    const { data: shopProducts, error: productsError } = await supabase
      .from('products')
      .select('id')
      .eq('shop_id', shopId.value)

    if (productsError) throw productsError

    const productIds = shopProducts?.map(p => p.id) || []
    
    if (productIds.length === 0) {
      orders.value = []
      return
    }

    // Then get order items for these products
    const { data: orderItems, error: itemsError } = await supabase
      .from('order_items')
      .select(`
        *,
        products(*),
        orders(
          *,
          buyer:profiles!orders_user_id_fkey(*),
          address:addresses!orders_address_id_fkey(*)
        )
      `)
      .in('product_id', productIds)
      .order('created_at', { ascending: false }, { foreignTable: 'orders' })

    if (itemsError) throw itemsError

    // Transform data
    const ordersMap = new Map()
    
    orderItems?.forEach(item => {
      const orderId = item.orders.id
      
      if (!ordersMap.has(orderId)) {
        ordersMap.set(orderId, {
          ...item.orders,
          order_items: []
        })
      }
      
      const order = ordersMap.get(orderId)
      order.order_items.push({
        id: item.id,
        product_id: item.product_id,
        quantity: item.quantity,
        price: item.price,
        selected_size: item.selected_size,
        selected_variety: item.selected_variety,
        products: item.products
      })
    })

    orders.value = Array.from(ordersMap.values())
    console.log('Alternative method orders:', orders.value)

  } catch (err) {
    console.error('Error loading orders (alternative):', err)
  } finally {
    ordersLoading.value = false
  }
}

// Fetch shop data
const fetchShopData = async () => {
  try {
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) throw new Error('User not logged in')

    const { data, error } = await supabase
      .from('shops')
      .select('id, business_name, description, logo_url, physical_store, open_time, close_time, barangay, building, street, house_no, postal, manual_status')
      .eq('owner_id', user.id)
      .maybeSingle()

    if (error) throw error

    shopId.value = data?.id || null
    businessName.value = data?.business_name || 'No name'
    description.value = data?.description || 'No description provided'
    businessAvatar.value = data?.logo_url || ''
    coverPhoto.value = data?.physical_store || ''
    manualStatus.value = data?.manual_status || 'auto'

    // Format time
    timeOpen.value = data?.open_time ? convertTo12Hour(data.open_time) : 'N/A'
    timeClose.value = data?.close_time ? convertTo12Hour(data.close_time) : 'N/A'

    address.value = [
      data?.house_no,
      data?.building,
      data?.street,
      data?.barangay,
      'Butuan City',
      'Agusan del Norte',
      data?.postal,
    ].filter(Boolean).join(', ')

  } catch (err) {
    console.error('Error loading shop info:', err)
  }
}

// Filter orders based on selected filter
const filteredOrders = computed(() => {
  if (!orders.value) return []

  switch (transactionFilter.value) {
    case 'pending':
      return orders.value.filter(order => order.status === 'pending')
    case 'processing':
      return orders.value.filter(order => ['paid', 'shipped'].includes(order.status))
    case 'completed':
      return orders.value.filter(order => order.status === 'delivered')
    case 'cancelled':
      return orders.value.filter(order => order.status === 'cancelled')
    default:
      return orders.value
  }
})

// Order management functions
const acceptOrder = async (order: any) => {
  try {
    processingOrder.value = true

    const { error } = await supabase
      .from('orders')
      .update({ 
        status: 'paid',
        updated_at: new Date().toISOString()
      })
      .eq('id', order.id)

    if (error) throw error

    await fetchShopOrders()
    alert('Order accepted successfully!')
    
  } catch (err) {
    console.error('Error accepting order:', err)
    alert('Failed to accept order')
  } finally {
    processingOrder.value = false
  }
}

const rejectOrder = async (order: any) => {
  if (!rejectReason.value.trim()) {
    alert('Please provide a reason for rejection')
    return
  }

  try {
    processingOrder.value = true

    const { error } = await supabase
      .from('orders')
      .update({ 
        status: 'cancelled',
        note: rejectReason.value.trim(),
        updated_at: new Date().toISOString()
      })
      .eq('id', order.id)

    if (error) throw error

    await fetchShopOrders()
    rejectDialog.value = false
    rejectReason.value = ''
    alert('Order rejected successfully!')
    
  } catch (err) {
    console.error('Error rejecting order:', err)
    alert('Failed to reject order')
  } finally {
    processingOrder.value = false
  }
}

const markAsShipped = async (order: any) => {
  try {
    processingOrder.value = true

    const { error } = await supabase
      .from('orders')
      .update({ 
        status: 'shipped',
        updated_at: new Date().toISOString()
      })
      .eq('id', order.id)

    if (error) throw error

    await fetchShopOrders()
    alert('Order marked as shipped!')
    
  } catch (err) {
    console.error('Error marking as shipped:', err)
    alert('Failed to mark as shipped')
  } finally {
    processingOrder.value = false
  }
}

const markAsDelivered = async (order: any) => {
  try {
    processingOrder.value = true

    const { error } = await supabase
      .from('orders')
      .update({ 
        status: 'delivered',
        updated_at: new Date().toISOString()
      })
      .eq('id', order.id)

    if (error) throw error

    await fetchShopOrders()
    alert('Order marked as delivered!')
    
  } catch (err) {
    console.error('Error marking as delivered:', err)
    alert('Failed to mark as delivered')
  } finally {
    processingOrder.value = false
  }
}

const openRejectDialog = (order: any) => {
  selectedOrder.value = order
  rejectDialog.value = true
  rejectReason.value = ''
}

// Utility functions
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
  } catch {
    return time24
  }
}

const formatCurrency = (amount: number) => {
  return `₱${amount?.toFixed(2) || '0.00'}`
}

const formatDate = (dateString: string) => {
  if (!dateString) return 'Not set'
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  })
}

const formatDateTime = (dateString: string) => {
  if (!dateString) return 'Not set'
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

const getProductImage = (product: any) => {
  if (!product?.main_img_urls) return '/placeholder.png'
  try {
    if (typeof product.main_img_urls === 'string') {
      const parsed = JSON.parse(product.main_img_urls)
      return Array.isArray(parsed) ? parsed[0] : parsed
    }
    if (Array.isArray(product.main_img_urls)) {
      return product.main_img_urls[0]
    }
    return '/placeholder.png'
  } catch {
    return '/placeholder.png'
  }
}

const getStatusColor = (status: string) => {
  switch (status) {
    case 'pending': return 'orange'
    case 'paid': return 'blue'
    case 'shipped': return 'purple'
    case 'delivered': return 'green'
    case 'cancelled': return 'red'
    default: return 'grey'
  }
}

const getStatusIcon = (status: string) => {
  switch (status) {
    case 'pending': return 'mdi-clock-outline'
    case 'paid': return 'mdi-credit-card-check'
    case 'shipped': return 'mdi-truck-delivery'
    case 'delivered': return 'mdi-check-circle'
    case 'cancelled': return 'mdi-close-circle'
    default: return 'mdi-help-circle'
  }
}

const getStatusText = (status: string) => {
  switch (status) {
    case 'pending': return 'Pending Payment'
    case 'paid': return 'Paid - Ready to Ship'
    case 'shipped': return 'Shipped'
    case 'delivered': return 'Delivered'
    case 'cancelled': return 'Cancelled'
    default: return status
  }
}

const getOrderItemTotal = (item: any) => {
  return (item.price * item.quantity) || 0
}

// Shop management functions
const toggleShopStatus = async () => {
  try {
    loading.value = true
    const { data: { user } } = await supabase.auth.getUser()
    
    let newStatus: 'open' | 'closed' | 'auto'
    if (manualStatus.value === 'auto') newStatus = 'open'
    else if (manualStatus.value === 'open') newStatus = 'closed'
    else newStatus = 'auto'

    const { data, error } = await supabase.rpc('update_shop_status', {
      p_owner_id: user.id,
      p_manual_status: newStatus
    })

    if (error) throw error
    if (!data?.success) throw new Error('Update failed')

    manualStatus.value = newStatus
    alert(`Shop is now ${newStatus === 'auto' ? 'AUTOMATIC' : 'MANUALLY ' + newStatus.toUpperCase()}`)
  } catch (err) {
    alert('Failed to update shop status')
  } finally {
    loading.value = false
  }
}

const getCurrentStatusDisplay = () => {
  if (manualStatus.value === 'open') return {
    text: 'Manually Open', color: 'green', icon: 'mdi-store-check',
    buttonText: 'Switch to Closed', buttonColor: 'red'
  }
  if (manualStatus.value === 'closed') return {
    text: 'Manually Closed', color: 'red', icon: 'mdi-store-remove',
    buttonText: 'Switch to Auto Mode', buttonColor: 'blue'
  }
  return {
    text: 'Auto (Based on Hours)', color: 'blue', icon: 'mdi-clock',
    buttonText: 'Switch to Open', buttonColor: 'green'
  }
}

const isShopCurrentlyOpen = () => {
  if (manualStatus.value === 'open') return true
  if (manualStatus.value === 'closed') return false
  const now = new Date()
  return now.getHours() >= 8 && now.getHours() < 20
}

const deleteShop = async () => {
  if (!confirm('Are you sure you want to delete your shop?')) return
  try {
    const { data: { user } } = await supabase.auth.getUser()
    const { error } = await supabase.from('shops').delete().eq('owner_id', user.id)
    if (error) throw error
    
    shopId.value = null
    businessAvatar.value = ''
    businessName.value = ''
    description.value = ''
    alert('Shop deleted successfully')
    router.push('/')
  } catch (err) {
    alert('Failed to delete shop')
  }
}

const editShop = () => {
  if (!shopId.value) {
    alert('Shop ID not found')
    return
  }
  router.push({ name: 'shop-build', params: { id: shopId.value } })
}

onMounted(() => {
  fetchShopData()
  // Try the first method, if it fails, try the alternative
  fetchShopOrders().catch(() => {
    console.log('Trying alternative order fetching method...')
    fetchShopOrdersAlternative()
  })
})
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
      <v-divider thickness="3" class="my-4">Transaction</v-divider>

      <v-container class="py-4">
        <v-btn color="primary" rounded="lg" class="mb-4" to="/productlist">
          <v-icon start>mdi-package-variant</v-icon>
          My Products
        </v-btn>

        <!-- Order Statistics -->
        <v-row class="mb-6">
          <v-col cols="6" sm="3">
            <v-card color="orange-lighten-5" class="text-center pa-3">
              <div class="text-h6 font-weight-bold text-orange">
                {{ orders.filter(o => o.status === 'pending').length }}
              </div>
              <div class="text-caption text-orange">Pending</div>
            </v-card>
          </v-col>
          <v-col cols="6" sm="3">
            <v-card color="blue-lighten-5" class="text-center pa-3">
              <div class="text-h6 font-weight-bold text-blue">
                {{ orders.filter(o => ['paid', 'shipped'].includes(o.status)).length }}
              </div>
              <div class="text-caption text-blue">Processing</div>
            </v-card>
          </v-col>
          <v-col cols="6" sm="3">
            <v-card color="green-lighten-5" class="text-center pa-3">
              <div class="text-h6 font-weight-bold text-green">
                {{ orders.filter(o => o.status === 'delivered').length }}
              </div>
              <div class="text-caption text-green">Completed</div>
            </v-card>
          </v-col>
          <v-col cols="6" sm="3">
            <v-card color="red-lighten-5" class="text-center pa-3">
              <div class="text-h6 font-weight-bold text-red">
                {{ orders.filter(o => o.status === 'cancelled').length }}
              </div>
              <div class="text-caption text-red">Cancelled</div>
            </v-card>
          </v-col>
        </v-row>

        <v-select
          v-model="transactionFilter"
          :items="transactionOptions"
          label="Filter Orders"
          variant="outlined"
          density="comfortable"
          class="mb-4"
        />

        <!-- Orders List -->
        <div v-if="ordersLoading" class="text-center py-8">
          <v-progress-circular indeterminate color="primary"></v-progress-circular>
          <p class="mt-2">Loading orders...</p>
        </div>

        <div v-else-if="filteredOrders.length === 0" class="text-center py-8">
          <v-icon size="64" color="grey-lighten-2">mdi-cart-off</v-icon>
          <p class="mt-2 text-grey">No {{ transactionOptions.find(opt => opt.value === transactionFilter)?.title.toLowerCase() }} found</p>
        </div>

        <div v-else class="orders-list">
          <v-card
            v-for="order in filteredOrders"
            :key="order.id"
            class="mb-6 order-card"
            elevation="2"
            :class="`status-${order.status}`"
          >
            <!-- Order Header -->
            <v-card-title class="d-flex justify-space-between align-center pb-0">
              <div class="d-flex align-center">
                <v-icon color="primary" class="mr-2">mdi-receipt</v-icon>
                <div>
                  <div class="text-h6">Order #{{ order.transaction_number || order.id.slice(-8) }}</div>
                  <div class="text-caption text-medium-emphasis">
                    {{ formatDateTime(order.created_at) }}
                  </div>
                </div>
              </div>
              <v-chip :color="getStatusColor(order.status)" class="font-weight-bold">
                <v-icon start small>{{ getStatusIcon(order.status) }}</v-icon>
                {{ getStatusText(order.status) }}
              </v-chip>
            </v-card-title>

            <v-card-text class="pt-4">
              <!-- Buyer & Delivery Information -->
              <v-row class="mb-4">
                <v-col cols="12" md="6">
                  <div class="info-section">
                    <h4 class="text-subtitle-2 font-weight-bold mb-2">
                      <v-icon small class="mr-1">mdi-account</v-icon>
                      Buyer Information
                    </h4>
                    <div class="pl-4">
                      <div><strong>Name:</strong> {{ order.buyer?.first_name }} {{ order.buyer?.last_name }}</div>
                      <div v-if="order.buyer?.phone"><strong>Phone:</strong> {{ order.buyer.phone }}</div>
                    </div>
                  </div>
                </v-col>
                <v-col cols="12" md="6">
                  <div class="info-section" v-if="order.address">
                    <h4 class="text-subtitle-2 font-weight-bold mb-2">
                      <v-icon small class="mr-1">mdi-truck-delivery</v-icon>
                      Delivery Information
                    </h4>
                    <div class="pl-4">
                      <div><strong>Recipient:</strong> {{ order.address.recipient_name }}</div>
                      <div><strong>Phone:</strong> {{ order.address.phone }}</div>
                      <div class="text-caption">
                        {{ order.address.street }}, {{ order.address.barangay_name }}, 
                        {{ order.address.city_name }}, {{ order.address.province_name }}
                      </div>
                    </div>
                  </div>
                </v-col>
              </v-row>

              <!-- Order Items -->
              <v-divider class="my-3"></v-divider>
              <h4 class="text-subtitle-2 font-weight-bold mb-3">Order Items</h4>
              
              <v-card
                v-for="item in order.order_items"
                :key="item.id"
                class="mb-3 item-card"
                variant="outlined"
              >
                <v-card-text class="pa-4">
                  <div class="d-flex align-start">
                    <v-img
                      :src="getProductImage(item.products)"
                      width="80"
                      height="80"
                      class="mr-4 rounded"
                      cover
                    />
                    <div class="flex-grow-1">
                      <div class="d-flex justify-space-between align-start">
                        <div>
                          <h5 class="text-subtitle-1 font-weight-medium">{{ item.products?.prod_name }}</h5>
                          <div class="text-caption text-medium-emphasis mb-2">
                            {{ item.products?.description }}
                          </div>
                          <div class="text-caption">
                            <span v-if="item.selected_size" class="mr-3">
                              <strong>Size:</strong> {{ item.selected_size }}
                            </span>
                            <span v-if="item.selected_variety">
                              <strong>Variety:</strong> {{ item.selected_variety }}
                            </span>
                          </div>
                        </div>
                        <div class="text-right">
                          <div class="text-subtitle-1 font-weight-bold text-primary">
                            {{ formatCurrency(getOrderItemTotal(item)) }}
                          </div>
                          <div class="text-caption text-medium-emphasis">
                            {{ formatCurrency(item.price) }} × {{ item.quantity }}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </v-card-text>
              </v-card>

              <!-- Order Summary -->
              <v-divider class="my-3"></v-divider>
              <div class="order-summary">
                <div class="d-flex justify-space-between mb-2">
                  <span class="text-body-2">Subtotal:</span>
                  <span class="text-body-2">{{ formatCurrency(order.total_amount) }}</span>
                </div>
                <div class="d-flex justify-space-between mb-2">
                  <span class="text-body-2">Payment Method:</span>
                  <span class="text-body-2">{{ order.payment_method || 'Not specified' }}</span>
                </div>
                <div class="d-flex justify-space-between mb-2" v-if="order.delivery_option">
                  <span class="text-body-2">Delivery Option:</span>
                  <span class="text-body-2">{{ order.delivery_option }}</span>
                </div>
                <v-divider class="my-2"></v-divider>
                <div class="d-flex justify-space-between font-weight-bold text-h6">
                  <span>Total Amount:</span>
                  <span class="text-primary">{{ formatCurrency(order.total_amount) }}</span>
                </div>
              </div>

              <!-- Order Notes -->
              <div v-if="order.note" class="mt-4 pa-3 bg-grey-lighten-4 rounded">
                <strong>Customer Note:</strong> {{ order.note }}
              </div>

              <!-- Action Buttons -->
              <div class="mt-4 action-buttons">
                <template v-if="order.status === 'pending'">
                  <v-btn
                    color="success"
                    class="mr-2"
                    @click="acceptOrder(order)"
                    :loading="processingOrder"
                    size="large"
                  >
                    <v-icon left>mdi-check</v-icon>
                    Accept Order
                  </v-btn>
                  <v-btn
                    color="error"
                    variant="outlined"
                    @click="openRejectDialog(order)"
                    :loading="processingOrder"
                    size="large"
                  >
                    <v-icon left>mdi-close</v-icon>
                    Reject Order
                  </v-btn>
                </template>

                <template v-else-if="order.status === 'paid'">
                  <v-btn
                    color="primary"
                    @click="markAsShipped(order)"
                    :loading="processingOrder"
                    size="large"
                  >
                    <v-icon left>mdi-truck</v-icon>
                    Mark as Shipped
                  </v-btn>
                  <span class="text-caption text-grey ml-3">
                    Order has been paid and is ready for shipping
                  </span>
                </template>

                <template v-else-if="order.status === 'shipped'">
                  <v-btn
                    color="success"
                    @click="markAsDelivered(order)"
                    :loading="processingOrder"
                    size="large"
                  >
                    <v-icon left>mdi-check-circle</v-icon>
                    Mark as Delivered
                  </v-btn>
                  <span class="text-caption text-grey ml-3">Order is in transit to customer</span>
                </template>

                <template v-else-if="order.status === 'delivered'">
                  <div class="d-flex align-center">
                    <v-icon color="success" class="mr-2">mdi-check-circle</v-icon>
                    <span class="text-success font-weight-medium">Order completed successfully</span>
                  </div>
                </template>

                <template v-else-if="order.status === 'cancelled'">
                  <div class="d-flex align-center">
                    <v-icon color="error" class="mr-2">mdi-close-circle</v-icon>
                    <span class="text-error font-weight-medium">Order has been cancelled</span>
                  </div>
                </template>
              </div>
            </v-card-text>
          </v-card>
        </div>
      </v-container>
    </v-main>

    <!-- Reject Order Dialog -->
    <v-dialog v-model="rejectDialog" max-width="500">
      <v-card>
        <v-card-title class="d-flex align-center">
          <v-icon color="error" class="mr-2">mdi-alert-circle</v-icon>
          Reject Order
        </v-card-title>
        <v-card-text>
          <p class="mb-3">Please provide a reason for rejecting order #{{ selectedOrder?.transaction_number || selectedOrder?.id?.slice(-8) }}:</p>
          <v-textarea
            v-model="rejectReason"
            label="Rejection Reason"
            variant="outlined"
            rows="3"
            placeholder="Please explain why you are rejecting this order..."
            required
            :rules="[v => !!v || 'Rejection reason is required']"
          ></v-textarea>
        </v-card-text>
        <v-card-actions>
          <v-spacer></v-spacer>
          <v-btn
            variant="text"
            @click="rejectDialog = false"
            :disabled="processingOrder"
          >
            Cancel
          </v-btn>
          <v-btn
            color="error"
            @click="rejectOrder(selectedOrder)"
            :loading="processingOrder"
            :disabled="!rejectReason.trim()"
          >
            <v-icon left>mdi-cancel</v-icon>
            Reject Order
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
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
  overflow: hidden;
}

.order-card.status-pending {
  border-left: 4px solid #ff9800;
}

.order-card.status-paid {
  border-left: 4px solid #2196f3;
}

.order-card.status-shipped {
  border-left: 4px solid #9c27b0;
}

.order-card.status-delivered {
  border-left: 4px solid #4caf50;
}

.order-card.status-cancelled {
  border-left: 4px solid #f44336;
}

.item-card {
  border-radius: 8px;
}

.info-section {
  background: #f8f9fa;
  border-radius: 8px;
  padding: 12px;
}

.order-summary {
  background: #f8f9fa;
  border-radius: 8px;
  padding: 16px;
}

.action-buttons {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

@media (max-width: 768px) {
  .action-buttons {
    flex-direction: column;
    align-items: stretch;
  }
  
  .action-buttons .v-btn {
    margin: 4px 0;
  }
}
</style>