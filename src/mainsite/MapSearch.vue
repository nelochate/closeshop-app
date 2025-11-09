<script setup lang="ts">
import { ref, onMounted, watch, onUnmounted } from 'vue'
import L from 'leaflet'
import { useRouter } from 'vue-router'
import { useGeolocation } from '@/composables/useGeolocation'
import { Capacitor } from '@capacitor/core'
import { supabase } from '@/utils/supabase'
import BottomNav from '@/common/layout/BottomNav.vue'

/* -------------------- STATE -------------------- */
const activeTab = ref('map')
const cityBoundaryLayer = ref<L.GeoJSON | null>(null)
const map = ref<L.Map | null>(null)
const router = useRouter()
const search = ref('')
const shops = ref<any[]>([])
const filteredShops = ref<any[]>([])
const loading = ref(false)
const errorMsg = ref<string | null>(null)
const showShopMenu = ref(false)
const shopDisplayMode = ref<'within' | 'outside'>('within')
const userCity = ref<string | null>(null)
const locating = ref(false)

/* -------------------- GEOAPIFY CONFIG -------------------- */
const GEOAPIFY_API_KEY = 'b4cb2e0e4f4a4e4fb385fae9418d4da7'

/* -------------------- GEOLOCATION -------------------- */
const { latitude, longitude, requestPermission, startWatching, stopWatching } = useGeolocation()
let userMarker: L.Marker | null = null
let shopMarkers: L.Marker[] = []

/* -------------------- ICONS -------------------- */
const userIcon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
})

const shopIcon = L.icon({
  iconUrl:
    'https://cdn.jsdelivr.net/gh/pointhi/leaflet-color-markers@master/img/marker-icon-red.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
})

/* -------------------- MAP INITIALIZATION -------------------- */
const initializeMap = () => {
  if (map.value && map.value._loaded) {
    map.value.remove()
  }
  map.value = L.map('map', { center: [8.95, 125.53], zoom: 13 })
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors',
  }).addTo(map.value)
  setTimeout(() => map.value?.invalidateSize(), 500)
}

/* -------------------- USER CITY BOUNDARY -------------------- */
const highlightUserCityBoundary = async (lat: number, lon: number) => {
  if (!map.value) return
  try {
    const geoRes = await fetch(
      `https://api.geoapify.com/v1/geocode/reverse?lat=${lat}&lon=${lon}&apiKey=${GEOAPIFY_API_KEY}`
    )
    const geoData = await geoRes.json()
    const cityName =
      geoData.features?.[0]?.properties?.city ||
      geoData.features?.[0]?.properties?.town ||
      geoData.features?.[0]?.properties?.village
    if (!cityName) {
      errorMsg.value = 'Unable to detect city from your location.'
      return
    }
    userCity.value = cityName

    const overpassUrl = `https://overpass-api.de/api/interpreter?data=[out:json];relation["name"="${cityName}"]["boundary"="administrative"];out geom;`
    const res = await fetch(overpassUrl)
    const data = await res.json()
    if (!data.elements?.length) return

    const feature = data.elements[0]
    const coordinates = feature.members
      .filter((m: any) => m.geometry)
      .map((m: any) => m.geometry.map((p: any) => [p.lat, p.lon])) // Leaflet expects [lat, lon]

    const geojson = { type: 'Feature', geometry: { type: 'Polygon', coordinates } }

    if (cityBoundaryLayer.value && map.value.hasLayer(cityBoundaryLayer.value)) {
      map.value.removeLayer(cityBoundaryLayer.value)
    }

    cityBoundaryLayer.value = L.geoJSON(geojson, {
      style: { color: '#0ea5e9', weight: 3, fillOpacity: 0.1 },
    }).addTo(map.value)
    map.value.fitBounds(cityBoundaryLayer.value.getBounds().pad(0.2))
  } catch (e) {
    console.error('Failed to fetch city boundary:', e)
    errorMsg.value = 'Unable to highlight city boundary.'
  }
}

/* -------------------- FETCH SHOPS -------------------- */
const fetchShops = async () => {
  try {
    loading.value = true
    const { data, error } = await supabase
      .from('shops')
      .select('id, business_name, latitude, longitude, logo_url, physical_store, detected_address, city')
    if (error) throw error
    shops.value = data || []
    filteredShops.value = [...shops.value]
    plotShops()
  } catch (e) {
    console.error(e)
    errorMsg.value = 'Failed to fetch shops.'
  } finally {
    loading.value = false
  }
}

/* -------------------- PLOT SHOPS -------------------- */
const plotShops = () => {
  if (!map.value) return
  shopMarkers.forEach((m) => map.value?.removeLayer(m))
  shopMarkers = []

  shops.value.forEach(shop => {
    const lat = Number(shop.latitude)
    const lng = Number(shop.longitude)
    if (!isFinite(lat) || !isFinite(lng)) return

    const marker = L.marker([lat, lng], { icon: shopIcon, title: shop.business_name })
    ;(marker as any).shopId = shop.id
    ;(marker as any).shopCity = shop.city

    const imageUrl = shop.logo_url || shop.physical_store || 'https://placehold.co/80x80'
    marker.bindPopup(`
      <div style="text-align:center;">
        <img src="${imageUrl}" width="80" height="80" style="border-radius:8px;object-fit:cover;margin-bottom:6px;" />
        <p><strong>${shop.business_name}</strong></p>
        <button id="view-${shop.id}" style="padding:6px 12px;background:#438fda;color:#fff;border:none;border-radius:6px;cursor:pointer;">View Shop</button>
      </div>
    `)
    marker.on('popupopen', () => {
      const btn = document.getElementById(`view-${shop.id}`)
      if (btn) btn.onclick = () => router.push(`/shop/${shop.id}`)
    })

    marker.addTo(map.value!)
    shopMarkers.push(marker)
  })

  updateMarkerVisibility()
}

/* -------------------- FILTERING & DISPLAY -------------------- */
watch([search, shops], () => {
  const term = search.value.trim().toLowerCase()
  if (!term) filteredShops.value = [...shops.value]
  else
    filteredShops.value = shops.value.filter(shop =>
      (shop.business_name?.toLowerCase().includes(term) || shop.city?.toLowerCase().includes(term))
    )
  updateMarkersByFilter()
})

const updateMarkersByFilter = () => {
  shopMarkers.forEach(marker => {
    const shop = shops.value.find(s => s.id === (marker as any).shopId)
    if (!shop) return
    const match = filteredShops.value.some(s => s.id === shop.id)
    if (match && map.value) map.value.addLayer(marker)
    else if (map.value) map.value.removeLayer(marker)
  })
}

const showWithinCity = () => { shopDisplayMode.value = 'within'; updateMarkerVisibility() }
const showOutsideCity = () => { shopDisplayMode.value = 'outside'; updateMarkerVisibility() }

const updateMarkerVisibility = () => {
  if (!userCity.value) return
  const userCityName = userCity.value.trim().toLowerCase()
  shopMarkers.forEach(marker => {
    const shopCityName = ((marker as any).shopCity || '').trim().toLowerCase()
    const isSameCity = shopCityName.includes(userCityName) || userCityName.includes(shopCityName)
    if (shopDisplayMode.value === 'within') {
      if (isSameCity) map.value?.addLayer(marker)
      else map.value?.removeLayer(marker)
    } else {
      if (!isSameCity) map.value?.addLayer(marker)
      else map.value?.removeLayer(marker)
    }
  })
}

/* -------------------- USER LOCATION -------------------- */
watch([latitude, longitude], async ([lat, lng]) => {
  if (!map.value || lat == null || lng == null) return
  const userLat = Number(lat), userLng = Number(lng)
  if (!isFinite(userLat) || !isFinite(userLng)) return

  map.value.whenReady(() => {
    if (userMarker) userMarker.setLatLng([userLat, userLng])
    else userMarker = L.marker([userLat, userLng], { icon: userIcon }).addTo(map.value!).bindPopup('You are here').openPopup()
  })

  await highlightUserCityBoundary(userLat, userLng)
  await fetchShops()
})

const recenterToUser = async () => {
  if (!map.value || !latitude.value || !longitude.value) return
  locating.value = true
  try { map.value.setView([latitude.value, longitude.value], 16, { animate: true }) }
  finally { locating.value = false }
}

/* -------------------- LIFECYCLE -------------------- */
onMounted(async () => {
  if (Capacitor.getPlatform() !== 'web') await requestPermission()
  initializeMap()
  map.value?.whenReady(async () => { await startWatching() })
})
onUnmounted(() => { stopWatching(); map.value?.remove() })

/* -------------------- SHOP LIST -------------------- */
const openShop = (shopId: number) => { router.push(`/shop/${shopId}`); showShopMenu.value = false }
const highlightMatch = (text: string, term: string) => !term ? text : text.replace(new RegExp(`(${term.replace(/[-/\\^$*+?.()|[\]{}]/g,'\\$&')})`,'gi'), '<span class="highlight">$1</span>')
</script>

<template>
  <v-app>
    <v-app-bar class="searchshop" color="#3f83c7" flat>
      <v-text-field
        v-model="search"
        label="Search shops..."
        hide-details
        density="comfortable"
        variant="outlined"
      >
        <template #append>
          <v-btn icon @click="console.log('Searching for', search)">
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
        <v-menu location="top" transition="scale-transition">
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
        <v-list-item v-for="shop in shops" :key="shop.id" @click="openShop(shop.id)">
          <template #prepend>
            <v-avatar size="40">
              <img
                :src="shop.logo_url || shop.physical_store || 'https://via.placeholder.com/80'"
              />
            </v-avatar>
          </template>
          <v-list-item-title>{{ shop.business_name }}</v-list-item-title>
          <v-list-item-subtitle v-if="shop.detected_address">{{
            shop.detected_address
          }}</v-list-item-subtitle>
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
  min-height: 400px;
  height: calc(100vh - var(--v-toolbar-height, 64px) - var(--v-bottom-navigation-height, 56px));
}
.map-buttons {
  position: absolute;
  bottom: 20px;
  right: 20px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  z-index: 2000;
}

.map-buttons .v-btn {
  background: white;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
}
.mode-chip {
  position: absolute;
  bottom: 90px;
  right: 20px;
  z-index: 2100;
  font-weight: 500;
}
.searchshop {
  padding-top: 25px;
}
.map-buttons .v-btn {
  background: white;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
}
.mode-chip {
  position: absolute;
  bottom: 90px;
  right: 20px;
  z-index: 2100;
  font-weight: 500;
}
.highlight {
  background-color: #ffe066;
  font-weight: 600;
  border-radius: 2px;
  padding: 0 2px;
}

</style>
