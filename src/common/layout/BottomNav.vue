<script setup lang="js">
import { computed } from 'vue'
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
// Fetch cart to get the latest count
cart.fetchCart()

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
  <!-- Wrapper gives the rounded “pill” with side margins like the screenshot -->
  <div class="nav-wrapper">
    <v-bottom-navigation class="bot-nav" height="64" v-model="value" mode="shift">
      <v-btn :class="{ 'is-active': value === 'home' }" value="home" @click="go('home')" aria-label="Home"
        variant="text">
        <v-icon size="26">mdi-home-outline</v-icon>
      </v-btn>

      <v-btn :class="{ 'is-active': value === 'cart' }" value="cart" @click="go('cart')" aria-label="Cart"
        variant="text">
        <!-- dot badge to mimic the minimal white dot look -->
        <v-badge v-if="cart.count" :content="cart.count" color="red" floating>
          <v-icon size="26">mdi-cart-outline</v-icon>
        </v-badge>
        <template v-else>
          <v-icon size="26">mdi-cart-outline</v-icon>
        </template>
      </v-btn>

      <v-btn :class="{ 'is-active': value === 'map' }" value="map" @click="go('map')" aria-label="Map/Search"
        variant="text">
        <v-icon size="26">mdi-map-marker-outline</v-icon>
      </v-btn>

      <v-btn :class="{ 'is-active': value === 'chat' }" value="chat" @click="go('chat')" aria-label="Chat"
        variant="text">
        <v-icon size="26">mdi-chat-outline</v-icon>
      </v-btn>

      <v-btn :class="{ 'is-active': value === 'account' }" value="account" @click="go('account')" aria-label="Account"
        variant="text">
        <v-icon size="26">mdi-account-check-outline</v-icon>
      </v-btn>
    </v-bottom-navigation>
  </div>
</template>

<style scoped>

.v-bottom-navigation {
  box-shadow: 0 -2px 8px rgba(0, 0, 0, 0.1);
  background: #3f83c7;
}
.v-btn {
  color: rgb(0, 49, 98);
  transition: background-color 0.3s, color 0.3s;
}
.bot-nav :deep(.v-icon) {
  font-variation-settings: 'wght' 100;
  color: white;
}

</style>
