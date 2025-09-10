<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'

// router
const router = useRouter()
const goBack = () => router.back()

// dummy data (replace later with props or API)
const businessAvatar = ref('')
const businessName = ref('My Business Name')
const description = ref('We provide quality services at affordable prices.')
const timeOpen = ref('8:00 AM')
const timeClose = ref('9:00 PM')
const isOpen = ref(true)
const address = ref('123 Main Street, Butuan City')

// select state
const transactionFilter = ref('Orders')
const transactionOptions = ['Orders', 'Completed', 'Cancelled']
</script>

<template>
  <v-app>
    <!-- Top Bar -->
    <v-app-bar flat color="primary" dark>
      <v-btn icon @click="goBack">
        <v-icon>mdi-arrow-left</v-icon>
      </v-btn>
      <v-toolbar-title class="text-h6">Business Profile</v-toolbar-title>
    </v-app-bar>

    <v-main>
      <!-- Business Info Section -->
      <v-container class="py-6">
        <v-sheet rounded="xl" elevation="4" class="pa-6 text-center">
          <!-- Avatar with edit button -->
          <div class="relative inline-block">
            <v-avatar size="96" :image="businessAvatar">
              <v-icon v-if="!businessAvatar">mdi-store</v-icon>
            </v-avatar>
            <v-btn
              icon
              size="small"
              color="primary"
              class="absolute bottom-0 right-0"
            >
              <v-icon>mdi-camera</v-icon>
            </v-btn>
          </div>

          <h2 class="text-h6 mt-4">{{ businessName }}</h2>
          <p class="text-body-2 text-medium-emphasis">{{ description }}</p>

          <!-- Business hours -->
          <div class="mt-2">
            <p><strong>Opens:</strong> {{ timeOpen }}</p>
            <p><strong>Closes:</strong> {{ timeClose }}</p>
            <v-btn
              size="small"
              :color="isOpen ? 'green' : 'red'"
              class="mt-2"
              @click="isOpen = !isOpen"
            >
              {{ isOpen ? 'Open' : 'Closed' }}
            </v-btn>
          </div>

          <p class="mt-2 text-body-2">
            <v-icon start small>mdi-map-marker</v-icon> {{ address }}
          </p>
        </v-sheet>
      </v-container>

      <!-- Transaction Section -->
      <v-divider thickness="3">Transaction</v-divider>

      <v-container class="py-4 ">
        <v-btn color="primary" rounded="lg" prepend-icon="mdi-plus" class="mb-4" to="/productlist">
          Add Product
        </v-btn>
        
       
        <v-select
          v-model="transactionFilter"
          :items="transactionOptions"
          label="Filter Transactions"
          variant="outlined"
          density="comfortable"
        />
      </v-container>
    </v-main>
  </v-app>
</template>

<style scoped>
.relative {
  position: relative;
}
.inline-block {
  display: inline-block;
}
.absolute {
  position: absolute;
}
.bottom-0 {
  bottom: 0;
}
.right-0 {
  right: 0;
}
</style>
