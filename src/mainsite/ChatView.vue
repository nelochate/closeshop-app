<script setup lang="ts">
import { ref, onMounted } from "vue"
import { useRouter, useRoute } from "vue-router"
import { supabase } from "@/utils/supabase"
import { db, auth } from "@/utils/firebase"
import { collection, addDoc, query, orderBy, onSnapshot } from "firebase/firestore"

const router = useRouter()
const route = useRoute()

// Current logged-in user (Supabase auth for now)
const userId = ref<string | null>(null)
const otherUserId = route.params.id as string

const messages = ref<any[]>([])
const newMessage = ref("")

// Firestore chatId (combine both IDs sorted)
const chatId = ref("")
const currentUser = auth.currentUser

onMounted(async () => {
  // Get current Supabase user
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return
  userId.value = user.id
  chatId.value = [user.id, otherUserId].sort().join("_")

  // Subscribe to Firestore messages in this chat
  const q = query(
    collection(db, "chats", chatId.value, "messages"),
    orderBy("createdAt", "asc")
  )
  onSnapshot(q, (snapshot) => {
    messages.value = snapshot.docs.map((doc) => doc.data())
  })
})

const sendMessage = async () => {
  if (!newMessage.value.trim() || !userId.value) return

  const msgData = {
    senderId: userId.value,
    receiverId: otherUserId,
    text: newMessage.value,
    createdAt: new Date(),
    isRead: false,
  }

  // 1️⃣ Save to Supabase
  await supabase.from("messages").insert({
    sender_id: msgData.senderId,
    receiver_id: msgData.receiverId,
    content: msgData.text,
    is_read: msgData.isRead,
  })

  // 2️⃣ Save to Firestore
  await addDoc(collection(db, "chats", chatId.value, "messages"), msgData)

  newMessage.value = ""
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
      <div class="chat-container">
        <div
          v-for="(msg, index) in messages"
          :key="index"
          :class="['message-bubble', msg.senderId === userId ? 'me' : 'other']"
        >
          <p class="text">{{ msg.text }}</p>
          <span class="time">{{ new Date(msg.createdAt.seconds ? msg.createdAt.seconds * 1000 : msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }}</span>
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
