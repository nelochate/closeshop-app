<script setup lang="js">
import { computed, ref, onMounted, onUnmounted, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useCartStore } from '@/stores/cart'
import { supabase } from '@/utils/supabase'

const props = defineProps({
  /** v-model for the active tab */
  modelValue: { type: String, default: 'home' },
  /** Override routes if needed on some pages */
  routeMap: {
    type: Object,
    default: () => ({
      home: '/homepage',
      cart: '/cartview',
      map: '/mapsearch',
      chat: '/messageview',
      account: '/profileview',
    }),
  },
})

const emit = defineEmits(['update:modelValue'])
const router = useRouter()
const route = useRoute()
const cart = useCartStore()
cart.fetchCart()

// Screen size detection
const isMobile = ref(false)
const windowWidth = ref(window.innerWidth)

// Message notification state
const hasUnreadMessages = ref(false)
const unreadCount = ref(0)
let messagesSubscription = null

const checkScreenSize = () => {
  windowWidth.value = window.innerWidth
  isMobile.value = windowWidth.value <= 768
}

// ✅ Mark all messages as read when user views chat
const markAllMessagesAsRead = async () => {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: conversations, error: convError } = await supabase
      .from('conversations')
      .select('id')
      .or(`user1.eq.${user.id},user2.eq.${user.id}`)

    if (convError || !conversations || conversations.length === 0) return

    const conversationIds = conversations.map(c => c.id)
    
    // Mark all unread messages as read
    const { error: updateError } = await supabase
      .from('messages')
      .update({ is_read: true })
      .in('conversation_id', conversationIds)
      .eq('receiver_id', user.id)
      .eq('is_read', false)

    if (updateError) {
      console.error('Error marking messages as read:', updateError)
      return
    }

    // Update local state
    unreadCount.value = 0
    hasUnreadMessages.value = false
    
  } catch (error) {
    console.error('Error in markAllMessagesAsRead:', error)
  }
}

// ✅ Fetch unread messages count
const fetchUnreadMessages = async () => {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: conversations, error: convError } = await supabase
      .from('conversations')
      .select('id')
      .or(`user1.eq.${user.id},user2.eq.${user.id}`)

    if (convError) {
      console.error('Error fetching conversations:', convError)
      return
    }

    if (!conversations || conversations.length === 0) {
      hasUnreadMessages.value = false
      unreadCount.value = 0
      return
    }

    const conversationIds = conversations.map(c => c.id)
    
    const { data: messages, error: msgError } = await supabase
      .from('messages')
      .select('id, is_read')
      .in('conversation_id', conversationIds)
      .eq('receiver_id', user.id)
      .eq('is_read', false)

    if (msgError) {
      console.error('Error fetching unread messages:', msgError)
      return
    }

    unreadCount.value = messages?.length || 0
    hasUnreadMessages.value = unreadCount.value > 0
    
  } catch (error) {
    console.error('Error in fetchUnreadMessages:', error)
  }
}

// ✅ Subscribe to real-time message updates
const subscribeToMessages = async () => {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    // Unsubscribe from previous subscription if exists
    if (messagesSubscription) {
      supabase.removeChannel(messagesSubscription)
    }

    // Get user's conversations
    const { data: conversations, error: convError } = await supabase
      .from('conversations')
      .select('id')
      .or(`user1.eq.${user.id},user2.eq.${user.id}`)

    if (convError || !conversations) return

    const conversationIds = conversations.map(c => c.id)
    
    if (conversationIds.length === 0) return

    // Subscribe to new messages in all conversations
    messagesSubscription = supabase
      .channel('unread-messages-channel')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=in.(${conversationIds.join(',')})`,
        },
        (payload) => {
          // Check if the new message is for the current user
          if (payload.new.receiver_id === user.id && !payload.new.is_read) {
            unreadCount.value += 1
            hasUnreadMessages.value = true
            
            // Optional: Show a small notification
            if (props.modelValue !== 'chat') {
              console.log('New message received!')
            }
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=in.(${conversationIds.join(',')})`,
        },
        (payload) => {
          // If a message was marked as read
          if (payload.new.is_read && payload.old.is_read === false) {
            unreadCount.value = Math.max(0, unreadCount.value - 1)
            hasUnreadMessages.value = unreadCount.value > 0
          }
        }
      )
      .subscribe()

  } catch (error) {
    console.error('Error subscribing to messages:', error)
  }
}

// ✅ Check auth status and set up subscriptions
const setupMessageNotifications = async () => {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      await fetchUnreadMessages()
      await subscribeToMessages()
      
      // Also set up auth state change listener
      supabase.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_IN') {
          fetchUnreadMessages()
          subscribeToMessages()
        }
        if (event === 'SIGNED_OUT') {
          hasUnreadMessages.value = false
          unreadCount.value = 0
          if (messagesSubscription) {
            supabase.removeChannel(messagesSubscription)
            messagesSubscription = null
          }
        }
      })
    }
  } catch (error) {
    console.error('Error setting up message notifications:', error)
  }
}

onMounted(() => {
  checkScreenSize()
  window.addEventListener('resize', checkScreenSize)
  
  // Set up message notifications
  setupMessageNotifications()
})

onUnmounted(() => {
  window.removeEventListener('resize', checkScreenSize)
  
  // Clean up subscription
  if (messagesSubscription) {
    supabase.removeChannel(messagesSubscription)
    messagesSubscription = null
  }
})

// Watch for route changes to mark messages as read when viewing chat
watch(() => route.path, (newPath) => {
  // Check if we're on a chat-related page
  if (newPath.includes('/messageview') || newPath.includes('/chat/')) {
    markAllMessagesAsRead()
  }
})

// v-model binding
const value = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
})

function go(key) {
  emit('update:modelValue', key)
  const path = props.routeMap[key]
  if (path) router.push(path)
  
  // If going to chat view, mark all messages as read
  if (key === 'chat') {
    markAllMessagesAsRead()
  }
}
</script>

<template>
  <!-- Responsive wrapper with dynamic classes -->
  <div class="nav-wrapper" :class="{ 'mobile': isMobile, 'desktop': !isMobile }">
    <v-bottom-navigation
      class="bot-nav"
      :height="isMobile ? '68' : '72'"
      v-model="value"
      mode="shift"
      :grow="isMobile"
    >
      <!-- Home -->
      <v-btn
        :class="{ 'is-active': value === 'home' }"
        value="home"
        @click="go('home')"
        aria-label="Home"
        variant="text"
        class="nav-btn"
        :min-width="isMobile ? '56' : '64'"
      >
        <div class="btn-content">
          <v-icon :size="isMobile ? 22 : 24">mdi-home-outline</v-icon>
          <span class="btn-label">Home</span>
        </div>
      </v-btn>

      <!-- Cart -->
      <v-btn
        :class="{ 'is-active': value === 'cart' }"
        value="cart"
        @click="go('cart')"
        aria-label="Cart"
        variant="text"
        class="nav-btn"
        :min-width="isMobile ? '56' : '64'"
      >
        <div class="btn-content">
          <v-badge
            v-if="cart.count"
            :content="cart.count"
            color="white"
            :max="99"
            :size="isMobile ? '18' : '20'"
            :class="['cart-badge', { 'small-badge': isMobile }]"
            bordered
          >
            <v-icon :size="isMobile ? 22 : 24">mdi-cart-outline</v-icon>
          </v-badge>
          <template v-else>
            <v-icon :size="isMobile ? 22 : 24">mdi-cart-outline</v-icon>
          </template>
          <span class="btn-label">Cart</span>
        </div>
      </v-btn>

      <!-- Map -->
      <v-btn
        :class="{ 'is-active': value === 'map' }"
        value="map"
        @click="go('map')"
        aria-label="Map/Search"
        variant="text"
        class="nav-btn"
        :min-width="isMobile ? '56' : '64'"
      >
        <div class="btn-content">
          <v-icon :size="isMobile ? 22 : 24">mdi-map-marker-outline</v-icon>
          <span class="btn-label">Map</span>
        </div>
      </v-btn>

      <!-- Chat - WITH NOTIFICATION INDICATOR -->
      <v-btn
        :class="{ 'is-active': value === 'chat' }"
        value="chat"
        @click="go('chat')"
        aria-label="Chat"
        variant="text"
        class="nav-btn"
        :min-width="isMobile ? '56' : '64'"
      >
        <div class="btn-content">
          <div class="message-icon-wrapper">
            <!-- Red dot for unread messages -->
            <div 
              v-if="hasUnreadMessages && unreadCount === 0" 
              class="unread-dot"
              :class="{ 'small-dot': isMobile }"
            ></div>
            
            <!-- Badge with count for multiple messages -->
            <v-badge
              v-if="hasUnreadMessages && unreadCount > 0"
              :content="unreadCount"
              :max="99"
              color="white"
              :size="isMobile ? '18' : '20'"
              :class="['message-badge', { 'small-badge': isMobile }]"
              bordered
            >
              <v-icon :size="isMobile ? 22 : 24">mdi-chat-outline</v-icon>
            </v-badge>
            
            <!-- Normal icon when no messages -->
            <template v-else>
              <v-icon :size="isMobile ? 22 : 24">mdi-chat-outline</v-icon>
            </template>
          </div>
          <span class="btn-label">Chat</span>
        </div>
      </v-btn>

      <!-- Account -->
      <v-btn
        :class="{ 'is-active': value === 'account' }"
        value="account"
        @click="go('account')"
        aria-label="Account"
        variant="text"
        class="nav-btn"
        :min-width="isMobile ? '56' : '64'"
      >
        <div class="btn-content">
          <v-icon :size="isMobile ? 22 : 24">mdi-account-check-outline</v-icon>
          <span class="btn-label">Me</span>
        </div>
      </v-btn>
    </v-bottom-navigation>
  </div>
</template>

<style scoped>
/* Base responsive container */
.nav-wrapper {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 1000;
  padding: 8px 12px 16px;
  background: transparent;
}

/* Desktop styles (default) */
.nav-wrapper.desktop {
  max-width: 480px;
  margin: 0 auto;
}

/* Mobile styles */
.nav-wrapper.mobile {
  padding: 6px 10px 12px;
}

/* Bottom Navigation Container */
.bot-nav {
  box-shadow:
    0 -2px 12px rgba(0, 0, 0, 0.08),
    0 4px 24px rgba(63, 131, 199, 0.15),
    inset 0 1px 0 rgba(255, 255, 255, 0.2) !important;
  background: linear-gradient(135deg, #3f83c7 0%, #2a6ab0 100%) !important;
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  overflow: hidden;
}

/* Message icon wrapper for positioning */
.message-icon-wrapper {
  position: relative;
  display: inline-block;
}

/* Unread message dot indicator */
.unread-dot {
  position: absolute;
  top: -2px;
  right: -2px;
  width: 10px;
  height: 10px;
  background: #ff4757;
  border: 2px solid #3f83c7;
  border-radius: 50%;
  animation: pulse 2s infinite;
  z-index: 10;
}

.unread-dot.small-dot {
  width: 8px;
  height: 8px;
  top: -1px;
  right: -1px;
}

/* Message badge styling */
.message-badge :deep(.v-badge__badge) {
  font-size: 10px;
  font-weight: 700;
  min-width: 18px;
  height: 18px;
  color: white !important;
  background: #ff4757 !important;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
  animation: pulse 2s infinite;
}

.message-badge.small-badge :deep(.v-badge__badge) {
  font-size: 9px;
  min-width: 16px;
  height: 16px;
}

/* Responsive adjustments for mobile */
@media (max-width: 380px) {
  .nav-wrapper.mobile {
    padding: 4px 8px 10px;
  }

  .btn-content {
    gap: 2px !important;
  }

  .btn-label {
    font-size: 10px !important;
  }
  
  .unread-dot {
    width: 7px;
    height: 7px;
  }
}

@media (max-width: 350px) {
  .nav-wrapper.mobile {
    padding: 3px 6px 8px;
  }

  .btn-label {
    font-size: 9px !important;
    transform: scale(0.9);
  }
  
  .unread-dot {
    width: 6px;
    height: 6px;
  }
}

/* Navigation Button Styles */
.nav-btn {
  color: rgba(255, 255, 255, 0.85) !important;
  opacity: 0.9;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  min-height: 52px !important;
  margin: 0 2px;
}

.nav-btn:hover {
  opacity: 1;
  transform: translateY(-2px);
}

.nav-btn.is-active {
  color: white !important;
  opacity: 1;
  background: rgba(255, 255, 255, 0.15) !important;
}

.nav-btn.is-active .btn-content {
  transform: translateY(-1px);
}

.nav-btn.is-active .v-icon {
  color: white !important;
  font-variation-settings: 'wght' 500 !important;
  transform: scale(1.05);
}

.nav-btn.is-active .btn-label {
  color: white !important;
  font-weight: 600 !important;
}

/* Button content layout */
.btn-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  transition: transform 0.3s ease;
}

/* Icon styling */
.bot-nav :deep(.v-icon) {
  font-variation-settings: 'wght' 300;
  color: rgba(255, 255, 255, 0.9);
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  filter: drop-shadow(0 1px 1px rgba(0, 0, 0, 0.1));
}

/* Button label styling */
.btn-label {
  font-size: 11px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.85);
  transition: all 0.3s ease;
  letter-spacing: 0.3px;
  line-height: 1;
  text-shadow: 0 1px 1px rgba(0, 0, 0, 0.1);
}

/* Cart badge styling */
.cart-badge {
  position: relative;
}

.cart-badge :deep(.v-badge__badge) {
  font-size: 10px;
  font-weight: 700;
  min-width: 18px;
  height: 18px;
  color: #fcfdff !important;
  background: rgb(251, 12, 12) !important;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.15);
  animation: pulse 2s infinite;
}

.cart-badge.small-badge :deep(.v-badge__badge) {
  font-size: 9px;
  min-width: 16px;
  height: 16px;
}

/* Safe area for notched phones */
@supports (padding-bottom: env(safe-area-inset-bottom)) {
  .nav-wrapper {
    padding-bottom: calc(16px + env(safe-area-inset-bottom));
  }

  .nav-wrapper.mobile {
    padding-bottom: calc(12px + env(safe-area-inset-bottom));
  }

  @media (max-width: 380px) {
    .nav-wrapper.mobile {
      padding-bottom: calc(10px + env(safe-area-inset-bottom));
    }
  }

  @media (max-width: 350px) {
    .nav-wrapper.mobile {
      padding-bottom: calc(8px + env(safe-area-inset-bottom));
    }
  }
}

/* Animation for badges */
@keyframes pulse {
  0%, 100% {
    transform: scale(1);
    box-shadow: 0 0 0 0 rgba(255, 71, 87, 0.7);
  }
  50% {
    transform: scale(1.1);
  }
  70% {
    box-shadow: 0 0 0 6px rgba(255, 71, 87, 0);
  }
}

/* Active state ripple effect */
.nav-btn.is-active :deep(.v-btn__overlay) {
  background: rgba(255, 255, 255, 0.1);
}

/* Improve touch targets for mobile */
@media (hover: none) and (pointer: coarse) {
  .nav-btn {
    min-height: 56px !important;
    min-width: 60px !important;
  }

  .nav-wrapper.mobile .nav-btn {
    min-height: 54px !important;
    min-width: 56px !important;
  }

  @media (max-width: 350px) {
    .nav-wrapper.mobile .nav-btn {
      min-height: 52px !important;
      min-width: 52px !important;
    }
  }
  
  /* Make badges more touch-friendly on mobile */
  .unread-dot {
    width: 12px;
    height: 12px;
  }
  
  .unread-dot.small-dot {
    width: 10px;
    height: 10px;
  }
}

/* Reduce motion for accessibility */
@media (prefers-reduced-motion: reduce) {
  .nav-btn,
  .bot-nav :deep(.v-icon),
  .btn-label,
  .cart-badge :deep(.v-badge__badge),
  .message-badge :deep(.v-badge__badge),
  .unread-dot {
    transition: none !important;
    animation: none !important;
  }
}

/* High contrast mode support */
@media (prefers-contrast: high) {
  .unread-dot {
    border: 3px solid white;
  }
  
  .cart-badge :deep(.v-badge__badge),
  .message-badge :deep(.v-badge__badge) {
    border: 2px solid white;
  }
}

/* Dark mode adjustments */
@media (prefers-color-scheme: dark) {
  .bot-nav {
    background: linear-gradient(135deg, #2a6ab0 0%, #1a4a7a 100%) !important;
  }
  
  .unread-dot {
    border-color: #2a6ab0;
  }
}
</style>