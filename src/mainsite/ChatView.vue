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
    messages.value = [...messages.value]
  }, 60000)
}

const scrollToBottom = async () => {
  await nextTick()
  const el = document.getElementById('chat-scroll')
  if (el) el.scrollTop = el.scrollHeight
}

// ✅ Fetch other user's profile and shop info
const fetchOtherUserInfo = async () => {
  try {
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', otherUserId)
      .single()
    otherUserProfile.value = profile

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

  const { data: existing, error } = await supabase
    .from('conversations')
    .select('id')
    .or(
      `and(user1.eq.${userId.value},user2.eq.${otherUserId}),and(user1.eq.${otherUserId},user2.eq.${userId.value})`,
    )
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

// ✅ Extract product name from order message
const extractProductNameFromOrder = (content: string): string | null => {
  // Match patterns like "Burger 1 (x2)" or "Product Name (x1)"
  const match = content.match(/(.+?)\s*\(\s*x\d+\s*\)/)
  return match ? match[1].trim() : null
}

// ✅ Find product by name
const findProductByName = async (productName: string): Promise<any> => {
  try {
    const { data: product, error } = await supabase
      .from('products')
      .select(`
        id,
        prod_name,
        price,
        main_img_urls,
        shop_id,
        description
      `)
      .ilike('prod_name', `%${productName}%`)
      .single()

    if (error || !product) return null

    // Fetch shop info if product exists
    if (product?.shop_id) {
      const { data: shop } = await supabase
        .from('shops')
        .select('id, business_name, logo_url')
        .eq('id', product.shop_id)
        .single()
      return { ...product, shop }
    }

    return product
  } catch (error) {
    console.error('Error finding product:', error)
    return null
  }
}

// ✅ Load messages with enhanced order notifications
const loadMessages = async () => {
  if (!conversationId.value) return

  try {
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
      messages.value = []
      return
    }

    // Enhanced message processing with order product detection
    const enhancedMessages = await Promise.all(
      data.map(async (msg) => {
        // For product share messages
        if (msg.product_id) {
          try {
            const { data: product, error: productError } = await supabase
              .from('products')
              .select(`
                id,
                prod_name,
                price,
                main_img_urls,
                shop_id,
                description
              `)
              .eq('id', msg.product_id)
              .single()

            if (productError) return { ...msg, product: null }

            let shopInfo = null
            if (product?.shop_id) {
              const { data: shop } = await supabase
                .from('shops')
                .select('id, business_name, logo_url')
                .eq('id', product.shop_id)
                .single()
              shopInfo = shop
            }

            return {
              ...msg,
              product: product ? { ...product, shop: shopInfo } : null,
            }
          } catch (err) {
            return { ...msg, product: null }
          }
        }

        // For order notification messages - find the product
        if (isOrderNotification(msg.content)) {
          const productName = extractProductNameFromOrder(msg.content)
          if (productName) {
            const product = await findProductByName(productName)
            return {
              ...msg,
              orderProduct: product, // Add the found product to order messages
            }
          }
        }

        return { ...msg, orderProduct: null }
      }),
    )

    messages.value = enhancedMessages
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
        filter: `conversation_id=eq.${conversationId.value}`,
      },
      async (payload) => {
        let newMessageWithData = { ...payload.new }

        // For product share messages
        if (payload.new.product_id) {
          try {
            const { data: product } = await supabase
              .from('products')
              .select(`
                id,
                prod_name,
                price,
                main_img_urls,
                shop_id,
                description
              `)
              .eq('id', payload.new.product_id)
              .single()

            if (product?.shop_id) {
              const { data: shop } = await supabase
                .from('shops')
                .select('id, business_name, logo_url')
                .eq('id', product.shop_id)
                .single()
              newMessageWithData.product = { ...product, shop }
            } else {
              newMessageWithData.product = product
            }
          } catch (error) {
            console.error('❌ Error fetching product for new message:', error)
          }
        }

        // For order notification messages
        if (isOrderNotification(payload.new.content)) {
          const productName = extractProductNameFromOrder(payload.new.content)
          if (productName) {
            const product = await findProductByName(productName)
            newMessageWithData.orderProduct = product
          }
        }

        messages.value.push(newMessageWithData)
        scrollToBottom()

        if (payload.new.receiver_id === userId.value) {
          await markMessageAsRead(payload.new.id)
        }
      },
    )
    .subscribe()
}

// ✅ Mark single message as read
const markMessageAsRead = async (messageId: string) => {
  try {
    await supabase.from('messages').update({ is_read: true }).eq('id', messageId)
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
    product_id: null,
  }

  try {
    const { data, error } = await supabase.from('messages').insert([msg]).select('*').single()
    if (!error) {
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
    product_id: product.id,
  }

  try {
    const { data, error } = await supabase.from('messages').insert([msg]).select('*').single()
    if (!error) {
      messages.value.push({ ...data, product })
      scrollToBottom()
    }
  } catch (err) {
    console.error('❌ Unexpected error sending product message:', err)
  }
}

// ✅ View product details - CORRECTED to use your route
const viewProduct = (productId: string) => {
  router.push(`/viewproduct/${productId}`)
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

// ✅ Check if message is an order notification
const isOrderNotification = (content: string) => {
  return content.includes('New Order Received!') || content.includes('Transaction #:')
}

// ✅ Get user display name
const userDisplayName = computed(() => {
  if (shopInfo.value?.business_name) return shopInfo.value.business_name
  if (otherUserProfile.value?.first_name) {
    return `${otherUserProfile.value.first_name} ${otherUserProfile.value.last_name || ''}`.trim()
  }
  return 'User'
})

// ✅ Get user avatar
const userAvatar = computed(() => {
  if (shopInfo.value?.logo_url) return shopInfo.value.logo_url
  if (otherUserProfile.value?.avatar_url) return otherUserProfile.value.avatar_url
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(userDisplayName.value)}&background=random`
})

const goBack = () => router.back()

onMounted(async () => {
  loading.value = true
  try {
    await fetchOtherUserInfo()
    await getOrCreateConversation()
    await loadMessages()
    if (conversationId.value) await subscribeMessages()
    startTimeUpdates()
  } catch (err) {
    console.error('❌ Error during initialization:', err)
  } finally {
    loading.value = false
  }
})

onUnmounted(() => {
  if (subscription) supabase.removeChannel(subscription)
  if (timeUpdateInterval) clearInterval(timeUpdateInterval)
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
            <!-- Order Notification Message with View Product Button -->
            <div v-if="isOrderNotification(msg.content)" class="order-notification">
              <div class="notification-header">
                <v-icon color="green" small>mdi-cart</v-icon>
                <span class="notification-title">New Order Received!</span>
              </div>
              <div class="notification-content">
                {{ msg.content }}
              </div>
              
              <!-- View Product Button for Order Notification -->
              <div class="order-action-buttons" v-if="msg.orderProduct">
                <v-btn
                  color="primary"
                  variant="outlined"
                  size="small"
                  @click="viewProduct(msg.orderProduct.id)"
                  class="view-product-btn"
                >
                  <v-icon left small>mdi-eye</v-icon>
                  View Product
                </v-btn>
              </div>
              
              <span class="time">{{ formatMessageTime(msg.created_at) }}</span>
            </div>

            <!-- Product Share Message -->
            <div v-else-if="msg.product_id && msg.product" class="product-message">
              <div class="product-card">
                <v-img
                  :src="getProductImage(msg.product)"
                  :alt="msg.product.prod_name"
                  class="product-image"
                  cover
                  @click="viewProduct(msg.product.id)"
                />
                <div class="product-info">
                  <div class="product-name">{{ msg.product.prod_name }}</div>
                  <div class="product-price">₱{{ msg.product.price?.toFixed(2) }}</div>
                  <div class="product-shop" v-if="msg.product.shop">
                    {{ msg.product.shop.business_name }}
                  </div>
                </div>
              </div>

              <div class="action-buttons">
                <v-btn
                  color="primary"
                  variant="outlined"
                  size="small"
                  @click="viewProduct(msg.product.id)"
                  class="view-btn"
                >
                  <v-icon left small>mdi-eye</v-icon>
                  View Product
                </v-btn>
              </div>

              <div class="message-content" v-if="msg.content && !msg.content.startsWith('Check out this product:')">
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
      <v-btn icon color="primary" @click="sendMessage" :disabled="!newMessage.trim() || loading">
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
  gap: 16px;
  height: calc(100vh - 120px);
  overflow-y: auto;
  background: #f9fafb;
}

.loading-state,
.empty-state {
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
  max-width: 320px;
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
  align-items: flex-start;
  padding: 12px;
  gap: 12px;
}

.product-image {
  width: 80px;
  height: 80px;
  border-radius: 8px;
  flex-shrink: 0;
  cursor: pointer;
  transition: transform 0.2s ease;
}

.product-image:hover {
  transform: scale(1.05);
}

.product-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.product-name {
  font-weight: 600;
  font-size: 0.9rem;
  line-height: 1.3;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.product-price {
  font-weight: 700;
  color: #007aff;
  font-size: 0.85rem;
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

/* Action buttons for product messages */
.action-buttons {
  display: flex;
  padding: 8px 12px;
  gap: 8px;
  border-top: 1px solid #f0f0f0;
  background: #fafafa;
}

.message-row.me .action-buttons {
  background: rgba(255, 255, 255, 0.1);
  border-top: 1px solid rgba(255, 255, 255, 0.2);
}

.view-btn {
  flex: 1;
  font-size: 0.75rem;
  height: 32px !important;
  min-width: 0 !important;
}

.message-row.me .view-btn {
  background-color: rgba(255, 255, 255, 0.2) !important;
  color: white !important;
  border-color: rgba(255, 255, 255, 0.3) !important;
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
  padding: 0 12px 8px;
}

.message-row.other .time {
  text-align: left;
}

/* Order Notification Styles */
.order-notification {
  max-width: 320px;
  background: #e8f5e8;
  border: 1px solid #c8e6c9;
  border-radius: 12px;
  padding: 12px;
  margin: 4px 0;
}

.notification-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.notification-title {
  font-weight: 600;
  color: #2e7d32;
  font-size: 0.9rem;
}

.notification-content {
  font-size: 0.85rem;
  color: #555;
  line-height: 1.4;
  margin-bottom: 12px;
}

/* Order Action Buttons */
.order-action-buttons {
  display: flex;
  padding: 8px 0;
  border-top: 1px solid #c8e6c9;
}

.view-product-btn {
  flex: 1;
  font-size: 0.75rem;
  height: 32px !important;
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
    width: 70px;
    height: 70px;
  }

  .product-name {
    font-size: 0.85rem;
  }

  .view-btn,
  .view-product-btn {
    font-size: 0.7rem;
    height: 28px !important;
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

/* Animation for new messages */
@keyframes slideIn {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.message-row {
  animation: slideIn 0.3s ease;
}
</style>