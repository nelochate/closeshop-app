<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import BottomNav from '@/common/layout/BottomNav.vue'
import { supabase } from '@/utils/supabase'

const activeTab = ref('chat')

// router instance
const router = useRouter()
const goBack = () => router.back()

// state
const messages = ref<any[]>([])

// fetch messages from DB
const fetchMessages = async () => {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return

  const { data, error } = await supabase
    .from('messages')
    .select('id, content, created_at, sender_id, receiver_id, is_read')
    .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Error fetching messages:', error.message)
    return
  }

  // Map results to your UI format
  messages.value = data.map((msg) => ({
    id: msg.id,
    sender: msg.sender_id === user.id ? 'You' : msg.sender_id, // later: join with profiles
    lastMessage: msg.content,
    time: new Date(msg.created_at).toLocaleTimeString(),
    unread: !msg.is_read && msg.receiver_id === user.id,
    avatar: 'https://via.placeholder.com/48', // TODO: replace with user profile pic if available
  }))
}

// subscribe to realtime messages
const subscribeMessages = () => {
  supabase
    .channel('messages')
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'messages' },
      (payload) => {
        console.log('New message:', payload.new)
        const newMsg = payload.new
        messages.value.unshift({
          id: newMsg.id,
          sender: newMsg.sender_id,
          lastMessage: newMsg.content,
          time: new Date(newMsg.created_at).toLocaleTimeString(),
          unread: true,
          avatar: 'https://via.placeholder.com/48',
        })
      }
    )
    .subscribe()
}

onMounted(() => {
  fetchMessages()
  subscribeMessages()
})
</script>

<template>
  <v-app>
    <!-- Top App Bar -->
    <v-app-bar flat elevation="0" class="top-nav" color="#3f83c7">
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

    <!-- Reusable BottomNav -->
    <BottomNav v-model="activeTab" />
  </v-app>
</template>

<style scoped>
.bot-nav,
.top-nav {
  background-color: #5ca3eb;
}
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
