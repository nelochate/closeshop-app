<script setup lang="ts">
import { ref, onMounted, onUnmounted, nextTick } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { supabase } from '@/utils/supabase'

const router = useRouter()
const route = useRoute()

const userId = ref<string | null>(null)
const otherUserId = route.params.id as string
const conversationId = ref<string | null>(null)
const messages = ref<any[]>([])
const newMessage = ref('')
let subscription: any = null

const scrollToBottom = async () => {
  await nextTick()
  const el = document.getElementById('chat-scroll')
  if (el) el.scrollTop = el.scrollHeight
}

// ✅ Fetch or create a conversation safely
const getOrCreateConversation = async () => {
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return
  userId.value = auth.user.id

  try {
    // 🔍 Find existing conversation between two users
    const { data: existing, error: fetchErr } = await supabase
      .from('conversations')
      .select('id')
      .or(`and(user1.eq.${userId.value},user2.eq.${otherUserId}),and(user1.eq.${otherUserId},user2.eq.${userId.value})`)
      .maybeSingle()

    if (fetchErr) console.error('Conversation fetch error:', fetchErr)

    if (existing) {
      conversationId.value = existing.id
      return
    }

    // ✅ Check if both users exist in profiles
    const { data: user1Profile } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', userId.value)
      .maybeSingle()

    const { data: user2Profile } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', otherUserId)
      .maybeSingle()

    // 🧩 If the shop owner or current user has no profile, stop gracefully
    if (!user1Profile || !user2Profile) {
      console.warn('Cannot create conversation — missing profile record for one of the users.')
      return
    }

    // 🆕 Create conversation
    const { data: created, error: createErr } = await supabase
      .from('conversations')
      .insert({ user1: userId.value, user2: otherUserId })
      .select('id')
      .single()

    if (createErr) {
      console.error('Conversation create error:', createErr)
      return
    }

    conversationId.value = created?.id || null
  } catch (err: any) {
    console.error('Error in getOrCreateConversation:', err.message)
  }
}

// ✅ Load messages
const loadMessages = async () => {
  if (!conversationId.value) return
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('conversation_id', conversationId.value)
    .order('created_at', { ascending: true })
  if (!error && data) {
    messages.value = data
    scrollToBottom()
  }
}

// ✅ Subscribe to realtime messages
const subscribeMessages = async () => {
  if (!conversationId.value) return

  subscription = supabase
    .channel(`chat-${conversationId.value}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId.value}` },
      (payload) => {
        messages.value.push(payload.new)
        scrollToBottom()
      }
    )
    .subscribe()
}

// ✅ Send message
const sendMessage = async () => {
  if (!newMessage.value.trim() || !conversationId.value || !userId.value) return

  const msg = {
    conversation_id: conversationId.value,
    sender_id: userId.value,
    receiver_id: otherUserId,
    content: newMessage.value,
    is_read: false,
  }

  const { data, error } = await supabase.from('messages').insert([msg]).select('*').single()

  if (error) {
    console.error('Send message error:', error)
  } else {
    messages.value.push(data)
    scrollToBottom()
  }

  newMessage.value = ''
}

const goBack = () => router.back()

onMounted(async () => {
  await getOrCreateConversation()
  await loadMessages()
  if (conversationId.value) await subscribeMessages()
})

onUnmounted(() => {
  if (subscription) supabase.removeChannel(subscription)
})
</script>

<template>
  <v-app>
    <v-app-bar flat color="primary" dark>
      <v-btn icon @click="goBack"><v-icon>mdi-arrow-left</v-icon></v-btn>
      <v-toolbar-title>Chat</v-toolbar-title>
    </v-app-bar>

    <v-main>
      <div id="chat-scroll" class="chat-container">
        <div
          v-for="msg in messages"
          :key="msg.id"
          :class="['message-row', msg.sender_id === userId ? 'me' : 'other']"
        >
          <div class="bubble">
            {{ msg.content }}
            <span class="time">{{ new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }}</span>
          </div>
        </div>
      </div>
    </v-main>

    <v-footer app class="pa-2" color="white">
      <v-text-field
        v-model="newMessage"
        variant="outlined"
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
  height: calc(100vh - 120px);
  overflow-y: auto;
  background: #f9fafb;
}
.message-row {
  display: flex;
  margin-bottom: 8px;
}
.message-row.me {
  justify-content: flex-end;
}
.bubble {
  max-width: 70%;
  padding: 10px 14px;
  border-radius: 18px;
  position: relative;
  background-color: #e5f1ff;
}
.message-row.me .bubble {
  background-color: #007aff;
  color: white;
}
.time {
  display: block;
  font-size: 0.7rem;
  opacity: 0.6;
  margin-top: 4px;
}
</style>
