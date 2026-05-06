<script setup>
import { ref, onMounted, onUnmounted, computed } from 'vue' // Added computed
import { useRouter } from 'vue-router'
import BottomNav from '@/common/layout/BottomNav.vue'
import { supabase } from '@/utils/supabase'
import { Geolocation } from '@capacitor/geolocation'
//import { PushNotifications } from '@capacitor/push-notifications'
import { Network } from '@capacitor/network'
import { Capacitor } from '@capacitor/core'
import {
  getVisibleUnreadNotificationCount,
  resolveVisibleNotification,
} from '@/utils/chatNotifications'

import PullToRefreshWrapper from '@/components/PullToRefreshWrapper.vue'

const router = useRouter()
const activeTab = ref('home')
const products = ref([])
const nearby = ref([])
const loading = ref(true)
const errorMsg = ref('')

// notification state
const unreadNotifications = ref(0)
const notificationSubscription = ref(null)

// Add subscription for real-time product updates
const productsSubscription = ref(null)

const PLACEHOLDER_IMG = 'https://picsum.photos/seed/shop/480/360'

// Safe area insets for notches and camera cutouts
const heroPaddingTop = ref('env(safe-area-inset-top)')

// Refresh handler function
const handleRefresh = async () => {
  console.log('🔄 Pull-to-refresh triggered - Refreshing home page...')

  try {
    // Refresh shops
    await fetchShops()

    // Refresh products
    await fetchProducts()

    // Refresh notification count
    await fetchUnreadNotificationCount()

    console.log('✅ Home page refresh complete!')
  } catch (error) {
    console.error('❌ Refresh failed:', error)
    errorMsg.value = 'Failed to refresh data'
  }
}

// Function to get safe area insets dynamically
const updateSafeAreaInsets = () => {
  const computedStyle = getComputedStyle(document.documentElement)
  const topInset = computedStyle.getPropertyValue('env(safe-area-inset-top)')

  console.log('Safe area top inset:', topInset)

  // Set padding values based on safe area
  if (topInset && topInset !== '0px') {
    heroPaddingTop.value = `calc(12px + ${topInset})`
  } else {
    // Fallback for devices without notch detection
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
    const isAndroid = /Android/.test(navigator.userAgent)

    if (isIOS) {
      heroPaddingTop.value = 'calc(12px + 44px)' // iOS status bar height
    } else if (isAndroid) {
      heroPaddingTop.value = 'calc(12px + 24px)' // Android status bar height
    } else {
      heroPaddingTop.value = '12px'
    }
  }
}

//Search Functionality
const searchQuery = ref('')
function goToSearch() {
  if (router.currentRoute.value.name !== 'search') {
    router.push({ name: 'search', query: { q: searchQuery.value || '' } })
  }
}

function updateSearch() {
  // instantly sync search input with SearchView via query param
  router.replace({ name: 'search', query: { q: searchQuery.value } })
}

/* 🧭 Location Permission */
async function requestLocationPermission() {
  try {
    console.log('📍 Requesting location permission...')

    // Check current permission status first
    const currentPerm = await Geolocation.checkPermissions()
    if (currentPerm.location === 'granted') {
      console.log('📍 Location already granted')
      return true
    }

    // Request permission
    const perm = await Geolocation.requestPermissions()
    if (perm.location === 'granted') {
      console.log('📍 Location permission granted')
      return true
    } else {
      console.warn('📍 Location permission denied by user')
      return false
    }
  } catch (err) {
    console.error('📍 Error requesting location permission:', err)
    return false
  }
}

/* 📍 Smart Location Fetching with Fallbacks */
async function getUserLocation() {
  let coords = null
  let accuracy = 'unknown'

  try {
    console.log('📍 Attempting high accuracy location...')

    // Strategy 1: High accuracy (GPS) - 10 second timeout
    coords = await Geolocation.getCurrentPosition({
      enableHighAccuracy: true,
      timeout: 10000, // 10 seconds for GPS
      maximumAge: 0, // Don't use cached position
    })
    accuracy = 'high'
    console.log('📍 High accuracy location acquired:', coords.coords)
  } catch (highAccuracyError) {
    console.warn('📍 High accuracy failed, trying standard accuracy...', highAccuracyError)

    try {
      // Strategy 2: Standard accuracy (WiFi/cell) - 5 second timeout
      coords = await Geolocation.getCurrentPosition({
        enableHighAccuracy: false, // Faster but less accurate
        timeout: 5000, // 5 seconds
        maximumAge: 300000, // Accept position up to 5 minutes old
      })
      accuracy = 'medium'
      console.log('📍 Standard accuracy location acquired:', coords.coords)
    } catch (standardError) {
      console.warn('📍 Standard accuracy failed, using last known position...', standardError)

      // Strategy 3: Last known position from localStorage
      const lastKnown = getLastKnownLocation()
      if (lastKnown) {
        coords = { coords: lastKnown }
        accuracy = 'cached'
        console.log('📍 Using cached location:', lastKnown)
      } else {
        throw new Error('All location methods failed')
      }
    }
  }

  // Save successful location for future fallback
  if (coords && coords.coords && accuracy !== 'cached') {
    saveLastKnownLocation(coords.coords)
  }

  return {
    coords: coords?.coords,
    accuracy,
    timestamp: Date.now(),
  }
}

/* 💾 Cache Location Helpers */
function getLastKnownLocation() {
  try {
    const cached = localStorage.getItem('lastKnownLocation')
    if (cached) {
      const { latitude, longitude, timestamp } = JSON.parse(cached)
      // Only use if less than 1 hour old
      if (Date.now() - timestamp < 3600000) {
        return { latitude, longitude }
      }
    }
  } catch (e) {
    console.warn('Could not read cached location', e)
  }
  return null
}

function saveLastKnownLocation(coords) {
  try {
    const locationData = {
      latitude: coords.latitude,
      longitude: coords.longitude,
      accuracy: coords.accuracy,
      timestamp: Date.now(),
    }
    localStorage.setItem('lastKnownLocation', JSON.stringify(locationData))
  } catch (e) {
    console.warn('Could not save location cache', e)
  }
}

/* 🔔 Push Notifications — Native Only (Capacitor) */
async function setupPushNotifications() {
  try {
    // Step 1: Check permission
    let permStatus = await PushNotifications.checkPermissions()
    if (permStatus.receive !== 'granted') {
      const req = await PushNotifications.requestPermissions()
      if (req.receive !== 'granted') {
        console.warn('❌ Notifications permission denied.')
        return
      }
    }

    // Step 2: Register with APNS/FCM (handled internally by Capacitor)
    // await PushNotifications.register()

    // Step 3: Handle successful registration (token received)
    PushNotifications.addListener('registration', async (token) => {
      console.log('✅ Push token (Capacitor):', token.value)

      // Optional: Save token to Supabase for your backend
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (user) {
        const { error } = await supabase
          .from('user_fcm_tokens')
          .upsert({ user_id: user.id, token: token.value }, { onConflict: 'user_id' })
        if (error) console.error('Error saving push token:', error)
        else console.log('✅ Token saved to Supabase')
      }
    })

    // Step 4: Handle registration errors
    PushNotifications.addListener('registrationError', (error) => {
      console.error('❌ Push registration error:', error)
    })

    // Step 5: Handle foreground notifications
    PushNotifications.addListener('pushNotificationReceived', (notification) => {
      console.log('📩 Push received:', notification)
    })

    // Step 6: Handle user tapping a notification
    PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
      console.log('🖱️ Notification action:', action.notification)
    })
  } catch (err) {
    console.error('⚠️ setupPushNotifications error:', err)
  }
}

/* 🌐 Network Status */
async function checkNetworkStatus() {
  try {
    const status = await Network.getStatus()
    console.log('📶 Network status:', status)
    if (!status.connected) {
      alert('No internet connection. Please connect to Wi-Fi or mobile data.')
    }

    Network.addListener('networkStatusChange', (status) => {
      console.log('🌐 Network changed:', status)
      if (!status.connected) {
        alert('⚠️ You are offline.')
      } else {
        console.log('✅ Back online.')
      }
    })
  } catch (err) {
    console.error('Network check error:', err)
  }
}

/* 🏪 Fetch Shops with Smart Location Handling */
async function fetchShops() {
  let userLat = null
  let userLon = null
  let locationAccuracy = 'none'

  try {
    // Get user location with fallbacks
    const locationResult = await getUserLocation()
    if (locationResult.coords) {
      userLat = locationResult.coords.latitude
      userLon = locationResult.coords.longitude
      locationAccuracy = locationResult.accuracy
    }

    console.log(`📍 Using location with accuracy: ${locationAccuracy}`)
  } catch (locationError) {
    console.warn('📍 Could not get user location, showing all shops:', locationError)
    // Continue without location - we'll show all shops
  }

  try {
    const { data, error } = await supabase
      .from('shops')
      .select(
        'id, business_name, description, logo_url, physical_store, building, street, barangay, city, province, region, latitude, longitude, status',
      )
      .eq('status', 'approved')
      .not('latitude', 'is', null)
      .not('longitude', 'is', null)

    if (error) throw error

    // Compute distance only if we have user location
    function calculateDistance(lat1, lon1, lat2, lon2) {
      const R = 6371 // Earth radius in km
      const dLat = ((lat2 - lat1) * Math.PI) / 180
      const dLon = ((lon2 - lon1) * Math.PI) / 180
      const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos((lat1 * Math.PI) / 180) *
          Math.cos((lat2 * Math.PI) / 180) *
          Math.sin(dLon / 2) *
          Math.sin(dLon / 2)
      return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
    }

    let mapped = data.map((s) => {
      let distance = null
      let distanceAccuracy = 'unknown'

      if (userLat && userLon && s.latitude && s.longitude) {
        distance = calculateDistance(userLat, userLon, s.latitude, s.longitude)
        distanceAccuracy = locationAccuracy
      }

      return {
        id: s.id,
        title: s.business_name,
        img: s.physical_store || PLACEHOLDER_IMG,
        logo: s.logo_url,
        address: [s.building, s.street, s.barangay, s.city, s.province].filter(Boolean).join(', '),
        distance,
        distanceAccuracy,
        hasExactLocation: !!(s.latitude && s.longitude),
      }
    })

    // Sort by distance if available, otherwise keep original order
    if (userLat && userLon) {
      mapped.sort((a, b) => {
        // Put shops with unknown distance at the end
        if (a.distance === null) return 1
        if (b.distance === null) return -1
        return a.distance - b.distance
      })
    }

    nearby.value = mapped
  } catch (err) {
    console.error('fetchShops error:', err)
    errorMsg.value = 'Failed to load shops'
    nearby.value = []
  }
}

/* 🛍️ Fetch Products from Approved Shops */
async function fetchProducts() {
  try {
    const { data, error } = await supabase
      .from('products')
      .select(
        `
        id,
        prod_name,
        price,
        main_img_urls,
        sold,
        stock,
        shop_id,
        shops!inner (status)
      `,
      )
      .eq('shops.status', 'approved') // ✅ Only shops approved

    if (error) throw error

    products.value = (data || []).map((p) => ({
      id: p.id,
      title: p.prod_name,
      price: p.price,
      img: extractImage(p.main_img_urls),
      sold: p.sold || 0,
      stock: p.stock || 0,
    }))
  } catch (err) {
    console.error('fetchProducts error:', err)
    errorMsg.value = err.message
    products.value = []
  }
}

/* 🖼️ Normalize Image */
function extractImage(main_img_urls) {
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

/* 🔔 Notification System */
async function setupNotificationListener() {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return

  // Fetch initial unread count
  await fetchUnreadNotificationCount()

  // Subscribe to real-time notifications
  notificationSubscription.value = supabase
    .channel('user-notifications')
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${user.id}`,
      },
      async (payload) => {
        console.log('New notification received:', payload)

        const visibleNotification = await resolveVisibleNotification(payload.new)

        if (!visibleNotification) {
          return
        }

        unreadNotifications.value++

        // Show native notification if enabled
        if (Notification.permission === 'granted') {
          new Notification('CloseShop', {
            body: visibleNotification.message,
            icon: '/icon.png',
          })
        }
      },
    )
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${user.id}`,
      },
      (payload) => {
        // If notification is marked as read, decrease count
        if (payload.new.is_read && !payload.old.is_read) {
          unreadNotifications.value = Math.max(0, unreadNotifications.value - 1)
        }
      },
    )
    .subscribe()
}

async function fetchUnreadNotificationCount() {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return

  unreadNotifications.value = await getVisibleUnreadNotificationCount(user.id)
}

// NEW: Setup real-time product updates subscription
async function setupProductsSubscription() {
  if (productsSubscription.value) {
    productsSubscription.value.unsubscribe()
  }

  // Subscribe to real-time updates on products table
  productsSubscription.value = supabase
    .channel('products-changes')
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'products',
      },
      (payload) => {
        console.log('🔄 Product updated in real-time:', payload)

        // Update the sold count for the specific product
        const updatedProduct = payload.new
        const productIndex = products.value.findIndex((p) => p.id === updatedProduct.id)

        if (productIndex !== -1) {
          const oldSold = products.value[productIndex].sold
          const newSold = updatedProduct.sold || 0

          // Update product with sold and stock
          products.value[productIndex] = {
            ...products.value[productIndex],
            sold: newSold,
            stock: updatedProduct.stock || 0,
          }

          // Log the update
          if (newSold > oldSold) {
            console.log(`🔥 Product ${updatedProduct.id} sales increased: ${oldSold} → ${newSold}`)
          } else if (newSold < oldSold) {
            console.log(`📉 Product ${updatedProduct.id} sales adjusted: ${oldSold} → ${newSold}`)
          }
          console.log(
            `✅ Updated product ${updatedProduct.id}: sold=${newSold}, stock=${updatedProduct.stock}`,
          )
        }
      },
    )
    .subscribe()

  console.log('📡 Subscribed to real-time product updates')
}

// NEW: Function to refresh all products data
async function refreshProductsData() {
  console.log('🔄 Refreshing products data...')
  await fetchProducts()
  console.log('✅ Products data refreshed')
}

/* 🚀 Main Lifecycle */
onMounted(async () => {
  updateSafeAreaInsets()

  // Listen for orientation changes
  window.addEventListener('resize', updateSafeAreaInsets)
  window.addEventListener('orientationchange', updateSafeAreaInsets)

  try {
    loading.value = true
    errorMsg.value = ''

    // Only run these on mobile builds
    if (Capacitor.isNativePlatform()) {
      await checkNetworkStatus()

      // Request location in background - don't block UI
      const locationPromise = requestLocationPermission()
        .then((hasPermission) => {
          if (hasPermission) {
            console.log('📍 Location permission granted, will use for sorting')
          }
          return hasPermission
        })
        .catch((err) => {
          console.warn('📍 Location setup completed with warnings:', err)
          return false
        })

      await setupPushNotifications()

      // Wait a bit for location if possible, but don't block
      await Promise.race([locationPromise, new Promise((resolve) => setTimeout(resolve, 2000))])
    }

    // Setup notification listener
    await setupNotificationListener()

    // Setup real-time products subscription
    await setupProductsSubscription()

    // Load shops and products in parallel
    await Promise.all([fetchShops(), fetchProducts()])

    // Show survey bubble after a delay (3 seconds)
    setTimeout(() => {
      showSurveyBubble.value = true
    }, 3000)
  } catch (err) {
    console.error('❌ Error in onMounted:', err)
    errorMsg.value = 'Failed to load app data'
  } finally {
    loading.value = false
  }
})

// Cleanup subscriptions - ✅ FIXED: Now properly imported
onUnmounted(() => {
  window.removeEventListener('resize', updateSafeAreaInsets)
  window.removeEventListener('orientationchange', updateSafeAreaInsets)

  if (notificationSubscription.value) {
    notificationSubscription.value.unsubscribe()
  }

  // Clean up products subscription
  if (productsSubscription.value) {
    productsSubscription.value.unsubscribe()
    console.log('📡 Unsubscribed from product updates')
  }
})

/* 🧭 Navigation */
const seeMoreNearby = () => router.push('/mapsearch')
const goNotifications = () => router.push('/notificationview')
const goToProduct = (id) => router.push({ name: 'product-detail', params: { id } })
const goToShop = (id) => router.push({ name: 'shop-view', params: { id } })

//for embedded survey
const showSurvey = ref(false)
const hasAnsweredSurvey = ref(false)
const showSurveyBubble = ref(false)

function openSurvey() {
  showSurvey.value = true
  showSurveyBubble.value = false // Hide bubble when user opens the survey
}

function markSurveyAnswered() {
  hasAnsweredSurvey.value = true
  localStorage.setItem('surveyAnswered', 'true')
  showSurvey.value = false
  showSurveyBubble.value = false
}

// Add these helper functions
const locationAccuracy = ref('none')

const getLocationStatusColor = (accuracy) => {
  switch (accuracy) {
    case 'high':
      return 'success'
    case 'medium':
      return 'warning'
    case 'cached':
      return 'info'
    default:
      return 'default'
  }
}

const getLocationStatusText = (accuracy) => {
  switch (accuracy) {
    case 'high':
      return 'Accurate'
    case 'medium':
      return 'Approximate'
    case 'cached':
      return 'Last Known'
    default:
      return 'No Location'
  }
}

// Auto-hide bubble after 15 seconds
onMounted(() => {
  setTimeout(() => {
    showSurveyBubble.value = false
  }, 15000)
})

// Optional: Add a computed property for formatted product data
const formattedProducts = computed(() => {
  return products.value.map((product) => ({
    ...product,
    formattedSold: product.sold.toLocaleString(),
    formattedPrice: `₱${Number(product.price).toFixed(2)}`,
  }))
})

// Replace the existing hotPicks computed property with this:
const hotPicks = computed(() => {
  // Filter products that have the "hot" badge criteria:
  // 1. Stock > 0 (in stock)
  // 2. Sold >= 50 (meets hot threshold)
  const hotProducts = products.value.filter(product => 
    product.stock > 0 && product.sold >= 50
  )
  
  // Sort by sold count (highest first) and add rank numbers
  const sorted = [...hotProducts]
    .sort((a, b) => (b.sold || 0) - (a.sold || 0))
    .slice(0, 10) // Show top 10 hot products
  
  // Add rank numbers
  return sorted.map((product, index) => ({
    ...product,
    rank: index + 1
  }))
})

</script>

<template>
  <v-app>
    <PullToRefreshWrapper :on-refresh="handleRefresh">
      <v-main class="page">
        <v-sheet class="hero" :style="{ paddingTop: heroPaddingTop }">
          <div class="hero-row">
            <v-text-field
              v-model="searchQuery"
              class="search-field"
              variant="solo"
              rounded="pill"
              hide-details
              clearable
              density="comfortable"
              placeholder="Search product or shop..."
              prepend-inner-icon="mdi-magnify"
              append-inner-icon="mdi-earth"
              @focus="goToSearch"
              @input="updateSearch"
            />

            <!-- Notification Button with Badge -->
            <div class="notification-wrapper">
              <v-btn class="notif-btn" icon aria-label="Notifications" @click="goNotifications">
                <v-icon size="22">mdi-bell-outline</v-icon>
              </v-btn>

              <!-- Badge -->
              <div
                v-if="unreadNotifications > 0"
                class="notification-badge"
                :class="{ 'badge-large': unreadNotifications > 9 }"
              >
                {{ unreadNotifications > 99 ? '99+' : unreadNotifications }}
              </div>
            </div>
          </div>
        </v-sheet>

        <v-container class="py-4" style="max-width: 720px">
          
          <!-- ========== SECTION 1: STORES WITHIN BUTUAN ========== -->
          <div class="section-header mt-6">
            <h3 class="section-title">Stores Within Butuan</h3>
            <div class="location-status">
              <v-chip
                v-if="locationAccuracy !== 'none'"
                :color="getLocationStatusColor(locationAccuracy)"
                size="small"
              >
                <v-icon small class="mr-1">mdi-crosshairs-gps</v-icon>
                {{ getLocationStatusText(locationAccuracy) }}
              </v-chip>
              <button class="see-more" @click="seeMoreNearby"><u>See more</u></button>
            </div>
          </div>

          <div class="scroll-row">
            <template v-if="loading">
              <v-skeleton-loader
                v-for="i in 4"
                :key="'near-skel-' + i"
                type="image"
                class="item-card"
              />
            </template>
            <template v-else-if="nearby.length === 0">
              <div class="empty-card">
                <div class="empty-title">Nothing nearby yet</div>
                <div class="empty-sub">Location-based results coming soon.</div>
              </div>
            </template>
            <template v-else>
              <div
                v-for="item in nearby"
                :key="item.id"
                class="item-card"
                @click="goToShop(item.id)"
              >
                <v-img :src="item.img" cover class="item-img" />
                <div class="item-footer">
                  <v-avatar class="avatar-badge" size="20">
                    <v-img :src="item.logo || PLACEHOLDER_IMG" />
                  </v-avatar>
                  <div class="item-title">{{ item.title }}</div>
                </div>
              </div>
            </template>
          </div>

          <!-- ========== SECTION 2: HOT PICKS ========== -->
          <div class="section-header mt-6">
            <h3 class="section-title">🔥 Hot Picks</h3>
            <div class="hot-picks-badge">
              <v-icon size="16" color="#ff4757">mdi-fire</v-icon>
              <span class="hot-picks-text">Trending Now</span>
            </div>
          </div>

          <div class="scroll-row hot-picks-row">
            <template v-if="loading">
              <v-skeleton-loader
                v-for="i in 4"
                :key="'hot-skel-' + i"
                type="image"
                class="hot-pick-card"
              />
            </template>
            <template v-else-if="hotPicks.length === 0">
              <div class="empty-card">
                <div class="empty-title">No hot picks yet</div>
                <div class="empty-sub">Popular products will appear here.</div>
              </div>
            </template>
            <template v-else>
              <div
                v-for="item in hotPicks"
                :key="item.id"
                class="hot-pick-card"
                @click="goToProduct(item.id)"
              >
                <div class="hot-pick-rank">
                  <span class="rank-number">#{{ item.rank }}</span>
                  <v-icon class="rank-fire" size="14" color="#ff4757">mdi-fire</v-icon>
                </div>
                <v-img :src="item.img" cover class="hot-pick-img" />
                <div class="hot-pick-info">
                  <div class="hot-pick-title">{{ item.title }}</div>
                  <div class="hot-pick-price">₱{{ Number(item.price).toFixed(2) }}</div>
                  <div class="hot-pick-stats">
                    <v-icon size="12">mdi-fire</v-icon>
                    <span>{{ item.sold }} sold</span>
                  </div>
                </div>
              </div>
            </template>
          </div>

          <!-- ========== SECTION 3: BROWSE PRODUCTS ========== -->
          <div class="section-header mt-6">
            <h3 class="section-title">Browse Products</h3>
          </div>

          <template v-if="loading">
            <div class="product-grid">
              <v-skeleton-loader
                v-for="i in 6"
                :key="'prod-skel-' + i"
                type="image"
                class="product-card"
              />
            </div>
          </template>
          <template v-else-if="products.length === 0">
            <div class="empty-card">
              <div class="empty-title">No products yet</div>
              <div class="empty-sub">Products will appear here.</div>
            </div>
          </template>
          <template v-else>
            <div class="product-grid">
              <div
                v-for="item in products"
                :key="item.id"
                class="product-card"
                :class="{ 
                  'product-card--hot': item.sold >= 50 && item.stock > 0,
                  'product-card--out-of-stock': item.stock === 0
                }"
                @click="goToProduct(item.id)"
              >
                <!-- Hot Badge (only show if in stock) -->
                <div v-if="item.sold >= 50 && item.stock > 0" class="product-badge-hot">
                  <span class="badge-fire">🔥</span>
                  <span class="badge-text">HOT</span>
                </div>

                <!-- Out of Stock Badge -->
                <div v-if="item.stock === 0" class="product-badge-oos">
                  <v-icon size="12" class="mr-1">mdi-package-variant-closed</v-icon>
                  Out of Stock
                </div>

                <!-- Low Stock Badge (only show if in stock and low) -->
                <div v-else-if="item.stock < 5" class="product-badge-low">
                  <v-icon size="12" class="mr-1">mdi-alert</v-icon>
                  Only {{ item.stock }} left
                </div>

                <!-- Product Image -->
                <v-img :src="item.img" class="product-img" cover />

                <!-- Product Info -->
                <div class="product-info">
                  <div class="product-title">{{ item.title }}</div>
                  <div class="product-price">₱{{ Number(item.price).toFixed(2) }}</div>
                  <div class="product-sold">
                    <v-icon size="14" class="mr-1">mdi-fire</v-icon>
                    {{ item.sold }} sold
                  </div>
                </div>
              </div>
            </div>
          </template>

          <v-alert v-if="errorMsg" class="mt-6" type="error" variant="tonal">
            {{ errorMsg }}
          </v-alert>
        </v-container>

      </v-main>

      <!-- Survey Bubble Message -->
      <div v-if="showSurveyBubble && !hasAnsweredSurvey" class="survey-bubble-wrapper">
        <div class="survey-bubble">
          <div class="survey-bubble-content">
            <span>📝 Help us improve!</span>
            <p>Please answer our quick survey when you're done exploring the app.</p>
          </div>
          <div class="survey-bubble-arrow"></div>
        </div>
      </div>

      <!-- Google Form Floating Button -->
      <div class="floating-survey-wrapper">
        <v-btn
          class="floating-survey-btn"
          icon
          color="primary"
          size="large"
          elevation="8"
          @click="openSurvey"
        >
          <v-icon>mdi-google</v-icon>
        </v-btn>
      </div>

      <v-dialog
        v-model="showSurvey"
        fullscreen
        persistent
        scrollable
        transition="dialog-bottom-transition"
      >
        <v-card class="survey-fullscreen-card">
          <v-toolbar style="background: #3f83c7; color: white" class="survey-toolbar">
            <v-toolbar-title class="text-h6">Customer Feedback Survey</v-toolbar-title>
            <v-btn icon variant="text" color="white" @click="markSurveyAnswered">
              <v-icon>mdi-close</v-icon>
            </v-btn>
          </v-toolbar>

          <div class="iframe-container">
            <iframe
              src="https://docs.google.com/forms/d/e/1FAIpQLScgP_QJBFQNeH42g5DKTkDusG-9EMru1XZUJwfVB02hzDS1Xg/viewform?embedded=true"
              class="survey-iframe"
              frameborder="0"
              marginheight="0"
              marginwidth="0"
            >
              Loading…
            </iframe>
          </div>
        </v-card>
      </v-dialog>

      <BottomNav v-model="activeTab" />
    </PullToRefreshWrapper>
  </v-app>
</template>
<style scoped>
.page {
  background: #f5f7fa;
  padding-bottom: 96px;
  min-height: 100vh;
}

/* Add spacing after the sticky header */
.v-container {
  padding-top: 8px;
}

/* For the first section after hero */
.section-header.mt-6 {
  margin-top: 16px !important;
}

@media (max-width: 480px) {
  .section-header.mt-6 {
    margin-top: 12px !important;
  }
}

/* Hero Section with Safe Area Support - COMPLETELY REWRITTEN */
.hero {
  background: #3f83c7;
  border-radius: 0;
  margin: 0;
  width: 100%;
  position: sticky;
  top: 0;
  z-index: 100;
  box-sizing: border-box;
  /* Dynamic padding - will be overridden by inline style */
  padding: 12px 16px 16px 16px;
  /* Fallback padding */
  padding-top: 12px;
  /* Add a subtle shadow for depth */
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

/* For devices with notches/cutouts - CSS only fallback */
@supports (padding-top: env(safe-area-inset-top)) {
  .hero {
    padding-top: calc(12px + env(safe-area-inset-top));
  }
}

/* For iOS devices with dynamic island */
@supports (padding-top: constant(safe-area-inset-top)) {
  .hero {
    padding-top: calc(12px + constant(safe-area-inset-top));
  }
}

.hero-row {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  max-width: 720px;
  margin: 0 auto;
}

/* Search Field - Responsive */
.search-field {
  flex: 1;
  min-width: 0; /* Prevents overflow */
  transition: all 0.3s ease;
}

.search-field :deep(.v-field) {
  background: #fff !important;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
  border-radius: 9999px !important;
  transition: all 0.3s ease;
}

.search-field :deep(.v-field:hover) {
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.12);
  transform: translateY(-1px);
}

.search-field :deep(input) {
  font-size: 14px;
  padding: 12px 0;
}

.search-field :deep(.v-field__append-inner) {
  cursor: pointer;
}

/* Notification Button */
.notification-wrapper {
  position: relative;
  display: inline-block;
  flex-shrink: 0;
}

.notif-btn {
  width: 48px;
  height: 48px;
  min-width: 48px;
  border-radius: 50%;
  background: #fff !important;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
  transition: all 0.3s ease;
}

.notif-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.12);
}

.notif-btn:active {
  transform: translateY(0);
}

.notif-btn :deep(.v-icon) {
  color: #111827;
  font-size: 22px;
}

/* Notification Badge */
.notification-badge {
  position: absolute;
  top: -4px;
  right: -4px;
  background: linear-gradient(135deg, #ff4444, #ff6666);
  color: white;
  border-radius: 20px;
  min-width: 20px;
  height: 20px;
  font-size: 11px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2px solid white;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
  animation: pulse 2s infinite;
  padding: 0 5px;
}

.badge-large {
  min-width: 24px;
  height: 24px;
  font-size: 10px;
  top: -6px;
  right: -6px;
}

@keyframes pulse {
  0% {
    transform: scale(1);
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
  }
  50% {
    transform: scale(1.05);
    box-shadow: 0 3px 10px rgba(0, 0, 0, 0.3);
  }
  100% {
    transform: scale(1);
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
  }
}

/* Responsive Design - Mobile First */
@media (max-width: 768px) {
  .hero {
    padding: 12px 12px 14px 12px;
  }

  @supports (padding-top: env(safe-area-inset-top)) {
    .hero {
      padding-top: calc(12px + env(safe-area-inset-top));
    }
  }

  .hero-row {
    gap: 10px;
  }

  .search-field :deep(input) {
    font-size: 13px;
    padding: 10px 0;
  }

  .notif-btn {
    width: 44px;
    height: 44px;
    min-width: 44px;
  }

  .notif-btn :deep(.v-icon) {
    font-size: 20px;
  }

  .notification-badge {
    min-width: 18px;
    height: 18px;
    font-size: 10px;
    top: -3px;
    right: -3px;
  }

  .badge-large {
    min-width: 22px;
    height: 22px;
    font-size: 9px;
    top: -5px;
    right: -5px;
  }
}

/* Extra Small Devices (phones, 480px and down) */
@media (max-width: 480px) {
  .hero {
    padding: 10px 10px 12px 10px;
  }

  @supports (padding-top: env(safe-area-inset-top)) {
    .hero {
      padding-top: calc(10px + env(safe-area-inset-top));
    }
  }

  .hero-row {
    gap: 8px;
  }

  .search-field :deep(input) {
    font-size: 12px;
    padding: 8px 0;
  }

  .search-field :deep(.v-field__prepend-inner) {
    padding-left: 8px;
  }

  .search-field :deep(.v-field__append-inner) {
    padding-right: 8px;
  }

  .notif-btn {
    width: 40px;
    height: 40px;
    min-width: 40px;
  }

  .notif-btn :deep(.v-icon) {
    font-size: 18px;
  }

  .notification-badge {
    min-width: 16px;
    height: 16px;
    font-size: 9px;
    top: -2px;
    right: -2px;
  }

  .badge-large {
    min-width: 20px;
    height: 20px;
    font-size: 8px;
    top: -4px;
    right: -4px;
  }
}

/* Landscape Mode */
@media (max-height: 600px) and (orientation: landscape) {
  .hero {
    padding: 8px 12px 10px 12px;
  }

  @supports (padding-top: env(safe-area-inset-top)) {
    .hero {
      padding-top: calc(8px + env(safe-area-inset-top));
    }
  }

  .hero-row {
    gap: 10px;
  }

  .search-field :deep(input) {
    padding: 8px 0;
  }

  .notif-btn {
    width: 38px;
    height: 38px;
    min-width: 38px;
  }

  .notif-btn :deep(.v-icon) {
    font-size: 18px;
  }
}

/* Tablet Devices (768px to 1024px) */
@media (min-width: 769px) and (max-width: 1024px) {
  .hero {
    padding: 14px 20px 18px 20px;
  }

  @supports (padding-top: env(safe-area-inset-top)) {
    .hero {
      padding-top: calc(14px + env(safe-area-inset-top));
    }
  }

  .hero-row {
    max-width: 800px;
    gap: 14px;
  }

  .search-field :deep(input) {
    font-size: 15px;
  }

  .notif-btn {
    width: 52px;
    height: 52px;
    min-width: 52px;
  }

  .notif-btn :deep(.v-icon) {
    font-size: 24px;
  }
}

/* Desktop Devices (1024px and up) */
@media (min-width: 1025px) {
  .hero {
    padding: 16px 24px 20px 24px;
  }

  @supports (padding-top: env(safe-area-inset-top)) {
    .hero {
      padding-top: calc(16px + env(safe-area-inset-top));
    }
  }

  .hero-row {
    max-width: 1200px;
    gap: 16px;
  }

  .search-field :deep(input) {
    font-size: 16px;
    padding: 14px 0;
  }

  .notif-btn {
    width: 56px;
    height: 56px;
    min-width: 56px;
  }

  .notif-btn :deep(.v-icon) {
    font-size: 26px;
  }
}

/* iOS-specific adjustments for notch */
@supports (-webkit-touch-callout: none) {
  .hero {
    padding-top: calc(12px + constant(safe-area-inset-top)) !important;
    padding-top: calc(12px + env(safe-area-inset-top)) !important;
  }

  @media (max-width: 480px) {
    .hero {
      padding-top: calc(10px + constant(safe-area-inset-top)) !important;
      padding-top: calc(10px + env(safe-area-inset-top)) !important;
    }
  }
}

/* Android specific adjustments */
@media (display-notch) {
  .hero {
    padding-top: calc(12px + 24px);
  }

  @media (max-width: 480px) {
    .hero {
      padding-top: calc(10px + 24px);
    }
  }
}

/* Ensure the search field doesn't overflow on very small screens */
@media (max-width: 360px) {
  .hero-row {
    gap: 6px;
  }

  .search-field :deep(.v-field__prepend-inner) {
    padding-left: 6px;
  }

  .search-field :deep(.v-field__append-inner) {
    padding-right: 6px;
  }
}

/* Survey Bubble Styles */
.survey-bubble-wrapper {
  position: fixed;
  bottom: 100px;
  right: 80px;
  z-index: 1000;
  animation: floatBubble 3s ease-in-out infinite;
}

.survey-bubble {
  position: relative;
  background: linear-gradient(135deg, #4285f4, #34a853);
  color: white;
  padding: 12px 16px;
  border-radius: 16px;
  box-shadow: 0 8px 25px rgba(66, 133, 244, 0.4);
  max-width: 240px;
  animation: bubbleAppear 0.5s ease-out;
}

.survey-bubble::before {
  content: '';
  position: absolute;
  bottom: -8px;
  right: 30px;
  width: 16px;
  height: 16px;
  background: #4285f4;
  transform: rotate(45deg);
  border-radius: 0 0 4px 0;
}

.survey-bubble-content {
  position: relative;
  z-index: 2;
}

.survey-bubble-content span {
  font-weight: 700;
  font-size: 14px;
  display: block;
  margin-bottom: 4px;
}

.survey-bubble-content p {
  font-size: 12px;
  margin: 0;
  opacity: 0.9;
  line-height: 1.3;
}

@keyframes floatBubble {
  0%,
  100% {
    transform: translateY(0) translateX(0);
  }
  50% {
    transform: translateY(-5px) translateX(2px);
  }
}

@keyframes bubbleAppear {
  from {
    opacity: 0;
    transform: translateY(10px) scale(0.9);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.section-title {
  font-size: 16px;
  font-weight: 700;
  color: #1f2937;
}

.see-more {
  background: transparent;
  border: 0;
  color: #6b7280;
  font-weight: 600;
  cursor: pointer;
}

.scroll-row {
  display: flex;
  gap: 12px;
  overflow-x: auto;
  padding: 10px 2px 2px;
  scroll-snap-type: x mandatory;
  -ms-overflow-style: none;
  scrollbar-width: none;
}

.scroll-row::-webkit-scrollbar {
  display: none;
}

.item-card {
  position: relative;
  flex: 0 0 calc(33.333% - 12px);
  height: 140px;
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.06);
  background: #fff;
  scroll-snap-align: start;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  cursor: pointer;
}

.item-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  position: absolute;
  top: 0;
  left: 0;
  z-index: 0;
}

.item-footer {
  position: relative;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  background: #4490dd;
  border-bottom-left-radius: 12px;
  border-bottom-right-radius: 12px;
  z-index: 1;
}

.avatar-badge {
  border: 2px solid #fff;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  flex-shrink: 0;
}

.item-title {
  font-size: 12px;
  font-weight: 700;
  color: #fff;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
}

.empty-card {
  width: 240px;
  height: 124px;
  border-radius: 12px;
  background: #fff;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.06);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 12px;
}

.empty-title {
  font-weight: 700;
  color: #1f2937;
}

.empty-sub {
  font-size: 12px;
  color: #6b7280;
}

.mt-6 {
  margin-top: 24px;
}

/* =========================================== */
/* ENHANCED PRODUCT GRID AND OUT OF STOCK UI */
/* =========================================== */

.product-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 12px;
  margin-top: 12px;
}

/* Base Product Card */
.product-card {
  position: relative;
  background: #fff;
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
  display: flex;
  flex-direction: column;
  transition: all 0.15s ease;
  cursor: pointer;
  border: 1px solid transparent;
}

.product-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.product-card--hot {
  border: 1.5px solid #ff6b6b;
  box-shadow: 0 2px 12px rgba(255, 107, 107, 0.15);
}

.product-card--hot:hover {
  box-shadow: 0 6px 20px rgba(255, 107, 107, 0.25);
}

/* Out of Stock Card Styling */
.product-card--out-of-stock {
  opacity: 0.85;
  filter: grayscale(0.15);
  background: #fafafa;
}

.product-card--out-of-stock:hover {
  opacity: 0.9;
  filter: grayscale(0.1);
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.product-card--out-of-stock .product-title {
  color: #6c757d;
}

.product-card--out-of-stock .product-price {
  color: #adb5bd;
  text-decoration: line-through;
}

.product-card--out-of-stock .product-sold {
  color: #adb5bd;
}

/* Hot Badge */
.product-badge-hot {
  position: absolute;
  top: 8px;
  right: 8px;
  display: flex;
  align-items: center;
  gap: 4px;
  background: linear-gradient(135deg, #ff6b6b, #ff4757);
  color: white;
  padding: 5px 10px;
  border-radius: 20px;
  font-size: 11px;
  font-weight: 700;
  box-shadow: 0 2px 8px rgba(255, 107, 107, 0.3);
  z-index: 10;
  animation: hotPulse 2s infinite;
}

.badge-fire {
  font-size: 12px;
}

.badge-text {
  letter-spacing: 0.5px;
}

/* Out of Stock Badge - Enhanced */
.product-badge-oos {
  position: absolute;
  top: 8px;
  left: 8px;
  right: auto;
  bottom: auto;
  background: linear-gradient(135deg, #6c757d, #495057);
  color: white;
  padding: 6px 12px;
  border-radius: 20px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  z-index: 10;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
  backdrop-filter: blur(2px);
  animation: fadeInOut 0.5s ease-in-out;
  display: flex;
  align-items: center;
  gap: 4px;
}

/* Low Stock Badge - Enhanced */
.product-badge-low {
  position: absolute;
  top: 8px;
  left: 8px;
  right: auto;
  bottom: auto;
  background: linear-gradient(135deg, #ff9800, #f57c00);
  color: white;
  padding: 6px 12px;
  border-radius: 20px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  z-index: 10;
  box-shadow: 0 2px 8px rgba(255, 152, 0, 0.3);
  animation: pulseLowStock 1.5s infinite;
  display: flex;
  align-items: center;
  gap: 4px;
}

/* Overlay for Out of Stock Products */
.product-card--out-of-stock .product-img {
  position: relative;
}

.product-card--out-of-stock .product-img::after {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.3);
  pointer-events: none;
}

/* Sold Out Stamp Effect */
.product-card--out-of-stock .product-info {
  position: relative;
}

.product-card--out-of-stock .product-info::before {
  content: 'SOLD OUT';
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%) rotate(-15deg);
  font-size: 14px;
  font-weight: 900;
  color: rgba(220, 53, 69, 0.25);
  letter-spacing: 2px;
  white-space: nowrap;
  pointer-events: none;
  z-index: 5;
  font-family: 'Arial Black', sans-serif;
  text-transform: uppercase;
}

@keyframes hotPulse {
  0%,
  100% {
    transform: scale(1);
  }
  50% {
    transform: scale(1.05);
  }
}

@keyframes pulseLowStock {
  0%, 100% {
    transform: scale(1);
    box-shadow: 0 2px 8px rgba(255, 152, 0, 0.3);
  }
  50% {
    transform: scale(1.05);
    box-shadow: 0 4px 12px rgba(255, 152, 0, 0.5);
  }
}

@keyframes fadeInOut {
  from {
    opacity: 0;
    transform: translateY(-10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.product-img {
  width: 100%;
  height: 160px;
  object-fit: cover;
}

.product-info {
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.product-title {
  font-size: 13px;
  font-weight: 500;
  color: #111827;
  line-height: 1.3;
  height: 32px;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
}

.product-price {
  font-size: 14px;
  font-weight: 700;
  color: #e53935;
}

.product-sold {
  font-size: 12px;
  color: #ff6b6b;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 2px;
  margin-top: 2px;
}

.product-sold :deep(.v-icon) {
  font-size: 13px !important;
}

.floating-survey-wrapper {
  position: fixed;
  bottom: 96px;
  right: 20px;
  z-index: 999;
}

.floating-survey-btn {
  position: relative;
  border-radius: 50%;
  background: linear-gradient(135deg, #4285f4, #34a853) !important;
  color: white !important;
  box-shadow: 0 6px 20px rgba(66, 133, 244, 0.4);
  transition:
    transform 0.3s ease,
    box-shadow 0.3s ease;
  animation: pulseGoogle 2s infinite;
}

.floating-survey-btn:hover {
  transform: scale(1.1);
  box-shadow: 0 8px 25px rgba(66, 133, 244, 0.6);
}

@keyframes pulseGoogle {
  0%,
  100% {
    box-shadow: 0 6px 20px rgba(66, 133, 244, 0.4);
  }
  50% {
    box-shadow: 0 6px 25px rgba(66, 133, 244, 0.7);
  }
}

.survey-fullscreen-card {
  display: flex;
  flex-direction: column;
  height: 100vh;
  height: 100dvh;
  max-height: 100vh;
  background: white;
}

.survey-toolbar {
  flex: 0 0 auto;
  padding-top: env(safe-area-inset-top);
}

.iframe-container {
  flex: 1;
  display: flex;
  overflow: hidden;
  padding-bottom: env(safe-area-inset-bottom);
}

.survey-iframe {
  width: 100%;
  height: 100%;
  border: 0;
  flex: 1;
}

@media (max-width: 480px) {
  .product-grid {
    grid-template-columns: repeat(2, 1fr);
    gap: 10px;
  }

  .product-img {
    height: 140px;
  }

  .product-title {
    font-size: 12px;
  }

  .product-price {
    font-size: 13px;
  }

  .product-sold {
    font-size: 11px;
  }

  .survey-bubble-wrapper {
    bottom: 150px;
    right: 60px;
  }

  .survey-bubble {
    max-width: 200px;
  }
  
  .product-badge-oos,
  .product-badge-low,
  .product-badge-hot {
    padding: 4px 8px;
    font-size: 9px;
  }
  
  .product-card--out-of-stock .product-info::before {
    font-size: 10px;
  }
}

@media (max-width: 600px) {
  .survey-toolbar .v-toolbar-title {
    font-size: 16px;
  }
}

/* Hot Picks Styles */
.hot-picks-row {
  margin-bottom: 8px;
}

.hot-picks-badge {
  display: flex;
  align-items: center;
  gap: 4px;
  background: linear-gradient(135deg, #fff5f5, #ffe0e0);
  padding: 4px 12px;
  border-radius: 20px;
}

.hot-picks-text {
  font-size: 12px;
  font-weight: 600;
  color: #ff4757;
  letter-spacing: 0.5px;
}

.hot-pick-card {
  position: relative;
  flex: 0 0 calc(33.333% - 12px);
  background: linear-gradient(135deg, #fff, #fff9f9);
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
  transition: all 0.3s ease;
  cursor: pointer;
  border: 1px solid rgba(255, 71, 87, 0.2);
}

.hot-pick-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 8px 20px rgba(255, 71, 87, 0.2);
  border-color: rgba(255, 71, 87, 0.4);
}

.hot-pick-rank {
  position: absolute;
  top: 8px;
  left: 8px;
  background: linear-gradient(135deg, #ff4757, #ff6b6b);
  color: white;
  padding: 4px 8px;
  border-radius: 20px;
  font-size: 11px;
  font-weight: 700;
  z-index: 10;
  display: flex;
  align-items: center;
  gap: 4px;
  box-shadow: 0 2px 8px rgba(255, 71, 87, 0.3);
}

.rank-number {
  font-size: 10px;
  letter-spacing: 0.5px;
}

.hot-pick-img {
  width: 100%;
  height: 120px;
  object-fit: cover;
}

.hot-pick-info {
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.hot-pick-title {
  font-size: 12px;
  font-weight: 600;
  color: #111827;
  line-height: 1.3;
  height: 30px;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
}

.hot-pick-price {
  font-size: 13px;
  font-weight: 700;
  color: #e53935;
}

.hot-pick-stats {
  font-size: 11px;
  color: #ff6b6b;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 4px;
}

/* Responsive adjustments for hot picks */
@media (max-width: 480px) {
  .hot-pick-card {
    flex: 0 0 calc(50% - 8px);
  }
  
  .hot-pick-img {
    height: 100px;
  }
  
  .hot-pick-title {
    font-size: 11px;
    height: 26px;
  }
  
  .hot-pick-price {
    font-size: 12px;
  }
  
  .hot-pick-rank {
    padding: 3px 6px;
    font-size: 9px;
  }
  
  .rank-number {
    font-size: 8px;
  }
}

@media (max-width: 360px) {
  .hot-pick-card {
    flex: 0 0 calc(100% - 12px);
  }
}
</style>