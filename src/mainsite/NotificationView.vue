<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'

// router instance
const router = useRouter()
const goBack = () => router.back()

// sample notifications
const notifications = ref([
  {
    id: 1,
    type: 'order',
    title: 'Order Shipped',
    message: 'Your order #1234 has been shipped.',
    time: '10m ago',
    read: false,
    icon: 'mdi-truck',
  },
  {
    id: 2,
    type: 'promo',
    title: 'Special Offer',
    message: 'Get 20% off on your next purchase.',
    time: '1h ago',
    read: true,
    icon: 'mdi-sale',
  },
  {
    id: 3,
    type: 'chat',
    title: 'New Message',
    message: 'Jane: "Hi, are you available tomorrow?"',
    time: 'Yesterday',
    read: false,
    icon: 'mdi-message-text',
  },
])
</script>

<template>
  <v-app>
    <!-- Top Bar -->
    <v-app-bar flat elevation="0" color="transparent">
      <v-btn variant="text" @click="goBack">
        <v-icon start>mdi-arrow-left</v-icon>
      </v-btn>
      <v-toolbar-title class="font-bold">
        <strong>Notification</strong>
      </v-toolbar-title>
    </v-app-bar>

    <v-divider />

    <v-main>
      <div class="notification-view">
        <!-- If no notifications -->
        <v-alert
          v-if="notifications.length === 0"
          type="info"
          border="start"
          color="primary"
          icon="mdi-information-outline"
        >
          No notification yet!!
        </v-alert>

        <!-- Otherwise show list -->
        <v-list v-else>
          <v-list-item
            v-for="notif in notifications"
            :key="notif.id"
            :class="{ 'bg-grey-lighten-4': !notif.read }"
            class="notification-item"
          >
            <v-list-item-avatar>
              <v-avatar color="primary" size="40">
                <v-icon color="white">{{ notif.icon }}</v-icon>
              </v-avatar>
            </v-list-item-avatar>

            <v-list-item-content>
              <v-list-item-title>
                <strong>{{ notif.title }}</strong>
              </v-list-item-title>
              <v-list-item-subtitle>
                {{ notif.message }}
              </v-list-item-subtitle>
            </v-list-item-content>

            <div class="text-caption text-grey">
              {{ notif.time }}
            </div>
          </v-list-item>
        </v-list>
      </div>
    </v-main>
  </v-app>
</template>

<style scoped>
.notification-view {
  padding: 16px;
}

.notification-item {
  border-bottom: 1px solid #eee;
  cursor: pointer;
}
.notification-item:hover {
  background: #f5f5f5;
}
</style>
