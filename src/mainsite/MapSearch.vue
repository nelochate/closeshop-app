<script setup lang="ts">
import { ref, onMounted, watch, onUnmounted, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { useGeolocation } from '@/composables/useGeolocation'
import { Capacitor } from '@capacitor/core'
import { supabase } from '@/utils/supabase'
import BottomNav from '@/common/layout/BottomNav.vue'
import { Geolocation } from '@capacitor/geolocation'

// Import Mapbox - use dynamic import to avoid SSR issues
let mapboxgl: any = null

/* -------------------- MAPBOX CONFIG -------------------- */
const MAPBOX_ACCESS_TOKEN =
  'pk.eyJ1IjoiY2xvc2VzaG9wIiwiYSI6ImNtaDI2emxocjEwdnVqMHExenFpam42bjcifQ.QDsWVOHM9JPhPQ---Ca4MA'

/* -------------------- ROUTE OPTIONS INTERFACE -------------------- */
interface RouteOption {
  coords: [number, number][]
  distance: number // in meters
  duration: number // in seconds
  summary: string
  color: string
  type: 'driving' | 'walking' | 'cycling'
}

/* -------------------- STATE -------------------- */
const activeTab = ref('map')
const map = ref<any>(null)
const router = useRouter()
const search = ref('')
const shops = ref<any[]>([])
const loading = ref(false)
const errorMsg = ref<string | null>(null)
const showShopMenu = ref(false)
const shopDisplayMode = ref<'within' | 'outside'>('within')
const userCity = ref<string | null>(null)
const lastKnownKey = 'closeshop_last_location'
const lastKnown = ref<[number, number] | null>(null)
let lastUpdateTs = 0
const productMatches = ref<any[]>([])
const routeLoading = ref(false)
const filteredShops = ref<any[]>([])
const mapInitialized = ref(false)
const isSearchMode = ref(false)
const boundaryLoading = ref(false)
const hasValidLocation = ref(false)
const selectedShopId = ref<string | null>(null)
const showBoundary = ref(true)

/* -------------------- ROUTE TYPE SELECTOR -------------------- */
type RouteType = 'driving' | 'walking' | 'cycling'
const selectedRouteType = ref<RouteType>('driving') // Default to driving
const routeOptions = ref<RouteOption[]>([]) // All calculated routes
const showRoutePanel = ref(false) // Control visibility of route panel

/* -------------------- ROUTE CONFIG -------------------- */
const routeConfig = {
  driving: {
    label: 'Car',
    icon: 'mdi-car',
    color: '#3b82f6',
    activeColor: '#1d4ed8',
  },
  walking: {
    label: 'Walking',
    icon: 'mdi-walk',
    color: '#10b981',
    activeColor: '#059669',
  },
  cycling: {
    label: 'Cycling',
    icon: 'mdi-bike',
    color: '#f59e0b',
    activeColor: '#d97706',
  },
}

/* -------------------- GEOLOCATION -------------------- */
const { latitude, longitude, requestPermission, startWatching, stopWatching } = useGeolocation()
let userMarker: any = null
let shopMarkers: any[] = []
let cityBoundarySourceId: string | null = null
const locating = ref(false)
let fetchTimeout: number | null = null

/* -------------------- MAP INITIALIZATION -------------------- */
const initializeMap = async (): Promise<void> => {
  try {
    // Dynamically import mapbox-gl to avoid SSR issues
    if (typeof window !== 'undefined') {
      const mapboxModule = await import('mapbox-gl')
      mapboxgl = mapboxModule.default
      mapboxgl.accessToken = MAPBOX_ACCESS_TOKEN
    }

    if (map.value) {
      try {
        map.value.remove()
      } catch (e) {
        console.warn('Error removing existing map:', e)
      }
      map.value = null
    }

    await nextTick()

    const mapContainer = document.getElementById('map')
    if (!mapContainer) {
      console.error('Map container not found')
      return
    }

    // Clear container
    mapContainer.innerHTML = ''

    // Load cached location
    loadCachedLocation()
    const initialCenter = lastKnown.value ?? [8.95, 125.53]

    // Create map
    map.value = new mapboxgl.Map({
      container: 'map',
      style: 'mapbox://styles/mapbox/streets-v12',
      center: [initialCenter[1], initialCenter[0]], // Mapbox uses [lng, lat]
      zoom: 13,
      attributionControl: false,
      interactive: true,
      pitchWithRotate: false,
      dragRotate: false,
      touchZoomRotate: true,
      maxZoom: 19,
      minZoom: 3,
    })

    // Add navigation control
    map.value.addControl(
      new mapboxgl.NavigationControl({
        showCompass: false,
        showZoom: true,
        visualizePitch: false,
      }),
      'top-right',
    )

    // Add geolocate control
    const geolocate = new mapboxgl.GeolocateControl({
      positionOptions: {
        enableHighAccuracy: true,
      },
      trackUserLocation: true,
      showUserLocation: true,
      showAccuracyCircle: true,
    })
    map.value.addControl(geolocate, 'top-right')

    // Add attribution
    map.value.addControl(new mapboxgl.AttributionControl({ compact: true }), 'bottom-right')

    // Handle map load
    map.value.on('load', async () => {
      console.log('Mapbox map loaded successfully')
      mapInitialized.value = true

      // Add user marker
      createUserMarker(initialCenter[0], initialCenter[1])

      // Force map resize
      setTimeout(() => {
        map.value?.resize()
      }, 100)

      // Load city boundary if we have location
      if (lastKnown.value) {
        await highlightUserCityBoundary(lastKnown.value[0], lastKnown.value[1])
      }
    })

    // Handle map errors
    map.value.on('error', (e: any) => {
      console.error('Mapbox error:', e)
    })

    console.log('Map initialized successfully')
  } catch (error) {
    console.error('Error initializing map:', error)
  }
}

/* -------------------- USER MARKER -------------------- */
const createUserMarker = (lat: number, lng: number) => {
  if (!map.value || !mapboxgl) return

  // Remove existing marker
  if (userMarker) {
    userMarker.remove()
  }

  // Create custom HTML marker
  const el = document.createElement('div')
  el.className = 'user-marker'
  el.innerHTML = `
    <div class="user-marker-pulse"></div>
    <div class="user-marker-inner">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="#3B82F6">
        <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
      </svg>
    </div>
  `

  userMarker = new mapboxgl.Marker({
    element: el,
    anchor: 'center',
  })
    .setLngLat([lng, lat])
    .addTo(map.value)

  // Add popup
  const popup = new mapboxgl.Popup({
    closeButton: false,
    offset: 25,
    className: 'user-popup',
  }).setHTML('<div class="p-2"><strong>You are here</strong></div>')

  userMarker.setPopup(popup)
}

/* -------------------- CITY BOUNDARY DETECTION & DISPLAY -------------------- */
const detectUserCity = async (lat: number, lng: number): Promise<string | null> => {
  try {
    console.log('Detecting city for:', lat, lng)

    const response = await fetch(
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?types=place&access_token=${MAPBOX_ACCESS_TOKEN}`,
    )

    if (!response.ok) {
      throw new Error(`Geocoding failed: ${response.status}`)
    }

    const data = await response.json()
    console.log('Geocoding response:', data)

    if (data.features && data.features.length > 0) {
      // Find city feature
      const cityFeature = data.features.find(
        (feature: any) =>
          feature.place_type.includes('place') || feature.place_type.includes('locality'),
      )

      if (cityFeature) {
        console.log('Detected city:', cityFeature.text)
        return cityFeature.text
      }
    }

    console.warn('No city features found in response')
    return null
  } catch (error) {
    console.error('City detection failed:', error)
    return null
  }
}

const fetchCityBoundaryData = async (cityName: string): Promise<any> => {
  try {
    console.log('Fetching boundary data for:', cityName)

    // Use Nominatim OpenStreetMap API for city boundaries
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(cityName + ', Philippines')}&format=json&polygon_geojson=1&addressdetails=1`,
    )

    if (!response.ok) throw new Error('Boundary fetch failed')

    const data = await response.json()
    console.log('Boundary data from Nominatim:', data)

    if (data && data.length > 0) {
      // Try to find a result with polygon data
      const cityData = data.find(
        (item: any) =>
          item.geojson &&
          (item.geojson.type === 'Polygon' || item.geojson.type === 'MultiPolygon') &&
          (item.type === 'administrative' || item.class === 'boundary'),
      )

      if (cityData && cityData.geojson) {
        return {
          type: 'Feature',
          geometry: cityData.geojson,
          properties: {
            name: cityData.display_name,
            osm_type: cityData.osm_type,
            osm_id: cityData.osm_id,
          },
        }
      }
    }

    // Fallback to circular boundary
    console.log('Using circular boundary as fallback')
    return createCircularBoundary(latitude.value!, longitude.value!)
  } catch (error) {
    console.warn('City boundary fetch failed:', error)
    return createCircularBoundary(latitude.value!, longitude.value!)
  }
}

const createCircularBoundary = (lat: number, lng: number, radiusKm: number = 5) => {
  const points = 32
  const coordinates = []

  for (let i = 0; i < points; i++) {
    const angle = (i * 360) / points
    const bearing = (angle * Math.PI) / 180

    const latRad = (lat * Math.PI) / 180
    const lngRad = (lng * Math.PI) / 180
    const angularDistance = radiusKm / 6371

    const newLat = Math.asin(
      Math.sin(latRad) * Math.cos(angularDistance) +
        Math.cos(latRad) * Math.sin(angularDistance) * Math.cos(bearing),
    )

    const newLng =
      lngRad +
      Math.atan2(
        Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(latRad),
        Math.cos(angularDistance) - Math.sin(latRad) * Math.sin(newLat),
      )

    coordinates.push([(newLng * 180) / Math.PI, (newLat * 180) / Math.PI]) // [lng, lat]
  }

  coordinates.push(coordinates[0]) // Close polygon

  return {
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      coordinates: [coordinates],
    },
    properties: {
      name: 'Approximate Area',
      isFallback: true,
    },
  }
}

const highlightUserCityBoundary = async (lat: number, lng: number) => {
  if (!map.value || !mapboxgl || !showBoundary.value) {
    console.log('Boundary display is disabled or map not available')
    return
  }

  try {
    boundaryLoading.value = true
    console.log('Starting boundary highlighting for:', lat, lng)

    // Clear existing boundary
    clearCityBoundary()

    // Detect city name
    const detectedCity = await detectUserCity(lat, lng)
    userCity.value = detectedCity

    if (!detectedCity) {
      console.warn('Could not detect city name')
      setErrorMessage('Could not detect your city. Showing all shops.', 3000)
      boundaryLoading.value = false
      return
    }

    // Fetch boundary data
    const boundaryData = await fetchCityBoundaryData(detectedCity)

    if (!boundaryData) {
      console.warn('Could not fetch boundary data')
      setErrorMessage('Could not load city boundary. Showing all shops.', 3000)
      boundaryLoading.value = false
      return
    }

    // Add boundary source to map
    const sourceId = 'city-boundary-source'
    const fillLayerId = 'city-boundary-fill'
    const lineLayerId = 'city-boundary-line'

    if (!map.value.getSource(sourceId)) {
      map.value.addSource(sourceId, {
        type: 'geojson',
        data: boundaryData,
      })
    } else {
      const source = map.value.getSource(sourceId)
      source.setData(boundaryData)
    }

    // Add fill layer if not exists
    if (!map.value.getLayer(fillLayerId)) {
      map.value.addLayer({
        id: fillLayerId,
        type: 'fill',
        source: sourceId,
        paint: {
          'fill-color': '#3b82f6',
          'fill-opacity': 0.1,
          'fill-outline-color': '#3b82f6',
        },
      })
    }

    // Add line layer if not exists
    if (!map.value.getLayer(lineLayerId)) {
      map.value.addLayer({
        id: lineLayerId,
        type: 'line',
        source: sourceId,
        paint: {
          'line-color': '#3b82f6',
          'line-width': 3,
          'line-opacity': 0.8,
          'line-dasharray': [2, 2],
        },
      })
    }

    // Fit map to boundary
    try {
      const bounds = new mapboxgl.LngLatBounds()

      if (boundaryData.geometry.type === 'Polygon') {
        boundaryData.geometry.coordinates[0].forEach((coord: [number, number]) => {
          bounds.extend(coord)
        })
      } else if (boundaryData.geometry.type === 'MultiPolygon') {
        boundaryData.geometry.coordinates[0][0].forEach((coord: [number, number]) => {
          bounds.extend(coord)
        })
      } else if (boundaryData.geometry.type === 'Point') {
        bounds.extend(boundaryData.geometry.coordinates as [number, number])
      }

      // Include user location
      bounds.extend([lng, lat])

      // Only fit bounds if we have valid bounds
      if (bounds.getNorth() !== bounds.getSouth() && bounds.getEast() !== bounds.getWest()) {
        map.value.fitBounds(bounds, {
          padding: 50,
          animate: true,
          duration: 1000,
          maxZoom: 15,
        })
      }
    } catch (boundsError) {
      console.warn('Could not fit bounds to boundary:', boundsError)
      // Fallback to centering on user
      map.value.flyTo({
        center: [lng, lat],
        zoom: 13,
        animate: true,
        duration: 1000,
      })
    }

    setErrorMessage(`Showing shops in ${detectedCity}`, 3000)
    console.log('Boundary highlighted successfully')
  } catch (error) {
    console.error('Error highlighting city boundary:', error)
    setErrorMessage('Error loading city boundary', 3000)
  } finally {
    boundaryLoading.value = false
  }
}

const clearCityBoundary = () => {
  if (!map.value || !mapboxgl) return

  // Remove layers
  const layers = ['city-boundary-fill', 'city-boundary-line']
  layers.forEach((layerId) => {
    if (map.value.getLayer(layerId)) {
      map.value.removeLayer(layerId)
    }
  })

  // Remove source
  const sourceId = 'city-boundary-source'
  if (map.value.getSource(sourceId)) {
    map.value.removeSource(sourceId)
  }

  userCity.value = null
  console.log('City boundary cleared')
}

const toggleBoundaryVisibility = () => {
  showBoundary.value = !showBoundary.value

  if (showBoundary.value && latitude.value && longitude.value) {
    // Redraw boundary if turned on
    highlightUserCityBoundary(latitude.value, longitude.value)
  } else {
    // Clear boundary if turned off
    clearCityBoundary()
  }

  setErrorMessage(showBoundary.value ? 'City boundary enabled' : 'City boundary disabled', 2000)
}

/* -------------------- BOUNDARY CHECK -------------------- */
const isShopWithinBoundary = (shop: any): boolean => {
  if (!shop.latitude || !shop.longitude) {
    return isShopInSameCity(shop)
  }

  const shopLat = Number(shop.latitude)
  const shopLng = Number(shop.longitude)

  if (!isFinite(shopLat) || !isFinite(shopLng)) {
    return isShopInSameCity(shop)
  }

  // Fallback to city name matching
  return isShopInSameCity(shop)
}

const isShopInSameCity = (shop: any): boolean => {
  if (!userCity.value || !shop.city) return false

  const normalizeName = (name: string) => {
    if (!name) return ''
    return name
      .toLowerCase()
      .replace(/city|municipality|municipal|town|province|^\s+|\s+$/g, '')
      .trim()
  }

  const userCityNormalized = normalizeName(userCity.value)
  const shopCityNormalized = normalizeName(shop.city)

  if (!userCityNormalized || !shopCityNormalized) return false

  return (
    userCityNormalized === shopCityNormalized ||
    shopCityNormalized.includes(userCityNormalized) ||
    userCityNormalized.includes(shopCityNormalized)
  )
}

/* -------------------- CACHE LOCATION -------------------- */
function loadCachedLocation() {
  try {
    const v = localStorage.getItem(lastKnownKey)
    if (v) {
      const arr = JSON.parse(v)
      if (Array.isArray(arr) && arr.length === 2) {
        lastKnown.value = [Number(arr[0]), Number(arr[1])]
      }
    }
  } catch (e) {
    console.warn('Could not read cached location', e)
  }
}

function saveCachedLocation(lat: number, lng: number) {
  try {
    localStorage.setItem(lastKnownKey, JSON.stringify([lat, lng]))
  } catch (e) {
    console.warn('Could not save cached location', e)
  }
}

/* -------------------- RECENTER -------------------- */
const recenterToUser = async () => {
  if (!map.value || !mapboxgl) return

  locating.value = true
  errorMsg.value = null

  try {
    let targetLat: number, targetLng: number

    if (latitude.value && longitude.value) {
      targetLat = Number(latitude.value)
      targetLng = Number(longitude.value)
    } else {
      try {
        const position = await Geolocation.getCurrentPosition({
          enableHighAccuracy: true,
          timeout: 10000,
        })
        targetLat = position.coords.latitude
        targetLng = position.coords.longitude
      } catch (geolocationError) {
        if (lastKnown.value) {
          targetLat = lastKnown.value[0]
          targetLng = lastKnown.value[1]
          errorMsg.value = 'Using last known location'
        } else {
          errorMsg.value = 'Unable to determine your location'
          return
        }
      }
    }

    // Update user marker
    if (userMarker) {
      userMarker.setLngLat([targetLng, targetLat])
    }

    // ALWAYS zoom to level 16 (zoom in)
    const targetZoom = 16

    // Center map
    map.value.flyTo({
      center: [targetLng, targetLat],
      zoom: targetZoom,
      essential: true,
      duration: 1000,
    })

    // Save and refresh boundary
    saveCachedLocation(targetLat, targetLng)
    await highlightUserCityBoundary(targetLat, targetLng)
    
    // Show success message
    setErrorMessage('Location updated', 2000)
  } catch (error) {
    console.error('Error recentering:', error)
    setErrorMessage('Failed to update location', 3000)
  } finally {
    locating.value = false
  }
}
/* -------------------- ROUTE MANAGEMENT -------------------- */
let currentRouteLayers: string[] = []
let currentRouteMarkers: any[] = []

/* -------------------- MULTIPLE ROUTING VIA MAPBOX -------------------- */
const getRouteOptions = async (
  start: [number, number],
  end: [number, number],
): Promise<RouteOption[]> => {
  try {
    if (!navigator.onLine) {
      throw new Error('No internet connection')
    }

    const routeOptions: RouteOption[] = []
    const profiles = [
      { type: 'driving' as const, color: '#3b82f6', name: 'Car' },
      { type: 'walking' as const, color: '#10b981', name: 'Walking' },
      { type: 'cycling' as const, color: '#f59e0b', name: 'Cycling' },
    ]

    for (const profile of profiles) {
      try {
        const coordinates = `${start[1]},${start[0]};${end[1]},${end[0]}`
        const url = `https://api.mapbox.com/directions/v5/mapbox/${profile.type}/${coordinates}?alternatives=false&geometries=geojson&steps=false&overview=full&access_token=${MAPBOX_ACCESS_TOKEN}`

        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 10000)

        const res = await fetch(url, {
          signal: controller.signal,
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
        })

        clearTimeout(timeoutId)

        if (!res.ok) continue

        const data = await res.json()

        if (!data.routes || data.routes.length === 0) continue

        const route = data.routes[0]

        if (route.geometry && route.geometry.coordinates) {
          const coords = route.geometry.coordinates.map((coord: [number, number]) => [
            coord[1], // lat
            coord[0], // lon
          ])

          const distance = route.distance
          const duration = route.duration

          routeOptions.push({
            coords,
            distance,
            duration,
            summary: `${profile.name} Route`,
            color: profile.color,
            type: profile.type,
          })
        }
      } catch (err) {
        console.warn(`Failed to get ${profile.type} route:`, err)
      }
    }

    if (routeOptions.length === 0) {
      return [createStraightLineRoute(start, end, 'driving')]
    }

    return routeOptions.sort((a, b) => a.duration - b.duration)
  } catch (err) {
    console.error('Mapbox routing failed:', err)
    return [createStraightLineRoute(start, end, 'driving')]
  }
}

/* -------------------- FALLBACK ROUTE CREATION -------------------- */
const createStraightLineRoute = (
  start: [number, number],
  end: [number, number],
  type: 'driving' | 'walking' | 'cycling',
): RouteOption => {
  const distance = getDistanceKm(start[0], start[1], end[0], end[1]) * 1000

  const speedEstimates = {
    driving: 40,
    walking: 5,
    cycling: 15,
  }

  const estimatedDuration = (distance / 1000 / speedEstimates[type]) * 3600

  const typeNames = {
    driving: 'Car',
    walking: 'Walking',
    cycling: 'Cycling',
  }

  const colors = {
    driving: '#3b82f6',
    walking: '#10b981',
    cycling: '#f59e0b',
  }

  return {
    coords: [start, end],
    distance,
    duration: estimatedDuration,
    summary: `${typeNames[type]} Route`,
    color: colors[type],
    type,
  }
}

/* -------------------- DRAW ROUTE -------------------- */
const drawRoute = (route: RouteOption) => {
  if (!map.value || !mapboxgl || !route) return

  clearRoutes()

  try {
    const routeId = `route-${route.type}`
    const geojson = {
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: route.coords.map((coord) => [coord[1], coord[0]]), // Convert to [lng, lat]
      },
      properties: {
        type: route.type,
        color: route.color,
      },
    }

    // Add source
    map.value.addSource(routeId, {
      type: 'geojson',
      data: geojson,
    })

    // Add layer
    map.value.addLayer({
      id: routeId,
      type: 'line',
      source: routeId,
      layout: {
        'line-join': 'round',
        'line-cap': 'round',
      },
      paint: {
        'line-color': route.color,
        'line-width': 6,
        'line-opacity': 0.8,
      },
    })

    currentRouteLayers.push(routeId)

    // Fit bounds to route
    const bounds = new mapboxgl.LngLatBounds()
    route.coords.forEach((coord) => {
      bounds.extend([coord[1], coord[0]])
    })

    if (bounds.getNorth() !== bounds.getSouth() && bounds.getEast() !== bounds.getWest()) {
      map.value.fitBounds(bounds, {
        padding: 50,
        animate: false,
        duration: 0,
      })
    }

    // Show route info
    const distanceKm = (route.distance / 1000).toFixed(1)
    const durationMin = Math.round(route.duration / 60)
    setErrorMessage(
      `${routeConfig[route.type].label} Route: ${distanceKm} km • ${durationMin} min`,
      5000,
    )
  } catch (error) {
    console.error('Error drawing route:', error)
  }
}

/* -------------------- CLEAR ROUTES -------------------- */
const clearRoutes = () => {
  if (!map.value || !mapboxgl) return

  // Remove layers
  currentRouteLayers.forEach((layerId) => {
    if (map.value.getLayer(layerId)) {
      map.value.removeLayer(layerId)
    }
    if (map.value.getSource(layerId)) {
      map.value.removeSource(layerId)
    }
  })

  // Remove markers
  currentRouteMarkers.forEach((marker) => {
    marker.remove()
  })

  currentRouteLayers = []
  currentRouteMarkers = []
}

/* -------------------- CLEAR ALL ROUTES -------------------- */
const clearAllRoutes = () => {
  clearRoutes()
  routeOptions.value = []
  showRoutePanel.value = false
  selectedRouteType.value = 'driving'
  console.log('All routes cleared')
}

/* -------------------- SELECT ROUTE TYPE -------------------- */
const selectRouteType = async (type: RouteType) => {
  selectedRouteType.value = type

  // Find the route for the selected type
  const route = routeOptions.value.find((r) => r.type === type)
  if (route) {
    drawRoute(route)
  } else {
    // If route not found, try to get it
    await calculateAndDisplayRoute(type)
  }
}

/* -------------------- CALCULATE AND DISPLAY SPECIFIC ROUTE -------------------- */
const calculateAndDisplayRoute = async (type: RouteType) => {
  routeLoading.value = true

  try {
    // Find the shop that's currently selected
    const shop = shops.value.find((s) => s.id === selectedShopId.value)
    if (!shop || !shop.latitude || !shop.longitude) {
      setErrorMessage('Shop location not available')
      return
    }

    const userLat = Number(latitude.value ?? lastKnown.value?.[0])
    const userLng = Number(longitude.value ?? lastKnown.value?.[1])

    if (!isFinite(userLat) || !isFinite(userLng)) {
      setErrorMessage('Your location is not available')
      return
    }

    const start: [number, number] = [userLat, userLng]
    const end: [number, number] = [Number(shop.latitude), Number(shop.longitude)]

    // Calculate specific route type
    const route = await getSingleRoute(start, end, type)

    if (route) {
      // Add to route options if not already there
      const existingIndex = routeOptions.value.findIndex((r) => r.type === type)
      if (existingIndex >= 0) {
        routeOptions.value[existingIndex] = route
      } else {
        routeOptions.value.push(route)
      }

      // Draw the route
      drawRoute(route)
    } else {
      setErrorMessage(`${type} route not available`, 3000)
    }
  } catch (error) {
    console.error('Error calculating route:', error)
    setErrorMessage('Failed to calculate route', 3000)
  } finally {
    routeLoading.value = false
  }
}

/* -------------------- GET SINGLE ROUTE -------------------- */
const getSingleRoute = async (
  start: [number, number],
  end: [number, number],
  type: 'driving' | 'walking' | 'cycling',
): Promise<RouteOption | null> => {
  try {
    const coordinates = `${start[1]},${start[0]};${end[1]},${end[0]}`
    const url = `https://api.mapbox.com/directions/v5/mapbox/${type}/${coordinates}?alternatives=false&geometries=geojson&steps=false&overview=full&access_token=${MAPBOX_ACCESS_TOKEN}`

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 10000)

    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    })

    clearTimeout(timeoutId)

    if (!res.ok) return null

    const data = await res.json()

    if (!data.routes || data.routes.length === 0) return null

    const mapboxRoute = data.routes[0]

    if (mapboxRoute.geometry && mapboxRoute.geometry.coordinates) {
      const coords = mapboxRoute.geometry.coordinates.map((coord: [number, number]) => [
        coord[1], // lat
        coord[0], // lon
      ])

      const color = routeConfig[type].color

      return {
        coords,
        distance: mapboxRoute.distance,
        duration: mapboxRoute.duration,
        summary: `${routeConfig[type].label} Route`,
        color,
        type,
      }
    }
  } catch (err) {
    console.warn(`Failed to get ${type} route:`, err)
  }

  return null
}

/* -------------------- DISTANCE CALCULATION -------------------- */
const getDistanceKm = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const R = 6371
  const toRad = (v: number) => (v * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

/* -------------------- FETCH SHOPS -------------------- */
const doFetchShops = async () => {
  try {
    loading.value = true
    errorMsg.value = null

    const userLat = Number(latitude.value ?? lastKnown.value?.[0] ?? 0)
    const userLng = Number(longitude.value ?? lastKnown.value?.[1] ?? 0)

    const { data, error } = await supabase
      .from('shops')
      .select(
        `
    id,
    business_name,
    latitude,
    longitude,
    logo_url,
    physical_store,
    detected_address,
    house_no,
    building,
    street,
    barangay,
    city,
    province,
    postal,
    status,
    manual_status,
    open_time,
    close_time,
    open_days,
    products:products(id, prod_name, price, main_img_urls)
  `,
      )
      .eq('status', 'approved')
    if (error) throw error
    if (!data) {
      shops.value = []
      clearShopMarkers()
      return
    }

    const mapped = data.map((s) => {
      const lat = Number(s.latitude)
      const lng = Number(s.longitude)
      const distanceKm =
        isFinite(lat) && isFinite(lng) ? getDistanceKm(userLat, userLng, lat, lng) : Infinity

      // Check if shop is within city boundary
      const withinBoundary = isShopWithinBoundary(s)

      return {
        ...s,
        distanceKm,
        withinBoundary,
      }
    })

    shops.value = mapped.sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity))
    applyShopFilters()
  } catch (e) {
    console.error(e)
    errorMsg.value = 'Failed to fetch shops.'
  } finally {
    loading.value = false
  }
}

const fetchShops = () => {
  if (fetchTimeout) window.clearTimeout(fetchTimeout)
  fetchTimeout = window.setTimeout(() => {
    void doFetchShops()
    fetchTimeout = null
  }, 350)
}

/* -------------------- APPLY SHOP FILTERS -------------------- */
const applyShopFilters = () => {
  if (shopDisplayMode.value === 'within') {
    filteredShops.value = shops.value.filter(
      (shop) => shop.withinBoundary || isShopInSameCity(shop),
    )
  } else {
    filteredShops.value = shops.value.filter(
      (shop) => !shop.withinBoundary && !isShopInSameCity(shop),
    )
  }

  plotShops()
}

const toggleDisplayMode = (mode: 'within' | 'outside') => {
  shopDisplayMode.value = mode
  applyShopFilters()

  if (userCity.value) {
    setErrorMessage(
      mode === 'within'
        ? `Showing shops within ${userCity.value}`
        : `Showing shops outside ${userCity.value}`,
    )
  } else {
    setErrorMessage(
      mode === 'within' ? 'Showing shops in your area' : 'Showing shops outside your area',
    )
  }
}

/* -------------------- SHOP POPUP -------------------- */
const createShopPopup = (shop: any): string => {
  const productList = (shop.products || [])
    .map((p: any) => `<li>${p.prod_name} - ₱${p.price}</li>`)
    .join('')

  const statusDisplay = getShopStatusDisplay(shop)

  return `
    <div style="text-align:center; min-width: 240px; max-width: 300px;" class="shop-popup-content">
      <div style="position: relative;">
        <img src="${shop.physical_store || shop.logo_url || 'https://placehold.co/80x80'}" 
             width="80" height="80" 
             style="border-radius:8px;object-fit:cover;margin-bottom:6px;" />
        <div style="position: absolute; top: -5px; right: -5px; 
                    background: ${statusDisplay.color}; color: white; 
                    padding: 2px 8px; border-radius: 12px; font-size: 10px; 
                    font-weight: bold; cursor: help;"
             title="${statusDisplay.tooltip}">
          ${statusDisplay.text}
          ${shop.manual_status !== 'auto' ? ' ⚡' : ''}
        </div>
      </div>
      <p><strong>${shop.business_name}</strong></p>
      <p style="margin:2px 0; font-size:14px;">${getFullAddress(shop)}</p>
      <p style="margin:2px 0; font-size:14px;">
        ${Number(shop.distanceKm) !== Infinity ? shop.distanceKm.toFixed(2) + ' km away' : 'Distance unknown'}
      </p>
      ${productList ? `<ul style="font-size:12px;text-align:left;padding-left:15px;margin:8px 0;">${productList}</ul>` : ''}
      <div style="display: flex; gap: 8px; justify-content: center; margin-top: 8px;">
        <button id="view-${shop.id}" 
                class="popup-btn view-btn"
                style="padding:6px 12px;background:#438fda;color:#fff;border:none;border-radius:6px;cursor:pointer;flex:1;">
          View Shop
        </button>
        <button id="route-${shop.id}" 
                class="popup-btn route-btn"
                style="padding:6px 12px;background:#10b981;color:#fff;border:none;border-radius:6px;cursor:pointer;flex:1;">
          Show Route
        </button>
      </div>
      ${!isShopCurrentlyOpen(shop) ? '<p style="color: #ef4444; font-size: 12px; margin-top: 4px;">Shop is currently closed</p>' : ''}
      ${shop.manual_status !== 'auto' ? '<p style="color: #f59e0b; font-size: 11px; margin-top: 2px;">⚡ Manual override</p>' : ''}
    </div>
  `
}

/* -------------------- ATTACH POPUP EVENT HANDLERS -------------------- */
const attachPopupEventHandlers = (popup: any, shopId: string) => {
  // Wait for popup to be added to DOM
  setTimeout(() => {
    const viewBtn = document.getElementById(`view-${shopId}`)
    const routeBtn = document.getElementById(`route-${shopId}`)

    if (viewBtn) {
      viewBtn.addEventListener('click', (e) => {
        e.stopPropagation()
        openShopDetails(shopId)
      })
    }

    if (routeBtn) {
      routeBtn.addEventListener('click', (e) => {
        e.stopPropagation()
        focusOnShopMarker(shopId)
      })
    }
  }, 100)
}

/* -------------------- MARKER MANAGEMENT -------------------- */
const clearShopMarkers = () => {
  shopMarkers.forEach((m) => {
    try {
      m.remove()
    } catch {}
  })
  shopMarkers = []
}

const plotShops = () => {
  if (!map.value || !mapboxgl) return
  clearShopMarkers()

  for (const shop of filteredShops.value) {
    if (shop.status !== 'approved') continue

    const lat = Number(shop.latitude)
    const lng = Number(shop.longitude)
    if (!isFinite(lat) || !isFinite(lng)) continue

    // Create custom marker
    const el = document.createElement('div')
    el.className = 'shop-marker'
    el.innerHTML = `
      <div class="shop-marker-inner" data-shop-id="${shop.id}">
        <svg width="28" height="40" viewBox="0 0 24 24" fill="#EF4444">
          <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
        </svg>
      </div>
    `

    const marker = new mapboxgl.Marker({
      element: el,
      anchor: 'bottom',
    })
      .setLngLat([lng, lat])
      .addTo(map.value)

    // Create popup
    const popup = new mapboxgl.Popup({
      offset: 25,
      closeButton: true,
      className: 'shop-popup',
    }).setHTML(createShopPopup(shop))

    // Attach event handlers to popup buttons
    popup.on('open', () => {
      attachPopupEventHandlers(popup, shop.id)
    })

    marker.setPopup(popup)

    // Store shop data
    marker.shopId = shop.id
    marker.shopData = shop
    shopMarkers.push(marker)

    // Add click handler to marker
    el.addEventListener('click', () => {
      marker.togglePopup()
    })
  }
}

/* -------------------- FOCUS ON SHOP MARKER -------------------- */
const focusOnShopMarker = async (shopId: string) => {
  console.log('Focusing on shop:', shopId)
  setErrorMessage(null)

  let marker = shopMarkers.find((m: any) => m.shopId === shopId)
  if (!marker) return

  const shop = marker.shopData
  if (!shop || !shop.latitude || !shop.longitude) {
    setErrorMessage('Shop location data is incomplete')
    return
  }

  const userLat = Number(latitude.value ?? lastKnown.value?.[0])
  const userLng = Number(longitude.value ?? lastKnown.value?.[1])

  if (!isFinite(userLat) || !isFinite(userLng)) {
    setErrorMessage('Your location is not available for routing')
    return
  }

  // Highlight the marker
  const markerEl = marker.getElement()
  if (markerEl) {
    markerEl.classList.add('shop-marker-highlighted')
    setTimeout(() => {
      markerEl.classList.remove('shop-marker-highlighted')
    }, 3000)
  }

  routeLoading.value = true

  try {
    // Clear any existing routes first
    clearAllRoutes()

    // Calculate routes from user to shop
    const start: [number, number] = [userLat, userLng]
    const end: [number, number] = [Number(shop.latitude), Number(shop.longitude)]

    console.log('Calculating routes from:', start, 'to:', end)

    // Get multiple route options
    const routes = await getRouteOptions(start, end)
    console.log('Route options received:', routes)

    if (routes.length === 0) {
      setErrorMessage('No routes found between your location and the shop')
      return
    }

    // Store all routes
    routeOptions.value = routes

    // Show route panel
    showRoutePanel.value = true

    // Set default route type to driving if available, otherwise first available
    const defaultType = routes.find((r) => r.type === 'driving') ? 'driving' : routes[0].type
    selectedRouteType.value = defaultType

    // Draw the default route
    const defaultRoute = routes.find((r) => r.type === defaultType) || routes[0]
    if (defaultRoute) {
      drawRoute(defaultRoute)
    }

    // Fly to shop
    map.value.flyTo({
      center: [end[1], end[0]],
      zoom: 14,
      essential: true,
      duration: 1000,
    })

    // Open popup
    if (marker.getPopup()) {
      marker.togglePopup()
    }

    setErrorMessage(`Found ${routes.length} route options`, 3000)
  } catch (error) {
    console.error('Error calculating routes:', error)
    setErrorMessage('Error calculating routes to shop', 3000)
  } finally {
    routeLoading.value = false
  }
}

/* -------------------- HELPERS -------------------- */
const getFullAddress = (shop: any) => {
  if (shop.detected_address) return shop.detected_address
  const parts = [
    shop.house_no,
    shop.building,
    shop.street,
    shop.barangay,
    shop.city,
    shop.province,
    shop.postal,
  ].filter(Boolean)
  if (parts.length) return parts.join(', ')
  if (shop.physical_store) return shop.physical_store
  return 'Address not available'
}

const convertTimeToNumber = (timeStr: string): number => {
  if (!timeStr) return 0
  const [hours, minutes] = timeStr.split(':').map(Number)
  return hours * 100 + minutes
}

const isShopCurrentlyOpen = (shop: any): boolean => {
  if (shop.manual_status === 'closed') return false
  if (shop.manual_status === 'open') return true
  return isShopOpenByHours(shop)
}

const getShopStatusDisplay = (shop: any): { text: string; color: string; tooltip: string } => {
  const isOpen = isShopCurrentlyOpen(shop)

  if (shop.manual_status === 'open') {
    return {
      text: 'OPEN',
      color: '#10b981',
      tooltip: 'Manually set to OPEN by seller',
    }
  }
  if (shop.manual_status === 'closed') {
    return {
      text: 'CLOSED',
      color: '#ef4444',
      tooltip: 'Manually set to CLOSED by seller',
    }
  }

  if (isOpen) {
    return {
      text: 'OPEN',
      color: '#10b981',
      tooltip: 'Open based on business hours',
    }
  } else {
    return {
      text: 'CLOSED',
      color: '#ef4444',
      tooltip: 'Closed based on business hours',
    }
  }
}

const isShopOpenByHours = (shop: any): boolean => {
  const now = new Date()
  const currentDay = now.getDay()
  const currentTime = now.getHours() * 100 + now.getMinutes()

  if (shop.open_days && shop.open_days.length > 0) {
    const adjustedDay = currentDay === 0 ? 7 : currentDay
    if (!shop.open_days.includes(adjustedDay)) {
      return false
    }
  }

  if (shop.open_time && shop.close_time) {
    const openTime = convertTimeToNumber(shop.open_time)
    const closeTime = convertTimeToNumber(shop.close_time)
    return currentTime >= openTime && currentTime <= closeTime
  }

  return true
}

/* -------------------- SEARCH FUNCTIONALITY -------------------- */
const smartSearch = async () => {
  const query = search.value.trim().toLowerCase()
  if (!query || !map.value) return

  loading.value = true
  errorMsg.value = null
  isSearchMode.value = true

  try {
    const searchResults = shops.value.filter((shop) => {
      const searchTerms = [
        shop.business_name?.toLowerCase(),
        shop.city?.toLowerCase(),
        shop.barangay?.toLowerCase(),
        shop.street?.toLowerCase(),
        shop.province?.toLowerCase(),
        ...(shop.products || []).map((p: any) => p.prod_name?.toLowerCase()),
      ].filter(Boolean)

      return searchTerms.some((term) => term && term.includes(query))
    })

    const sortedResults = searchResults.sort((a, b) => {
      const aNameMatch = a.business_name?.toLowerCase().includes(query)
      const bNameMatch = b.business_name?.toLowerCase().includes(query)

      if (aNameMatch && !bNameMatch) return -1
      if (!aNameMatch && bNameMatch) return 1

      const aProductMatches = getMatchingProducts(a).length
      const bProductMatches = getMatchingProducts(b).length

      if (aProductMatches !== bProductMatches) {
        return bProductMatches - aProductMatches
      }

      return (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity)
    })

    if (sortedResults.length === 0) {
      errorMsg.value = `No shops or products found for "${query}"`
      filteredShops.value = []
      showShopMenu.value = true
    } else {
      const matchTypes = {
        shops: sortedResults.filter(
          (shop) =>
            shop.business_name?.toLowerCase().includes(query) ||
            shop.city?.toLowerCase().includes(query),
        ).length,
        products: sortedResults.filter((shop) => getMatchingProducts(shop).length > 0).length,
      }

      errorMsg.value = `Found ${sortedResults.length} results (${matchTypes.shops} shops, ${matchTypes.products} with matching products)`
      filteredShops.value = sortedResults
      showShopMenu.value = true
      plotShops()

      if (sortedResults.length === 1) {
        await focusOnShopMarker(sortedResults[0].id)
      }
    }
  } catch (error) {
    console.error('Search failed:', error)
    errorMsg.value = 'Search failed. Please try again.'
  } finally {
    loading.value = false
  }
}

const clearSearch = () => {
  search.value = ''
  isSearchMode.value = false
  applyShopFilters()
  showShopMenu.value = false

  if (latitude.value && longitude.value) {
    map.value?.flyTo({
      center: [Number(longitude.value), Number(latitude.value)],
      zoom: 13,
      essential: true,
      duration: 1000,
    })
  }
}

const getMatchingProducts = (shop: any): any[] => {
  const query = search.value.trim().toLowerCase()
  if (!query || !shop.products) return []
  return shop.products.filter((product: any) => product.prod_name?.toLowerCase().includes(query))
}

const hasSearchMatch = (shop: any): boolean => {
  if (!isSearchMode.value || !search.value) return false
  const query = search.value.toLowerCase()
  return (
    shop.business_name?.toLowerCase().includes(query) ||
    shop.city?.toLowerCase().includes(query) ||
    shop.barangay?.toLowerCase().includes(query) ||
    getMatchingProducts(shop).length > 0
  )
}

const onSearchKeydown = (e: KeyboardEvent) => {
  if (e.key === 'Enter') smartSearch()
}

const toggleShopMenu = () => {
  showShopMenu.value = !showShopMenu.value
  if (showShopMenu.value && !isSearchMode.value) {
    applyShopFilters()
  }
}

/* -------------------- SHOP SELECTION -------------------- */
const handleShopClick = async (shopId: string, index: number) => {
  selectedShopId.value = shopId
  await focusOnShopFromList(shopId)
}

const focusOnShopFromList = async (shopId: string) => {
  console.log('Focusing on shop from list:', shopId)
  showShopMenu.value = false
  await new Promise((resolve) => setTimeout(resolve, 300))
  await focusOnShopMarker(shopId)
  setTimeout(() => {
    selectedShopId.value = null
  }, 2000)
}

const openShopDetails = async (shopId: string) => {
  const shop = shops.value.find((s) => s.id === shopId)
  if (!shop) return
  showShopMenu.value = false
  await new Promise((resolve) => setTimeout(resolve, 300))
  router.push(`/shop/${shopId}`)
}

/* -------------------- ERROR MESSAGE HANDLER -------------------- */
let errorTimeout: number | null = null

const setErrorMessage = (message: string | null, duration: number = 4000) => {
  if (errorTimeout) {
    clearTimeout(errorTimeout)
    errorTimeout = null
  }

  errorMsg.value = null

  if (message) {
    setTimeout(() => {
      errorMsg.value = message

      if (duration > 0) {
        errorTimeout = window.setTimeout(() => {
          errorMsg.value = null
        }, duration)
      }
    }, 50)
  }
}

/* -------------------- LIFECYCLE -------------------- */
onMounted(async () => {
  console.log('Mounting map component...')

  try {
    await initializeMap()

    if (Capacitor.getPlatform() !== 'web') await requestPermission()

    const pos = await Geolocation.getCurrentPosition({
      enableHighAccuracy: false,
      timeout: 10000,
    })
    const quickLat = pos.coords.latitude
    const quickLng = pos.coords.longitude

    console.log('Got location:', quickLat, quickLng)

    if (map.value) {
      createUserMarker(quickLat, quickLng)

      map.value.flyTo({
        center: [quickLng, quickLat],
        zoom: 14,
        essential: true,
        duration: 1000,
      })

      await highlightUserCityBoundary(quickLat, quickLng)
    }

    saveCachedLocation(quickLat, quickLng)

    setTimeout(() => {
      doFetchShops()
    }, 1000)
  } catch (err) {
    console.warn('Quick geolocation failed:', err)
    setErrorMessage('Location access failed. Using default location.', 3000)
    doFetchShops()
  }
})

watch(
  [latitude, longitude],
  async ([lat, lng]) => {
    if (!map.value || lat == null || lng == null) return

    const userLat = Number(lat)
    const userLng = Number(lng)

    if (!isFinite(userLat) || !isFinite(userLng)) return

    const now = Date.now()
    if (now - lastUpdateTs < 1000) {
      saveCachedLocation(userLat, userLng)
      return
    }
    lastUpdateTs = now

    hasValidLocation.value = true

    if (userMarker) {
      userMarker.setLngLat([userLng, userLat])
    } else {
      createUserMarker(userLat, userLng)
    }

    saveCachedLocation(userLat, userLng)
    await highlightUserCityBoundary(userLat, userLng)
    void doFetchShops()
  },
  { immediate: true },
)

onUnmounted(() => {
  stopWatching()
  if (map.value) {
    try {
      map.value.remove()
    } catch (e) {
      console.warn('Error removing map:', e)
    }
  }
})
</script>

<template>
  <v-app>
    <!-- Hero Section - Fixed positioning -->
    <v-sheet class="hero">
      <div class="hero-row">
        <v-text-field
          v-model="search"
          class="search-field"
          variant="solo"
          rounded="pill"
          hide-details
          clearable
          density="comfortable"
          placeholder="Looking for something?"
          append-inner-icon="mdi-magnify"
          @keydown="onSearchKeydown"
          @click:clear="clearSearch"
          @click:append-inner="smartSearch"
        />
        <v-btn
          class="search-btn"
          @click="smartSearch"
          :loading="loading"
          :disabled="!search.trim()"
          elevation="2"
        >
          <v-icon size="20">mdi-magnify</v-icon>
        </v-btn>
      </div>
    </v-sheet>

    <!-- Main Content Area -->
    <v-main class="main-content">
      <div id="map" class="map-container"></div>

      <!-- Boundary Loading Overlay -->
      <div v-if="boundaryLoading" class="boundary-loading">
        <v-progress-circular indeterminate color="primary" size="24"></v-progress-circular>
        <span>Detecting city boundary...</span>
      </div>

      <!-- Route Loading Overlay -->
      <div v-if="routeLoading" class="route-loading">
        <v-progress-circular indeterminate color="primary" size="32"></v-progress-circular>
        <span>Calculating routes...</span>
      </div>

      <!-- Route Selection Panel -->
      <v-card v-if="showRoutePanel" class="route-selection-panel" elevation="4">
        <v-card-title class="d-flex align-center justify-space-between py-2">
          <div class="d-flex align-center">
            <v-icon color="primary" class="mr-2">mdi-routes</v-icon>
            <span class="text-subtitle-1 font-weight-bold">Route Options</span>
          </div>
          <v-btn icon size="small" @click="clearAllRoutes" variant="text" title="Close route panel">
            <v-icon>mdi-close</v-icon>
          </v-btn>
        </v-card-title>

        <v-card-text class="py-3">
          <div class="route-buttons-grid">
            <v-btn
              v-for="type in ['driving', 'walking', 'cycling'] as RouteType[]"
              :key="type"
              :color="
                selectedRouteType === type ? routeConfig[type].activeColor : routeConfig[type].color
              "
              variant="flat"
              class="route-type-btn"
              @click="selectRouteType(type)"
              :disabled="!routeOptions.find((r) => r.type === type)"
            >
              <v-icon start>{{ routeConfig[type].icon }}</v-icon>
              {{ routeConfig[type].label }}
              <template v-if="routeOptions.find((r) => r.type === type)">
                <v-spacer></v-spacer>
                <span class="ml-2 text-caption">
                  {{ Math.round(routeOptions.find((r) => r.type === type)!.duration / 60) }} min
                </span>
              </template>
            </v-btn>
          </div>

          <!-- Route Info -->
          <div
            v-if="routeOptions.find((r) => r.type === selectedRouteType)"
            class="route-info mt-3"
          >
            <v-divider class="my-2"></v-divider>
            <div class="d-flex justify-space-between align-center">
              <div>
                <div class="text-caption text-medium-emphasis">Distance</div>
                <div class="text-body-1 font-weight-medium">
                  {{
                    (
                      routeOptions.find((r) => r.type === selectedRouteType)!.distance / 1000
                    ).toFixed(1)
                  }}
                  km
                </div>
              </div>
              <div>
                <div class="text-caption text-medium-emphasis">Duration</div>
                <div class="text-body-1 font-weight-medium">
                  {{
                    Math.round(
                      routeOptions.find((r) => r.type === selectedRouteType)!.duration / 60,
                    )
                  }}
                  minutes
                </div>
              </div>
            </div>
          </div>
        </v-card-text>
      </v-card>

      <!-- Map Controls Container -->
      <div class="map-controls-container" v-if="!showShopMenu && !showRoutePanel">
        <!-- Display Mode Chip -->
        <v-chip
          v-if="userCity"
          :color="shopDisplayMode === 'within' ? 'green' : 'orange'"
          size="small"
          class="mode-chip"
        >
          <v-icon small class="mr-1">
            {{ shopDisplayMode === 'within' ? 'mdi-checkbox-marked-circle' : 'mdi-arrow-expand' }}
          </v-icon>
          {{ shopDisplayMode === 'within' ? 'Within' : 'Outside' }} {{ userCity }}
        </v-chip>

        <div class="map-controls-group">
          <!-- Shop Menu Toggle -->
          <v-btn icon @click="toggleShopMenu" class="control-btn" title="Show shops list">
            <v-icon>mdi-store</v-icon>
          </v-btn>

          <!-- Display Mode Menu -->
          <v-menu location="top" transition="scale-transition" color="#ffffff">
            <template #activator="{ props }">
              <v-btn icon v-bind="props" title="Display Options" class="control-btn">
                <v-icon>mdi-filter</v-icon>
              </v-btn>
            </template>
            <v-list>
              <v-list-item @click="toggleDisplayMode('within')">
                <v-list-item-title>
                  <v-icon color="green" class="mr-2">mdi-checkbox-marked-circle</v-icon>
                  Show Shops Within City
                </v-list-item-title>
                <v-list-item-subtitle
                  >Display shops located in {{ userCity || 'your city' }}</v-list-item-subtitle
                >
              </v-list-item>
              <v-list-item @click="toggleDisplayMode('outside')">
                <v-list-item-title>
                  <v-icon color="orange" class="mr-2">mdi-arrow-expand</v-icon>
                  Show Shops Outside City
                </v-list-item-title>
                <v-list-item-subtitle
                  >Display shops outside {{ userCity || 'your city' }}</v-list-item-subtitle
                >
              </v-list-item>
              <v-divider></v-divider>
              <v-list-item @click="toggleBoundaryVisibility">
                <v-list-item-title>
                  <v-icon :color="showBoundary ? 'green' : 'grey'" class="mr-2">
                    {{ showBoundary ? 'mdi-eye' : 'mdi-eye-off' }}
                  </v-icon>
                  {{ showBoundary ? 'Hide' : 'Show' }} City Boundary
                </v-list-item-title>
              </v-list-item>
            </v-list>
          </v-menu>

          <!-- Recenter Button -->
          <v-btn
            icon
            :loading="locating"
            @click="recenterToUser"
            :disabled="!hasValidLocation && !lastKnown"
            :title="hasValidLocation ? 'Recenter to my location' : 'Location not available'"
            class="control-btn"
          >
            <v-icon :color="hasValidLocation ? 'primary' : 'grey'">mdi-crosshairs-gps</v-icon>
          </v-btn>
        </div>
      </div>

      <!-- Error Message Alert -->
      <v-alert
        v-if="errorMsg"
        type="info"
        class="route-info-alert"
        @click="setErrorMessage(null)"
        style="cursor: pointer"
      >
        <div class="d-flex justify-center align-center">
          <span class="alert-text">{{ errorMsg }}</span>
          <v-btn icon size="small" @click.stop="setErrorMessage(null)" class="ml-2">
            <v-icon>mdi-close</v-icon>
          </v-btn>
        </div>
      </v-alert>
    </v-main>

    <!-- Shop Menu Drawer -->
    <v-navigation-drawer v-model="showShopMenu" location="right" temporary width="400">
      <v-card class="h-100 d-flex flex-column">
        <!-- Header -->
        <v-card-title class="d-flex align-center bg-blue-lighten-5">
          <v-icon color="primary" class="mr-2">mdi-store</v-icon>
          <span class="text-h6 font-weight-bold">
            {{ isSearchMode ? 'Search Results' : 'Shops & Products' }}
          </span>
          <v-spacer></v-spacer>
          <v-btn icon @click="showShopMenu = false" variant="text" size="small">
            <v-icon>mdi-close</v-icon>
          </v-btn>
        </v-card-title>

        <!-- Search Stats -->
        <v-card-subtitle v-if="isSearchMode && search" class="pt-3 pb-2">
          <div class="d-flex align-center justify-space-between">
            <span class="text-caption text-medium-emphasis">
              Found {{ filteredShops.length }} results for "{{ search }}"
            </span>
            <v-btn size="x-small" variant="text" @click="clearSearch" class="text-caption">
              Clear
            </v-btn>
          </div>
        </v-card-subtitle>

        <!-- Display Mode Toggle -->
        <v-card-text v-if="!isSearchMode && userCity" class="pt-2 pb-3">
          <v-btn-group variant="outlined" class="w-100">
            <v-btn
              :color="shopDisplayMode === 'within' ? 'primary' : undefined"
              @click="toggleDisplayMode('within')"
              size="small"
              class="flex-grow-1"
            >
              <v-icon start size="small">mdi-checkbox-marked-circle</v-icon>
              Within {{ userCity }}
            </v-btn>
            <v-btn
              :color="shopDisplayMode === 'outside' ? 'orange' : undefined"
              @click="toggleDisplayMode('outside')"
              size="small"
              class="flex-grow-1"
            >
              <v-icon start size="small">mdi-arrow-expand</v-icon>
              Outside {{ userCity }}
            </v-btn>
          </v-btn-group>
        </v-card-text>

        <!-- Loading State -->
        <v-card-text v-if="loading" class="text-center py-8">
          <v-progress-circular indeterminate color="primary"></v-progress-circular>
          <div class="text-caption text-medium-emphasis mt-2">Loading shops...</div>
        </v-card-text>

        <!-- Empty State -->
        <v-card-text v-else-if="filteredShops.length === 0" class="text-center py-8">
          <v-icon size="64" color="grey-lighten-1">mdi-store-off-outline</v-icon>
          <div class="text-h6 text-grey mt-2">No shops found</div>
          <div class="text-caption text-medium-emphasis mt-1">
            {{ isSearchMode ? 'Try a different search term' : 'No shops in this area' }}
          </div>
        </v-card-text>

        <!-- Shop List -->
        <v-card-text v-else class="pa-0 flex-grow-1" style="overflow-y: auto">
          <v-list density="comfortable" class="pa-0">
            <v-list-item
              v-for="(shop, index) in filteredShops"
              :key="shop.id"
              @click="handleShopClick(shop.id, index)"
              class="mb-2 shop-list-item"
              :class="{
                'bg-blue-lighten-5': isSearchMode && hasSearchMatch(shop),
                'selected-shop': selectedShopId === shop.id,
              }"
            >
              <template #prepend>
                <div class="position-relative">
                  <v-avatar size="56" rounded class="elevation-1">
                    <v-img
                      :src="
                        shop.logo_url ||
                        shop.physical_store ||
                        'https://placehold.co/80x80?text=Shop'
                      "
                      :alt="shop.business_name"
                      cover
                    />
                  </v-avatar>
                  <!-- Status Badge -->
                  <div
                    class="status-badge"
                    :class="isShopCurrentlyOpen(shop) ? 'bg-green' : 'bg-red'"
                  >
                    <v-icon size="12" color="white">
                      {{ isShopCurrentlyOpen(shop) ? 'mdi-check' : 'mdi-close' }}
                    </v-icon>
                  </div>
                </div>
              </template>

              <v-list-item-title class="d-flex align-center mb-1">
                <span class="font-weight-medium text-body-1">{{ shop.business_name }}</span>
                <v-chip
                  :color="isShopCurrentlyOpen(shop) ? 'green' : 'red'"
                  size="x-small"
                  class="ml-2"
                  density="compact"
                >
                  {{ isShopCurrentlyOpen(shop) ? 'OPEN' : 'CLOSED' }}
                </v-chip>
                <v-spacer></v-spacer>
                <v-icon
                  v-if="isSearchMode && hasSearchMatch(shop)"
                  size="16"
                  color="primary"
                  title="Search match"
                >
                  mdi-magnify
                </v-icon>
              </v-list-item-title>

              <v-list-item-subtitle class="text-caption">
                <!-- Address -->
                <div class="d-flex align-center mb-1">
                  <v-icon size="14" class="mr-1">mdi-map-marker</v-icon>
                  <span>{{ getFullAddress(shop) }}</span>
                </div>

                <!-- Distance -->
                <div class="d-flex align-center mb-1">
                  <v-icon size="14" class="mr-1">mdi-navigation</v-icon>
                  <span>
                    {{
                      Number(shop.distanceKm) !== Infinity
                        ? shop.distanceKm.toFixed(1) + ' km away'
                        : 'Distance unknown'
                    }}
                  </span>
                </div>

                <!-- Matching Products (if in search mode) -->
                <div
                  v-if="isSearchMode && getMatchingProducts(shop).length > 0"
                  class="matching-products mt-1"
                >
                  <v-chip
                    v-for="product in getMatchingProducts(shop).slice(0, 2)"
                    :key="product.id"
                    size="x-small"
                    variant="outlined"
                    color="primary"
                    class="mr-1 mb-1"
                    density="compact"
                  >
                    <v-icon start size="12">mdi-package-variant</v-icon>
                    {{ product.prod_name }}
                  </v-chip>
                  <span
                    v-if="getMatchingProducts(shop).length > 2"
                    class="text-caption text-medium-emphasis"
                  >
                    +{{ getMatchingProducts(shop).length - 2 }} more
                  </span>
                </div>

                <!-- Shop Hours -->
                <div v-if="shop.open_time && shop.close_time" class="d-flex align-center mt-1">
                  <v-icon size="14" class="mr-1">mdi-clock-outline</v-icon>
                  <span class="text-caption"> {{ shop.open_time }} - {{ shop.close_time }} </span>
                </div>
              </v-list-item-subtitle>

              <template #append>
                <div class="d-flex flex-column align-center gap-1">
                  <v-btn
                    icon
                    variant="text"
                    size="small"
                    @click.stop="openShopDetails(shop.id)"
                    title="View shop details"
                    color="primary"
                  >
                    <v-icon>mdi-information</v-icon>
                  </v-btn>
                  <v-btn
                    icon
                    variant="text"
                    size="small"
                    @click.stop="focusOnShopFromList(shop.id)"
                    title="Show on map"
                    color="green"
                  >
                    <v-icon>mdi-map-marker</v-icon>
                  </v-btn>
                </div>
              </template>
            </v-list-item>
          </v-list>
        </v-card-text>

        <!-- Footer Actions -->
        <v-card-actions v-if="filteredShops.length > 0" class="bg-grey-lighten-4">
          <v-btn
            variant="text"
            block
            @click="recenterToUser"
            :loading="locating"
            prepend-icon="mdi-crosshairs-gps"
          >
            Recenter Map
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-navigation-drawer>

    <BottomNav v-model="activeTab" />
  </v-app>
</template>

<style scoped>
/* Main layout */
.v-application {
  height: 100vh;
  overflow: hidden;
}

.main-content {
  position: relative;
  height: calc(100vh - 120px) !important;
  margin: 0 !important;
  padding: 0 !important;
}

.map-container {
  width: 100%;
  height: 100%;
  position: absolute;
  top: 0;
  left: 0;
  z-index: 1;
}

/* Hero section */
.hero {
  background: #3f83c7;
  border-radius: 0;
  padding: 12px 16px;
  margin: 0;
  width: 100%;
  position: relative;
  z-index: 10;
  min-height: 64px;
  box-sizing: border-box;
}

.hero-row {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
}

.search-field {
  flex: 1;
}

.search-field :deep(.v-field) {
  background: #fff !important;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.06);
}

.search-btn {
  background: #1d4ed8 !important;
  color: white !important;
  min-width: 60px !important;
  width: 60px !important;
  height: 60px !important;
  box-shadow: 0 4px 14px rgba(16, 185, 129, 0.4) !important;
  border: none;
  transition: all 0.3s ease !important;
  border-radius: 50% !important;
}

.search-btn:hover:not(.v-btn--disabled) {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(16, 185, 129, 0.5) !important;
}

/* Route Selection Panel */
.route-selection-panel {
  position: absolute;
  top: 20px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 2000;
  width: 90%;
  max-width: 400px;
  background: white;
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.9);
  animation: slideDown 0.3s ease-out;
}

@keyframes slideDown {
  from {
    opacity: 0;
    transform: translate(-50%, -20px);
  }
  to {
    opacity: 1;
    transform: translate(-50%, 0);
  }
}

.route-buttons-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}

.route-type-btn {
  height: 44px !important;
  text-transform: none;
  font-weight: 600;
  transition: all 0.2s ease;
}

.route-type-btn:hover:not(.v-btn--disabled) {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.route-info {
  background: #f8fafc;
  border-radius: 8px;
  padding: 12px;
}

/* Map Controls */
.map-controls-container {
  position: absolute;
  bottom: 100px;
  right: 20px;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 8px;
  z-index: 2000;
  pointer-events: none;
}

.map-controls-group {
  display: flex;
  flex-direction: column;
  gap: 10px;
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(10px);
  border-radius: 20px;
  padding: 10px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
  border: 1px solid rgba(255, 255, 255, 0.9);
  pointer-events: auto;
}

.mode-chip {
  font-weight: 600;
  padding: 8px 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
  backdrop-filter: blur(10px);
  border: none;
  margin-bottom: 8px;
  align-self: center;
  cursor: pointer;
  transition: all 0.3s ease;
  pointer-events: auto;
}

.mode-chip:hover {
  transform: scale(1.05);
}

.control-btn {
  background: white !important;
  box-shadow: 0 3px 12px rgba(0, 0, 0, 0.15) !important;
  width: 48px !important;
  height: 48px !important;
  border: 1px solid #e2e8f0 !important;
  transition: all 0.3s ease !important;
}

.control-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.2) !important;
  background: #f8fafc !important;
}

/* Loading Overlays */
.boundary-loading {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background: rgba(255, 255, 255, 0.95);
  padding: 16px 24px;
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
  display: flex;
  align-items: center;
  gap: 12px;
  z-index: 2500;
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.8);
  font-weight: 500;
  color: #1f2937;
}

.route-loading {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background: rgba(255, 255, 255, 0.98);
  padding: 24px;
  border-radius: 16px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.2);
  display: flex;
  align-items: center;
  gap: 16px;
  z-index: 3000;
  backdrop-filter: blur(20px);
}

/* Error Message Alert */
.route-info-alert {
  position: absolute;
  top: 60px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 2000;
  width: 90%;
  max-width: 500px;
  margin: 0;
  padding: 8px 16px;
}

.route-info-alert .d-flex {
  min-height: 32px;
}

.alert-text {
  flex: 1;
  text-align: center;
  margin: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* Status badge */
.status-badge {
  position: absolute;
  top: -4px;
  right: -4px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2px solid white;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
}

/* Custom Marker Styles */
:deep(.user-marker) {
  position: relative;
  width: 50px;
  height: 50px;
}

.user-marker-pulse {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 30px;
  height: 30px;
  background: #3b82f6;
  border-radius: 50%;
  opacity: 0.6;
  animation: pulse 2s infinite;
}

.user-marker-inner {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 24px;
  height: 24px;
  background: white;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
}

:deep(.shop-marker) {
  cursor: pointer;
  transition: all 0.3s ease;
}

.shop-marker-inner {
  filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.3));
  transition: all 0.3s ease;
}

.shop-marker:hover .shop-marker-inner,
.shop-marker-highlighted .shop-marker-inner {
  transform: scale(1.2);
  filter: drop-shadow(0 4px 8px rgba(0, 0, 0, 0.4));
}

/* Popup Button Styles */
:deep(.popup-btn) {
  transition: all 0.2s ease !important;
  font-weight: 600 !important;
  cursor: pointer !important;
}

:deep(.popup-btn:hover:not(:disabled)) {
  transform: translateY(-2px) !important;
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2) !important;
}

:deep(.popup-btn:disabled) {
  opacity: 0.5 !important;
  cursor: not-allowed !important;
}

:deep(.view-btn:hover) {
  background: #2c7ac2 !important;
}

:deep(.route-btn:hover:not(:disabled)) {
  background: #0da271 !important;
}

/* Mapbox Popup Customization */
:deep(.mapboxgl-popup-content) {
  padding: 12px !important;
  border-radius: 12px !important;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2) !important;
}

:deep(.mapboxgl-popup-close-button) {
  font-size: 20px !important;
  padding: 4px 8px !important;
}

/* Animation for search matches */
.bg-blue-lighten-5 {
  transition: all 0.3s ease;
  animation: highlight-pulse 2s ease-in-out;
}

@keyframes pulse {
  0% {
    transform: translate(-50%, -50%) scale(1);
    opacity: 0.6;
  }
  70% {
    transform: translate(-50%, -50%) scale(1.5);
    opacity: 0;
  }
  100% {
    transform: translate(-50%, -50%) scale(1);
    opacity: 0;
  }
}

@keyframes highlight-pulse {
  0% {
    background-color: #f1f5f9;
  }
  50% {
    background-color: #dbeafe;
  }
  100% {
    background-color: #f1f5f9;
  }
}

/* Shop List Item */
.shop-list-item {
  transition: all 0.3s ease;
  border-radius: 8px;
  margin: 4px 8px;
  border: 2px solid transparent;
  cursor: pointer;
}

.shop-list-item:hover {
  background-color: #f1f5f9;
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  border-color: #e2e8f0;
}

.selected-shop {
  background-color: #dbeafe !important;
  border-color: #3b82f6 !important;
  transform: scale(1.02);
  box-shadow: 0 6px 20px rgba(59, 130, 246, 0.3) !important;
}

/* Mobile Optimizations */
@media (max-width: 768px) {
  .hero {
    padding: 12px;
    padding-top: max(12px, env(safe-area-inset-top));
    padding-bottom: 12px;
  }

  .hero-row {
    gap: 8px;
  }

  .main-content {
    height: calc(100vh - 120px - env(safe-area-inset-top)) !important;
  }

  .route-selection-panel {
    top: 15px;
    width: 95%;
  }

  .route-buttons-grid {
    grid-template-columns: 1fr;
    gap: 6px;
  }

  .route-type-btn {
    height: 40px !important;
    font-size: 14px;
  }

  .map-controls-container {
    bottom: calc(100px + env(safe-area-inset-bottom));
    right: max(12px, env(safe-area-inset-right));
  }

  .control-btn {
    width: 44px !important;
    height: 44px !important;
  }

  .route-info-alert {
    top: 50px;
    width: 95%;
    padding: 6px 12px;
    font-size: 14px;
  }

  .v-navigation-drawer {
    width: 100vw !important;
    max-width: 400px;
  }

  .shop-list-item {
    margin: 2px 4px;
  }
}

/* Extra small devices */
@media (max-width: 480px) {
  .search-field {
    font-size: 14px;
  }

  .search-btn {
    min-width: 50px !important;
    width: 50px !important;
    height: 50px !important;
  }

  .mode-chip {
    font-size: 12px;
    padding: 6px 10px;
  }

  .route-info-alert {
    font-size: 13px;
    padding: 4px 8px;
  }
}

/* Landscape orientation adjustments */
@media (max-height: 600px) and (orientation: landscape) {
  .hero {
    padding: 8px 12px;
    min-height: 56px;
  }

  .main-content {
    height: calc(100vh - 100px) !important;
  }

  .route-selection-panel {
    top: 10px;
  }

  .map-controls-container {
    bottom: 80px;
  }
}
</style>
