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

const fetchConversations = async () => {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return

  const { data, error } = await supabase
    .from('conversations')
    .select(`
      id,
      user1,
      user2,
      user1_profile:profiles!conversations_user1_fkey (
        first_name,
        last_name,
        avatar_url
      ),
      user2_profile:profiles!conversations_user2_fkey (
        first_name,
        last_name,
        avatar_url
      ),
      messages:messages_conversation_id_fkey (
        id,
        content,
        created_at,
        sender_id,
        receiver_id,
        is_read
      )
    `)
    .or(`user1.eq.${user.id},user2.eq.${user.id}`)
    .order('updated_at', { ascending: false })

  if (error) {
    console.error('❌ Error fetching conversations:', error.message)
    return
  }

  // ✅ Only this block should remain here — no await outside
  conversations.value = await Promise.all(
    (data || []).map(async (conv) => {
      const lastMsg = conv.messages?.[conv.messages.length - 1]
      const isUser1 = conv.user1 === user.id
      const otherUserId = isUser1 ? conv.user2 : conv.user1
      const otherProfile = isUser1 ? conv.user2_profile : conv.user1_profile

      // Fetch shop owned by this user (if any)
      const { data: shop } = await supabase
        .from('shops')
        .select('business_name, logo_url')
        .eq('owner_id', otherUserId)
        .maybeSingle()

      return {
        id: conv.id,
        otherUserId,
        otherUserName:
          shop?.business_name ||
          `${otherProfile?.first_name || ''} ${otherProfile?.last_name || ''}`.trim() ||
          'User',
        avatar:
          shop?.logo_url ||
          otherProfile?.avatar_url ||
          `https://ui-avatars.com/api/?name=${encodeURIComponent(
            shop?.business_name || otherProfile?.first_name || 'User',
          )}`,
        sender: lastMsg?.sender_id === user.id ? 'You' : otherProfile?.first_name || 'User',
        lastMessage: lastMsg?.content || '(No messages yet)',
        time: lastMsg?.created_at
          ? new Date(lastMsg.created_at).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            })
          : '',
        unread: lastMsg ? !lastMsg.is_read && lastMsg.receiver_id === user.id : false,
      }
    }),
  )
}

// ✅ Remove this duplicate block entirely (it breaks the setup)
// conversations.value = await Promise.all(...)

const subscribeMessages = async () => {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return

  supabase
    .channel('realtime-messages')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
      const newMsg = payload.new
      if (newMsg.sender_id === user.id || newMsg.receiver_id === user.id) {
        fetchConversations() // Refresh when relevant
      }
    })
    .subscribe()
}

const openChat = (conv: any) => {
  router.push({ name: 'chatview', params: { id: conv.otherUserId } })
}

onMounted(() => {
  fetchConversations()
  subscribeMessages()
  setInterval(fetchConversations, 15000)
})
</script>

<template>
  <v-app>
    <!-- Top App Bar -->
    <v-app-bar flat elevation="0" class="top-nav" color="#3f83c7">
      <v-btn variant="text" @click="goBack">
        <v-icon start>mdi-arrow-left</v-icon>
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
              <strong>{{ conv.otherUserName }}</strong>
            </v-list-item-title>
            <v-list-item-subtitle>
              <span v-if="conv.sender === 'You'">You: </span>{{ conv.lastMessage }}
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
