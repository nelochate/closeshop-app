<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useCartStore } from '@/stores/cart'
import { useAuthUserStore } from '@/stores/authUser'
import { App as CapacitorApp } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'
import { useRoute, useRouter } from 'vue-router'
import { subscribeToAppRuntime } from '@/utils/appRuntime'
import { initializeSafeAreaController, queueSafeAreaSync } from '@/utils/safeAreaController'
import { syncGlobalStatusBar } from '@/utils/statusBar'

const EXIT_CONFIRM_WINDOW_MS = 2000
const RESUME_RECOVERY_DEBOUNCE_MS = 1200
const RESUME_ROUTE_REMOUNT_THRESHOLD_MS = 2500
const ROOT_EXIT_ROUTE_NAMES = new Set(['homepage', 'login', 'admin-dashboard'])
const STATUS_BAR_DARK_BACKDROP_EXCLUDED_ROUTE_NAMES = new Set([
  'homepage',
  'cartview',
  'mapsearch',
  'messageview',
  'profileview',
  'login',
  'search',
  'register',
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
const showAndroidNavigationBackdrop = computed(() => isAndroidNative)
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
let detachSafeAreaController = null

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
  detachSafeAreaController = initializeSafeAreaController()
  queueSafeAreaSync()

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
  detachSafeAreaController?.()
  detachSafeAreaController = null

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
      v-if="showAndroidNavigationBackdrop"
      class="navigation-bar-backdrop"
      aria-hidden="true"
    ></div>

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
.navigation-bar-backdrop {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  height: var(
    --app-navigation-backdrop-height-active,
    var(--app-navigation-backdrop-height, var(--app-android-nav-bar-height, 0px))
  );
  background: #000;
  z-index: 900;
  pointer-events: none;
}

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
  --app-safe-area-top: var(--safe-area-inset-top, env(safe-area-inset-top, 0px));
  --app-safe-area-right: var(--safe-area-inset-right, env(safe-area-inset-right, 0px));
  --app-safe-area-bottom: var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px));
  --app-safe-area-left: var(--safe-area-inset-left, env(safe-area-inset-left, 0px));
  --app-safe-area-bottom-runtime: 0px;
  --app-android-bottom-clearance: 0px;
  --app-android-nav-bar-height: 0px;
  --app-android-nav-extra-space: 0px;
  --app-bottom-nav-lift: 0px;
  --app-navigation-backdrop-height: 0px;
  --app-keyboard-inset-bottom: 0px;
  --app-keyboard-open: 0;
  --app-bottom-safe-space: max(
    var(--app-safe-area-bottom),
    var(--app-safe-area-bottom-runtime),
    var(--app-android-bottom-clearance)
  );
  --app-bottom-safe-space-active: var(--app-bottom-safe-space);
  --app-bottom-nav-lift-active: var(--app-bottom-nav-lift);
  --app-android-nav-extra-space-active: var(--app-android-nav-extra-space);
  --app-navigation-backdrop-height-active: var(--app-navigation-backdrop-height);
}
</style>
