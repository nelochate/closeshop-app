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
        <span>📍 Your Location (Rider)</span>
      </div>
      <div class="legend-item">
        <div class="legend-marker shop"></div>
        <span>🏪 Shop Location (Pickup)</span>
      </div>
      <div class="legend-item">
        <div class="legend-marker customer"></div>
        <span>🏠 Customer Location (Delivery)</span>
      </div>
      <div class="legend-item">
        <div class="legend-marker route"></div>
        <span>🛣️ Delivery Route</span>
      </div>
    </div>

    <!-- Location Summary Panel - Shows all 3 points -->
    <div class="location-summary-panel" v-if="shopLocation && customerLocation">
      <div class="location-summary-header">
        <v-icon color="#354d7c" size="20">mdi-map-marker-multiple</v-icon>
        <span>3 Delivery Points</span>
      </div>
      <div class="location-summary-content">
        <div class="location-item" :class="{ active: activePoint === 'rider' }" @click="centerOnRider">
          <div class="location-icon rider-icon-small"></div>
          <div class="location-details">
            <span class="location-label">📍 Rider Location:</span>
            <span class="location-address">{{ riderLocation?.address || 'Detecting...' }}</span>
          </div>
        </div>
        <div class="location-item" :class="{ active: activePoint === 'shop' }" @click="centerOnShop">
          <div class="location-icon shop-icon-small"></div>
          <div class="location-details">
            <span class="location-label">🏪 Pickup Point:</span>
            <span class="location-address">{{ shopLocation?.name || 'Loading...' }}</span>
            <span class="location-address-small">{{ shopLocation?.address }}</span>
          </div>
        </div>
        <div class="location-item" :class="{ active: activePoint === 'customer' }" @click="centerOnCustomer">
          <div class="location-icon customer-icon-small"></div>
          <div class="location-details">
            <span class="location-label">🏠 Delivery Point:</span>
            <span class="location-address">{{ customerLocation?.name || 'Loading...' }}</span>
            <span class="location-address-small">{{ customerLocation?.address }}</span>
          </div>
        </div>
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
      <v-btn color="#2196f3" size="small" @click="centerOnRider" class="action-btn">
        <v-icon left size="18">mdi-crosshairs-gps</v-icon>
        My Location
      </v-btn>
      <v-btn color="#ff9800" size="small" @click="centerOnShop" class="action-btn">
        <v-icon left size="18">mdi-store</v-icon>
        Shop
      </v-btn>
      <v-btn color="#4caf50" size="small" @click="centerOnCustomer" class="action-btn">
        <v-icon left size="18">mdi-home</v-icon>
        Customer
      </v-btn>
    </div>

    <!-- Order Summary Panel -->
    <div class="order-summary-panel" v-if="orderData">
      <div class="summary-header">
        <v-icon color="#354d7c" size="20">mdi-receipt</v-icon>
        <span>Order #{{ orderData.transaction_number || orderData.id?.slice(-6) }}</span>
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
const showErrorDialog = ref(false)
const errorMessage = ref('')
const routeInfo = ref(null)
const activePoint = ref(null)

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

    // Wait for map container to be ready
    await nextTick()

    // Create map instance
    map = new mapboxgl.Map({
      container: mapContainer.value,
      style: 'mapbox://styles/mapbox/streets-v12',
      center: [121.774, 12.8797],
      zoom: 11
    })

    // Add navigation control
    map.addControl(new mapboxgl.NavigationControl(), 'top-right')

    // Wait for map to load
    map.on('load', async () => {
      mapInitialized = true
      console.log('Map loaded, adding markers...')
      
      // Add markers after map is loaded
      addMarkers()
      
      // Add route
      await addRoute()
      
      // Fit bounds to show all markers
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

// Add markers for all 3 points
const addMarkers = () => {
  if (!map || !mapInitialized) {
    console.log('Map not ready for markers yet')
    return
  }

  console.log('Adding markers to map...')

  // Rider marker (Blue)
  if (riderLocation.value && riderLocation.value.lat && riderLocation.value.lng) {
    // Remove existing marker if any
    if (riderMarker) riderMarker.remove()
    
    const el = document.createElement('div')
    el.className = 'custom-marker rider-marker'
    el.innerHTML = `
      <div class="marker-pulse rider-pulse"></div>
      <div class="marker-icon rider-icon">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="white">
          <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
        </svg>
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
  } else {
    console.log('Rider location not available yet')
  }

  // Shop marker (Orange)
  if (shopLocation.value && shopLocation.value.lat && shopLocation.value.lng) {
    if (shopMarker) shopMarker.remove()
    
    const el = document.createElement('div')
    el.className = 'custom-marker shop-marker'
    el.innerHTML = `
      <div class="marker-pulse shop-pulse"></div>
      <div class="marker-icon shop-icon">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="white">
          <path d="M20 4H4v2h16V4zm1 4H3v2h18V8zm-2 4H5v8h14v-8z"/>
        </svg>
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
  } else {
    console.log('Shop location not available yet')
  }

  // Customer marker (Green)
  if (customerLocation.value && customerLocation.value.lat && customerLocation.value.lng) {
    if (customerMarker) customerMarker.remove()
    
    const el = document.createElement('div')
    el.className = 'custom-marker customer-marker'
    el.innerHTML = `
      <div class="marker-pulse customer-pulse"></div>
      <div class="marker-icon customer-icon">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="white">
          <path d="M12 3c-4.97 0-9 4.03-9 9s4.03 9 9 9 9-4.03 9-9-4.03-9-9-9zm0 16c-3.86 0-7-3.14-7-7s3.14-7 7-7 7 3.14 7 7-3.14 7-7 7z"/>
          <path d="M12 8c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4z"/>
        </svg>
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
  } else {
    console.log('Customer location not available yet')
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
    // Remove existing route if any
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
    map.flyTo({ center: [riderLocation.value.lng, riderLocation.value.lat], zoom: 16, duration: 1000 })
  }
}

const centerOnShop = () => {
  activePoint.value = 'shop'
  if (map && shopLocation.value && shopLocation.value.lat && shopLocation.value.lng) {
    map.flyTo({ center: [shopLocation.value.lng, shopLocation.value.lat], zoom: 16, duration: 1000 })
  }
}

const centerOnCustomer = () => {
  activePoint.value = 'customer'
  if (map && customerLocation.value && customerLocation.value.lat && customerLocation.value.lng) {
    map.flyTo({ center: [customerLocation.value.lng, customerLocation.value.lat], zoom: 16, duration: 1000 })
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
    // Fetch order details first
    await fetchOrderDetails()
    
    // Get rider location
    await getRiderLocation()
    
    // Initialize map (will add markers after load)
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
/* Your existing styles remain the same */
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
  position: relative;
}

.marker-pulse {
  position: absolute;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  opacity: 0.4;
  animation: pulse 1.5s infinite;
}

.rider-pulse { background: #2196f3; }
.shop-pulse { background: #ff9800; }
.customer-pulse { background: #4caf50; }

.marker-icon {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 8px rgba(0,0,0,0.3);
  border: 3px solid white;
  position: relative;
  z-index: 2;
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

@keyframes pulse {
  0% { transform: scale(0.8); opacity: 0.6; }
  100% { transform: scale(1.5); opacity: 0; }
}

/* Location Summary Panel */
.location-summary-panel {
  position: absolute;
  bottom: 20px;
  left: 20px;
  background: rgba(255, 255, 255, 0.95);
  padding: 12px 16px;
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.15);
  z-index: 10;
  min-width: 280px;
  max-width: 350px;
}

.location-summary-header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  color: #354d7c;
  margin-bottom: 10px;
  padding-bottom: 6px;
  border-bottom: 1px solid #e0e0e0;
}

.location-summary-content {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.location-item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 8px;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.2s;
}

.location-item:hover {
  background: #f0f0f0;
}

.location-item.active {
  background: #e3f2fd;
}

.location-icon {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  flex-shrink: 0;
}

.rider-icon-small { background: #2196f3; border: 2px solid white; box-shadow: 0 0 0 1px #2196f3; }
.shop-icon-small { background: #ff9800; border: 2px solid white; box-shadow: 0 0 0 1px #ff9800; }
.customer-icon-small { background: #4caf50; border: 2px solid white; box-shadow: 0 0 0 1px #4caf50; }

.location-details {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.location-label {
  font-weight: 600;
  font-size: 0.75rem;
}

.location-address {
  color: #666;
  font-size: 0.7rem;
}

.location-address-small {
  color: #999;
  font-size: 0.65rem;
}

/* Legend Styles */
.map-legend {
  position: absolute;
  bottom: 20px;
  right: 20px;
  background: rgba(255, 255, 255, 0.95);
  padding: 12px 16px;
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.15);
  z-index: 10;
  font-size: 0.75rem;
  min-width: 180px;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
}

.legend-item:last-child { margin-bottom: 0; }

.legend-marker {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  border: 2px solid white;
  box-shadow: 0 0 0 2px;
}

.legend-marker.rider { background: #2196f3; box-shadow: 0 0 0 2px #2196f3; }
.legend-marker.shop { background: #ff9800; box-shadow: 0 0 0 2px #ff9800; }
.legend-marker.customer { background: #4caf50; box-shadow: 0 0 0 2px #4caf50; }
.legend-marker.route { width: 30px; height: 4px; background: #4caf50; border-radius: 2px; box-shadow: none; }

/* Route Info Panel */
.route-info-panel {
  position: absolute;
  top: 80px;
  right: 20px;
  background: rgba(255, 255, 255, 0.95);
  padding: 12px 16px;
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.15);
  z-index: 10;
  min-width: 180px;
}

.route-info-header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  color: #4caf50;
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
  font-size: 0.75rem;
}

/* Order Summary Panel */
.order-summary-panel {
  position: absolute;
  top: 80px;
  left: 20px;
  background: rgba(255, 255, 255, 0.95);
  padding: 12px 16px;
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.15);
  z-index: 10;
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
  font-size: 0.75rem;
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
.status-paid { background: #e8f5e9; color: #4caf50; }
.status-accepted { background: #e3f2fd; color: #2196f3; }
.status-picked { background: #f3e5f5; color: #9c27b0; }
.status-shipped { background: #fff3e0; color: #ff9800; }
.status-delivered { background: #e8f5e9; color: #4caf50; }
.status-completed { background: #e8f5e9; color: #4caf50; }
.status-cancelled { background: #ffebee; color: #f44336; }
.status-default { background: #e0e0e0; color: #666; }

/* Map Actions */
.map-actions {
  position: absolute;
  top: 140px;
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

/* Responsive */
@media (max-width: 600px) {
  .map-legend { bottom: 10px; right: 10px; padding: 8px 12px; min-width: 150px; }
  .location-summary-panel { bottom: 10px; left: 10px; padding: 8px 12px; min-width: 250px; }
  .route-info-panel { top: 70px; right: 10px; padding: 8px 12px; min-width: 150px; }
  .order-summary-panel { top: 70px; left: 10px; padding: 8px 12px; min-width: 180px; }
  .map-actions { top: 130px; right: 10px; }
  .action-btn { padding: 4px 8px !important; font-size: 0.7rem !important; }
  .marker-label { font-size: 8px; bottom: -22px; }
  .marker-icon { width: 32px; height: 32px; }
  .marker-icon svg { width: 18px; height: 18px; }
}
</style>