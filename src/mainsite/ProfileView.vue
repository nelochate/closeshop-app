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
    <!-- Main Profile Content -->
    <v-main>
      <!-- Settings Icon -->
      <v-btn variant="text" icon class="settings-btn" @click="router.push('/settings')">
        <v-icon size="26">mdi-cog-outline</v-icon>
      </v-btn>

      <!-- Profile Header -->
      <div class="profile-header">
        <div class="avatar-container">
          <!-- Avatar -->
          <v-avatar size="80" color="grey-lighten-3">
            <v-img v-if="avatarUrl" :src="avatarUrl" cover />
            <v-icon v-else size="40">mdi-account</v-icon>
          </v-avatar>

          <!-- Floating Edit Button - Redirects to Account Settings -->
          <v-btn class="edit-btn" color="primary" icon elevation="4" @click="router.push('/edit-profile')">
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
            <v-btn @click="goShopOrBuild">
              <v-icon start size="25">mdi-storefront-outline</v-icon>
              {{ hasShop ? 'View Shop ' : 'Create Shop ' }}
            </v-btn>
          </div>
        </div>
      </div>

      <v-divider thickness="2" class="my-4"></v-divider>

      <!-- Dropdown for Sections -->
      <v-select v-model="selectedSection" :items="purchaseSections" label="Purchase Status" variant="outlined"
        density="comfortable" />

      <!-- Purchase sections content (unchanged) -->
      <v-expand-transition>
        <div v-if="selectedSection === 'My purchases'" class="mypurchases">
          <!-- Your purchase cards here -->
        </div>
      </v-expand-transition>

      <!-- Other sections... -->
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

.settings-btn {
  position: absolute;
  top: 16px;
  right: 16px;
  z-index: 1200;
  color: #fff; /* visible on gradient header */
  min-width: auto; /* shrink to icon only */
  padding: 0;      /* no padding around */
}

.profile-header {
  padding-top: 60px !important;
  display: flex;
  align-items: flex-start;
  gap: 20px;
  flex-wrap: wrap;
  background: linear-gradient(135deg, #034688, #1366b9, #3886d3, #56a4f3, #5ca5e9);
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.12);
  color: #fff;
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
  max-width: 28px;
  max-height: 28px;
  background-color: #5ca3eb;
  color: white;
}
.edit-btn:hover {
  transform: translate(30%, 30%) scale(1.1);
  background-color: #1765b3;
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

/* Shop Area */
.actions .v-btn {
  text-transform: none;
  border-top-right-radius: 50px;
  border-bottom-right-radius: 50px;
  box-shadow: 0 3px 10px rgba(23, 101, 179, 0.25);
  transition: all 0.2s ease;
  margin-top: 20px;
  margin-left: -110px;
  border: 1px solid white;

  /* Layout control */
  display: flex;
  justify-content: flex-start; /* Align text to the left */
  align-items: center;
  padding-left: 20px;
  width: 200px;  /* default width for desktop */
  height: 40px;

  background-color: rgba(236, 231, 231, 0.9) !important;
  color: rgb(70, 69, 69) !important;
  font-weight: 600;
  font-size: 0.95rem;
}

.actions .v-btn:hover {
  background-color: #1765b3 !important;
  color: #fff !important;
}

/* Tablet view */
@media (max-width: 1024px) {
  .actions .v-btn {
    width: 160px;  /* smaller background */
    padding-left: 16px;
    font-size: 0.9rem;
  }
}

/* Mobile view */
@media (max-width: 600px) {
  .actions .v-btn {
    width: auto;
    min-width: 120px;
    padding: 0 16px;
    margin-left: -100px;
    font-size: 0.85rem;
    max-width: 150px;
  }
}

/* v-select styling */
:deep(.v-select) {
  border-radius: 10px;
  font-weight: 500;
  font-size: 0.95rem;
  color: #333;
}

/* Responsive styles */
@media (max-width: 768px) {
  .profile-header {
    padding: 18px;
    gap: 16px;
  }

  .v-avatar {
    width: 70px !important;
    height: 70px !important;
  }

  .name {
    font-size: 1.3rem;
  }

  .email {
    font-size: 0.9rem;
  }
}

@media (max-width: 480px) {
  .profile-header {
    flex-direction: row;
    align-items: flex-start;
    padding: 16px;
  }

  .v-avatar {
    width: 60px !important;
    height: 60px !important;
  }

  .name {
    font-size: 1.2rem;
  }

  .email {
    font-size: 0.85rem;
  }

  .profile-info :deep(.v-btn) {
    width: 100%;
    margin-bottom: 8px;
  }
}

</style>
