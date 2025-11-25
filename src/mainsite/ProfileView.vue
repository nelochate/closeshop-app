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

//for navigation items
const sectionItems = ref([]) // Holds items for the selected section
const isLoadingSection = ref(false)

// Shopee-style navigation items
const navItems = ref([
  {
    id: 'my-purchases',
    title: 'My Purchases',
    icon: 'mdi-package-variant',
    color: '#354d7c',
    count: 0,
  },
  
  {
    id: 'to-receive',
    title: 'To Receive & Pay',
    icon: 'mdi-package-down',
    color: '#354d7c',
    count: 0
  },
    {
    id: 'reviews',
    title: 'To Review',
    icon: 'mdi-star-outline',
    color: '#354d7c',
    count: 0,
  },
  {
    id: 'completed',
    title: 'Completed',
    icon: 'mdi-check-circle-outline',
    color: '#354d7c',
    count: 0,
  },
  {
    id: 'cancelled',
    title: 'Cancelled',
    icon: 'mdi-close-circle-outline',
    color: '#354d7c',
    count: 0,
  },


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
    const { data: orders, error } = await supabase
      .from('orders')
      .select('status, id')
      .eq('user_id', user.value.id)

    if (error) {
      console.error('Error loading order counts:', error)
      return
    }

    navItems.value = navItems.value.map((item) => {
      let count = 0
      switch (item.id) {
        case 'to-pay':
          count = orders.filter((o) => o.status === 'pending').length
          break
        case 'to-ship':
          count = orders.filter((o) => o.status === 'paid').length
          break
        case 'to-receive':
          count = orders.filter((o) => o.status === 'shipped').length
          break
        case 'completed':
          count = orders.filter((o) => o.status === 'delivered').length
          break
        case 'cancelled':
          count = orders.filter((o) => o.status === 'cancelled').length
          break
        case 'reviews':
          // Count orders that are delivered but not reviewed yet
          count = orders.filter((o) => o.status === 'delivered').length // can refine later
          break
        default:
          count = orders.length
      }
      return { ...item, count }
    })
  } catch (err) {
    console.error('Error loading order counts:', err)
  }
}

// Navigation handler
const handleNavClick = async (itemId) => {
  selectedSection.value = itemId
  await loadSectionItems(itemId)
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

// Load items for the selected section
const loadSectionItems = async (sectionId) => {
  if (!user.value?.id) return
  isLoadingSection.value = true

  try {
    let query = supabase
      .from('orders')
      .select(
        `
        id,
        status,
        total_amount,
        created_at,
        order_items (
          id,
          product_id,
          quantity,
          price,
          selected_size,
          selected_variety,
          products (
            id,
            prod_name,
            main_img_urls
          )
        )
      `,
      )
      .eq('user_id', user.value.id)

    switch (sectionId) {
      case 'to-pay':
        query = query.eq('status', 'pending')
        break
      case 'to-ship':
        query = query.eq('status', 'paid')
        break
      case 'to-receive':
        query = query.eq('status', 'shipped')
        break
      case 'completed':
        query = query.eq('status', 'delivered')
        break
      case 'cancelled':
        query = query.eq('status', 'cancelled')
        break
      case 'reviews':
        query = query.eq('status', 'delivered')
        break
      case 'my-purchases':
      default:
        break
    }

    const { data, error } = await query.order('created_at', { ascending: false })

    if (error) {
      console.error('Error loading section items:', error)
      sectionItems.value = []
    } else {
      // Flatten order_items for display - INCLUDING PRODUCT ID
      sectionItems.value = data.flatMap((order) =>
        order.order_items.map((item) => ({
          id: item.id,
          order_id: order.id,
          product_id: item.product_id, // Add product_id here
          status: order.status,
          quantity: item.quantity,
          price: item.price,
          product_name: item.products?.prod_name,
          product_img: item.products?.main_img_urls?.[0] || null,
          selected_size: item.selected_size,
          selected_variety: item.selected_variety,
        })),
      )
    }
  } catch (err) {
    console.error('Error fetching section items:', err)
    sectionItems.value = []
  } finally {
    isLoadingSection.value = false
  }
}

// View product function
const viewProduct = (productId) => {
  if (productId) {
    router.push(`/viewproduct/${productId}`)
  }
}

// View order details function (if you want to keep this too)
const viewOrder = (orderId) => {
  if (orderId) {
    router.push(`/order/${orderId}`)
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
            <v-btn
              class="edit-btn"
              color="primary"
              icon
              elevation="4"
              @click="router.push('/edit-profile')"
            >
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
            :class="{ active: selectedSection === item.id }"
            @click="handleNavClick(item.id)"
          >
            <div class="nav-icon-container">
              <v-icon :color="selectedSection === item.id ? item.color : '#757575'" size="28">
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
          <div v-if="isLoadingSection" class="section-content">
            <v-progress-circular indeterminate color="primary"></v-progress-circular>
          </div>

          <div v-else class="section-content">
            <v-row v-if="sectionItems.length > 0" dense>
              <v-col v-for="order in sectionItems" :key="order.id" cols="12" sm="6" md="4">
                <v-card outlined class="order-card">
                  <v-img 
                    v-if="order.product_img" 
                    :src="order.product_img" 
                    height="150px" 
                    cover 
                    style="cursor: pointer;"
                    @click="viewProduct(order.product_id)"
                  />
                  <v-card-title>{{ order.product_name || 'Product' }}</v-card-title>
                  <v-card-subtitle>
                    <v-chip small :color="
                      order.status === 'completed' ? 'success' :
                      order.status === 'cancelled' ? 'error' :
                      order.status === 'pending' ? 'warning' :
                      'primary'
                    ">
                      {{ order.status }}
                    </v-chip>
                  </v-card-subtitle>
                  <v-card-text>
                    <div><strong>Quantity:</strong> {{ order.quantity }}</div>
                    <div><strong>Price:</strong> ₱{{ order.price }}</div>
                    <div v-if="order.selected_size"><strong>Size:</strong> {{ order.selected_size }}</div>
                    <div v-if="order.selected_variety"><strong>Variety:</strong> {{ order.selected_variety }}</div>
                  </v-card-text>
                  <v-card-actions>
                    <!-- View Product Button -->
                    <v-btn 
                      color="primary" 
                      variant="outlined" 
                      size="small"
                      @click="viewProduct(order.product_id)"
                    >
                      <v-icon left small>mdi-eye</v-icon>
                      View Product
                    </v-btn>
                    
                    <!-- View Order Button (optional) -->
                    <v-btn 
                      color="secondary" 
                      variant="text" 
                      size="small"
                      @click="viewOrder(order.order_id)"
                    >
                      <v-icon left small>mdi-receipt</v-icon>
                      Order Details
                    </v-btn>
                  </v-card-actions>
                </v-card>
              </v-col>
            </v-row>

            <div v-else class="empty-state">
              <v-icon size="64" color="grey-lighten-1">mdi-cart-off</v-icon>
              <p class="empty-text">No items in this section</p>

              <!-- Show Start Shopping button only for My Purchases -->
              <v-btn
                v-if="selectedSection === 'my-purchases'"
                color="primary"
                class="mt-4"
                @click="router.push('/')"
              >
                Start Shopping
              </v-btn>
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
  color: #354d7c !important;
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

/* Additional styles for the order cards */
.order-card {
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.order-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.v-card-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.v-card-actions .v-btn {
  flex: 1;
  min-width: 120px;
}

/* Responsive adjustments for buttons */
@media (max-width: 600px) {
  .v-card-actions {
    flex-direction: column;
  }
  
  .v-card-actions .v-btn {
    width: 100%;
  }
}

</style>
