<script setup lang="js">
import { computed, ref, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useCartStore } from '@/stores/cart'
import { useMessageBadgeStore } from '@/stores/messageBadge'

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
const route = useRoute()
const router = useRouter()
const cart = useCartStore()
const messageBadgeStore = useMessageBadgeStore()

// Screen size detection
const initialWindowWidth = typeof window !== 'undefined' ? window.innerWidth : 390
const windowWidth = ref(initialWindowWidth)
const isMobile = ref(initialWindowWidth <= 768)

const checkScreenSize = () => {
  windowWidth.value = window.innerWidth
  isMobile.value = windowWidth.value <= 768
}

onMounted(() => {
  checkScreenSize()
  window.addEventListener('resize', checkScreenSize)
  messageBadgeStore.initialize()
})

onUnmounted(() => {
  window.removeEventListener('resize', checkScreenSize)
})

// v-model binding
const value = computed({
  get: () => {
    const routeEntry = Object.entries(props.routeMap).find(([, path]) => path === route.path)
    return routeEntry?.[0] || props.modelValue
  },
  set: (v) => emit('update:modelValue', v),
})

async function go(key) {
  if (!key) {
    return
  }

  emit('update:modelValue', key)
  const path = props.routeMap[key]
  if (!path || path === route.path) {
    return
  }

  try {
    await router.push(path)
  } catch (error) {
    console.warn('Bottom navigation failed:', error)
  }
}

const hasUnreadMessages = computed(() => messageBadgeStore.hasUnreadMessages)
const unreadCount = computed(() => messageBadgeStore.unreadCount)
</script>

<template>
  <!-- Responsive wrapper with dynamic classes -->
  <div class="nav-wrapper" :class="{ 'mobile': isMobile, 'desktop': !isMobile }">
    <v-bottom-navigation
      class="bot-nav"
      :height="isMobile ? '68' : '72'"
      :model-value="value"
      @update:modelValue="go"
      mode="horizontal"
      :grow="isMobile"
    >
      <!-- Home -->
      <v-btn
        :class="{ 'is-active': value === 'home' }"
        value="home"
        aria-label="Home"
        variant="text"
        :ripple="false"
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
        aria-label="Cart"
        variant="text"
        :ripple="false"
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
        aria-label="Map/Search"
        variant="text"
        :ripple="false"
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
        aria-label="Chat"
        variant="text"
        :ripple="false"
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
        aria-label="Account"
        variant="text"
        :ripple="false"
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
  min-height: 52px !important;
  margin: 0 2px;
}

.nav-btn.is-active {
  color: white !important;
  opacity: 1;
  background: rgba(255, 255, 255, 0.15) !important;
}

.nav-btn.is-active .btn-content {
  transform: none;
}

.nav-btn.is-active .v-icon {
  color: white !important;
  font-variation-settings: 'wght' 500 !important;
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
}

/* Icon styling */
.bot-nav :deep(.v-icon) {
  font-variation-settings: 'wght' 300;
  color: rgba(255, 255, 255, 0.9);
  filter: none;
}

/* Button label styling */
.btn-label {
  font-size: 11px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.85);
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

.nav-btn :deep(.v-btn__overlay) {
  display: none !important;
}

/* Improve touch targets for mobile */
@media (hover: none) and (pointer: coarse) {
  .nav-btn,
  .btn-content,
  .bot-nav :deep(.v-icon),
  .btn-label,
  .cart-badge :deep(.v-badge__badge),
  .message-badge :deep(.v-badge__badge),
  .unread-dot,
  .nav-btn.is-active .v-icon,
  .nav-btn.is-active .btn-label,
  .nav-btn.is-active .btn-content {
    transition: none !important;
    transform: none !important;
    animation: none !important;
  }

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
  .bot-nav,
  .nav-btn,
  .btn-content,
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
