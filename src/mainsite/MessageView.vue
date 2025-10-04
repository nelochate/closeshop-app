<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import BottomNav from '@/common/layout/BottomNav.vue'
import { supabase } from '@/utils/supabase'

const activeTab = ref('chat')
const router = useRouter()
const goBack = () => router.back()

// state
const conversations = ref<any[]>([])

// fetch conversations (last message per user)
const fetchConversations = async () => {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return

  // Get all messages where I am sender OR receiver
  const { data, error } = await supabase
    .from('messages')
    .select('id, content, created_at, sender_id, receiver_id, is_read')
    .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Error fetching messages:', error.message)
    return
  }

  // Group messages by the "other user"
  const convMap = new Map()

  data.forEach((msg) => {
    const otherUserId = msg.sender_id === user.id ? msg.receiver_id : msg.sender_id

    // only keep latest message per user
    if (!convMap.has(otherUserId)) {
      convMap.set(otherUserId, {
        id: msg.id,
        otherUserId,
        sender: msg.sender_id === user.id ? 'You' : msg.sender_id,
        lastMessage: msg.content,
        time: new Date(msg.created_at).toLocaleTimeString(),
        unread: !msg.is_read && msg.receiver_id === user.id,
        avatar: 'https://ui-avatars.com/api/?name=User',
      })
    }
  })

  conversations.value = Array.from(convMap.values())
}

// subscribe to new messages
const subscribeMessages = async () => {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return

  supabase
    .channel('realtime-messages')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
      const newMsg = payload.new
      const otherUserId = newMsg.sender_id === user.id ? newMsg.receiver_id : newMsg.sender_id

      const existing = conversations.value.find((c) => c.otherUserId === otherUserId)
      const latest = {
        id: newMsg.id,
        otherUserId,
        sender: newMsg.sender_id === user.id ? 'You' : newMsg.sender_id,
        lastMessage: newMsg.content,
        time: new Date(newMsg.created_at).toLocaleTimeString(),
        unread: newMsg.receiver_id === user.id,
        avatar: 'https://via.placeholder.com/48',
      }

      if (existing) {
        Object.assign(existing, latest)
      } else {
        conversations.value.unshift(latest)
      }
    })
    .subscribe()
}

// open a chat
const openChat = (conv: any) => {
  router.push({ name: 'chatview', params: { id: conv.otherUserId } })
}

onMounted(() => {
  // Fetch existing conversations
  fetchConversations()

  // Subscribe to realtime updates
  subscribeMessages()

  // 🔁 Refresh list every 15 seconds (optional but recommended)
  setInterval(fetchConversations, 15000)
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
        <!-- If no conversations -->
        <v-alert
          v-if="conversations.length === 0"
          type="info"
          border="start"
          color="primary"
          icon="mdi-information-outline"
        >
          No conversations yet!
        </v-alert>

        <!-- Otherwise show conversation list -->
        <v-list v-else>
          <v-list-item
            v-for="conv in conversations"
            :key="conv.id"
            class="message-item"
            :class="{ unread: conv.unread }"
            @click="openChat(conv)"
          >
            <template #prepend>
              <v-avatar size="48">
                <v-img :src="conv.avatar" alt="sender" />
              </v-avatar>
            </template>

            <v-list-item-title>
              <strong>{{ conv.sender }}</strong>
            </v-list-item-title>
            <v-list-item-subtitle>
              {{ conv.lastMessage }}
            </v-list-item-subtitle>

            <template #append>
              <div class="text-caption text-grey">{{ conv.time }}</div>
            </template>
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
