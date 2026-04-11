<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'

const router = useRouter()

// Mapbox configuration
const mapboxToken = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN
mapboxgl.accessToken = mapboxToken

// State
const mapContainer = ref(null)
const map = ref(null)
const userMarker = ref(null) // Default marker
const customMarker = ref(null) // Custom animated marker
const userLocation = ref(null)
const watchId = ref(null)
const locationLoading = ref(false)
const locationStatus = ref('inactive')

// Location data
const currentAddress = ref('Waiting for location...')
const currentCoordinates = ref('--, --')
const currentSpeed = ref(null)
const accuracy = ref(null)
const boundaryStatus = ref('Checking...')
const boundaryLayer = ref(null)

// Go back
const goBack = () => {
  router.back()
}

// Initialize map
const initMap = async () => {
  if (!mapContainer.value) return

  // Default center (Manila)
  const defaultCenter = [120.9842, 14.5995]
  
  map.value = new mapboxgl.Map({
    container: mapContainer.value,
    style: 'mapbox://styles/mapbox/streets-v12',
    center: defaultCenter,
    zoom: 13,
    pitch: 0
  })

  // Add navigation control
  map.value.addControl(new mapboxgl.NavigationControl(), 'top-right')
  
  // Add scale control
  map.value.addControl(new mapboxgl.ScaleControl(), 'bottom-left')
  
  // Add fullscreen control
  map.value.addControl(new mapboxgl.FullscreenControl(), 'top-right')

  // Wait for map to load
  map.value.on('load', () => {
    startWatchingLocation()
  })
}

// Start watching user's location
const startWatchingLocation = () => {
  if (!navigator.geolocation) {
    alert('Geolocation is not supported by your browser')
    return
  }

  locationStatus.value = 'active'
  locationLoading.value = true

  // Get initial location
  navigator.geolocation.getCurrentPosition(
    async (position) => {
      await updateLocation(position)
      locationLoading.value = false
    },
    (error) => {
      console.error('Error getting location:', error)
      handleLocationError(error)
      locationLoading.value = false
    },
    { enableHighAccuracy: true, timeout: 10000 }
  )

  // Watch for location changes
  watchId.value = navigator.geolocation.watchPosition(
    async (position) => {
      await updateLocation(position)
    },
    (error) => {
      console.error('Watch position error:', error)
    },
    {
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: 5000
    }
  )
}

// Update location on map
const updateLocation = async (position) => {
  const { latitude, longitude, speed, accuracy: posAccuracy } = position.coords
  
  userLocation.value = { lat: latitude, lng: longitude }
  
  // Update accuracy
  accuracy.value = posAccuracy ? Math.round(posAccuracy) : null
  
  // Update speed (convert m/s to km/h)
  if (speed !== null && speed !== undefined) {
    currentSpeed.value = (speed * 3.6).toFixed(1)
  }
  
  // Update coordinates display
  currentCoordinates.value = `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`
  
  // Update or create default Mapbox marker
  if (userMarker.value) {
    userMarker.value.setLngLat([longitude, latitude])
  } else if (map.value) {
    // Create default Mapbox marker (blue dot style)
    userMarker.value = new mapboxgl.Marker({
      color: '#4caf50',
      scale: 1.2,
      draggable: false
    })
      .setLngLat([longitude, latitude])
      .addTo(map.value)
  }
  
  // Also create custom animated marker for better visibility
  if (customMarker.value) {
    customMarker.value.setLngLat([longitude, latitude])
  } else if (map.value) {
    // Create custom marker with pulsing dot
    const el = document.createElement('div')
    el.className = 'custom-marker'
    el.innerHTML = `
      <div class="pulse-dot"></div>
      <div class="marker-dot"></div>
      <div class="marker-arrow"></div>
    `
    customMarker.value = new mapboxgl.Marker(el)
      .setLngLat([longitude, latitude])
      .addTo(map.value)
  }
  
  // Get address and city boundary
  await getAddressAndBoundary(latitude, longitude)
  
  // Center map on user location (if not manually moved)
  if (map.value && !map.value.isMoving && !map.value.isDragging) {
    centerOnUser()
  }
}

// Get address and city boundary using Nominatim
const getAddressAndBoundary = async (lat, lng) => {
  try {
    // Get address information
    const addressResponse = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`
    )
    const addressData = await addressResponse.json()
    
    if (addressData && addressData.display_name) {
      // Format address to short version (remove country, postal code)
      const addressParts = addressData.display_name.split(',')
      // Take first 3-4 parts for short address (street, barangay, city, province)
      let shortAddress = addressParts.slice(0, 4).join(', ')
      // Remove country code if present
      shortAddress = shortAddress.replace(/,\s*Philippines$/, '')
      currentAddress.value = shortAddress
      
      // Extract city for boundary detection
      const address = addressData.address
      const cityName = address.city || address.town || address.municipality || address.village || 'Unknown'
      
      // Get city boundary
      await getCityBoundary(cityName, lat, lng)
    } else {
      currentAddress.value = 'Address not found'
      boundaryStatus.value = 'Unable to detect boundary'
    }
  } catch (error) {
    console.error('Error getting address:', error)
    currentAddress.value = 'Error getting address'
    boundaryStatus.value = 'Error loading boundary'
  }
}

// Get city boundary using Nominatim
const getCityBoundary = async (city, lat, lng) => {
  try {
    // Search for the city boundary
    const searchResponse = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(city)}&format=json&polygon_geojson=1&limit=1`
    )
    const searchData = await searchResponse.json()
    
    if (searchData && searchData.length > 0 && searchData[0].geojson) {
      const boundaryGeoJSON = searchData[0].geojson
      
      // Remove existing boundary layer if exists
      if (boundaryLayer.value) {
        if (map.value.getLayer('city-boundary')) {
          map.value.removeLayer('city-boundary')
        }
        if (map.value.getLayer('city-boundary-fill')) {
          map.value.removeLayer('city-boundary-fill')
        }
        if (map.value.getSource('city-boundary')) {
          map.value.removeSource('city-boundary')
        }
      }
      
      // Add boundary to map
      map.value.addSource('city-boundary', {
        type: 'geojson',
        data: boundaryGeoJSON
      })
      
      map.value.addLayer({
        id: 'city-boundary',
        type: 'line',
        source: 'city-boundary',
        paint: {
          'line-color': '#ff9800',
          'line-width': 3,
          'line-dasharray': [2, 2]
        }
      })
      
      map.value.addLayer({
        id: 'city-boundary-fill',
        type: 'fill',
        source: 'city-boundary',
        paint: {
          'fill-color': '#ff9800',
          'fill-opacity': 0.1
        }
      })
      
      boundaryStatus.value = '✓ Within city limits'
      boundaryLayer.value = boundaryGeoJSON
    } else {
      boundaryStatus.value = '⚠️ Boundary not found'
      // Show radius circle as fallback
      showRadiusCircle(lat, lng, 5000)
    }
  } catch (error) {
    console.error('Error getting city boundary:', error)
    boundaryStatus.value = '⚠️ Error loading boundary'
    showRadiusCircle(lat, lng, 5000)
  }
}

// Show radius circle as fallback
const showRadiusCircle = (lat, lng, radiusInMeters) => {
  if (map.value.getSource('radius-circle')) {
    if (map.value.getLayer('radius-circle')) {
      map.value.removeLayer('radius-circle')
    }
    map.value.removeSource('radius-circle')
  }
  
  const points = []
  const radiusInKm = radiusInMeters / 1000
  const earthRadius = 6371
  
  for (let angle = 0; angle < 360; angle += 10) {
    const radian = angle * Math.PI / 180
    const distance = radiusInKm / earthRadius
    const newLat = Math.asin(Math.sin(lat * Math.PI / 180) * Math.cos(distance) +
                   Math.cos(lat * Math.PI / 180) * Math.sin(distance) * Math.cos(radian))
    const newLng = (lng * Math.PI / 180) + Math.atan2(Math.sin(radian) * Math.sin(distance) * Math.cos(lat * Math.PI / 180),
                     Math.cos(distance) - Math.sin(lat * Math.PI / 180) * Math.sin(newLat))
    
    points.push([newLng * 180 / Math.PI, newLat * 180 / Math.PI])
  }
  
  map.value.addSource('radius-circle', {
    type: 'geojson',
    data: {
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: [points]
      }
    }
  })
  
  map.value.addLayer({
    id: 'radius-circle',
    type: 'fill',
    source: 'radius-circle',
    paint: {
      'fill-color': '#2196f3',
      'fill-opacity': 0.1,
      'fill-outline-color': '#2196f3'
    }
  })
}

// Center map on user location
const centerOnUser = () => {
  if (userLocation.value && map.value) {
    map.value.flyTo({
      center: [userLocation.value.lng, userLocation.value.lat],
      zoom: 15,
      duration: 1000
    })
  }
}

// Refresh all data
const refreshData = () => {
  if (userLocation.value) {
    getAddressAndBoundary(userLocation.value.lat, userLocation.value.lng)
  } else {
    startWatchingLocation()
  }
}

// Share location
const shareLocation = () => {
  if (navigator.share && userLocation.value) {
    navigator.share({
      title: 'My Current Location',
      text: `I'm currently at ${currentAddress.value}`,
      url: `https://www.google.com/maps?q=${userLocation.value.lat},${userLocation.value.lng}`
    }).catch(console.error)
  } else {
    // Fallback: copy to clipboard
    const locationUrl = `https://www.google.com/maps?q=${userLocation.value.lat},${userLocation.value.lng}`
    navigator.clipboard.writeText(locationUrl)
    alert('Location URL copied to clipboard!')
  }
}

// Open directions in Google Maps
const openDirections = () => {
  if (userLocation.value) {
    const url = `https://www.google.com/maps/dir/?api=1&destination=${userLocation.value.lat},${userLocation.value.lng}&travelmode=driving`
    window.open(url, '_blank')
  }
}

// Handle location errors
const handleLocationError = (error) => {
  switch(error.code) {
    case error.PERMISSION_DENIED:
      currentAddress.value = 'Location access denied. Please enable location services.'
      boundaryStatus.value = 'Permission required'
      locationStatus.value = 'error'
      break
    case error.POSITION_UNAVAILABLE:
      currentAddress.value = 'Location unavailable. Check your GPS signal.'
      boundaryStatus.value = 'Signal weak'
      locationStatus.value = 'error'
      break
    case error.TIMEOUT:
      currentAddress.value = 'Location request timed out. Retrying...'
      boundaryStatus.value = 'Retrying'
      locationStatus.value = 'error'
      break
  }
}

// Stop watching location
const stopWatchingLocation = () => {
  if (watchId.value) {
    navigator.geolocation.clearWatch(watchId.value)
    watchId.value = null
  }
}

// Clean up on unmount
onUnmounted(() => {
  if (map.value) {
    map.value.remove()
  }
  stopWatchingLocation()
})

// Initialize on mount
onMounted(() => {
  initMap()
})
</script>

<template>
  <v-app>
    <v-main class="rider-location-main">
      <!-- Header -->
      <div class="header-section">
        <v-btn icon variant="text" class="back-btn" @click="goBack">
          <v-icon size="28">mdi-arrow-left</v-icon>
        </v-btn>
        <h1 class="page-title">My Location</h1>
        <div class="header-actions">
          <v-btn 
            icon 
            variant="text" 
            class="locate-btn"
            :loading="locationLoading"
            @click="centerOnUser"
          >
            <v-icon size="24">mdi-crosshairs-gps</v-icon>
          </v-btn>
          <v-btn 
            icon 
            variant="text" 
            class="refresh-btn"
            @click="refreshData"
          >
            <v-icon size="24">mdi-refresh</v-icon>
          </v-btn>
        </div>
      </div>

      <!-- Location Status Bar -->
      <div class="location-status-bar">
        <v-icon size="16" :color="locationStatus === 'active' ? '#4caf50' : '#ff9800'">
          mdi-map-marker
        </v-icon>
        <span class="location-text">{{ currentAddress || 'Getting your location...' }}</span>
        <v-chip v-if="locationStatus === 'active'" size="x-small" color="success" class="live-chip">
          LIVE
        </v-chip>
        <v-chip v-else size="x-small" color="warning">
          UPDATING
        </v-chip>
      </div>

      <!-- Map Container -->
      <div ref="mapContainer" class="map-container"></div>

      <!-- Simplified Location Info Overlay -->
      <div class="location-info-overlay">
        <v-card class="info-card" elevation="3">
          <!-- Location Summary -->
          <div class="location-summary">
            <v-icon size="20" color="#4caf50">mdi-crosshairs-gps</v-icon>
            <div class="summary-details">
              <div class="coordinates">{{ currentCoordinates }}</div>
              <div class="address-summary">{{ currentAddress }}</div>
            </div>
          </div>

          <v-divider class="my-2"></v-divider>

          <!-- Additional Info in Single Row -->
          <div class="info-row-compact">
            <div class="compact-item" v-if="currentSpeed !== null">
              <v-icon size="16" color="#f44336">mdi-speedometer</v-icon>
              <span>{{ currentSpeed }} km/h</span>
            </div>
            <div class="compact-item" v-if="accuracy">
              <v-icon size="16" color="#607d8b">mdi-target</v-icon>
              <span>±{{ accuracy }}m</span>
            </div>
            <div class="compact-item">
              <v-icon size="16" :color="boundaryStatus === '✓ Within city limits' ? '#4caf50' : '#ff9800'">
                mdi-map-marker-radius
              </v-icon>
              <span :class="boundaryStatus === '✓ Within city limits' ? 'success-text' : 'warning-text'">
                {{ boundaryStatus }}
              </span>
            </div>
          </div>
        </v-card>
      </div>

      <!-- Bottom Controls -->
      <div class="bottom-controls">
        <v-btn 
          color="primary" 
          class="share-btn"
          @click="shareLocation"
        >
          <v-icon left>mdi-share-variant</v-icon>
          Share Location
        </v-btn>
        
        <v-btn 
          color="success" 
          class="direction-btn"
          @click="openDirections"
        >
          <v-icon left>mdi-directions</v-icon>
          Get Directions
        </v-btn>
      </div>
    </v-main>
  </v-app>
</template>

<style scoped>
.rider-location-main {
  background: linear-gradient(135deg, #f5f7fa 0%, #ffffff 100%);
  min-height: 100vh;
  position: relative;
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

.back-btn, .locate-btn, .refresh-btn {
  color: white !important;
  background: rgba(255, 255, 255, 0.1) !important;
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
  background: white;
  border-bottom: 1px solid #e0e0e0;
  font-size: 0.8rem;
  color: #333;
}

.location-text {
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-weight: 500;
}

.live-chip {
  animation: pulse 1.5s infinite;
}

@keyframes pulse {
  0% {
    opacity: 1;
  }
  50% {
    opacity: 0.6;
  }
  100% {
    opacity: 1;
  }
}

/* Map Container */
.map-container {
  width: 100%;
  height: calc(100vh - 200px);
  position: relative;
}

/* Simplified Location Info Overlay */
.location-info-overlay {
  position: absolute;
  bottom: 80px;
  left: 16px;
  right: 16px;
  z-index: 10;
}

.info-card {
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(10px);
  padding: 12px 16px;
  border-radius: 16px;
}

.location-summary {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

.summary-details {
  flex: 1;
}

.coordinates {
  font-size: 0.8rem;
  font-weight: 600;
  color: #354d7c;
  font-family: monospace;
}

.address-summary {
  font-size: 0.75rem;
  color: #666;
  margin-top: 2px;
  line-height: 1.3;
}

.info-row-compact {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
}

.compact-item {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 0.7rem;
  color: #666;
}

/* Bottom Controls */
.bottom-controls {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  display: flex;
  gap: 12px;
  padding: 12px 16px;
  background: white;
  border-top: 1px solid #e0e0e0;
  z-index: 100;
}

.share-btn, .direction-btn {
  flex: 1;
}

/* Default Mapbox Marker Styles */
.mapboxgl-marker {
  cursor: pointer;
}

/* Custom Animated Marker Styles */
.custom-marker {
  position: relative;
  cursor: pointer;
  z-index: 10;
}

.marker-dot {
  width: 20px;
  height: 20px;
  background: #4caf50;
  border: 3px solid white;
  border-radius: 50%;
  box-shadow: 0 2px 4px rgba(0,0,0,0.2);
}

.pulse-dot {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 40px;
  height: 40px;
  background: rgba(76, 175, 80, 0.4);
  border-radius: 50%;
  animation: pulse-ring 2s infinite;
}

@keyframes pulse-ring {
  0% {
    transform: translate(-50%, -50%) scale(0.5);
    opacity: 1;
  }
  100% {
    transform: translate(-50%, -50%) scale(1.5);
    opacity: 0;
  }
}

.marker-arrow {
  position: absolute;
  bottom: -15px;
  left: 50%;
  transform: translateX(-50%);
  width: 0;
  height: 0;
  border-left: 8px solid transparent;
  border-right: 8px solid transparent;
  border-top: 12px solid #4caf50;
}

/* Text Colors */
.success-text {
  color: #4caf50;
  font-weight: bold;
}

.warning-text {
  color: #ff9800;
  font-weight: bold;
}

/* Responsive */
@media (max-width: 600px) {
  .page-title {
    font-size: 1.2rem;
  }
  
  .location-info-overlay {
    bottom: 70px;
  }
  
  .map-container {
    height: calc(100vh - 180px);
  }
  
  .coordinates {
    font-size: 0.7rem;
  }
  
  .address-summary {
    font-size: 0.65rem;
  }
  
  .compact-item {
    font-size: 0.65rem;
  }
}

@media (min-width: 768px) {
  .location-info-overlay {
    left: auto;
    right: 20px;
    width: 380px;
    bottom: 20px;
  }
  
  .map-container {
    height: calc(100vh - 140px);
  }
}
</style>