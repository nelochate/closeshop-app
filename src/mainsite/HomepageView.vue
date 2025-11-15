<script setup lang="js">
import { ref, onMounted } from 'vue'
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
    const perm = await Geolocation.requestPermissions()
    if (perm.location === 'granted') {
      const coords = await Geolocation.getCurrentPosition()
      console.log('📍 User location:', coords.coords)
      return coords.coords
    } else {
      alert('Please enable location permission to see nearby shops.')
      return null
    }
  } catch (err) {
    console.error('Error requesting location:', err)
    return null
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

/* 🏪 Fetch Shops */
/* 🏪 Fetch Approved Shops Sorted by Distance */
async function fetchShops() {
  try {
    const userCoords = await Geolocation.getCurrentPosition()
    const userLat = userCoords.coords.latitude
    const userLon = userCoords.coords.longitude

    const { data, error } = await supabase
      .from('shops')
      .select(
        'id, business_name, description, logo_url, physical_store, building, street, barangay, city, province, region, latitude, longitude, status',
      )
      .eq('status', 'approved') // ✅ Only approved shops
      .not('latitude', 'is', null)
      .not('longitude', 'is', null)

    if (error) throw error

    // Compute distance
    function distance(lat1, lon1, lat2, lon2) {
      const R = 6371 // km
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

    // Map stores & compute distance
    let mapped = data.map((s) => {
      const dist = distance(userLat, userLon, s.latitude, s.longitude)
      return {
        id: s.id,
        title: s.business_name,
        img: s.physical_store || PLACEHOLDER_IMG,
        logo: s.logo_url,
        address: [s.building, s.street, s.barangay, s.city, s.province].filter(Boolean).join(', '),
        distance: dist, // in km
      }
    })

    // Sort nearest → farthest
    mapped.sort((a, b) => a.distance - b.distance)

    nearby.value = mapped
  } catch (err) {
    console.error('fetchShops error:', err)
    errorMsg.value = err.message
    nearby.value = []
  }
}

/* 🛍️ Fetch Products from Approved Shops */
async function fetchProducts() {
  try {
    const { data, error } = await supabase
      .from('products')
      .select(`
        id,
        prod_name,
        price,
        main_img_urls,
        sold,
        shop_id,
        shops!inner (status)
      `)
      .eq('shops.status', 'approved')   // ✅ Only shops approved

    if (error) throw error

    products.value = (data || []).map(p => ({
      id: p.id,
      title: p.prod_name,
      price: p.price,
      img: extractImage(p.main_img_urls),
      sold: p.sold || 0
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

/* 🚀 Main Lifecycle */
onMounted(async () => {
  try {
    loading.value = true
    errorMsg.value = ''

    // Only run these on mobile builds
    if (Capacitor.isNativePlatform()) {
      await checkNetworkStatus()
      await requestLocationPermission()
      await setupPushNotifications() // ✅ replaces Firebase-based token code
    }

    // Load data
    await Promise.all([fetchShops(), fetchProducts()])
  } catch (err) {
    console.error('❌ Error in onMounted:', err)
  } finally {
    loading.value = false
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
const showSurveyHint = ref(false)

function openSurvey() {
  showSurvey.value = true
}

function markSurveyAnswered() {
  hasAnsweredSurvey.value = true
  localStorage.setItem('surveyAnswered', 'true')
  showSurvey.value = false
}

onMounted(() => {
  const saved = localStorage.getItem('surveyAnswered')
  if (saved === 'true') hasAnsweredSurvey.value = true

  // 💬 Show the hint 3 seconds after loading (only if not answered)
  if (!hasAnsweredSurvey.value) {
    setTimeout(() => {
      showSurveyHint.value = true
      // Hide automatically after 8 seconds
      setTimeout(() => (showSurveyHint.value = false), 8000)
    }, 3000)
  }
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
          <v-btn class="notif-btn" icon aria-label="Notifications" @click="goNotifications">
            <v-icon size="22">mdi-bell-outline</v-icon>
          </v-btn>
        </div>
      </v-sheet>
      <v-container class="py-4" style="max-width: 720px">
        <!-- 🏬 Nearby Stores -->
        <div class="section-header mt-6">
          <h3 class="section-title">Nearby Stores</h3>
          <button class="see-more" @click="seeMoreNearby">See more</button>
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
    <!-- 💬 Floating Survey Button -->
    <!-- 💬 Floating Survey Button with Hint -->
    <div v-if="!hasAnsweredSurvey" class="floating-survey-wrapper">
      <!-- Tooltip Cloud -->
      <transition name="fade">
        <div v-if="showSurveyHint" class="survey-hint">
          💭 Please answer this survey once done exploring the app!
        </div>
      </transition>

      <!-- Button -->
      <v-btn
        class="floating-survey-btn"
        icon
        color="primary"
        size="large"
        elevation="8"
        @click="openSurvey"
      >
        <v-icon>mdi-comment-question-outline</v-icon>
      </v-btn>
    </div>

    <!-- 🧾 Survey Modal Fullscreen -->
    <v-dialog
      v-model="showSurvey"
      fullscreen
      persistent
      scrollable
      transition="dialog-bottom-transition"
    >
      <v-card class="survey-fullscreen-card">
        <!-- Header -->
        <v-card-title
          class="d-flex justify-space-between align-center px-4 py-3"
          style="background: #3f83c7; color: white"
        >
          <span class="text-h6">Customer Feedback Survey</span>
          <v-btn icon variant="text" color="white" @click="showSurvey = false">
            <v-icon>mdi-close</v-icon>
          </v-btn>
        </v-card-title>

        <!-- Iframe Container -->
        <v-card-text class="p-0" style="flex: 1; display: flex; overflow: hidden">
          <iframe
            src="https://docs.google.com/forms/d/e/1FAIpQLScgP_QJBFQNeH42g5DKTkDusG-9EMru1XZUJwfVB02hzDS1Xg/viewform?embedded=true"
            style="border: 0; width: 100%; height: 100%"
            frameborder="0"
            marginheight="0"
            marginwidth="0"
          >
            Loading…
          </iframe>
        </v-card-text>
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
  padding-top: env(safe-area-inset-top);
  padding: 35px 16px calc(12px + env(safe-area-inset-top)) 16px;
  margin: 0;
  width: 100%;
  position: sticky;
  top: 0;
  z-index: 10;
  border-bottom-left-radius: 10px;
  border-bottom-right-radius: 10px;
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

.notif-btn {
  width: 44px;
  height: 44px;
  min-width: 44px;
  border-radius: 9999px;
  background: #fff !important;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.06);
}

.notif-btn :deep(.v-icon) {
  color: #111827;
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
  justify-content: flex-end; /* push footer to bottom */
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

.item-meta {
  position: absolute;
  left: 36px;
  right: 8px;
  bottom: 6px;
  color: #fff;
}

.item-sub {
  font-size: 10px;
  opacity: 0.9;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.35);
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

/* ✅ Keep products 2-column layout for small devices (e.g. 350x800) */
@media (max-width: 480px) {
  .product-grid {
    grid-template-columns: repeat(2, 1fr) !important;
    gap: 10px;
  }

  .product-card {
    height: auto;
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
}
/* 💬floating survey*/
.floating-survey-btn {
  position: fixed;
  bottom: 96px; /* just above BottomNav */
  right: 20px;
  z-index: 200;
  border-radius: 50%;
  background-color: #3f83c7 !important;
  color: white !important;
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.2);
  transition:
    transform 0.2s ease,
    box-shadow 0.2s ease;
}

.floating-survey-btn:hover {
  transform: scale(1.05);
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.25);
}
@media (max-width: 600px) {
  .v-dialog > .v-overlay__content {
    width: 95% !important;
    max-width: 95% !important;
  }

  iframe {
    height: 400px !important;
  }
}

.floating-survey-wrapper {
  position: fixed;
  bottom: 96px;
  right: 20px;
  z-index: 200;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex-direction: column;
  gap: 6px;
}

/* 💬 Tooltip cloud */
.survey-hint {
  background: white;
  color: #333;
  font-size: 13px;
  font-weight: 500;
  padding: 8px 12px;
  border-radius: 10px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  max-width: 220px;
  text-align: center;
  animation: floatUp 0.4s ease-out;
  position: relative;
}

/* little pointer triangle */
.survey-hint::after {
  content: '';
  position: absolute;
  bottom: -6px;
  right: 26px;
  border-width: 6px 6px 0 6px;
  border-style: solid;
  border-color: white transparent transparent transparent;
  filter: drop-shadow(0 2px 2px rgba(0, 0, 0, 0.1));
}

/* fade animation for transition */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.4s;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

/* subtle floating motion */
@keyframes floatUp {
  from {
    transform: translateY(10px);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}

/* Make the fullscreen card stretch to full height */
.survey-fullscreen-card {
  display: flex;
  flex-direction: column;
  height: 100%;
}

/* Optional: smooth fade/slide animation */
.v-dialog__content {
  background: rgba(0, 0, 0, 0.4); /* dim background */
}

/* Mobile adjustments */
@media (max-width: 600px) {
  .survey-fullscreen-card v-card-title {
    font-size: 16px;
    padding: 12px;
  }
}
</style>
