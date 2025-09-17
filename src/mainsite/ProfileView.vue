<script setup>
import { ref, onMounted, watch } from 'vue'
import { useRouter, onBeforeRouteUpdate } from 'vue-router'
import { supabase } from '@/utils/supabase'
import { useAuthUserStore } from '@/stores/authUser'

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
      .eq('id', user.value.id)  // ✅ use id, not owner_id
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

// --------- NAVIGATION FUNCTIONS ---------

const goBack = () => router.back()
const goHome = () => router.push('/homepage')
const goCart = () => router.push('/cartview')
const goChat = () => router.push('/messageview')
const goMap = () => router.push('/mapsearch')
const goAccount = () => router.push('/profileview')
const goAccountSettings = () => router.push('/account-settings')

// Logout handler
const handleLogout = async () => {
  try {
    await authStore.signOut()
    router.push({ name: 'login' }) // ✅ redirect back to login page
  } catch (error) {
    console.error('Logout failed:', error)
    alert('Something went wrong while logging out.')
  }
}

// Shop button logic → one button with 2 states
const goShopOrBuild = () => {
  if (hasShop.value) {
    router.push('/usershop')    // ✅ Go to existing shop
  } else {
    router.push('/shop-build')  // ✅ Go to create new shop
  }
}

// Purchase sections (dropdown menu)
const purchaseSections = ['My purchases', 'On going', 'Cancelled', 'Purchased done/rated']
const selectedSection = ref(purchaseSections[0])
</script>

<template>
  <v-app>
    <!-- Top App Bar -->
    <v-app-bar flat density="comfortable" class="top-nav" color="#5ca3eb">
      <v-btn icon @click="goBack">
        <v-icon>mdi-arrow-left</v-icon>
      </v-btn>
      <v-toolbar-title class="text-h6"><strong>Profile</strong></v-toolbar-title>
      <!-- Menu Button -->
      <v-menu transition="fade-transition" offset-y>
        <template #activator="{ props }">
          <v-btn icon v-bind="props">
            <v-icon>mdi-menu</v-icon>
          </v-btn>
        </template>

        <v-list>
          <v-list-item @click="handleLogout">
            <v-list-item-title>
              <v-icon start small>mdi-logout</v-icon>
              Logout
            </v-list-item-title>
          </v-list-item>
        </v-list>
      </v-menu>
    </v-app-bar>
    <v-divider />

    <!-- Main Profile Content -->
    <v-main>
      <div class="profile-header">
        <div class="avatar-container">
          <!-- Avatar -->
          <v-avatar size="80" color="grey-lighten-3">
            <v-img v-if="avatarUrl" :src="avatarUrl" cover />
            <v-icon v-else size="40">mdi-account</v-icon>
          </v-avatar>

          <!-- Floating Edit Button - Redirects to Account Settings -->
          <v-btn class="edit-btn" color="primary" icon elevation="4" @click="goAccountSettings">
            <v-icon class="edit-icon">mdi-pencil</v-icon>
          </v-btn>
        </div>

        <!-- Profile Info -->
        <div class="profile-info">
          <!-- Full name -->
          <h2 class="name">{{ fullName || 'Loading...' }}</h2>

          <!-- Email below -->
          <p class="email">{{ user?.email || '...' }}</p>

          <!-- Actions -->
          <div class="actions">
            <v-btn color="primary" @click="goShopOrBuild">
              {{ hasShop ? 'My shop' : 'Click here to start selling' }}
            </v-btn>
          </div>
        </div>
      </div>

      <v-divider thickness="2" class="my-4"></v-divider>

      <!-- Dropdown for Sections -->
      <v-select
        v-model="selectedSection"
        :items="purchaseSections"
        label="Purchase Status"
        variant="outlined"
        density="comfortable"
      />

      <!-- Purchase sections content (unchanged) -->
      <v-expand-transition>
        <div v-if="selectedSection === 'My purchases'" class="mypurchases">
          <!-- Your purchase cards here -->
        </div>
      </v-expand-transition>

      <!-- Other sections... -->
    </v-main>

    <!-- Bottom Navigation -->
    <v-bottom-navigation class="bot-nav" height="64">
      <v-btn value="home" @click="goHome">
        <v-icon>mdi-home-outline</v-icon>
      </v-btn>
      <v-btn value="cart" @click="goCart">
        <v-icon>mdi-cart-outline</v-icon>
      </v-btn>
      <v-btn value="map" @click="goMap">
        <v-icon>mdi-search-web</v-icon>
      </v-btn>
      <v-btn value="chat" @click="goChat">
        <v-icon>mdi-chat-outline</v-icon>
      </v-btn>
      <v-btn value="account" @click="goAccount">
        <v-icon>mdi-account-check-outline</v-icon>
      </v-btn>
    </v-bottom-navigation>
  </v-app>
</template>

<style scoped>
/* Profile header container */
.profile-header {
  padding: 24px;
  display: flex;
  align-items: flex-start; /* Align items to the top */
  gap: 20px; /* Space between avatar and info */
  background: linear-gradient(to bottom, #5ca3eb 0%, #ffffff 100%);
  flex-wrap: wrap;
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
  transition: all 0.2s ease-in-out;
  max-width: 25px;
  max-height: 25px;
}
.edit-icon {
  font-size: 16px;
}

.edit-btn:hover {
  transform: translate(30%, 30%) scale(1.1);
}

.profile-info {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
  align-items: flex-start;
  text-align: left;
  flex: 1; /* Take remaining space */
}

.name {
  margin: 0;
  font-size: 1.5rem;
  font-weight: 600;
  color: #333;
}

.email {
  margin: 0;
  font-size: 1rem;
  color: #666;
}

.sell-link {
  font-size: 0.9rem;
  color: #1976d2;
  cursor: pointer;
  margin: 8px 0;
}
.bot-nav,
.top-nav {
  background-color: #5ca3eb;
}

/* Responsive styles */
@media (max-width: 768px) {
  .profile-header {
    padding: 16px;
    gap: 16px;
  }

  .v-avatar {
    width: 60px !important;
    height: 60px !important;
  }

  .name {
    font-size: 1.3rem;
  }
}

@media (max-width: 480px) {
  .profile-header {
    flex-direction: row; /* Keep side by side even on mobile */
    align-items: flex-start;
  }

  .v-avatar {
    width: 50px !important;
    height: 50px !important;
  }

  .name {
    font-size: 1.2rem;
  }

  .email {
    font-size: 0.9rem;
  }

  /* Stack buttons vertically on very small screens */
  .profile-info :deep(.v-btn) {
    width: 100%;
    margin-bottom: 8px;
  }
}
</style>
