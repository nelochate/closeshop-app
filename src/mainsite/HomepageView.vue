<script setup lang="js">
import { ref, onMounted, onUnmounted } from 'vue' // ✅ Added onUnmounted import
import { useRouter } from 'vue-router'
import BottomNav from '@/common/layout/BottomNav.vue'
import { supabase } from '@/utils/supabase'
import { Geolocation } from '@capacitor/geolocation'
//import { PushNotifications } from '@capacitor/push-notifications'
import { Network } from '@capacitor/network'
import { Capacitor } from '@capacitor/core'

const router = useRouter()
const activeTab = ref('home')
const products = ref([])
const nearby = ref([])
const loading = ref(true)
const errorMsg = ref('')

// notification state
const unreadNotifications = ref(0)
const notificationSubscription = ref(null)

const PLACEHOLDER_IMG = 'https://picsum.photos/seed/shop/480/360'

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
      (payload) => {
        console.log('New notification received:', payload)
        unreadNotifications.value++

        // Show native notification if enabled
        if (Notification.permission === 'granted') {
          new Notification('CloseShop', {
            body: payload.new.message,
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

  const { count, error } = await supabase
    .from('notifications')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('is_read', false)

  if (!error && count !== null) {
    unreadNotifications.value = count
  }
}

/* 🚀 Main Lifecycle */
onMounted(async () => {
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

// Cleanup subscription - ✅ FIXED: Now properly imported
onUnmounted(() => {
  if (notificationSubscription.value) {
    notificationSubscription.value.unsubscribe()
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
</script>

<template>
  <v-app>
    <v-main class="page">
      <!-- 🔎 Search + Notification -->
      <v-sheet class="hero">
        <div class="hero-row">
          <v-text-field
            v-model="searchQuery"
            class="search-field"
            variant="solo"
            rounded="pill"
            hide-details
            clearable
            density="comfortable"
            placeholder="Search products..."
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

      <!-- ... rest of your template remains the same ... -->
      <v-container class="py-4" style="max-width: 720px">
        <!-- 🏬 Nearby Stores -->
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
            <button class="see-more" @click="seeMoreNearby">See more</button>
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
            <div v-for="item in nearby" :key="item.id" class="item-card" @click="goToShop(item.id)">
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

        <!-- 🛒 Products -->
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
              @click="goToProduct(item.id)"
            >
              <v-img :src="item.img" class="product-img" cover />
              <div class="product-info">
                <div class="product-title">{{ item.title }}</div>
                <div class="product-price">₱{{ Number(item.price).toFixed(2) }}</div>
                <div class="product-sold">{{ item.sold }} sold</div>
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
  </v-app>
</template>

<style scoped>
.page {
  background: #f5f7fa;
  padding-bottom: 96px;
}

.hero {
  background: #3f83c7;
  border-radius: 0;
  padding: 41px 16px calc(12px + env(safe-area-inset-top)) 16px;
  margin: 0;
  width: 100%;
  position: sticky;
  top: 0;
  z-index: 10;
  padding-bottom: 18px;
}

.hero-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.search-field {
  flex: 1;
}

.search-field :deep(.v-field) {
  background: #fff !important;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.06);
}

.search-field :deep(input) {
  font-size: 14px;
}

.notification-wrapper {
  position: relative;
  display: inline-block;
}

.notif-btn {
  width: 44px;
  height: 44px;
  min-width: 44px;
  border-radius: 9999px;
  background: #fff !important;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.06);
  position: relative;
}

.notif-btn :deep(.v-icon) {
  color: #111827;
}

.notification-badge {
  position: absolute;
  top: -4px;
  right: -4px;
  background: #ff4444;
  color: white;
  border-radius: 10px;
  min-width: 18px;
  height: 18px;
  font-size: 10px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2px solid white;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
  animation: pulse 2s infinite;
}

.badge-large {
  min-width: 22px;
  height: 22px;
  font-size: 9px;
  top: -6px;
  right: -6px;
}

@keyframes pulse {
  0% {
    transform: scale(1);
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
  }
  50% {
    transform: scale(1.05);
    box-shadow: 0 3px 6px rgba(0, 0, 0, 0.3);
  }
  100% {
    transform: scale(1);
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
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
  0%, 100% {
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

.product-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 12px;
  margin-top: 12px;
}

.product-card {
  background: #fff;
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
  display: flex;
  flex-direction: column;
  transition: transform 0.15s ease;
  cursor: pointer;
}

.product-card:hover {
  transform: translateY(-2px);
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
  -webkit-box-orient: vertical;
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
  0%, 100% {
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
}

@media (max-width: 600px) {
  .survey-toolbar .v-toolbar-title {
    font-size: 16px;
  }
}
</style>