<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useCartStore } from '@/stores/cart'
import { useAuthUserStore } from '@/stores/authUser'
import { App as CapacitorApp } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'
import { useRoute, useRouter } from 'vue-router'
import { subscribeToAppRuntime } from '@/utils/appRuntime'

const EXIT_CONFIRM_WINDOW_MS = 2000
const RESUME_RECOVERY_DEBOUNCE_MS = 1200
const RESUME_ROUTE_REMOUNT_THRESHOLD_MS = 2500
const ROOT_EXIT_ROUTE_NAMES = new Set(['homepage', 'login', 'admin-dashboard'])
const ROUTE_REMOUNT_ELIGIBLE_NAMES = new Set([
  'homepage',
  'mapsearch',
  'cartview',
  'messageview',
  'notificationview',
  'profileview',
  'admin-dashboard',
  'search',
])
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
const authStore = useAuthUserStore()
const route = useRoute()
const router = useRouter()

const showExitSnackbar = ref(false)
const resumeRouteNonce = ref(0)
const currentRouteName = computed(() => String(route.name || ''))
const isExitRootRoute = computed(() => ROOT_EXIT_ROUTE_NAMES.has(currentRouteName.value))
const isAndroidNative = Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android'
const canRemountCurrentRoute = computed(
  () =>
    Boolean(route.meta?.localPullToRefresh) ||
    ROUTE_REMOUNT_ELIGIBLE_NAMES.has(currentRouteName.value),
)
const routerViewKey = computed(() => `${route.fullPath}::${resumeRouteNonce.value}`)

let backButtonListenerHandle = null
let unsubscribeAppRuntime = null
let lastBackPressAt = 0
let lastResumeRecoveryAt = 0
let exitResetTimeoutId = null
let resumeRecoveryReleaseTimeoutId = null
let resumeRecoveryInFlight = false

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

const clearResumeRecoveryTimer = () => {
  if (resumeRecoveryReleaseTimeoutId) {
    window.clearTimeout(resumeRecoveryReleaseTimeoutId)
    resumeRecoveryReleaseTimeoutId = null
  }
}

const scheduleRecoveryRelease = () => {
  clearResumeRecoveryTimer()

  resumeRecoveryReleaseTimeoutId = window.setTimeout(() => {
    resumeRecoveryInFlight = false
    resumeRecoveryReleaseTimeoutId = null
  }, 280)
}

const dispatchRecoveryResize = () => {
  const fireResize = () => {
    window.dispatchEvent(new Event('resize'))
  }

  fireResize()
  window.setTimeout(fireResize, 80)
  window.setTimeout(fireResize, 220)
}

const normalizeRecoverableDomState = () => {
  const activeElement = document.activeElement
  if (activeElement && typeof activeElement.blur === 'function') {
    activeElement.blur()
  }

  document.body.classList.remove('camera-active')
  document.body.style.pointerEvents = ''
  document.documentElement.style.pointerEvents = ''

  const appRoot = document.getElementById('app')
  if (appRoot instanceof HTMLElement) {
    appRoot.style.pointerEvents = ''
  }
}

const syncRouteAccessAfterResume = async () => {
  if (!route.meta?.requiresAuth && !route.meta?.requiresAdmin) {
    return true
  }

  const hydrated = await authStore.hydrateFromSession({ force: true })

  if (!hydrated || !authStore.isLoggedIn) {
    await router.replace('/')
    return false
  }

  if (route.meta?.requiresAdmin && !authStore.isAdmin) {
    await router.replace('/homepage')
    return false
  }

  return true
}

const shouldRemountCurrentRoute = ({ inactiveForMs = 0 } = {}) =>
  canRemountCurrentRoute.value && inactiveForMs >= RESUME_ROUTE_REMOUNT_THRESHOLD_MS

const handleAppRuntimeEvent = async (event) => {
  if (event.type === 'inactive') {
    clearExitPrompt()
    return
  }

  if (!isAndroidNative || !event.isAndroidNative) {
    return
  }

  const eventTimestamp = event.timestamp || Date.now()
  if (resumeRecoveryInFlight || eventTimestamp - lastResumeRecoveryAt < RESUME_RECOVERY_DEBOUNCE_MS) {
    return
  }

  resumeRecoveryInFlight = true
  lastResumeRecoveryAt = eventTimestamp
  clearExitPrompt()

  try {
    normalizeRecoverableDomState()

    const canContinue = await syncRouteAccessAfterResume()
    await nextTick()
    dispatchRecoveryResize()

    if (!canContinue) {
      return
    }

    if (shouldRemountCurrentRoute(event)) {
      resumeRouteNonce.value += 1
      await nextTick()
      dispatchRecoveryResize()
    }
  } catch (error) {
    console.warn('Global app resume recovery failed:', error)
  } finally {
    scheduleRecoveryRelease()
  }
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

  unsubscribeAppRuntime = subscribeToAppRuntime((event) => {
    void handleAppRuntimeEvent(event)
  })

  backButtonListenerHandle = await CapacitorApp.addListener('backButton', handleHardwareBack)
})

onUnmounted(() => {
  clearExitPrompt()
  clearResumeRecoveryTimer()

  if (unsubscribeAppRuntime) {
    unsubscribeAppRuntime()
    unsubscribeAppRuntime = null
  }

  void backButtonListenerHandle?.remove?.()
})
</script>

<template>
  <RouterView :key="routerViewKey" />

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
