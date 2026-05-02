<script setup lang="ts">
import { ref, onMounted, onUnmounted, nextTick, computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { supabase } from '@/utils/supabase'
import {
  isOrderChatMessage,
  removeRecentMessageNotification,
  shouldRetainMessageNotification,
} from '@/utils/chatNotifications'
import { formatLiveTimestamp } from '@/utils/dateTime'
import {
  getProfileDisplayName,
  resolveConversationViewerRole,
  resolveCounterpartyIdentity,
  type CounterpartyViewerRole,
} from '@/utils/chatIdentity'

const router = useRouter()
const route = useRoute()

const userId = ref<string | null>(null)
const routeTargetId = computed(() => (typeof route.params.id === 'string' ? route.params.id : ''))
const requestedConversationId = computed(() =>
  typeof route.query.conversationId === 'string' ? route.query.conversationId : null,
)
const otherUserId = ref<string | null>(routeTargetId.value || null)
const conversationId = ref<string | null>(null)
const messages = ref<any[]>([])
const newMessage = ref('')
const otherUserProfile = ref<any>(null)
const currentUserShop = ref<any>(null)
const shopInfo = ref<any>(null)
const conversationParticipants = ref<{ user1: string | null; user2: string | null } | null>(null)
const loading = ref(true)
const sending = ref(false)
const isUpdatingMessage = ref(false)
const sendError = ref<string | null>(null)
const currentTime = ref(Date.now())
const editingMessageId = ref<string | null>(null)
const chatScrollEl = ref<HTMLElement | null>(null)
const messagesEndEl = ref<HTMLElement | null>(null)
const composerInputEl = ref<any>(null)
const viewportHeight = ref(typeof window !== 'undefined' ? window.innerHeight : 0)
const orderMessageDetailsCache = new Map<string, OrderMessageDetails | null>()

let subscription: any = null
let timeUpdateInterval: any = null
let viewportCleanup: (() => void) | null = null

const UNSENT_MESSAGE_TEXT = 'Message unsent'

type OrderMessageDetails = {
  orderId: string
  customerName: string | null
}

const formatMessageTime = (timestamp: string) => {
  return formatLiveTimestamp(timestamp, currentTime.value)
}

const formatPrice = (value: number | string | null | undefined) => {
  return Number(value ?? 0).toFixed(2)
}

const startTimeUpdates = () => {
  currentTime.value = Date.now()
  timeUpdateInterval = setInterval(() => {
    currentTime.value = Date.now()
  }, 30000)
}

const scrollToBottom = async (behavior: ScrollBehavior = 'auto') => {
  await nextTick()

  if (messagesEndEl.value) {
    messagesEndEl.value.scrollIntoView({ behavior, block: 'end' })
    return
  }

  if (chatScrollEl.value) {
    chatScrollEl.value.scrollTop = chatScrollEl.value.scrollHeight
  }
}

const viewerConversationRole = computed<CounterpartyViewerRole | null>(() =>
  resolveConversationViewerRole({
    currentUserId: userId.value,
    otherUserId: otherUserId.value,
    customerUserId: conversationParticipants.value?.user1,
    sellerUserId: conversationParticipants.value?.user2,
    currentUserShop: currentUserShop.value,
    otherUserShop: shopInfo.value,
    messages: messages.value,
  }),
)

const otherUserIdentity = computed(() =>
  resolveCounterpartyIdentity({
    viewerRole: viewerConversationRole.value,
    profile: otherUserProfile.value,
    shop: shopInfo.value,
  }),
)

const isEditingMessage = computed(() => Boolean(editingMessageId.value))

const editingTargetMessage = computed(
  () => messages.value.find((message) => message.id === editingMessageId.value) ?? null,
)

const chatViewportStyle = computed(() => ({
  '--chat-viewport-height': viewportHeight.value ? `${viewportHeight.value}px` : '100dvh',
}))

const updateViewportHeight = () => {
  if (typeof window === 'undefined') return
  viewportHeight.value = window.visualViewport?.height || window.innerHeight
}

const setupViewportListeners = () => {
  if (typeof window === 'undefined') return

  const handleViewportChange = () => {
    updateViewportHeight()
  }

  updateViewportHeight()
  window.addEventListener('resize', handleViewportChange)
  window.visualViewport?.addEventListener('resize', handleViewportChange)
  window.visualViewport?.addEventListener('scroll', handleViewportChange)

  viewportCleanup = () => {
    window.removeEventListener('resize', handleViewportChange)
    window.visualViewport?.removeEventListener('resize', handleViewportChange)
    window.visualViewport?.removeEventListener('scroll', handleViewportChange)
  }
}

const focusComposer = async () => {
  await nextTick()
  const input =
    composerInputEl.value?.$el?.querySelector?.('textarea') ??
    composerInputEl.value?.$el?.querySelector?.('input')

  input?.focus?.()

  if (typeof input?.setSelectionRange === 'function') {
    const end = String(input.value ?? '').length
    input.setSelectionRange(end, end)
  }
}

const handleComposerEnter = (event: KeyboardEvent) => {
  if (event.shiftKey) {
    return
  }

  event.preventDefault()
  void sendMessage()
}

const handleComposerFocus = () => {
  window.setTimeout(() => {
    void scrollToBottom('auto')
  }, 120)
}

const trimMessageContent = (content: string | null | undefined) => content?.trim() ?? ''

const isUnsentMessage = (message: any) => trimMessageContent(message?.content) === UNSENT_MESSAGE_TEXT

const isPendingMessage = (message: any) => String(message?.id ?? '').startsWith('temp-')

const isOwnMessage = (message: any) => message?.sender_id === userId.value

const canEditMessage = (message: any) =>
  isOwnMessage(message) &&
  !isPendingMessage(message) &&
  !message?.product_id &&
  !isOrderChatMessage(message?.content || '') &&
  !isUnsentMessage(message)

const canUnsendMessage = (message: any) =>
  isOwnMessage(message) &&
  !isPendingMessage(message) &&
  !isOrderChatMessage(message?.content || '') &&
  !isUnsentMessage(message)

const shouldShowMessageActions = (message: any) =>
  canEditMessage(message) || canUnsendMessage(message)

const isEditedMessage = (message: any) =>
  !isUnsentMessage(message) &&
  Boolean(message?.__edited || message?.edited_at || (message?.updated_at && message.updated_at !== message.created_at))

// ✅ Fetch other user's profile and shop info
const fetchOtherUserInfo = async () => {
  try {
    const currentUserId = await checkAuth()
    if (currentUserId) {
      userId.value = currentUserId

      const { data: currentShop, error: currentShopError } = await supabase
        .from('shops')
        .select('id, business_name, logo_url, owner_id')
        .eq('owner_id', currentUserId)
        .maybeSingle()

      if (currentShopError) {
        console.error('Error fetching current user shop info:', currentShopError)
      }

      currentUserShop.value = currentShop
    }

    conversationParticipants.value = null

    const conversationLookupId = requestedConversationId.value || routeTargetId.value
    if (conversationLookupId) {
      const { data: existingConversation, error: conversationError } = await supabase
        .from('conversations')
        .select('id, user1, user2')
        .eq('id', conversationLookupId)
        .maybeSingle()

      if (conversationError) {
        console.error('Conversation context fetch error:', conversationError)
      } else if (
        existingConversation &&
        currentUserId &&
        [existingConversation.user1, existingConversation.user2].includes(currentUserId)
      ) {
        conversationId.value = existingConversation.id
        conversationParticipants.value = {
          user1: existingConversation.user1 || null,
          user2: existingConversation.user2 || null,
        }
        otherUserId.value =
          existingConversation.user1 === currentUserId
            ? existingConversation.user2
            : existingConversation.user1
      }
    }

    if (!otherUserId.value) {
      otherUserId.value = routeTargetId.value || null
    }

    if (!otherUserId.value) {
      console.warn('No valid chat participant could be resolved from the route.')
      otherUserProfile.value = null
      shopInfo.value = null
      return
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', otherUserId.value)
      .maybeSingle()

    if (profileError) {
      console.error('Error fetching other user profile:', profileError)
    }

    let resolvedProfile = profile

    if (!resolvedProfile && conversationId.value && currentUserId) {
      const { data: conversationWithProfiles, error: conversationProfileError } = await supabase
        .from('conversations')
        .select(`
          id,
          user1,
          user2,
          user1_profile:profiles!conversations_user1_fkey (
            id,
            first_name,
            last_name,
            avatar_url
          ),
          user2_profile:profiles!conversations_user2_fkey (
            id,
            first_name,
            last_name,
            avatar_url
          )
        `)
        .eq('id', conversationId.value)
        .maybeSingle()

      if (conversationProfileError) {
        console.error('Error fetching conversation profile fallback:', conversationProfileError)
      } else if (conversationWithProfiles) {
        resolvedProfile =
          conversationWithProfiles.user1 === currentUserId
            ? conversationWithProfiles.user2_profile
            : conversationWithProfiles.user1_profile
      }
    }

    otherUserProfile.value = resolvedProfile

    const { data: shop, error: shopError } = await supabase
      .from('shops')
      .select('id, business_name, logo_url, owner_id')
      .eq('owner_id', otherUserId.value)
      .maybeSingle()

    if (shopError) {
      console.error('Error fetching other user shop info:', shopError)
    }

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
const updateConversationActivity = async (targetConversationId: string) => {
  const { error } = await supabase
    .from('conversations')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', targetConversationId)

  if (error) {
    console.warn('Could not update conversation timestamp:', error)
  }
}

const sortMessages = (messageList: any[]) =>
  [...messageList].sort(
    (left, right) =>
      new Date(left.created_at ?? 0).getTime() - new Date(right.created_at ?? 0).getTime(),
  )

const findPendingMessageIndex = (incomingMessage: any) =>
  messages.value.findIndex(
    (existingMessage) =>
      isPendingMessage(existingMessage) &&
      existingMessage.sender_id === incomingMessage.sender_id &&
      existingMessage.receiver_id === incomingMessage.receiver_id &&
      existingMessage.content === incomingMessage.content &&
      existingMessage.created_at === incomingMessage.created_at,
  )

const mergeEditedState = (existingMessage: any, incomingMessage: any) => {
  const contentChanged =
    trimMessageContent(existingMessage?.content) !== trimMessageContent(incomingMessage?.content)

  if (
    contentChanged &&
    !isUnsentMessage(incomingMessage) &&
    !incomingMessage?.edited_at &&
    !incomingMessage?.updated_at
  ) {
    return { ...incomingMessage, __edited: true }
  }

  if (existingMessage?.__edited && !isUnsentMessage(incomingMessage)) {
    return { ...incomingMessage, __edited: true }
  }

  return incomingMessage
}

const appendMessage = (message: any) => {
  if (messages.value.some((existingMessage) => existingMessage.id === message.id)) {
    return
  }

  const pendingMessageIndex = findPendingMessageIndex(message)

  if (pendingMessageIndex >= 0) {
    const pendingMessage = messages.value[pendingMessageIndex]
    messages.value[pendingMessageIndex] = mergeEditedState(pendingMessage, {
      ...pendingMessage,
      ...message,
    })
  } else {
    messages.value.push(message)
  }

  messages.value = sortMessages(messages.value)
}

const replaceMessage = (message: any) => {
  const messageIndex = messages.value.findIndex((existingMessage) => existingMessage.id === message.id)

  if (messageIndex >= 0) {
    const existingMessage = messages.value[messageIndex]
    messages.value[messageIndex] = mergeEditedState(existingMessage, {
      ...existingMessage,
      ...message,
    })
  } else {
    const pendingMessageIndex = findPendingMessageIndex(message)

    if (pendingMessageIndex >= 0) {
      const pendingMessage = messages.value[pendingMessageIndex]
      messages.value[pendingMessageIndex] = mergeEditedState(pendingMessage, {
        ...pendingMessage,
        ...message,
      })
    } else {
      messages.value.push(message)
    }
  }

  messages.value = sortMessages(messages.value)
}

const removeMessage = (messageId: string) => {
  messages.value = messages.value.filter((message) => message.id !== messageId)
}

const markConversationMessagesAsRead = async () => {
  if (!conversationId.value || !userId.value) return

  try {
    const { error } = await supabase
      .from('messages')
      .update({ is_read: true })
      .eq('conversation_id', conversationId.value)
      .eq('receiver_id', userId.value)
      .eq('is_read', false)

    if (error) {
      console.error('Error marking conversation messages as read:', error)
    }
  } catch (error) {
    console.error('Unexpected error marking conversation messages as read:', error)
  }
}

const syncMessageNotificationAfterSend = async ({
  senderId,
  receiverId,
  createdAt,
  content,
  isOrderMessage,
}: {
  senderId: string
  receiverId: string
  createdAt: string
  content?: string | null
  isOrderMessage: boolean
}) => {
  if (!conversationId.value) return

  if (isOrderMessage) {
    await removeRecentMessageNotification({
      receiverUserId: receiverId,
      conversationId: conversationId.value,
      messageCreatedAt: createdAt,
    })
    return
  }

  const shouldRetain = await shouldRetainMessageNotification({
    conversationId: conversationId.value,
    senderId,
    receiverUserId: receiverId,
    messageCreatedAt: createdAt,
    content,
  })

  if (shouldRetain) {
    return
  }

  await removeRecentMessageNotification({
    receiverUserId: receiverId,
    conversationId: conversationId.value,
    messageCreatedAt: createdAt,
  })
}

const getOrCreateConversation = async () => {
  try {
    const currentUserId = await checkAuth()
    if (!currentUserId) {
      console.error('User not authenticated')
      return
    }
    
    userId.value = currentUserId

    if (conversationId.value) {
      console.log('Using conversation resolved from route:', conversationId.value)
      return
    }

    if (!otherUserId.value) {
      console.warn('Conversation target is missing; skipping conversation creation.')
      return
    }

    // Check if conversation already exists
    const { data: existing, error: fetchError } = await supabase
      .from('conversations')
      .select('id, user1, user2')
      .or(`and(user1.eq.${userId.value},user2.eq.${otherUserId.value}),and(user1.eq.${otherUserId.value},user2.eq.${userId.value})`)
      .maybeSingle()

    if (fetchError) {
      console.error('Conversation fetch error:', fetchError)
      return
    }

    if (existing) {
      conversationId.value = existing.id
      conversationParticipants.value = {
        user1: existing.user1 || null,
        user2: existing.user2 || null,
      }
      console.log('✅ Existing conversation found:', existing.id)
    } else {
      if (!otherUserProfile.value) {
        console.warn('Other user profile is unavailable; preventing invalid conversation creation.')
        return
      }

      const shouldUseSellerOrdering =
        Boolean(currentUserShop.value?.owner_id) && !Boolean(shopInfo.value?.owner_id)
      const conversationPayload = shouldUseSellerOrdering
        ? {
            user1: otherUserId.value,
            user2: userId.value,
            created_at: new Date().toISOString(),
          }
        : {
            user1: userId.value,
            user2: otherUserId.value,
            created_at: new Date().toISOString(),
          }

      // Create new conversation
      const { data: created, error: createError } = await supabase
        .from('conversations')
        .insert([conversationPayload])
        .select('id, user1, user2')
        .single()

      if (createError) {
        console.error('Conversation create error:', createError)
        
        // If it's a duplicate key error, try to fetch again
        if (createError.code === '23505') {
          const { data: retry } = await supabase
            .from('conversations')
            .select('id, user1, user2')
            .or(`and(user1.eq.${userId.value},user2.eq.${otherUserId.value}),and(user1.eq.${otherUserId.value},user2.eq.${userId.value})`)
            .maybeSingle()
          
          if (retry) {
            conversationId.value = retry.id
            conversationParticipants.value = {
              user1: retry.user1 || null,
              user2: retry.user2 || null,
            }
          }
        }
        return
      }

      if (created) {
        conversationId.value = created.id
        conversationParticipants.value = {
          user1: created.user1 || null,
          user2: created.user2 || null,
        }
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

const hydrateOrderMessageDetails = async (content: string): Promise<OrderMessageDetails | null> => {
  const orderId = extractOrderIdFromContent(content)

  if (!orderId) {
    return null
  }

  if (orderMessageDetailsCache.has(orderId)) {
    return orderMessageDetailsCache.get(orderId) || null
  }

  try {
    const { data, error } = await supabase
      .from('orders')
      .select(`
        id,
        address:addresses!orders_address_id_fkey (
          recipient_name
        ),
        buyer:profiles!orders_user_id_fkey (
          first_name,
          last_name
        )
      `)
      .eq('id', orderId)
      .maybeSingle()

    if (error) {
      console.error('Error hydrating order message details:', error)
      orderMessageDetailsCache.set(orderId, null)
      return null
    }

    const customerName =
      data?.address?.recipient_name?.trim() || getProfileDisplayName(data?.buyer) || null

    const details = {
      orderId,
      customerName,
    }

    orderMessageDetailsCache.set(orderId, details)
    return details
  } catch (error) {
    console.error('Unexpected order message hydration error:', error)
    orderMessageDetailsCache.set(orderId, null)
    return null
  }
}

// ✅ IMPROVED: Load messages with guaranteed product info
const hydrateProductMessage = async (message: any) => {
  if (!message?.product_id) {
    return null
  }

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
      .eq('id', message.product_id)
      .single()

    if (productError) {
      console.error('Error fetching product for message:', productError)
      return null
    }

    let productShop = null

    if (product?.shop_id) {
      const { data: shop } = await supabase
        .from('shops')
        .select('id, business_name, logo_url')
        .eq('id', product.shop_id)
        .single()

      productShop = shop
    }

    return product ? { ...product, shop: productShop } : null
  } catch (error) {
    console.error('Unexpected product hydration error:', error)
    return null
  }
}

const enrichMessage = async (message: any) => {
  const enrichedMessage = {
    ...message,
    product: null,
    orderProduct: null,
    orderProductId: null,
    orderDetails: null,
  }

  if (enrichedMessage.product_id) {
    enrichedMessage.product = await hydrateProductMessage(enrichedMessage)
  }

  if (isOrderChatMessage(enrichedMessage.content || '')) {
    const { product, productId } = await getOrderProductInfo(enrichedMessage.content)
    enrichedMessage.orderProduct = product
    enrichedMessage.orderProductId = productId
    enrichedMessage.orderDetails = await hydrateOrderMessageDetails(enrichedMessage.content)
  }

  return enrichedMessage
}

const formatOrderMessageContent = (message: any) => {
  const content = message?.content || ''
  const customerName = message?.orderDetails?.customerName?.trim()

  if (!customerName) {
    return content
  }

  return content.replace(/^Customer:\s*.*$/m, `Customer: ${customerName}`)
}

const runMessageUpdate = async (messageId: string, payload: Record<string, any>, withSelect = true) => {
  const query = supabase.from('messages').update(payload).eq('id', messageId)

  if (withSelect) {
    return query.select('*').maybeSingle()
  }

  const { error } = await query
  return { data: null, error }
}

const updateMessageRecord = async ({
  messageId,
  values,
  includeEditedMarker = false,
}: {
  messageId: string
  values: Record<string, any>
  includeEditedMarker?: boolean
}) => {
  const timestamp = new Date().toISOString()
  const payloads = includeEditedMarker
    ? [
        { ...values, edited_at: timestamp, updated_at: timestamp },
        { ...values, updated_at: timestamp },
        values,
      ]
    : [{ ...values, updated_at: timestamp }, values]

  let lastError: any = null

  for (const payload of payloads) {
    const { data, error } = await runMessageUpdate(messageId, payload, true)
    if (!error) {
      return data ?? { id: messageId, ...payload }
    }
    lastError = error
  }

  for (const payload of payloads) {
    const { error } = await runMessageUpdate(messageId, payload, false)
    if (!error) {
      return { id: messageId, ...payload }
    }
    lastError = error
  }

  throw lastError
}

const startEditingMessage = async (message: any) => {
  if (!canEditMessage(message)) {
    return
  }

  editingMessageId.value = message.id
  newMessage.value = message.content ?? ''
  sendError.value = null
  await focusComposer()
  handleComposerFocus()
}

const cancelEditingMessage = () => {
  editingMessageId.value = null
  newMessage.value = ''
  sendError.value = null
}

const saveEditedMessage = async () => {
  const editingTarget = editingTargetMessage.value
  const nextContent = newMessage.value.trim()

  if (!editingTarget || !editingMessageId.value) {
    cancelEditingMessage()
    return
  }

  if (!canEditMessage(editingTarget)) {
    sendError.value = 'That message can no longer be edited.'
    return
  }

  if (!nextContent) {
    sendError.value = 'Message cannot be empty.'
    return
  }

  if (nextContent === trimMessageContent(editingTarget.content)) {
    cancelEditingMessage()
    return
  }

  isUpdatingMessage.value = true
  sendError.value = null

  try {
    const updatedRow = await updateMessageRecord({
      messageId: editingMessageId.value,
      values: { content: nextContent },
      includeEditedMarker: true,
    })

    const enrichedMessage = await enrichMessage(updatedRow)
    replaceMessage({ ...enrichedMessage, __edited: true })
    cancelEditingMessage()
  } catch (error: any) {
    console.error('Error editing message:', error)
    sendError.value = error?.message || 'Unable to edit the message right now.'
  } finally {
    isUpdatingMessage.value = false
  }
}

const unsendMessage = async (message: any) => {
  if (!canUnsendMessage(message)) {
    return
  }

  const confirmed = window.confirm('Unsend this message?')
  if (!confirmed) {
    return
  }

  isUpdatingMessage.value = true
  sendError.value = null

  try {
    const updatedRow = await updateMessageRecord({
      messageId: message.id,
      values: {
        content: UNSENT_MESSAGE_TEXT,
        product_id: null,
      },
    })

    const enrichedMessage = await enrichMessage(updatedRow)
    replaceMessage({
      ...message,
      ...enrichedMessage,
      content: UNSENT_MESSAGE_TEXT,
      product_id: null,
      product: null,
      orderProduct: null,
      orderProductId: null,
      __edited: false,
    })

    if (editingMessageId.value === message.id) {
      cancelEditingMessage()
    }
  } catch (error: any) {
    console.error('Error unsending message:', error)
    sendError.value = error?.message || 'Unable to unsend the message right now.'
  } finally {
    isUpdatingMessage.value = false
  }
}

const loadMessages = async () => {
  if (!conversationId.value) return

  try {
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', conversationId.value)
      .order('created_at', { ascending: true })

    if (error) {
      console.error('Error loading messages:', error)
      return
    }

    if (!data) {
      messages.value = []
      return
    }

    const enhancedMessages = await Promise.all(data.map((message) => enrichMessage(message)))
    messages.value = sortMessages(enhancedMessages)
    await markConversationMessagesAsRead()
  } catch (error) {
    console.error('Unexpected error in loadMessages:', error)
  }
}

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
        const realtimeMessage = await enrichMessage(payload.new)
        appendMessage(realtimeMessage)
        void scrollToBottom('smooth')

        if (payload.new.receiver_id === userId.value) {
          await markMessageAsRead(payload.new.id)
        }
      },
    )
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'messages',
        filter: `conversation_id=eq.${conversationId.value}`,
      },
      async (payload) => {
        const realtimeMessage = await enrichMessage(payload.new)
        replaceMessage(realtimeMessage)
      },
    )
    .on(
      'postgres_changes',
      {
        event: 'DELETE',
        schema: 'public',
        table: 'messages',
        filter: `conversation_id=eq.${conversationId.value}`,
      },
      (payload) => {
        if (payload.old?.id) {
          removeMessage(payload.old.id)
        }
      },
    )
    .subscribe()
}

const markMessageAsRead = async (messageId: string) => {
  try {
    await supabase.from('messages').update({ is_read: true }).eq('id', messageId)
  } catch (err) {
    console.error('❌ Error marking message as read:', err)
  }
}

// ✅ FIXED: Send a regular text message with workaround for notifications trigger
const sendMessage = async () => {
  if (isEditingMessage.value) {
    await saveEditedMessage()
    return
  }

  if (sending.value || isUpdatingMessage.value) return

  sendError.value = null
  const messageContent = newMessage.value.trim()

  if (!messageContent) {
    return
  }

  sending.value = true
  let shouldClearComposer = false

  try {
    const currentUserId = await checkAuth()
    if (!currentUserId) {
      alert('Please sign in to send messages')
      router.push('/login')
      return
    }

    if (!conversationId.value || !otherUserId.value) {
      sendError.value = 'Conversation is still loading. Please try again.'
      return
    }

    const createdAt = new Date().toISOString()
    const msg = {
      conversation_id: conversationId.value,
      sender_id: currentUserId,
      receiver_id: otherUserId.value,
      content: messageContent,
      is_read: false,
      product_id: null,
      created_at: createdAt,
    }

    const { data, error } = await supabase
      .from('messages')
      .insert([
        {
          conversation_id: msg.conversation_id,
          sender_id: msg.sender_id,
          receiver_id: msg.receiver_id,
          content: msg.content,
          is_read: msg.is_read,
          created_at: msg.created_at,
        },
      ])
      .select()
      .single()

    if (error) {
      console.error('Supabase error sending message:', error)

      if (error.message.includes('notifications')) {
        const { error: simpleError } = await supabase
          .from('messages')
          .insert([
            {
              conversation_id: msg.conversation_id,
              sender_id: msg.sender_id,
              receiver_id: msg.receiver_id,
              content: msg.content,
              is_read: msg.is_read,
              product_id: null,
              created_at: msg.created_at,
            },
          ])

        if (simpleError) {
          console.error('Fallback insert also failed:', simpleError)
          sendError.value = 'Unable to send the message right now. Please try again.'
        } else {
          const manualMsg = {
            id: `temp-${Date.now()}`,
            ...msg,
            product: null,
            orderProduct: null,
            orderProductId: null,
          }
          appendMessage(manualMsg)
          await updateConversationActivity(msg.conversation_id)
          await syncMessageNotificationAfterSend({
            senderId: msg.sender_id,
            receiverId: msg.receiver_id,
            createdAt: msg.created_at,
            content: msg.content,
            isOrderMessage: false,
          })
          shouldClearComposer = true
          void scrollToBottom('smooth')
        }
      } else {
        sendError.value = error.message || 'Unable to send the message right now.'
      }
      return
    }

    if (data) {
      const enrichedMessage = await enrichMessage(data)
      appendMessage(enrichedMessage)
      await updateConversationActivity(msg.conversation_id)
      await syncMessageNotificationAfterSend({
        senderId: msg.sender_id,
        receiverId: msg.receiver_id,
        createdAt: msg.created_at,
        content: msg.content,
        isOrderMessage: false,
      })
      shouldClearComposer = true
      void scrollToBottom('smooth')
    }
  } catch (error) {
    console.error('Unexpected error sending message:', error)
    sendError.value = 'Failed to send the message. Please try again.'
  } finally {
    sending.value = false
    if (shouldClearComposer) {
      newMessage.value = ''
    }
  }
}

const sendProductMessage = async (product: any) => {
  if (!conversationId.value || !userId.value || !otherUserId.value) return

  const createdAt = new Date().toISOString()
  const msg = {
    conversation_id: conversationId.value,
    sender_id: userId.value,
    receiver_id: otherUserId.value,
    content: `Check out this product: ${product.prod_name}`,
    is_read: false,
    product_id: product.id,
    created_at: createdAt,
  }

  try {
    const { data, error } = await supabase.from('messages').insert([msg]).select('*').single()
    if (!error) {
      appendMessage({ ...data, product })
      await updateConversationActivity(msg.conversation_id)
      await syncMessageNotificationAfterSend({
        senderId: msg.sender_id,
        receiverId: msg.receiver_id,
        createdAt: msg.created_at,
        content: msg.content,
        isOrderMessage: false,
      })
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
    router.push({ name: 'product-detail', params: { id: productId } })
  } else {
    console.log('⚠️ Fallback product ID, showing product catalog')
    router.push({ name: 'productlist' })
  }
}

// ✅ ALWAYS WORKING: Get product ID for order message
const viewOrder = (orderId: string | null) => {
  if (!orderId) {
    console.warn('Unable to open order details because no order ID was found.')
    return
  }

  router.push({ name: 'order-details', params: { id: orderId } })
}

const getOrderMessageOrderId = (msg: any): string | null =>
  extractOrderIdFromContent(msg.content || '')

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
const userDisplayName = computed(() => otherUserIdentity.value.displayName)

// ✅ Get user avatar
const userAvatar = computed(() => otherUserIdentity.value.avatar)

const goBack = () => router.back()

onMounted(async () => {
  setupViewportListeners()
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
    await nextTick()
    await scrollToBottom('auto')
  }
})

onUnmounted(() => {
  if (subscription) supabase.removeChannel(subscription)
  if (timeUpdateInterval) clearInterval(timeUpdateInterval)
  viewportCleanup?.()
})
</script>

<template>
  <v-app class="chat-page" :style="chatViewportStyle">
    <v-app-bar class="chat-app-bar" flat color="primary" dark>
      <v-btn icon @click="goBack" class="back-btn">
        <v-icon>mdi-arrow-left</v-icon>
      </v-btn>

      <div class="user-info">
        <v-avatar size="38" class="user-avatar">
          <v-img :src="userAvatar" :alt="userDisplayName" />
        </v-avatar>
        <div class="user-details">
          <v-toolbar-title class="user-name">{{ userDisplayName }}</v-toolbar-title>
        </div>
      </div>
    </v-app-bar>

    <v-main class="chat-main">
      <section class="chat-shell">
        <div ref="chatScrollEl" class="chat-container">
          <div v-if="loading" class="loading-state">
            <v-progress-circular indeterminate color="primary" />
            <p>Loading messages...</p>
          </div>

          <div v-else-if="messages.length === 0" class="empty-state">
            <v-icon size="64" color="grey-lighten-1">mdi-chat-outline</v-icon>
            <p class="text-caption mt-2">No messages yet. Start the conversation!</p>
          </div>

          <div v-else class="messages-list">
            <div
              v-for="msg in messages"
              :key="msg.id"
              :class="['message-row', isOwnMessage(msg) ? 'me' : 'other']"
            >
              <div v-if="isOrderChatMessage(msg.content || '')" class="order-notification">
                <div class="notification-header">
                  <v-icon color="green" size="18">mdi-cart-outline</v-icon>
                  <span class="notification-title">New order received</span>
                </div>

                <div class="notification-content">
                  {{ formatOrderMessageContent(msg) }}
                </div>

                <div class="order-action-buttons">
                  <v-btn
                    color="primary"
                    variant="outlined"
                    size="small"
                    class="view-product-btn"
                    @click="viewOrder(getOrderMessageOrderId(msg))"
                    :disabled="!getOrderMessageOrderId(msg)"
                  >
                    <v-icon start size="16">mdi-eye-outline</v-icon>
                    View Order
                  </v-btn>
                </div>

                <div class="message-meta">
                  <span class="time">{{ formatMessageTime(msg.created_at) }}</span>
                </div>
              </div>

              <div v-else-if="msg.product_id && msg.product" class="product-message">
                <div class="product-card" @click="viewProduct(msg.product.id)">
                  <v-img
                    :src="getProductImage(msg.product)"
                    :alt="msg.product.prod_name"
                    class="product-image"
                    cover
                  />

                  <div class="product-info">
                    <div class="product-name">{{ msg.product.prod_name }}</div>
                    <div class="product-price">PHP {{ formatPrice(msg.product.price) }}</div>
                    <div v-if="msg.product.shop" class="product-shop">
                      {{ msg.product.shop.business_name }}
                    </div>
                    <div v-if="msg.product.has_varieties" class="varieties-indicator">
                      <v-chip size="x-small" color="primary" variant="outlined">
                        <v-icon start size="14">mdi-palette-outline</v-icon>
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
                    class="view-btn"
                    @click="viewProduct(msg.product.id)"
                  >
                    <v-icon start size="16">mdi-eye-outline</v-icon>
                    View Product
                  </v-btn>
                </div>

                <div
                  v-if="msg.content && !msg.content.startsWith('Check out this product:')"
                  class="message-content"
                >
                  {{ msg.content }}
                </div>

                <div class="message-meta">
                  <span class="time">{{ formatMessageTime(msg.created_at) }}</span>
                  <span v-if="isEditedMessage(msg)" class="edited-label">Edited</span>
                  <v-menu v-if="shouldShowMessageActions(msg)" location="top end">
                    <template #activator="{ props }">
                      <v-btn
                        v-bind="props"
                        icon
                        variant="text"
                        size="x-small"
                        class="message-action-trigger"
                      >
                        <v-icon size="16">mdi-dots-horizontal</v-icon>
                      </v-btn>
                    </template>

                    <v-list density="compact" class="message-action-menu">
                      <v-list-item
                        v-if="canEditMessage(msg)"
                        prepend-icon="mdi-pencil-outline"
                        title="Edit message"
                        @click="startEditingMessage(msg)"
                      />
                      <v-list-item
                        v-if="canUnsendMessage(msg)"
                        prepend-icon="mdi-delete-outline"
                        title="Unsend message"
                        @click="unsendMessage(msg)"
                      />
                    </v-list>
                  </v-menu>
                </div>
              </div>

              <div v-else :class="['bubble', { 'is-unsent': isUnsentMessage(msg) }]">
                <div :class="['message-text', { 'is-unsent-text': isUnsentMessage(msg) }]">
                  {{ msg.content }}
                </div>

                <div class="message-meta">
                  <span class="time">{{ formatMessageTime(msg.created_at) }}</span>
                  <span v-if="isEditedMessage(msg)" class="edited-label">Edited</span>
                  <v-menu v-if="shouldShowMessageActions(msg)" location="top end">
                    <template #activator="{ props }">
                      <v-btn
                        v-bind="props"
                        icon
                        variant="text"
                        size="x-small"
                        class="message-action-trigger"
                      >
                        <v-icon size="16">mdi-dots-horizontal</v-icon>
                      </v-btn>
                    </template>

                    <v-list density="compact" class="message-action-menu">
                      <v-list-item
                        v-if="canEditMessage(msg)"
                        prepend-icon="mdi-pencil-outline"
                        title="Edit message"
                        @click="startEditingMessage(msg)"
                      />
                      <v-list-item
                        v-if="canUnsendMessage(msg)"
                        prepend-icon="mdi-delete-outline"
                        title="Unsend message"
                        @click="unsendMessage(msg)"
                      />
                    </v-list>
                  </v-menu>
                </div>
              </div>
            </div>

            <div ref="messagesEndEl" class="messages-end" aria-hidden="true" />
          </div>
        </div>

        <div class="chat-footer">
          <div v-if="isEditingMessage" class="composer-mode">
            <div class="composer-mode-copy">
              <span class="composer-mode-label">Editing message</span>
              <span class="composer-mode-text">{{ editingTargetMessage?.content }}</span>
            </div>

            <v-btn variant="text" size="small" @click="cancelEditingMessage">Cancel</v-btn>
          </div>

          <div class="input-container">
            <v-textarea
              ref="composerInputEl"
              v-model="newMessage"
              variant="outlined"
              rows="1"
              max-rows="5"
              auto-grow
              no-resize
              hide-details
              class="message-input"
              :placeholder="isEditingMessage ? 'Update your message...' : 'Type a message...'"
              :disabled="loading || sending || isUpdatingMessage"
              @keydown.enter.exact.prevent="handleComposerEnter"
              @focus="handleComposerFocus"
            >
              <template #prepend-inner>
                <v-icon color="grey-darken-1" size="20">
                  {{ isEditingMessage ? 'mdi-pencil-outline' : 'mdi-message-text-outline' }}
                </v-icon>
              </template>
            </v-textarea>

            <v-btn
              icon
              color="primary"
              class="send-btn"
              :disabled="!newMessage.trim() || loading || sending || isUpdatingMessage"
              :loading="sending || isUpdatingMessage"
              @click="sendMessage"
            >
              <v-icon>{{ isEditingMessage ? 'mdi-check' : 'mdi-send' }}</v-icon>
            </v-btn>
          </div>

          <p v-if="sendError" class="composer-error">{{ sendError }}</p>
        </div>
      </section>
    </v-main>
  </v-app>
</template>

<style scoped>
.chat-page {
  min-height: var(--chat-viewport-height, 100dvh);
  background:
    radial-gradient(circle at top, rgba(63, 131, 199, 0.14), transparent 38%),
    linear-gradient(180deg, #eef4f9 0%, #f8fafc 100%);
  --chat-safe-top: env(safe-area-inset-top, 0px);
  --chat-safe-right: env(safe-area-inset-right, 0px);
  --chat-safe-bottom: env(safe-area-inset-bottom, 0px);
  --chat-safe-left: env(safe-area-inset-left, 0px);
  --chat-header-height: calc(64px + var(--chat-safe-top));
}

.chat-page :deep(.v-application__wrap) {
  min-height: inherit;
  background: transparent;
}

.chat-app-bar {
  position: fixed !important;
  top: 0;
  left: 0;
  right: 0;
  z-index: 20;
  padding-top: var(--chat-safe-top);
  min-height: var(--chat-header-height) !important;
  height: var(--chat-header-height) !important;
  background: linear-gradient(135deg, #3f83c7, #295f8d) !important;
  box-shadow: 0 14px 36px rgba(20, 44, 73, 0.18);
}

.chat-app-bar :deep(.v-toolbar__content) {
  height: 64px !important;
  padding: 0 max(12px, var(--chat-safe-right)) 0 max(8px, var(--chat-safe-left));
  gap: 8px;
  align-items: center;
}

.back-btn {
  flex-shrink: 0;
}

.user-info {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
  flex: 1;
  padding: 4px 8px;
}

.user-avatar {
  border: 2px solid rgba(255, 255, 255, 0.24);
  flex-shrink: 0;
}

.user-details {
  min-width: 0;
}

.user-name {
  font-size: 1rem !important;
  font-weight: 700 !important;
  letter-spacing: -0.01em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.chat-main {
  height: var(--chat-viewport-height, 100dvh);
  padding-top: var(--chat-header-height);
  overflow: hidden;
}

.chat-shell {
  height: calc(var(--chat-viewport-height, 100dvh) - var(--chat-header-height));
  display: flex;
  flex-direction: column;
}

.chat-container {
  flex: 1;
  overflow-y: auto;
  padding:
    18px
    max(16px, var(--chat-safe-right))
    16px
    max(16px, var(--chat-safe-left));
  overscroll-behavior: contain;
  scroll-padding-bottom: 24px;
}

.messages-list {
  min-height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  gap: 12px;
}

.message-row {
  display: flex;
}

.message-row.me {
  justify-content: flex-end;
}

.message-row.other {
  justify-content: flex-start;
}

.bubble,
.product-message,
.order-notification {
  max-width: min(100%, 360px);
}

.bubble {
  padding: 12px 14px;
  border-radius: 22px;
  word-break: break-word;
  box-shadow: 0 10px 26px rgba(15, 23, 42, 0.06);
}

.message-row.me .bubble {
  background: linear-gradient(135deg, #3f83c7, #2563eb);
  color: white;
  border-bottom-right-radius: 8px;
}

.message-row.other .bubble {
  background: rgba(255, 255, 255, 0.96);
  color: #1f2937;
  border: 1px solid rgba(148, 163, 184, 0.12);
  border-bottom-left-radius: 8px;
}

.bubble.is-unsent {
  background: rgba(226, 232, 240, 0.9);
  color: #475569;
  box-shadow: none;
}

.message-text {
  font-size: 0.94rem;
  line-height: 1.45;
  white-space: pre-wrap;
}

.message-text.is-unsent-text {
  font-style: italic;
}

.product-message {
  background: rgba(255, 255, 255, 0.98);
  border-radius: 20px;
  overflow: hidden;
  border: 1px solid rgba(148, 163, 184, 0.14);
  box-shadow: 0 14px 30px rgba(15, 23, 42, 0.08);
}

.product-card {
  display: flex;
  gap: 12px;
  padding: 12px;
  cursor: pointer;
}

.product-image {
  width: 84px;
  height: 84px;
  border-radius: 14px;
  flex-shrink: 0;
}

.product-info {
  min-width: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.product-name {
  font-weight: 700;
  font-size: 0.9rem;
  line-height: 1.35;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.product-price {
  font-size: 0.84rem;
  font-weight: 700;
  color: #2563eb;
}

.product-shop {
  font-size: 0.75rem;
  color: #64748b;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.varieties-indicator {
  margin-top: 4px;
}

.action-buttons {
  display: flex;
  gap: 8px;
  padding: 0 12px 12px;
}

.view-btn,
.view-product-btn {
  flex: 1;
  height: 34px !important;
  border-radius: 12px !important;
  text-transform: none;
}

.message-content {
  padding: 12px;
  border-top: 1px solid rgba(226, 232, 240, 0.9);
  font-size: 0.88rem;
  line-height: 1.45;
  color: #334155;
  white-space: pre-wrap;
}

.order-notification {
  background: linear-gradient(180deg, rgba(240, 253, 244, 0.98), rgba(236, 252, 203, 0.88));
  border: 1px solid rgba(134, 239, 172, 0.75);
  border-radius: 20px;
  padding: 14px;
  box-shadow: 0 14px 30px rgba(34, 197, 94, 0.1);
}

.notification-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.notification-title {
  font-size: 0.88rem;
  font-weight: 700;
  color: #166534;
}

.notification-content {
  font-size: 0.84rem;
  line-height: 1.45;
  color: #14532d;
  white-space: pre-line;
}

.order-action-buttons {
  display: flex;
  padding-top: 12px;
}

.message-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 10px;
  font-size: 0.72rem;
  color: #64748b;
}

.message-row.me .message-meta {
  justify-content: flex-end;
}

.message-row.other .message-meta {
  justify-content: flex-start;
}

.message-row.me .bubble .message-meta {
  color: rgba(255, 255, 255, 0.86);
}

.bubble.is-unsent .message-meta {
  color: #64748b;
}

.edited-label {
  font-weight: 700;
  letter-spacing: 0.01em;
}

.message-action-trigger {
  width: 26px !important;
  height: 26px !important;
  margin-right: -6px;
  color: inherit;
}

.message-action-menu {
  border-radius: 16px !important;
}

.chat-footer {
  padding:
    12px
    max(16px, var(--chat-safe-right))
    max(12px, var(--chat-safe-bottom))
    max(16px, var(--chat-safe-left));
  background: rgba(255, 255, 255, 0.96);
  backdrop-filter: blur(18px);
  border-top: 1px solid rgba(148, 163, 184, 0.14);
  box-shadow: 0 -12px 26px rgba(15, 23, 42, 0.06);
}

.composer-mode {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: min(100%, 900px);
  margin: 0 auto 10px;
  padding: 10px 14px;
  border-radius: 16px;
  background: #eff6ff;
  border: 1px solid #bfdbfe;
}

.composer-mode-copy {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.composer-mode-label {
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: #1d4ed8;
}

.composer-mode-text {
  font-size: 0.84rem;
  color: #1e3a8a;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.input-container {
  width: min(100%, 900px);
  margin: 0 auto;
  display: flex;
  align-items: flex-end;
  gap: 10px;
}

.message-input {
  flex: 1;
}

.message-input :deep(.v-field) {
  border-radius: 24px !important;
  background: #f8fafc !important;
  box-shadow: inset 0 0 0 1px rgba(148, 163, 184, 0.24);
}

.message-input :deep(.v-field--focused) {
  box-shadow:
    0 0 0 2px rgba(63, 131, 199, 0.18),
    inset 0 0 0 1px rgba(63, 131, 199, 0.4) !important;
}

.message-input :deep(.v-field__input) {
  padding-top: 12px;
  padding-bottom: 12px;
}

.message-input :deep(textarea) {
  font-size: 0.95rem;
  line-height: 1.45;
}

.send-btn {
  width: 52px !important;
  height: 52px !important;
  border-radius: 18px !important;
  background: linear-gradient(135deg, #3f83c7, #2563eb) !important;
  box-shadow: 0 10px 20px rgba(37, 99, 235, 0.24);
  flex-shrink: 0;
}

.send-btn:disabled {
  background: #bfdbfe !important;
  box-shadow: none;
}

.composer-error {
  width: min(100%, 900px);
  margin: 10px auto 0;
  font-size: 0.8rem;
  color: #b91c1c;
}

.loading-state,
.empty-state {
  min-height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 32px 16px;
  color: #64748b;
  text-align: center;
}

.messages-end {
  width: 100%;
  height: 1px;
}

.chat-container::-webkit-scrollbar {
  width: 6px;
}

.chat-container::-webkit-scrollbar-thumb {
  background: rgba(148, 163, 184, 0.8);
  border-radius: 999px;
}

.chat-container::-webkit-scrollbar-track {
  background: transparent;
}

@media (max-width: 600px) {
  .chat-page {
    --chat-header-height: calc(56px + var(--chat-safe-top));
  }

  .chat-app-bar :deep(.v-toolbar__content) {
    height: 56px !important;
    padding: 0 max(10px, var(--chat-safe-right)) 0 max(6px, var(--chat-safe-left));
  }

  .chat-container {
    padding:
      14px
      max(12px, var(--chat-safe-right))
      12px
      max(12px, var(--chat-safe-left));
  }

  .bubble {
    max-width: 88%;
    padding: 10px 12px;
  }

  .product-message,
  .order-notification {
    max-width: 100%;
  }

  .product-card {
    gap: 10px;
    padding: 10px;
  }

  .product-image {
    width: 72px;
    height: 72px;
  }

  .user-info {
    gap: 10px;
  }

  .user-name {
    font-size: 0.94rem !important;
  }

  .chat-footer {
    padding:
      10px
      max(12px, var(--chat-safe-right))
      max(10px, var(--chat-safe-bottom))
      max(12px, var(--chat-safe-left));
  }

  .composer-mode {
    padding: 9px 12px;
  }

  .send-btn {
    width: 48px !important;
    height: 48px !important;
    border-radius: 16px !important;
  }
}

@media (orientation: landscape) and (max-height: 500px) {
  .chat-page {
    --chat-safe-top: 0px;
    --chat-header-height: 56px;
  }

  .chat-app-bar {
    padding-top: 0;
  }

  .chat-app-bar :deep(.v-toolbar__content) {
    height: 56px !important;
  }

  .chat-container {
    padding-top: 12px;
  }

  .chat-footer {
    padding-top: 8px;
    padding-bottom: 8px;
  }

  .send-btn {
    width: 44px !important;
    height: 44px !important;
  }
}
</style>
