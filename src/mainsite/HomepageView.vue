<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useGeolocation } from '@/composables/useGeolocation'
import { useRouter } from 'vue-router'
import { useAuthUserStore } from '@/stores/authUser'

const authStore = useAuthUserStore()

const search = ref('')

const onSearch = () => {
  console.log('Searching for:', search.value)
}

// router instance
const router = useRouter()

// Navigation functions
const goHome = () => router.push('/homepage')
const goCart = () => router.push('/cartview')
const goChat = () => router.push('/messageview')
const goMap = () => router.push('/mapsearch')
const goNotifications = () => router.push('/notificationview')
const goAccount = () => router.push('/profileview')

// Import location composable
const { latitude, longitude, error, requestPermission, getLocation } = useGeolocation()

onMounted(async () => {
  await requestPermission()
  await getLocation()
})
</script>

<template>
  <v-app>
    <!-- Top Navigation -->
    <v-app-bar class="top-nav" elevation="0" flat color="#5ca3eb">
      <div class="m-10">
        <v-text-field
          v-model="search"
          label="Search..."
          hide-details
          density="comfortable"
          variant="outlined"
          class="search-bar"
          @keyup.enter="onSearch"
        >
          <template v-slot:append>
            <v-btn icon @click="onSearch">
              <v-icon>mdi-magnify</v-icon>
            </v-btn>
            <v-btn icon @click="goNotifications">
              <v-icon>mdi-bell-outline</v-icon>
            </v-btn>
          </template>
        </v-text-field>
      </div>
    </v-app-bar>

    <!-- Main Content -->
    <v-main class="app-main">
      <h3>
        <strong><u> Popular item </u></strong>
      </h3>
      <h3>
        <strong><u> see more </u></strong>
      </h3>
      <h3>
        <strong><u> Shops Near You </u></strong>
      </h3>
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
