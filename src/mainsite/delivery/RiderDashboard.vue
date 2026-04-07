<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/utils/supabase'
import { useAuthUserStore } from '@/stores/authUser'

const router = useRouter()
const authStore = useAuthUserStore()

// State
const loading = ref(false)
const activeTab = ref('available')
const showOrderDetails = ref(false)
const showAcceptDialog = ref(false)
const showUpdateDialog = ref(false)
const accepting = ref(false)
const updating = ref(false)
const selectedOrder = ref(null)
const pendingStatusUpdate = ref(null)

// Location state
const currentLocation = ref(null)
const locationLoading = ref(false)
const locationWatchId = ref(null)

//for image view
const showImageDialog = ref(false)
const selectedImage = ref(null)
const selectedProductName = ref('')

// Add this function in your script section
const viewFullImage = (imageUrl, productName) => {
  selectedImage.value = imageUrl
  selectedProductName.value = productName
  showImageDialog.value = true
}
// Navigation to Rider Location page
const goToRiderLocation = () => {
  router.push('/RiderLocation')
}

// Orders data
const orders = ref([])

// Get current rider ID
const currentRiderId = computed(() => authStore.userData?.id)

// Computed orders by status
const acceptedOrders = computed(() => {
  return orders.value
    .filter((order) => order.status === 'accepted' && order.rider_id === currentRiderId.value)
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
})

const availableOrders = computed(() => {
  return orders.value
    .filter(
      (order) =>
        (order.status === 'pending' ||
          order.status === 'ready_for_pickup' ||
          order.delivery_option === 'meetup') &&
        (!order.rider_id || order.status !== 'accepted'),
    )
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
})

const pickedUpOrders = computed(() => {
  return orders.value
    .filter((order) => order.status === 'picked_up' && order.rider_id === currentRiderId.value)
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
})

const completedOrders = computed(() => {
  return orders.value
    .filter(
      (order) =>
        (order.status === 'delivered' || order.status === 'completed') &&
        order.rider_id === currentRiderId.value,
    )
    .sort(
      (a, b) => new Date(b.completed_at || b.updated_at) - new Date(a.completed_at || a.updated_at),
    )
})

// Stats
const stats = computed(() => ({
  acceptedOrders: acceptedOrders.value.length,
  availableOrders: availableOrders.value.length,
  pickedUpOrders: pickedUpOrders.value.length,
  completedToday: completedOrders.value.filter((order) => {
    const today = new Date().toDateString()
    const orderDate = new Date(order.completed_at || order.updated_at).toDateString()
    return orderDate === today
  }).length,
  totalEarnings: completedOrders.value.reduce(
    (sum, order) => sum + (order.rider_earnings || order.delivery_fee || 0),
    0,
  ),
}))

// Helper functions
const formatTime = (dateString) => {
  if (!dateString) return 'ASAP'
  const date = new Date(dateString)
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
}

const formatDate = (dateString) => {
  if (!dateString) return ''
  const date = new Date(dateString)
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
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

const formatNumber = (num) => {
  if (!num) return '0'
  return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const getStatusText = (status) => {
  const statusMap = {
    pending: 'Pending',
    paid: 'Paid',
    accepted: 'Accepted',
    picked_up: 'Picked Up',
    shipped: 'Shipped',
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

const getStatusColor = (status) => {
  const colorMap = {
    pending: '#ff9800',
    paid: '#2196f3',
    accepted: '#2196f3',
    picked_up: '#9c27b0',
    shipped: '#9c27b0',
    delivered: '#4caf50',
    completed: '#4caf50',
    cancelled: '#f44336',
  }
  return colorMap[status] || '#999'
}

// Location functions
const getCurrentLocation = () => {
  locationLoading.value = true

  if (!navigator.geolocation) {
    alert('Geolocation is not supported by your browser')
    locationLoading.value = false
    return
  }

  navigator.geolocation.getCurrentPosition(
    async (position) => {
      const { latitude, longitude } = position.coords
      currentLocation.value = { latitude, longitude }

      await getAddressFromCoords(latitude, longitude)

      locationLoading.value = false
      filterOrdersByDistance(latitude, longitude)
      console.log('Location updated successfully')
    },
    (error) => {
      console.error('Location error:', error)
      let errorMessage = 'Unable to get your location. '

      switch (error.code) {
        case error.PERMISSION_DENIED:
          errorMessage += 'Please enable location access in your browser settings.'
          break
        case error.POSITION_UNAVAILABLE:
          errorMessage += 'Location information is unavailable.'
          break
        case error.TIMEOUT:
          errorMessage += 'Location request timed out.'
          break
      }

      alert(errorMessage)
      locationLoading.value = false
    },
    {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0,
    },
  )
}

// Get address from coordinates (reverse geocoding)
const getAddressFromCoords = async (lat, lng) => {
  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`,
    )
    const data = await response.json()

    if (data && data.display_name) {
      const addressParts = data.display_name.split(',')
      currentLocation.value.address = addressParts.slice(0, 3).join(', ')
      currentLocation.value.fullAddress = data.display_name
    }
  } catch (error) {
    console.error('Error getting address:', error)
    currentLocation.value.address = `${lat.toFixed(4)}, ${lng.toFixed(4)}`
  }
}

// Calculate distance between two coordinates (Haversine formula)
const calculateDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lon2 - lon1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

// Filter and sort orders by distance from current location
const filterOrdersByDistance = (lat, lng) => {
  orders.value = orders.value.map((order) => {
    if (order.pickup_lat && order.pickup_lng) {
      const distance = calculateDistance(lat, lng, order.pickup_lat, order.pickup_lng)
      return { ...order, distance: distance.toFixed(1) }
    }
    return order
  })

  const sortedAvailable = [...availableOrders.value].sort((a, b) => {
    const distA = parseFloat(a.distance) || 999
    const distB = parseFloat(b.distance) || 999
    return distA - distB
  })

  const otherOrders = orders.value.filter(
    (order) =>
      order.status !== 'pending' &&
      order.status !== 'ready_for_pickup' &&
      order.delivery_option !== 'meetup',
  )
  orders.value = [...sortedAvailable, ...otherOrders]
}

// Start watching user's position
const startWatchingLocation = () => {
  if (navigator.geolocation) {
    locationWatchId.value = navigator.geolocation.watchPosition(
      (position) => {
        const { latitude, longitude } = position.coords
        currentLocation.value = {
          ...currentLocation.value,
          latitude,
          longitude,
        }
        if (currentLocation.value.latitude) {
          filterOrdersByDistance(latitude, longitude)
        }
      },
      (error) => {
        console.error('Watch location error:', error)
      },
      {
        enableHighAccuracy: true,
        maximumAge: 30000,
        timeout: 10000,
      },
    )
  }
}

// Stop watching location
const stopWatchingLocation = () => {
  if (locationWatchId.value && navigator.geolocation) {
    navigator.geolocation.clearWatch(locationWatchId.value)
    locationWatchId.value = null
  }
}

// Fetch orders
const fetchOrders = async () => {
  loading.value = true
  try {
    const { data, error } = await supabase
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
      `,
      )
      .or(
        'status.eq.pending,status.eq.ready_for_pickup,status.eq.accepted,status.eq.picked_up,status.eq.delivered,status.eq.completed,delivery_option.eq.meetup',
      )
      .order('created_at', { ascending: false })

    if (error) throw error

    if (data && data.length > 0) {
      orders.value = data.map((order) => {
        const shop = order.shop || {}
        const pickupAddress =
          [shop.building, shop.street, shop.barangay, shop.city, shop.province]
            .filter(Boolean)
            .join(', ') || 'Store Address'

        const address = order.address || {}
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

        const profile = order.profiles || {}
        const customerName =
          `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || 'Customer'

        const items = (order.order_items || []).map((item) => {
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
        const deliveryFee = order.total_amount - subtotal

        return {
          ...order,
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
          product_summary: items.map((item) => `${item.name} (x${item.quantity})`).join(', '),
        }
      })

      console.log('✅ Orders loaded:', orders.value.length)
    } else {
      console.log('No orders found')
      orders.value = []
    }
  } catch (error) {
    console.error('Error fetching orders:', error)
    orders.value = []
  } finally {
    loading.value = false
  }
}

// Refresh orders
const refreshOrders = () => {
  fetchOrders()
}

// View order details
const viewOrderDetails = (order) => {
  selectedOrder.value = order
  showOrderDetails.value = true
}

// Update order status (this was missing)
const updateOrderStatus = (status) => {
  pendingStatusUpdate.value = status
  showUpdateDialog.value = true
}

// Accept order
const acceptOrder = (order) => {
  selectedOrder.value = order
  showAcceptDialog.value = true
}

const confirmAcceptOrder = async () => {
  accepting.value = true
  try {
    const updateData = {
      status: 'accepted',
      rider_id: authStore.userData?.id,
    }

    try {
      updateData.accepted_at = new Date().toISOString()
    } catch (e) {
      console.log('accepted_at column not available yet')
    }

    const { error } = await supabase
      .from('orders')
      .update(updateData)
      .eq('id', selectedOrder.value.id)

    if (error) throw error

    const index = orders.value.findIndex((o) => o.id === selectedOrder.value.id)
    if (index !== -1) {
      orders.value[index] = {
        ...orders.value[index],
        status: 'accepted',
        rider_id: authStore.userData?.id,
        accepted_at: new Date().toISOString(),
      }
    }

    showAcceptDialog.value = false
    showOrderDetails.value = false
    await fetchOrders()
  } catch (error) {
    console.error('Error accepting order:', error)
    alert('Failed to accept order. Please try again.')
  } finally {
    accepting.value = false
  }
}

const confirmUpdateStatus = async () => {
  updating.value = true
  try {
    const updateData = {
      status: pendingStatusUpdate.value,
    }

    if (pendingStatusUpdate.value === 'picked_up') {
      try {
        updateData.picked_up_at = new Date().toISOString()
      } catch (e) {
        console.log('picked_up_at column not available yet')
      }
    } else if (pendingStatusUpdate.value === 'delivered') {
      try {
        updateData.delivered_at = new Date().toISOString()
        updateData.completed_at = new Date().toISOString()
      } catch (e) {
        console.log('delivered_at or completed_at columns not available yet')
      }
      updateData.rider_earnings = Math.round((selectedOrder.value.delivery_fee || 0) * 0.8)
    }

    const { error } = await supabase
      .from('orders')
      .update(updateData)
      .eq('id', selectedOrder.value.id)

    if (error) throw error

    const index = orders.value.findIndex((o) => o.id === selectedOrder.value.id)
    if (index !== -1) {
      orders.value[index] = {
        ...orders.value[index],
        ...updateData,
      }
    }

    showUpdateDialog.value = false
    showOrderDetails.value = false
    await fetchOrders()
  } catch (error) {
    console.error('Error updating order:', error)
    alert('Failed to update order status. Please try again.')
  } finally {
    updating.value = false
    pendingStatusUpdate.value = null
  }
}

// Navigation
const goToProfile = () => {
  router.push('/profile')
}

const logout = async () => {
  await supabase.auth.signOut()
  router.push('/login')
}

// Load data on mount
onMounted(() => {
  fetchOrders()
})

// Clean up on unmount
onUnmounted(() => {
  stopWatchingLocation()
})

// Add this function in your script section
const handleImageError = (event) => {
  const img = event.target
  img.src = 'https://via.placeholder.com/32?text=No+Image'
  img.onerror = null // Prevent infinite loop
}
</script>
<template>
  <v-app>
    <v-main class="rider-dashboard-main">
      <!-- Header -->
      <div class="header-section">
        <v-btn icon variant="text" class="back-btn" @click="router.back()">
          <v-icon size="28">mdi-arrow-left</v-icon>
        </v-btn>
        <h1 class="page-title">Rider Dashboard</h1>
        <div class="header-actions">
          <v-btn icon variant="text" class="location-btn" @click="goToRiderLocation">
            <v-icon size="24">mdi-crosshairs-gps</v-icon>
          </v-btn>
          <v-menu>
            <template v-slot:activator="{ props }">
              <v-btn icon variant="text" v-bind="props" class="menu-btn">
                <v-icon size="24">mdi-dots-vertical</v-icon>
              </v-btn>
            </template>
            <v-list>
              <v-list-item @click="refreshOrders">
                <template #prepend>
                  <v-icon>mdi-refresh</v-icon>
                </template>
                <v-list-item-title>Refresh</v-list-item-title>
              </v-list-item>
              <v-list-item @click="goToRiderLocation">
                <template #prepend>
                  <v-icon>mdi-crosshairs-gps</v-icon>
                </template>
                <v-list-item-title>My Location</v-list-item-title>
              </v-list-item>
              <v-list-item @click="goToProfile">
                <template #prepend>
                  <v-icon>mdi-account</v-icon>
                </template>
                <v-list-item-title>My Profile</v-list-item-title>
              </v-list-item>
              <v-list-item @click="logout">
                <template #prepend>
                  <v-icon>mdi-logout</v-icon>
                </template>
                <v-list-item-title>Logout</v-list-item-title>
              </v-list-item>
            </v-list>
          </v-menu>
        </div>
      </div>

      <!-- Location Status Bar -->
      <div v-if="currentLocation && currentLocation.address" class="location-status-bar">
        <v-icon size="16" color="#4caf50">mdi-map-marker</v-icon>
        <span class="location-text">{{ currentLocation.address }}</span>
        <span class="location-update-time">Live</span>
      </div>

      <!-- Stats Cards -->
      <div class="stats-container">
        <v-card class="stat-card" elevation="2">
          <div class="stat-content">
            <v-icon size="32" color="#2196f3">mdi-check-circle</v-icon>
            <div class="stat-info">
              <div class="stat-value">{{ stats.acceptedOrders }}</div>
              <div class="stat-label">Accepted Orders</div>
            </div>
          </div>
        </v-card>

        <v-card class="stat-card" elevation="2">
          <div class="stat-content">
            <v-icon size="32" color="#4caf50">mdi-bike-fast</v-icon>
            <div class="stat-info">
              <div class="stat-value">{{ stats.availableOrders }}</div>
              <div class="stat-label">Available Orders</div>
            </div>
          </div>
        </v-card>

        <v-card class="stat-card" elevation="2">
          <div class="stat-content">
            <v-icon size="32" color="#9c27b0">mdi-truck-delivery</v-icon>
            <div class="stat-info">
              <div class="stat-value">{{ stats.pickedUpOrders }}</div>
              <div class="stat-label">Picked Up</div>
            </div>
          </div>
        </v-card>

        <v-card class="stat-card" elevation="2">
          <div class="stat-content">
            <v-icon size="32" color="#ff9800">mdi-currency-php</v-icon>
            <div class="stat-info">
              <div class="stat-value">₱{{ stats.totalEarnings }}</div>
              <div class="stat-label">Total Earnings</div>
            </div>
          </div>
        </v-card>
      </div>

      <!-- Tabs -->
      <v-tabs v-model="activeTab" class="order-tabs" color="#354d7c">
        <v-tab value="accepted">
          <v-icon left>mdi-check-circle</v-icon>
          Accepted
          <v-chip v-if="stats.acceptedOrders > 0" size="small" color="primary" class="ml-2">
            {{ stats.acceptedOrders }}
          </v-chip>
        </v-tab>
        <v-tab value="available">
          <v-icon left>mdi-earth</v-icon>
          Available
          <v-chip v-if="stats.availableOrders > 0" size="small" color="success" class="ml-2">
            {{ stats.availableOrders }}
          </v-chip>
        </v-tab>
        <v-tab value="pickedup">
          <v-icon left>mdi-truck-delivery</v-icon>
          Picked Up
          <v-chip v-if="stats.pickedUpOrders > 0" size="small" color="warning" class="ml-2">
            {{ stats.pickedUpOrders }}
          </v-chip>
        </v-tab>
        <v-tab value="completed">
          <v-icon left>mdi-history</v-icon>
          Completed
        </v-tab>
      </v-tabs>

      <v-tabs-window v-model="activeTab" class="mt-4">
        <!-- Accepted Orders Tab -->
        <v-tabs-window-item value="accepted">
          <div v-if="loading" class="text-center pa-8">
            <v-progress-circular indeterminate color="#354d7c"></v-progress-circular>
            <p class="mt-4">Loading accepted orders...</p>
          </div>

          <div v-else-if="acceptedOrders.length === 0" class="empty-state">
            <v-icon size="80" color="#ccc">mdi-check-circle-outline</v-icon>
            <h3>No Accepted Orders</h3>
            <p>You haven't accepted any orders yet.</p>
          </div>

          <div v-else class="orders-list">
            <v-card
              v-for="order in acceptedOrders"
              :key="order.id"
              class="order-card accepted-card"
              elevation="2"
              @click="viewOrderDetails(order)"
            >
              <div class="order-status-badge status-accepted">Accepted</div>

              <div class="order-header">
                <div class="order-id">
                  Order #{{ order.transaction_number || order.id.slice(-6) }}
                </div>
                <div class="order-time">
                  <v-icon size="16">mdi-clock-outline</v-icon>
                  {{ formatDateTime(order.created_at) }}
                </div>
              </div>

              <div class="order-shop">
                <v-icon size="14" color="#4caf50">mdi-store</v-icon>
                <span class="shop-name">{{ order.shop_name }}</span>
              </div>

              <!-- Products with Images -->
              <div class="order-products">
                <div class="products-label">
                  <v-icon size="14">mdi-package-variant</v-icon>
                  Products:
                </div>
                <div class="products-list">
                  <div
                    v-for="(item, index) in order.items.slice(0, 3)"
                    :key="item.id"
                    class="product-item"
                  >
                    <div
                      class="product-image-wrapper"
                      @click.stop="viewFullImage(item.image, item.name)"
                    >
                      <v-img
                        v-if="item.image"
                        :src="item.image"
                        :alt="item.name"
                        width="32"
                        height="32"
                        class="product-img"
                        cover
                        @error="handleImageError"
                      >
                        <template #placeholder>
                          <v-icon size="20">mdi-package</v-icon>
                        </template>
                      </v-img>
                      <v-icon v-else size="20" color="grey">mdi-package</v-icon>
                    </div>
                    <div class="product-details">
                      <span class="product-name">{{ item.name }}</span>
                      <span class="product-qty">x{{ item.quantity }}</span>
                    </div>
                  </div>
                  <div v-if="order.items.length > 3" class="more-products">
                    +{{ order.items.length - 3 }} more
                  </div>
                </div>
              </div>

              <div class="order-info">
                <div class="info-row">
                  <span class="info-label">Pickup:</span>
                  <span class="info-value">{{ order.pickup_address }}</span>
                </div>
                <div class="info-row">
                  <span class="info-label">Delivery:</span>
                  <span class="info-value">{{ order.delivery_address }}</span>
                </div>
              </div>

              <div class="order-footer">
                <div class="order-amount">
                  <v-icon size="16">mdi-currency-php</v-icon>
                  {{ formatNumber(order.total_amount) }}
                </div>
                <div class="order-distance" v-if="order.distance">
                  <v-icon size="14">mdi-map-marker-distance</v-icon>
                  {{ order.distance }} km
                </div>
                <div class="order-action">
                  <v-btn size="small" color="#ff9800" @click.stop="updateOrderStatus('picked_up')">
                    <v-icon size="16" left>mdi-truck</v-icon>
                    Mark Picked Up
                  </v-btn>
                </div>
              </div>
            </v-card>
          </div>
        </v-tabs-window-item>

        <!-- Available Orders Tab -->
        <v-tabs-window-item value="available">
          <div v-if="loading" class="text-center pa-8">
            <v-progress-circular indeterminate color="#354d7c"></v-progress-circular>
            <p class="mt-4">Loading available orders...</p>
          </div>

          <div v-else-if="availableOrders.length === 0" class="empty-state">
            <v-icon size="80" color="#ccc">mdi-bike-off</v-icon>
            <h3>No Available Orders</h3>
            <p>Check back later for new delivery opportunities.</p>
          </div>

          <div v-else class="orders-list">
            <v-card
              v-for="order in availableOrders"
              :key="order.id"
              class="order-card"
              elevation="2"
              @click="viewOrderDetails(order)"
            >
              <div class="order-status-badge status-pending">Available</div>

              <div class="order-header">
                <div class="order-id">
                  Order #{{ order.transaction_number || order.id.slice(-6) }}
                </div>
                <div class="order-time">
                  <v-icon size="16">mdi-clock-outline</v-icon>
                  {{ formatDateTime(order.created_at) }}
                </div>
              </div>

              <div class="order-shop">
                <v-icon size="14" color="#4caf50">mdi-store</v-icon>
                <span class="shop-name">{{ order.shop_name }}</span>
              </div>

              <!-- Products with Images -->
              <div class="order-products">
                <div class="products-label">
                  <v-icon size="14">mdi-package-variant</v-icon>
                  Products:
                </div>
                <div class="products-list">
                  <div
                    v-for="(item, index) in order.items.slice(0, 3)"
                    :key="item.id"
                    class="product-item"
                  >
                    <div class="product-image-wrapper">
                      <v-img
                        v-if="item.image"
                        :src="item.image"
                        :alt="item.name"
                        width="32"
                        height="32"
                        class="product-img"
                        cover
                        @error="handleImageError"
                      >
                        <template #placeholder>
                          <v-icon size="20">mdi-package</v-icon>
                        </template>
                      </v-img>
                      <v-icon v-else size="20" color="grey">mdi-package</v-icon>
                    </div>
                    <div class="product-details">
                      <span class="product-name">{{ item.name }}</span>
                      <span class="product-qty">x{{ item.quantity }}</span>
                    </div>
                  </div>
                  <div v-if="order.items.length > 3" class="more-products">
                    +{{ order.items.length - 3 }} more
                  </div>
                </div>
              </div>

              <div class="order-info">
                <div class="info-row">
                  <span class="info-label">Pickup:</span>
                  <span class="info-value">{{ order.pickup_address }}</span>
                </div>
                <div class="info-row">
                  <span class="info-label">Delivery:</span>
                  <span class="info-value">{{ order.delivery_address }}</span>
                </div>
              </div>

              <div class="order-footer">
                <div class="order-amount">
                  <v-icon size="16">mdi-currency-php</v-icon>
                  {{ formatNumber(order.total_amount) }}
                </div>
                <div class="order-distance" v-if="order.distance">
                  <v-icon size="14">mdi-map-marker-distance</v-icon>
                  {{ order.distance }} km
                </div>
                <div class="order-action">
                  <v-btn size="small" color="#4caf50" @click.stop="acceptOrder(order)">
                    <v-icon size="16" left>mdi-check</v-icon>
                    Accept
                  </v-btn>
                </div>
              </div>
            </v-card>
          </div>
        </v-tabs-window-item>

        <!-- Picked Up Orders Tab -->
        <v-tabs-window-item value="pickedup">
          <div v-if="loading" class="text-center pa-8">
            <v-progress-circular indeterminate color="#354d7c"></v-progress-circular>
            <p class="mt-4">Loading picked up orders...</p>
          </div>

          <div v-else-if="pickedUpOrders.length === 0" class="empty-state">
            <v-icon size="80" color="#ccc">mdi-truck-off</v-icon>
            <h3>No Picked Up Orders</h3>
            <p>Orders you've picked up will appear here.</p>
          </div>

          <div v-else class="orders-list">
            <v-card
              v-for="order in pickedUpOrders"
              :key="order.id"
              class="order-card picked-card"
              elevation="2"
              @click="viewOrderDetails(order)"
            >
              <div class="order-status-badge status-picked">Picked Up</div>

              <div class="order-header">
                <div class="order-id">
                  Order #{{ order.transaction_number || order.id.slice(-6) }}
                </div>
                <div class="order-time">
                  <v-icon size="16">mdi-clock-outline</v-icon>
                  {{ formatDateTime(order.created_at) }}
                </div>
              </div>

              <div class="order-shop">
                <v-icon size="14" color="#4caf50">mdi-store</v-icon>
                <span class="shop-name">{{ order.shop_name }}</span>
              </div>

              <!-- Products with Images -->
              <div class="order-products">
                <div class="products-label">
                  <v-icon size="14">mdi-package-variant</v-icon>
                  Products:
                </div>
                <div class="products-list">
                  <div
                    v-for="(item, index) in order.items.slice(0, 3)"
                    :key="item.id"
                    class="product-item"
                  >
                    <div class="product-image-wrapper">
                      <v-img
                        v-if="item.image"
                        :src="item.image"
                        :alt="item.name"
                        width="32"
                        height="32"
                        class="product-img"
                        cover
                        @error="handleImageError"
                      >
                        <template #placeholder>
                          <v-icon size="20">mdi-package</v-icon>
                        </template>
                      </v-img>
                      <v-icon v-else size="20" color="grey">mdi-package</v-icon>
                    </div>
                    <div class="product-details">
                      <span class="product-name">{{ item.name }}</span>
                      <span class="product-qty">x{{ item.quantity }}</span>
                    </div>
                  </div>
                  <div v-if="order.items.length > 3" class="more-products">
                    +{{ order.items.length - 3 }} more
                  </div>
                </div>
              </div>

              <div class="order-info">
                <div class="info-row">
                  <span class="info-label">Delivery:</span>
                  <span class="info-value">{{ order.delivery_address }}</span>
                </div>
              </div>

              <div class="order-footer">
                <div class="order-amount">
                  <v-icon size="16">mdi-currency-php</v-icon>
                  {{ formatNumber(order.total_amount) }}
                </div>
                <div class="order-distance" v-if="order.distance">
                  <v-icon size="14">mdi-map-marker-distance</v-icon>
                  {{ order.distance }} km
                </div>
                <div class="order-action">
                  <v-btn size="small" color="#4caf50" @click.stop="updateOrderStatus('delivered')">
                    <v-icon size="16" left>mdi-check</v-icon>
                    Mark Delivered
                  </v-btn>
                </div>
              </div>
            </v-card>
          </div>
        </v-tabs-window-item>

        <!-- Completed Orders Tab -->
        <v-tabs-window-item value="completed">
          <div v-if="loading" class="text-center pa-8">
            <v-progress-circular indeterminate color="#354d7c"></v-progress-circular>
            <p class="mt-4">Loading completed orders...</p>
          </div>

          <div v-else-if="completedOrders.length === 0" class="empty-state">
            <v-icon size="80" color="#ccc">mdi-clipboard-check-outline</v-icon>
            <h3>No Completed Orders</h3>
            <p>Your completed deliveries will appear here.</p>
          </div>

          <div v-else class="orders-list">
            <v-card
              v-for="order in completedOrders"
              :key="order.id"
              class="order-card completed-card"
              elevation="2"
              @click="viewOrderDetails(order)"
            >
              <div class="order-status-badge status-completed">Completed</div>

              <div class="order-header">
                <div class="order-id">
                  Order #{{ order.transaction_number || order.id.slice(-6) }}
                </div>
                <div class="order-time">
                  <v-icon size="16">mdi-calendar-check</v-icon>
                  {{ formatDate(order.completed_at || order.created_at) }}
                </div>
              </div>

              <div class="order-shop">
                <v-icon size="14" color="#4caf50">mdi-store</v-icon>
                <span class="shop-name">{{ order.shop_name }}</span>
              </div>

              <!-- Products with Images -->
              <div class="order-products">
                <div class="products-label">
                  <v-icon size="14">mdi-package-variant</v-icon>
                  Products:
                </div>
                <div class="products-list">
                  <div
                    v-for="(item, index) in order.items.slice(0, 3)"
                    :key="item.id"
                    class="product-item"
                  >
                    <div class="product-image-wrapper">
                      <v-img
                        v-if="item.image"
                        :src="item.image"
                        :alt="item.name"
                        width="32"
                        height="32"
                        class="product-img"
                        cover
                        @error="handleImageError"
                      >
                        <template #placeholder>
                          <v-icon size="20">mdi-package</v-icon>
                        </template>
                      </v-img>
                      <v-icon v-else size="20" color="grey">mdi-package</v-icon>
                    </div>
                    <div class="product-details">
                      <span class="product-name">{{ item.name }}</span>
                      <span class="product-qty">x{{ item.quantity }}</span>
                    </div>
                  </div>
                  <div v-if="order.items.length > 3" class="more-products">
                    +{{ order.items.length - 3 }} more
                  </div>
                </div>
              </div>

              <div class="order-info">
                <div class="info-row">
                  <span class="info-label">Delivery:</span>
                  <span class="info-value">{{ order.delivery_address }}</span>
                </div>
              </div>

              <div class="order-footer">
                <div class="order-amount">
                  <v-icon size="16">mdi-currency-php</v-icon>
                  {{ formatNumber(order.total_amount) }}
                </div>
                <div class="order-earnings" v-if="order.rider_earnings">
                  <v-icon size="14" color="#4caf50">mdi-cash</v-icon>
                  ₱{{ order.rider_earnings }}
                </div>
                <div class="order-action">
                  <v-btn size="small" color="#666" variant="outlined">View Details</v-btn>
                </div>
              </div>
            </v-card>
          </div>
        </v-tabs-window-item>
      </v-tabs-window>
    </v-main>

    <!-- Order Details Dialog -->
    <v-dialog v-model="showOrderDetails" max-width="600" scrollable>
      <v-card v-if="selectedOrder">
        <v-card-title class="dialog-header">
          <div>
            <div class="text-h6">Order Details</div>
            <div class="order-id-small">
              #{{ selectedOrder.transaction_number || selectedOrder.id.slice(-6) }}
            </div>
          </div>
          <v-btn icon @click="showOrderDetails = false">
            <v-icon>mdi-close</v-icon>
          </v-btn>
        </v-card-title>

        <v-divider></v-divider>

        <v-card-text class="pa-4">
          <!-- Order Status -->
          <div class="order-status-section">
            <div class="status-chip" :class="getStatusClass(selectedOrder.status)">
              {{ getStatusText(selectedOrder.status) }}
            </div>
          </div>

          <!-- Pickup & Delivery Info -->
          <div class="info-section">
            <div class="info-title">
              <v-icon size="20" color="#354d7c">mdi-map-marker-path</v-icon>
              <span>Route Information</span>
            </div>

            <div class="route-info">
              <div class="route-point">
                <div class="point-marker pickup">P</div>
                <div class="point-details">
                  <div class="point-label">Pickup Location</div>
                  <div class="point-address">{{ selectedOrder.pickup_address }}</div>
                  <div class="point-label">Shop: {{ selectedOrder.shop_name }}</div>
                </div>
              </div>

              <div class="route-line"></div>

              <div class="route-point">
                <div class="point-marker delivery">D</div>
                <div class="point-details">
                  <div class="point-label">Delivery Location</div>
                  <div class="point-address">{{ selectedOrder.delivery_address }}</div>
                  <div class="point-label">Customer: {{ selectedOrder.customer_name }}</div>
                  <div class="point-label">Phone: {{ selectedOrder.customer_phone }}</div>
                </div>
              </div>
            </div>
          </div>

          <!-- Order Items with Images -->
          <div class="info-section">
            <div class="info-title">
              <v-icon size="20" color="#354d7c">mdi-shopping-bag</v-icon>
              <span>Order Items</span>
            </div>

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
                <tr v-for="item in selectedOrder.items" :key="item.id">
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
                  <td class="text-right">₱{{ formatNumber(selectedOrder.subtotal) }}</td>
                </tr>
                <tr>
                  <td colspan="3" class="text-right">Delivery Fee:</td>
                  <td class="text-right">₱{{ formatNumber(selectedOrder.delivery_fee) }}</td>
                </tr>
                <tr class="total-row">
                  <td colspan="3" class="text-right font-weight-bold">Total:</td>
                  <td class="text-right font-weight-bold">
                    ₱{{ formatNumber(selectedOrder.total_amount) }}
                  </td>
                </tr>
              </tbody>
            </v-table>
          </div>

          <!-- Payment Info -->
          <div class="info-section">
            <div class="info-title">
              <v-icon size="20" color="#354d7c">mdi-credit-card</v-icon>
              <span>Payment Information</span>
            </div>
            <div class="payment-info">
              <div class="payment-field">
                <span class="field-label">Method:</span>
                <span class="field-value">{{ selectedOrder.payment_method }}</span>
              </div>
              <div class="payment-field">
                <span class="field-label">Delivery Option:</span>
                <span class="field-value">{{ selectedOrder.delivery_option || 'Standard' }}</span>
              </div>
            </div>
          </div>
        </v-card-text>

        <v-divider></v-divider>

        <v-card-actions class="dialog-actions">
          <v-btn variant="text" @click="showOrderDetails = false">Close</v-btn>
          <v-spacer></v-spacer>
          <v-btn
            v-if="selectedOrder.status === 'accepted'"
            color="warning"
            @click="updateOrderStatus('picked_up')"
          >
            Mark as Picked Up
          </v-btn>
          <v-btn
            v-if="selectedOrder.status === 'picked_up'"
            color="success"
            @click="updateOrderStatus('delivered')"
          >
            Mark as Delivered
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

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
          <div class="d-flex align-center justify-center" style="height: 300px;">
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
/* Add new styles for different card types */
.accepted-card {
  border-left: 4px solid #2196f3;
}

.picked-card {
  border-left: 4px solid #9c27b0;
}

.completed-card {
  border-left: 4px solid #4caf50;
}

.order-earnings {
  font-size: 0.75rem;
  color: #4caf50;
  display: flex;
  align-items: center;
  gap: 4px;
  font-weight: 500;
}

/* Product styles with images */
.order-shop {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 16px;
  background: #f0f7ff;
  margin: 4px 16px;
  border-radius: 8px;
}

.shop-name {
  font-size: 0.8rem;
  font-weight: 500;
  color: #354d7c;
}

.order-products {
  padding: 8px 16px;
  background: #f8fafc;
  margin: 8px 16px;
  border-radius: 8px;
}

.products-label {
  font-size: 0.7rem;
  color: #666;
  margin-bottom: 6px;
  display: flex;
  align-items: center;
  gap: 4px;
}

.products-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.product-item {
  display: flex;
  align-items: center;
  gap: 10px;
  background: white;
  padding: 6px 12px;
  border-radius: 12px;
  font-size: 0.75rem;
  border: 1px solid #e0e0e0;
  flex: 1;
  min-width: 140px;
}

.product-image-wrapper {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  overflow: hidden;
  background: #f5f5f5;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.product-img {
  border-radius: 8px;
  object-fit: cover;
}

.product-details {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.product-name {
  font-weight: 500;
  color: #333;
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}

.product-qty {
  color: #666;
  font-size: 0.7rem;
  font-weight: 500;
  background: #f0f0f0;
  padding: 2px 6px;
  border-radius: 12px;
}

.more-products {
  font-size: 0.7rem;
  color: #999;
  padding: 4px 8px;
  background: #f5f5f5;
  border-radius: 16px;
}

.order-info {
  padding: 8px 16px;
}

.info-row {
  display: flex;
  margin-bottom: 6px;
  font-size: 0.75rem;
}

.info-label {
  width: 65px;
  color: #666;
  font-weight: 500;
}

.info-value {
  flex: 1;
  color: #333;
  word-break: break-word;
}

/* Main layout styles */
.rider-dashboard-main {
  background: linear-gradient(135deg, #f5f7fa 0%, #ffffff 100%);
  min-height: 100vh;
  padding-bottom: 80px;
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

.header-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}

.back-btn,
.menu-btn,
.location-btn {
  color: white !important;
  background: rgba(255, 255, 255, 0.1) !important;
}

.page-title {
  font-size: 1.5rem;
  font-weight: 600;
  margin: 0;
}

.location-status-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  background: #e8f5e9;
  border-bottom: 1px solid #c8e6c9;
  font-size: 0.8rem;
  color: #2e7d32;
}

.location-text {
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-weight: 500;
}

.stats-container {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 12px;
  padding: 16px;
}

.stat-card {
  border-radius: 16px;
  overflow: hidden;
}

.stat-content {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
}

.stat-value {
  font-size: 1.5rem;
  font-weight: bold;
  color: #354d7c;
  line-height: 1.2;
}

.stat-label {
  font-size: 0.75rem;
  color: #666;
}

.order-tabs {
  background: white;
  margin: 0 16px;
  border-radius: 12px;
  overflow-x: auto;
}

.orders-list {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.order-card {
  border-radius: 16px;
  overflow: hidden;
  cursor: pointer;
  transition:
    transform 0.2s,
    box-shadow 0.2s;
  position: relative;
}

.order-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
}

.order-status-badge {
  position: absolute;
  top: 12px;
  right: 12px;
  padding: 4px 12px;
  border-radius: 20px;
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: uppercase;
}

.status-accepted {
  background: #e3f2fd;
  color: #2196f3;
}

.status-picked {
  background: #f3e5f5;
  color: #9c27b0;
}

.status-completed {
  background: #e8f5e9;
  color: #4caf50;
}

.status-pending {
  background: #fff3e0;
  color: #ff9800;
}

.status-paid {
  background: #e3f2fd;
  color: #2196f3;
}

.status-shipped {
  background: #f3e5f5;
  color: #9c27b0;
}

.order-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 16px 8px 16px;
}

.order-id {
  font-weight: 600;
  color: #354d7c;
  font-size: 0.9rem;
}

.order-time {
  font-size: 0.75rem;
  color: #666;
  display: flex;
  align-items: center;
  gap: 4px;
}

.order-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: #f8fafc;
  border-top: 1px solid #eee;
}

.order-amount {
  font-weight: bold;
  color: #354d7c;
  font-size: 1rem;
  display: flex;
  align-items: center;
  gap: 2px;
}

.order-distance {
  font-size: 0.75rem;
  color: #666;
  display: flex;
  align-items: center;
  gap: 4px;
}

.empty-state {
  text-align: center;
  padding: 60px 20px;
}

.empty-state h3 {
  margin-top: 16px;
  color: #666;
}

.empty-state p {
  color: #999;
  margin-top: 8px;
}

/* Dialog styles */
.dialog-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: linear-gradient(135deg, #354d7c, #5276b0);
  color: white;
  padding: 20px;
}

.order-id-small {
  font-size: 0.75rem;
  opacity: 0.8;
  margin-top: 4px;
}

.info-section {
  margin-bottom: 24px;
}

.info-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  color: #354d7c;
  margin-bottom: 12px;
  padding-bottom: 8px;
  border-bottom: 2px solid #e0e0e0;
}

.route-point {
  display: flex;
  gap: 12px;
  margin: 12px 0;
}

.point-marker {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: bold;
  font-size: 0.8rem;
  color: white;
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
  font-size: 0.9rem;
  font-weight: 500;
  color: #333;
}

.route-line {
  width: 2px;
  height: 20px;
  background: #ddd;
  margin-left: 13px;
}

.payment-info {
  background: #f8fafc;
  padding: 12px;
  border-radius: 12px;
}

.payment-field {
  display: flex;
  margin-bottom: 8px;
}

.field-label {
  width: 80px;
  font-size: 0.8rem;
  color: #666;
}

.field-value {
  flex: 1;
  font-size: 0.9rem;
  color: #333;
  font-weight: 500;
}

.order-status-section {
  text-align: center;
  margin-bottom: 20px;
}

.status-chip {
  display: inline-block;
  padding: 6px 16px;
  border-radius: 20px;
  font-size: 0.8rem;
  font-weight: 600;
}

.subtotal-row,
.total-row {
  border-top: 1px solid #eee;
}

.total-row {
  background: #f8fafc;
  font-weight: bold;
}

.dialog-actions {
  padding: 16px;
}

/* Responsive */
@media (max-width: 600px) {
  .stats-container {
    grid-template-columns: repeat(2, 1fr);
    gap: 8px;
  }

  .stat-value {
    font-size: 1.2rem;
  }

  .page-title {
    font-size: 1.2rem;
  }

  .product-item {
    min-width: 120px;
    padding: 4px 8px;
  }

  .product-name {
    max-width: 80px;
    font-size: 0.7rem;
  }

  .product-image-wrapper {
    width: 28px;
    height: 28px;
  }

  .order-shop,
  .order-products {
    margin: 4px 12px;
    padding: 6px 12px;
  }
}
/* Image preview dialog styles */
.image-preview-dialog {
  border-radius: 16px;
  overflow: hidden;
}

.image-preview-dialog .dialog-header {
  background: linear-gradient(135deg, #354d7c, #5276b0);
  color: white;
  padding: 16px 20px;
}

.image-preview-dialog .dialog-header .text-h6 {
  color: white;
  font-weight: 600;
}

.image-preview-dialog .v-card-text {
  background: #f8fafc;
}

/* Make product images have a pointer cursor */
.product-image-wrapper {
  cursor: pointer;
  transition: transform 0.2s ease;
}

.product-image-wrapper:hover {
  transform: scale(1.1);
}

/* For the order details table image */
.info-section .v-table td div[style*="cursor: pointer"] {
  transition: transform 0.2s ease;
}

.info-section .v-table td div[style*="cursor: pointer"]:hover {
  transform: scale(1.05);
}
</style>
