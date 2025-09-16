<script setup lang="js">
import { onMounted, ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useGeolocation } from '@/composables/useGeolocation'
import { useCartStore } from '@/stores/cart'

// ---------------------------
// Router & state
// ---------------------------
const router = useRouter()
const search = ref('')
const activeTab = ref('home')

// ---------------------------
// Search
// ---------------------------
const onSearch = () => {
  const q = search.value.trim()
  if (!q) return
  console.log('Searching for:', q)
  // router.push({ name: 'search', query: { q } })
}

// ---------------------------
// Geolocation (for "Shops Near You")
// ---------------------------
const { latitude, longitude, error, requestPermission, getLocation } = useGeolocation()

// Downtown Butuan fallback (~Guingona Park vicinity)
const BUTUAN_CENTER = { lat: 8.94917, lng: 125.54361 }

// km distance helper (Haversine)
const haversineKm = (a, b) => {
  const R = 6371
  const toRad = (d) => (d * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const s1 = Math.sin(dLat / 2) ** 2
  const s2 = Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(s1 + s2))
}

// Example shops near Butuan center (replace with your API later)
const shops = [
  { id: 's1', name: 'Sample Mart',        lat: 8.9510, lng: 125.5400, address: 'J.P. Rosales Ave, Butuan' },
  { id: 's2', name: 'Downtown Grocer',    lat: 8.9462, lng: 125.5460, address: 'Montilla Blvd, Butuan' },
  { id: 's3', name: 'Agusan Electronics', lat: 8.9525, lng: 125.5485, address: 'JC Aquino Ave, Butuan' },
  { id: 's4', name: 'Balangay Fashion',   lat: 8.9448, lng: 125.5412, address: 'Ochoa Ave, Butuan' },
  { id: 's5', name: 'Home Essentials',    lat: 8.9561, lng: 125.5442, address: 'JC Aquino Ave, Butuan' },
]

const nearbyShops = computed(() => {
  const origin = (latitude.value && longitude.value)
    ? { lat: latitude.value, lng: longitude.value }
    : BUTUAN_CENTER
  return shops
    .map(s => ({ ...s, distanceKm: Math.round(haversineKm(origin, { lat: s.lat, lng: s.lng }) * 10) / 10 }))
    .sort((a, b) => (a.distanceKm ?? 0) - (b.distanceKm ?? 0))
    .slice(0, 5)
})

// ---------------------------
// E-commerce: Popular items
// ---------------------------
const loadingPopular = ref(true)
const products = ref([])
const selectedCategory = ref(null)
const categories = ['Groceries','Electronics','Fashion','Home','Food']
const peso = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' })

const fetchPopular = async () => {
  // TODO: replace with your real API call
  products.value = [
    { id:'p1', title:'Calamansi (1kg)',           image:'https://picsum.photos/seed/calamansi/400/300', price:  89, rating:4.6, category:'Groceries' },
    { id:'p2', title:'Butuan Premium Rice (5kg)', image:'https://picsum.photos/seed/rice/400/300',      price: 399, rating:4.8, category:'Groceries' },
    { id:'p3', title:'Wireless Earbuds',          image:'https://picsum.photos/seed/earbuds/400/300',   price:1299, salePrice: 999, rating:4.4, category:'Electronics' },
    { id:'p4', title:'Banana Turon (Box of 6)',   image:'https://picsum.photos/seed/turon/400/300',     price: 150, rating:4.9, category:'Food' },
    { id:'p5', title:'Abaca Tote Bag',            image:'https://picsum.photos/seed/abaca/400/300',     price: 550, rating:4.7, category:'Fashion' },
  ]
  loadingPopular.value = false
}

const displayProducts = computed(() => {
  if (!selectedCategory.value) return products.value
  return products.value.filter(p => p.category === selectedCategory.value)
})

// ---------------------------
// Cart (Pinia)
// ---------------------------
const cart = useCartStore()
const addToCart = (p) => {
  cart.add({ id: p.id, title: p.title, price: p.salePrice ?? p.price, image: p.image }, 1)
}

// ---------------------------
// Navigation fns
// ---------------------------
const goHome          = () => router.push('/homepage')
const goCart          = () => router.push('/cartview')
const goChat          = () => router.push('/messageview')
const goMap           = () => router.push('/mapsearch')
const goNotifications = () => router.push('/notificationview')
const goAccount       = () => router.push('/profileview')

// ---------------------------
// Lifecycle
// ---------------------------
onMounted(async () => {
  try {
    await requestPermission()
    await getLocation()
  } catch (e) {
    console.warn('Location unavailable:', e)
  }
  fetchPopular()
})
</script>

<template>
  <v-app>
    <!-- Top Navigation -->
    <v-app-bar class="top-nav" flat color="#5ca3eb">
      <div class="ma-4 d-flex align-center" style="gap:8px">
        <v-text-field
          v-model="search"
          label="Search..."
          hide-details
          density="comfortable"
          variant="outlined"
          class="search-bar"
          clearable
          prepend-inner-icon="mdi-magnify"
          @keyup.enter="onSearch"
          @click:prepend-inner="onSearch"
        />
        <v-btn icon @click="goNotifications" aria-label="Notifications">
          <v-icon>mdi-bell-outline</v-icon>
        </v-btn>
      </div>
    </v-app-bar>

    <!-- Main Content -->
    <v-main class="app-main">
      <!-- Popular items header -->
      <div class="d-flex justify-space-between align-center">
        <h3 class="mb-0"><strong><u>Popular items</u></strong></h3>
        <v-btn variant="text" @click="$router.push('/popular')">See more</v-btn>
      </div>

      <!-- Category chips -->
      <div class="mt-2">
        <v-chip class="mr-2" :variant="!selectedCategory ? 'flat' : 'tonal'" @click="selectedCategory = null">All</v-chip>
        <v-chip
          v-for="c in categories"
          :key="c"
          class="mr-2"
          :variant="selectedCategory === c ? 'flat' : 'tonal'"
          @click="selectedCategory = c"
        >
          {{ c }}
        </v-chip>
      </div>

      <!-- Loading skeletons -->
      <div v-if="loadingPopular" class="d-flex mt-4" style="gap:16px; overflow-x:auto;">
        <v-skeleton-loader v-for="i in 4" :key="i" type="image, list-item-two-line" width="220" />
      </div>

      <!-- Horizontal scroller of products -->
      <v-slide-group v-else show-arrows class="mt-4">
        <v-slide-group-item v-for="p in displayProducts" :key="p.id">
          <v-card width="220" class="mr-4">
            <v-img :src="p.image" height="140" cover />
            <v-card-title class="text-truncate">{{ p.title }}</v-card-title>
            <v-card-subtitle class="d-flex align-center" style="gap:8px">
              <strong>{{ peso.format(p.salePrice ?? p.price) }}</strong>
              <span v-if="p.salePrice" class="text-disabled text-decoration-line-through">
                {{ peso.format(p.price) }}
              </span>
            </v-card-subtitle>
            <v-card-text class="pt-0">
              <v-rating :model-value="p.rating ?? 4.5" density="compact" readonly size="small" />
            </v-card-text>
            <v-card-actions>
              <v-btn variant="flat" block @click="addToCart(p)">
                <v-icon start>mdi-cart-plus</v-icon> Add
              </v-btn>
            </v-card-actions>
          </v-card>
        </v-slide-group-item>
      </v-slide-group>

      <!-- Shops Near You -->
      <h3 class="mt-8"><strong><u>Shops Near You</u></strong></h3>
      <v-alert v-if="error" type="warning" class="mb-2">
        Couldn't access your location. Showing shops near downtown Butuan.
      </v-alert>
      <v-list>
        <v-list-item
          v-for="s in nearbyShops"
          :key="s.id"
          :title="s.name"
          :subtitle="s.distanceKm + ' km • ' + (s.address ?? '')"
          @click="goMap"
        >
          <template #prepend><v-icon>mdi-storefront-outline</v-icon></template>
          <template #append>
            <v-btn variant="text" size="small" @click.stop="goMap">View</v-btn>
          </template>
        </v-list-item>
      </v-list>
    </v-main>

    <!-- Bottom Navigation -->
    <v-bottom-navigation class="bot-nav" height="64" v-model="activeTab">
      <v-btn value="home" @click="goHome"><v-icon>mdi-home-outline</v-icon></v-btn>

      <v-btn value="cart" @click="goCart">
        <v-badge v-if="cart.count" :content="cart.count" floating>
          <v-icon>mdi-cart-outline</v-icon>
        </v-badge>
        <template v-else>
          <v-icon>mdi-cart-outline</v-icon>
        </template>
      </v-btn>

      <v-btn value="map"  @click="goMap"><v-icon>mdi-search-web</v-icon></v-btn>
      <v-btn value="chat" @click="goChat"><v-icon>mdi-chat-outline</v-icon></v-btn>
      <v-btn value="account" @click="goAccount"><v-icon>mdi-account-check-outline</v-icon></v-btn>
    </v-bottom-navigation>
  </v-app>
</template>

<style scoped>
.bot-nav { background-color: #5ca3eb; }
.search-bar { max-width: 600px; flex: 1; }
.app-main { padding: 16px; margin-bottom: 64px; }
</style>
