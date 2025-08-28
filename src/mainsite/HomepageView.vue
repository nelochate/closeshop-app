<script setup lang="ts">
import { ref } from 'vue'

const search = ref('')

const onSearch = () => {
  console.log('Searching for:', search.value)
  // Add your search logic here
}

const goHome = () => console.log("Home clicked")
const goCart = () => console.log("Cart clicked")
const goChat = () => console.log("Chat clicked")
const goNotifications = () => console.log("Notifications clicked")
const goAccount = () => console.log("Account clicked")
</script>

<template>
  <v-app>
    <!-- Top Navigation -->
    <v-app-bar
      class="top-nav"
      elevation="0"
      flat
      color="#5ca3eb"
    >
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
          <v-btn icon>
            <v-icon>mdi-search-web</v-icon>
          </v-btn>
        </template>
      </v-text-field>
    </v-app-bar>

    <!-- Main Content -->
    <v-main class="app-main">
      <slot />
    </v-main>

    <!-- Bottom Navigation -->
    <v-bottom-navigation
      class="bot-nav"
      height="64"
    >
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
