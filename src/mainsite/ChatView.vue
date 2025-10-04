<script setup lang="ts">
import { ref, onMounted } from "vue"
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

// Current logged-in user (Supabase)
const userId = ref<string | null>(null)
// From route params: /chatview/:id
const otherUserId = route.params.id as string
console.log("Opening chat with:", otherUserId)

const messages = ref<any[]>([])
const newMessage = ref("")

// Firestore chatId (combine both IDs sorted)
const chatId = ref("")
// Conversation row id in Supabase
const conversationId = ref<string | null>(null)

onMounted(async () => {
  // Get current Supabase user
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return

  userId.value = user.id
  chatId.value = [user.id, otherUserId].sort().join("_")

  // ✅ Find or create a conversation in Supabase
  const { data: conv, error } = await supabase
    .from("conversations")
    .select("id")
  .or(`and(user1.eq.${userId.value},user2.eq.${otherUserId}),and(user1.eq.${otherUserId},user2.eq.${userId.value})`)

    .maybeSingle()

  if (error) console.error("Supabase error:", error)

  if (conv) {
    conversationId.value = conv.id
  } else {
    const { data: newConv, error: insertError } = await supabase
      .from("conversations")
      .insert({ user1: user.id, user2: otherUserId })
      .select("id")
      .single()

    if (insertError) console.error("Error creating conversation:", insertError)
    conversationId.value = newConv?.id || null
  }

  // ✅ Fetch Supabase chat history
  if (conversationId.value) {
    const { data: msgs, error: msgError } = await supabase
      .from("messages")
      .select("*")
      .eq("conversation_id", conversationId.value)
      .order("created_at", { ascending: true })

    if (msgError) {
      console.error("Error fetching messages:", msgError)
    } else if (msgs) {
      messages.value = msgs.map((m) => ({
        id: m.id,
        senderId: m.sender_id,
        receiverId: m.receiver_id,
        text: m.content,
        createdAt: m.created_at ? new Date(m.created_at) : null,
        isRead: m.is_read,
      }))
    }
  }

  // ✅ Subscribe to Firestore messages in this chat
  if (chatId.value && chatId.value.trim() !== "") {
    const q = query(
      collection(db, "chats", chatId.value, "messages"),
      orderBy("createdAt", "asc")
    )
    onSnapshot(q, (snapshot) => {
      const liveMsgs = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }))
      // merge history + realtime (no duplicates if using Firestore only for new)
     messages.value = liveMsgs

    })
  } else {
    console.warn("chatId not ready, skipping Firestore listener")
  }
})

// ✅ Send message

const sendMessage = async () => {
  if (!newMessage.value.trim() || !userId.value || !conversationId.value) return

  const msgData = {
    senderId: userId.value,
    receiverId: otherUserId,
    text: newMessage.value,
    createdAt: serverTimestamp(),
    isRead: false,
  }

  // 1️⃣ Save to Supabase
  const { error: insertError } = await supabase.from("messages").insert({
    conversation_id: conversationId.value,
    sender_id: msgData.senderId,
    receiver_id: msgData.receiverId,
    content: msgData.text,
    is_read: msgData.isRead,
  })

  if (insertError) {
    console.error("Supabase message insert error:", insertError)
  }

  // 2️⃣ Save to Firestore (for realtime UI)
  await addDoc(collection(db, "chats", chatId.value, "messages"), msgData)

  newMessage.value = ""
}


const goBack = () => router.back()
</script>

<template>
  <v-app>
    <!-- Top Bar -->
    <v-app-bar flat color="primary" dark>
      <v-btn icon @click="goBack"><v-icon>mdi-arrow-left</v-icon></v-btn>
      <v-toolbar-title class="text-h6">Chat</v-toolbar-title>
    </v-app-bar>

    <!-- Messages -->
    <v-main>
      <div class="chat-container">
        <div
          v-for="(msg, index) in messages"
          :key="msg.id || index"
          :class="['message-bubble', msg.senderId === userId?.value ? 'me' : 'other']"
        >
          <p class="text">{{ msg.text }}</p>
          <span class="time">
            {{
              msg.createdAt?.toDate
                ? msg.createdAt.toDate().toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })
                : (msg.createdAt ? new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '')
            }}
          </span>
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
