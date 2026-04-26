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
const currentUserHasShop = ref(false)
const loading = ref(true)
const sending = ref(false)
const sendError = ref<string | null>(null)

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

const getProfileDisplayName = (profile: any) => {
  return [profile?.first_name, profile?.last_name].filter(Boolean).join(' ').trim()
}

// ✅ Fetch other user's profile and shop info
const fetchOtherUserInfo = async () => {
  try {
    const currentUserId = await checkAuth()
    if (currentUserId) {
      userId.value = currentUserId

      const { data: currentUserShop } = await supabase
        .from('shops')
        .select('id')
        .eq('owner_id', currentUserId)
        .maybeSingle()

      currentUserHasShop.value = !!currentUserShop
    }

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

// ✅ Check authentication before any operation
const checkAuth = async (): Promise<string | null> => {
  try {
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error) {
      console.error('Auth error:', error)
      return null
    }
    return user?.id || null
  } catch (error) {
    console.error('Unexpected auth error:', error)
    return null
  }
}

// ✅ Fetch or create a conversation with better error handling
const getOrCreateConversation = async () => {
  try {
    const currentUserId = await checkAuth()
    if (!currentUserId) {
      console.error('User not authenticated')
      return
    }
    
    userId.value = currentUserId

    // Check if conversation already exists
    const { data: existing, error: fetchError } = await supabase
      .from('conversations')
      .select('id')
      .or(`and(user1.eq.${userId.value},user2.eq.${otherUserId}),and(user1.eq.${otherUserId},user2.eq.${userId.value})`)
      .maybeSingle()

    if (fetchError) {
      console.error('Conversation fetch error:', fetchError)
      return
    }

    if (existing) {
      conversationId.value = existing.id
      console.log('✅ Existing conversation found:', existing.id)
    } else {
      // Create new conversation
      const { data: created, error: createError } = await supabase
        .from('conversations')
        .insert([
          { 
            user1: userId.value, 
            user2: otherUserId,
            created_at: new Date().toISOString()
          }
        ])
        .select('id')
        .single()

      if (createError) {
        console.error('Conversation create error:', createError)
        
        // If it's a duplicate key error, try to fetch again
        if (createError.code === '23505') {
          const { data: retry } = await supabase
            .from('conversations')
            .select('id')
            .or(`and(user1.eq.${userId.value},user2.eq.${otherUserId}),and(user1.eq.${otherUserId},user2.eq.${userId.value})`)
            .maybeSingle()
          
          if (retry) {
            conversationId.value = retry.id
          }
        }
        return
      }

      if (created) {
        conversationId.value = created.id
        console.log('✅ New conversation created:', created.id)
      }
    }
  } catch (error) {
    console.error('❌ Unexpected error in getOrCreateConversation:', error)
  }
}

// ✅ IMPROVED: Extract product ID from order message with multiple patterns
const extractProductIdFromOrder = (content: string): string | null => {
  console.log('🔍 Extracting product ID from:', content)
  
  const patterns = [
    /Product ID:\s*([a-f0-9-]{36})/i,
    /product_id=([a-f0-9-]{36})/i,
    /pid=([a-f0-9-]{36})/i,
    /ID:\s*([a-f0-9-]{36})/i,
    /product[:\s]+([a-f0-9-]{36})/i,
    /item[:\s]+([a-f0-9-]{36})/i,
  ]
  
  for (const pattern of patterns) {
    const match = content.match(pattern)
    if (match && match[1]) {
      console.log('✅ Extracted product ID:', match[1])
      return match[1]
    }
  }
  
  console.log('❌ No product ID found in message')
  return null
}

// ✅ IMPROVED: Extract product name from order message
const extractProductNameFromOrder = (content: string): string | null => {
  console.log('🔍 Extracting product name from:', content)
  
  const patterns = [
    /New Order Received!\s*(.+?)\s*\(\s*x\d+\s*\)/,
    /Item:\s*(.+?)\s*\(\s*x\d+\s*\)/,
    /Product:\s*(.+?)\s*\(\s*x\d+\s*\)/,
    /(.+?)\s*\(\s*x\d+\s*\)/,
    /ordered\s+(.+?)\s*\(\s*x\d+\s*\)/i,
  ]
  
  for (const pattern of patterns) {
    const match = content.match(pattern)
    if (match && match[1]) {
      const productName = match[1].trim()
      console.log('✅ Extracted product name:', productName)
      return productName
    }
  }
  
  console.log('❌ No product name found in message')
  return null
}

const extractOrderIdFromContent = (content: string): string | null => {
  const patterns = [/Order ID:\s*([a-f0-9-]{36})/i, /Transaction #:\s*([a-f0-9-]{36})/i]

  for (const pattern of patterns) {
    const match = content.match(pattern)
    if (match?.[1]) {
      return match[1]
    }
  }

  return null
}

// ✅ NEW: Get product ID from order items table (MOST RELIABLE METHOD)
const getProductIdFromOrderItems = async (orderContent: string): Promise<string | null> => {
  try {
    const orderId = extractOrderIdFromContent(orderContent)
    if (!orderId) {
      console.log('❌ No order ID found in message')
      return null
    }

    console.log('🔍 Found order ID:', orderId)

    const { data: orderItems, error } = await supabase
      .from('order_items')
      .select('product_id')
      .eq('order_id', orderId)
      .limit(1)

    if (error) {
      console.error('❌ Error fetching order items:', error)
      return null
    }

    if (!orderItems || orderItems.length === 0) {
      console.log('❌ No order items found for order:', orderId)
      return null
    }

    const productId = orderItems[0].product_id
    console.log('✅ Found product ID from order_items:', productId)
    return productId
  } catch (error) {
    console.error('❌ Error in getProductIdFromOrderItems:', error)
    return null
  }
}

// ✅ IMPROVED: Find product by ID with better error handling
const findProductById = async (productId: string): Promise<any> => {
  try {
    console.log('🔍 Searching for product by ID:', productId)
    
    const { data: product, error } = await supabase
      .from('products')
      .select(`
        id,
        prod_name,
        price,
        main_img_urls,
        shop_id,
        description,
        has_varieties,
        varieties
      `)
      .eq('id', productId)
      .single()

    if (error) {
      console.error('❌ Error finding product by ID:', error)
      return null
    }

    if (!product) {
      console.log('❌ No product found with ID:', productId)
      return null
    }

    console.log('✅ Found product by ID:', product.prod_name)
    
    if (product.shop_id) {
      const { data: shop } = await supabase
        .from('shops')
        .select('id, business_name, logo_url')
        .eq('id', product.shop_id)
        .single()
      return { ...product, shop }
    }

    return product
  } catch (error) {
    console.error('❌ Unexpected error in findProductById:', error)
    return null
  }
}

// ✅ IMPROVED: Find product by name with fallbacks
const findProductByName = async (productName: string): Promise<any> => {
  try {
    console.log('🔍 Searching for product by name:', productName)
    
    const cleanProductName = productName.replace(/[^\w\s-]/g, '').trim()
    
    if (!cleanProductName) return null

    let { data: products, error } = await supabase
      .from('products')
      .select(`
        id,
        prod_name,
        price,
        main_img_urls,
        shop_id,
        description,
        has_varieties,
        varieties
      `)
      .ilike('prod_name', `%${cleanProductName}%`)
      .limit(5)

    if (error) {
      console.error('❌ Error finding product by name:', error)
      return null
    }

    if (!products || products.length === 0) {
      console.log('❌ No products found with name:', cleanProductName)
      return null
    }

    const product = products[0]
    console.log('✅ Found product by name:', product.prod_name)
    
    if (product.shop_id) {
      const { data: shop } = await supabase
        .from('shops')
        .select('id, business_name, logo_url')
        .eq('id', product.shop_id)
        .single()
      return { ...product, shop }
    }

    return product
  } catch (error) {
    console.error('❌ Unexpected error in findProductByName:', error)
    return null
  }
}

// ✅ Generate a fallback product ID if none is available
const generateFallbackProductId = (): string => {
  return `order-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
}

// ✅ IMPROVED: Get guaranteed product info for order notification
const getOrderProductInfo = async (content: string): Promise<{product: any, productId: string}> => {
  console.log('🛒 Processing order notification for product info')
  
  // Strategy 1: Try to get product ID from order_items table
  const orderProductId = await getProductIdFromOrderItems(content)
  if (orderProductId) {
    const product = await findProductById(orderProductId)
    if (product) {
      console.log('✅ Using product found from order_items')
      return { product, productId: orderProductId }
    }
  }

  // Strategy 2: Try to extract and find by product ID from message
  const extractedProductId = extractProductIdFromOrder(content)
  if (extractedProductId) {
    const product = await findProductById(extractedProductId)
    if (product) {
      console.log('✅ Using product found by ID from message')
      return { product, productId: extractedProductId }
    }
  }

  // Strategy 3: Try to find by product name
  const productName = extractProductNameFromOrder(content)
  if (productName) {
    const product = await findProductByName(productName)
    if (product) {
      console.log('✅ Using product found by name')
      return { product, productId: product.id }
    }
  }

  // Strategy 4: If no product found, create a fallback product object
  const fallbackProductId = orderProductId || extractedProductId || generateFallbackProductId()
  console.log('⚠️ Using fallback product with ID:', fallbackProductId)
  
  const fallbackProduct = {
    id: fallbackProductId,
    prod_name: productName || 'Ordered Product',
    price: 0,
    main_img_urls: null,
    shop_id: null,
    description: 'Product from order',
    shop: null,
    has_varieties: false,
    varieties: null
  }

  return { product: fallbackProduct, productId: fallbackProductId }
}

// ✅ IMPROVED: Load messages with guaranteed product info
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

    console.log('📨 Loading messages:', data.length)

    const enhancedMessages = await Promise.all(
      data.map(async (msg) => {
        console.log('💬 Processing message:', msg.id, 'Content:', msg.content)

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
                description,
                has_varieties,
                varieties
              `)
              .eq('id', msg.product_id)
              .single()

            if (productError) {
              console.error('❌ Error fetching product:', productError)
              return { ...msg, product: null }
            }

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
            console.error('❌ Error in product message processing:', err)
            return { ...msg, product: null }
          }
        }

        if (isOrderNotification(msg.content)) {
          console.log('🛒 Processing order notification:', msg.id)
          const { product, productId } = await getOrderProductInfo(msg.content)
          console.log('🎯 Final product result:', { 
            productId, 
            productName: product?.prod_name,
            hasProduct: !!product,
            hasVarieties: product?.has_varieties
          })
          return {
            ...msg,
            orderProduct: product,
            orderProductId: productId
          }
        }

        return { ...msg, orderProduct: null, orderProductId: null }
      }),
    )

    messages.value = enhancedMessages
    scrollToBottom()
  } catch (err) {
    console.error('❌ Unexpected error in loadMessages:', err)
  }
}

// ✅ IMPROVED: Subscribe to realtime messages
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
        console.log('🆕 New message received:', payload.new)
        let newMessageWithData = { ...payload.new }

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
                description,
                has_varieties,
                varieties
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

        if (isOrderNotification(payload.new.content)) {
          console.log('🛒 Processing new order notification')
          const { product, productId } = await getOrderProductInfo(payload.new.content)
          newMessageWithData.orderProduct = product
          newMessageWithData.orderProductId = productId
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

// ✅ FIXED: Send a regular text message with workaround for notifications trigger
const sendMessage = async () => {
  if (sending.value) return
  
  sending.value = true
  sendError.value = null

  try {
    // Check authentication first
    const currentUserId = await checkAuth()
    if (!currentUserId) {
      alert('Please sign in to send messages')
      router.push('/login')
      return
    }

    if (!newMessage.value.trim() || !conversationId.value) {
      console.error('Cannot send message: missing required data')
      return
    }

    const msg = {
      conversation_id: conversationId.value,
      sender_id: currentUserId,
      receiver_id: otherUserId,
      content: newMessage.value.trim(),
      is_read: false,
      product_id: null,
    }

    console.log('📤 Sending message:', msg)

    // Try sending message directly with minimal columns to avoid trigger issues
    const { data, error } = await supabase
      .from('messages')
      .insert([{
        conversation_id: msg.conversation_id,
        sender_id: msg.sender_id,
        receiver_id: msg.receiver_id,
        content: msg.content,
        is_read: msg.is_read
      }])
      .select()
      .single()

    if (error) {
      console.error('❌ Supabase error sending message:', error)
      
      // If it's a notifications trigger error, try alternative approach
      if (error.message.includes('notifications')) {
        console.log('⚠️ Notifications trigger error detected, trying alternative...')
        
        // Try without select to see if it works
        const { error: simpleError } = await supabase
          .from('messages')
          .insert([{
            conversation_id: msg.conversation_id,
            sender_id: msg.sender_id,
            receiver_id: msg.receiver_id,
            content: msg.content,
            is_read: msg.is_read,
            product_id: null
          }])
        
        if (simpleError) {
          console.error('❌ Alternative insert also failed:', simpleError)
          alert('Unable to send message due to database permissions. Please try again later.')
        } else {
          // If insert succeeded without select, manually add to messages array
          const manualMsg = {
            id: `temp-${Date.now()}`,
            ...msg,
            created_at: new Date().toISOString()
          }
          messages.value.push(manualMsg)
          scrollToBottom()
          console.log('✅ Message sent (manual fallback)')
        }
      } else {
        alert(`Error sending message: ${error.message}`)
      }
      return
    }

    if (data) {
      console.log('✅ Message sent successfully:', data)
      messages.value.push(data)
      scrollToBottom()
    }
  } catch (err) {
    console.error('❌ Unexpected error sending message:', err)
    alert('Failed to send message. Please try again.')
  } finally {
    sending.value = false
    newMessage.value = ''
  }
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

// ✅ ALWAYS WORKING: View product details - INCLUDES VARIETIES
const viewProduct = (productId: string) => {
  console.log('👁️ Viewing product with ID:', productId)
  
  if (productId && !productId.startsWith('order-')) {
    console.log('✅ Navigating to product page:', productId)
    router.push(`/viewproduct/${productId}`)
  } else {
    console.log('⚠️ Fallback product ID, showing product catalog')
    router.push('/products')
  }
}

// ✅ ALWAYS WORKING: Get product ID for order message
const getOrderProductId = (msg: any): string => {
  console.log('🔍 Getting product ID for message:', msg.id)
  
  if (msg.orderProductId) {
    console.log('✅ Using stored orderProductId:', msg.orderProductId)
    return msg.orderProductId
  }
  
  if (msg.orderProduct?.id) {
    console.log('✅ Using orderProduct.id:', msg.orderProduct.id)
    return msg.orderProduct.id
  }
  
  const extractedId = extractProductIdFromOrder(msg.content)
  if (extractedId) {
    console.log('✅ Using extracted ID:', extractedId)
    return extractedId
  }
  
  const fallbackId = generateFallbackProductId()
  console.log('⚠️ Using fallback ID:', fallbackId)
  return fallbackId
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
  return content.includes('New Order Received!') || content.includes('Order ID:') || content.includes('Transaction #:')
}

// ✅ Get user display name
const userDisplayName = computed(() => {
  const profileName = getProfileDisplayName(otherUserProfile.value)

  if (currentUserHasShop.value) {
    return profileName || shopInfo.value?.business_name || 'User'
  }

  return shopInfo.value?.business_name || profileName || 'User'
})

// ✅ Get user avatar
const userAvatar = computed(() => {
  if (currentUserHasShop.value) {
    if (otherUserProfile.value?.avatar_url) return otherUserProfile.value.avatar_url
    if (shopInfo.value?.logo_url) return shopInfo.value.logo_url
  } else {
    if (shopInfo.value?.logo_url) return shopInfo.value.logo_url
    if (otherUserProfile.value?.avatar_url) return otherUserProfile.value.avatar_url
  }
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
    <v-app-bar class="chat-app-bar" flat color="primary" dark>
      <v-btn icon @click="goBack" class="back-btn">
        <v-icon>mdi-arrow-left</v-icon>
      </v-btn>

      <div class="user-info">
        <v-avatar size="36" class="user-avatar">
          <v-img :src="userAvatar" :alt="userDisplayName" />
        </v-avatar>
        <div class="user-details">
          <v-toolbar-title class="user-name">{{ userDisplayName }}</v-toolbar-title>
        </div>
      </div>

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
            <!-- Order Notification Message -->
            <div v-if="isOrderNotification(msg.content)" class="order-notification">
              <div class="notification-header">
                <v-icon color="green" small>mdi-cart</v-icon>
                <span class="notification-title">New Order Received!</span>
              </div>
              <div class="notification-content">
                {{ msg.content }}
              </div>
              
              <div class="order-action-buttons">
                <v-btn
                  color="primary"
                  variant="outlined"
                  size="small"
                  @click="viewProduct(getOrderProductId(msg))"
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
                  <div v-if="msg.product.has_varieties" class="varieties-indicator">
                    <v-chip size="x-small" color="primary" variant="outlined">
                      <v-icon left small>mdi-palette</v-icon>
                      Has Varieties
                    </v-chip>
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

    <v-footer app class="chat-footer" color="white" elevation="3">
      <div class="input-container">
        <v-text-field v-model="newMessage" variant="outlined" placeholder="Type a message..." hide-details
          class="message-input" @keyup.enter="sendMessage" :disabled="loading || sending">
          <template v-slot:prepend-inner v-if="!newMessage.trim()">
            <v-icon color="grey" size="20">mdi-emoticon-outline</v-icon>
          </template>
        </v-text-field>
        <v-btn icon color="primary" @click="sendMessage" :disabled="!newMessage.trim() || loading || sending"
          :loading="sending" class="send-btn">
          <v-icon>mdi-send</v-icon>
        </v-btn>
      </div>
    </v-footer>
  </v-app>
</template>

<style scoped>
/* CSS Variables for safe area insets */
:root {
  --sat: env(safe-area-inset-top);
  --sar: env(safe-area-inset-right);
  --sab: env(safe-area-inset-bottom);
  --sal: env(safe-area-inset-left);
}

/* Chat App Bar with Safe Area Support */
.chat-app-bar {
  position: fixed !important;
  top: 0;
  left: 0;
  right: 0;
  z-index: 1000;
  background: linear-gradient(135deg, #3f83c7, #2c5f8a) !important;
  padding-top: var(--sat, 0px);
  height: calc(64px + var(--sat, 0px)) !important;
  min-height: calc(64px + var(--sat, 0px)) !important;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

/* For iOS devices */
@supports (padding-top: env(safe-area-inset-top)) {
  .chat-app-bar {
    padding-top: env(safe-area-inset-top);
    height: calc(64px + env(safe-area-inset-top)) !important;
  }
}

/* Ensure toolbar content is properly aligned */
.chat-app-bar :deep(.v-toolbar__content) {
  height: 64px !important;
  padding-top: 0 !important;
}

/* Back Button */
.back-btn {
  margin-left: 4px;
  backdrop-filter: blur(8px);
}

.back-btn:hover {
  background: rgba(255, 255, 255, 0.25) !important;
  transform: scale(1.05);
}

/* User Info Section */
.user-info {
  display: flex;
  align-items: center;
  gap: 12px;
  cursor: pointer;
  padding: 4px 12px;
  border-radius: 30px;
  transition: background 0.2s ease;
  flex: 1; 
  min-width: 0;  
}

.user-info:hover {
  background: rgba(255, 255, 255, 0.1);
}

.user-avatar {
  border: 2px solid rgba(255, 255, 255, 0.3);
  flex-shrink: 0;  
}

.user-details {
  display: flex;
  flex-direction: column;
  line-height: 1.2;
  min-width: 0;            
  flex: 1; 
}

.user-name {
  font-size: 1rem !important;
  font-weight: 600 !important;
  letter-spacing: -0.2px;
  white-space: nowrap;       
  overflow: hidden;        
  text-overflow: ellipsis;  
  width: 100%;               
}

/* Chat Container */
.chat-container {
  display: flex;
  flex-direction: column;
  padding: 20px 16px;
  gap: 16px;
  height: calc(100vh - 64px - 80px - var(--sat, 0px) - var(--sab, 0px));
  overflow-y: auto;
  background: #f5f7fa;
}

/* Message Row */
.message-row {
  display: flex;
  margin-bottom: 8px;
  animation: slideIn 0.2s ease;
}

.message-row.me {
  justify-content: flex-end;
}

.message-row.other {
  justify-content: flex-start;
}

/* Regular Message Bubble */
.bubble {
  max-width: 75%;
  padding: 10px 14px;
  border-radius: 20px;
  position: relative;
  word-wrap: break-word;
}

.message-row.me .bubble {
  background: linear-gradient(135deg, #007aff, #0051d5);
  color: white;
  border-bottom-right-radius: 4px;
}

.message-row.other .bubble {
  background: white;
  color: #1f2937;
  border-bottom-left-radius: 4px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
}

.message-text {
  line-height: 1.4;
  font-size: 0.9rem;
}

/* Product Message */
.product-message {
  max-width: 320px;
  background: white;
  border-radius: 16px;
  overflow: hidden;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}

.message-row.me .product-message {
  background: white;
}

.product-card {
  display: flex;
  padding: 12px;
  gap: 12px;
  cursor: pointer;
}

.product-card:hover {
  background: #f8f9fa;
}

.product-image {
  width: 80px;
  height: 80px;
  border-radius: 12px;
  flex-shrink: 0;
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
  gap: 4px;
}

.product-name {
  font-weight: 600;
  font-size: 0.85rem;
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

.product-shop {
  font-size: 0.7rem;
  color: #6b7280;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Order Notification */
.order-notification {
  max-width: 320px;
  background: #f0fdf4;
  border: 1px solid #bbf7d0;
  border-radius: 16px;
  padding: 12px;
}

.notification-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.notification-title {
  font-weight: 600;
  color: #166534;
  font-size: 0.85rem;
}

.notification-content {
  font-size: 0.8rem;
  color: #374151;
  line-height: 1.4;
  margin-bottom: 12px;
}

.order-action-buttons {
  display: flex;
  gap: 8px;
  padding-top: 8px;
  border-top: 1px solid #bbf7d0;
}

.view-product-btn {
  flex: 1;
  font-size: 0.7rem;
  height: 32px !important;
}

/* Action buttons for product messages */
.action-buttons {
  display: flex;
  padding: 8px 12px;
  gap: 8px;
  border-top: 1px solid #e5e7eb;
  background: #fafafa;
}

.view-btn {
  flex: 1;
  font-size: 0.7rem;
  height: 32px !important;
}

.message-content {
  padding: 8px 12px 4px;
  border-top: 1px solid #e5e7eb;
  font-size: 0.85rem;
  line-height: 1.4;
}

/* Time Styling */
.time {
  display: block;
  font-size: 0.65rem;
  opacity: 0.7;
  margin-top: 6px;
  text-align: right;
  padding: 0 12px 8px;
}

.message-row.other .time {
  text-align: left;
}

/* Chat Footer */
.chat-footer {
  position: fixed !important;
  bottom: 0;
  left: 0;
  right: 0;
  background: white !important;
  padding: 12px 16px !important;
  padding-bottom: max(12px, var(--sab, 0px)) !important;
  box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.08);
  border-top: 1px solid rgba(0, 0, 0, 0.05);
}

.input-container {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  max-width: 800px;
  margin: 0 auto;
}

/* Message Input Field - Enhanced */
.message-input {
  flex: 1;
  transition: all 0.2s ease;
}

.message-input :deep(.v-field) {
  border-radius: 28px !important;
  background: #f5f7fa !important;
  transition: all 0.2s ease;
  border: 1px solid transparent;
}

.message-input :deep(.v-field:hover) {
  background: #ffffff !important;
  border-color: #e0e0e0;
}

.message-input :deep(.v-field--focused) {
  border-color: #007aff !important;
  box-shadow: 0 0 0 2px rgba(0, 122, 255, 0.1);
}

.message-input :deep(.v-field__field) {
  padding: 10px 16px;
  min-height: 48px;
}

.message-input :deep(input) {
  font-size: 0.95rem;
}

.message-input :deep(input::placeholder) {
  color: #9ca3af;
  font-size: 0.9rem;
}

/* Send Button - Enhanced */
.send-btn {
  width: 48px !important;
  height: 48px !important;
  border-radius: 50% !important;
  background: linear-gradient(135deg, #007aff, #0051d5) !important;
  box-shadow: 0 4px 12px rgba(0, 122, 255, 0.3);
  transition: all 0.2s ease;
  flex-shrink: 0;
}

.send-btn:hover:not(:disabled) {
  transform: scale(1.05);
  box-shadow: 0 6px 16px rgba(0, 122, 255, 0.4);
}

.send-btn:active:not(:disabled) {
  transform: scale(0.98);
}

.send-btn:disabled {
  opacity: 0.5;
  background: linear-gradient(135deg, #9ca3af, #6b7280) !important;
  box-shadow: none;
}

/* Loading & Empty States */
.loading-state,
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
  text-align: center;
  min-height: 300px;
}

/* Animations */
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

/* Scrollbar Styling */
.chat-container::-webkit-scrollbar {
  width: 6px;
}

.chat-container::-webkit-scrollbar-track {
  background: #f1f1f1;
  border-radius: 3px;
}

.chat-container::-webkit-scrollbar-thumb {
  background: #c1c1c1;
  border-radius: 3px;
}

.chat-container::-webkit-scrollbar-thumb:hover {
  background: #a8a8a8;
}

/* Responsive Design */
@media (max-width: 600px) {
  .chat-container {
    padding: 16px 12px;
    gap: 12px;
  }

  .bubble {
    max-width: 85%;
    padding: 8px 12px;
  }

  .product-message,
  .order-notification {
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
    font-size: 0.8rem;
  }

  .user-name {
    font-size: 0.9rem !important;
  }

  .user-info {
    gap: 8px;
    padding: 4px 8px;
  }

.chat-footer {
    padding: 10px 12px !important;
    padding-bottom: max(10px, var(--sab, 0px)) !important;
  }
  
  .input-container {
    gap: 10px;
  }
  
  .message-input :deep(.v-field__field) {
    padding: 8px 14px;
    min-height: 44px;
  }
  
  .message-input :deep(input) {
    font-size: 0.9rem;
  }
  
  .send-btn {
    width: 44px !important;
    height: 44px !important;
  }
}

@media (max-width: 480px) {
  .chat-footer {
    padding: 8px 10px !important;
    padding-bottom: max(8px, var(--sab, 0px)) !important;
  }
  
  .input-container {
    gap: 8px;
  }
  
  .message-input :deep(.v-field__field) {
    padding: 6px 12px;
    min-height: 40px;
  }
  
  .message-input :deep(input) {
    font-size: 0.85rem;
  }
  
  .send-btn {
    width: 40px !important;
    height: 40px !important;
  }
}

/* Landscape Mode */
@media (orientation: landscape) and (max-height: 500px) {
  .chat-app-bar {
    height: 56px !important;
    padding-top: 0 !important;
  }
  
  .chat-main {
    margin-top: 56px;
  }
  
  .chat-container {
    height: calc(100vh - 56px - 70px);
  }

   .chat-footer {
    padding: 6px 12px !important;
  }
  
  .message-input :deep(.v-field__field) {
    padding: 6px 12px;
    min-height: 36px;
  }
  
  .send-btn {
    width: 36px !important;
    height: 36px !important;
  }
}

/* Animation when sending */
@keyframes pulse {
  0% {
    transform: scale(1);
  }
  50% {
    transform: scale(1.1);
  }
  100% {
    transform: scale(1);
  }
}

.send-btn:active:not(:disabled) {
  animation: pulse 0.2s ease;
}
</style>
