<script setup>
import { onMounted, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
import { App as CapacitorApp } from '@capacitor/app'
import PullToRefreshWrapper from '@/components/PullToRefreshWrapper.vue'
import { useCartStore } from '@/stores/cart'
import { useMessageBadgeStore } from '@/stores/messageBadge'

const route = useRoute()
const cart = useCartStore()
const messageBadge = useMessageBadgeStore()

let appStateListenerHandle = null
let lastCartResumeSyncAt = 0

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

onMounted(() => {
  cart.init()

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
})

onUnmounted(() => {
  window.removeEventListener('focus', handleWindowFocus)
  window.removeEventListener('pageshow', handlePageShow)
  document.removeEventListener('visibilitychange', handleVisibilityChange)

  if (appStateListenerHandle?.remove) {
    appStateListenerHandle.remove()
    appStateListenerHandle = null
  }
})

console.log('✅ VITE_SUPABASE_URL:', import.meta.env.VITE_SUPABASE_URL)
</script>

<template>
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
</template>
