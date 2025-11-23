<script setup lang="ts">
import { ref, onMounted, onUnmounted, nextTick, computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { supabase } from '@/utils/supabase'

const router = useRouter()
const route = useRoute()

const userId = ref<string | null>(null)
const otherUserId = route.params.id as string
const conversationId = ref<string | null>(null)
const messages = ref<any[]>([])
const newMessage = ref('')
const otherUserProfile = ref<any>(null)
const shopInfo = ref<any>(null)
const loading = ref(true)
let subscription: any = null
let timeUpdateInterval: any = null

// Real-time time formatting
const formatMessageTime = (timestamp: string) => {
  const now = new Date()
  const messageTime = new Date(timestamp)
  const diffInMinutes = Math.floor((now.getTime() - messageTime.getTime()) / (1000 * 60))
  
  if (diffInMinutes < 1) return 'now'
  if (diffInMinutes < 60) return `${diffInMinutes}m`
  if (diffInMinutes < 1440) return `${Math.floor(diffInMinutes / 60)}h`
  return messageTime.toLocaleDateString()
}

// Update times every minute
const startTimeUpdates = () => {
  timeUpdateInterval = setInterval(() => {
    // This will trigger reactivity and update all timestamps
    messages.value = [...messages.value]
  }, 60000) // Update every minute
}

const scrollToBottom = async () => {
  await nextTick()
  const el = document.getElementById('chat-scroll')
  if (el) el.scrollTop = el.scrollHeight
}

// ✅ Fetch other user's profile and shop info
const fetchOtherUserInfo = async () => {
  try {
    // Get profile
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', otherUserId)
      .single()

    otherUserProfile.value = profile

    // Get shop info if they are a seller
    const { data: shop } = await supabase
      .from('shops')
      .select('*')
      .eq('owner_id', otherUserId)
      .maybeSingle()

    shopInfo.value = shop
  } catch (error) {
    console.error('Error fetching user info:', error)
  }
}

// ✅ Fetch or create a conversation
const getOrCreateConversation = async () => {
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return
  userId.value = auth.user.id
  console.log('🟦 Logged in userId:', userId.value)
  console.log('🟩 Chatting with userId:', otherUserId)

  // find existing conversation
  const { data: existing, error } = await supabase
    .from('conversations')
    .select('id')
    .or(`and(user1.eq.${userId.value},user2.eq.${otherUserId}),and(user1.eq.${otherUserId},user2.eq.${userId.value})`)
    .maybeSingle()

  if (error) console.error('Conversation fetch error:', error)

  if (existing) {
    conversationId.value = existing.id
  } else {
    const { data: created, error: createErr } = await supabase
      .from('conversations')
      .insert({ user1: userId.value, user2: otherUserId })
      .select('id')
      .single()
    if (createErr) console.error('Conversation create error:', createErr)
    conversationId.value = created?.id || null
  }
}

// ✅ Load messages with product info - FIXED QUERY
const loadMessages = async () => {
  if (!conversationId.value) return
  
  console.log('📨 Loading messages for conversation:', conversationId.value)
  
  try {
    // First, get basic messages
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', conversationId.value)
      .order('created_at', { ascending: true })
    
    if (error) {
      console.error('❌ Error loading messages:', error)
      return
    }

    if (!data) {
      console.log('📭 No messages found')
      messages.value = []
      return
    }

    console.log('📩 Raw messages loaded:', data)

    // Then, fetch product info for messages that have product_id
    const messagesWithProducts = await Promise.all(
      data.map(async (msg) => {
        if (!msg.product_id) {
          return { ...msg, product: null }
        }

        try {
          const { data: product, error: productError } = await supabase
            .from('products')
            .select(`
              id,
              prod_name,
              price,
              main_img_urls,
              shop_id
            `)
            .eq('id', msg.product_id)
            .single()

          if (productError) {
            console.error('❌ Error fetching product:', productError)
            return { ...msg, product: null }
          }

          // If product has shop_id, fetch shop info
          let shopInfo = null
          if (product?.shop_id) {
            const { data: shop } = await supabase
              .from('shops')
              .select('id, business_name')
              .eq('id', product.shop_id)
              .single()
            shopInfo = shop
          }

          return {
            ...msg,
            product: product ? { ...product, shop: shopInfo } : null
          }
        } catch (err) {
          console.error('❌ Error processing product for message:', err)
          return { ...msg, product: null }
        }
      })
    )

    messages.value = messagesWithProducts
    console.log('✅ Final messages with products:', messages.value)
    scrollToBottom()
    
  } catch (err) {
    console.error('❌ Unexpected error in loadMessages:', err)
  }
}

// ✅ Subscribe to realtime messages
const subscribeMessages = async () => {
  if (!conversationId.value) return

  subscription = supabase
    .channel(`chat-${conversationId.value}`)
    .on(
      'postgres_changes',
      { 
        event: 'INSERT', 
        schema: 'public', 
        table: 'messages', 
        filter: `conversation_id=eq.${conversationId.value}` 
      },
      async (payload) => {
        console.log('🔔 New message received:', payload.new)
        
        // Fetch product info for new message if it has a product_id
        let productInfo = null
        if (payload.new.product_id) {
          try {
            const { data: product } = await supabase
              .from('products')
              .select(`
                id,
                prod_name,
                price,
                main_img_urls,
                shop_id
              `)
              .eq('id', payload.new.product_id)
              .single()

            // Fetch shop info if product exists
            if (product?.shop_id) {
              const { data: shop } = await supabase
                .from('shops')
                .select('id, business_name')
                .eq('id', product.shop_id)
                .single()
              productInfo = { ...product, shop }
            } else {
              productInfo = product
            }
          } catch (error) {
            console.error('❌ Error fetching product for new message:', error)
          }
        }

        const newMessageWithProduct = {
          ...payload.new,
          product: productInfo
        }

        messages.value.push(newMessageWithProduct)
        scrollToBottom()
        
        // Mark as read if it's for current user
        if (payload.new.receiver_id === userId.value) {
          await markMessageAsRead(payload.new.id)
        }
      }
    )
    .subscribe((status) => {
      console.log('📡 Subscription status:', status)
    })
}

// ✅ Mark single message as read
const markMessageAsRead = async (messageId: string) => {
  try {
    const { error } = await supabase
      .from('messages')
      .update({ is_read: true })
      .eq('id', messageId)

    if (error) {
      console.error('❌ Mark as read error:', error)
    }
  } catch (err) {
    console.error('❌ Error marking message as read:', err)
  }
}

// ✅ Send a regular text message
const sendMessage = async () => {
  if (!newMessage.value.trim() || !conversationId.value || !userId.value) return

  const msg = {
    conversation_id: conversationId.value,
    sender_id: userId.value,
    receiver_id: otherUserId,
    content: newMessage.value,
    is_read: false,
    product_id: null
  }

  try {
    const { data, error } = await supabase
      .from('messages')
      .insert([msg])
      .select('*')
      .single()

    if (error) {
      console.error('❌ Send message error:', error)
    } else {
      console.log('✅ Message sent:', data)
      messages.value.push(data)
      scrollToBottom()
    }
  } catch (err) {
    console.error('❌ Unexpected error sending message:', err)
  }

  newMessage.value = ''
}

// ✅ Send a product message
const sendProductMessage = async (product: any) => {
  if (!conversationId.value || !userId.value) return

  const msg = {
    conversation_id: conversationId.value,
    sender_id: userId.value,
    receiver_id: otherUserId,
    content: `Check out this product: ${product.prod_name}`,
    is_read: false,
    product_id: product.id
  }

  try {
    const { data, error } = await supabase
      .from('messages')
      .insert([msg])
      .select('*')
      .single()

    if (error) {
      console.error('❌ Send product message error:', error)
    } else {
      // Fetch product info for the new message
      let productInfo = null
      if (product.id) {
        const { data: productData } = await supabase
          .from('products')
          .select(`
            id,
            prod_name,
            price,
            main_img_urls,
            shop_id
          `)
          .eq('id', product.id)
          .single()

        if (productData?.shop_id) {
          const { data: shop } = await supabase
            .from('shops')
            .select('id, business_name')
            .eq('id', productData.shop_id)
            .single()
          productInfo = { ...productData, shop }
        } else {
          productInfo = productData
        }
      }

      const messageWithProduct = {
        ...data,
        product: productInfo
      }

      messages.value.push(messageWithProduct)
      scrollToBottom()
    }
  } catch (err) {
    console.error('❌ Unexpected error sending product message:', err)
  }
}

// ✅ View product details
const viewProduct = (productId: string) => {
  router.push(`/product/${productId}`)
}

// ✅ Get product image
const getProductImage = (product: any) => {
  if (!product?.main_img_urls) return '/placeholder.png'
  
  try {
    if (typeof product.main_img_urls === 'string') {
      const parsed = JSON.parse(product.main_img_urls)
      return Array.isArray(parsed) ? parsed[0] : parsed
    }
    if (Array.isArray(product.main_img_urls)) {
      return product.main_img_urls[0]
    }
    return '/placeholder.png'
  } catch {
    return '/placeholder.png'
  }
}

// ✅ Get user display name
const userDisplayName = computed(() => {
  if (shopInfo.value?.business_name) {
    return shopInfo.value.business_name
  }
  if (otherUserProfile.value?.first_name) {
    return `${otherUserProfile.value.first_name} ${otherUserProfile.value.last_name || ''}`.trim()
  }
  return 'User'
})

// ✅ Get user avatar
const userAvatar = computed(() => {
  if (shopInfo.value?.logo_url) {
    return shopInfo.value.logo_url
  }
  if (otherUserProfile.value?.avatar_url) {
    return otherUserProfile.value.avatar_url
  }
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(userDisplayName.value)}&background=random`
})

const goBack = () => router.back()

onMounted(async () => {
  console.log('🚀 ChatView mounted')
  loading.value = true
  
  try {
    await fetchOtherUserInfo()
    console.log('✅ User info fetched')
    
    await getOrCreateConversation()
    console.log('✅ Conversation ready:', conversationId.value)
    
    await loadMessages()
    console.log('✅ Messages loaded')

    // Only subscribe once conversationId is confirmed
    if (conversationId.value) {
      await subscribeMessages()
      console.log('✅ Real-time subscription started')
    }

    startTimeUpdates()
    console.log('✅ Time updates started')
    
  } catch (err) {
    console.error('❌ Error during initialization:', err)
  } finally {
    loading.value = false
    console.log('✅ ChatView initialization complete')
  }
})

onUnmounted(() => {
  console.log('🧹 Cleaning up chat subscriptions')
  if (subscription) {
    supabase.removeChannel(subscription)
  }
  if (timeUpdateInterval) {
    clearInterval(timeUpdateInterval)
  }
})
</script>

<template>
  <v-app>
    <v-app-bar flat color="primary" dark>
      <v-btn icon @click="goBack">
        <v-icon>mdi-arrow-left</v-icon>
      </v-btn>
      
      <v-avatar size="32" class="mr-3">
        <v-img :src="userAvatar" :alt="userDisplayName" />
      </v-avatar>
      
      <v-toolbar-title>{{ userDisplayName }}</v-toolbar-title>
      
      <v-spacer />
    </v-app-bar>

    <v-main>
      <div id="chat-scroll" class="chat-container">
        <div v-if="loading" class="loading-state">
          <v-progress-circular indeterminate color="primary" />
          <p>Loading messages...</p>
        </div>

        <div v-else-if="messages.length === 0" class="empty-state">
          <v-icon size="64" color="grey-lighten-1">mdi-chat-outline</v-icon>
          <p class="text-caption mt-2">No messages yet. Start the conversation!</p>
        </div>

        <div v-else>
          <div
            v-for="msg in messages"
            :key="msg.id"
            :class="['message-row', msg.sender_id === userId ? 'me' : 'other']"
          >
            <!-- Product Message -->
            <div v-if="msg.product_id && msg.product" class="product-message">
              <div class="product-card" @click="viewProduct(msg.product.id)">
                <v-img
                  :src="getProductImage(msg.product)"
                  :alt="msg.product.prod_name"
                  class="product-image"
                  cover
                />
                <div class="product-info">
                  <div class="product-name">{{ msg.product.prod_name }}</div>
                  <div class="product-price">₱{{ msg.product.price?.toFixed(2) }}</div>
                  <div class="product-shop" v-if="msg.product.shop">
                    {{ msg.product.shop.business_name }}
                  </div>
                </div>
                <v-icon class="view-icon">mdi-open-in-new</v-icon>
              </div>
              <div class="message-content" v-if="msg.content && msg.content !== `Check out this product: ${msg.product.prod_name}`">
                {{ msg.content }}
              </div>
              <span class="time">{{ formatMessageTime(msg.created_at) }}</span>
            </div>

            <!-- Regular Text Message -->
            <div v-else class="bubble">
              <div class="message-text">{{ msg.content }}</div>
              <span class="time">{{ formatMessageTime(msg.created_at) }}</span>
            </div>
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
        :disabled="loading"
      />
      <v-btn 
        icon 
        color="primary" 
        @click="sendMessage"
        :disabled="!newMessage.trim() || loading"
      >
        <v-icon>mdi-send</v-icon>
      </v-btn>
    </v-footer>
  </v-app>
</template>

<!-- Keep your existing styles the same -->
<style scoped>
.chat-container {
  display: flex;
  flex-direction: column;
  padding: 16px;
  gap: 16px;
  height: calc(100vh - 120px);
  overflow-y: auto;
  background: #f9fafb;
}

.loading-state, .empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px;
  color: #666;
  text-align: center;
}

.message-row {
  display: flex;
  margin-bottom: 8px;
}

.message-row.me {
  justify-content: flex-end;
}

.message-row.other {
  justify-content: flex-start;
}

/* Regular Message Bubble */
.bubble {
  max-width: 70%;
  padding: 12px 16px;
  border-radius: 18px;
  position: relative;
  background-color: #ffffff;
  border: 1px solid #e5e7eb;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
}

.message-row.me .bubble {
  background-color: #007aff;
  color: white;
  border: none;
}

.message-text {
  word-wrap: break-word;
  line-height: 1.4;
}

/* Product Message */
.product-message {
  max-width: 300px;
  background: white;
  border-radius: 12px;
  border: 1px solid #e5e7eb;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  overflow: hidden;
}

.message-row.me .product-message {
  background: #007aff;
  color: white;
  border: none;
}

.product-card {
  display: flex;
  align-items: center;
  padding: 12px;
  cursor: pointer;
  transition: background-color 0.2s;
  gap: 12px;
}

.product-card:hover {
  background-color: rgba(0, 0, 0, 0.02);
}

.message-row.me .product-card:hover {
  background-color: rgba(255, 255, 255, 0.1);
}

.product-image {
  width: 60px;
  height: 60px;
  border-radius: 8px;
  flex-shrink: 0;
}

.product-info {
  flex: 1;
  min-width: 0;
}

.product-name {
  font-weight: 600;
  font-size: 0.9rem;
  margin-bottom: 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.product-price {
  font-weight: 700;
  color: #007aff;
  font-size: 0.85rem;
  margin-bottom: 2px;
}

.message-row.me .product-price {
  color: rgba(255, 255, 255, 0.9);
}

.product-shop {
  font-size: 0.75rem;
  color: #666;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.message-row.me .product-shop {
  color: rgba(255, 255, 255, 0.7);
}

.view-icon {
  color: #666;
  opacity: 0.7;
}

.message-row.me .view-icon {
  color: rgba(255, 255, 255, 0.7);
}

.message-content {
  padding: 8px 12px 4px;
  border-top: 1px solid #f0f0f0;
  font-size: 0.9rem;
  line-height: 1.4;
}

.message-row.me .message-content {
  border-top: 1px solid rgba(255, 255, 255, 0.2);
}

/* Time Styling */
.time {
  display: block;
  font-size: 0.7rem;
  opacity: 0.6;
  margin-top: 4px;
  text-align: right;
}

.message-row.other .time {
  text-align: left;
}

/* Responsive Design */
@media (max-width: 600px) {
  .chat-container {
    padding: 12px;
    gap: 12px;
  }
  
  .bubble {
    max-width: 85%;
    padding: 10px 14px;
  }
  
  .product-message {
    max-width: 280px;
  }
  
  .product-card {
    padding: 10px;
    gap: 10px;
  }
  
  .product-image {
    width: 50px;
    height: 50px;
  }
  
  .product-name {
    font-size: 0.85rem;
  }
}

/* Scrollbar Styling */
.chat-container::-webkit-scrollbar {
  width: 6px;
}

.chat-container::-webkit-scrollbar-track {
  background: #f1f1f1;
}

.chat-container::-webkit-scrollbar-thumb {
  background: #c1c1c1;
  border-radius: 3px;
}

.chat-container::-webkit-scrollbar-thumb:hover {
  background: #a8a8a8;
}
</style>