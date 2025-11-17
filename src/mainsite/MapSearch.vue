<script setup lang="ts">
import { ref, onMounted, watch, onUnmounted } from 'vue'
import L from 'leaflet'
import { useRouter } from 'vue-router'
import { useGeolocation } from '@/composables/useGeolocation'
import { Capacitor } from '@capacitor/core'
import { supabase } from '@/utils/supabase'
import BottomNav from '@/common/layout/BottomNav.vue'
import { Geolocation } from '@capacitor/geolocation'
// NOTE: routing removed per your request (no leaflet-routing-machine import)

/* -------------------- ROUTING VIA GEOAPIFY -------------------- */
const getRoute = async (start: [number, number], end: [number, number]) => {
  try {
    const url = `https://api.geoapify.com/v1/routing?waypoints=${start[0]},${start[1]}|${end[0]},${end[1]}&mode=drive&apiKey=${GEOAPIFY_API_KEY}`
    const res = await fetch(url)
    if (!res.ok) {
      console.error('Geoapify routing error', res.status, await res.text())
      return null
    }
    const data = await res.json()
    if (data.features && data.features.length) {
      // GeoJSON coordinates are [lon, lat], need [lat, lon]
      const coords = data.features[0].geometry.coordinates.map((c: number[]) => [c[1], c[0]])
      return coords
    }
  } catch (err) {
    console.error('Geoapify routing failed', err)
  }
  return null
}

/* -------------------- DRAW ROUTE ON MAP -------------------- */
let currentRouteLayer: L.Polyline | null = null
const drawRoute = (coords: [number, number][]) => {
  if (!map.value || !coords?.length) return
  if (currentRouteLayer) map.value.removeLayer(currentRouteLayer)

  currentRouteLayer = L.polyline(coords, { color: '#f97316', weight: 4, opacity: 0.9 }).addTo(
    map.value,
  )
  map.value.fitBounds(currentRouteLayer.getBounds().pad(0.2))
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
const productMatches = ref<any[]>([]) //smart product matches

/* -------------------- CONFIG -------------------- */
const GEOAPIFY_API_KEY = 'b4cb2e0e4f4a4e4fb385fae9418d4da7'
const fetchDebounceMs = 350

/* -------------------- GEOLOCATION -------------------- */
const { latitude, longitude, requestPermission, startWatching, stopWatching } = useGeolocation()
let userMarker: L.Marker | null = null
let shopMarkers: L.Marker[] = [] // registered shop markers
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
const initializeMap = () => {
  if (map.value && map.value._loaded) {
    try {
      map.value.remove()
    } catch (e) {
      console.warn(e)
    }
  }

  map.value = L.map('map', { center: [8.95, 125.53], zoom: 13 })
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors',
  }).addTo(map.value)

  loadCachedLocation()
  const placeholder = lastKnown.value ?? [8.95, 125.53]
  userMarker = L.marker(placeholder, { icon: userIcon })
    .addTo(map.value)
    .bindPopup(lastKnown.value ? 'Last known location' : 'Locating you...')
    .openPopup()

  // minor delay to fix container sizing
  setTimeout(() => map.value?.invalidateSize(), 500)
}

/* -------------------- USER CITY BOUNDARY -------------------- */
const highlightUserCityBoundary = async (lat: number, lon: number) => {
  if (!map.value) return
  try {
    const geoRes = await fetch(
      `https://api.geoapify.com/v1/geocode/reverse?lat=${lat}&lon=${lon}&apiKey=${GEOAPIFY_API_KEY}`,
    )
    const geoData = await geoRes.json()
    const props = geoData.features?.[0]?.properties || {}
    const cityName =
      props.city ||
      props.town ||
      props.village ||
      props.county ||
      props.state_district ||
      props.state
    if (!cityName) {
      errorMsg.value = 'Unable to detect city from your location.'
      return
    }
    userCity.value = cityName

    const osmUrl = `https://nominatim.openstreetmap.org/search?city=${encodeURIComponent(
      cityName,
    )}&country=Philippines&format=geojson&polygon_geojson=1`
    const osmRes = await fetch(osmUrl, { headers: { 'User-Agent': 'CloseShop-App' } })
    const osmData = await osmRes.json()
    if (!osmData.features?.length) {
      errorMsg.value = `No boundary found for ${cityName}`
      return
    }

    const boundaryFeature = osmData.features[0]
    if (cityBoundaryLayer.value && map.value.hasLayer(cityBoundaryLayer.value)) {
      map.value.removeLayer(cityBoundaryLayer.value)
    }

    cityBoundaryLayer.value = L.geoJSON(boundaryFeature, {
      style: { color: '#0ea5e9', weight: 3, fillOpacity: 0.1 },
    }).addTo(map.value)

    map.value.fitBounds((cityBoundaryLayer.value as L.GeoJSON).getBounds().pad(0.2))
  } catch (e) {
    console.error('Failed to highlight city boundary:', e)
    errorMsg.value = 'Unable to highlight city boundary.'
  }
}

/* -------------------- DISTANCE (single canonical fn) -------------------- */
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

/* -------------------- FETCH + PLOT SHOPS (debounced) -------------------- */
const doFetchShops = async () => {
  try {
    loading.value = true
    errorMsg.value = null

    // Get user's current position for distance calculation
    const userLat = Number(latitude.value ?? lastKnown.value?.[0] ?? 0)
    const userLng = Number(longitude.value ?? lastKnown.value?.[1] ?? 0)

    // Fetch approved shops
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

    // Compute distance for sorting (fallback: large)
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

    // Sort nearest → farthest
    shops.value = mapped.sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity))

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
      <div style="text-align:center;">
        <img src="${shop.physical_store || shop.logo_url || 'https://placehold.co/80x80'}" width="80" height="80" style="border-radius:8px;object-fit:cover;margin-bottom:6px;" />
        <p><strong>${shop.business_name}</strong></p>
        <p style="margin:2px 0; font-size:14px;">${getFullAddress(shop)}</p>
        <p style="margin:2px 0; font-size:14px;">${Number(shop.distanceKm) !== Infinity ? shop.distanceKm.toFixed(2) + ' km away' : 'Distance unknown'}</p>
        ${productList ? `<ul style="font-size:12px;text-align:left;padding-left:15px;">${productList}</ul>` : ''}
        <button id="view-${shop.id}" style="padding:6px 12px;background:#438fda;color:#fff;border:none;border-radius:6px;cursor:pointer;">View Shop</button>
      </div>
    `)

    marker.on('popupopen', () => {
      const btn = document.getElementById(`view-${shop.id}`)
      if (btn) btn.onclick = () => router.push(`/shop/${shop.id}`)
    })

    shopMarkers.push(marker)
  }

  // apply current filters so map only shows what the user expects
  applyFiltersToMarkers()
}

/* -------------------- FILTER PIPELINE (Option A: combine all) -------------------- */
const normalizeCity = (name: string | null) =>
  name
    ? name
        .toLowerCase()
        .replace(/city|municipality|municipal|town|province/g, '')
        .trim()
    : ''

// central function that decides which markers to show
const applyFiltersToMarkers = () => {
  if (!map.value) return

  const term = search.value.trim().toLowerCase()
  const userCityNorm = normalizeCity(userCity.value)

  // set of shop IDs from productMatches
  const smartShopIds = new Set<string>(productMatches.value.map((p) => p.shop_id).filter(Boolean))

  shopMarkers.forEach((marker: any) => {
    const shop = marker.shopData
    if (!shop) return

    // City filter: only apply if NO product matches, so product searches always show
    let passesCity = true
    const shopCityNorm = normalizeCity(shop.city)
    if (userCity.value && smartShopIds.size === 0) {
      passesCity =
        shopDisplayMode.value === 'within'
          ? shopCityNorm.includes(userCityNorm) || userCityNorm.includes(shopCityNorm)
          : !shopCityNorm.includes(userCityNorm) && !userCityNorm.includes(shopCityNorm)
    }

    // Search text filter (shop name or address)
    const name = (shop.business_name ?? '').toLowerCase()
    const addr = (getFullAddress(shop) ?? '').toLowerCase()
    const passesText = !term || name.includes(term) || addr.includes(term)

    // Smart product filter
    const passesSmartProduct = smartShopIds.size === 0 ? true : smartShopIds.has(shop.id)

    // Show shop if any match: name/address OR product match
    const shouldShow = passesCity && (passesText || passesSmartProduct)

    if (shouldShow && map.value) map.value.addLayer(marker)
    else if (map.value) map.value.removeLayer(marker)

    // Optional: add "Product match!" indicator in popup
    if (passesSmartProduct) {
      const popup = marker.getPopup()
      if (popup) {
        const content = popup.getContent()
        if (!content.includes('Product match')) {
          marker.setPopupContent(
            content + '<p style="color:green;font-weight:bold;">Product match!</p>',
          )
        }
      }
    }
  })
}

/* -------------------- FOCUS ON SHOP (WITH ROUTE) -------------------- */
const focusOnShopMarker = async (shopId: string) => {
  const marker = shopMarkers.find((m: any) => m.shopId === shopId)
  if (!marker || !map.value) return

  const shop = marker.shopData
  if (!shop || !shop.latitude || !shop.longitude) return

  // Center map
  map.value.setView([Number(shop.latitude), Number(shop.longitude)], 16, { animate: true })

  // Open popup
  marker.openPopup()

  // Draw route using Geoapify
  const userLat = Number(latitude.value ?? lastKnown.value?.[0])
  const userLng = Number(longitude.value ?? lastKnown.value?.[1])
  if (!isFinite(userLat) || !isFinite(userLng)) return

  const coords = await getRoute([userLat, userLng], [Number(shop.latitude), Number(shop.longitude)])
  if (coords) drawRoute(coords)
}

/* -------------------- SEARCH / SMART SEARCH -------------------- */
const filteredShops = ref<any[]>([])

watch([search, shops], () => {
  const term = search.value.trim().toLowerCase()
  let results: any[] = []

  if (!term) {
    results = [...shops.value]
  } else {
    results = shops.value.filter((shop) => {
      const name = shop.business_name?.toLowerCase() ?? ''
      const addr = getFullAddress(shop).toLowerCase()
      return name.includes(term) || addr.includes(term)
    })
  }

  // Always sort nearest → farthest
  filteredShops.value = results.sort(
    (a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity),
  )

  applyFiltersToMarkers()
})

const highlightMatch = (text: string, term: string) => {
  if (!term) return text
  const regex = new RegExp(`(${term.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')})`, 'gi')
  return text.replace(regex, '<span class="highlight">$1</span>')
}

const smartSearch = async () => {
  const query = search.value.trim().toLowerCase()
  if (!map.value) return

  loading.value = true
  errorMsg.value = null
  productMatches.value = []

  // 1) match shops by name/address locally
  const shopMatches = shops.value.filter((s) => {
    const name = (s.business_name ?? '').toLowerCase()
    const addr = getFullAddress(s).toLowerCase()
    return name.includes(query) || addr.includes(query)
  })

  // 2) match products
  try {
    const { data: products, error } = await supabase
      .from('products')
      .select('id, prod_name, shop_id')

    if (!error && products) {
      productMatches.value = products.filter((p) => p.prod_name.toLowerCase().includes(query))
    }
  } catch (e) {
    console.warn('Product search failed', e)
  }

  // 3) combine unique shops (from name/address + product matches)
  const resultShops: any[] = []
  shopMatches.forEach((s) => {
    if (!resultShops.some((r) => r.id === s.id)) resultShops.push(s)
  })
  productMatches.value.forEach((p) => {
    const parent = shops.value.find((s) => s.id === p.shop_id)
    if (parent && !resultShops.some((r) => r.id === parent.id)) resultShops.push(parent)
  })

  // 4) sort by distance from user
  const userPos =
    latitude.value && longitude.value
      ? { lat: Number(latitude.value), lng: Number(longitude.value) }
      : null
  if (userPos && resultShops.length) {
    resultShops.sort((a, b) => {
      const dA =
        isFinite(Number(a.latitude)) && isFinite(Number(a.longitude))
          ? getDistanceKm(userPos.lat, userPos.lng, Number(a.latitude), Number(a.longitude))
          : Infinity
      const dB =
        isFinite(Number(b.latitude)) && isFinite(Number(b.longitude))
          ? getDistanceKm(userPos.lat, userPos.lng, Number(b.latitude), Number(b.longitude))
          : Infinity
      return dA - dB
    })
  }

  if (resultShops.length === 0) {
    errorMsg.value = 'No results found'
  }

  filteredShops.value = resultShops
  showShopMenu.value = true

  // apply filters to show matching markers on map
  applyFiltersToMarkers()

  loading.value = false

  // optionally focus map
  if (resultShops.length === 1) {
    const s = resultShops[0]
    await focusOnShopMarker(s.id)
  } else {
    // fit bounds to all matching shops
    const bounds = L.latLngBounds([])
    resultShops.forEach((s) => {
      if (isFinite(Number(s.latitude)) && isFinite(Number(s.longitude))) {
        bounds.extend([Number(s.latitude), Number(s.longitude)])
      }
    })
    if (bounds.isValid()) map.value?.fitBounds(bounds.pad(0.2))
  }
}

const onSearchKeydown = (e: KeyboardEvent) => {
  if (e.key === 'Enter') smartSearch()
}

/* -------------------- UPDATE SHOPS -------------------- */
const updateShops = async () => {
  // fetch registered shops (debounced)
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
    await new Promise((r) => setTimeout(r, 100))
    map.value.setView([latitude.value, longitude.value], 16, { animate: true })
  } finally {
    locating.value = false
  }
}

/* -------------------- LIFECYCLE -------------------- */
onMounted(async () => {
  initializeMap()
  if (Capacitor.getPlatform() !== 'web') await requestPermission()
  try {
    const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy: false, timeout: 5000 })
    const quickLat = pos.coords.latitude
    const quickLng = pos.coords.longitude
    if (map.value) {
      if (!userMarker)
        userMarker = L.marker([quickLat, quickLng], { icon: userIcon })
          .addTo(map.value)
          .bindPopup('You are here')
          .openPopup()
      else {
        userMarker.setLatLng([quickLat, quickLng])
        userMarker.setPopupContent('You are here')
      }
      map.value.setView([quickLat, quickLng], 16, { animate: true })
    }
    saveCachedLocation(quickLat, quickLng)
    void highlightUserCityBoundary(quickLat, quickLng)
    void updateShops()
  } catch (err) {
    console.warn('Quick geolocation failed:', err)
    // still fetch shops without user coords (will assign large distance)
    void fetchShops()
  }
  map.value?.whenReady(async () => {
    await startWatching()
  })
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

  // Close the side menu
  showShopMenu.value = false

  // Focus on the shop, open popup, and draw route
  await focusOnShopMarker(shopId)

  // Optional: scroll map to make sure popup is fully visible
  if (map.value) {
    map.value.invalidateSize()
  }

  // Navigate to shop page if desired
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
          placeholder="Search product or shop..."
          append-inner-icon="mdi-earth"
          @keydown="onSearchKeydown"
        />
        <v-btn class="search-btn" @click="smartSearch">
          <v-icon size="22">mdi-magnify</v-icon>
        </v-btn>
      </div>
    </v-sheet>

    <v-main>
      <div id="map"></div>
      <div class="map-buttons" v-if="!showShopMenu">
        <v-btn icon :loading="locating" @click="recenterToUser"
          ><v-icon>mdi-crosshairs-gps</v-icon></v-btn
        >
        <v-menu location="top" transition="scale-transition" color="#ffffff">
          <template #activator="{ props }">
            <v-btn icon v-bind="props"><v-icon>mdi-dots-vertical</v-icon></v-btn>
          </template>
          <v-list-item
            @click="
              () => {
                shopDisplayMode = 'within'
                applyFiltersToMarkers()
              }
            "
            ><v-list-item-title>Display Within City (Nearby)</v-list-item-title></v-list-item
          >
          <v-list-item
            @click="
              () => {
                shopDisplayMode = 'outside'
                applyFiltersToMarkers()
              }
            "
            ><v-list-item-title>Display Outside City (Explore More)</v-list-item-title></v-list-item
          >
        </v-menu>

        <v-chip v-if="shopDisplayMode === 'outside'" color="primary" size="small" class="mode-chip"
          >🌏 Exploring Outside City</v-chip
        >
        <v-btn icon @click="showShopMenu = true"><v-icon>mdi-menu</v-icon></v-btn>
      </div>

      <v-alert v-if="errorMsg" type="error" class="ma-4">{{ errorMsg }}</v-alert>
    </v-main>

    <v-navigation-drawer v-model="showShopMenu" location="right" temporary width="320">
      <v-toolbar flat color="primary" dark>
        <v-toolbar-title>Nearby Shops ({{ shops.length }})</v-toolbar-title>
        <v-btn icon @click="showShopMenu = false"><v-icon>mdi-close</v-icon></v-btn>
      </v-toolbar>
      <v-divider></v-divider>

      <v-list>
        <v-list-item v-for="shop in filteredShops" :key="shop.id" @click="openShop(shop.id)">
          <template #prepend>
            <v-avatar size="40">
              <img
                :src="shop.logo_url || shop.physical_store || 'https://via.placeholder.com/80'"
              />
            </v-avatar>
          </template>

          <v-list-item-title>
            <span v-html="highlightMatch(shop.business_name, search)"></span>

            <span
              v-if="productMatches.some((p) => p.shop_id === shop.id)"
              style="color: green; font-size: 12px"
            >
              • Product match available
            </span>
          </v-list-item-title>

          <v-list-item-subtitle
            v-html="highlightMatch(getFullAddress(shop), search)"
          ></v-list-item-subtitle>

          <v-list-item-subtitle v-if="shop.distanceKm && isFinite(shop.distanceKm)">
            {{ shop.distanceKm.toFixed(2) }} km away
          </v-list-item-subtitle>
        </v-list-item>
      </v-list>
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
  min-width: 0; /* Prevent flex item overflow */
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
:deep(.v-bottom-navigation) {
  --bottom-nav-height: 70px;
  height: var(--bottom-nav-height) !important;
  padding-bottom: env(safe-area-inset-bottom);
  box-shadow: 0 -2px 12px rgba(0, 0, 0, 0.1);
  z-index: 1000;
}

/* Map buttons - responsive positioning */
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
</style>