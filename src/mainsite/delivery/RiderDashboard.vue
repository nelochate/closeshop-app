<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/utils/supabase'
import { useAuthUserStore } from '@/stores/authUser'

const router = useRouter()
const authStore = useAuthUserStore()

// State
const loading = ref(false)
const activeTab = ref('active')
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

// Navigation to Rider Location page
const goToRiderLocation = () => {
  router.push('/RiderLocation')
}
// Orders data
const orders = ref([])

// Computed orders by status
const activeOrders = computed(() => {
  return orders.value.filter(order => 
    order.status === 'accepted' || order.status === 'picked_up'
  ).sort((a, b) => new Date(a.pickup_time) - new Date(b.pickup_time))
})

const availableOrders = computed(() => {
  return orders.value.filter(order => 
    order.status === 'pending' || order.status === 'ready_for_pickup'
  ).sort((a, b) => new Date(a.pickup_time) - new Date(b.pickup_time))
})

const completedOrders = computed(() => {
  return orders.value.filter(order => 
    order.status === 'delivered' || order.status === 'completed'
  ).sort((a, b) => new Date(b.completed_at || b.updated_at) - new Date(a.completed_at || a.updated_at))
})

// Stats
const stats = computed(() => ({
  activeOrders: activeOrders.value.length,
  pendingOrders: availableOrders.value.length,
  completedToday: completedOrders.value.filter(order => {
    const today = new Date().toDateString()
    const orderDate = new Date(order.completed_at || order.updated_at).toDateString()
    return orderDate === today
  }).length,
  totalEarnings: completedOrders.value.reduce((sum, order) => sum + (order.rider_earnings || order.delivery_fee || 0), 0)
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
  return date.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })
}

const formatNumber = (num) => {
  if (!num) return '0'
  return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const getStatusText = (status) => {
  const statusMap = {
    pending: 'Pending',
    ready_for_pickup: 'Ready for Pickup',
    accepted: 'Accepted',
    picked_up: 'Picked Up',
    in_transit: 'In Transit',
    delivered: 'Delivered',
    completed: 'Completed',
    cancelled: 'Cancelled'
  }
  return statusMap[status] || status
}

const getStatusClass = (status) => {
  const classMap = {
    pending: 'status-pending',
    ready_for_pickup: 'status-ready',
    accepted: 'status-accepted',
    picked_up: 'status-picked',
    in_transit: 'status-transit',
    delivered: 'status-delivered',
    completed: 'status-completed',
    cancelled: 'status-cancelled'
  }
  return classMap[status] || 'status-default'
}

const updateStatusText = computed(() => {
  const statusMap = {
    picked_up: 'Picked Up',
    delivered: 'Delivered'
  }
  return statusMap[pendingStatusUpdate.value] || pendingStatusUpdate.value
})

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
      
      // Get address from coordinates
      await getAddressFromCoords(latitude, longitude)
      
      locationLoading.value = false
      
      // Filter and sort orders by distance
      filterOrdersByDistance(latitude, longitude)
      
      // Optional success feedback
      console.log('Location updated successfully')
    },
    (error) => {
      console.error('Location error:', error)
      let errorMessage = 'Unable to get your location. '
      
      switch(error.code) {
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
      maximumAge: 0
    }
  )
}

// Get address from coordinates (reverse geocoding)
const getAddressFromCoords = async (lat, lng) => {
  try {
    // Using OpenStreetMap's Nominatim (free, no API key needed)
    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`
    )
    const data = await response.json()
    
    if (data && data.display_name) {
      // Get a shorter address for display
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
  const R = 6371 // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
  return R * c
}

// Filter and sort orders by distance from current location
const filterOrdersByDistance = (lat, lng) => {
  // For now, this just updates the distance display
  // In production, you would have actual coordinates for pickup locations
  orders.value = orders.value.map(order => {
    // If order has pickup coordinates, calculate real distance
    if (order.pickup_lat && order.pickup_lng) {
      const distance = calculateDistance(lat, lng, order.pickup_lat, order.pickup_lng)
      return { ...order, distance: distance.toFixed(1) }
    }
    // Otherwise keep existing distance or generate a random one for demo
    return order
  })
  
  // Sort available orders by distance (closest first)
  const sortedAvailable = [...availableOrders.value].sort((a, b) => {
    const distA = parseFloat(a.distance) || 999
    const distB = parseFloat(b.distance) || 999
    return distA - distB
  })
  
  // Update the orders array with sorted available orders
  const otherOrders = orders.value.filter(order => 
    order.status !== 'pending' && order.status !== 'ready_for_pickup'
  )
  orders.value = [...sortedAvailable, ...otherOrders]
}

// Start watching user's position (optional real-time updates)
const startWatchingLocation = () => {
  if (navigator.geolocation) {
    locationWatchId.value = navigator.geolocation.watchPosition(
      (position) => {
        const { latitude, longitude } = position.coords
        currentLocation.value = { 
          ...currentLocation.value,
          latitude, 
          longitude 
        }
        // Update order distances in real-time
        if (currentLocation.value.latitude) {
          filterOrdersByDistance(latitude, longitude)
        }
      },
      (error) => {
        console.error('Watch location error:', error)
      },
      {
        enableHighAccuracy: true,
        maximumAge: 30000, // Update every 30 seconds
        timeout: 10000
      }
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
      .select('*')
      .order('pickup_time', { ascending: true })

    if (error) throw error

    // Mock data if no orders exist yet
    if (!data || data.length === 0) {
      orders.value = getMockOrders()
    } else {
      orders.value = data
    }
    
    // If we have a current location, update distances
    if (currentLocation.value?.latitude) {
      filterOrdersByDistance(currentLocation.value.latitude, currentLocation.value.longitude)
    }
  } catch (error) {
    console.error('Error fetching orders:', error)
    // Use mock data for demonstration
    orders.value = getMockOrders()
  } finally {
    loading.value = false
  }
}

// Mock data for demonstration
const getMockOrders = () => {
  const now = new Date()
  return [
    {
      id: 'ORD-001',
      status: 'accepted',
      pickup_address: '123 Main St, Makati',
      delivery_address: '456 Oak Ave, BGC',
      pickup_time: new Date(now.getTime() + 15 * 60000).toISOString(),
      total_amount: 450,
      delivery_fee: 60,
      subtotal: 390,
      distance: '2.3',
      customer_name: 'John Smith',
      customer_phone: '09123456789',
      customer_notes: 'Please call upon arrival',
      payment_method: 'Cash',
      payment_status: 'pending',
      items: [
        { id: 1, name: 'Burger Meal', quantity: 2, price: 150 },
        { id: 2, name: 'Fries', quantity: 1, price: 90 }
      ]
    },
    {
      id: 'ORD-002',
      status: 'pending',
      pickup_address: '789 Pine St, Pasig',
      delivery_address: '321 Cedar Rd, Mandaluyong',
      pickup_time: new Date(now.getTime() + 45 * 60000).toISOString(),
      total_amount: 780,
      delivery_fee: 80,
      subtotal: 700,
      distance: '3.1',
      customer_name: 'Maria Garcia',
      customer_phone: '09876543210',
      payment_method: 'Card',
      payment_status: 'paid',
      items: [
        { id: 1, name: 'Pizza', quantity: 1, price: 450 },
        { id: 2, name: 'Pasta', quantity: 1, price: 250 }
      ]
    },
    {
      id: 'ORD-003',
      status: 'delivered',
      pickup_address: '555 Commerce Ave, Pasay',
      delivery_address: '777 Residences, Taguig',
      pickup_time: new Date(now.getTime() - 120 * 60000).toISOString(),
      completed_at: new Date(now.getTime() - 30 * 60000).toISOString(),
      total_amount: 320,
      delivery_fee: 50,
      subtotal: 270,
      distance: '1.8',
      customer_name: 'Robert Johnson',
      customer_phone: '09123456780',
      payment_method: 'Cash',
      payment_status: 'paid',
      rider_earnings: 70,
      rider_rating: 5,
      items: [
        { id: 1, name: 'Coffee', quantity: 2, price: 85 },
        { id: 2, name: 'Sandwich', quantity: 1, price: 100 }
      ]
    }
  ]
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

// Accept order
const acceptOrder = (order) => {
  selectedOrder.value = order
  showAcceptDialog.value = true
}

const confirmAcceptOrder = async () => {
  accepting.value = true
  try {
    // Update order status to accepted and assign to current rider
    const { error } = await supabase
      .from('orders')
      .update({
        status: 'accepted',
        rider_id: authStore.userData?.id,
        accepted_at: new Date().toISOString()
      })
      .eq('id', selectedOrder.value.id)

    if (error) throw error

    // Update local data
    const index = orders.value.findIndex(o => o.id === selectedOrder.value.id)
    if (index !== -1) {
      orders.value[index] = {
        ...orders.value[index],
        status: 'accepted',
        accepted_at: new Date().toISOString()
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

// Update order status
const updateOrderStatus = (status) => {
  pendingStatusUpdate.value = status
  showUpdateDialog.value = true
}

const confirmUpdateStatus = async () => {
  updating.value = true
  try {
    const updateData = {
      status: pendingStatusUpdate.value
    }

    if (pendingStatusUpdate.value === 'picked_up') {
      updateData.picked_up_at = new Date().toISOString()
    } else if (pendingStatusUpdate.value === 'delivered') {
      updateData.delivered_at = new Date().toISOString()
      updateData.completed_at = new Date().toISOString()
      // Calculate rider earnings (example: 80% of delivery fee)
      updateData.rider_earnings = Math.round((selectedOrder.value.delivery_fee || 0) * 0.8)
    }

    const { error } = await supabase
      .from('orders')
      .update(updateData)
      .eq('id', selectedOrder.value.id)

    if (error) throw error

    // Update local data
    const index = orders.value.findIndex(o => o.id === selectedOrder.value.id)
    if (index !== -1) {
      orders.value[index] = {
        ...orders.value[index],
        ...updateData
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
  // Uncomment to auto-get location on mount
  // getCurrentLocation()
  // Uncomment to start real-time location tracking
  // startWatchingLocation()
})

// Clean up on unmount
onUnmounted(() => {
  stopWatchingLocation()
})
</script>


<template>
  <v-app>
    <v-main class="rider-dashboard-main">
      <!-- Header with Location Button -->
    <!-- Header with Location Button -->
<div class="header-section">
  <v-btn icon variant="text" class="back-btn" @click="router.back()">
    <v-icon size="28">mdi-arrow-left</v-icon>
  </v-btn>
  <h1 class="page-title">Rider Dashboard</h1>
  <div class="header-actions">
    <v-btn 
      icon 
      variant="text" 
      class="location-btn"
      @click="goToRiderLocation"
    >
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

      <!-- Location Status Bar (shows when location is active) -->
      <div v-if="currentLocation && currentLocation.address" class="location-status-bar">
        <v-icon size="16" color="#4caf50">mdi-map-marker</v-icon>
        <span class="location-text">{{ currentLocation.address }}</span>
        <span class="location-update-time">Live</span>
      </div>

      <!-- Stats Cards -->
      <div class="stats-container">
        <v-card class="stat-card" elevation="2">
          <div class="stat-content">
            <v-icon size="32" color="#4caf50">mdi-bike-fast</v-icon>
            <div class="stat-info">
              <div class="stat-value">{{ stats.activeOrders }}</div>
              <div class="stat-label">Active Orders</div>
            </div>
          </div>
        </v-card>

        <v-card class="stat-card" elevation="2">
          <div class="stat-content">
            <v-icon size="32" color="#ff9800">mdi-clock-outline</v-icon>
            <div class="stat-info">
              <div class="stat-value">{{ stats.pendingOrders }}</div>
              <div class="stat-label">Pending Pickup</div>
            </div>
          </div>
        </v-card>

        <v-card class="stat-card" elevation="2">
          <div class="stat-content">
            <v-icon size="32" color="#2196f3">mdi-check-circle</v-icon>
            <div class="stat-info">
              <div class="stat-value">{{ stats.completedToday }}</div>
              <div class="stat-label">Completed Today</div>
            </div>
          </div>
        </v-card>

        <v-card class="stat-card" elevation="2">
          <div class="stat-content">
            <v-icon size="32" color="#9c27b0">mdi-currency-php</v-icon>
            <div class="stat-info">
              <div class="stat-value">₱{{ stats.totalEarnings }}</div>
              <div class="stat-label">Total Earnings</div>
            </div>
          </div>
        </v-card>
      </div>

      <!-- Tabs for Order Views -->
      <v-tabs v-model="activeTab" class="order-tabs" color="#354d7c">
        <v-tab value="active">
          <v-icon left>mdi-bike-fast</v-icon>
          Active Orders
          <v-chip v-if="stats.activeOrders > 0" size="small" color="error" class="ml-2">
            {{ stats.activeOrders }}
          </v-chip>
        </v-tab>
        <v-tab value="available">
          <v-icon left>mdi-earth</v-icon>
          Available Orders
        </v-tab>
        <v-tab value="completed">
          <v-icon left>mdi-history</v-icon>
          Completed
        </v-tab>
      </v-tabs>

      <v-tabs-window v-model="activeTab" class="mt-4">
        <!-- Active Orders Tab -->
        <v-tabs-window-item value="active">
          <div v-if="loading" class="text-center pa-8">
            <v-progress-circular indeterminate color="#354d7c"></v-progress-circular>
            <p class="mt-4">Loading orders...</p>
          </div>

          <div v-else-if="activeOrders.length === 0" class="empty-state">
            <v-icon size="80" color="#ccc">mdi-bike-off</v-icon>
            <h3>No Active Orders</h3>
            <p>You don't have any active orders at the moment.</p>
          </div>

          <div v-else class="orders-list">
            <v-card
              v-for="order in activeOrders"
              :key="order.id"
              class="order-card"
              elevation="2"
              @click="viewOrderDetails(order)"
            >
              <div class="order-status-badge" :class="getStatusClass(order.status)">
                {{ getStatusText(order.status) }}
              </div>

              <div class="order-header">
                <div class="order-id">Order #{{ order.id.slice(-6) }}</div>
                <div class="order-time">
                  <v-icon size="16">mdi-clock-outline</v-icon>
                  {{ formatTime(order.pickup_time) }}
                </div>
              </div>

              <div class="order-locations">
                <div class="location-item">
                  <v-icon size="20" color="#4caf50">mdi-store</v-icon>
                  <div class="location-details">
                    <div class="location-label">Pickup</div>
                    <div class="location-address">{{ order.pickup_address }}</div>
                  </div>
                </div>

                <div class="location-arrow">
                  <v-icon size="20" color="#999">mdi-arrow-down</v-icon>
                </div>

                <div class="location-item">
                  <v-icon size="20" color="#f44336">mdi-home</v-icon>
                  <div class="location-details">
                    <div class="location-label">Delivery</div>
                    <div class="location-address">{{ order.delivery_address }}</div>
                  </div>
                </div>
              </div>

              <div class="order-footer">
                <div class="order-amount">
                  <v-icon size="16">mdi-currency-php</v-icon>
                  {{ formatNumber(order.total_amount) }}
                </div>
                <div class="order-distance">
                  <v-icon size="14">mdi-map-marker-distance</v-icon>
                  {{ order.distance || '~2.5' }} km
                </div>
                <div class="order-action">
                  <v-btn size="small" color="#354d7c" variant="outlined">View Details</v-btn>
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
            <v-icon size="80" color="#ccc">mdi-clipboard-clock-outline</v-icon>
            <h3>No Available Orders</h3>
            <p>Check back later for new delivery opportunities.</p>
          </div>

          <div v-else class="orders-list">
            <v-card
              v-for="order in availableOrders"
              :key="order.id"
              class="order-card available"
              elevation="2"
              @click="viewOrderDetails(order)"
            >
              <div class="order-status-badge available-badge">Available</div>

              <div class="order-header">
                <div class="order-id">Order #{{ order.id.slice(-6) }}</div>
                <div class="order-time">
                  <v-icon size="16">mdi-clock-outline</v-icon>
                  {{ formatTime(order.pickup_time) }}
                </div>
              </div>

              <div class="order-locations">
                <div class="location-item">
                  <v-icon size="20" color="#4caf50">mdi-store</v-icon>
                  <div class="location-details">
                    <div class="location-label">Pickup</div>
                    <div class="location-address">{{ order.pickup_address }}</div>
                  </div>
                </div>

                <div class="location-arrow">
                  <v-icon size="20" color="#999">mdi-arrow-down</v-icon>
                </div>

                <div class="location-item">
                  <v-icon size="20" color="#f44336">mdi-home</v-icon>
                  <div class="location-details">
                    <div class="location-label">Delivery</div>
                    <div class="location-address">{{ order.delivery_address }}</div>
                  </div>
                </div>
              </div>

              <div class="order-footer">
                <div class="order-amount">
                  <v-icon size="16">mdi-currency-php</v-icon>
                  {{ formatNumber(order.total_amount) }}
                </div>
                <div class="order-distance">
                  <v-icon size="14">mdi-map-marker-distance</v-icon>
                  {{ order.distance || '~2.5' }} km
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
              class="order-card completed"
              elevation="2"
              @click="viewOrderDetails(order)"
            >
              <div class="order-status-badge completed-badge">Completed</div>

              <div class="order-header">
                <div class="order-id">Order #{{ order.id.slice(-6) }}</div>
                <div class="order-time">
                  <v-icon size="16">mdi-calendar-check</v-icon>
                  {{ formatDate(order.completed_at || order.created_at) }}
                </div>
              </div>

              <div class="order-locations">
                <div class="location-item">
                  <v-icon size="20" color="#4caf50">mdi-store</v-icon>
                  <div class="location-details">
                    <div class="location-label">Pickup</div>
                    <div class="location-address">{{ order.pickup_address }}</div>
                  </div>
                </div>

                <div class="location-arrow">
                  <v-icon size="20" color="#999">mdi-arrow-down</v-icon>
                </div>

                <div class="location-item">
                  <v-icon size="20" color="#f44336">mdi-home</v-icon>
                  <div class="location-details">
                    <div class="location-label">Delivery</div>
                    <div class="location-address">{{ order.delivery_address }}</div>
                  </div>
                </div>
              </div>

              <div class="order-footer">
                <div class="order-amount">
                  <v-icon size="16">mdi-currency-php</v-icon>
                  {{ formatNumber(order.total_amount) }}
                </div>
                <div class="order-rating" v-if="order.rider_rating">
                  <v-icon size="14" color="#ffc107">mdi-star</v-icon>
                  {{ order.rider_rating }}
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
            <div class="order-id-small">#{{ selectedOrder.id }}</div>
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
                  <div class="point-time" v-if="selectedOrder.pickup_time">
                    <v-icon size="14">mdi-clock</v-icon>
                    {{ formatDateTime(selectedOrder.pickup_time) }}
                  </div>
                </div>
              </div>

              <div class="route-line"></div>

              <div class="route-point">
                <div class="point-marker delivery">D</div>
                <div class="point-details">
                  <div class="point-label">Delivery Location</div>
                  <div class="point-address">{{ selectedOrder.delivery_address }}</div>
                  <div class="point-time" v-if="selectedOrder.delivery_time">
                    <v-icon size="14">mdi-clock</v-icon>
                    {{ formatDateTime(selectedOrder.delivery_time) }}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Order Items -->
          <div class="info-section">
            <div class="info-title">
              <v-icon size="20" color="#354d7c">mdi-shopping-bag</v-icon>
              <span>Order Items</span>
            </div>

            <v-table density="compact">
              <thead>
                <tr>
                  <th>Item</th>
                  <th class="text-center">Qty</th>
                  <th class="text-right">Price</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="item in selectedOrder.items" :key="item.id">
                  <td>{{ item.name }}</td>
                  <td class="text-center">x{{ item.quantity }}</td>
                  <td class="text-right">₱{{ formatNumber(item.price * item.quantity) }}</td>
                </tr>
                <tr class="subtotal-row">
                  <td colspan="2" class="text-right font-weight-bold">Subtotal:</td>
                  <td class="text-right">₱{{ formatNumber(selectedOrder.subtotal) }}</td>
                </tr>
                <tr>
                  <td colspan="2" class="text-right">Delivery Fee:</td>
                  <td class="text-right">₱{{ formatNumber(selectedOrder.delivery_fee) }}</td>
                </tr>
                <tr class="total-row">
                  <td colspan="2" class="text-right font-weight-bold">Total:</td>
                  <td class="text-right font-weight-bold">
                    ₱{{ formatNumber(selectedOrder.total_amount) }}
                  </td>
                </tr>
              </tbody>
            </v-table>
          </div>

          <!-- Customer Info -->
          <div class="info-section">
            <div class="info-title">
              <v-icon size="20" color="#354d7c">mdi-account-circle</v-icon>
              <span>Customer Information</span>
            </div>

            <div class="customer-info">
              <div class="customer-field">
                <span class="field-label">Name:</span>
                <span class="field-value">{{ selectedOrder.customer_name }}</span>
              </div>
              <div class="customer-field">
                <span class="field-label">Phone:</span>
                <span class="field-value">{{ selectedOrder.customer_phone }}</span>
              </div>
              <div class="customer-field" v-if="selectedOrder.customer_notes">
                <span class="field-label">Notes:</span>
                <span class="field-value">{{ selectedOrder.customer_notes }}</span>
              </div>
            </div>
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
              <div class="payment-field" v-if="selectedOrder.payment_status">
                <span class="field-label">Status:</span>
                <span class="field-value" :class="selectedOrder.payment_status === 'paid' ? 'success-text' : 'warning-text'">
                  {{ selectedOrder.payment_status.toUpperCase() }}
                </span>
              </div>
            </div>
          </div>
        </v-card-text>

        <v-divider></v-divider>

        <v-card-actions class="dialog-actions">
          <v-btn variant="text" @click="showOrderDetails = false">Close</v-btn>
          <v-spacer></v-spacer>
          <v-btn
            v-if="selectedOrder.status === 'pending'"
            color="primary"
            @click="acceptOrder(selectedOrder)"
          >
            Accept Order
          </v-btn>
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
          <p class="text-caption text-grey">You will have {{ selectedOrder?.pickup_window || '30' }} minutes to pick up the order.</p>
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
          <p>Are you sure you want to mark this order as <strong>{{ updateStatusText }}</strong>?</p>
        </v-card-text>
        <v-card-actions>
          <v-btn variant="text" @click="showUpdateDialog = false">Cancel</v-btn>
          <v-spacer></v-spacer>
          <v-btn color="primary" :loading="updating" @click="confirmUpdateStatus">Confirm</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-app>
</template>


<style scoped>
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

.back-btn, .menu-btn, .location-btn {
  color: white !important;
  background: rgba(255, 255, 255, 0.1) !important;
}

.location-btn {
  transition: all 0.3s ease;
}

.location-btn:hover {
  background: rgba(255, 255, 255, 0.2) !important;
  transform: scale(1.05);
}

.page-title {
  font-size: 1.5rem;
  font-weight: 600;
  margin: 0;
}

/* Location Status Bar */
.location-status-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  background: #e8f5e9;
  border-bottom: 1px solid #c8e6c9;
  font-size: 0.8rem;
  color: #2e7d32;
  animation: slideDown 0.3s ease;
}

@keyframes slideDown {
  from {
    opacity: 0;
    transform: translateY(-10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.location-text {
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-weight: 500;
}

.location-update-time {
  font-size: 0.7rem;
  color: #66bb6a;
  font-weight: 500;
}

/* Stats Container */
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

.stat-info {
  flex: 1;
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

/* Order Tabs */
.order-tabs {
  background: white;
  margin: 0 16px;
  border-radius: 12px;
  overflow: hidden;
}

/* Orders List */
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
  transition: transform 0.2s, box-shadow 0.2s;
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

.status-pending, .status-ready {
  background: #fff3e0;
  color: #ff9800;
}

.status-accepted, .status-picked, .status-transit {
  background: #e3f2fd;
  color: #2196f3;
}

.status-delivered, .status-completed {
  background: #e8f5e9;
  color: #4caf50;
}

.status-cancelled {
  background: #ffebee;
  color: #f44336;
}

.available-badge {
  background: #e8f5e9;
  color: #4caf50;
}

.completed-badge {
  background: #e0e0e0;
  color: #666;
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

.order-locations {
  padding: 8px 16px;
}

.location-item {
  display: flex;
  gap: 12px;
  align-items: flex-start;
}

.location-details {
  flex: 1;
}

.location-label {
  font-size: 0.7rem;
  color: #999;
  text-transform: uppercase;
}

.location-address {
  font-size: 0.85rem;
  color: #333;
  font-weight: 500;
}

.location-arrow {
  text-align: center;
  padding: 4px 0 4px 28px;
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

/* Empty State */
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

/* Dialog Styles */
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

.route-info {
  padding: 8px 0;
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

.point-time {
  font-size: 0.75rem;
  color: #666;
  margin-top: 4px;
  display: flex;
  align-items: center;
  gap: 4px;
}

.route-line {
  width: 2px;
  height: 20px;
  background: #ddd;
  margin-left: 13px;
}

.customer-info, .payment-info {
  background: #f8fafc;
  padding: 12px;
  border-radius: 12px;
}

.customer-field, .payment-field {
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

.subtotal-row, .total-row {
  border-top: 1px solid #eee;
}

.total-row {
  background: #f8fafc;
  font-weight: bold;
}

.success-text {
  color: #4caf50;
  font-weight: bold;
}

.warning-text {
  color: #ff9800;
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

  .stat-content {
    padding: 12px;
  }

  .stat-value {
    font-size: 1.2rem;
  }

  .order-card:hover {
    transform: none;
  }

  .page-title {
    font-size: 1.2rem;
  }
  
  .location-status-bar {
    font-size: 0.7rem;
    padding: 6px 12px;
  }
  
  .location-text {
    font-size: 0.7rem;
  }
}
</style>