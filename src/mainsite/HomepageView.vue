<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useGeolocation } from '@/composables/useGeolocation'
import { useRouter } from 'vue-router'
import { useAuthUserStore } from '@/stores/authUser'

const router = useRouter()
const authStore = useAuthUserStore()

const search = ref('')

const onSearch = () => {
  console.log('Searching for:', search.value)
}

const goHome = () => console.log("Home clicked")
const goCart = () => console.log("Cart clicked")
const goChat = () => console.log("Chat clicked")
const goNotifications = () => console.log("Notifications clicked")
const goAccount = () => console.log("Account clicked")

// Import location composable
const { latitude, longitude, error, requestPermission, getLocation } = useGeolocation()

onMounted(async () => {
  await requestPermission()
  await getLocation()
})

const handleLogout = async () => {
  try {
    await authStore.signOut()
    router.push({ name: 'LoginView' }) // ✅ always go back to login
  } catch (error) {
    console.error('Logout failed:', error)
    alert('Something went wrong while logging out.')
  }
}
</script>

<template>
  <v-app>
    <!-- Top Navigation -->
    <v-app-bar class="top-nav " elevation="0" flat color="#5ca3eb">
      <div class="m-10">
        <v-text-field v-model="search" label="Search..." hide-details density="comfortable" variant="outlined"
          class="search-bar" @keyup.enter="onSearch">
          <template v-slot:append>
            <v-btn icon @click="onSearch">
              <v-icon>mdi-magnify</v-icon>
            </v-btn>
            <v-btn icon to="/mapsearch">
              <v-icon>mdi-search-web</v-icon>
            </v-btn>
          </template>
        </v-text-field>
      </div>
    </v-app-bar>

    <!-- Main Content -->
    <v-main class="app-main">
      <v-card class="mx-auto my-8 pa-6" color="primary" elevation="2" max-width="400">
        <h1 class="text-h4 text-center text-white font-weight-bold">second</h1>
      </v-card>
      <v-btn color="error" @click="handleLogout">Logout</v-btn>
    </v-main>

    <!-- Bottom Navigation -->
    <v-bottom-navigation class="bot-nav" height="64">
      <v-btn value="home" @click="goHome">
        <v-icon>mdi-home-outline</v-icon>
      </v-btn>

      <v-btn value="cart" @click="goCart">
        <v-icon>mdi-cart-outline</v-icon>
      </v-btn>

      <v-btn value="chat" @click="goChat">
        <v-icon>mdi-chat-outline</v-icon>
      </v-btn>

      <v-btn value="notifications" @click="goNotifications">
        <v-icon>mdi-bell-outline</v-icon>
      </v-btn>

      <v-btn value="account" @click="goAccount">
        <v-icon>mdi-account-check-outline</v-icon>
      </v-btn>
    </v-bottom-navigation>
  </v-app>
</template>

<style scoped>
.top-nav {
  background-color: #5ca3eb;
}

.bot-nav {
  background-color: #5ca3eb;
}

.search-bar {
  max-width: 600px;
  flex: 1;
}

.app-main {
  padding: 16px;
  margin-bottom: 64px; /* leave space above bottom nav */
}
</style>
