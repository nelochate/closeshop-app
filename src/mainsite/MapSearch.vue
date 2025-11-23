<script setup lang="ts">
import { ref, onMounted, watch, onUnmounted, nextTick } from 'vue'
import L from 'leaflet'
import { useRouter } from 'vue-router'
import { useGeolocation } from '@/composables/useGeolocation'
import { Capacitor } from '@capacitor/core'
import { supabase } from '@/utils/supabase'
import BottomNav from '@/common/layout/BottomNav.vue'
import { Geolocation } from '@capacitor/geolocation'

/* -------------------- MAPBOX CONFIG -------------------- */
const MAPBOX_ACCESS_TOKEN = 'pk.eyJ1IjoiY2xvc2VzaG9wIiwiYSI6ImNtaDI2emxocjEwdnVqMHExenFpam42bjcifQ.QDsWVOHM9JPhPQ---Ca4MA'

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
const cityBoundaryLayer = ref<L.GeoJSON | null>(null)
const cityBoundaryPolygon = ref<L.Polygon | null>(null)
const map = ref<L.Map | null>(null)
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

/* -------------------- GEOLOCATION -------------------- */
const { latitude, longitude, requestPermission, startWatching, stopWatching } = useGeolocation()
let userMarker: L.Marker | null = null
let shopMarkers: L.Marker[] = []
const locating = ref(false)
let fetchTimeout: number | null = null

/* -------------------- ICONS -------------------- */
const userIcon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
})

const registeredShopIcon = L.icon({
  iconUrl: 'https://cdn.jsdelivr.net/gh/pointhi/leaflet-color-markers@master/img/marker-icon-red.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
})

/* -------------------- MAP INITIALIZATION -------------------- */
const initializeMap = (): Promise<void> => {
  return new Promise((resolve) => {
    if (map.value) {
      try {
        map.value.remove()
      } catch (e) {
        console.warn('Error removing existing map:', e)
      }
      map.value = null
    }

    nextTick(() => {
      try {
        const mapContainer = document.getElementById('map')
        if (!mapContainer) {
          console.error('Map container not found')
          resolve()
          return
        }

        // Clear container
        mapContainer.innerHTML = ''

        map.value = L.map('map', {
          center: [8.95, 125.53], // Default center (Philippines)
          zoom: 13,
          zoomControl: false,
          attributionControl: true,
          fadeAnimation: true,
          markerZoomAnimation: true,
        })

        // Add tile layer
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '© OpenStreetMap contributors',
          maxZoom: 19,
        }).addTo(map.value)

        // Add zoom control
        L.control.zoom({
          position: 'topright'
        }).addTo(map.value)

        // Load cached location
        loadCachedLocation()
        const placeholder = lastKnown.value ?? [8.95, 125.53]

        // Create user marker
        userMarker = L.marker(placeholder, { 
          icon: userIcon,
          zIndexOffset: 1000 
        }).addTo(map.value)
          .bindPopup(lastKnown.value ? 'Last known location' : 'Locating you...')

        // Force map resize
        setTimeout(() => {
          map.value?.invalidateSize(true)
          mapInitialized.value = true
          console.log('Map initialized successfully')
          resolve()
        }, 100)

      } catch (error) {
        console.error('Error initializing map:', error)
        resolve()
      }
    })
  })
}

/* -------------------- CITY BOUNDARY DETECTION -------------------- */
const detectUserCity = async (lat: number, lng: number): Promise<string | null> => {
  try {
    console.log('Detecting city for:', lat, lng)
    
    const response = await fetch(
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?types=place&access_token=${MAPBOX_ACCESS_TOKEN}`
    )
    
    if (!response.ok) {
      throw new Error(`Geocoding failed: ${response.status}`)
    }
    
    const data = await response.json()
    console.log('Geocoding response:', data)
    
    if (data.features && data.features.length > 0) {
      // Find city feature
      const cityFeature = data.features.find((feature: any) => 
        feature.place_type.includes('place') || 
        feature.place_type.includes('locality')
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

const fetchCityBoundary = async (cityName: string): Promise<any> => {
  try {
    console.log('Fetching boundary for:', cityName)
    
    // Use OpenStreetMap Nominatim for boundary data
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(cityName)}&format=json&polygon_geojson=1&limit=1`
    )
    
    if (!response.ok) throw new Error('Boundary fetch failed')
    
    const data = await response.json()
    console.log('Boundary data:', data)
    
    if (data && data.length > 0 && data[0].geojson) {
      return {
        type: 'Feature',
        geometry: data[0].geojson,
        properties: {
          name: cityName,
          display_name: data[0].display_name
        }
      }
    }
    
    // Fallback: Create circular boundary
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
      Math.cos(latRad) * Math.sin(angularDistance) * Math.cos(bearing)
    )
    
    const newLng = lngRad + Math.atan2(
      Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(latRad),
      Math.cos(angularDistance) - Math.sin(latRad) * Math.sin(newLat)
    )
    
    coordinates.push([
      (newLat * 180) / Math.PI,
      (newLng * 180) / Math.PI
    ])
  }
  
  coordinates.push(coordinates[0]) // Close polygon
  
  return {
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      coordinates: [coordinates]
    },
    properties: {
      name: 'Approximate Area',
      isFallback: true
    }
  }
}

const highlightUserCityBoundary = async (lat: number, lng: number) => {
  if (!map.value) {
    console.error('Map not available for boundary highlighting')
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
    const boundaryData = await fetchCityBoundary(detectedCity)
    
    if (!boundaryData) {
      console.warn('Could not fetch boundary data')
      setErrorMessage('Could not load city boundary. Showing all shops.', 3000)
      boundaryLoading.value = false
      return
    }
    
    // Create and style the boundary layer
    cityBoundaryLayer.value = L.geoJSON(boundaryData, {
      style: {
        fillColor: '#3b82f6',
        fillOpacity: 0.1,
        color: '#3b82f6',
        weight: 3,
        opacity: 0.8,
        dashArray: '10, 10',
        className: 'city-boundary'
      },
      onEachFeature: (feature, layer) => {
        if (feature.properties) {
          const popupContent = feature.properties.isFallback 
            ? `<div style="text-align: center;">
                 <strong>${feature.properties.name}</strong><br>
                 <small>Approximate boundary (5km radius)</small>
               </div>`
            : `<div style="text-align: center;">
                 <strong>${feature.properties.name}</strong><br>
                 <small>${feature.properties.display_name || ''}</small>
               </div>`
          
          layer.bindPopup(popupContent)
        }
      }
    }).addTo(map.value)

    // Store the polygon for spatial queries
    const layers = cityBoundaryLayer.value.getLayers()
    if (layers.length > 0 && layers[0] instanceof L.Polygon) {
      cityBoundaryPolygon.value = layers[0] as L.Polygon
    }

    // Fit map to show boundary and user location
    const bounds = cityBoundaryLayer.value.getBounds()
    if (bounds.isValid()) {
      bounds.extend([lat, lng]) // Include user location
      map.value.fitBounds(bounds.pad(0.1), {
        animate: true,
        duration: 1,
        maxZoom: 15,
        padding: [20, 20]
      })
    } else {
      // Fallback: Center on user
      map.value.setView([lat, lng], 14, { animate: true, duration: 1 })
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
  if (cityBoundaryLayer.value) {
    map.value?.removeLayer(cityBoundaryLayer.value)
    cityBoundaryLayer.value = null
  }
  
  if (cityBoundaryPolygon.value) {
    map.value?.removeLayer(cityBoundaryPolygon.value)
    cityBoundaryPolygon.value = null
  }
  
  userCity.value = null
  setErrorMessage('City boundary cleared')
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

  // If we have a boundary polygon, use bounds check
  if (cityBoundaryPolygon.value) {
    const shopPoint = L.latLng(shopLat, shopLng)
    const bounds = cityBoundaryPolygon.value.getBounds()
    return bounds.contains(shopPoint)
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
  if (!map.value) return

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
      userMarker.setLatLng([targetLat, targetLng])
      userMarker.setPopupContent('You are here')
    }

    // Center map
    map.value.setView([targetLat, targetLng], 16, {
      animate: true,
      duration: 0.5,
    })

    // Save and refresh boundary
    saveCachedLocation(targetLat, targetLng)
    await highlightUserCityBoundary(targetLat, targetLng)
    
  } catch (error) {
    console.error('Error recentering:', error)
    errorMsg.value = 'Failed to recenter map'
  } finally {
    locating.value = false
  }
}

/* -------------------- ROUTE MANAGEMENT -------------------- */
let currentRouteLayers: L.Polyline[] = []
let currentRouteMarkers: L.Marker[] = []
const selectedRouteIndex = ref<number | null>(null)
const routeOptions = ref<RouteOption[]>([])
const showRouteMenu = ref(false)

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
      { type: 'driving' as const, color: '#3b82f6', name: 'Driving' },
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
    driving: 'Driving',
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
    summary: `${typeNames[type]} Route (Fallback)`,
    color: colors[type],
    type,
  }
}

/* -------------------- DRAW MULTIPLE ROUTES -------------------- */
const drawRouteOptions = (routes: RouteOption[]) => {
  if (!map.value || !routes.length) return

  clearAllRoutes()

  routes.forEach((route, index) => {
    try {
      const routeLayer = L.polyline(route.coords, {
        color: route.color,
        weight: index === 0 ? 6 : 4,
        opacity: 0.8,
        lineCap: 'round',
        lineJoin: 'round',
        className: `route-line route-${index}`,
      }).addTo(map.value)

      routeLayer.on('click', (e) => {
        selectRoute(index)
        routeLayer.bringToFront()
      })

      routeLayer.on('mouseover', function () {
        this.setStyle({
          weight: this.options.weight + 2,
          opacity: 1,
        })
        routeLayer.bringToFront()
      })

      routeLayer.on('mouseout', function () {
        const isSelected = selectedRouteIndex.value === index
        this.setStyle({
          weight: isSelected ? 8 : index === 0 ? 6 : 4,
          opacity: isSelected ? 1 : 0.8,
        })
      })

      currentRouteLayers.push(routeLayer)

      const distanceKm = (route.distance / 1000).toFixed(1)
      const durationMin = Math.round(route.duration / 60)

      const midpointIndex = Math.floor(route.coords.length / 2)
      if (midpointIndex < route.coords.length) {
        const midpoint = route.coords[midpointIndex]

        const typeIcons = {
          driving: '🚗',
          walking: '🚶',
          cycling: '🚴',
        }

        const infoMarker = L.marker(midpoint, {
          icon: L.divIcon({
            html: `
              <div style="
                background: ${route.color};
                color: white;
                padding: 8px 12px;
                border-radius: 20px;
                font-size: 12px;
                font-weight: bold;
                white-space: nowrap;
                box-shadow: 0 4px 12px rgba(0,0,0,0.3);
                border: 3px solid white;
                backdrop-filter: blur(4px);
                text-align: center;
              ">
                <div>${typeIcons[route.type]} ${route.summary}</div>
                <div style="font-size: 10px; opacity: 0.9;">
                  ${distanceKm} km • ${durationMin} min
                </div>
                ${index === 0 ? '<div style="font-size: 9px; color: #fef08a;">★ FASTEST</div>' : ''}
              </div>
            `,
            className: 'route-info-marker',
            iconSize: [100, 50],
            iconAnchor: [50, 25],
          }),
        }).addTo(map.value)

        currentRouteMarkers.push(infoMarker)
      }
    } catch (error) {
      console.error('Error drawing route:', error)
    }
  })

  selectRoute(0)

  const bounds = L.latLngBounds(routes.flatMap((route) => route.coords))
  if (bounds.isValid()) {
    map.value.fitBounds(bounds.pad(0.15), {
      animate: false,
      padding: [30, 30],
    })
  }
}

/* -------------------- SELECT ROUTE -------------------- */
const selectRoute = (index: number) => {
  selectedRouteIndex.value = index
  const route = routeOptions.value[index]

  if (!route || !map.value) return

  const distanceKm = (route.distance / 1000).toFixed(1)
  const durationMin = Math.round(route.duration / 60)

  const typeIcons = {
    driving: '🚗',
    walking: '🚶',
    cycling: '🚴',
  }

  setErrorMessage(
    `Selected: ${typeIcons[route.type]} ${route.summary} • ${distanceKm} km • ${durationMin} min • Click other routes to compare`,
  )
}

/* -------------------- CLEAR ALL ROUTES -------------------- */
const clearAllRoutes = () => {
  currentRouteLayers.forEach((layer) => {
    if (map.value && map.value.hasLayer(layer)) {
      map.value.removeLayer(layer)
    }
  })
  currentRouteMarkers.forEach((marker) => {
    if (map.value && map.value.hasLayer(marker)) {
      map.value.removeLayer(marker)
    }
  })
  currentRouteLayers = []
  currentRouteMarkers = []
  routeOptions.value = []
  selectedRouteIndex.value = null
  showRouteMenu.value = false
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

/* -------------------- MARKER MANAGEMENT -------------------- */
const clearShopMarkers = () => {
  shopMarkers.forEach((m) => {
    try {
      map.value?.removeLayer(m)
    } catch {}
  })
  shopMarkers = []
}

const plotShops = () => {
  if (!map.value) return
  clearShopMarkers()

  for (const shop of filteredShops.value) {
    if (shop.status !== 'approved') continue

    const lat = Number(shop.latitude)
    const lng = Number(shop.longitude)
    if (!isFinite(lat) || !isFinite(lng)) continue

    const marker = L.marker([lat, lng], {
      icon: registeredShopIcon,
      title: shop.business_name,
    }) as any

    marker.shopId = shop.id
    marker.shopData = shop
    marker.addTo(map.value)

    const productList = (shop.products || [])
      .map((p: any) => `<li>${p.prod_name} - ₱${p.price}</li>`)
      .join('')

    marker.bindPopup(`
      <div style="text-align:center; min-width: 220px;">
        <img src="${shop.physical_store || shop.logo_url || 'https://placehold.co/80x80'}" width="80" height="80" style="border-radius:8px;object-fit:cover;margin-bottom:6px;" />
        <p><strong>${shop.business_name}</strong></p>
        <p style="margin:2px 0; font-size:14px;">${getFullAddress(shop)}</p>
        <p style="margin:2px 0; font-size:14px;">${Number(shop.distanceKm) !== Infinity ? shop.distanceKm.toFixed(2) + ' km away' : 'Distance unknown'}</p>
        ${productList ? `<ul style="font-size:12px;text-align:left;padding-left:15px;margin:8px 0;">${productList}</ul>` : ''}
        <div style="display: flex; gap: 8px; justify-content: center; margin-top: 8px;">
          <button id="view-${shop.id}" style="padding:6px 12px;background:#438fda;color:#fff;border:none;border-radius:6px;cursor:pointer;flex:1;">View Shop</button>
          <button id="route-${shop.id}" style="padding:6px 12px;background:#10b981;color:#fff;border:none;border-radius:6px;cursor:pointer;flex:1;">Show Routes</button>
        </div>
      </div>
    `)

    marker.on('popupopen', () => {
      const viewBtn = document.getElementById(`view-${shop.id}`)
      const routeBtn = document.getElementById(`route-${shop.id}`)

      if (viewBtn) {
        viewBtn.onclick = () => router.push(`/shop/${shop.id}`)
      }

      if (routeBtn) {
        routeBtn.onclick = async () => {
          await focusOnShopMarker(shop.id)
        }
      }
    })

    shopMarkers.push(marker)
  }
}

/* -------------------- FOCUS ON SHOP MARKER -------------------- */
const focusOnShopMarker = async (shopId: string) => {
  console.log('Focusing on shop:', shopId)
  setErrorMessage(null)

  let marker = shopMarkers.find((m: any) => m.shopId === shopId)
  if (!marker) {
    marker = searchResultMarkers.find((m: any) => m.shopId === shopId)
  }

  if (!marker || !map.value) {
    setErrorMessage('Shop location not found')
    return
  }

  const shop = marker.shopData
  if (!shop || !shop.latitude || !shop.longitude) {
    setErrorMessage('Shop location data is incomplete')
    return
  }

  const userLat = Number(latitude.value ?? lastKnown.value?.[0])
  const userLng = Number(longitude.value ?? lastKnown.value?.[1])

  if (isFinite(userLat) && isFinite(userLng)) {
    routeLoading.value = true

    try {
      clearAllRoutes()

      const bounds = L.latLngBounds([
        [userLat, userLng],
        [Number(shop.latitude), Number(shop.longitude)],
      ])

      map.value.fitBounds(bounds.pad(0.2), {
        animate: true,
        duration: 0.5,
        padding: [20, 20],
      })

      const routes = await getRouteOptions(
        [userLat, userLng],
        [Number(shop.latitude), Number(shop.longitude)],
      )

      if (routes.length > 0) {
        routeOptions.value = routes
        drawRouteOptions(routes)

        if (routes[0].summary.includes('Fallback')) {
          setErrorMessage('Using direct route (routing service unavailable)', 3000)
        } else {
          setErrorMessage(
            `Found ${routes.length} route options. Click on any route to select it.`,
            5000,
          )
        }
      } else {
        setErrorMessage('Could not calculate routes to this shop. Please try again.', 3000)
        map.value.setView([Number(shop.latitude), Number(shop.longitude)], 16, {
          animate: true,
          duration: 0.5,
        })
      }

      marker.openPopup()
    } catch (error) {
      console.error('Error focusing on shop:', error)
      setErrorMessage('Error calculating routes: ' + (error as Error).message, 3000)
      map.value.setView([Number(shop.latitude), Number(shop.longitude)], 16, {
        animate: true,
        duration: 0.5,
      })
      marker.openPopup()
    } finally {
      routeLoading.value = false
    }
  } else {
    setErrorMessage('Your location is not available. Centering on shop only.', 3000)
    map.value.setView([Number(shop.latitude), Number(shop.longitude)], 16, {
      animate: true,
      duration: 0.5,
    })
    marker.openPopup()
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

/* -------------------- LIFECYCLE -------------------- */
onMounted(async () => {
  console.log('Mounting map component...')
  
  try {
    await initializeMap()

    if (Capacitor.getPlatform() !== 'web') await requestPermission()

    const pos = await Geolocation.getCurrentPosition({ 
      enableHighAccuracy: false, 
      timeout: 10000 
    })
    const quickLat = pos.coords.latitude
    const quickLng = pos.coords.longitude

    console.log('Got location:', quickLat, quickLng)

    if (map.value) {
      if (!userMarker) {
        userMarker = L.marker([quickLat, quickLng], { icon: userIcon })
          .addTo(map.value)
          .bindPopup('You are here')
          .openPopup()
      } else {
        userMarker.setLatLng([quickLat, quickLng])
        userMarker.setPopupContent('You are here')
      }

      await highlightUserCityBoundary(quickLat, quickLng)
      
      if (!cityBoundaryLayer.value) {
        map.value.setView([quickLat, quickLng], 14, { animate: true })
      }
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

// Location watcher
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
      userMarker.setLatLng([userLat, userLng])
      userMarker.setPopupContent('You are here')
    } else {
      userMarker = L.marker([userLat, userLng], { icon: userIcon })
        .addTo(map.value)
        .bindPopup('You are here')
        .openPopup()
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

/* -------------------- BASIC SEARCH FUNCTIONALITY -------------------- */
let searchResultMarkers: L.Marker[] = []

const clearSearchMarkers = () => {
  searchResultMarkers.forEach((marker) => {
    if (map.value && map.value.hasLayer(marker)) {
      map.value.removeLayer(marker)
    }
  })
  searchResultMarkers = []
}

const clearSearch = () => {
  search.value = ''
  isSearchMode.value = false
  applyShopFilters()
  showShopMenu.value = false
  clearSearchMarkers()

  shopMarkers.forEach((marker) => {
    if (map.value) map.value.addLayer(marker)
  })

  if (latitude.value && longitude.value) {
    map.value?.setView([Number(latitude.value), Number(longitude.value)], 13, { animate: true })
  }
}

const smartSearch = async () => {
  const query = search.value.trim().toLowerCase()
  if (!query || !map.value) return

  loading.value = true
  errorMsg.value = null
  isSearchMode.value = true

  try {
    // Basic search implementation - you can expand this
    const filtered = shops.value.filter(shop => 
      shop.business_name.toLowerCase().includes(query) ||
      shop.city?.toLowerCase().includes(query) ||
      shop.products?.some((p: any) => p.prod_name.toLowerCase().includes(query))
    )

    if (filtered.length === 0) {
      errorMsg.value = `No results found for "${query}"`
      filteredShops.value = []
      showShopMenu.value = true
      clearSearchMarkers()
    } else {
      errorMsg.value = `Found ${filtered.length} results`
      filteredShops.value = filtered
      showShopMenu.value = true
      plotShops()

      if (filtered.length === 1) {
        await focusOnShopMarker(filtered[0].id)
      }
    }
  } catch (error) {
    console.error('Search failed:', error)
    errorMsg.value = 'Search failed. Please try again.'
  } finally {
    loading.value = false
  }
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

const handleShopClick = async (shopId: string, index: number) => {
  if (isSearchMode.value) {
    // Focus on search result implementation
    await focusOnShopMarker(shopId)
  } else {
    await focusOnShopMarker(shopId)
  }
}

const openShop = async (shopId: string) => {
  const shop = shops.value.find((s) => s.id === shopId)
  if (!shop) return

  showShopMenu.value = false
  await focusOnShopMarker(shopId)

  if (map.value) {
    map.value.invalidateSize()
  }

  router.push(`/shop/${shopId}`)
}
</script>

<template>
  <v-app>
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
          placeholder="Search products, shops, or places..."
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
          <v-icon size="20">mdi-search-web</v-icon>
        </v-btn>
      </div>
    </v-sheet>

    <v-main style="position: relative; height: calc(100vh - 64px);">
      <div id="map" style="height: 100%; width: 100%;"></div>

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

      <!-- Map Controls Container -->
      <div class="map-controls-container" v-if="!showShopMenu">
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
              <v-list-item @click="clearCityBoundary" :disabled="!cityBoundaryPolygon">
                <v-list-item-title>
                  <v-icon color="grey" class="mr-2">mdi-eye-off</v-icon>
                  Hide City Boundary
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
      
      <v-alert
        v-if="errorMsg"
        type="info"
        class="route-info-alert"
        @click="setErrorMessage(null)"
        style="cursor: pointer"
      >
        <div class="d-flex justify-space-between align-center">
          <span>{{ errorMsg }}</span>
          <v-btn icon size="small" @click.stop="setErrorMessage(null)" class="ml-2">
            <v-icon>mdi-close</v-icon>
          </v-btn>
        </div>
      </v-alert>
    </v-main>

    <v-navigation-drawer v-model="showShopMenu" location="right" temporary width="380">
      <v-card>
        <v-card-title class="d-flex align-center">
          <span class="text-h6">Shops</span>
          <v-spacer></v-spacer>
          <v-btn icon @click="showShopMenu = false">
            <v-icon>mdi-close</v-icon>
          </v-btn>
        </v-card-title>
        <v-card-text>
          <v-list>
            <v-list-item
              v-for="(shop, index) in filteredShops"
              :key="shop.id"
              @click="handleShopClick(shop.id, index)"
            >
              <template #prepend>
                <v-avatar size="48" rounded>
                  <v-img
                    :src="shop.logo_url || shop.physical_store || 'https://placehold.co/80x80'"
                    alt="Shop logo"
                  />
                </v-avatar>
              </template>
              <v-list-item-title>{{ shop.business_name }}</v-list-item-title>
              <v-list-item-subtitle>
                {{ getFullAddress(shop) }}
                <br>
                {{ Number(shop.distanceKm) !== Infinity ? shop.distanceKm.toFixed(2) + ' km away' : 'Distance unknown' }}
              </v-list-item-subtitle>
            </v-list-item>
          </v-list>
        </v-card-text>
      </v-card>
    </v-navigation-drawer>

    <BottomNav v-model="activeTab" />
  </v-app>
</template>
<style scoped>
/* Enhanced boundary styles */
:deep(.city-boundary) {
  stroke-dasharray: 10, 10;
  animation: dash 30s linear infinite;
}

@keyframes dash {
  to {
    stroke-dashoffset: -1000;
  }
}

/* Boundary loading state */
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

/* Enhanced mode chip styles */
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
}

.mode-chip:hover {
  transform: scale(1.05);
}

/* Map container */
#map {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 1;
}

.v-main {
  position: relative;
  padding: 0 !important;
}

/* Hero section - FIXED FOR SAFE AREA */
.hero {
  background: linear-gradient(135deg, #3f83c7 0%, #1e40af 100%);
  border-radius: 0;
  /* Add safe area insets for phone status bar */
  padding-top: max(16px, env(safe-area-inset-top));
  padding-left: max(16px, env(safe-area-inset-left));
  padding-right: max(16px, env(safe-area-inset-right));
  padding-bottom: 16px;
  margin: 0;
  width: 100%;
  position: sticky;
  top: 0;
  z-index: 1000;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
  /* Ensure content doesn't go under the status bar */
  min-height: calc(64px + env(safe-area-inset-top));
}

.hero-row {
  display: flex;
  align-items: center;
  gap: 12px;
  max-width: 1200px;
  margin: 0 auto;
  /* Add margin top to push content below status bar */
  margin-top: env(safe-area-inset-top);
}

.search-field {
  flex: 1;
  min-width: 0;
}

.search-field :deep(.v-field) {
  background: #ffffff !important;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1) !important;
  border: 2px solid #e2e8f0 !important;
  min-height: 52px;
  transition: all 0.3s ease !important;
}

.search-field :deep(.v-field):hover {
  border-color: #3b82f6 !important;
  box-shadow: 0 6px 20px rgba(59, 130, 246, 0.15) !important;
}

.search-field :deep(.v-field):focus-within {
  border-color: #1d4ed8 !important;
  box-shadow: 0 8px 25px rgba(59, 130, 246, 0.2) !important;
}

.search-btn {
  background: linear-gradient(135deg, #10b981 0%, #059669 100%) !important;
  color: white !important;
  min-width: 52px !important;
  width: 60px !important;
  height: 52px !important;
  box-shadow: 0 4px 14px rgba(16, 185, 129, 0.4) !important;
  border: none;
  transition: all 0.3s ease !important;
}

.search-btn:hover:not(.v-btn--disabled) {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(16, 185, 129, 0.5) !important;
}

/* Map Controls - Adjust for safe area */
.map-controls-container {
  position: absolute;
  bottom: max(100px, calc(100px + env(safe-area-inset-bottom)));
  right: max(20px, env(safe-area-inset-right));
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 8px;
  z-index: 2000;
  max-width: calc(100vw - 40px);
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

.route-info-alert {
  position: absolute;
  /* Adjust for safe area */
  top: max(80px, calc(80px + env(safe-area-inset-top)));
  left: 50%;
  transform: translateX(-50%);
  z-index: 2000;
  width: 90%;
  max-width: 500px;
}

/* Adjust main content area for safe area */
.v-main {
  position: relative;
  height: calc(100vh - 64px - env(safe-area-inset-top)) !important;
  padding: 0 !important;
}

/* Responsive adjustments with safe area support */
@media (max-width: 768px) {
  .hero {
    padding: max(12px, env(safe-area-inset-top)) max(12px, env(safe-area-inset-left)) 12px max(12px, env(safe-area-inset-right));
  }
  
  .hero-row {
    gap: 8px;
    margin-top: env(safe-area-inset-top);
  }
  
  .map-controls-container {
    bottom: max(80px, calc(80px + env(safe-area-inset-bottom)));
    right: max(12px, env(safe-area-inset-right));
  }
  
  .control-btn {
    width: 44px !important;
    height: 44px !important;
  }
  
  /* Adjust for notched devices */
  .route-info-alert {
    top: max(70px, calc(70px + env(safe-area-inset-top)));
    width: 95%;
  }
}

/* Additional safe area support for very tall screens */
@media (min-height: 800px) {
  .hero {
    padding-top: max(20px, env(safe-area-inset-top));
  }
  
  .hero-row {
    margin-top: max(8px, env(safe-area-inset-top));
  }
}

/* Support for devices without safe-area-inset */
@supports not (padding: max(0px)) {
  .hero {
    padding-top: 16px;
  }
  
  .hero-row {
    margin-top: 0;
  }
  
  .map-controls-container {
    bottom: 100px;
    right: 20px;
  }
  
  .route-info-alert {
    top: 80px;
  }
}
</style>