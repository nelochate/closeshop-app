<script setup lang="ts">
import { useRouter } from 'vue-router'

// router instance
const router = useRouter()


// Navigation functions
const goHome = () => router.push('/homepage')
const goCart = () => router.push('/cartview')
const goChat = () => router.push('/messageview')
const goMap = () => router.push('/mapsearch')
const goNotifications = () => router.push('/notificationview')
const goAccount = () => router.push('/profileview')
</script>

<template>
<v-app>  <!-- Header -->
  <v-app-bar flat elevation="0" color="transparent">
   
    <v-toolbar-title class="font-bold"><strong>Cart</strong></v-toolbar-title>
  </v-app-bar>

  <!-- Main Content -->
  <v-main>
    <v-container class="content" fluid>
      <h1 class="text-h5 font-weight-bold">no content yet</h1>
      <v-icon size="64" color="grey">mdi-cart-outline</v-icon>
      <p class="text-grey">Your cart is empty</p>
    </v-container>
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
.content {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 24px;
}
</style>
