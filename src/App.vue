<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useCartStore } from '@/stores/cart'
import { App as CapacitorApp } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'
import { useRoute, useRouter } from 'vue-router'

const EXIT_CONFIRM_WINDOW_MS = 2000
const ROOT_EXIT_ROUTE_NAMES = new Set(['homepage', 'login', 'admin-dashboard'])
const PUBLIC_ROUTE_NAMES = new Set([
  'login',
  'register',
  'forgot-password',
  'update-password',
  'confirm-email',
  'email-confirmed',
  'auth-callback',
  'reset-success',
])

const cart = useCartStore()
const route = useRoute()
const router = useRouter()

const showExitSnackbar = ref(false)
const currentRouteName = computed(() => String(route.name || ''))
const isExitRootRoute = computed(() => ROOT_EXIT_ROUTE_NAMES.has(currentRouteName.value))
const isAndroidNative = Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android'

let backButtonListenerHandle = null
let lastBackPressAt = 0
let exitResetTimeoutId = null

const clearExitPrompt = () => {
  showExitSnackbar.value = false
  lastBackPressAt = 0

  if (exitResetTimeoutId) {
    window.clearTimeout(exitResetTimeoutId)
    exitResetTimeoutId = null
  }
}

const armExitPrompt = () => {
  showExitSnackbar.value = true
  lastBackPressAt = Date.now()

  if (exitResetTimeoutId) {
    window.clearTimeout(exitResetTimeoutId)
  }

  exitResetTimeoutId = window.setTimeout(() => {
    clearExitPrompt()
  }, EXIT_CONFIRM_WINDOW_MS)
}

const shouldExitNow = () =>
  lastBackPressAt > 0 && Date.now() - lastBackPressAt <= EXIT_CONFIRM_WINDOW_MS

const resolveFallbackPath = () =>
  PUBLIC_ROUTE_NAMES.has(currentRouteName.value) ? '/' : '/homepage'

const handleHardwareBack = async ({ canGoBack }) => {
  if (!isAndroidNative) {
    return
  }

  if (isExitRootRoute.value) {
    if (shouldExitNow()) {
      clearExitPrompt()
      await CapacitorApp.exitApp()
      return
    }

    armExitPrompt()
    return
  }

  clearExitPrompt()

  if (canGoBack) {
    await router.back()
    return
  }

  const fallbackPath = resolveFallbackPath()

  if (route.path !== fallbackPath) {
    await router.replace(fallbackPath)
    return
  }

  armExitPrompt()
}

watch(
  () => route.fullPath,
  () => {
    clearExitPrompt()
  },
)

onMounted(async () => {
  cart.init()

  if (!isAndroidNative) {
    return
  }

  backButtonListenerHandle = await CapacitorApp.addListener('backButton', handleHardwareBack)
})

onUnmounted(() => {
  clearExitPrompt()
  void backButtonListenerHandle?.remove?.()
})
</script>

<template>
  <RouterView />

  <Teleport to="body">
    <Transition name="exit-snackbar">
      <div v-if="showExitSnackbar" class="exit-snackbar" role="status" aria-live="polite">
        Press back again to exit
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.exit-snackbar {
  position: fixed;
  left: 50%;
  bottom: calc(24px + env(safe-area-inset-bottom, 0px));
  transform: translateX(-50%);
  z-index: 9999;
  min-width: 220px;
  max-width: calc(100vw - 32px);
  padding: 12px 16px;
  border-radius: 14px;
  background: rgba(17, 24, 39, 0.94);
  color: #fff;
  text-align: center;
  font-size: 0.92rem;
  font-weight: 600;
  letter-spacing: 0.01em;
  box-shadow: 0 12px 32px rgba(15, 23, 42, 0.28);
  backdrop-filter: blur(8px);
  pointer-events: none;
}

.exit-snackbar-enter-active,
.exit-snackbar-leave-active {
  transition:
    opacity 0.18s ease,
    transform 0.18s ease;
}

.exit-snackbar-enter-from,
.exit-snackbar-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(8px);
}
</style>
