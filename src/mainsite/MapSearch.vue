<script setup lang="ts">
import { ref, onMounted, watch, onUnmounted } from 'vue'
import L from 'leaflet'
import { useRouter } from 'vue-router'
import { useGeolocation } from '@/composables/useGeolocation'
import { Capacitor } from '@capacitor/core'
import { supabase } from '@/utils/supabase'
import BottomNav from '@/common/layout/BottomNav.vue'
import { Geolocation } from '@capacitor/geolocation'

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

/* -------------------- MULTIPLE ROUTING VIA MAPBOX WITH DIFFERENT PROFILES -------------------- */
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

/* -------------------- ROUTE MANAGEMENT -------------------- */
let currentRouteLayers: L.Polyline[] = []
let currentRouteMarkers: L.Marker[] = []
const selectedRouteIndex = ref<number | null>(null)
const routeOptions = ref<RouteOption[]>([])
const showRouteMenu = ref(false)

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

  currentRouteLayers.forEach((layer, i) => {
    if (i === index) {
      layer.setStyle({
        weight: 8,
        opacity: 1,
        color: route.color,
      })
      layer.bringToFront()
    } else {
      layer.setStyle({
        weight: 3,
        opacity: 0.4,
        color: route.color,
      })
    }
  })

  const distanceKm = (route.distance / 1000).toFixed(1)
  const durationMin = Math.round(route.duration / 60)

  const typeIcons = {
    driving: '🚗',
    walking: '🚶',
    cycling: '🚴',
  }

  errorMsg.value = `Selected: ${typeIcons[route.type]} ${route.summary} • ${distanceKm} km • ${durationMin} min • Click other routes to compare`
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

/* -------------------- STATE -------------------- */
const activeTab = ref('map')
const cityBoundaryLayer = ref<L.GeoJSON | null>(null)
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

/* -------------------- CONFIG -------------------- */
const fetchDebounceMs = 350

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
  iconUrl:
    'https://cdn.jsdelivr.net/gh/pointhi/leaflet-color-markers@master/img/marker-icon-red.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
})

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

    setTimeout(() => {
      try {
        const mapContainer = document.getElementById('map')
        if (!mapContainer) {
          console.error('Map container not found')
          resolve()
          return
        }

        map.value = L.map('map', {
          center: [8.95, 125.53],
          zoom: 13,
          zoomAnimation: false,
          fadeAnimation: false,
          markerZoomAnimation: false,
        })

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '© OpenStreetMap contributors',
        }).addTo(map.value)

        loadCachedLocation()
        const placeholder = lastKnown.value ?? [8.95, 125.53]

        userMarker = L.marker(placeholder, { icon: userIcon })
          .addTo(map.value)
          .bindPopup(lastKnown.value ? 'Last known location' : 'Locating you...')
          .openPopup()

        map.value.whenReady(() => {
          console.log('Map is fully ready')
          map.value?.invalidateSize(true)
          mapInitialized.value = true
          resolve()
        })
      } catch (error) {
        console.error('Error initializing map:', error)
        resolve()
      }
    }, 100)
  })
}

/* -------------------- USER CITY BOUNDARY -------------------- */
const highlightUserCityBoundary = async (lat: number, lon: number) => {
  if (!map.value) return

  try {
    const osmUrl = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=10`
    const osmRes = await fetch(osmUrl, {
      headers: { 'User-Agent': 'CloseShop-App' },
    })

    if (!osmRes.ok) return

    const osmData = await osmRes.json()
    const address = osmData.address

    const cityName = address.city || address.town || address.village || address.municipality

    if (!cityName) return

    userCity.value = cityName
    console.log('Detected city:', cityName)
  } catch (e) {
    console.error('Failed to detect city boundary:', e)
  }
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
      return {
        ...s,
        distanceKm,
      }
    })

    shops.value = mapped.sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity))
    filteredShops.value = [...shops.value]
    plotShops()
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
  }, fetchDebounceMs)
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
  if (!map.value || !map.value._loaded) return
  clearShopMarkers()

  for (const shop of shops.value) {
    // Double-check status before plotting
    if (shop.status !== 'approved') {
      console.log(`Skipping non-approved shop: ${shop.business_name} (${shop.status})`)
      continue
    }
    
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

  applyFiltersToMarkers()
}

/* -------------------- FILTERS -------------------- */
const normalizeCity = (name: string | null) =>
  name
    ? name
        .toLowerCase()
        .replace(/city|municipality|municipal|town|province/g, '')
        .trim()
    : ''

const applyFiltersToMarkers = () => {
  if (!map.value) return

  const term = search.value.trim().toLowerCase()
  const userCityNorm = normalizeCity(userCity.value)
  const smartShopIds = new Set<string>(productMatches.value.map((p) => p.shop_id).filter(Boolean))

  shopMarkers.forEach((marker: any) => {
    const shop = marker.shopData
    if (!shop) return

    // Ensure only approved shops are shown
    if (shop.status !== 'approved') {
      if (map.value) map.value.removeLayer(marker)
      return
    }

    let passesCity = true
    const shopCityNorm = normalizeCity(shop.city)
    if (userCity.value && smartShopIds.size === 0) {
      passesCity =
        shopDisplayMode.value === 'within'
          ? shopCityNorm.includes(userCityNorm) || userCityNorm.includes(shopCityNorm)
          : !shopCityNorm.includes(userCityNorm) && !userCityNorm.includes(shopCityNorm)
    }

    const name = (shop.business_name ?? '').toLowerCase()
    const addr = (getFullAddress(shop) ?? '').toLowerCase()
    const passesText = !term || name.includes(term) || addr.includes(term)

    const passesSmartProduct = smartShopIds.size === 0 ? true : smartShopIds.has(shop.id)

    const shouldShow = passesCity && (passesText || passesSmartProduct)

    if (shouldShow && map.value) map.value.addLayer(marker)
    else if (map.value) map.value.removeLayer(marker)
  })
}

/* -------------------- FOCUS ON SHOP -------------------- */
const focusOnShopMarker = async (shopId: string) => {
  const marker = shopMarkers.find((m: any) => m.shopId === shopId)
  if (!marker || !map.value) return

  const shop = marker.shopData
  if (!shop || !shop.latitude || !shop.longitude) return

  const userLat = Number(latitude.value ?? lastKnown.value?.[0])
  const userLng = Number(longitude.value ?? lastKnown.value?.[1])

  if (!isFinite(userLat) || !isFinite(userLng)) {
    map.value.setView([Number(shop.latitude), Number(shop.longitude)], 16, { animate: false })
    marker.openPopup()
    return
  }

  routeLoading.value = true
  errorMsg.value = null

  try {
    clearAllRoutes()

    const bounds = L.latLngBounds([
      [userLat, userLng],
      [Number(shop.latitude), Number(shop.longitude)],
    ])

    map.value.fitBounds(bounds.pad(0.2), {
      animate: false,
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
        errorMsg.value = 'Using direct route (routing service unavailable)'
      } else {
        errorMsg.value = `Found ${routes.length} route options. Click on any route to select it.`
      }
    } else {
      errorMsg.value = 'Could not calculate routes to this shop. Please try again.'
      map.value.setView([Number(shop.latitude), Number(shop.longitude)], 16, { animate: false })
    }

    marker.openPopup()
  } catch (error) {
    console.error('Error focusing on shop:', error)
    errorMsg.value = 'Error calculating routes: ' + (error as Error).message
    map.value.setView([Number(shop.latitude), Number(shop.longitude)], 16, { animate: false })
    marker.openPopup()
  } finally {
    routeLoading.value = false
  }
}

/* -------------------- ENHANCED SEARCH SYSTEM -------------------- */
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
  filteredShops.value = [...shops.value]
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
  productMatches.value = []

  try {
    const userCityNorm = normalizeCity(userCity.value)

    const placeMatches = await searchPlacesAndShops(query, userCityNorm)
    const productShopMatches = await searchProducts(query, userCityNorm)

    const resultShops: any[] = []
    const seenShopIds = new Set<string>()

    placeMatches.forEach((shop) => {
      if (!seenShopIds.has(shop.id)) {
        resultShops.push(shop)
        seenShopIds.add(shop.id)
      }
    })

    productShopMatches.forEach((shop) => {
      if (!seenShopIds.has(shop.id)) {
        resultShops.push(shop)
        seenShopIds.add(shop.id)
      }
    })

    const userPos =
      latitude.value && longitude.value
        ? { lat: Number(latitude.value), lng: Number(longitude.value) }
        : null

    if (userPos && resultShops.length) {
      resultShops.sort((a, b) => {
        const dA = calculateShopDistance(a, userPos)
        const dB = calculateShopDistance(b, userPos)
        return dA - dB
      })
    }

    if (resultShops.length === 0) {
      errorMsg.value = `No results found for "${query}"`
      filteredShops.value = []
      showShopMenu.value = false
      clearSearchMarkers()
    } else {
      const placeCount = placeMatches.length
      const productCount =
        productShopMatches.length -
        placeMatches.filter((p) => productShopMatches.some((ps) => ps.id === p.id)).length

      errorMsg.value = `Found ${resultShops.length} results (${placeCount} places, ${productCount} products)`
      filteredShops.value = resultShops
      showShopMenu.value = true

      displaySearchResultsOnMap(resultShops)

      if (resultShops.length === 1) {
        await focusOnShopMarker(resultShops[0].id)
      } else if (resultShops.length > 1) {
        fitMapToSearchResults(resultShops)
      }
    }
  } catch (error) {
    console.error('Search failed:', error)
    errorMsg.value = 'Search failed. Please try again.'
    clearSearchMarkers()
  } finally {
    loading.value = false
  }
}

const searchPlacesAndShops = async (query: string, userCityNorm: string): Promise<any[]> => {
  const results: any[] = []

  const { data: shopData, error: shopError } = await supabase
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
    .or(
      `business_name.ilike.%${query}%,detected_address.ilike.%${query}%,city.ilike.%${query}%,barangay.ilike.%${query}%,street.ilike.%${query}%`,
    )

  if (!shopError && shopData) {
    const filteredShops = userCityNorm
      ? shopData.filter((shop) => {
          const shopCityNorm = normalizeCity(shop.city)
          return shopCityNorm.includes(userCityNorm) || userCityNorm.includes(shopCityNorm)
        })
      : shopData

    const userPos =
      latitude.value && longitude.value
        ? { lat: Number(latitude.value), lng: Number(longitude.value) }
        : null

    results.push(
      ...filteredShops.map((shop) => ({
        ...shop,
        distanceKm: userPos ? calculateShopDistance(shop, userPos) : Infinity,
        matchType: 'place' as const,
      })),
    )
  }

  return results
}

const searchProducts = async (query: string, userCityNorm: string): Promise<any[]> => {
  const results: any[] = []

  const { data: productData, error: productError } = await supabase
    .from('products')
    .select(
      `
      id,
      prod_name,
      price,
      main_img_urls,
      shop_id,
      shops!inner(
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
      )
    `,
    )
    .ilike('prod_name', `%${query}%`)
    .eq('shops.status', 'approved')

  if (!productError && productData) {
    const filteredProducts = userCityNorm
      ? productData.filter((product) => {
          const shopCityNorm = normalizeCity(product.shops.city)
          return shopCityNorm.includes(userCityNorm) || userCityNorm.includes(shopCityNorm)
        })
      : productData

    const userPos =
      latitude.value && longitude.value
        ? { lat: Number(latitude.value), lng: Number(longitude.value) }
        : null

    results.push(
      ...filteredProducts.map((product) => ({
        ...product.shops,
        distanceKm: userPos ? calculateShopDistance(product.shops, userPos) : Infinity,
        matchType: 'product' as const,
        matchedProduct: {
          id: product.id,
          name: product.prod_name,
          price: product.price,
          image: product.main_img_urls,
        },
      })),
    )
  }

  return results
}

const calculateShopDistance = (shop: any, userPos: { lat: number; lng: number }): number => {
  const lat = Number(shop.latitude)
  const lng = Number(shop.longitude)
  return isFinite(lat) && isFinite(lng)
    ? getDistanceKm(userPos.lat, userPos.lng, lat, lng)
    : Infinity
}

const displaySearchResultsOnMap = (results: any[]) => {
  if (!map.value) return

  clearSearchMarkers()
  shopMarkers.forEach((marker) => {
    if (map.value) map.value.removeLayer(marker)
  })

  results.forEach((shop, index) => {
    const lat = Number(shop.latitude)
    const lng = Number(shop.longitude)

    if (!isFinite(lat) || !isFinite(lng)) return

    const marker = L.marker([lat, lng], {
      icon: createSearchResultIcon(shop, index + 1),
      title: shop.business_name,
      zIndexOffset: 1000,
    }) as any

    marker.shopId = shop.id
    marker.shopData = shop
    marker.addTo(map.value)

    const productList = (shop.products || [])
      .map((p: any) => {
        const isMatchedProduct =
          shop.matchType === 'product' && shop.matchedProduct && shop.matchedProduct.id === p.id
        return `<li ${isMatchedProduct ? 'style="background-color: #f0f9ff; border-left: 3px solid #10b981; padding-left: 8px;"' : ''}>
          ${p.prod_name} - ₱${p.price}
          ${isMatchedProduct ? ' <span style="color: #10b981; font-weight: bold;">✓</span>' : ''}
        </li>`
      })
      .join('')

    marker.bindPopup(`
      <div style="text-align:center; min-width: 240px;">
        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
          <div style="
            background: ${shop.matchType === 'product' ? '#10b981' : '#3b82f6'};
            color: white;
            width: 24px;
            height: 24px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: bold;
            font-size: 12px;
          ">${index + 1}</div>
          <strong style="flex: 1;">${shop.business_name}</strong>
        </div>
        <img src="${shop.physical_store || shop.logo_url || 'https://placehold.co/80x80'}" width="80" height="80" style="border-radius:8px;object-fit:cover;margin-bottom:6px;" />
        <p style="margin:2px 0; font-size:14px;">${getFullAddress(shop)}</p>
        <p style="margin:2px 0; font-size:14px;">
          ${Number(shop.distanceKm) !== Infinity ? shop.distanceKm.toFixed(2) + ' km away' : 'Distance unknown'}
          ${shop.matchType === 'product' ? '<br><span style="color: #10b981; font-size: 12px;">✓ Sells matching product</span>' : ''}
        </p>
        ${productList ? `<ul style="font-size:12px;text-align:left;padding-left:15px;margin:8px 0;max-height: 120px; overflow-y: auto;">${productList}</ul>` : ''}
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
        viewBtn.onclick = () => {
          showShopMenu.value = false
          router.push(`/shop/${shop.id}`)
        }
      }

      if (routeBtn) {
        routeBtn.onclick = async () => {
          await focusOnShopMarker(shop.id)
        }
      }
    })

    marker.on('click', () => {
      focusOnSearchResult(shop.id, index)
    })

    searchResultMarkers.push(marker)
  })
}

const createSearchResultIcon = (shop: any, index: number) => {
  const color = shop.matchType === 'product' ? '#10b981' : '#3b82f6'
  const iconSize = 36

  return L.divIcon({
    html: `
      <div style="
        background: ${color};
        color: white;
        width: ${iconSize}px;
        height: ${iconSize}px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: bold;
        font-size: 14px;
        border: 3px solid white;
        box-shadow: 0 2px 8px rgba(0,0,0,0.3);
        cursor: pointer;
      ">${index}</div>
    `,
    className: 'search-result-marker',
    iconSize: [iconSize, iconSize],
    iconAnchor: [iconSize / 2, iconSize / 2],
  })
}

const fitMapToSearchResults = (results: any[]) => {
  if (!map.value || results.length === 0) return

  const bounds = L.latLngBounds([])
  let validResults = 0

  results.forEach((shop) => {
    const lat = Number(shop.latitude)
    const lng = Number(shop.longitude)
    if (isFinite(lat) && isFinite(lng)) {
      bounds.extend([lat, lng])
      validResults++
    }
  })

  if (latitude.value && longitude.value) {
    bounds.extend([Number(latitude.value), Number(longitude.value)])
  }

  if (bounds.isValid() && validResults > 0) {
    const padding = results.length > 3 ? 0.1 : 0.15
    map.value.fitBounds(bounds.pad(padding), {
      animate: true,
      duration: 1,
      padding: [20, 20],
    })
  }
}

const focusOnSearchResult = async (shopId: string, index: number) => {
  const marker = searchResultMarkers.find((m: any) => m.shopId === shopId)
  if (!marker || !map.value) return

  searchResultMarkers.forEach((m, i) => {
    const isSelected = i === index
    const icon = createSearchResultIcon(m.shopData, i + 1)
    m.setIcon(icon)

    if (isSelected) {
      m.setZIndexOffset(2000)
      m.openPopup()
    } else {
      m.setZIndexOffset(1000)
    }
  })

  const latLng = marker.getLatLng()
  map.value.setView(latLng, 16, { animate: true, duration: 0.5 })
}

/* -------------------- SEARCH UTILITIES -------------------- */
const highlightMatch = (text: string, term: string) => {
  if (!term) return text
  const regex = new RegExp(`(${term.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')})`, 'gi')
  return text.replace(regex, '<span class="highlight">$1</span>')
}

const onSearchKeydown = (e: KeyboardEvent) => {
  if (e.key === 'Enter') smartSearch()
}

/* -------------------- UPDATE SHOPS -------------------- */
const updateShops = async () => {
  fetchShops()
}

/* -------------------- USER LOCATION TRACKING -------------------- */
watch([latitude, longitude], async ([lat, lng]) => {
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
  void highlightUserCityBoundary(userLat, userLng)
  void updateShops()
})

/* -------------------- RECENTER -------------------- */
const recenterToUser = async () => {
  if (!map.value || !latitude.value || !longitude.value) return
  locating.value = true
  try {
    clearAllRoutes()
    await new Promise((r) => setTimeout(r, 100))
    map.value.setView([latitude.value, longitude.value], 16, { animate: false })
  } finally {
    locating.value = false
  }
}

/* -------------------- LIFECYCLE -------------------- */
onMounted(async () => {
  try {
    await initializeMap()

    if (Capacitor.getPlatform() !== 'web') await requestPermission()

    const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy: false, timeout: 5000 })
    const quickLat = pos.coords.latitude
    const quickLng = pos.coords.longitude

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
      map.value.setView([quickLat, quickLng], 16, { animate: false })
    }

    saveCachedLocation(quickLat, quickLng)
    void highlightUserCityBoundary(quickLat, quickLng)
    void updateShops()
  } catch (err) {
    console.warn('Quick geolocation failed:', err)
    void fetchShops()
  }
})

onUnmounted(() => {
  stopWatching()
  if (latitude.value && longitude.value)
    saveCachedLocation(Number(latitude.value), Number(longitude.value))
  if (map.value)
    try {
      setTimeout(() => map.value?.remove(), 300)
    } catch {}
})

/* -------------------- UI SHOP CLICK -------------------- */
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

/* -------------------- WATCH FOR SEARCH CHANGES -------------------- */
watch([search, shops], () => {
  const term = search.value.trim().toLowerCase()
  let results: any[] = []

  if (!term) {
    results = [...shops.value].filter(shop => shop.status === 'approved')
  } else {
    results = shops.value.filter((shop) => {
      // Only include approved shops
      if (shop.status !== 'approved') return false
      
      const name = shop.business_name?.toLowerCase() ?? ''
      const addr = getFullAddress(shop).toLowerCase()
      return name.includes(term) || addr.includes(term)
    })
  }

  filteredShops.value = results.sort(
    (a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity),
  )

  applyFiltersToMarkers()
})
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
          placeholder="Search product or shop..."
          append-inner-icon="mdi-earth"
          @keydown="onSearchKeydown"
          @click:clear="clearSearch"
          @click:append-inner="smartSearch"
        />
        <v-btn
          class="search-btn"
          @click="smartSearch"
          :loading="loading"
          :disabled="!search.trim()"
        >
          <v-icon size="22">mdi-magnify</v-icon>
        </v-btn>
      </div>
    </v-sheet>

    <v-main>
      <div id="map"></div>

      <!-- Route Loading Overlay -->
      <div v-if="routeLoading" class="route-loading">
        <v-progress-circular indeterminate color="primary" size="32"></v-progress-circular>
        <span>Calculating routes...</span>
      </div>

      <div class="map-buttons" v-if="!showShopMenu">
        <v-btn icon :loading="locating" @click="recenterToUser">
          <v-icon>mdi-crosshairs-gps</v-icon>
        </v-btn>
        <v-btn icon @click="clearAllRoutes" title="Clear Routes">
          <v-icon>mdi-close</v-icon>
        </v-btn>
        <v-menu location="top" transition="scale-transition" color="#ffffff">
          <template #activator="{ props }">
            <v-btn icon v-bind="props"><v-icon>mdi-dots-vertical</v-icon></v-btn>
          </template>
          <v-list>
            <v-list-item
              @click="
                () => {
                  shopDisplayMode = 'within'
                  applyFiltersToMarkers()
                }
              "
            >
              <v-list-item-title>Display Within City (Nearby)</v-list-item-title>
            </v-list-item>
            <v-list-item
              @click="
                () => {
                  shopDisplayMode = 'outside'
                  applyFiltersToMarkers()
                }
              "
            >
              <v-list-item-title>Display Outside City (Explore More)</v-list-item-title>
            </v-list-item>
          </v-list>
        </v-menu>

        <v-chip v-if="shopDisplayMode === 'outside'" color="primary" size="small" class="mode-chip">
          🌏 Exploring Outside City
        </v-chip>
        <v-btn icon @click="showShopMenu = !showShopMenu">
          <v-icon>mdi-menu</v-icon>
        </v-btn>
      </div>

      <v-alert v-if="errorMsg" type="info" class="ma-4 route-info-alert">
        {{ errorMsg }}
      </v-alert>
    </v-main>

    <!-- Enhanced Shop Menu Drawer -->
    <v-navigation-drawer v-model="showShopMenu" location="right" temporary width="380">
      <v-toolbar flat color="primary" dark>
        <v-toolbar-title>
          <div>
            <div>Search Results</div>
            <div style="font-size: 0.8rem; opacity: 0.8">
              {{ filteredShops.length }} results • Sorted by distance
            </div>
          </div>
        </v-toolbar-title>
        <v-btn icon @click="showShopMenu = false">
          <v-icon>mdi-close</v-icon>
        </v-btn>
      </v-toolbar>
      <v-divider></v-divider>

      <v-list v-if="filteredShops.length > 0">
        <v-list-item
          v-for="(shop, index) in filteredShops"
          :key="shop.id"
          @click="focusOnSearchResult(shop.id, index)"
          class="search-result-item"
        >
          <template #prepend>
            <div
              class="result-index"
              :style="{
                backgroundColor: shop.matchType === 'product' ? '#10b981' : '#3b82f6',
              }"
            >
              {{ index + 1 }}
            </div>
            <v-avatar size="44">
              <v-img
                :src="shop.logo_url || shop.physical_store || 'https://via.placeholder.com/80'"
                :alt="shop.business_name"
              />
            </v-avatar>
          </template>

          <v-list-item-title class="d-flex align-center">
            <span v-html="highlightMatch(shop.business_name, search)"></span>
            <v-chip v-if="shop.matchType === 'product'" size="x-small" color="green" class="ml-2">
              Product
            </v-chip>
            <v-chip v-else size="x-small" color="blue" class="ml-2"> Place </v-chip>
          </v-list-item-title>

          <v-list-item-subtitle
            v-html="highlightMatch(getFullAddress(shop), search)"
          ></v-list-item-subtitle>

          <v-list-item-subtitle v-if="shop.distanceKm && isFinite(shop.distanceKm)">
            <v-icon small>mdi-map-marker-distance</v-icon>
            {{ shop.distanceKm.toFixed(2) }} km away
          </v-list-item-subtitle>

          <template #append>
            <v-btn icon variant="text" size="small" @click.stop="openShop(shop.id)">
              <v-icon>mdi-chevron-right</v-icon>
            </v-btn>
          </template>
        </v-list-item>
      </v-list>

      <div v-else class="pa-4 text-center">
        <v-icon size="48" color="grey-lighten-1">mdi-magnify</v-icon>
        <div class="text-body-1 text-grey mt-2">No search results</div>
        <div class="text-caption text-grey">Try a different search term</div>
      </div>
    </v-navigation-drawer>

    <BottomNav v-model="activeTab" />
  </v-app>
</template>
<style scoped>
/* Base responsive adjustments */
:deep(.v-application__wrap) {
  min-height: 100vh !important;
}

.hero {
  background: #3f83c7;
  border-radius: 0;
  padding-top: max(16px, env(safe-area-inset-top));
  padding: clamp(20px, 8vw, 35px) clamp(12px, 4vw, 16px) clamp(8px, 3vw, 12px);
  margin: 0;
  width: 100%;
  position: sticky;
  top: 0;
  z-index: 1000;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.1);
}

.hero-row {
  display: flex;
  align-items: center;
  gap: clamp(8px, 3vw, 12px);
  max-width: 1200px;
  margin: 0 auto;
}

.search-field {
  flex: 1;
  min-width: 0;
}

.search-field :deep(.v-field) {
  background: #fff !important;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1);
  border: 1px solid #e2e8f0;
  min-height: 48px;
}

.search-field :deep(input) {
  font-size: clamp(14px, 4vw, 16px);
  padding: 8px 4px;
}

.search-field :deep(.v-field__append-inner) {
  padding-top: 0;
  padding-bottom: 0;
}

.search-btn {
  background: #1e40af !important;
  color: white !important;
  min-width: 48px !important;
  width: clamp(48px, 12vw, 56px) !important;
  height: clamp(48px, 12vw, 56px) !important;
  box-shadow: 0 4px 12px rgba(30, 64, 175, 0.3);
  border: none;
}

.search-btn .v-icon {
  font-size: clamp(18px, 5vw, 22px);
}

/* Map container with safe area support */
#map {
  position: absolute;
  top: 0;
  bottom: var(--bottom-nav-height, 70px);
  left: 0;
  right: 0;
  width: 100%;
  height: calc(100vh - var(--bottom-nav-height, 70px));
  z-index: 1;
}

/* Ensure bottom nav doesn't cover content */
:deep(.v-application__wrap) {
  min-height: 100vh !important;
}

:deep(.v-bottom-navigation) {
  --bottom-nav-height: 70px;
  height: var(--bottom-nav-height) !important;
  padding-bottom: env(safe-area-inset-bottom);
  box-shadow: 0 -2px 12px rgba(0, 0, 0, 0.1);
  z-index: 1000;
}

.map-buttons {
  position: fixed;
  bottom: calc(var(--bottom-nav-height, 70px) + clamp(16px, 5vw, 24px));
  right: clamp(12px, 4vw, 20px);
  display: flex;
  flex-direction: column;
  gap: clamp(6px, 2vw, 10px);
  z-index: 2000;
}

.map-buttons .v-btn {
  background: white;
  box-shadow: 0 3px 10px rgba(0, 0, 0, 0.2);
  width: clamp(44px, 11vw, 52px);
  height: clamp(44px, 11vw, 52px);
  border: 1px solid #e2e8f0;
}

.map-buttons .v-btn .v-icon {
  font-size: clamp(18px, 4.5vw, 20px);
}

.mode-chip {
  position: fixed;
  bottom: calc(var(--bottom-nav-height, 70px) + clamp(80px, 25vw, 120px));
  right: clamp(12px, 4vw, 20px);
  z-index: 2100;
  font-weight: 600;
  padding: clamp(4px, 1.5vw, 8px) clamp(8px, 2vw, 12px);
  font-size: clamp(0.7rem, 3vw, 0.8rem);
  background: linear-gradient(135deg, #3b82f6, #1d4ed8);
  color: white;
  box-shadow: 0 2px 8px rgba(59, 130, 246, 0.3);
  backdrop-filter: blur(10px);
  border: none;
}

/* Shop menu drawer improvements */
:deep(.v-navigation-drawer) {
  margin-top: 0 !important;
}

:deep(.v-navigation-drawer__content) {
  padding-bottom: env(safe-area-inset-bottom);
}

:deep(.v-toolbar) {
  padding-top: env(safe-area-inset-top);
  background: linear-gradient(135deg, #3f83c7, #1e40af) !important;
}

:deep(.v-toolbar-title) {
  font-size: clamp(1rem, 4vw, 1.25rem);
  font-weight: 600;
}

/* Shop list items */
:deep(.v-list-item) {
  padding-top: clamp(8px, 2vw, 12px);
  padding-bottom: clamp(8px, 2vw, 12px);
  border-bottom: 1px solid #f1f5f9;
}

:deep(.v-avatar) {
  width: clamp(36px, 10vw, 44px) !important;
  height: clamp(36px, 10vw, 44px) !important;
  min-width: clamp(36px, 10vw, 44px) !important;
}

:deep(.v-list-item-title) {
  font-size: clamp(0.9rem, 3.5vw, 1rem);
  line-height: 1.3;
  margin-bottom: 2px;
}

:deep(.v-list-item-subtitle) {
  font-size: clamp(0.75rem, 3vw, 0.85rem);
  line-height: 1.2;
  opacity: 0.8;
}

/* Alert improvements */
.v-alert {
  margin: clamp(8px, 2vw, 16px);
  font-size: clamp(0.8rem, 3.5vw, 0.9rem);
  border-radius: 12px;
  border: 1px solid;
}

.route-info-alert {
  background-color: #dbeafe !important;
  border-left: 4px solid #3b82f6;
}

/* Route selection styles */
.selected-route {
  background-color: #f0f9ff;
  border-left: 3px solid #3b82f6;
}

.route-color-indicator {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  margin-right: 12px;
}

/* Highlight for search matches */
.highlight {
  background-color: #fef3c7;
  font-weight: 700;
  border-radius: 3px;
  padding: 1px 3px;
  color: #92400e;
}

/* Leaflet popup improvements for mobile */
:deep(.leaflet-popup-content) {
  margin: clamp(10px, 3vw, 16px);
  font-size: clamp(12px, 3.5vw, 14px);
  line-height: 1.4;
}

:deep(.leaflet-popup-content-wrapper) {
  border-radius: 12px;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.15);
}

:deep(.leaflet-popup-content button) {
  font-size: clamp(12px, 3.5vw, 14px);
  padding: clamp(6px, 2vw, 8px) clamp(10px, 3vw, 14px);
  margin-top: 8px;
}

:deep(.leaflet-popup-content img) {
  width: clamp(60px, 20vw, 80px) !important;
  height: clamp(60px, 20vw, 80px) !important;
}

/* Route label styles for map */
:deep(.route-label) {
  background: transparent !important;
  border: none !important;
}

/* Safe area support for notched devices */
.safe-area-top {
  padding-top: env(safe-area-inset-top);
}

.safe-area-bottom {
  padding-bottom: env(safe-area-inset-bottom);
}

/* Loading states */
:deep(.v-progress-linear) {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 3000;
}

/* Add route loading styles */
.route-loading {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background: rgba(255, 255, 255, 0.95);
  padding: 20px;
  border-radius: 12px;
  box-shadow: 0 8px 25px rgba(0, 0, 0, 0.15);
  display: flex;
  align-items: center;
  gap: 12px;
  z-index: 3000;
  backdrop-filter: blur(10px);
  border: 1px solid #e2e8f0;
}

.route-loading span {
  font-weight: 600;
  color: #374151;
}

/* Responsive typography scale */
@media (max-width: 360px) {
  .hero {
    padding: 12px 10px 6px;
  }

  .hero-row {
    gap: 6px;
  }

  .map-buttons {
    bottom: 70px;
    right: 8px;
  }

  .map-buttons .v-btn {
    width: 40px;
    height: 40px;
  }
}

@media (min-width: 768px) {
  #map {
    bottom: var(--bottom-nav-height, 80px);
    height: calc(100vh - var(--bottom-nav-height, 80px));
  }

  :deep(.v-bottom-navigation) {
    --bottom-nav-height: 80px;
  }

  .map-buttons {
    bottom: calc(80px + 24px);
    right: 24px;
  }
}

/* Landscape orientation support */
@media (max-height: 500px) and (orientation: landscape) {
  .hero {
    padding: 12px 16px 8px;
    position: relative;
  }

  #map {
    top: 0;
    height: 100vh;
  }

  .map-buttons {
    bottom: 20px;
    right: 16px;
  }

  .mode-chip {
    bottom: 80px;
  }
}

/* High DPI screen support */
@media (-webkit-min-device-pixel-ratio: 2), (min-resolution: 192dpi) {
  .map-buttons .v-btn {
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
  }

  .search-field :deep(.v-field) {
    box-shadow: 0 2px 12px rgba(0, 0, 0, 0.15);
  }
}

/* Reduced motion support */
@media (prefers-reduced-motion: reduce) {
  :deep(.v-menu__content),
  :deep(.v-navigation-drawer) {
    transition-duration: 0.1s !important;
  }
}

/* Dark mode support */
@media (prefers-color-scheme: dark) {
  .map-buttons .v-btn {
    background: #374151;
    border-color: #4b5563;
    color: #f9fafb;
  }

  .highlight {
    background-color: #f59e0b;
    color: #7c2d12;
  }
}

/* Route styling improvements */
:deep(.route-line) {
  cursor: pointer;
  transition: all 0.3s ease;
}

:deep(.route-line:hover) {
  filter: brightness(1.2);
}

:deep(.route-end-marker) {
  background: transparent !important;
  border: none !important;
}

:deep(.route-info-marker) {
  background: transparent !important;
  border: none !important;
  pointer-events: none;
}

/* Selected route highlight */
:deep(.route-line.selected) {
  filter: drop-shadow(0 0 8px rgba(59, 130, 246, 0.5));
}

/* Search result styles */
.result-index {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: #3b82f6;
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: bold;
  margin-right: 12px;
}

.search-result-item {
  border-left: 3px solid transparent;
  transition: all 0.3s ease;
}

.search-result-item:hover {
  border-left-color: #3b82f6;
  background-color: #f8fafc;
}

/* Enhanced marker styles */
:deep(.search-result-marker) {
  background: transparent !important;
  border: none !important;
}

:deep(.search-result-marker:hover) {
  transform: scale(1.1);
  transition: transform 0.2s ease;
}
</style>
