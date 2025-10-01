<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()
const messages = ref([
  { id: 1, sender: 'me', text: 'Hey! How are you?', time: '10:30 AM' },
  { id: 2, sender: 'other', text: 'I’m good, thanks! You?', time: '10:31 AM' },
  { id: 3, sender: 'me', text: 'Doing great 🚀 Working on my project.', time: '10:32 AM' },
])

const newMessage = ref('')

const goBack = () => router.back()

const sendMessage = () => {
  if (!newMessage.value.trim()) return
  messages.value.push({
    id: Date.now(),
    sender: 'me',
    text: newMessage.value,
    time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
  })
  newMessage.value = ''
}
</script>

<template>
  <v-app>
    <!-- Top Bar -->
    <v-app-bar flat color="primary" dark>
      <v-btn icon @click="goBack">
        <v-icon>mdi-arrow-left</v-icon>
      </v-btn>
      <v-toolbar-title class="text-h6">Chat</v-toolbar-title>
    </v-app-bar>

    <!-- Messages -->
    <v-main>
      <div class="chat-container">
        <div
          v-for="msg in messages"
          :key="msg.id"
          :class="['message-bubble', msg.sender === 'me' ? 'me' : 'other']"
        >
          <p class="text">{{ msg.text }}</p>
          <span class="time">{{ msg.time }}</span>
        </div>
      </div>
    </v-main>

    <!-- Bottom Input -->
    <v-footer app absolute class="pa-2" color="white">
      <v-text-field
        v-model="newMessage"
        variant="outlined"
        density="comfortable"
        placeholder="Type a message..."
        hide-details
        class="flex-grow-1"
        @keyup.enter="sendMessage"
      />
      <v-btn icon color="primary" @click="sendMessage">
        <v-icon>mdi-send</v-icon>
      </v-btn>
    </v-footer>
  </v-app>
</template>

<style scoped>
.chat-container {
  display: flex;
  flex-direction: column;
  padding: 16px;
  gap: 12px;
}

.message-bubble {
  max-width: 70%;
  padding: 10px 14px;
  border-radius: 16px;
  font-size: 0.95rem;
  display: flex;
  flex-direction: column;
}

.message-bubble.me {
  align-self: flex-end;
  background: #1976d2;
  color: white;
  border-bottom-right-radius: 4px;
}

.message-bubble.other {
  align-self: flex-start;
  background: #f1f1f1;
  color: #000;
  border-bottom-left-radius: 4px;
}

.time {
  font-size: 0.7rem;
  opacity: 0.7;
  margin-top: 4px;
  align-self: flex-end;
}
</style>
