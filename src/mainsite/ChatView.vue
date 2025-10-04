<script setup lang="ts">
import { ref, onMounted, onUnmounted, nextTick, computed } from "vue"
import { useRouter, useRoute } from "vue-router"
import { supabase } from "@/utils/supabase"
import { db } from "@/utils/firebase"
import {
  collection,
  addDoc,
  query,
  orderBy,
  onSnapshot,
  serverTimestamp,
} from "firebase/firestore"

const router = useRouter()
const route = useRoute()

// current user + the other user (from /chatview/:id)
const userId = ref<string | null>(null)
const otherUserId = route.params.id as string

// UI state
const messages = ref<any[]>([])
const newMessage = ref("")

// ids
const chatId = ref("") // Firestore chat doc id (sorted pair)
const conversationId = ref<string | null>(null) // Supabase conversation row id

let stopMessages: null | (() => void) = null

// helpers
const isMe = (m: any) => m.senderId === userId.value

const myInitial = computed(() =>
  userId.value ? userId.value.slice(0, 2).toUpperCase() : "ME"
)
const otherInitial = computed(() =>
  otherUserId ? otherUserId.slice(0, 2).toUpperCase() : "OT"
)

const formatTime = (createdAt: any) => {
  if (createdAt?.toDate) {
    return createdAt.toDate().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  }
  if (createdAt) {
    return new Date(createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  }
  return ""
}

const scrollToBottom = async () => {
  await nextTick()
  const el = document.getElementById("chat-scroll")
  if (el) el.scrollTop = el.scrollHeight
}

onMounted(async () => {
  // ✅ 1. Ensure user is authenticated
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) {
    console.error("❌ User not authenticated — can't open chat.")
    return
  }
  userId.value = auth.user.id

  // ✅ 2. Create stable chat id
  chatId.value = [userId.value, otherUserId].sort().join("_")

  // ✅ 3. Find or create conversation in Supabase
  const { data: conv, error: convError } = await supabase
    .from("conversations")
    .select("id")
    .or(
      `and(user1.eq.${userId.value},user2.eq.${otherUserId}),and(user1.eq.${otherUserId},user2.eq.${userId.value})`
    )
    .maybeSingle()

  if (convError) console.error("Supabase conversation error:", convError)

  if (conv) {
    conversationId.value = conv.id
  } else {
    const { data: newConv, error: insertErr } = await supabase
      .from("conversations")
      .insert({ user1: userId.value, user2: otherUserId })
      .select("id")
      .single()

    if (insertErr) console.error("Error creating conversation:", insertErr)
    conversationId.value = newConv?.id || null
  }

  console.log("💬 Conversation ID after setup:", conversationId.value)

  // ✅ 4. Firestore realtime messages
  const q = query(
    collection(db, "chats", chatId.value, "messages"),
    orderBy("createdAt", "asc")
  )

  stopMessages = onSnapshot(q, (snap) => {
    messages.value = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
    scrollToBottom()
  })
})

onUnmounted(() => {
  if (stopMessages) stopMessages()
})

// ✅ 5. Send message
const sendMessage = async () => {
  if (!newMessage.value.trim() || !userId.value || !conversationId.value) return

  const msgData = {
    senderId: userId.value!,
    receiverId: otherUserId,
    text: newMessage.value,
    createdAt: serverTimestamp(),
    isRead: false,
  }

  console.log("💬 Sending message:", msgData)
  console.log("Conversation ID:", conversationId.value)

  // ✅ Fix: use "public.messages" explicitly
  const { error: sErr } = await supabase.from("messages").insert([
    {
      conversation_id: conversationId.value,
      sender_id: msgData.senderId,
      receiver_id: msgData.receiverId,
      content: msgData.text,
      is_read: msgData.isRead,
    },
  ])

  if (sErr) console.error("🚨 Supabase insert error:", sErr)

  // ✅ Firestore realtime for UI
  await addDoc(collection(db, "chats", chatId.value, "messages"), msgData)

  newMessage.value = ""
  scrollToBottom()
}

const goBack = () => router.back()
</script>

<template>
  <v-app>
    <v-app-bar flat color="primary" dark>
      <v-btn icon @click="goBack"><v-icon>mdi-arrow-left</v-icon></v-btn>
      <v-toolbar-title class="text-h6">Chat</v-toolbar-title>
    </v-app-bar>

    <v-main>
      <div class="chat-container" ref="chatContainer" id="chat-scroll">
        <div
          v-for="(msg, index) in messages"
          :key="msg.id || index"
          :class="['row', msg.senderId === userId ? 'me' : 'other']"
        >
          <!-- Avatar for the other user -->
          <img
            v-if="msg.senderId !== userId"
            src="https://placehold.co/32x32"
            alt="avatar"
            class="avatar"
          />

          <div :class="['message-bubble', msg.senderId === userId ? 'me' : 'other']">
            <p class="text">{{ msg.text }}</p>
            <span class="time">{{ formatTime(msg.createdAt) }}</span>
          </div>
        </div>
      </div>
    </v-main>

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
  background: linear-gradient(to bottom right, #f0f4ff, #ffffff);
  height: calc(100vh - 120px);
  overflow-y: auto;
}

.row {
  display: flex;
  width: 100%;
  align-items: flex-end;
}

.row.me {
  justify-content: flex-end;
}

.row.other {
  justify-content: flex-start;
}

.message-bubble {
  padding: 10px 14px;
  border-radius: 18px;
  max-width: 75%;
  line-height: 1.4;
  font-size: 15px;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.08);
  position: relative;
}

.message-bubble.me {
  background-color: #007aff;
  color: white;
  border-bottom-right-radius: 6px;
}

.message-bubble.other {
  background-color: #ffffff;
  color: #000;
  border-bottom-left-radius: 6px;
}

.avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  margin-right: 8px;
  object-fit: cover;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.time {
  font-size: 0.7rem;
  opacity: 0.6;
  margin-top: 4px;
  text-align: right;
}
</style>
