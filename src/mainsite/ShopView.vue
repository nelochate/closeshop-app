<script setup lang="ts">
import { ref, onMounted, computed, nextTick, watch, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { supabase } from '@/utils/supabase'
import BottomNav from '@/common/layout/BottomNav.vue'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'

// Initialize Mapbox with your token
mapboxgl.accessToken = 'pk.eyJ1IjoiY2xvc2VzaG9wIiwiYSI6ImNtaDI2emxocjEwdnVqMHExenFpam42bjcifQ.QDsWVOHM9JPhPQ---Ca4MA'

// route + router
const route = useRoute()
const router = useRouter()
const shopId = route.params.id as string
const activeTab = ref(null)

// for chat feature
const user = ref<any>(null)
const userLoaded = ref(false)

// shop state
const shop = ref<any>(null)
const products = ref<any[]>([])
const loading = ref(true)
const errorMsg = ref('')
const mapInitialized = ref(false)

const PLACEHOLDER_IMG = 'https://picsum.photos/seed/shop/640/360'

// fetch shop
const fetchShop = async () => {
  try {
    const { data, error } = await supabase
      .from('shops')
      .select('*')
      .eq('id', shopId)
      .single()

    if (error) throw error
    shop.value = data
    
    // Debug log to check coordinates
    console.log('Shop coordinates:', {
      latitude: data.latitude,
      longitude: data.longitude,
      business_name: data.business_name
    })
    
  } catch (err: any) {
    errorMsg.value = err.message
    console.error('fetchShop error:', err)
  }
}

// fetch products
const fetchProducts = async () => {
  try {
    const { data, error } = await supabase
      .from('products')
      .select('id, prod_name, price, main_img_urls, sold')
      .eq('shop_id', shopId)

    if (error) throw error
    products.value = (data || []).map((p) => ({
      id: p.id,
      title: p.prod_name,
      price: p.price,
      sold: p.sold || 0,
      img: extractImage(p.main_img_urls),
    }))
  } catch (err: any) {
    errorMsg.value = err.message
    console.error('fetchProducts error:', err)
  }
}

// helper for images
function extractImage(main_img_urls: any) {
  if (!main_img_urls) return PLACEHOLDER_IMG
  if (Array.isArray(main_img_urls) && main_img_urls.length) return main_img_urls[0]
  if (typeof main_img_urls === 'string') {
    try {
      const parsed = JSON.parse(main_img_urls)
      if (Array.isArray(parsed) && parsed.length) return parsed[0]
    } catch {
      return main_img_urls
    }
  }
  return PLACEHOLDER_IMG
}

// Convert time to 12-hour format
const formatTime12Hour = (timeString: string) => {
  if (!timeString) return ''
  
  try {
    const [hours, minutes] = timeString.split(':')
    const hour = parseInt(hours)
    const ampm = hour >= 12 ? 'PM' : 'AM'
    const hour12 = hour % 12 || 12
    return `${hour12}:${minutes} ${ampm}`
  } catch (error) {
    console.error('Error formatting time:', error)
    return timeString
  }
}

// Check if shop is currently open
const isShopOpen = computed(() => {
  if (!shop.value) return false
  
  // Check manual status first
  if (shop.value.manual_status && shop.value.manual_status !== 'auto') {
    return shop.value.manual_status === 'open'
  }
  
  // Auto status - check business hours
  const now = new Date()
  const currentDay = now.getDay() // 0 = Sunday, 1 = Monday, etc.
  const currentTime = now.getHours() * 100 + now.getMinutes() // HHMM format
  
  // Check if shop is open today
  const openDays = shop.value.open_days || [1, 2, 3, 4, 5, 6] // Default to Mon-Sat
  if (!openDays.includes(currentDay)) {
    return false
  }
  
  // Check if within business hours
  if (shop.value.open_time && shop.value.close_time) {
    try {
      const [openHour, openMinute] = shop.value.open_time.split(':')
      const [closeHour, closeMinute] = shop.value.close_time.split(':')
      
      const openTime = parseInt(openHour) * 100 + parseInt(openMinute)
      const closeTime = parseInt(closeHour) * 100 + parseInt(closeMinute)
      
      return currentTime >= openTime && currentTime <= closeTime
    } catch (error) {
      console.error('Error parsing business hours:', error)
      return true // Default to open if there's an error
    }
  }
  
  return true // Default to open if no hours specified
})

// Get shop status display
const shopStatus = computed(() => {
  if (!shop.value) return ''
  
  if (shop.value.manual_status && shop.value.manual_status !== 'auto') {
    return shop.value.manual_status === 'open' ? 'Open' : 'Closed'
  }
  
  return isShopOpen.value ? 'Open' : 'Closed'
})

// Get shop status color
const shopStatusColor = computed(() => {
  return isShopOpen.value ? 'success' : 'error'
})

// Get shop status icon
const shopStatusIcon = computed(() => {
  return isShopOpen.value ? 'mdi-store-check' : 'mdi-store-remove'
})

// Get open days display
const openDaysDisplay = computed(() => {
  if (!shop.value?.open_days || shop.value.open_days.length === 0) {
    return 'Mon-Sat'
  }
  
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const openDayNames = shop.value.open_days.map((day: number) => dayNames[day])
  
  // If all days are open, show "Everyday"
  if (openDayNames.length === 7) return 'Everyday'
  
  // If consecutive days from Mon-Sat, show "Mon-Sat"
  if (JSON.stringify(shop.value.open_days) === JSON.stringify([1,2,3,4,5,6])) {
    return 'Mon-Sat'
  }
  
  // If consecutive days from Mon-Fri, show "Weekdays"
  if (JSON.stringify(shop.value.open_days) === JSON.stringify([1,2,3,4,5])) {
    return 'Weekdays'
  }
  
  return openDayNames.join(', ')
})

// share shop
const shareProduct = () => {
  if (navigator.share) {
    navigator
      .share({
        title: shop.value?.business_name || 'Shop',
        text: 'Check out this shop on our app!',
        url: window.location.href,
      })
      .catch((err) => console.error('Share failed:', err))
  } else {
    alert('Sharing is not supported on this device.')
  }
}

// map setup
let map: mapboxgl.Map | null = null
let marker: mapboxgl.Marker | null = null

const initMap = () => {
  // Clean up existing map
  if (map) {
    map.remove()
    map = null
    marker = null
  }

  // Check if shop has valid coordinates
  if (!shop.value?.latitude || !shop.value?.longitude) {
    console.warn('Shop coordinates not available:', {
      latitude: shop.value?.latitude,
      longitude: shop.value?.longitude
    })
    return
  }

  // Validate coordinates
  const lat = Number(shop.value.latitude)
  const lng = Number(shop.value.longitude)
  
  if (isNaN(lat) || isNaN(lng)) {
    console.error('Invalid coordinates:', { lat, lng })
    return
  }

  // Use nextTick to ensure DOM is ready
  nextTick(() => {
    const mapElement = document.getElementById('shop-map')
    if (!mapElement) {
      console.error('Map element not found')
      return
    }

    try {
      // Initialize map with validated coordinates
      map = new mapboxgl.Map({
        container: 'shop-map',
        style: 'mapbox://styles/mapbox/streets-v11',
        center: [lng, lat],
        zoom: 15,
        attributionControl: true
      })

      // Add navigation controls
      map.addControl(new mapboxgl.NavigationControl(), 'top-right')

      // Create popup content
      const popupContent = `
        <div style="padding: 12px;">
          <strong style="font-size: 14px;">${shop.value.business_name || 'Shop'}</strong><br/>
          <small style="font-size: 12px; color: #666;">${shop.value.description || ''}</small>
        </div>
      `

      // Create a popup
      const popup = new mapboxgl.Popup({ offset: 25 })
        .setHTML(popupContent)

      // Create custom marker element
      const markerEl = document.createElement('div')
      markerEl.className = 'custom-marker'
      markerEl.innerHTML = `
        <div style="
          width: 40px;
          height: 40px;
          background-color: #438fda;
          border-radius: 50%;
          border: 3px solid white;
          box-shadow: 0 2px 5px rgba(0,0,0,0.3);
          display: flex;
          align-items: center;
          justify-content: center;
        ">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
            <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
          </svg>
        </div>
      `

      // Add marker with popup
      marker = new mapboxgl.Marker({
        element: markerEl,
        anchor: 'bottom'
      })
        .setLngLat([lng, lat])
        .setPopup(popup)
        .addTo(map)

      // Open popup by default
      marker.togglePopup()

      console.log('Mapbox map initialized with coordinates:', { lat, lng })

      // Handle map load event
      map.on('load', () => {
        console.log('Mapbox map loaded')
        mapInitialized.value = true
      })

      // Handle map errors
      map.on('error', (e) => {
        console.error('Mapbox error:', e)
      })

    } catch (error) {
      console.error('Error initializing Mapbox:', error)
    }
  })
}

// Watch for shop data changes and initialize map when coordinates are available
watch(() => shop.value, (newShop) => {
  if (newShop?.latitude && newShop?.longitude && !mapInitialized.value) {
    console.log('Shop data loaded with coordinates, initializing map...')
    // Small delay to ensure DOM is fully rendered
    setTimeout(() => {
      initMap()
    }, 500)
  }
}, { deep: true })

// Load all data
const initializeAfterDataLoad = async () => {
  loading.value = true
  await loadUser()
  await fetchShop()
  await fetchProducts()
  loading.value = false
}

onMounted(() => {
  initializeAfterDataLoad()
})

// Reinitialize map when component is activated (for Vue Router)
import { onActivated } from 'vue'
onActivated(() => {
  if (map && shop.value?.latitude && shop.value?.longitude) {
    setTimeout(() => {
      map?.resize()
    }, 100)
  }
})

// Clean up map on component unmount
onUnmounted(() => {
  if (map) {
    map.remove()
    map = null
    marker = null
  }
})

//for chat feature
const loadUser = async () => {
  try {
    const { data, error } = await supabase.auth.getUser()
    if (error) throw error
    user.value = data.user
  } catch (err) {
    console.error('getUser error:', err)
    user.value = null
  } finally {
    userLoaded.value = true
  }
}

const isOwner = computed(() => {
  if (!user.value || !shop.value) return false
  return user.value.id === shop.value.owner_id
})

// Check if shop has valid coordinates
const hasValidCoordinates = computed(() => {
  if (!shop.value?.latitude || !shop.value?.longitude) return false
  
  const lat = Number(shop.value.latitude)
  const lng = Number(shop.value.longitude)
  
  return !isNaN(lat) && !isNaN(lng) && 
         lat >= -90 && lat <= 90 && 
         lng >= -180 && lng <= 180
})
</script>

<template>
  <v-app>
    <!-- Top Nav -->
    <v-app-bar color="#438fda" dark flat>
      <v-btn icon @click="router.back()">
        <v-icon>mdi-arrow-left</v-icon>
      </v-btn>
      <v-toolbar-title class="top-text"><strong>Shop Details</strong></v-toolbar-title>
      <v-spacer />
      <v-btn
        icon
        v-if="userLoaded && !isOwner && shop?.owner_id"
        @click="router.push({ name: 'chatview', params: { id: shop.owner_id } })"
      >
        <v-icon>mdi-message-text</v-icon>
      </v-btn>

      <v-btn icon @click="shareProduct">
        <v-icon>mdi-share-variant-outline</v-icon>
      </v-btn>
    </v-app-bar>

    <v-main>
      <v-container class="py-0 px-0">
        <!-- Cover -->
        <v-img
          :src="shop?.physical_store || PLACEHOLDER_IMG"
          height="200"
          cover
          class="cover-photo"
        >
          <template #placeholder>
            <v-skeleton-loader type="image" height="200" />
          </template>
        </v-img>

        <!-- Avatar + Info -->
        <div class="avatar-wrapper">
          <v-avatar size="96" class="avatar-border">
            <v-img v-if="shop?.logo_url" :src="shop.logo_url" cover />
            <v-icon v-else size="48">mdi-store</v-icon>
          </v-avatar>
        </div>

        <v-container class="py-4">
          <!-- Shop Status Badge -->
          <div class="d-flex align-center mb-2">
            <v-chip :color="shopStatusColor" size="small" class="mr-2">
              <v-icon start :icon="shopStatusIcon" size="small"></v-icon>
              {{ shopStatus }}
            </v-chip>
            <span class="text-caption text-medium-emphasis">
              {{ openDaysDisplay }}
            </span>
          </div>

          <h2 class="text-h6">{{ shop?.business_name || 'Shop' }}</h2>
          <p class="text-body-2 text-medium-emphasis">
            {{ shop?.description || 'No description yet.' }}
          </p>

          <div class="mt-2 text-body-2">
            <p>
              <v-icon small start>mdi-clock</v-icon> 
              <span v-if="shop?.open_time && shop?.close_time">
                {{ formatTime12Hour(shop.open_time) }} – {{ formatTime12Hour(shop.close_time) }}
              </span>
              <span v-else>Hours not specified</span>
            </p>
            <p>
              <v-icon small start>mdi-map-marker</v-icon>
              {{
                [
                  shop?.house_no,
                  shop?.building,
                  shop?.street,
                  shop?.barangay,
                  shop?.city,
                  shop?.province,
                  shop?.region,
                  shop?.postal,
                ]
                  .filter(Boolean)
                  .join(', ')
              }}
            </p>
          </div>
        </v-container>

        <!-- Mini Map -->
        <v-container v-if="hasValidCoordinates">
          <h3 class="text-h6 mb-2">Location</h3>
          <div id="shop-map"></div>
          <div class="text-caption text-medium-emphasis mt-1 text-center">
            Coordinates: {{ Number(shop.latitude).toFixed(6) }}, {{ Number(shop.longitude).toFixed(6) }}
          </div>
        </v-container>

        <v-container v-else>
          <h3 class="text-h6 mb-2">Location</h3>
          <div class="empty-card">
            <div class="empty-title">Location not available</div>
            <div class="empty-sub">This shop hasn't set up their location yet.</div>
            <div v-if="shop?.latitude || shop?.longitude" class="text-caption text-error mt-2">
              Invalid coordinates: {{ shop?.latitude }}, {{ shop?.longitude }}
            </div>
          </div>
        </v-container>

        <!-- Products -->
        <v-divider></v-divider>
        <v-container>
          <h3 class="text-h6 mb-2">Products</h3>

          <template v-if="loading">
            <v-skeleton-loader v-for="i in 4" :key="i" type="image, text" class="mb-4" />
          </template>

          <template v-else-if="products.length === 0">
            <div class="empty-card">
              <div class="empty-title">No products yet</div>
              <div class="empty-sub">This shop hasn't added products.</div>
            </div>
          </template>

          <template v-else>
            <div class="product-grid">
              <div
                v-for="item in products"
                :key="item.id"
                class="product-card"
                @click="router.push(`/product/${item.id}`)"
              >
                <v-img :src="item.img" height="140" cover />
                <div class="product-info">
                  <div class="product-title">{{ item.title }}</div>
                  <div class="product-price">₱{{ Number(item.price).toFixed(2) }}</div>
                  <div class="product-sold">{{ item.sold }} sold</div>
                </div>
              </div>
            </div>
          </template>
        </v-container>

        <v-alert v-if="errorMsg" type="error" class="ma-4">
          {{ errorMsg }}
        </v-alert>
      </v-container>
    </v-main>

    <!-- Bottom Navigation -->
    <BottomNav v-model="activeTab" />
  </v-app>
</template>

<style scoped>
.top-text {
  font-size: 19px;
  font-weight: 400;
  margin-left: -2px;
}
.cover-photo {
  border-bottom-left-radius: 12px;
  border-bottom-right-radius: 12px;
}
.avatar-wrapper {
  display: flex;
  justify-content: center;
  margin-top: -48px;
}
.avatar-border {
  border: 4px solid #fff;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  background: #fff;
}
#shop-map {
  width: 100%;
  height: 250px;
  border-radius: 12px;
  margin-bottom: 16px;
  background: #f5f5f5;
  position: relative;
}
.product-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 12px;
}
.product-card {
  background: #fff;
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
  cursor: pointer;
  transition: transform 0.2s;
}
.product-card:hover {
  transform: translateY(-2px);
}
.product-info {
  padding: 8px;
}
.product-title {
  font-size: 13px;
  font-weight: 500;
  color: #111827;
  margin-bottom: 2px;
}
.product-price {
  font-size: 14px;
  font-weight: 700;
  color: #e53935;
}
.product-sold {
  font-size: 12px;
  color: #6b7280;
}
.empty-card {
  background: #f9fafb;
  border-radius: 8px;
  padding: 16px;
  text-align: center;
}
.empty-title {
  font-weight: 700;
  color: #1f2937;
}
.empty-sub {
  font-size: 12px;
  color: #6b7280;
}

/* Mapbox custom marker */
.custom-marker {
  cursor: pointer;
}

/* Mapbox controls styling */
:deep(.mapboxgl-ctrl-group) {
  border-radius: 8px !important;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1) !important;
}

:deep(.mapboxgl-ctrl-group button) {
  width: 36px !important;
  height: 36px !important;
}

:deep(.mapboxgl-ctrl-zoom-in) {
  border-radius: 8px 8px 0 0 !important;
}

:deep(.mapboxgl-ctrl-zoom-out) {
  border-radius: 0 0 8px 8px !important;
}

:deep(.mapboxgl-popup) {
  max-width: 200px !important;
}

:deep(.mapboxgl-popup-content) {
  border-radius: 8px !important;
  padding: 0 !important;
  box-shadow: 0 4px 12px rgba(0,0,0,0.15) !important;
}

:deep(.mapboxgl-popup-close-button) {
  font-size: 20px !important;
  padding: 8px !important;
}
</style>