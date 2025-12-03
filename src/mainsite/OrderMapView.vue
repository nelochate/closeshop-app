<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { supabase } from '@/utils/supabase'

const router = useRouter()
const route = useRoute()
const orderId = route.params.id as string

// Mapbox token
const MAPBOX_TOKEN = 'pk.eyJ1IjoiY2xvc2VzaG9wIiwiYSI6ImNtaDI2emxocjEwdnVqMHExenFpam42bjcifQ.QDsWVOHM9JPhPQ---Ca4MA'

// State
const loading = ref(true)
const error = ref('')
const mapContainer = ref<HTMLElement | null>(null)
let map: any = null
let markers: any[] = []
const showRoute = ref(true)
const showInfoPanel = ref(true)

// Transportation modes
const transportModes = ref([
  { id: 'driving', name: 'Car/Motorcycle', icon: 'mdi-car', color: '#2196F3', active: true },
  { id: 'walking', name: 'Walking', icon: 'mdi-walk', color: '#4CAF50', active: true },
  { id: 'cycling', name: 'Cycling/Tricycle', icon: 'mdi-bike', color: '#FF9800', active: true }
])
const activeTransportMode = ref('driving')

// Address data
const sellerAddress = ref<any>(null)
const buyerAddress = ref<any>(null)
const sellerBusinessName = ref('')
const formattedSellerAddress = ref('')
const buyerName = ref('')
const formattedBuyerAddress = ref('')
const buyerPhone = ref('')

// Route data for all modes
const routeData = ref<{
  [key: string]: {
    distance: string
    distanceKm: number
    duration: string
    durationMinutes: number
    coordinates: number[][]
    sameAs?: string
  }
}>({})

// Initialize Mapbox
const initializeMap = async () => {
  if (!mapContainer.value) return

  try {
    // Load Mapbox GL JS
    await loadScript('https://api.mapbox.com/mapbox-gl-js/v2.15.0/mapbox-gl.js')
    await loadStyle('https://api.mapbox.com/mapbox-gl-js/v2.15.0/mapbox-gl.css')
    
    // Set Mapbox token
    ;(window as any).mapboxgl.accessToken = MAPBOX_TOKEN

    // Create map
    map = new (window as any).mapboxgl.Map({
      container: mapContainer.value,
      style: 'mapbox://styles/mapbox/streets-v12',
      center: [125.54, 8.95],
      zoom: 13,
      attributionControl: false
    })

    // Add navigation controls
    map.addControl(new (window as any).mapboxgl.NavigationControl(), 'top-right')
    
    // Add fullscreen control
    map.addControl(new (window as any).mapboxgl.FullscreenControl(), 'top-right')
    
    // Add geolocate control
    map.addControl(new (window as any).mapboxgl.GeolocateControl({
      positionOptions: {
        enableHighAccuracy: true
      },
      trackUserLocation: true,
      showUserLocation: false
    }), 'top-right')

    // Wait for map to load
    map.on('load', async () => {
      await fetchOrderData()
      loading.value = false
      setTimeout(() => {
        if (map) map.resize()
      }, 100)
    })

    // Handle map resize
    map.on('resize', () => {
      if (map && !showInfoPanel.value) {
        fitMapToAllMarkers()
      }
    })

    // Fix Mapbox popup accessibility issues
    map.on('render', () => {
      fixMapboxAccessibility()
    })

    // Handle map errors
    map.on('error', (e: any) => {
      console.error('Map error:', e)
      error.value = 'Failed to load map. Please check your internet connection.'
      loading.value = false
    })

  } catch (err) {
    console.error('Error initializing map:', err)
    error.value = 'Failed to load map. Please check your internet connection.'
    loading.value = false
  }
}

// Fix Mapbox popup accessibility issues
const fixMapboxAccessibility = () => {
  // Remove aria-hidden from focused elements in popups
  document.querySelectorAll('.mapboxgl-popup-close-button[aria-hidden="true"]').forEach(button => {
    button.removeAttribute('aria-hidden')
  })
  
  // Ensure popup content is accessible
  document.querySelectorAll('.mapboxgl-popup-content').forEach(content => {
    // Remove aria-hidden if present
    content.removeAttribute('aria-hidden')
    
    // Ensure proper role
    if (!content.getAttribute('role')) {
      content.setAttribute('role', 'dialog')
    }
    
    // Ensure proper aria-label
    if (!content.getAttribute('aria-label')) {
      content.setAttribute('aria-label', 'Map location details')
    }
  })
}

// Watch for info panel visibility changes
watch(showInfoPanel, (newValue) => {
  if (map) {
    setTimeout(() => {
      map.resize()
      if (!newValue) {
        fitMapToAllMarkers()
      } else {
        fitMapToRoutes()
      }
      // Fix accessibility after resize
      setTimeout(fixMapboxAccessibility, 100)
    }, 300)
  }
})

// Helper to load scripts
const loadScript = (src: string): Promise<void> => {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve()
      return
    }
    
    const script = document.createElement('script')
    script.src = src
    script.onload = () => resolve()
    script.onerror = reject
    document.head.appendChild(script)
  })
}

// Helper to load styles
const loadStyle = (href: string): Promise<void> => {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`link[href="${href}"]`)) {
      resolve()
      return
    }
    
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = href
    link.onload = () => resolve()
    link.onerror = reject
    document.head.appendChild(link)
  })
}

// Fetch order data
const fetchOrderData = async () => {
  try {
    console.log('📦 Fetching order data for ID:', orderId)

    const { data: orderData, error: orderError } = await supabase
      .from('orders')
      .select(`
        *,
        address:addresses (
          id,
          recipient_name,
          phone,
          building,
          house_no,
          street,
          purok,
          barangay_name,
          city_name,
          province_name,
          region_name,
          postal_code,
          is_default
        ),
        shop:shops (
          id,
          business_name,
          latitude,
          longitude,
          building,
          street,
          barangay,
          city,
          province,
          postal,
          house_no
        ),
        user:profiles!orders_user_id_fkey (
          id,
          first_name,
          last_name,
          phone
        )
      `)
      .eq('id', orderId)
      .single()

    if (orderError) {
      console.error('❌ Order fetch error:', orderError)
      throw orderError
    }

    if (!orderData) {
      throw new Error('Order not found')
    }

    console.log('✅ Order data loaded:', orderData)

    // Extract seller data from shop
    const shop = orderData.shop
    sellerBusinessName.value = shop?.business_name || 'Your Store'

    if (shop) {
      sellerAddress.value = {
        lat: shop.latitude,
        lng: shop.longitude,
        address: formatShopAddress(shop),
        name: shop.business_name,
      }
      
      console.log('📍 Seller coordinates:', shop.latitude, shop.longitude)
    } else {
      await fetchShopData(orderData.shop_id)
    }

    // Extract buyer data
    const buyerProfile = orderData.user
    const buyerAddr = orderData.address
    
    buyerName.value = buyerAddr?.recipient_name || 
                     `${buyerProfile?.first_name || ''} ${buyerProfile?.last_name || ''}`.trim() ||
                     'Customer'
    
    buyerPhone.value = buyerAddr?.phone || buyerProfile?.phone || 'N/A'
    buyerAddress.value = buyerAddr

    formattedSellerAddress.value = shop ? formatShopAddress(shop) : 'Address not available'
    formattedBuyerAddress.value = buyerAddr ? formatAddress(buyerAddr) : 'Address not available'

    console.log('👤 Buyer:', buyerName.value)
    console.log('🏪 Seller:', sellerBusinessName.value)

    await plotLocations()
    await calculateAllRoutes()

  } catch (err) {
    console.error('❌ Error fetching order data:', err)
    error.value = 'Failed to load order information.'
    loading.value = false
  }
}

// Fetch shop data separately if needed
const fetchShopData = async (shopId: string) => {
  try {
    const { data: shop, error: shopError } = await supabase
      .from('shops')
      .select('*')
      .eq('id', shopId)
      .single()

    if (shopError) throw shopError

    sellerBusinessName.value = shop.business_name || 'Your Store'
    
    sellerAddress.value = {
      lat: shop.latitude,
      lng: shop.longitude,
      address: formatShopAddress(shop),
      name: shop.business_name,
    }
    
    formattedSellerAddress.value = formatShopAddress(shop)
    
  } catch (err) {
    console.error('Error fetching shop data:', err)
  }
}

// Format shop address
const formatShopAddress = (shop: any): string => {
  if (!shop) return 'Address not available'

  const parts = [
    shop.house_no,
    shop.building,
    shop.street,
    shop.barangay,
    shop.city || 'Butuan City',
    shop.province || 'Agusan del Norte',
    shop.postal,
  ].filter(part => part && part.trim() !== '')

  return parts.join(', ') || 'Address details incomplete'
}

// Format address
const formatAddress = (address: any): string => {
  if (!address) return 'Address not available'

  try {
    const parts = [
      address.house_no,
      address.building,
      address.street,
      address.purok,
      address.barangay_name,
      address.city_name,
      address.province_name,
      address.region_name,
      address.postal_code,
    ].filter(part => part && part.trim() !== '' && part !== 'null' && part !== 'undefined')

    return parts.join(', ') || 'Address details incomplete'
  } catch (error) {
    console.error('Error formatting address:', error, address)
    return 'Error loading address'
  }
}

// Plot locations on map
const plotLocations = async () => {
  if (!map) return

  markers.forEach(marker => marker.remove())
  markers = []

  if (!sellerAddress.value && !buyerAddress.value) {
    error.value = 'No location data available for this order.'
    return
  }

  let hasSellerCoords = false
  let hasBuyerCoords = false
  let sellerCoords: [number, number] | null = null
  let buyerCoords: [number, number] | null = null

  // Create accessible popups
  const sellerPopup = createAccessiblePopup(`
    <div class="map-popup">
      <h4>${sellerBusinessName.value}</h4>
      <p>${formattedSellerAddress.value}</p>
      <small>Your Store Location</small>
    </div>
  `)

  const buyerPopup = createAccessiblePopup(`
    <div class="map-popup">
      <h4>${buyerName.value}</h4>
      <p>${formattedBuyerAddress.value}</p>
      <p><small>Phone: ${buyerPhone.value}</small></p>
      <small>Customer Location</small>
    </div>
  `)

  // Create custom marker elements
  const sellerMarkerEl = createCustomMarker('seller')
  const buyerMarkerEl = createCustomMarker('buyer')

  // Add seller marker
  if (sellerAddress.value?.lat && sellerAddress.value?.lng) {
    sellerCoords = [sellerAddress.value.lng, sellerAddress.value.lat]
    
    const sellerMarker = new (window as any).mapboxgl.Marker({ element: sellerMarkerEl })
      .setLngLat(sellerCoords)
      .setPopup(sellerPopup)
      .addTo(map)
    
    markers.push(sellerMarker)
    hasSellerCoords = true
    
    console.log('📍 Seller marker placed at:', sellerCoords)
  } else {
    console.log('🔍 Geocoding seller address...')
    const geocoded = await geocodeAddress(formattedSellerAddress.value)
    if (geocoded) {
      sellerCoords = [geocoded.lng, geocoded.lat]
      
      const sellerMarker = new (window as any).mapboxgl.Marker({ element: sellerMarkerEl })
        .setLngLat(sellerCoords)
        .setPopup(sellerPopup)
        .addTo(map)
      
      markers.push(sellerMarker)
      hasSellerCoords = true
      
      console.log('📍 Seller geocoded to:', sellerCoords)
    }
  }

  // Add buyer marker
  if (buyerAddress.value) {
    console.log('🔍 Geocoding buyer address...')
    const geocoded = await geocodeAddress(formattedBuyerAddress.value)
    if (geocoded) {
      buyerCoords = [geocoded.lng, geocoded.lat]
      
      const buyerMarker = new (window as any).mapboxgl.Marker({ element: buyerMarkerEl })
        .setLngLat(buyerCoords)
        .setPopup(buyerPopup)
        .addTo(map)
      
      markers.push(buyerMarker)
      hasBuyerCoords = true
      
      console.log('📍 Buyer geocoded to:', buyerCoords)
    }
  }

  // Store coordinates
  if (hasSellerCoords && sellerCoords) {
    sellerAddress.value = {
      ...sellerAddress.value,
      lat: sellerCoords[1],
      lng: sellerCoords[0]
    }
  }
  
  if (hasBuyerCoords && buyerCoords) {
    buyerAddress.value = {
      ...buyerAddress.value,
      lat: buyerCoords[1],
      lng: buyerCoords[0]
    }
  }

  // Fix accessibility after adding markers
  setTimeout(fixMapboxAccessibility, 100)
}

// Create accessible popup
const createAccessiblePopup = (html: string) => {
  const popup = new (window as any).mapboxgl.Popup({ 
    offset: 25,
    closeButton: true,
    closeOnClick: false
  }).setHTML(html)
  
  // Listen for popup open to fix accessibility
  const originalOpen = popup.open
  popup.open = function(...args: any[]) {
    const result = originalOpen.apply(this, args)
    setTimeout(() => {
      const closeButton = this._container?.querySelector('.mapboxgl-popup-close-button')
      if (closeButton) {
        closeButton.removeAttribute('aria-hidden')
        closeButton.setAttribute('aria-label', 'Close popup')
      }
    }, 50)
    return result
  }
  
  return popup
}

// Create custom marker element
const createCustomMarker = (type: 'seller' | 'buyer'): HTMLElement => {
  const el = document.createElement('div')
  el.className = `custom-marker ${type}-marker`
  el.setAttribute('role', 'button')
  el.setAttribute('aria-label', type === 'seller' ? 'Store location' : 'Customer location')
  el.setAttribute('tabindex', '0')
  
  const icon = type === 'seller' ? 'M12,11.5A2.5,2.5 0 0,1 9.5,9A2.5,2.5 0 0,1 12,6.5A2.5,2.5 0 0,1 14.5,9A2.5,2.5 0 0,1 12,11.5M12,2A7,7 0 0,0 5,9C5,14.25 12,22 12,22C12,22 19,14.25 19,9A7,7 0 0,0 12,2Z' : 'M12,4A4,4 0 0,1 16,8A4,4 0 0,1 12,12A4,4 0 0,1 8,8A4,4 0 0,1 12,4M12,14C16.42,14 20,15.79 20,18V20H4V18C4,15.79 7.58,14 12,14Z'
  const color = type === 'seller' ? '#4CAF50' : '#2196F3'
  
  el.innerHTML = `
    <div class="marker-pulse" aria-hidden="true"></div>
    <div class="marker-content" aria-hidden="true">
      <svg width="24" height="24" viewBox="0 0 24 24">
        <path fill="${color}" d="${icon}"/>
      </svg>
    </div>
  `
  
  return el
}

// Geocode address using Mapbox
const geocodeAddress = async (address: string): Promise<{ lat: number; lng: number } | null> => {
  if (!address || address === 'Address not available') {
    console.log('⚠️ Cannot geocode empty address')
    return null
  }

  try {
    console.log('📍 Geocoding address:', address)
    
    const searchQuery = address.includes('Butuan') ? address : `${address}, Butuan City, Philippines`
    
    const response = await fetch(
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(searchQuery)}.json?access_token=${MAPBOX_TOKEN}&country=PH&limit=1`
    )
    
    if (!response.ok) {
      console.error('❌ Geocoding API error:', response.status)
      return null
    }
    
    const data = await response.json()
    
    if (data.features && data.features.length > 0) {
      const [lng, lat] = data.features[0].center
      console.log(`📍 Geocoded to: ${lat}, ${lng}`)
      return { lat, lng }
    }
    
    console.log('❌ No geocoding results found')
    return null
  } catch (err) {
    console.error('❌ Geocoding error:', err)
    return null
  }
}

// Calculate routes for all active modes
const calculateAllRoutes = async () => {
  if (!map) return

  const sellerCoords = sellerAddress.value?.lat && sellerAddress.value?.lng
    ? [sellerAddress.value.lng, sellerAddress.value.lat]
    : null

  const buyerCoords = buyerAddress.value?.lat && buyerAddress.value?.lng
    ? [buyerAddress.value.lng, buyerAddress.value.lat]
    : null

  if (!sellerCoords || !buyerCoords) {
    console.log('❌ Cannot calculate routes: missing coordinates')
    error.value = 'Unable to calculate routes. Missing location data.'
    return
  }

  clearAllRoutes()

  const modePromises = transportModes.value
    .filter(mode => mode.active)
    .map(mode => calculateRouteForMode(mode.id, sellerCoords, buyerCoords))

  await Promise.allSettled(modePromises)
  
  detectIdenticalRoutes()
  renderRoutes()
}

// Calculate route for specific mode
const calculateRouteForMode = async (mode: string, start: [number, number], end: [number, number]) => {
  try {
    console.log(`🚗 Calculating ${mode} route...`)
    
    const mapboxMode = mode === 'cycling' ? 'driving' : mode
    
    const response = await fetch(
      `https://api.mapbox.com/directions/v5/mapbox/${mapboxMode}/${start.join(',')};${end.join(',')}?` +
      `alternatives=false&geometries=geojson&steps=true&access_token=${MAPBOX_TOKEN}&overview=full`
    )

    if (!response.ok) {
      console.error(`❌ ${mode} routing API error:`, response.status)
      throw new Error(`${mode} routing failed`)
    }

    const data = await response.json()
    
    if (data.routes && data.routes.length > 0) {
      const route = data.routes[0]
      
      const distanceKm = (route.distance / 1000)
      const durationMins = Math.round(route.duration / 60)
      
      let adjustedDuration = durationMins
      if (mode === 'cycling') {
        adjustedDuration = Math.round(durationMins * 1.5)
      } else if (mode === 'walking') {
        adjustedDuration = Math.round(durationMins * 3)
      }

      routeData.value[mode] = {
        distance: `${distanceKm.toFixed(1)} km`,
        distanceKm: distanceKm,
        duration: `${adjustedDuration} min`,
        durationMinutes: adjustedDuration,
        coordinates: route.geometry.coordinates
      }

      console.log(`📏 ${mode}: ${distanceKm.toFixed(1)} km, ${adjustedDuration} min`)
      
    } else {
      console.log(`❌ No ${mode} route found`)
      routeData.value[mode] = {
        distance: calculateStraightLineDistance(start, end).toFixed(1) + ' km (straight)',
        distanceKm: calculateStraightLineDistance(start, end),
        duration: mode === 'walking' ? 'N/A' : 'N/A',
        durationMinutes: 0,
        coordinates: [start, end]
      }
    }
  } catch (err) {
    console.error(`❌ Error calculating ${mode} route:`, err)
    routeData.value[mode] = {
      distance: calculateStraightLineDistance(start, end).toFixed(1) + ' km (straight)',
      distanceKm: calculateStraightLineDistance(start, end),
      duration: 'N/A',
      durationMinutes: 0,
      coordinates: [start, end]
    }
  }
}

// Detect identical routes
const detectIdenticalRoutes = () => {
  const modes = Object.keys(routeData.value)
  
  for (let i = 0; i < modes.length; i++) {
    for (let j = i + 1; j < modes.length; j++) {
      const mode1 = modes[i]
      const mode2 = modes[j]
      const route1 = routeData.value[mode1]
      const route2 = routeData.value[mode2]
      
      if (route1 && route2 && 
          Math.abs(route1.distanceKm - route2.distanceKm) < 0.1 &&
          route1.coordinates.length === route2.coordinates.length) {
        
        routeData.value[mode2].sameAs = mode1
        console.log(`🔄 ${mode2} route is identical to ${mode1}`)
      }
    }
  }
}

// Render routes on map
const renderRoutes = () => {
  if (!map) return

  const activeModes = transportModes.value.filter(mode => mode.active)
  
  clearAllRoutes()
  addMarkersIfNeeded()
  
  activeModes.forEach((mode, index) => {
    const data = routeData.value[mode.id]
    if (!data || data.sameAs) return
    
    const layerId = `route-${mode.id}`
    const sourceId = `route-source-${mode.id}`
    
    map.addSource(sourceId, {
      type: 'geojson',
      data: {
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'LineString',
          coordinates: data.coordinates
        }
      }
    })
    
    map.addLayer({
      id: layerId,
      type: 'line',
      source: sourceId,
      layout: {
        'line-join': 'round',
        'line-cap': 'round',
        'line-sort-key': index
      },
      paint: {
        'line-color': mode.color,
        'line-width': mode.id === activeTransportMode.value ? 5 : 3,
        'line-opacity': mode.id === activeTransportMode.value ? 0.9 : 0.5,
        'line-dasharray': mode.id === 'walking' ? [2, 2] : []
      }
    })
  })
  
  if (showInfoPanel.value) {
    fitMapToRoutes()
  } else {
    fitMapToAllMarkers()
  }
}

// Fit map to show all markers (full screen mode)
const fitMapToAllMarkers = () => {
  if (!map || markers.length === 0) return
  
  const bounds = new (window as any).mapboxgl.LngLatBounds()
  
  markers.forEach(marker => {
    bounds.extend(marker.getLngLat())
  })
  
  Object.values(routeData.value).forEach(route => {
    if (route && route.coordinates && !route.sameAs) {
      route.coordinates.forEach((coord: [number, number]) => {
        bounds.extend(coord)
      })
    }
  })
  
  if (!bounds.isEmpty()) {
    const padding = 20
    map.fitBounds(bounds, { padding, duration: 1000, maxZoom: 15 })
  }
}

// Fit map to show all routes (with info panel)
const fitMapToRoutes = () => {
  if (!map) return
  
  const bounds = new (window as any).mapboxgl.LngLatBounds()
  
  Object.values(routeData.value).forEach(route => {
    if (route && route.coordinates && !route.sameAs) {
      route.coordinates.forEach((coord: [number, number]) => {
        bounds.extend(coord)
      })
    }
  })
  
  markers.forEach(marker => {
    bounds.extend(marker.getLngLat())
  })
  
  if (!bounds.isEmpty()) {
    const padding = showInfoPanel.value ? 100 : 20
    map.fitBounds(bounds, { padding, duration: 1000 })
  }
}

// Clear all route layers
const clearAllRoutes = () => {
  if (!map) return
  
  transportModes.value.forEach(mode => {
    const layerId = `route-${mode.id}`
    const sourceId = `route-source-${mode.id}`
    
    if (map.getLayer(layerId)) map.removeLayer(layerId)
    if (map.getSource(sourceId)) map.removeSource(sourceId)
  })
}

// Add markers if not present
const addMarkersIfNeeded = () => {
  if (!map || markers.length >= 2) return
  
  const sellerCoords = sellerAddress.value?.lat && sellerAddress.value?.lng
    ? [sellerAddress.value.lng, sellerAddress.value.lat] as [number, number]
    : null

  const buyerCoords = buyerAddress.value?.lat && buyerAddress.value?.lng
    ? [buyerAddress.value.lng, buyerAddress.value.lat] as [number, number]
    : null

  if (sellerCoords && !markers.find(m => m.getLngLat().toString() === sellerCoords.toString())) {
    const sellerMarkerEl = createCustomMarker('seller')
    const sellerMarker = new (window as any).mapboxgl.Marker({ element: sellerMarkerEl })
      .setLngLat(sellerCoords)
      .addTo(map)
    markers.push(sellerMarker)
  }

  if (buyerCoords && !markers.find(m => m.getLngLat().toString() === buyerCoords.toString())) {
    const buyerMarkerEl = createCustomMarker('buyer')
    const buyerMarker = new (window as any).mapboxgl.Marker({ element: buyerMarkerEl })
      .setLngLat(buyerCoords)
      .addTo(map)
    markers.push(buyerMarker)
  }
}

// Calculate straight line distance
const calculateStraightLineDistance = (coord1: [number, number], coord2: [number, number]): number => {
  const [lng1, lat1] = coord1
  const [lng2, lat2] = coord2
  
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLng/2) * Math.sin(dLng/2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
  
  return R * c
}

// Toggle transport mode
const toggleTransportMode = async (modeId: string) => {
  const mode = transportModes.value.find(m => m.id === modeId)
  if (mode) {
    mode.active = !mode.active
    activeTransportMode.value = mode.active ? modeId : transportModes.value.find(m => m.active)?.id || 'driving'
    
    if (showRoute.value) {
      if (mode.active) {
        await calculateAllRoutes()
      } else {
        renderRoutes()
      }
    }
  }
}

// Set active transport mode
const setActiveTransportMode = (modeId: string) => {
  activeTransportMode.value = modeId
  renderRoutes()
}

// Navigation functions
const goBack = () => router.back()

const refreshMap = async () => {
  loading.value = true
  error.value = ''
  if (map) {
    await fetchOrderData()
  }
}

const toggleRoute = async () => {
  showRoute.value = !showRoute.value
  
  if (showRoute.value) {
    await calculateAllRoutes()
  } else {
    clearAllRoutes()
    routeData.value = {}
  }
}

// Toggle info panel visibility
const toggleInfoPanel = () => {
  showInfoPanel.value = !showInfoPanel.value
}

const centerOnSeller = () => {
  if (sellerAddress.value?.lat && sellerAddress.value?.lng) {
    map.flyTo({
      center: [sellerAddress.value.lng, sellerAddress.value.lat],
      zoom: 15,
      duration: 1000
    })
  }
}

const centerOnBuyer = () => {
  if (buyerAddress.value?.lat && buyerAddress.value?.lng) {
    map.flyTo({
      center: [buyerAddress.value.lng, buyerAddress.value.lat],
      zoom: 15,
      duration: 1000
    })
  }
}

// Open in external maps app
const openDirections = () => {
  if (sellerAddress.value?.lat && sellerAddress.value?.lng && buyerAddress.value?.lat && buyerAddress.value?.lng) {
    const url = `https://www.google.com/maps/dir/${sellerAddress.value.lat},${sellerAddress.value.lng}/${buyerAddress.value.lat},${buyerAddress.value.lng}`
    window.open(url, '_blank')
  } else {
    alert('Unable to open directions. Location data is incomplete.')
  }
}

// Copy customer address to clipboard
const copyAddress = async () => {
  try {
    await navigator.clipboard.writeText(formattedBuyerAddress.value)
    alert('Customer address copied to clipboard!')
  } catch (err) {
    console.error('Failed to copy address:', err)
    alert('Failed to copy address. Please try again.')
  }
}

// Computed property for route summary
const routeSummary = computed(() => {
  const activeRoutes = transportModes.value
    .filter(mode => mode.active && routeData.value[mode.id])
    .map(mode => {
      const data = routeData.value[mode.id]
      return {
        mode: mode.name,
        icon: mode.icon,
        color: mode.color,
        distance: data.distance,
        duration: data.duration,
        sameAs: data.sameAs
      }
    })
  
  const grouped = activeRoutes.reduce((acc, route) => {
    if (route.sameAs) {
      const baseRoute = activeRoutes.find(r => !r.sameAs && r.mode.toLowerCase().includes(route.sameAs || ''))
      if (baseRoute) {
        const key = `same-${baseRoute.mode}`
        if (!acc[key]) {
          acc[key] = {
            modes: [baseRoute.mode],
            distance: baseRoute.distance,
            duration: baseRoute.duration,
            colors: [baseRoute.color]
          }
        }
        acc[key].modes.push(route.mode)
        acc[key].colors.push(route.color)
      }
    } else {
      const key = `unique-${route.mode}`
      acc[key] = {
        modes: [route.mode],
        distance: route.distance,
        duration: route.duration,
        colors: [route.color]
      }
    }
    return acc
  }, {} as any)
  
  return Object.values(grouped)
})

// Lifecycle
onMounted(() => {
  initializeMap()
})

onUnmounted(() => {
  if (map) {
    map.remove()
    map = null
  }
})
</script>

<template>
  <v-app>
    <!-- Top Bar -->
    <v-app-bar class="top-bar" flat color="primary" dark elevation="4">
      <v-btn icon @click="goBack" class="mr-2" aria-label="Go back">
        <v-icon>mdi-arrow-left</v-icon>
      </v-btn>
      <v-toolbar-title class="text-h6 font-weight-bold">Delivery Route Map</v-toolbar-title>
      <v-spacer></v-spacer>
      
      <!-- Map Controls -->
      <v-btn icon @click="refreshMap" class="mr-2" :loading="loading" aria-label="Refresh map">
        <v-icon>mdi-refresh</v-icon>
      </v-btn>
      
      <v-btn icon @click="toggleRoute" class="mr-2" aria-label="Toggle routes">
        <v-icon>{{ showRoute ? 'mdi-map-marker-path' : 'mdi-map-marker-off' }}</v-icon>
      </v-btn>
      
      <v-btn icon @click="centerOnSeller" class="mr-2" aria-label="Center on store">
        <v-icon>mdi-store</v-icon>
      </v-btn>
      
      <v-btn icon @click="centerOnBuyer" class="mr-2" aria-label="Center on customer">
        <v-icon>mdi-account</v-icon>
      </v-btn>

      <!-- Info Panel Toggle -->
      <v-btn icon @click="toggleInfoPanel" class="mr-2" :aria-label="showInfoPanel ? 'Hide information panel' : 'Show information panel'">
        <v-icon>{{ showInfoPanel ? 'mdi-information-off' : 'mdi-information' }}</v-icon>
      </v-btn>
    </v-app-bar>

    <v-main class="map-main" :class="{ 'full-screen': !showInfoPanel }">
      <!-- Loading State -->
      <div v-if="loading" class="loading-overlay">
        <v-progress-circular indeterminate color="primary" size="64" />
        <p class="mt-4 text-body-1 text-medium-emphasis">Loading map...</p>
      </div>

      <!-- Error State -->
      <v-alert v-else-if="error" type="error" class="ma-4" rounded="lg">
        <div class="d-flex align-center">
          <v-icon class="mr-3">mdi-alert-circle</v-icon>
          <div>{{ error }}</div>
          <v-spacer></v-spacer>
          <v-btn variant="text" color="white" @click="refreshMap" class="ml-2" aria-label="Retry loading">
            <v-icon>mdi-refresh</v-icon>
            Retry
          </v-btn>
        </div>
      </v-alert>

      <!-- Map Container -->
      <div ref="mapContainer" class="map-container" v-show="!loading && !error" role="region" aria-label="Delivery route map"></div>

      <!-- Transport Mode Selector -->
      <v-card v-if="showInfoPanel" class="transport-selector" elevation="8" role="group" aria-label="Transportation modes">
        <v-card-text class="pa-2">
          <div class="d-flex flex-wrap justify-center gap-2">
            <v-chip
              v-for="mode in transportModes"
              :key="mode.id"
              :color="mode.active ? mode.color : 'grey-lighten-2'"
              :class="{ 'active-mode': mode.id === activeTransportMode }"
              @click="toggleTransportMode(mode.id)"
              @click.middle="setActiveTransportMode(mode.id)"
              size="large"
              class="ma-1"
              :aria-label="`${mode.name} route, ${mode.active ? 'visible' : 'hidden'}`"
              :aria-pressed="mode.id === activeTransportMode"
              role="button"
            >
              <v-icon start :color="mode.active ? 'white' : 'grey'">{{ mode.icon }}</v-icon>
              {{ mode.name }}
              <v-icon
                v-if="!mode.active"
                end
                size="small"
                color="grey"
              >
                mdi-eye-off
              </v-icon>
            </v-chip>
          </div>
        </v-card-text>
      </v-card>

      <!-- Info Panel -->
      <v-card v-if="sellerAddress && buyerAddress && showInfoPanel" class="info-panel" elevation="8" role="complementary" aria-label="Delivery information">
        <!-- Close Button -->
        <v-btn
          icon
          @click="toggleInfoPanel"
          class="close-btn"
          size="small"
          variant="text"
          color="grey-darken-1"
          aria-label="Close information panel"
        >
          <v-icon>mdi-close</v-icon>
        </v-btn>
        
        <v-card-title class="pa-4 pb-2 pt-6">
          <v-icon color="primary" class="mr-2">mdi-route</v-icon>
          <span class="text-h6 font-weight-bold">Delivery Information</span>
        </v-card-title>
        
        <v-card-text class="pa-4 pt-0">
          <!-- Route Summary -->
          <div v-if="showRoute && routeSummary.length > 0" class="route-summary mb-4" role="region" aria-label="Route information">
            <v-row>
              <v-col cols="12" v-for="(group, index) in routeSummary" :key="index">
                <v-card variant="outlined" class="pa-3" rounded="lg">
                  <div class="d-flex align-center">
                    <!-- Mode Icons -->
                    <div class="d-flex align-center mr-3" aria-hidden="true">
                      <div 
                        v-for="(color, colorIndex) in group.colors" 
                        :key="colorIndex"
                        class="mode-indicator"
                        :style="{ backgroundColor: color }"
                      ></div>
                    </div>
                    
                    <!-- Mode Names -->
                    <div class="flex-grow-1">
                      <div class="text-caption font-weight-bold text-medium-emphasis">
                        {{ group.modes.join(' / ') }}
                      </div>
                      <div class="text-body-2">
                        <v-icon small class="mr-1">mdi-road-variant</v-icon>
                        {{ group.distance }}
                        <v-icon small class="ml-2 mr-1">mdi-clock-outline</v-icon>
                        {{ group.duration }}
                      </div>
                    </div>
                    
                    <!-- Identical Route Badge -->
                    <v-chip
                      v-if="group.modes.length > 1"
                      size="small"
                      color="grey-lighten-3"
                      text-color="grey-darken-2"
                      class="ml-2"
                      aria-label="Multiple transportation modes share the same route"
                    >
                      <v-icon start size="small">mdi-link</v-icon>
                      Same Route
                    </v-chip>
                  </div>
                </v-card>
              </v-col>
            </v-row>
            
            <v-divider class="my-3"></v-divider>
          </div>

          <!-- Location Details -->
          <div role="region" aria-label="Location details">
            <v-expansion-panels variant="accordion">
              <!-- Seller Info -->
              <v-expansion-panel elevation="0">
                <v-expansion-panel-title expand-icon="mdi-chevron-down">
                  <div class="d-flex align-center">
                    <v-avatar size="32" color="success" class="mr-3">
                      <v-icon color="white">mdi-store</v-icon>
                    </v-avatar>
                    <div class="text-left">
                      <div class="text-subtitle-2 font-weight-bold">Your Store</div>
                      <div class="text-caption text-truncate" style="max-width: 200px;">
                        {{ formattedSellerAddress }}
                      </div>
                    </div>
                  </div>
                </v-expansion-panel-title>
                <v-expansion-panel-text>
                  <div class="pa-2">
                    <p class="text-body-2 mb-1">
                      <v-icon small class="mr-1">mdi-storefront</v-icon>
                      <strong>{{ sellerBusinessName }}</strong>
                    </p>
                    <p class="text-caption text-medium-emphasis">
                      <v-icon x-small class="mr-1">mdi-map-marker</v-icon>
                      {{ formattedSellerAddress }}
                    </p>
                  </div>
                </v-expansion-panel-text>
              </v-expansion-panel>

              <!-- Buyer Info -->
              <v-expansion-panel elevation="0">
                <v-expansion-panel-title expand-icon="mdi-chevron-down">
                  <div class="d-flex align-center">
                    <v-avatar size="32" color="primary" class="mr-3">
                      <v-icon color="white">mdi-account</v-icon>
                    </v-avatar>
                    <div class="text-left">
                      <div class="text-subtitle-2 font-weight-bold">Customer</div>
                      <div class="text-caption text-truncate" style="max-width: 200px;">
                        {{ buyerName }}
                      </div>
                    </div>
                  </div>
                </v-expansion-panel-title>
                <v-expansion-panel-text>
                  <div class="pa-2">
                    <p class="text-body-2 mb-1">
                      <v-icon small class="mr-1">mdi-account</v-icon>
                      <strong>{{ buyerName }}</strong>
                    </p>
                    <p class="text-caption text-medium-emphasis mb-2">
                      <v-icon x-small class="mr-1">mdi-phone</v-icon>
                      {{ buyerPhone }}
                    </p>
                    <p class="text-caption text-medium-emphasis">
                      <v-icon x-small class="mr-1">mdi-map-marker</v-icon>
                      {{ formattedBuyerAddress }}
                    </p>
                  </div>
                </v-expansion-panel-text>
              </v-expansion-panel>
            </v-expansion-panels>
          </div>

          <!-- Action Buttons -->
          <div class="mt-4" role="group" aria-label="Actions">
            <v-btn 
              @click="openDirections" 
              color="primary" 
              variant="flat" 
              block 
              rounded="lg"
              class="mb-2"
              :disabled="!sellerAddress?.lat || !buyerAddress?.lat"
              aria-label="Open directions in external maps app"
            >
              <v-icon start>mdi-navigation</v-icon>
              Open in Maps App
            </v-btn>
            
            <v-btn 
              @click="copyAddress" 
              color="secondary" 
              variant="outlined" 
              block 
              rounded="lg"
              :disabled="!formattedBuyerAddress || formattedBuyerAddress === 'Address not available'"
              aria-label="Copy customer address to clipboard"
            >
              <v-icon start>mdi-content-copy</v-icon>
              Copy Customer Address
            </v-btn>
          </div>
        </v-card-text>
      </v-card>

      <!-- Active Mode Indicator -->
      <v-card v-if="showRoute && routeData[activeTransportMode] && showInfoPanel" class="active-mode-card" elevation="6" role="status" aria-label="Active route information">
        <v-card-text class="pa-3">
          <div class="d-flex align-center justify-space-between">
            <div class="d-flex align-center">
              <v-avatar size="36" :color="transportModes.find(m => m.id === activeTransportMode)?.color" class="mr-2">
                <v-icon color="white">
                  {{ transportModes.find(m => m.id === activeTransportMode)?.icon }}
                </v-icon>
              </v-avatar>
              <div>
                <div class="text-caption font-weight-bold">
                  {{ transportModes.find(m => m.id === activeTransportMode)?.name }}
                </div>
                <div class="text-body-1 font-weight-bold">
                  {{ routeData[activeTransportMode].distance }}
                </div>
              </div>
            </div>
            <div class="text-right">
              <div class="text-caption text-medium-emphasis">Est. Time</div>
              <div class="text-body-1 font-weight-bold">{{ routeData[activeTransportMode].duration }}</div>
            </div>
          </div>
        </v-card-text>
      </v-card>

      <!-- Show Info Panel Button (when hidden) -->
      <v-btn
        v-if="!showInfoPanel"
        @click="toggleInfoPanel"
        class="show-info-btn"
        color="primary"
        icon
        size="large"
        elevation="6"
        aria-label="Show information panel"
      >
        <v-icon>mdi-information</v-icon>
      </v-btn>
    </v-main>
  </v-app>
</template>

<style scoped>
.map-main {
  position: relative;
  height: 100vh;
  overflow: hidden;
  transition: all 0.3s ease;
}

.map-main.full-screen {
  padding: 0 !important;
  margin: 0 !important;
}

.map-container {
  width: 100%;
  height: 100%;
  z-index: 1;
  transition: all 0.3s ease;
}

.map-main.full-screen .map-container {
  height: 100vh;
  width: 100vw;
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
}

.loading-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.95);
  z-index: 1000;
}

.transport-selector {
  position: absolute;
  top: 80px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 1000;
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(0, 0, 0, 0.1);
  max-width: 90%;
  transition: opacity 0.3s ease, transform 0.3s ease;
}

.map-main.full-screen .transport-selector {
  opacity: 0;
  pointer-events: none;
  transform: translateX(-50%) translateY(-20px);
}

.info-panel {
  position: absolute;
  bottom: 20px;
  left: 20px;
  right: 20px;
  z-index: 1000;
  max-width: 400px;
  margin: 0 auto;
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(0, 0, 0, 0.1);
  transition: transform 0.3s ease, opacity 0.3s ease;
}

.info-panel.hidden {
  transform: translateY(100%);
  opacity: 0;
}

.active-mode-card {
  position: absolute;
  top: 140px;
  right: 20px;
  z-index: 1000;
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(0, 0, 0, 0.1);
  max-width: 300px;
  transition: opacity 0.3s ease, transform 0.3s ease;
}

.map-main.full-screen .active-mode-card {
  opacity: 0;
  pointer-events: none;
  transform: translateY(-20px);
}

/* Custom marker styles */
.custom-marker {
  position: relative;
}

.marker-pulse {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: currentColor;
  opacity: 0.3;
  animation: pulse 2s infinite;
}

.marker-content {
  position: relative;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: white;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  border: 2px solid currentColor;
}

.seller-marker .marker-content {
  color: #4CAF50;
}

.buyer-marker .marker-content {
  color: #2196F3;
}

/* Map popup styling - Fix accessibility */
:deep(.mapboxgl-popup-content) {
  padding: 12px;
  border-radius: 12px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
}

/* Remove aria-hidden from popup close button */
:deep(.mapboxgl-popup-close-button) {
  border: 0;
  border-radius: 0 3px 0 0;
  cursor: pointer;
  background-color: transparent;
  font-size: 20px;
  color: #333;
  padding: 4px 8px;
  min-width: auto;
}

:deep(.mapboxgl-popup-close-button:hover) {
  background-color: rgba(0, 0, 0, 0.05);
}

:deep(.mapboxgl-popup-close-button:focus) {
  outline: 2px solid #2196F3;
  outline-offset: 2px;
}

.map-popup {
  min-width: 200px;
}

.map-popup h4 {
  margin: 0 0 4px 0;
  color: #1976D2;
  font-size: 14px;
  font-weight: 600;
}

.map-popup p {
  margin: 0 0 4px 0;
  font-size: 12px;
  color: #666;
}

.map-popup small {
  color: #999;
  font-size: 10px;
}

/* Transport mode chips */
.active-mode {
  border: 2px solid white !important;
  box-shadow: 0 0 0 2px currentColor;
}

.mode-indicator {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  margin-right: 2px;
}

.mode-indicator:last-child {
  margin-right: 0;
}

.mode-indicator + .mode-indicator {
  margin-left: -4px;
}

/* Close button for info panel */
.close-btn {
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 1001;
}

/* Show info panel button (when hidden) */
.show-info-btn {
  position: absolute;
  bottom: 20px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 1000;
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(0, 0, 0, 0.1);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.show-info-btn:hover {
  background: rgba(255, 255, 255, 0.98);
  transform: translateX(-50%) scale(1.05);
  transition: all 0.2s ease;
}

/* Animations */
@keyframes pulse {
  0% {
    transform: translate(-50%, -50%) scale(0.8);
    opacity: 0.3;
  }
  50% {
    transform: translate(-50%, -50%) scale(1.2);
    opacity: 0.1;
  }
  100% {
    transform: translate(-50%, -50%) scale(0.8);
    opacity: 0.3;
  }
}

/* Full screen map styling */
:deep(.mapboxgl-ctrl-top-right) {
  top: 80px;
}

.map-main.full-screen :deep(.mapboxgl-ctrl-top-right) {
  top: 20px;
}

/* Accessibility focus styles */
:focus-visible {
  outline: 2px solid #2196F3;
  outline-offset: 2px;
}

/* Responsive adjustments */
@media (max-width: 600px) {
  .transport-selector {
    top: 70px;
    left: 10px;
    right: 10px;
    transform: none;
    max-width: none;
  }
  
  .info-panel {
    left: 10px;
    right: 10px;
    bottom: 10px;
  }
  
  .active-mode-card {
    top: 130px;
    right: 10px;
    left: 10px;
    max-width: none;
  }
  
  .show-info-btn {
    bottom: 10px;
  }
  
  .top-bar {
    padding-top: 19px;
  }
  
  .map-main.full-screen {
    height: calc(100vh - 64px);
  }
  
  .map-main.full-screen .map-container {
    height: calc(100vh - 64px);
  }
}
</style>