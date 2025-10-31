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
const loading = ref(false)
const errorMsg = ref<string | null>(null)
const showShopMenu = ref(false)
const shopDisplayMode = ref<'within' | 'outside'>('within')

/* -------------------- GEOAPIFY CONFIG -------------------- */
const GEOAPIFY_API_KEY = "b4cb2e0e4f4a4e4fb385fae9418d4da7"

/* ✅ Calculate driving distance using Geoapify */
const getDrivingDistance = async (
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): Promise<{ distanceKm: number; timeMin: number } | null> => {
  try {
    const response = await fetch(`https://api.geoapify.com/v1/routematrix?apiKey=${GEOAPIFY_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: "drive",
        sources: [{ lat: lat1, lon: lon1 }],
        targets: [{ lat: lat2, lon: lon2 }],
      }),
    })

    const data = await response.json()
    const info = data.sources_to_targets?.[0]?.[0]
    if (!info) return null

    return {
      distanceKm: Number((info.distance / 1000).toFixed(2)),
      timeMin: Math.round(info.time / 60),
    }
  } catch (err) {
    console.error("Geoapify error:", err)
    return null
  }
}

/* ✅ Fetch and display route line using Geoapify Directions API */
const drawRoute = async (fromLat: number, fromLon: number, toLat: number, toLon: number) => {
  try {
    const url = `https://api.geoapify.com/v1/routing?waypoints=${fromLat},${fromLon}|${toLat},${toLon}&mode=drive&apiKey=${GEOAPIFY_API_KEY}`;
    const response = await fetch(url);
    const data = await response.json();

    const route = data.features?.[0];
    if (!route || !map.value) return;

    // Remove old route if exists
    if (window.currentRouteLayer && map.value.hasLayer(window.currentRouteLayer)) {
      map.value.removeLayer(window.currentRouteLayer);
    }

    const coordinates = route.geometry.coordinates.map((c: any) => [c[1], c[0]]); // [lat, lon]

    const routeLine = L.polyline(coordinates, {
      color: '#FF0000', // bright red for visibility
      weight: 8,         // thicker line
      opacity: 0.9,      // more opaque
      lineJoin: 'round', 
      dashArray: '10,6', // optional dashed line for style
    }).addTo(map.value);

    window.currentRouteLayer = routeLine;

    // Pan to route center
    if (map.value && map.value._loaded) {
      try {
        const center = routeLine.getBounds().getCenter();
        map.value.panTo(center, { animate: true });
      } catch (e) {
        console.warn("Pan to route center failed:", e);
      }
    }

  } catch (err) {
    console.error('Route draw failed:', err);
  }
};

/* -------------------- GEOLOCATION -------------------- */
const { latitude, longitude, requestPermission, startWatching, stopWatching } = useGeolocation()
let userMarker: L.Marker | null = null
let shopMarkers: L.Marker[] = []
let recenterTimeout: number | null = null
const locating = ref(false)

const userIcon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
})

const shopIcon = L.icon({
  iconUrl: 'https://cdn.jsdelivr.net/gh/pointhi/leaflet-color-markers@master/img/marker-icon-red.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
})

/* -------------------- MAP INITIALIZATION -------------------- */
const initializeMap = () => {
  if (map.value && map.value._loaded) {
    try {
      map.value.remove()
    } catch (e) {
      console.warn("Failed to remove previous map:", e)
    }
  }

  map.value = L.map('map', {
    center: [8.95, 125.53],
    zoom: 13,
  })

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors',
  }).addTo(map.value)

  map.value.whenReady(() => {
    setTimeout(() => map.value?.invalidateSize(), 300)
  })
}

/* -------------------- HIGHLIGHT CITY BOUNDARY -------------------- */
const highlightCityBoundary = async (cityName: string) => {
  if (!map.value) return
  try {
    const overpassUrl = `https://overpass-api.de/api/interpreter?data=[out:json];relation["name"="${cityName}"]["boundary"="administrative"]["admin_level"="6"];out geom;`
    const res = await fetch(overpassUrl)
    const text = await res.text()

    // 🔍 Check if Overpass returned valid JSON
    let data: any
    try {
      data = JSON.parse(text)
    } catch {
      console.warn("Overpass returned non-JSON (server busy or rate-limited). Falling back...")
      errorMsg.value = "City boundary temporarily unavailable."
      return
    }

    if (!data.elements?.length) {
      console.warn("No boundary found for", cityName)
      return
    }

    const feature = data.elements[0]
    const coordinates = feature.members
      .filter((m: any) => m.geometry)
      .map((m: any) => m.geometry.map((p: any) => [p.lon, p.lat]))

    const geojson = {
      type: "Feature",
      geometry: { type: "Polygon", coordinates },
    }

    // Remove old boundary
    if (cityBoundaryLayer.value && map.value.hasLayer(cityBoundaryLayer.value)) {
      map.value.removeLayer(cityBoundaryLayer.value)
    }

    cityBoundaryLayer.value = L.geoJSON(geojson, {
      style: {
        color: '#0ea5e9',
        weight: 3,
        fillOpacity: 0.1,
      },
    }).addTo(map.value)

    // Fit map to city bounds
    if (map.value && map.value._loaded) {
      try {
        map.value.fitBounds(cityBoundaryLayer.value.getBounds().pad(0.2))
      } catch (e) {
        console.warn("Boundary fitBounds failed:", e)
      }
    }

  } catch (e) {
    console.error("Overpass fetch failed:", e)
    errorMsg.value = "Unable to highlight city boundary. Please try again later."
  }
}



/* -------------------- FETCH SHOPS -------------------- */
const fetchShops = async () => {
  try {
    loading.value = true
    let query = supabase
      .from('shops')
      .select('id, business_name, latitude, longitude, logo_url, physical_store, detected_address, city')

    if (shopDisplayMode.value === 'within') {
      query = query.eq('city', 'Butuan City')
    }

    const { data, error } = await query
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

/* -------------------- PLOT SHOPS -------------------- */
const plotShops = async () => {
  if (!map.value || !map.value._loaded) return;

  // Remove old markers
  shopMarkers.forEach(m => map.value?.removeLayer(m));
  shopMarkers = [];

  // Loop through shops
  for (const shop of shops.value) {
    const lat = Number(shop.latitude);
    const lng = Number(shop.longitude);

    if (!isFinite(lat) || !isFinite(lng)) {
      console.warn('Invalid coordinates for shop:', shop.business_name, shop.latitude, shop.longitude);
      continue;
    }

    const imageUrl = shop.physical_store || shop.logo_url || 'https://placehold.co/80x80';

    // Calculate distance from user if available
    let distanceText = '';
    if (latitude.value && longitude.value) {
      const distance = await getDrivingDistance(latitude.value, longitude.value, lat, lng);
      if (distance) {
        distanceText = `<p>Distance: ${distance.distanceKm} km (~${distance.timeMin} min)</p>`;
      }
    }

    const marker = L.marker([lat, lng], {
      icon: shopIcon,
      title: shop.business_name,
    }).addTo(map.value);

    marker.bindPopup(`
      <div style="text-align:center;">
        <img src="${imageUrl}" width="80" height="80" style="border-radius:8px;object-fit:cover;margin-bottom:6px;" />
        <p><strong>${shop.business_name}</strong></p>
        ${distanceText}
        <button id="view-${shop.id}" style="padding:6px 12px;background:#438fda;color:#fff;border:none;border-radius:6px;cursor:pointer;">View Shop</button>
      </div>
    `);

    // Ensure the "View Shop" button works after popup opens
    marker.on("popupopen", () => {
      const btn = document.getElementById(`view-${shop.id}`);
      if (btn) btn.onclick = () => { router.push(`/shop/${shop.id}`); marker.closePopup(); };
    });

    shopMarkers.push(marker);
  }
};


/* -------------------- USER LOCATION TRACKING -------------------- */
watch([latitude, longitude], async ([lat, lng]) => {
  if (!map.value || lat == null || lng == null) return
  if (!map.value._loaded) return

  const userLat = Number(lat)
  const userLng = Number(lng)
  if (!isFinite(userLat) || !isFinite(userLng)) return

  if (userMarker) {
    userMarker.setLatLng([userLat, userLng])
  } else {
    userMarker = L.marker([userLat, userLng], { icon: userIcon })
      .addTo(map.value)
      .bindPopup('You are here')
      .openPopup()
  }

  if (recenterTimeout) clearTimeout(recenterTimeout)
  recenterTimeout = window.setTimeout(() => {
    if (map.value && map.value._loaded) {
      try {
        map.value.panTo([userLat, userLng])
      } catch (e) {
        console.warn('PanTo failed:', e)
      }
    }
  }, 600)
})

const recenterToUser = async () => {
  if (!map.value || !latitude.value || !longitude.value) return
  if (!map.value._loaded) return

  locating.value = true
  try {
    await new Promise(r => setTimeout(r, 100))
    map.value?.invalidateSize()
    map.value?.setView([latitude.value, longitude.value], 16, { animate: true })
  } catch (err) {
    console.error("Map recenter error:", err)
  } finally {
    locating.value = false
  }
}

/* -------------------- LIFECYCLE -------------------- */
onMounted(async () => {
  if (Capacitor.getPlatform() !== 'web') await requestPermission()
  initializeMap()
  map.value?.whenReady(async () => {
    await startWatching()
    await fetchShops()
    await highlightCityBoundary('Butuan City')
  })
})

onUnmounted(() => {
  stopWatching()
  if (map.value) {
    try {
      map.value.remove()
    } catch (e) {
      console.warn("Error removing map:", e)
    }
  }
})

onUnmounted(() => {
  stopWatching()
  if (map.value) {
    try {
      setTimeout(() => map.value?.remove(), 300) // delay to let animations finish
    } catch (e) {
      console.warn("Error removing map:", e)
    }
  }
})
</script>

<template>
  <v-app>
    <v-app-bar class="searchshop" color="#3f83c7" flat>
      <v-text-field v-model="search" label="Search shops..." hide-details density="comfortable" variant="outlined">
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
        <v-btn icon :loading="locating" @click="recenterToUser" class="locate-btn">
          <v-icon>mdi-crosshairs-gps</v-icon>
        </v-btn>

        <v-menu location="top" transition="scale-transition">
          <template #activator="{ props }">
            <v-btn icon v-bind="props" class="menu-options-btn">
              <v-icon>mdi-dots-vertical</v-icon>
            </v-btn>
          </template>

          <v-list>
            <v-list-item @click="shopDisplayMode = 'within'; fetchShops()">
              <v-list-item-title>Display Within City (Nearby)</v-list-item-title>
            </v-list-item>
            <v-list-item @click="shopDisplayMode = 'outside'; fetchShops()">
              <v-list-item-title>Display Outside City (Explore More)</v-list-item-title>
            </v-list-item>
          </v-list>
        </v-menu>

        <v-chip v-if="shopDisplayMode === 'outside'" color="primary" size="small" class="mode-chip">
          🌏 Exploring Outside City
        </v-chip>

        <v-btn icon @click="showShopMenu = true" class="menu-btn">
          <v-icon>mdi-menu</v-icon>
        </v-btn>
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
        <v-list-item v-for="shop in shops" :key="shop.id" @click="router.push(`/shop/${shop.id}`); showShopMenu = false">
          <template #prepend>
            <v-avatar size="40">
              <img :src="shop.logo_url || shop.physical_store || 'https://via.placeholder.com/80'" />
            </v-avatar>
          </template>
          <v-list-item-title>{{ shop.business_name }}</v-list-item-title>
          <v-list-item-subtitle v-if="shop.detected_address">{{ shop.detected_address }}</v-list-item-subtitle>
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
</style>
