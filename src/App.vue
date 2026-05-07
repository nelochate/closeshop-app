<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useCartStore } from '@/stores/cart'
import { useAuthUserStore } from '@/stores/authUser'
import { App as CapacitorApp } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'
import { useRoute, useRouter } from 'vue-router'
import { subscribeToAppRuntime } from '@/utils/appRuntime'
import { syncGlobalStatusBar } from '@/utils/statusBar'

const EXIT_CONFIRM_WINDOW_MS = 2000
const RESUME_RECOVERY_DEBOUNCE_MS = 1200
const RESUME_ROUTE_REMOUNT_THRESHOLD_MS = 2500
const MAX_VIEWPORT_SAFE_INSET_PX = 48
const KEYBOARD_INSET_THRESHOLD_PX = 120
const DEFAULT_ANDROID_BOTTOM_CLEARANCE_PX = 16
const ROOT_EXIT_ROUTE_NAMES = new Set(['homepage', 'login', 'admin-dashboard'])
const STATUS_BAR_DARK_BACKDROP_EXCLUDED_ROUTE_NAMES = new Set([
  'homepage',
  'cartview',
  'mapsearch',
  'messageview',
  'profileview',
])
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
const showDarkStatusBarBackdrop = computed(
  () =>
    isAndroidNative &&
    !STATUS_BAR_DARK_BACKDROP_EXCLUDED_ROUTE_NAMES.has(currentRouteName.value),
)
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
let safeAreaSyncFrameId = 0

const clampInset = (value) =>
  Math.max(0, Math.min(MAX_VIEWPORT_SAFE_INSET_PX, Math.round(Number(value) || 0)))

const getViewportBottomInset = () => {
  const viewport = window.visualViewport
  if (!viewport) {
    return 0
  }

  const layoutHeight = Math.max(window.innerHeight || 0, document.documentElement?.clientHeight || 0)
  const rawInset = Math.max(layoutHeight - (viewport.height + viewport.offsetTop), 0)

  // Ignore keyboard-sized viewport reductions so the bottom nav does not jump while typing.
  if (rawInset >= KEYBOARD_INSET_THRESHOLD_PX) {
    return 0
  }

  return clampInset(rawInset)
}

const applySafeAreaVariables = () => {
  const root = document.documentElement
  const body = document.body
  if (!root || !body) {
    return
  }

  const viewportBottomInset = getViewportBottomInset()
  const androidBottomClearance = isAndroidNative
    ? Math.max(viewportBottomInset, DEFAULT_ANDROID_BOTTOM_CLEARANCE_PX)
    : 0

  root.classList.toggle('app-android-native', isAndroidNative)
  body.classList.toggle('app-android-native', isAndroidNative)
  root.style.setProperty('--app-safe-area-bottom-runtime', `${viewportBottomInset}px`)
  root.style.setProperty('--app-android-bottom-clearance', `${androidBottomClearance}px`)
}

const queueSafeAreaSync = () => {
  if (safeAreaSyncFrameId) {
    return
  }

  safeAreaSyncFrameId = window.requestAnimationFrame(() => {
    safeAreaSyncFrameId = 0
    applySafeAreaVariables()
  })
}

const syncRouteStatusBar = (options) => syncGlobalStatusBar(route, options)

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
    queueSafeAreaSync()
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
    queueSafeAreaSync()
    await syncRouteStatusBar()

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
    void syncRouteStatusBar()
  },
)

onMounted(async () => {
  cart.init()
  void syncRouteStatusBar()
  queueSafeAreaSync()
  window.addEventListener('resize', queueSafeAreaSync, { passive: true })
  window.addEventListener('orientationchange', queueSafeAreaSync, { passive: true })
  window.visualViewport?.addEventListener('resize', queueSafeAreaSync)
  window.visualViewport?.addEventListener('scroll', queueSafeAreaSync)

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
  if (safeAreaSyncFrameId) {
    window.cancelAnimationFrame(safeAreaSyncFrameId)
    safeAreaSyncFrameId = 0
  }
  window.removeEventListener('resize', queueSafeAreaSync)
  window.removeEventListener('orientationchange', queueSafeAreaSync)
  window.visualViewport?.removeEventListener('resize', queueSafeAreaSync)
  window.visualViewport?.removeEventListener('scroll', queueSafeAreaSync)

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
    <div
      v-if="showDarkStatusBarBackdrop"
      class="status-bar-backdrop"
      aria-hidden="true"
    ></div>

    <Transition name="exit-snackbar">
      <div v-if="showExitSnackbar" class="exit-snackbar" role="status" aria-live="polite">
        Press back again to exit
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.status-bar-backdrop {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: var(--app-safe-area-top, env(safe-area-inset-top, 0px));
  background: #141618;
  z-index: 3000;
  pointer-events: none;
}

.exit-snackbar {
  position: fixed;
  left: 50%;
  bottom: calc(24px + var(--app-bottom-safe-space, env(safe-area-inset-bottom, 0px)));
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

:global(body.camera-active) .status-bar-backdrop {
  display: none;
}
</style>

<style>
:root {
  --app-safe-area-top: env(safe-area-inset-top, 0px);
  --app-safe-area-right: env(safe-area-inset-right, 0px);
  --app-safe-area-bottom: env(safe-area-inset-bottom, 0px);
  --app-safe-area-left: env(safe-area-inset-left, 0px);
  --app-safe-area-bottom-runtime: 0px;
  --app-android-bottom-clearance: 0px;
  --app-bottom-safe-space: max(
    var(--app-safe-area-bottom),
    var(--app-safe-area-bottom-runtime),
    var(--app-android-bottom-clearance)
  );
}
</style>
