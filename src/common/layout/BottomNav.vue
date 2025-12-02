<script setup lang="js">
import { computed, ref, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useCartStore } from '@/stores/cart'

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
const cart = useCartStore()
cart.fetchCart()

// Screen size detection
const isMobile = ref(false)
const windowWidth = ref(window.innerWidth)

const checkScreenSize = () => {
  windowWidth.value = window.innerWidth
  isMobile.value = windowWidth.value <= 768
}

onMounted(() => {
  checkScreenSize()
  window.addEventListener('resize', checkScreenSize)
})

onUnmounted(() => {
  window.removeEventListener('resize', checkScreenSize)
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

      <!-- Chat -->
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
          <v-icon :size="isMobile ? 22 : 24">mdi-chat-outline</v-icon>
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
}

@media (max-width: 350px) {
  .nav-wrapper.mobile {
    padding: 3px 6px 8px;
  }

  .btn-label {
    font-size: 9px !important;
    transform: scale(0.9);
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

/* Animation for cart badge */
@keyframes pulse {
  0%, 100% {
    transform: scale(1);
  }
  50% {
    transform: scale(1.1);
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
}

/* Reduce motion for accessibility */
@media (prefers-reduced-motion: reduce) {
  .nav-btn,
  .bot-nav :deep(.v-icon),
  .btn-label,
  .cart-badge :deep(.v-badge__badge) {
    transition: none !important;
    animation: none !important;
  }
}
</style>
