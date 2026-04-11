<!-- LocationToDeliver.vue -->
<template>
  <div class="location-deliver-container">
    <div class="map-header">
      <v-btn icon variant="text" @click="$router.back()" class="back-btn">
        <v-icon>mdi-arrow-left</v-icon>
      </v-btn>
      <h2 class="map-title">Delivery Route Map</h2>
      <div style="width: 40px;"></div>
    </div>

    <!-- Loading State -->
    <div v-if="loading" class="map-loading">
      <v-progress-circular indeterminate color="#354d7c" size="48"></v-progress-circular>
      <p class="mt-3">Loading map data...</p>
    </div>

    <!-- Map Container -->
    <div ref="mapContainer" class="delivery-map"></div>

    <!-- Legend -->
    <div class="map-legend">
      <div class="legend-item">
        <div class="legend-marker rider"></div>
        <span>Your Location</span>
      </div>
      <div class="legend-item">
        <div class="legend-marker shop"></div>
        <span>Shop Location</span>
      </div>
      <div class="legend-item">
        <div class="legend-marker customer"></div>
        <span>Customer Location</span>
      </div>
      <div class="legend-item">
        <div class="legend-marker route"></div>
        <span>Delivery Route</span>
      </div>
    </div>

    <!-- Route Info Panel -->
    <div class="route-info-panel" v-if="routeInfo">
      <div class="route-info-header">
        <v-icon color="#4caf50" size="20">mdi-information</v-icon>
        <span>Route Information</span>
      </div>
      <div class="route-info-content">
        <div class="route-info-item">
          <v-icon size="16" color="#666">mdi-map-marker-distance</v-icon>
          <span>Total Distance: <strong>{{ routeInfo.distance }}</strong></span>
        </div>
        <div class="route-info-item">
          <v-icon size="16" color="#666">mdi-clock-outline</v-icon>
          <span>Est. Time: <strong>{{ routeInfo.duration }}</strong></span>
        </div>
        <div class="route-info-item" v-if="routeInfo.fromShopToCustomer">
          <v-icon size="16" color="#666">mdi-store</v-icon>
          <span>Shop to Customer: <strong>{{ routeInfo.fromShopToCustomer }}</strong></span>
        </div>
      </div>
    </div>

    <!-- Action Buttons -->
    <div class="map-actions">
      <v-btn color="#354d7c" size="small" @click="fitBounds" class="action-btn">
        <v-icon left size="18">mdi-fit-to-screen</v-icon>
        Fit All
      </v-btn>
      <v-btn color="#354d7c" size="small" @click="centerOnRider" class="action-btn">
        <v-icon left size="18">mdi-crosshairs-gps</v-icon>
        My Location
      </v-btn>
      <v-btn color="#354d7c" size="small" @click="centerOnShop" class="action-btn">
        <v-icon left size="18">mdi-store</v-icon>
        Shop
      </v-btn>
      <v-btn color="#354d7c" size="small" @click="centerOnCustomer" class="action-btn">
        <v-icon left size="18">mdi-home</v-icon>
        Customer
      </v-btn>
    </div>

    <!-- Order Summary Panel -->
    <div class="order-summary-panel" v-if="orderData">
      <div class="summary-header">
        <v-icon color="#354d7c" size="20">mdi-receipt</v-icon>
        <span>Order #{{ orderData.transaction_number || orderData.id.slice(-6) }}</span>
      </div>
      <div class="summary-content">
        <div class="summary-item">
          <span class="label">Shop:</span>
          <span class="value">{{ orderData.shop?.business_name }}</span>
        </div>
        <div class="summary-item">
          <span class="label">Customer:</span>
          <span class="value">{{ orderData.address?.recipient_name }}</span>
        </div>
        <div class="summary-item">
          <span class="label">Status:</span>
          <span class="value status" :class="getStatusClass(orderData.status)">
            {{ getStatusText(orderData.status) }}
          </span>
        </div>
      </div>
    </div>

    <!-- Error Dialog -->
    <v-dialog v-model="showErrorDialog" max-width="350">
      <v-card>
        <v-card-title class="text-h6">Location Error</v-card-title>
        <v-card-text>{{ errorMessage }}</v-card-text>
        <v-card-actions>
          <v-btn color="primary" @click="showErrorDialog = false">OK</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { supabase } from '@/utils/supabase'
import { useAuthUserStore } from '@/stores/authUser'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'

const route = useRoute()
const router = useRouter()
const authStore = useAuthUserStore()

// Mapbox token
const MAPBOX_TOKEN = "pk.eyJ1IjoiY2xvc2VzaG9wIiwiYSI6ImNtaDI2emxocjEwdnVqMHExenFpam42bjcifQ.QDsWVOHM9JPhPQ---Ca4MA"

// State
const loading = ref(true)
const showErrorDialog = ref(false)
const errorMessage = ref('')
const routeInfo = ref(null)

// Map instance
let map = null
let mapInitialized = false
let watchPositionId = null

// Location data
const riderLocation = ref(null)
const shopLocation = ref(null)
const customerLocation = ref(null)
const orderData = ref(null)

// Route data
const routeCoordinates = ref([])

// Refs
const mapContainer = ref(null)

// Get order ID from route params
const orderId = ref(route.params.orderId)

// Helper functions
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

// Fetch order details with shop and address (now with coordinates)
const fetchOrderDetails = async () => {
  try {
    const { data, error } = await supabase
      .from('orders')
      .select(`
        *,
        shop:shop_id (
          id,
          business_name,
          latitude,
          longitude,
          building,
          street,
          barangay,
          city,
          province
        ),
        address:address_id (
          id,
          recipient_name,
          phone,
          latitude,
          longitude,
          street,
          building,
          house_no,
          barangay_name,
          city_name,
          province_name
        )
      `)
      .eq('id', orderId.value)
      .single()

    if (error) throw error

    orderData.value = data

    // Set shop location
    if (data.shop && data.shop.latitude && data.shop.longitude) {
      shopLocation.value = {
        lat: parseFloat(data.shop.latitude),
        lng: parseFloat(data.shop.longitude),
        name: data.shop.business_name,
        address: formatShopAddress(data.shop),
        type: 'shop'
      }
    } else {
      throw new Error('Shop location not available. Please ensure the shop has set their location coordinates.')
    }

    // Set customer location from address (now with coordinates)
    if (data.address && data.address.latitude && data.address.longitude) {
      customerLocation.value = {
        lat: parseFloat(data.address.latitude),
        lng: parseFloat(data.address.longitude),
        name: data.address.recipient_name || 'Customer',
        address: formatAddress(data.address),
        type: 'customer'
      }
    } else if (data.address) {
      // If address exists but no coordinates, show specific error
      throw new Error('Customer location coordinates missing. Please update the delivery address with latitude and longitude.')
    } else {
      throw new Error('Customer address not found for this order.')
    }

    console.log('✅ Order details loaded successfully:', {
      shop: shopLocation.value,
      customer: customerLocation.value,
      rider: riderLocation.value
    })

  } catch (error) {
    console.error('Error fetching order details:', error)
    errorMessage.value = error.message || 'Failed to load order details'
    showErrorDialog.value = true
    loading.value = false
  }
}

// Get current rider location with continuous updates
const getRiderLocation = () => {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation is not supported by your browser'))
      return
    }

    // Get initial position
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const location = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          name: 'Your Location',
          address: `${position.coords.latitude.toFixed(6)}, ${position.coords.longitude.toFixed(6)}`,
          type: 'rider'
        }
        riderLocation.value = location
        resolve(location)
        
        // Start watching position for updates
        if (watchPositionId === null) {
          watchPositionId = navigator.geolocation.watchPosition(
            (newPosition) => {
              const updatedLocation = {
                lat: newPosition.coords.latitude,
                lng: newPosition.coords.longitude,
                name: 'Your Location',
                address: `${newPosition.coords.latitude.toFixed(6)}, ${newPosition.coords.longitude.toFixed(6)}`,
                type: 'rider'
              }
              riderLocation.value = updatedLocation
              
              // Update marker and route on map
              if (map && mapInitialized) {
                updateRiderMarker()
                updateRoute()
              }
            },
            (error) => {
              console.error('Watch position error:', error)
            },
            {
              enableHighAccuracy: true,
              maximumAge: 30000,
              timeout: 10000
            }
          )
        }
      },
      (error) => {
        let errorMsg = 'Unable to get your location. '
        switch (error.code) {
          case error.PERMISSION_DENIED:
            errorMsg += 'Please enable location access in your browser settings.'
            break
          case error.POSITION_UNAVAILABLE:
            errorMsg += 'Location information is unavailable.'
            break
          case error.TIMEOUT:
            errorMsg += 'Location request timed out.'
            break
        }
        reject(new Error(errorMsg))
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
      }
    )
  })
}

// Format shop address for display
const formatShopAddress = (shop) => {
  const parts = [
    shop.building,
    shop.street,
    shop.barangay,
    shop.city,
    shop.province
  ].filter(Boolean)
  return parts.join(', ') || 'Shop Address'
}

// Format customer address for display
const formatAddress = (address) => {
  const parts = [
    address.house_no,
    address.building,
    address.street,
    address.barangay_name,
    address.city_name,
    address.province_name
  ].filter(Boolean)
  return parts.join(', ') || 'Delivery Address'
}

// Get route between points using Mapbox Directions API
const getRoute = async () => {
  if (!riderLocation.value || !shopLocation.value || !customerLocation.value) {
    console.error('Missing location data for routing')
    return null
  }

  try {
    // Create waypoints: rider -> shop -> customer
    const waypoints = [
      `${riderLocation.value.lng},${riderLocation.value.lat}`,
      `${shopLocation.value.lng},${shopLocation.value.lat}`,
      `${customerLocation.value.lng},${customerLocation.value.lat}`
    ].join(';')

    const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${waypoints}?geometries=geojson&overview=full&access_token=${MAPBOX_TOKEN}`
    
    const response = await fetch(url)
    const data = await response.json()

    if (data.code === 'Ok' && data.routes && data.routes.length > 0) {
      const route = data.routes[0]
      routeCoordinates.value = route.geometry.coordinates
      
      // Calculate distance and duration
      const distanceKm = (route.distance / 1000).toFixed(1)
      const durationMin = Math.round(route.duration / 60)
      
      // Calculate shop to customer distance separately
      const shopToCustomerUrl = `https://api.mapbox.com/directions/v5/mapbox/driving/${shopLocation.value.lng},${shopLocation.value.lat};${customerLocation.value.lng},${customerLocation.value.lat}?access_token=${MAPBOX_TOKEN}`
      const shopToCustomerResponse = await fetch(shopToCustomerUrl)
      const shopToCustomerData = await shopToCustomerResponse.json()
      
      let shopToCustomerDist = ''
      if (shopToCustomerData.code === 'Ok' && shopToCustomerData.routes.length > 0) {
        const scDistance = (shopToCustomerData.routes[0].distance / 1000).toFixed(1)
        shopToCustomerDist = `${scDistance} km`
      }
      
      routeInfo.value = {
        distance: `${distanceKm} km`,
        duration: `${durationMin} mins`,
        fromShopToCustomer: shopToCustomerDist
      }
      
      return route
    }
    return null
  } catch (error) {
    console.error('Error getting route:', error)
    return null
  }
}

// Store marker references
let riderMarker = null
let shopMarker = null
let customerMarker = null
let routeSource = null

// Initialize Mapbox map
const initMap = async () => {
  if (!mapContainer.value || mapInitialized) return

  try {
    mapboxgl.accessToken = MAPBOX_TOKEN

    // Calculate center point for initial view
    const bounds = new mapboxgl.LngLatBounds()
    
    if (riderLocation.value) {
      bounds.extend([riderLocation.value.lng, riderLocation.value.lat])
    }
    if (shopLocation.value) {
      bounds.extend([shopLocation.value.lng, shopLocation.value.lat])
    }
    if (customerLocation.value) {
      bounds.extend([customerLocation.value.lng, customerLocation.value.lat])
    }

    // Create map instance
    map = new mapboxgl.Map({
      container: mapContainer.value,
      style: 'mapbox://styles/mapbox/streets-v12',
      center: [shopLocation.value?.lng || 0, shopLocation.value?.lat || 0],
      zoom: 12
    })

    map.on('load', () => {
      mapInitialized = true
      
      // Fit bounds to show all locations
      if (bounds.isEmpty() === false) {
        map.fitBounds(bounds, { padding: 50 })
      }
      
      // Add markers
      addMarkers()
      
      // Add route
      addRoute()
      
      loading.value = false
    })

    // Add navigation control
    map.addControl(new mapboxgl.NavigationControl(), 'top-right')

  } catch (error) {
    console.error('Error initializing map:', error)
    errorMessage.value = 'Failed to initialize map'
    showErrorDialog.value = true
    loading.value = false
  }
}

// Add custom markers to map
const addMarkers = () => {
  if (!map) return

  // Add rider marker (blue with pulse animation)
  if (riderLocation.value) {
    const el = document.createElement('div')
    el.className = 'custom-marker rider-marker'
    el.innerHTML = `
      <div class="marker-pulse rider-pulse"></div>
      <div class="marker-icon rider-icon">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="white">
          <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
        </svg>
      </div>
    `
    
    const popup = new mapboxgl.Popup({ offset: 25 })
      .setHTML(`
        <div class="map-popup">
          <strong>📍 Your Current Location</strong><br>
          <small>${riderLocation.value.address}</small>
        </div>
      `)
    
    riderMarker = new mapboxgl.Marker(el)
      .setLngLat([riderLocation.value.lng, riderLocation.value.lat])
      .setPopup(popup)
      .addTo(map)
  }

  // Add shop marker (orange)
  if (shopLocation.value) {
    const el = document.createElement('div')
    el.className = 'custom-marker shop-marker'
    el.innerHTML = `
      <div class="marker-icon shop-icon">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="white">
          <path d="M20 4H4v2h16V4zm1 4H3v2h18V8zm-2 4H5v8h14v-8z"/>
        </svg>
      </div>
    `
    
    const popup = new mapboxgl.Popup({ offset: 25 })
      .setHTML(`
        <div class="map-popup">
          <strong>🏪 Pickup: ${shopLocation.value.name}</strong><br>
          <small>${shopLocation.value.address}</small>
        </div>
      `)
    
    shopMarker = new mapboxgl.Marker(el)
      .setLngLat([shopLocation.value.lng, shopLocation.value.lat])
      .setPopup(popup)
      .addTo(map)
  }

  // Add customer marker (green)
  if (customerLocation.value) {
    const el = document.createElement('div')
    el.className = 'custom-marker customer-marker'
    el.innerHTML = `
      <div class="marker-icon customer-icon">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="white">
          <path d="M12 3c-4.97 0-9 4.03-9 9s4.03 9 9 9 9-4.03 9-9-4.03-9-9-9zm0 16c-3.86 0-7-3.14-7-7s3.14-7 7-7 7 3.14 7 7-3.14 7-7 7z"/>
          <path d="M12 8c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4z"/>
        </svg>
      </div>
    `
    
    const popup = new mapboxgl.Popup({ offset: 25 })
      .setHTML(`
        <div class="map-popup">
          <strong>🏠 Delivery: ${customerLocation.value.name}</strong><br>
          <small>${customerLocation.value.address}</small>
        </div>
      `)
    
    customerMarker = new mapboxgl.Marker(el)
      .setLngLat([customerLocation.value.lng, customerLocation.value.lat])
      .setPopup(popup)
      .addTo(map)
  }
}

// Update rider marker position
const updateRiderMarker = () => {
  if (riderMarker && riderLocation.value) {
    riderMarker.setLngLat([riderLocation.value.lng, riderLocation.value.lat])
  }
}

// Update route when rider moves
const updateRoute = async () => {
  if (!map || !routeSource) return
  
  await getRoute()
  
  if (routeCoordinates.value.length > 0 && map.getSource('route')) {
    map.getSource('route').setData({
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'LineString',
        coordinates: routeCoordinates.value
      }
    })
  }
}

// Add route line to map
const addRoute = async () => {
  if (!map) return

  // Get route from Mapbox Directions API
  await getRoute()

  if (routeCoordinates.value.length > 0) {
    // Add route source and layer
    map.addSource('route', {
      type: 'geojson',
      data: {
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'LineString',
          coordinates: routeCoordinates.value
        }
      }
    })

    map.addLayer({
      id: 'route',
      type: 'line',
      source: 'route',
      layout: {
        'line-join': 'round',
        'line-cap': 'round'
      },
      paint: {
        'line-color': '#4caf50',
        'line-width': 4,
        'line-opacity': 0.8
      }
    })
    
    routeSource = map.getSource('route')
  }
}

// Fit bounds to show all markers
const fitBounds = () => {
  if (!map) return
  
  const bounds = new mapboxgl.LngLatBounds()
  
  if (riderLocation.value) {
    bounds.extend([riderLocation.value.lng, riderLocation.value.lat])
  }
  if (shopLocation.value) {
    bounds.extend([shopLocation.value.lng, shopLocation.value.lat])
  }
  if (customerLocation.value) {
    bounds.extend([customerLocation.value.lng, customerLocation.value.lat])
  }
  
  if (bounds.isEmpty() === false) {
    map.fitBounds(bounds, { padding: 50 })
  }
}

// Center map on rider location
const centerOnRider = () => {
  if (map && riderLocation.value) {
    map.flyTo({
      center: [riderLocation.value.lng, riderLocation.value.lat],
      zoom: 15,
      duration: 1000
    })
  }
}

// Center map on shop location
const centerOnShop = () => {
  if (map && shopLocation.value) {
    map.flyTo({
      center: [shopLocation.value.lng, shopLocation.value.lat],
      zoom: 15,
      duration: 1000
    })
  }
}

// Center map on customer location
const centerOnCustomer = () => {
  if (map && customerLocation.value) {
    map.flyTo({
      center: [customerLocation.value.lng, customerLocation.value.lat],
      zoom: 15,
      duration: 1000
    })
  }
}

// Load all data and initialize
const loadMapData = async () => {
  loading.value = true
  
  try {
    // Fetch order details (includes shop and address coordinates)
    await fetchOrderDetails()
    
    // Get current rider location
    await getRiderLocation()
    
    // Initialize map with all locations
    await initMap()
    
    console.log('🎉 Map loaded successfully with all 3 locations!')
  } catch (error) {
    console.error('Error loading map data:', error)
    errorMessage.value = error.message || 'Failed to load map data'
    showErrorDialog.value = true
    loading.value = false
  }
}

// Clean up map and geolocation on component unmount
const cleanup = () => {
  if (watchPositionId !== null) {
    navigator.geolocation.clearWatch(watchPositionId)
    watchPositionId = null
  }
  if (map) {
    map.remove()
    map = null
    mapInitialized = false
  }
}

// Lifecycle hooks
onMounted(() => {
  loadMapData()
})

onUnmounted(() => {
  cleanup()
})
</script>

<style scoped>
.location-deliver-container {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: #f5f5f5;
  display: flex;
  flex-direction: column;
}

.map-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px;
  background: linear-gradient(135deg, #354d7c, #5276b0);
  color: white;
  z-index: 10;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

.back-btn {
  color: white !important;
  background: rgba(255, 255, 255, 0.1) !important;
}

.map-title {
  font-size: 1.2rem;
  font-weight: 600;
  margin: 0;
}

.delivery-map {
  flex: 1;
  width: 100%;
  min-height: 0;
}

.map-loading {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  text-align: center;
  z-index: 20;
  background: white;
  padding: 24px;
  border-radius: 16px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.15);
}

/* Custom Marker Styles */
.custom-marker {
  cursor: pointer;
}

.marker-pulse {
  position: absolute;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  opacity: 0.4;
  animation: pulse 1.5s infinite;
}

.rider-pulse {
  background: #2196f3;
}

.marker-icon {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 4px rgba(0,0,0,0.2);
  border: 2px solid white;
}

.rider-icon {
  background: #2196f3;
}

.shop-icon {
  background: #ff9800;
}

.customer-icon {
  background: #4caf50;
}

@keyframes pulse {
  0% {
    transform: scale(0.8);
    opacity: 0.6;
  }
  100% {
    transform: scale(1.5);
    opacity: 0;
  }
}

/* Legend Styles */
.map-legend {
  position: absolute;
  bottom: 20px;
  right: 20px;
  background: white;
  padding: 12px 16px;
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.15);
  z-index: 10;
  font-size: 0.75rem;
  backdrop-filter: blur(10px);
  background: rgba(255, 255, 255, 0.95);
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.legend-item:last-child {
  margin-bottom: 0;
}

.legend-marker {
  width: 20px;
  height: 20px;
  border-radius: 50%;
}

.legend-marker.rider {
  background: #2196f3;
  border: 2px solid white;
  box-shadow: 0 0 0 2px #2196f3;
}

.legend-marker.shop {
  background: #ff9800;
  border: 2px solid white;
  box-shadow: 0 0 0 2px #ff9800;
}

.legend-marker.customer {
  background: #4caf50;
  border: 2px solid white;
  box-shadow: 0 0 0 2px #4caf50;
}

.legend-marker.route {
  width: 30px;
  height: 4px;
  background: #4caf50;
  border-radius: 2px;
  position: relative;
  overflow: hidden;
}

.legend-marker.route::after {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: repeating-linear-gradient(
    90deg,
    transparent,
    transparent 4px,
    rgba(255,255,255,0.5) 4px,
    rgba(255,255,255,0.5) 8px
  );
}

/* Route Info Panel */
.route-info-panel {
  position: absolute;
  bottom: 20px;
  left: 20px;
  background: white;
  padding: 12px 16px;
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.15);
  z-index: 10;
  backdrop-filter: blur(10px);
  background: rgba(255, 255, 255, 0.95);
  min-width: 200px;
}

.route-info-header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  color: #354d7c;
  margin-bottom: 8px;
  padding-bottom: 6px;
  border-bottom: 1px solid #e0e0e0;
}

.route-info-content {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.route-info-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.8rem;
}

/* Order Summary Panel */
.order-summary-panel {
  position: absolute;
  top: 80px;
  left: 20px;
  background: white;
  padding: 12px 16px;
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.15);
  z-index: 10;
  backdrop-filter: blur(10px);
  background: rgba(255, 255, 255, 0.95);
  min-width: 220px;
}

.summary-header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  color: #354d7c;
  margin-bottom: 8px;
  padding-bottom: 6px;
  border-bottom: 1px solid #e0e0e0;
}

.summary-content {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.summary-item {
  display: flex;
  justify-content: space-between;
  font-size: 0.8rem;
}

.summary-item .label {
  color: #666;
  font-weight: 500;
}

.summary-item .value {
  color: #333;
  font-weight: 500;
  text-align: right;
  max-width: 140px;
  word-break: break-word;
}

.summary-item .value.status {
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 0.7rem;
}

.status-pending { background: #fff3e0; color: #ff9800; }
.status-accepted { background: #e3f2fd; color: #2196f3; }
.status-picked { background: #f3e5f5; color: #9c27b0; }
.status-delivered { background: #e8f5e9; color: #4caf50; }
.status-completed { background: #e8f5e9; color: #4caf50; }
.status-cancelled { background: #ffebee; color: #f44336; }

/* Map Actions */
.map-actions {
  position: absolute;
  top: 80px;
  right: 20px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  z-index: 10;
}

.action-btn {
  background: white !important;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
  min-width: 40px !important;
  padding: 6px 12px !important;
}

.action-btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 8px rgba(0,0,0,0.15);
}

/* Popup Styles */
.map-popup {
  padding: 4px;
  max-width: 200px;
}

.map-popup strong {
  color: #354d7c;
}

.map-popup small {
  font-size: 0.7rem;
  color: #666;
  display: block;
  margin-top: 4px;
}

/* Responsive */
@media (max-width: 600px) {
  .map-legend {
    bottom: 10px;
    right: 10px;
    padding: 8px 12px;
    font-size: 0.65rem;
  }
  
  .route-info-panel {
    bottom: 10px;
    left: 10px;
    padding: 8px 12px;
    min-width: 170px;
  }
  
  .order-summary-panel {
    top: 70px;
    left: 10px;
    padding: 8px 12px;
    min-width: 180px;
  }
  
  .map-actions {
    top: 70px;
    right: 10px;
  }
  
  .action-btn {
    padding: 4px 8px !important;
    font-size: 0.7rem !important;
  }
  
  .summary-item .value {
    max-width: 120px;
  }
}
</style>