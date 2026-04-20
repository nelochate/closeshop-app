<template>
  <div class="location-deliver-container">
    <div class="map-header">
      <v-btn icon variant="text" @click="$router.back()" class="back-btn">
        <v-icon>mdi-arrow-left</v-icon>
      </v-btn>
      <h2 class="map-title">Delivery Route Map</h2>
      <v-btn icon variant="text" @click="refreshAllData" class="refresh-btn" :loading="refreshing">
        <v-icon>mdi-refresh</v-icon>
      </v-btn>
    </div>

    <!-- Loading State -->
    <div v-if="loading" class="map-loading">
      <v-progress-circular indeterminate color="#354d7c" size="48"></v-progress-circular>
      <p class="mt-3">Loading map data...</p>
    </div>

    <!-- Map Container -->
    <div ref="mapContainer" class="delivery-map"></div>

    <!-- Combined Master Panel -->
    <div class="master-panel" v-if="shopLocation && customerLocation">
      <div class="master-header" @click="toggleMasterPanel">
        <div class="header-left">
          <v-icon color="#354d7c" size="20">mdi-view-dashboard</v-icon>
          <span>Delivery Details</span>
        </div>
        <div class="header-actions">
          <v-btn icon size="small" variant="text" @click.stop="refreshLocations" :loading="refreshingLocations" class="refresh-icon-btn">
            <v-icon size="18">mdi-refresh</v-icon>
          </v-btn>
          <v-icon size="20" class="toggle-icon">
            {{ masterPanelCollapsed ? 'mdi-chevron-up' : 'mdi-chevron-down' }}
          </v-icon>
        </div>
      </div>
      
      <div v-show="!masterPanelCollapsed" class="master-content">
        <!-- Order Summary Section -->
        <div class="section" v-if="orderData">
          <div class="section-header">
            <v-icon color="#354d7c" size="18">mdi-receipt</v-icon>
            <span>Order Information</span>
          </div>
          <div class="section-content">
            <div class="info-row">
              <span class="label">Order #:</span>
              <span class="value">{{ orderData.transaction_number || orderData.id?.slice(-6) }}</span>
            </div>
            <div class="info-row">
              <span class="label">Shop:</span>
              <span class="value">{{ orderData.shop?.business_name }}</span>
            </div>
            <div class="info-row">
              <span class="label">Customer:</span>
              <span class="value">{{ orderData.address?.recipient_name }}</span>
            </div>
            <div class="info-row">
              <span class="label">Status:</span>
              <span class="value status" :class="getStatusClass(orderData.status)">
                {{ getStatusText(orderData.status) }}
              </span>
            </div>
          </div>
        </div>

        <!-- Delivery Points & Legend Combined Section -->
        <div class="section">
          <div class="section-header">
            <v-icon color="#354d7c" size="18">mdi-map-marker-multiple</v-icon>
            <span>Locations & Legend</span>
          </div>
          <div class="section-content">
            <!-- Delivery Points -->
            <div class="location-item" :class="{ active: activePoint === 'rider' }" @click="handleLocationClick('rider')">
              <div class="location-icon rider-icon-small">
                <span>📍</span>
              </div>
              <div class="location-details">
                <span class="location-label">Rider Location:</span>
                <span class="location-address">{{ riderLocation?.address || 'Detecting...' }}</span>
              </div>
            </div>
            <div class="location-item" :class="{ active: activePoint === 'shop' }" @click="handleLocationClick('shop')">
              <div class="location-icon shop-icon-small">
                <span>🏪</span>
              </div>
              <div class="location-details">
                <span class="location-label">Pickup Point:</span>
                <span class="location-address">{{ shopLocation?.name || 'Loading...' }}</span>
                <span class="location-address-small">{{ shopLocation?.address }}</span>
              </div>
            </div>
            <div class="location-item" :class="{ active: activePoint === 'customer' }" @click="handleLocationClick('customer')">
              <div class="location-icon customer-icon-small">
                <span>🏠</span>
              </div>
              <div class="location-details">
                <span class="location-label">Delivery Point:</span>
                <span class="location-address">{{ customerLocation?.name || 'Loading...' }}</span>
                <span class="location-address-small">{{ customerLocation?.address }}</span>
              </div>
            </div>

            <!-- Divider -->
            <div class="legend-divider"></div>

            <!-- Legend Items -->
            <div class="legend-item">
              <div class="legend-marker rider"></div>
              <span>📍 Rider Location (Blue)</span>
            </div>
            <div class="legend-item">
              <div class="legend-marker shop"></div>
              <span>🏪 Shop Location (Orange)</span>
            </div>
            <div class="legend-item">
              <div class="legend-marker customer"></div>
              <span>🏠 Customer Location (Green)</span>
            </div>
            <div class="legend-item">
              <div class="legend-marker route"></div>
              <span>🛣️ Delivery Route (Green Line)</span>
            </div>
          </div>
        </div>

        <!-- Route Information Section -->
        <div class="section" v-if="routeInfo">
          <div class="section-header">
            <v-icon color="#4caf50" size="18">mdi-information</v-icon>
            <span>Route Information</span>
          </div>
          <div class="section-content">
            <div class="info-row">
              <v-icon size="14" color="#666">mdi-map-marker-distance</v-icon>
              <span class="label">Total Distance:</span>
              <span class="value"><strong>{{ routeInfo.distance }}</strong></span>
            </div>
            <div class="info-row">
              <v-icon size="14" color="#666">mdi-clock-outline</v-icon>
              <span class="label">Est. Time:</span>
              <span class="value"><strong>{{ routeInfo.duration }}</strong></span>
            </div>
            <div class="info-row" v-if="routeInfo.fromShopToCustomer">
              <v-icon size="14" color="#666">mdi-store</v-icon>
              <span class="label">Shop to Customer:</span>
              <span class="value"><strong>{{ routeInfo.fromShopToCustomer }}</strong></span>
            </div>
          </div>
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
import { ref, onMounted, onUnmounted, watch, nextTick } from 'vue'
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
const refreshing = ref(false)
const refreshingLocations = ref(false)
const showErrorDialog = ref(false)
const errorMessage = ref('')
const routeInfo = ref(null)
const activePoint = ref(null)

// Panel collapse state
const masterPanelCollapsed = ref(false)

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

// Toggle master panel
const toggleMasterPanel = () => {
  masterPanelCollapsed.value = !masterPanelCollapsed.value
}

// Handle location click - minimizes panel and centers on location
const handleLocationClick = (type) => {
  // Minimize the panel
  masterPanelCollapsed.value = true
  
  // Center on the selected location with slight delay for smooth animation
  setTimeout(() => {
    if (type === 'rider') {
      centerOnRider()
    } else if (type === 'shop') {
      centerOnShop()
    } else if (type === 'customer') {
      centerOnCustomer()
    }
  }, 100)
}

// Refresh all data
const refreshAllData = async () => {
  refreshing.value = true
  try {
    await fetchOrderDetails()
    await getRiderLocation()
    if (map && mapInitialized) {
      addMarkers()
      await addRoute()
      fitBounds()
    }
  } catch (error) {
    console.error('Error refreshing data:', error)
    errorMessage.value = 'Failed to refresh data'
    showErrorDialog.value = true
  } finally {
    refreshing.value = false
  }
}

// Refresh locations only
const refreshLocations = async () => {
  refreshingLocations.value = true
  try {
    await getRiderLocation()
    if (map && mapInitialized) {
      addMarkers()
      await updateRoute()
      fitBounds()
    }
  } catch (error) {
    console.error('Error refreshing locations:', error)
  } finally {
    refreshingLocations.value = false
  }
}

// Helper functions for status display
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

// Helper function to geocode address using OpenStreetMap Nominatim
const geocodeAddress = async (address) => {
  try {
    const queryParts = []
    if (address.barangay_name) queryParts.push(address.barangay_name)
    if (address.city_name) queryParts.push(address.city_name)
    if (address.province_name) queryParts.push(address.province_name)
    if (address.region_name) queryParts.push(address.region_name)
    queryParts.push('Philippines')
    
    const query = queryParts.join(', ')
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&countrycodes=ph&limit=1`
    
    console.log('Geocoding address:', query)
    
    const response = await fetch(url)
    const data = await response.json()
    
    if (data && data.length > 0) {
      const lat = parseFloat(data[0].lat)
      const lng = parseFloat(data[0].lon)
      console.log('Geocoding successful:', { lat, lng })
      return { lat, lng }
    }
    return null
  } catch (error) {
    console.error('Geocoding error:', error)
    return null
  }
}

// Helper function to update address with geocoded coordinates
const updateAddressCoordinates = async (addressId, lat, lng) => {
  try {
    const { error } = await supabase
      .from('addresses')
      .update({ 
        latitude: lat, 
        longitude: lng,
        updated_at: new Date().toISOString()
      })
      .eq('id', addressId)
    
    if (error) {
      console.error('Error updating address coordinates:', error)
    } else {
      console.log('Address coordinates updated successfully')
    }
  } catch (error) {
    console.error('Failed to update address coordinates:', error)
  }
}

// Fetch order details with shop and address
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
          province_name,
          region_name
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
      console.log('✅ Shop location loaded:', shopLocation.value)
    } else if (data.shop) {
      console.log('Shop coordinates missing, attempting to geocode...')
      const geocoded = await geocodeAddress({
        barangay_name: data.shop.barangay,
        city_name: data.shop.city,
        province_name: data.shop.province
      })
      
      if (geocoded) {
        shopLocation.value = {
          lat: geocoded.lat,
          lng: geocoded.lng,
          name: data.shop.business_name,
          address: formatShopAddress(data.shop),
          type: 'shop'
        }
        await supabase
          .from('shops')
          .update({ latitude: geocoded.lat, longitude: geocoded.lng })
          .eq('id', data.shop.id)
        console.log('✅ Shop location geocoded:', shopLocation.value)
      } else {
        throw new Error('Unable to locate shop address.')
      }
    } else {
      throw new Error('Shop location not available.')
    }

    // Set customer location
    if (data.address) {
      let customerLat = data.address.latitude
      let customerLng = data.address.longitude
      
      if (!customerLat || !customerLng) {
        console.log('Customer address missing coordinates, geocoding...')
        const geocoded = await geocodeAddress(data.address)
        
        if (geocoded) {
          customerLat = geocoded.lat
          customerLng = geocoded.lng
          await updateAddressCoordinates(data.address.id, customerLat, customerLng)
          console.log('✅ Customer address geocoded successfully')
        } else {
          throw new Error(`Unable to locate customer address: ${data.address.barangay_name}, ${data.address.city_name}`)
        }
      }
      
      customerLocation.value = {
        lat: parseFloat(customerLat),
        lng: parseFloat(customerLng),
        name: data.address.recipient_name || 'Customer',
        address: formatAddress(data.address),
        type: 'customer'
      }
      console.log('✅ Customer location loaded:', customerLocation.value)
    } else {
      throw new Error('Customer address not found.')
    }

    console.log('🎯 All 3 locations loaded successfully!')

  } catch (error) {
    console.error('Error fetching order details:', error)
    errorMessage.value = error.message || 'Failed to load order details'
    showErrorDialog.value = true
    loading.value = false
  }
}

// Get current rider location
const getRiderLocation = () => {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation is not supported'))
      return
    }

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
        console.log('✅ Rider location loaded:', riderLocation.value)
        resolve(location)
        
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
              if (map && mapInitialized) {
                updateRiderMarker()
                updateRoute()
              }
            },
            (error) => console.error('Watch error:', error),
            { enableHighAccuracy: true, maximumAge: 30000, timeout: 10000 }
          )
        }
      },
      (error) => {
        let errorMsg = 'Unable to get your location. '
        switch (error.code) {
          case error.PERMISSION_DENIED:
            errorMsg += 'Please enable location access.'
            break
          case error.POSITION_UNAVAILABLE:
            errorMsg += 'Location unavailable.'
            break
          case error.TIMEOUT:
            errorMsg += 'Location request timed out.'
            break
        }
        reject(new Error(errorMsg))
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    )
  })
}

// Format addresses
const formatShopAddress = (shop) => {
  const parts = [shop.building, shop.street, shop.barangay, shop.city, shop.province].filter(Boolean)
  return parts.join(', ') || 'Shop Address'
}

const formatAddress = (address) => {
  const parts = [address.house_no, address.building, address.street, address.barangay_name, address.city_name, address.province_name].filter(Boolean)
  return parts.join(', ') || 'Delivery Address'
}

// Get route between all 3 points
const getRoute = async () => {
  if (!riderLocation.value || !shopLocation.value || !customerLocation.value) {
    console.error('Missing location data for routing')
    return null
  }

  try {
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
      
      const distanceKm = (route.distance / 1000).toFixed(1)
      const durationMin = Math.round(route.duration / 60)
      
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
      
      console.log('✅ Route calculated:', routeInfo.value)
      return route
    }
    return null
  } catch (error) {
    console.error('Error getting route:', error)
    return null
  }
}

// Marker references
let riderMarker = null
let shopMarker = null
let customerMarker = null
let routeSource = null

// Initialize map
const initMap = async () => {
  if (!mapContainer.value || mapInitialized) return

  try {
    mapboxgl.accessToken = MAPBOX_TOKEN

    await nextTick()

    map = new mapboxgl.Map({
      container: mapContainer.value,
      style: 'mapbox://styles/mapbox/streets-v12',
      center: [121.774, 12.8797],
      zoom: 11
    })

    map.addControl(new mapboxgl.NavigationControl(), 'top-right')

    map.on('load', async () => {
      mapInitialized = true
      console.log('Map loaded, adding markers...')
      
      addMarkers()
      await addRoute()
      fitBounds()
      
      loading.value = false
      console.log('🎉 Map initialization complete!')
    })

    map.on('error', (error) => {
      console.error('Map error:', error)
    })

  } catch (error) {
    console.error('Error initializing map:', error)
    errorMessage.value = 'Failed to initialize map'
    showErrorDialog.value = true
    loading.value = false
  }
}

// Add markers for all 3 points - USING EMOJIS FOR RELIABLE DISPLAY
const addMarkers = () => {
  if (!map || !mapInitialized) {
    console.log('Map not ready for markers yet')
    return
  }

  console.log('Adding markers to map...')

  // Rider marker (Blue circle with location emoji)
  if (riderLocation.value && riderLocation.value.lat && riderLocation.value.lng) {
    if (riderMarker) riderMarker.remove()
    
    const el = document.createElement('div')
    el.className = 'custom-marker rider-marker'
    el.innerHTML = `
      <div class="marker-icon rider-icon">
        <span class="marker-emoji">📍</span>
      </div>
      <div class="marker-label">You are here</div>
    `
    
    const popup = new mapboxgl.Popup({ offset: 35 })
      .setHTML(`
        <div class="map-popup">
          <strong>📍 Rider Location</strong><br>
          <small>${riderLocation.value.address}</small>
        </div>
      `)
    
    riderMarker = new mapboxgl.Marker({ element: el, draggable: false })
      .setLngLat([riderLocation.value.lng, riderLocation.value.lat])
      .setPopup(popup)
      .addTo(map)
    
    console.log('✅ Rider marker added at:', riderLocation.value.lat, riderLocation.value.lng)
  }

  // Shop marker (Orange circle with shop emoji)
  if (shopLocation.value && shopLocation.value.lat && shopLocation.value.lng) {
    if (shopMarker) shopMarker.remove()
    
    const el = document.createElement('div')
    el.className = 'custom-marker shop-marker'
    el.innerHTML = `
      <div class="marker-icon shop-icon">
        <span class="marker-emoji">🏪</span>
      </div>
      <div class="marker-label">Pickup Point</div>
    `
    
    const popup = new mapboxgl.Popup({ offset: 35 })
      .setHTML(`
        <div class="map-popup">
          <strong>🏪 Pickup Point</strong><br>
          <small>${shopLocation.value.name}</small><br>
          <small>${shopLocation.value.address}</small>
        </div>
      `)
    
    shopMarker = new mapboxgl.Marker({ element: el, draggable: false })
      .setLngLat([shopLocation.value.lng, shopLocation.value.lat])
      .setPopup(popup)
      .addTo(map)
    
    console.log('✅ Shop marker added at:', shopLocation.value.lat, shopLocation.value.lng)
  }

  // Customer marker (Green circle with home emoji)
  if (customerLocation.value && customerLocation.value.lat && customerLocation.value.lng) {
    if (customerMarker) customerMarker.remove()
    
    const el = document.createElement('div')
    el.className = 'custom-marker customer-marker'
    el.innerHTML = `
      <div class="marker-icon customer-icon">
        <span class="marker-emoji">🏠</span>
      </div>
      <div class="marker-label">Delivery Point</div>
    `
    
    const popup = new mapboxgl.Popup({ offset: 35 })
      .setHTML(`
        <div class="map-popup">
          <strong>🏠 Delivery Point</strong><br>
          <small>${customerLocation.value.name}</small><br>
          <small>${customerLocation.value.address}</small>
        </div>
      `)
    
    customerMarker = new mapboxgl.Marker({ element: el, draggable: false })
      .setLngLat([customerLocation.value.lng, customerLocation.value.lat])
      .setPopup(popup)
      .addTo(map)
    
    console.log('✅ Customer marker added at:', customerLocation.value.lat, customerLocation.value.lng)
  }
}

// Update rider marker position
const updateRiderMarker = () => {
  if (riderMarker && riderLocation.value && riderLocation.value.lat && riderLocation.value.lng) {
    riderMarker.setLngLat([riderLocation.value.lng, riderLocation.value.lat])
    console.log('Rider marker updated')
  }
}

// Update route
const updateRoute = async () => {
  if (!map || !routeSource) return
  await getRoute()
  if (routeCoordinates.value.length > 0 && map.getSource('route')) {
    map.getSource('route').setData({
      type: 'Feature',
      properties: {},
      geometry: { type: 'LineString', coordinates: routeCoordinates.value }
    })
  }
}

// Add route line
const addRoute = async () => {
  if (!map || !mapInitialized) return
  
  await getRoute()
  
  if (routeCoordinates.value.length > 0) {
    if (map.getLayer('route')) map.removeLayer('route')
    if (map.getSource('route')) map.removeSource('route')
    
    map.addSource('route', {
      type: 'geojson',
      data: {
        type: 'Feature',
        properties: {},
        geometry: { type: 'LineString', coordinates: routeCoordinates.value }
      }
    })
    map.addLayer({
      id: 'route',
      type: 'line',
      source: 'route',
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: { 'line-color': '#4caf50', 'line-width': 5, 'line-opacity': 0.9 }
    })
    routeSource = map.getSource('route')
    console.log('✅ Route added to map')
  }
}

// Fit bounds to show all markers
const fitBounds = () => {
  if (!map || !mapInitialized) return
  
  const bounds = new mapboxgl.LngLatBounds()
  let hasPoints = false
  
  if (riderLocation.value && riderLocation.value.lat && riderLocation.value.lng) {
    bounds.extend([riderLocation.value.lng, riderLocation.value.lat])
    hasPoints = true
  }
  if (shopLocation.value && shopLocation.value.lat && shopLocation.value.lng) {
    bounds.extend([shopLocation.value.lng, shopLocation.value.lat])
    hasPoints = true
  }
  if (customerLocation.value && customerLocation.value.lat && customerLocation.value.lng) {
    bounds.extend([customerLocation.value.lng, customerLocation.value.lat])
    hasPoints = true
  }
  
  if (hasPoints) {
    map.fitBounds(bounds, { padding: 50, duration: 1000 })
    console.log('✅ Map bounds adjusted to show all points')
  }
}

// Center on specific locations
const centerOnRider = () => {
  activePoint.value = 'rider'
  if (map && riderLocation.value && riderLocation.value.lat && riderLocation.value.lng) {
    map.flyTo({ 
      center: [riderLocation.value.lng, riderLocation.value.lat], 
      zoom: 16, 
      duration: 1000,
      essential: true
    })
  }
}

const centerOnShop = () => {
  activePoint.value = 'shop'
  if (map && shopLocation.value && shopLocation.value.lat && shopLocation.value.lng) {
    map.flyTo({ 
      center: [shopLocation.value.lng, shopLocation.value.lat], 
      zoom: 16, 
      duration: 1000,
      essential: true
    })
  }
}

const centerOnCustomer = () => {
  activePoint.value = 'customer'
  if (map && customerLocation.value && customerLocation.value.lat && customerLocation.value.lng) {
    map.flyTo({ 
      center: [customerLocation.value.lng, customerLocation.value.lat], 
      zoom: 16, 
      duration: 1000,
      essential: true
    })
  }
}

// Watch for location changes and update markers
watch([riderLocation, shopLocation, customerLocation], () => {
  if (map && mapInitialized) {
    addMarkers()
    fitBounds()
  }
}, { deep: true })

// Load all data
const loadMapData = async () => {
  loading.value = true
  try {
    await fetchOrderDetails()
    await getRiderLocation()
    await initMap()
    console.log('🎉 Success! All 3 points loaded!')
  } catch (error) {
    console.error('Error loading map data:', error)
    errorMessage.value = error.message || 'Failed to load map data'
    showErrorDialog.value = true
    loading.value = false
  }
}

// Cleanup
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

.refresh-btn {
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
  position: relative;
}

.marker-icon {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 8px rgba(0,0,0,0.3);
  border: 3px solid white;
  position: relative;
  z-index: 2;
}

.marker-emoji {
  font-size: 22px;
  line-height: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.rider-icon { background: #2196f3; }
.shop-icon { background: #ff9800; }
.customer-icon { background: #4caf50; }

.marker-label {
  position: absolute;
  bottom: -25px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(0,0,0,0.7);
  color: white;
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 10px;
  white-space: nowrap;
  font-weight: 500;
  z-index: 3;
  pointer-events: none;
}

/* Master Panel */
.master-panel {
  position: absolute;
  bottom: 20px;
  left: 20px;
  right: 20px;
  background: rgba(255, 255, 255, 0.98);
  border-radius: 16px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.15);
  z-index: 10;
  max-width: 400px;
  backdrop-filter: blur(10px);
  transition: all 0.3s ease;
}

@media (min-width: 768px) {
  .master-panel {
    right: auto;
    min-width: 380px;
  }
}

.master-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px;
  cursor: pointer;
  user-select: none;
  border-bottom: 1px solid #e0e0e0;
  transition: background 0.2s;
}

.master-header:hover {
  background: rgba(0, 0, 0, 0.02);
}

.master-header .header-left {
  display: flex;
  align-items: center;
  gap: 10px;
  font-weight: 600;
  color: #354d7c;
  font-size: 1rem;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.refresh-icon-btn {
  background: rgba(0, 0, 0, 0.05) !important;
}

.master-header .toggle-icon {
  color: #354d7c;
  transition: transform 0.2s;
}

.master-content {
  max-height: 70vh;
  overflow-y: auto;
  padding: 12px;
}

/* Sections */
.section {
  margin-bottom: 20px;
}

.section:last-child {
  margin-bottom: 0;
}

.section-header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  color: #354d7c;
  font-size: 0.85rem;
  padding-bottom: 8px;
  margin-bottom: 12px;
  border-bottom: 2px solid #f0f0f0;
}

.section-content {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

/* Info Rows */
.info-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.8rem;
  padding: 4px 0;
}

.info-row .label {
  color: #666;
  font-weight: 500;
  min-width: 110px;
}

.info-row .value {
  color: #333;
  font-weight: 500;
  flex: 1;
}

/* Location Items */
.location-item {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 10px;
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.2s;
  background: #fafafa;
}

.location-item:hover {
  background: #f0f0f0;
  transform: translateX(4px);
}

.location-item.active {
  background: #e3f2fd;
  border-left: 3px solid #2196f3;
}

.location-icon {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
}

.rider-icon-small { background: #2196f3; }
.shop-icon-small { background: #ff9800; }
.customer-icon-small { background: #4caf50; }

.location-details {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.location-label {
  font-weight: 600;
  font-size: 0.8rem;
  color: #333;
}

.location-address {
  color: #666;
  font-size: 0.7rem;
  line-height: 1.4;
}

.location-address-small {
  color: #999;
  font-size: 0.65rem;
  margin-top: 2px;
}

/* Legend Divider */
.legend-divider {
  height: 1px;
  background: linear-gradient(to right, #e0e0e0, transparent);
  margin: 8px 0;
}

/* Legend Items inside panel */
.legend-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 6px 0;
  font-size: 0.75rem;
}

.legend-marker {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  border: 2px solid white;
  box-shadow: 0 0 0 2px;
}

.legend-marker.rider { background: #2196f3; box-shadow: 0 0 0 2px #2196f3; }
.legend-marker.shop { background: #ff9800; box-shadow: 0 0 0 2px #ff9800; }
.legend-marker.customer { background: #4caf50; box-shadow: 0 0 0 2px #4caf50; }
.legend-marker.route { width: 30px; height: 4px; background: #4caf50; border-radius: 2px; box-shadow: none; }

/* Status Badges */
.status-pending { background: #fff3e0; color: #ff9800; padding: 2px 8px; border-radius: 12px; display: inline-block; }
.status-paid { background: #e8f5e9; color: #4caf50; padding: 2px 8px; border-radius: 12px; display: inline-block; }
.status-accepted { background: #e3f2fd; color: #2196f3; padding: 2px 8px; border-radius: 12px; display: inline-block; }
.status-picked { background: #f3e5f5; color: #9c27b0; padding: 2px 8px; border-radius: 12px; display: inline-block; }
.status-shipped { background: #fff3e0; color: #ff9800; padding: 2px 8px; border-radius: 12px; display: inline-block; }
.status-delivered { background: #e8f5e9; color: #4caf50; padding: 2px 8px; border-radius: 12px; display: inline-block; }
.status-completed { background: #e8f5e9; color: #4caf50; padding: 2px 8px; border-radius: 12px; display: inline-block; }
.status-cancelled { background: #ffebee; color: #f44336; padding: 2px 8px; border-radius: 12px; display: inline-block; }

/* Popup Styles */
.map-popup {
  padding: 4px;
  max-width: 220px;
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

/* Scrollbar */
.master-content::-webkit-scrollbar {
  width: 6px;
}

.master-content::-webkit-scrollbar-track {
  background: #f1f1f1;
  border-radius: 3px;
}

.master-content::-webkit-scrollbar-thumb {
  background: #888;
  border-radius: 3px;
}

.master-content::-webkit-scrollbar-thumb:hover {
  background: #555;
}

/* Responsive */
@media (max-width: 600px) {
  .master-panel { bottom: 10px; left: 10px; right: 10px; max-width: none; }
  .marker-label { font-size: 8px; bottom: -22px; }
  .marker-icon { width: 36px; height: 36px; }
  .marker-emoji { font-size: 18px; }
  .section-header { font-size: 0.75rem; }
  .info-row .label { min-width: 90px; font-size: 0.7rem; }
  .location-label { font-size: 0.7rem; }
  .location-icon { width: 32px; height: 32px; font-size: 16px; }
}
</style>