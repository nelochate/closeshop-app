<script setup>
import { ref, onMounted, watch } from 'vue'
import { useRouter, onBeforeRouteUpdate } from 'vue-router'
import { supabase } from '@/utils/supabase'
import { useAuthUserStore } from '@/stores/authUser'
import BottomNav from '@/common/layout/BottomNav.vue'

const activeTab = ref('account')

// Router and store
const router = useRouter()
const authStore = useAuthUserStore()

// Reactive state
const avatarUrl = ref(null)
const user = ref(null)
const fullName = ref('')
const hasShop = ref(false)

// Shopee-style navigation items
const navItems = ref([
  {
    id: 'my-purchases',
    title: 'My Purchases',
    icon: 'mdi-package-variant',
    color: '#354d7c',
    count: 0
  },
  {
    id: 'to-pay',
    title: 'To Pay',
    icon: 'mdi-credit-card-outline',
    color: '#354d7c',
    count: 0
  },

  {
    id: 'to-receive',
    title: 'To Receive',
    icon: 'mdi-package-down',
    color: '##354d7c',
    count: 0
  },
  {
    id: 'completed',
    title: 'Completed',
    icon: 'mdi-check-circle-outline',
    color: '#354d7c',
    count: 0
  },
  {
    id: 'cancelled',
    title: 'Cancelled',
    icon: 'mdi-close-circle-outline',
    color: '#354d7c',
    count: 0
  },

  {
    id: 'reviews',
    title: 'To Review',
    icon: 'mdi-star-outline',
    color: '#354d7c',
    count: 0
  }
])

const selectedSection = ref('my-purchases')

// Load the user info
const loadUser = async () => {
  if (authStore.userData && authStore.profile) {
    user.value = authStore.userData
    fullName.value =
      `${authStore.userData?.user_metadata?.first_name || ''} ${authStore.userData?.user_metadata?.last_name || ''}`.trim()
    avatarUrl.value = authStore.profile.avatar_url || null
  } else {
    const { data: userData, error } = await supabase.auth.getUser()
    if (error || !userData?.user) {
      console.error('No user found:', error?.message)
      return
    }
    user.value = userData.user
    fullName.value =
      `${authStore.userData?.user_metadata?.first_name || ''} ${authStore.userData?.user_metadata?.last_name || ''}`.trim()
    avatarUrl.value = authStore.profile?.avatar_url || null
  }
}

// Check if user already has a shop in Supabase
const checkUserShop = async () => {
  if (!user.value?.id) return

  try {
    const { data, error } = await supabase
      .from('shops')
      .select('id')
      .eq('owner_id', user.value.id)
      .maybeSingle()

    if (error && error.code !== 'PGRST116') {
      console.error('Error checking shop:', error.message)
    }

    hasShop.value = !!data
    console.log('Shop lookup:', data, 'hasShop:', hasShop.value)
  } catch (err) {
    console.error('Error checking shop:', err)
  }
}

// Load order counts for each section
const loadOrderCounts = async () => {
  if (!user.value?.id) return

  try {
    // Example: Fetch order counts from your orders table
    const { data: orders, error } = await supabase
      .from('orders')
      .select('status, id')
      .eq('user_id', user.value.id)

    if (error) {
      console.error('Error loading order counts:', error)
      return
    }

    // Update counts based on order status
    navItems.value = navItems.value.map(item => {
      let count = 0
      switch (item.id) {
        case 'to-pay':
          count = orders.filter(order => order.status === 'pending_payment').length
          break
        case 'to-ship':
          count = orders.filter(order => order.status === 'paid').length
          break
        case 'to-receive':
          count = orders.filter(order => order.status === 'shipped').length
          break
        case 'completed':
          count = orders.filter(order => order.status === 'completed').length
          break
        case 'cancelled':
          count = orders.filter(order => order.status === 'cancelled').length
          break
        case 'refunds':
          count = orders.filter(order => order.status === 'refund_requested').length
          break
        case 'reviews':
          count = orders.filter(order => order.status === 'to_review').length
          break
        default:
          count = orders.length // My Purchases shows total
      }
      return { ...item, count }
    })
  } catch (err) {
    console.error('Error loading order counts:', err)
  }
}

// Navigation handler
const handleNavClick = (itemId) => {
  selectedSection.value = itemId
  // You can add additional logic here, like fetching orders for the selected section
  console.log('Navigated to:', itemId)
}

// Run when component mounts
onMounted(async () => {
  await loadUser()
  await checkUserShop()
  await loadOrderCounts()
})

// Watch for user changes → re-check shop ownership
watch(
  () => user.value?.id,
  async (newId) => {
    if (newId) {
      await checkUserShop()
      await loadOrderCounts()
    }
  },
)

// Watch for store userData changes → update name
watch(
  () => authStore.userData,
  (newUser) => {
    if (newUser) {
      fullName.value =
        `${newUser.user_metadata?.first_name || ''} ${newUser.user_metadata?.last_name || ''}`.trim()
    }
  },
  { immediate: true },
)

// Watch for profile changes → update avatar and name
watch(
  () => authStore.profile,
  (newProfile) => {
    if (newProfile) {
      fullName.value =
        `${authStore.userData?.user_metadata?.first_name || ''} ${authStore.userData?.user_metadata?.last_name || ''}`.trim()
      avatarUrl.value = newProfile.avatar_url || null
    }
  },
  { immediate: true },
)

// Reload user if route changes but component is reused
onBeforeRouteUpdate((to, from, next) => {
  loadUser()
  next()
})

// Shop button logic
const goShopOrBuild = () => {
  if (hasShop.value) {
    router.push('/usershop')
  } else {
    router.push('/shop-build')
  }
}
</script>

<template>
  <v-app>
    <!-- Main Profile Content -->
    <v-main>
      <!-- Shop Button - Top Left -->
      <div class="shop-btn-container">
        <v-btn @click="goShopOrBuild" class="shop-btn" size="large">
          <v-icon start size="25">mdi-storefront-outline</v-icon>
          {{ hasShop ? 'View Shop' : 'Create Shop' }}
        </v-btn>
      </div>

      <!-- Settings Icon - Top Right -->
      <v-btn variant="text" icon class="settings-btn" @click="router.push('/settings')">
        <v-icon size="29">mdi-cog-outline</v-icon>
      </v-btn>

      <!-- Profile Header -->
      <div class="profile-header">
        <div class="profile-inline">
          <div class="avatar-container">
            <v-avatar size="80" color="grey-lighten-3">
              <v-img v-if="avatarUrl" :src="avatarUrl" cover />
              <v-icon v-else size="40">mdi-account</v-icon>
            </v-avatar>
            <v-btn class="edit-btn" color="primary" icon elevation="4" @click="router.push('/edit-profile')">
              <v-icon class="edit-icon">mdi-pencil</v-icon>
            </v-btn>
          </div>

          <!-- Name above Email -->
          <div class="info-block">
            <h2 class="name-row">{{ fullName || 'Loading...' }}</h2>
            <p class="email-row">{{ user?.email || '...' }}</p>
          </div>
        </div>
      </div>

      <v-divider thickness="2" class="my-4"></v-divider>

      <!-- Shopee-style Icon Navigation -->
      <div class="shopee-nav-section">
        <div class="nav-grid">
          <div 
            v-for="item in navItems" 
            :key="item.id"
            class="nav-item"
            :class="{ 'active': selectedSection === item.id }"
            @click="handleNavClick(item.id)"
          >
            <div class="nav-icon-container">
              <v-icon 
                :color="selectedSection === item.id ? item.color : '#757575'"
                size="28"
              >
                {{ item.icon }}
              </v-icon>
              <div v-if="item.count > 0" class="badge">
                {{ item.count > 99 ? '99+' : item.count }}
              </div>
            </div>
            <span class="nav-title">{{ item.title }}</span>
          </div>
        </div>
      </div>

      <!-- Content Section -->
      <div class="content-section">
        <v-expand-transition>
          <div v-if="selectedSection === 'my-purchases'" class="section-content">
            <!-- My Purchases Content -->
            <div class="empty-state">
              <v-icon size="64" color="grey-lighten-1">mdi-shopping-outline</v-icon>
              <p class="empty-text">No purchases yet</p>
              <v-btn color="primary" @click="router.push('/')">
                Start Shopping
              </v-btn>
            </div>
          </div>

          <div v-else-if="selectedSection === 'to-pay'" class="section-content">
            <!-- To Pay Content -->
            <div class="empty-state">
              <v-icon size="64" color="grey-lighten-1">mdi-credit-card-outline</v-icon>
              <p class="empty-text">No pending payments</p>
            </div>
          </div>

          <div v-else-if="selectedSection === 'to-ship'" class="section-content">
            <!-- To Ship Content -->
            <div class="empty-state">
              <v-icon size="64" color="grey-lighten-1">mdi-truck-outline</v-icon>
              <p class="empty-text">No orders to ship</p>
            </div>
          </div>

          <div v-else-if="selectedSection === 'to-receive'" class="section-content">
            <!-- To Receive Content -->
            <div class="empty-state">
              <v-icon size="64" color="grey-lighten-1">mdi-package-down</v-icon>
              <p class="empty-text">No packages to receive</p>
            </div>
          </div>

          <div v-else-if="selectedSection === 'completed'" class="section-content">
            <!-- Completed Content -->
            <div class="empty-state">
              <v-icon size="64" color="grey-lighten-1">mdi-check-circle-outline</v-icon>
              <p class="empty-text">No completed orders</p>
            </div>
          </div>

          <div v-else-if="selectedSection === 'cancelled'" class="section-content">
            <!-- Cancelled Content -->
            <div class="empty-state">
              <v-icon size="64" color="grey-lighten-1">mdi-close-circle-outline</v-icon>
              <p class="empty-text">No cancelled orders</p>
            </div>
          </div>

          <div v-else-if="selectedSection === 'refunds'" class="section-content">
            <!-- Refunds Content -->
            <div class="empty-state">
              <v-icon size="64" color="grey-lighten-1">mdi-cash-refund</v-icon>
              <p class="empty-text">No refund requests</p>
            </div>
          </div>

          <div v-else-if="selectedSection === 'reviews'" class="section-content">
            <!-- Reviews Content -->
            <div class="empty-state">
              <v-icon size="64" color="grey-lighten-1">mdi-star-outline</v-icon>
              <p class="empty-text">No reviews pending</p>
            </div>
          </div>
        </v-expand-transition>
      </div>
    </v-main>

    <!-- Reusable BottomNav -->
    <BottomNav v-model="activeTab" />
  </v-app>
</template>

<style scoped>
/* Global font style */
:root {
  font-family: 'Inter', 'Poppins', 'Roboto', sans-serif;
}

/* Shop Button Container - Top Left */
.shop-btn-container {
  padding-top: 15px;
  position: absolute;
  top: 20px;
  left: 16px;
  z-index: 1200;
}

.shop-btn {
  text-transform: none;
  border-top-right-radius: 20px;
  border-bottom-right-radius: 20px;
  box-shadow: 0 4px 12px rgba(23, 101, 179, 0.3);
  transition: all 0.3s ease;
  background: linear-gradient(135deg, #ffffff, #f8f9faf7) !important;
  color: #464749 !important;
  font-weight: 600;
  font-size: 0.95rem;
  border: 2px solid #5e6e7e;
  padding: 8px 20px;
  height: 35px !important;
  margin-left: -14px;
  max-width: 200px;
}

/* Settings Button - Top Right */
.settings-btn {
  padding-top: 25px;
  position: absolute;
  top: 20px;
  right: 16px;
  z-index: 1200;
  color: #ffffff;
  border-radius: 50%;
  width: 48px;
  height: 48px;
}

/* Profile Header */
.profile-header {
  padding-top: 80px !important;
  padding-bottom: 30px !important;
  display: flex;
  align-items: flex-start;
  gap: 20px;
  flex-wrap: wrap;
  background: linear-gradient(135deg, #354d7c, #5276b0, #354d7c);
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.12);
  color: #fff;
  margin-top: 0px !important;
  border-bottom-left-radius: 20px;
}

.avatar-container {
  position: relative;
  display: inline-block;
  flex-shrink: 0;
}

.edit-btn {
  position: absolute;
  bottom: 0;
  right: 0;
  transform: translate(30%, 30%);
  border: 2px solid white;
  border-radius: 50%;
  transition: all 0.25s ease-in-out;
  width: 25px !important;
  height: 25px !important;
  background-color: #5ca3eb;
  color: white;
}

.edit-icon {
  font-size: 16px;
}

.profile-inline {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: nowrap;
}

.info-block {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1 1 auto;
}

.name-row {
  margin: 0;
  font-size: 1.6rem;
  font-weight: 200;
  letter-spacing: 0.3px;
  color: #fff;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.email-row {
  margin: 0;
  font-size: 0.95rem;
  color: #e0e7ef;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Shopee-style Navigation */
.shopee-nav-section {
  padding: 16px;
  background: white;
}

.nav-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
}

.nav-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 12px 8px;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.3s ease;
  position: relative;
}

.nav-item:hover {
  background-color: #f8f9fa;
}

.nav-item.active {
  background-color: #fff2f0;
}

.nav-icon-container {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
}

.badge {
  position: absolute;
  top: -4px;
  right: -4px;
  background: #354d7c !important;
  color: white;
  border-radius: 10px;
  padding: 2px 6px;
  font-size: 10px;
  font-weight: 600;
  min-width: 18px;
  text-align: center;
  line-height: 1;
}

.nav-title {
  font-size: 0.75rem;
  font-weight: 500;
  text-align: center;
  color: #333;
  line-height: 1.2;
}

.nav-item.active .nav-title {
  color: #354d7c!important;
  font-weight: 600;
}

/* Content Section */
.content-section {
  padding: 16px;
  min-height: 300px;
}

.section-content {
  width: 100%;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
  text-align: center;
  color: #757575;
}

.empty-text {
  margin: 16px 0;
  font-size: 1rem;
  color: #999;
}

/* Responsive styles */
@media (max-width: 1024px) {
  .shop-btn {
    font-size: 0.9rem;
    padding: 6px 18px;
    height: 44px;
  }

  .settings-btn {
    width: 44px;
    height: 44px;
  }

  .name-row {
    font-size: 1.4rem;
  }
}

@media (max-width: 768px) {
  .shop-btn-container {
    top: 16px;
    left: 12px;
  }

  .settings-btn {
    top: 16px;
    right: 12px;
  }

  .profile-header {
    padding: 70px 18px 18px 18px;
    gap: 16px;
    margin-top: 15px;
  }

  .nav-grid {
    grid-template-columns: repeat(4, 1fr);
    gap: 12px;
  }

  .nav-item {
    padding: 10px 6px;
  }

  .nav-icon-container {
    width: 42px;
    height: 42px;
  }

  .nav-title {
    font-size: 0.7rem;
  }
}

@media (max-width: 600px) {
  .shop-btn-container {
    top: 12px;
    left: 8px;
  }

  .settings-btn {
    top: 12px;
    right: 8px;
    width: 40px;
    height: 40px;
  }

  .profile-header {
    padding: 60px 16px 16px 16px;
    flex-direction: column;
    gap: 12px;
    margin-top: 10px;
  }

  .shop-btn {
    font-size: 0.8rem;
    padding: 4px 14px;
    height: 36px;
    min-width: 120px;
  }

  .name-row {
    font-size: 1.1rem;
  }

  .email-row {
    font-size: 0.85rem;
  }

  .nav-grid {
    grid-template-columns: repeat(4, 1fr);
    gap: 8px;
  }

  .nav-item {
    padding: 8px 4px;
  }

  .nav-icon-container {
    width: 36px;
    height: 36px;
  }

  .nav-title {
    font-size: 0.65rem;
  }

  .badge {
    font-size: 9px;
    padding: 1px 4px;
    min-width: 16px;
  }
}

@media (max-width: 380px) {
  .nav-grid {
    grid-template-columns: repeat(4, 1fr);
    gap: 6px;
  }

  .nav-title {
    font-size: 0.6rem;
  }
}

/* Animation for buttons and nav items */
.shop-btn,
.settings-btn,
.edit-btn,
.nav-item {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

/* Ensure proper spacing for main content */
.v-main {
  position: relative;
}
</style>