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
const avatarUrl = ref(null)   // User avatar image URL
const user = ref(null)        // Authenticated user object
const fullName = ref('')      // Full name string
const hasShop = ref(false)    // Boolean: does the user own a shop?

// Load the user info
const loadUser = async () => {
  if (authStore.userData && authStore.profile) {
    // ✅ Use store data if already available
    user.value = authStore.userData
    fullName.value =
      `${authStore.userData?.user_metadata?.first_name || ''} ${authStore.userData?.user_metadata?.last_name || ''}`.trim()
    avatarUrl.value = authStore.profile.avatar_url || null
  } else {
    // ✅ Fallback: fetch directly from Supabase if store empty
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

// --------- REACTIVITY (watchers & lifecycle) ---------

// Run when component mounts
onMounted(async () => {
  await loadUser()       // Load user info
  await checkUserShop()  // Then check shop status
})

// Watch for user changes → re-check shop ownership
watch(
  () => user.value?.id,
  async (newId) => {
    if (newId) {
      await checkUserShop()
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

// Shop button logic → one button with 2 states
const goShopOrBuild = () => {
  if (hasShop.value) {
    router.push('/usershop')    // ✅ Go to existing shop
  } else {
    router.push('/shop-build')  // ✅ Go to create new shop
  }
}

// Purchase sections (dropdown menu)
const purchaseSections = ['My purchases', 'Cancelled', 'Purchased done']
const selectedSection = ref(purchaseSections[0])
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
      <!-- Profile Header -->
      <div class="profile-header">
        <!-- ONE ROW: avatar | (name over email) -->
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

          <!-- Name above Email (stacked), but both stay to the RIGHT of avatar -->
          <div class="info-block">
            <h2 class="name-row">{{ fullName || 'Loading...' }}</h2>
            <p class="email-row">{{ user?.email || '...' }}</p>
          </div>
        </div>
      </div>


      <v-divider thickness="2" class="my-4"></v-divider>

      <!-- Dropdown for Sections -->
      <div class="content-section">
        <v-select v-model="selectedSection" :items="purchaseSections" label="Purchase Status" variant="outlined"
          density="comfortable" />

        <!-- Purchase sections content -->
        <v-expand-transition>
          <div v-if="selectedSection === 'My purchases'" class="mypurchases">
            <!-- Your purchase cards here -->
          </div>
        </v-expand-transition>

        <!-- Other sections... -->
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

.profile-info {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
  text-align: left;
  flex: 1;
}

.name {
  margin: 0;
  font-size: 1.6rem;
  font-weight: 100;
  color: #ffffff;
  letter-spacing: 0.5px;
}

.email {
  margin: 0;
  font-size: 0.95rem;
  color: #e0e7ef;
  font-weight: 400;
}

/* Content Section */
.content-section {
  padding: 0 16px 16px 16px;
}

/* v-select styling */
:deep(.v-select) {
  border-radius: 10px;
  font-weight: 500;
  font-size: 0.95rem;
  color: #333;
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

  .v-avatar {
    width: 70px !important;
    height: 70px !important;
  }

  .name {
    font-size: 1.4rem;
  }

  .email {
    font-size: 0.9rem;
  }

  .shop-btn {
    font-size: 0.85rem;
    padding: 5px 16px;
    height: 40px;
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

  .shop-btn .v-icon {
    margin-right: 4px;
  }
}

/* More responsive styles for avatar and profile info */

/* Animation for buttons */
.shop-btn,
.settings-btn,
.edit-btn {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

/* Ensure proper spacing for main content */
.v-main {
  position: relative;
}

/* Keep avatar + info in one horizontal row */
.profile-inline {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: nowrap;

}

/* Right side: vertical stack (name over email) that never leaves avatar's row */
.info-block {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1 1 auto;
}

/* Name on one line with ellipsis */
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

/* Email on one line with ellipsis, below name */
.email-row {
  margin: 0;
  font-size: 0.95rem;
  color: #e0e7ef;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Responsive font tweaks */
@media (max-width: 1024px) {
  .name-row {
    font-size: 1.4rem;
  }
}

@media (max-width: 600px) {
  .name-row {
    font-size: 1.1rem;
  }

  .email-row {
    font-size: 0.85rem;
  }
}
</style>
