
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
<v-app>
 <v-app-bar flat elevation="0" color="transparent">
   <v-btn variant="text" @click="goBack">
  <v-icon start>mdi-arrow-left</v-icon>
  Back
</v-btn>
    <v-toolbar-title class="font-bold"><strong>Messages</strong></v-toolbar-title>
  </v-app-bar> 
    <v-divider></v-divider>
<v-main>
<div class="notification-view">
  <v-alert type="info" border="start" color="primary" icon="mdi-information-outline">
    No messages yet!!
  </v-alert>
</div>
</v-main>
    
</v-app>

</template>
<style scoped>
.notification-view {
  padding: 16px;
}
</style>
