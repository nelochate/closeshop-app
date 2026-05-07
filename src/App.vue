<script setup>
import { onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { App as CapacitorApp } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'
import { StatusBar, Style } from '@capacitor/status-bar'
import PullToRefreshWrapper from '@/components/PullToRefreshWrapper.vue'
import { useCartStore } from '@/stores/cart'
import { useMessageBadgeStore } from '@/stores/messageBadge'
import { useAuthUserStore } from '@/stores/authUser'

const route = useRoute()
const router = useRouter()
const cart = useCartStore()
const messageBadge = useMessageBadgeStore()
const authStore = useAuthUserStore()

let appStateListenerHandle = null
let backButtonListenerHandle = null
let lastCartResumeSyncAt = 0
let exitToastTimerId = null

const exitToastVisible = ref(false)
const lastBackPressAt = ref(0)

const ANDROID_BACK_EXIT_WINDOW_MS = 2000
const EXIT_ROUTE_PATHS = new Set(['/homepage', '/'])
const ANDROID_STATUS_BAR_COLOR = '#295f8d'

const resetBackExitPrompt = () => {
  if (exitToastTimerId) {
    window.clearTimeout(exitToastTimerId)
    exitToastTimerId = null
  }

  lastBackPressAt.value = 0
  exitToastVisible.value = false
}

const syncCartAfterResume = async ({ force = false } = {}) => {
  const now = Date.now()
  if (now - lastCartResumeSyncAt < 1200) {
    return
  }

  lastCartResumeSyncAt = now
  await cart.initialize()
  await cart.ensureFresh({ force, silent: true })
}

const handleWindowFocus = () => {
  if (!document.hidden) {
    void syncCartAfterResume()
  }
}

const handlePageShow = () => {
  if (!document.hidden) {
    void syncCartAfterResume()
  }
}

const handleVisibilityChange = () => {
  if (!document.hidden) {
    void syncCartAfterResume()
  }
}

const dispatchGlobalPullToRefresh = () => {
  if (typeof window === 'undefined') {
    return
  }

  window.dispatchEvent(
    new CustomEvent('app:pull-to-refresh', {
      detail: {
        routeName: route.name,
        fullPath: route.fullPath,
      },
    }),
  )
}

const handleGlobalPullToRefresh = async () => {
  await Promise.allSettled([
    cart.initialize().then(() => cart.ensureFresh({ force: true, silent: true })),
    messageBadge.initialize().then(() => messageBadge.fetchUnreadMessages()),
  ])

  dispatchGlobalPullToRefresh()
}

const syncNativeStatusBar = async () => {
  if (!Capacitor.isNativePlatform()) {
    return
  }

  if (Capacitor.getPlatform() !== 'android') {
    return
  }

  try {
    await StatusBar.setOverlaysWebView({ overlay: false })
    await StatusBar.setBackgroundColor({ color: ANDROID_STATUS_BAR_COLOR })
    await StatusBar.setStyle({ style: Style.Light })
  } catch (error) {
    console.warn('Failed to sync Android status bar appearance:', error)
  }
}

const navigateToAppRoot = async () => {
  const fallbackPath = authStore.isLoggedIn ? '/homepage' : '/'

  if (route.path !== fallbackPath) {
    await router.push({ path: fallbackPath })
  }
}

const handleAndroidBackButton = async ({ canGoBack }) => {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') {
    return
  }

  const currentPath = route.path
  const isExitRoute = EXIT_ROUTE_PATHS.has(currentPath)

  if (!isExitRoute) {
    resetBackExitPrompt()

    if (canGoBack) {
      router.back()
      return
    }

    await navigateToAppRoot()
    return
  }

  const now = Date.now()
  if (now - lastBackPressAt.value <= ANDROID_BACK_EXIT_WINDOW_MS) {
    await CapacitorApp.exitApp()
    return
  }

  lastBackPressAt.value = now
  exitToastVisible.value = true
  if (exitToastTimerId) {
    window.clearTimeout(exitToastTimerId)
  }
  exitToastTimerId = window.setTimeout(() => {
    resetBackExitPrompt()
  }, ANDROID_BACK_EXIT_WINDOW_MS)
}

watch(
  () => route.fullPath,
  () => {
    resetBackExitPrompt()
    void syncNativeStatusBar()
  },
)

onMounted(() => {
  cart.init()
  void syncNativeStatusBar()

  window.addEventListener('focus', handleWindowFocus)
  window.addEventListener('pageshow', handlePageShow)
  document.addEventListener('visibilitychange', handleVisibilityChange)

  CapacitorApp.addListener('appStateChange', ({ isActive }) => {
    if (isActive) {
      void syncCartAfterResume({ force: true })
    }
  })
    .then((listenerHandle) => {
      appStateListenerHandle = listenerHandle
    })
    .catch((error) => {
      console.warn('Failed to register cart app state listener:', error)
    })

  if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android') {
    CapacitorApp.addListener('backButton', handleAndroidBackButton)
      .then((listenerHandle) => {
        backButtonListenerHandle = listenerHandle
      })
      .catch((error) => {
        console.warn('Failed to register Android back button listener:', error)
      })
  }
})

onUnmounted(() => {
  resetBackExitPrompt()

  window.removeEventListener('focus', handleWindowFocus)
  window.removeEventListener('pageshow', handlePageShow)
  document.removeEventListener('visibilitychange', handleVisibilityChange)

  if (appStateListenerHandle?.remove) {
    appStateListenerHandle.remove()
    appStateListenerHandle = null
  }

  if (backButtonListenerHandle?.remove) {
    backButtonListenerHandle.remove()
    backButtonListenerHandle = null
  }
})

console.log('App shell mounted with Android back handling')
</script>

<template>
  <div class="app-shell">
    <RouterView v-slot="{ Component, route: currentRoute }">
      <template v-if="currentRoute.meta.localPullToRefresh">
        <KeepAlive>
          <component
            :is="Component"
            v-if="currentRoute.meta.keepAlive"
            :key="currentRoute.name || currentRoute.path"
          />
        </KeepAlive>
        <component
          :is="Component"
          v-if="!currentRoute.meta.keepAlive"
          :key="currentRoute.fullPath"
        />
      </template>

      <PullToRefreshWrapper v-else :on-refresh="handleGlobalPullToRefresh">
        <KeepAlive>
          <component
            :is="Component"
            v-if="currentRoute.meta.keepAlive"
            :key="currentRoute.name || currentRoute.path"
          />
        </KeepAlive>
        <component
          :is="Component"
          v-if="!currentRoute.meta.keepAlive"
          :key="currentRoute.fullPath"
        />
      </PullToRefreshWrapper>
    </RouterView>

    <transition name="exit-toast">
      <div v-if="exitToastVisible" class="android-exit-toast">
        Press back again to exit
      </div>
    </transition>
  </div>
</template>

<style scoped>
.app-shell {
  min-height: 100vh;
}

.android-exit-toast {
  position: fixed;
  left: 50%;
  bottom: calc(16px + env(safe-area-inset-bottom, 0px));
  transform: translateX(-50%);
  z-index: 3000;
  min-width: min(320px, calc(100vw - 32px));
  max-width: calc(100vw - 32px);
  padding: 12px 18px;
  border-radius: 999px;
  background: rgba(24, 24, 27, 0.94);
  color: #fff;
  text-align: center;
  font-size: 0.92rem;
  font-weight: 600;
  letter-spacing: 0.01em;
  box-shadow: 0 16px 30px rgba(15, 23, 42, 0.28);
  pointer-events: none;
}

.exit-toast-enter-active,
.exit-toast-leave-active {
  transition:
    opacity 0.18s ease,
    transform 0.18s ease;
}

.exit-toast-enter-from,
.exit-toast-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(10px);
}
</style>
