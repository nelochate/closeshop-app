<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import BottomNav from '@/common/layout/BottomNav.vue'

const router = useRouter()
const activeTab = ref('cart') // this page is "Cart"

// navigation helpers (only if you still need them separately)
const goNotifications = () => router.push('/notificationview')
</script>

<template>
  <v-app>
    <!-- Header -->
    <v-app-bar flat elevation="0" color="#5ca3eb">
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

    <!-- Reusable BottomNav -->
    <BottomNav v-model="activeTab" />
  </v-app>
</template>

<style scoped>
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
