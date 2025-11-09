<script setup lang="ts">
import { ref, onMounted, watch, onUnmounted } from 'vue'
import L from 'leaflet'
import { useRouter } from 'vue-router'
import { useGeolocation } from '@/composables/useGeolocation'
import { Capacitor } from '@capacitor/core'
import { supabase } from '@/utils/supabase'
import BottomNav from '@/common/layout/BottomNav.vue'
import { Geolocation } from '@capacitor/geolocation'

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

/* -------------------- GEOAPIFY CONFIG -------------------- */
const GEOAPIFY_API_KEY = 'b4cb2e0e4f4a4e4fb385fae9418d4da7'

/* -------------------- GEOLOCATION -------------------- */
const { latitude, longitude, requestPermission, startWatching, stopWatching } = useGeolocation()
let userMarker: L.Marker | null = null
let shopMarkers: L.Marker[] = []
const locating = ref(false)

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

const unregisteredShopIcon = L.icon({
  iconUrl:
    'https://cdn.jsdelivr.net/gh/pointhi/leaflet-color-markers@master/img/marker-icon-green.png',
  iconSize: [18, 30], // smaller than registered shops
  iconAnchor: [9, 30],
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

    const osmUrl = `https://nominatim.openstreetmap.org/search?city=${encodeURIComponent(cityName)}&country=Philippines&format=geojson&polygon_geojson=1`
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

    map.value.fitBounds(cityBoundaryLayer.value.getBounds().pad(0.2))
  } catch (e) {
    console.error('Failed to highlight city boundary:', e)
    errorMsg.value = 'Unable to highlight city boundary.'
  }
}

/* -------------------- FETCH SHOPS -------------------- */
const fetchShops = async () => {
  try {
    loading.value = true
    const { data, error } = await supabase.from('shops').select(`
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
        postal
      `)
    if (error) throw error
    shops.value = data || []
    plotShops()
  } catch (e) {
    console.error(e)
    errorMsg.value = 'Failed to fetch shops.'
  } finally {
    loading.value = false
  }
}

/* -------------------- HELPER: FULL ADDRESS -------------------- */
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

/* -------------------- PLOT SHOPS -------------------- */
const plotShops = () => {
  if (!map.value || !map.value._loaded) return
  if (!shops.value.length) return

  shopMarkers.forEach((m) => map.value?.removeLayer(m))
  shopMarkers = []

  for (const shop of shops.value) {
    const lat = Number(shop.latitude)
    const lng = Number(shop.longitude)
    if (!isFinite(lat) || !isFinite(lng)) continue

    const imageUrl = shop.physical_store || shop.logo_url || 'https://placehold.co/80x80'
    const userLat = latitude.value ? Number(latitude.value) : (lastKnown.value?.[0] ?? 0)
    const userLng = longitude.value ? Number(longitude.value) : (lastKnown.value?.[1] ?? 0)
    const distanceKm = getDistanceInKm(userLat, userLng, lat, lng)
    ;(shop as any).distanceKm = distanceKm

    const marker = L.marker([lat, lng], {
      icon: registeredShopIcon,
      title: shop.business_name,
    }).addTo(map.value!)

    ;(marker as any).shopId = shop.id
    ;(marker as any).distanceKm = distanceKm

    marker.bindPopup(`
      <div style="text-align:center;">
        <img src="${imageUrl}" width="80" height="80" style="border-radius:8px;object-fit:cover;margin-bottom:6px;" />
        <p><strong>${shop.business_name}</strong></p>
        <p style="margin:2px 0; font-size:14px;">${getFullAddress(shop)}</p>
        <p style="margin:2px 0; font-size:14px;">${distanceKm.toFixed(2)} km away</p>
        <button id="view-${shop.id}" style="padding:6px 12px;background:#438fda;color:#fff;border:none;border-radius:6px;cursor:pointer;">View Shop</button>
      </div>
    `)

    marker.on('popupopen', () => {
      const btn = document.getElementById(`view-${shop.id}`)
      if (btn)
        btn.onclick = () => {
          router.push(`/shop/${shop.id}`)
          marker.closePopup()
        }
    })

    shopMarkers.push(marker)
  }

  shops.value.sort((a, b) => ((a as any).distanceKm ?? 999) - ((b as any).distanceKm ?? 999))
  if (userCity.value) updateMarkerVisibility()
}

/* -------------------- FOCUS ON SHOP -------------------- */
const focusOnShopMarker = (shopId: string) => {
  const marker = shopMarkers.find((m: any) => m.shopId === shopId)
  if (marker && map.value) {
    map.value.setView(marker.getLatLng(), 16, { animate: true })
    marker.openPopup()
  }
}

/* -------------------- DISPLAY MODE -------------------- */
const showWithinCity = () => {
  shopDisplayMode.value = 'within'
  updateMarkerVisibility()
}
const showOutsideCity = () => {
  shopDisplayMode.value = 'outside'
  updateMarkerVisibility()
}

/* -------------------- MARKER FILTERING -------------------- */
const normalizeCity = (name: string | null) =>
  name
    ? name
        .toLowerCase()
        .replace(/city|municipality|municipal|town|province/g, '')
        .trim()
    : ''
const updateMarkerVisibility = () => {
  if (!userCity.value) return
  const userCityNorm = normalizeCity(userCity.value)
  shopMarkers.forEach((marker) => {
    const shop = shops.value.find((s: any) => s.id === (marker as any).shopId)
    const shopCityNorm = normalizeCity(shop?.city)
    const isSameCity =
      shopCityNorm && userCityNorm
        ? shopCityNorm.includes(userCityNorm) || userCityNorm.includes(shopCityNorm)
        : false
    if (shopDisplayMode.value === 'within')
      isSameCity ? map.value?.addLayer(marker) : map.value?.removeLayer(marker)
    else !isSameCity ? map.value?.addLayer(marker) : map.value?.removeLayer(marker)
  })
}

/* -------------------- DISTANCE -------------------- */
const getDistanceInKm = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const toRad = (v: number) => (v * Math.PI) / 180
  const R = 6371
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
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
  void fetchShops()
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
    void fetchShops()
  } catch (err) {
    console.warn('Quick geolocation failed:', err)
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

/* -------------------- SHOP LIST CLICK -------------------- */
const openShop = (shopId: string) => {
  focusOnShopMarker(shopId)
  showShopMenu.value = false
}

/* -------------------- SEARCH FILTER -------------------- */
const filteredShops = ref<any[]>([])

watch([search, shops], () => {
  const term = search.value.trim().toLowerCase()
  if (!term) {
    filteredShops.value = [...shops.value]
  } else {
    filteredShops.value = shops.value.filter((shop) => {
      const name = shop.business_name?.toLowerCase() ?? ''
      const city = shop.city?.toLowerCase() ?? ''
      return name.includes(term) || city.includes(term)
    })
  }
  updateMarkersByFilter()
})

const updateMarkersByFilter = () => {
  shopMarkers.forEach((marker) => {
    const shop = shops.value.find((s) => s.id === (marker as any).shopId)
    if (!shop) return
    const match = filteredShops.value.some((s) => s.id === shop.id)
    if (match && map.value) map.value.addLayer(marker)
    else if (map.value) map.value.removeLayer(marker)
  })
}

//helper
const highlightMatch = (text: string, term: string) => {
  if (!term) return text
  const regex = new RegExp(`(${term.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')})`, 'gi')
  return text.replace(regex, '<span class="highlight">$1</span>')
}

//search narrow
const smartSearch = async () => {
  const query = search.value.trim()
  if (!query || !map.value) return

  // 1. Check if query matches a shop
  const matchingShop = shops.value.find((shop) =>
    (shop.business_name?.toLowerCase() ?? '').includes(query.toLowerCase()),
  )

  if (matchingShop && matchingShop.latitude && matchingShop.longitude) {
    const lat = Number(matchingShop.latitude)
    const lon = Number(matchingShop.longitude)
    map.value.setView([lat, lon], 16, { animate: true })

    const marker = shopMarkers.find((m) => (m as any).shopId === matchingShop.id)
    if (marker) marker.openPopup()

    return
  }

  // 2. If no shop found, search the place using Geoapify
  try {
    loading.value = true
    const res = await fetch(
      `https://api.geoapify.com/v1/geocode/search?text=${encodeURIComponent(query)}&apiKey=${GEOAPIFY_API_KEY}`,
    )
    const data = await res.json()
    const feature = data.features?.[0]
    if (!feature) {
      errorMsg.value = 'Location not found.'
      return
    }

    const [lat, lon] =
      feature.properties.lat && feature.properties.lon
        ? [feature.properties.lat, feature.properties.lon]
        : [feature.geometry.coordinates[1], feature.geometry.coordinates[0]]

    map.value.setView([lat, lon], 16, { animate: true })

    if (userMarker) userMarker.setLatLng([lat, lon]).bindPopup(query).openPopup()
    else
      userMarker = L.marker([lat, lon], { icon: userIcon })
        .addTo(map.value)
        .bindPopup(query)
        .openPopup()

    saveCachedLocation(lat, lon)
    errorMsg.value = null
  } catch (err) {
    console.error(err)
    errorMsg.value = 'Failed to search location.'
  } finally {
    loading.value = false
  }
}

const onSearchKeydown = (e: KeyboardEvent) => {
  if (e.key === 'Enter') smartSearch()
}

//display unregistered shops on map load
const fetchNearbyUnregisteredShops = async (lat: number, lon: number) => {
  try {
    const res = await fetch(
      `https://api.geoapify.com/v2/places?categories=shop&filter=circle:${lon},${lat},5000&apiKey=${GEOAPIFY_API_KEY}`,
    )
    const data = await res.json()
    return data.features || []
  } catch (err) {
    console.error('Failed to fetch unregistered shops:', err)
    return []
  }
}
const plotUnregisteredShops = (places: any[]) => {
  for (const place of places) {
    const lat = place.geometry.coordinates[1]
    const lon = place.geometry.coordinates[0]
    const marker = L.marker([lat, lon], {
      icon: unregisteredShopIcon,
      title: place.properties.name || 'Unregistered Shop',
    }).addTo(map.value!)

    marker.bindPopup(`
      <div style="text-align:center;">
        <p><strong>${place.properties.name || 'Unregistered Shop'}</strong></p>
        <p style="margin:2px 0; font-size:14px;">${place.properties.address_line1 || ''}</p>
      </div>
    `)

    shopMarkers.push(marker) // still add to the same array
  }
}

const updateShops = async () => {
  await fetchShops() // existing registered shops
  if (latitude.value && longitude.value) {
    const unregistered = await fetchNearbyUnregisteredShops(latitude.value, longitude.value)
    plotUnregisteredShops(unregistered)
  }
}
</script>
<template>
  <v-app>
    <v-app-bar class="searchshop" color="#3f83c7" flat>
      <v-text-field
        v-model="search"
        label="Search shops or places..."
        hide-details
        density="comfortable"
        variant="outlined"
        @keydown="onSearchKeydown"
      >
        <template #append>
          <v-btn icon @click="smartSearch">
            <v-icon>mdi-magnify</v-icon>
          </v-btn>
        </template>
      </v-text-field>
    </v-app-bar>

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
          <v-list-item @click="showWithinCity"
            ><v-list-item-title>Display Within City (Nearby)</v-list-item-title></v-list-item
          >
          <v-list-item @click="showOutsideCity"
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

          <v-list-item-title
            v-html="highlightMatch(shop.business_name, search)"
          ></v-list-item-title>

          <v-list-item-subtitle
            v-html="highlightMatch(getFullAddress(shop), search)"
          ></v-list-item-subtitle>

          <v-list-item-subtitle v-if="shop.distanceKm">
            {{ shop.distanceKm.toFixed(2) }} km away
          </v-list-item-subtitle>
        </v-list-item>
      </v-list>
    </v-navigation-drawer>

    <BottomNav v-model="activeTab" />
  </v-app>
</template>

<style scoped>
#map {
  position: absolute;
  top: var(--v-toolbar-height, 64px);
  bottom: var(--v-bottom-navigation-height, 56px);
  left: 0;
  right: 0;
  width: 100%;
  min-height: 300px; /* smaller minimum height for mobile */
  height: calc(100vh - var(--v-toolbar-height, 64px) - var(--v-bottom-navigation-height, 56px));
}

.map-buttons {
  position: fixed; /* better for small screens */
  bottom: 5vh; /* relative to viewport */
  right: 5vw;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  z-index: 2000;
}

.map-buttons .v-btn {
  background: white;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
  width: 48px; /* consistent size for mobile */
  height: 48px;
}

.mode-chip {
  position: fixed;
  bottom: 12vh; /* higher so it doesn't overlap buttons */
  right: 5vw;
  z-index: 2100;
  font-weight: 500;
  padding: 0.25rem 0.5rem;
  font-size: 0.8rem;
}

.highlight {
  background-color: #ffe066;
  font-weight: 600;
  border-radius: 2px;
  padding: 0 2px;
}

/* -------------------- MOBILE MEDIA QUERIES -------------------- */
@media (max-width: 768px) {
  #map {
    top: var(--v-toolbar-height, 56px);
    bottom: var(--v-bottom-navigation-height, 56px);
  }

  .map-buttons {
    bottom: 10vh;
    right: 4vw;
    gap: 0.4rem;
  }

  .map-buttons .v-btn {
    width: 40px;
    height: 40px;
  }

  .mode-chip {
    bottom: 10vh;
    font-size: 0.75rem;
    padding: 0.2rem 0.4rem;
  }

  /* Adjust v-navigation-drawer width for mobile */
  .v-navigation-drawer {
    width: 80% !important; /* take most of the screen on mobile */
  }

  /* Reduce padding in popups */
  .leaflet-popup-content {
    font-size: 0.85rem;
  }

  .leaflet-popup-content img {
    width: 60px;
    height: 60px;
  }
}
</style>
