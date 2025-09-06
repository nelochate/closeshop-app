<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'

// router instance
const router = useRouter()
const goBack = () => router.back()

// sample messages (simulate from DB later)
const messages = ref([
  {
    id: 1,
    sender: 'Jane Doe',
    lastMessage: 'Hi! Is the item still available?',
    time: '2m ago',
    unread: true,
    avatar: 'https://randomuser.me/api/portraits/women/1.jpg',
  },
  {
    id: 2,
    sender: 'Shop ABC',
    lastMessage: 'Your order has been confirmed 🎉',
    time: '1h ago',
    unread: false,
    avatar: 'https://randomuser.me/api/portraits/men/2.jpg',
  },
])
</script>

<template>
  <v-app>
    <!-- Top App Bar -->
    <v-app-bar flat elevation="0" color="transparent">
      <v-btn variant="text" @click="goBack">
        <v-icon start>mdi-arrow-left</v-icon>
        Back
      </v-btn>
      <v-toolbar-title class="font-bold">
        <strong>Messages</strong>
      </v-toolbar-title>
    </v-app-bar>

    <v-divider />

    <v-main>
      <div class="messages-view">
        <!-- If no messages -->
        <v-alert
          v-if="messages.length === 0"
          type="info"
          border="start"
          color="primary"
          icon="mdi-information-outline"
        >
          No messages yet!!
        </v-alert>

        <!-- Otherwise show chat list -->
        <v-list v-else>
          <v-list-item
            v-for="msg in messages"
            :key="msg.id"
            class="message-item"
            :class="{ unread: msg.unread }"
          >
            <!-- Avatar -->
            <v-list-item-avatar>
              <v-avatar size="48">
                <v-img :src="msg.avatar" alt="sender" />
              </v-avatar>
            </v-list-item-avatar>

            <!-- Message preview -->
            <v-list-item-content>
              <v-list-item-title>
                <strong>{{ msg.sender }}</strong>
              </v-list-item-title>
              <v-list-item-subtitle>
                {{ msg.lastMessage }}
              </v-list-item-subtitle>
            </v-list-item-content>

            <!-- Time -->
            <div class="text-caption text-grey">{{ msg.time }}</div>
          </v-list-item>
        </v-list>
      </div>
    </v-main>
  </v-app>
</template>

<style scoped>
.messages-view {
  padding: 16px;
}

.message-item {
  border-bottom: 1px solid #eee;
}
.message-item.unread {
  background: #e3f2fd; /* highlight unread */
}
.message-item:hover {
  background: #f5f5f5;
}
</style>
