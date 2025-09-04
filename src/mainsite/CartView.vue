<script setup lang="ts">
import { useRouter } from 'vue-router'

// router instance
const router = useRouter()

// go back
const goBack = () => {
  router.back()
}
</script>

<template>
<v-app>  <!-- Header -->
  <v-app-bar flat elevation="0" color="transparent">
   <v-btn variant="text" @click="goBack">
  <v-icon start>mdi-arrow-left</v-icon>
  Back
</v-btn>
    <v-toolbar-title class="font-bold"><strong>Cart</strong></v-toolbar-title>
  </v-app-bar>

  <!-- Main Content -->
  <v-main>
    <v-container class="content" fluid>
      <h1 class="text-h5 font-weight-bold">no content yet</h1>
      <v-icon size="64" color="grey">mdi-cart-outline</v-icon>
      <p class="text-grey">Your cart is empty</p>
    </v-container>
  </v-main></v-app>
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
