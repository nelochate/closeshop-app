<template>
  <div ref="wrapperRef" class="pull-to-refresh-wrapper">
    <div
      class="refresh-indicator"
      :class="{
        refreshing: isRefreshing,
        visible: showIndicator,
        ready: isReadyToRefresh,
      }"
      :style="{ transform: `translateY(${indicatorOffset}px)` }"
    >
      <div class="refresh-indicator-content">
        <v-progress-circular
          v-if="isRefreshing"
          indeterminate
          size="22"
          color="#3f83c7"
          :width="2.5"
        />
        <v-progress-circular
          v-else
          :model-value="pullProgress"
          size="22"
          color="#3f83c7"
          :width="2.5"
          :rotate="-90"
        />
      </div>
    </div>

    <slot />
  </div>
</template>

<script setup>
import { computed, nextTick, ref, watch, onMounted, onUnmounted, onActivated, onDeactivated } from 'vue'
import { App as CapacitorApp } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'
import { Haptics } from '@capacitor/haptics'

const props = defineProps({
  onRefresh: {
    type: Function,
    required: true,
  },
  threshold: {
    type: Number,
    default: 120,
  },
  activationDistance: {
    type: Number,
    default: 18,
  },
  resistance: {
    type: Number,
    default: 0.45,
  },
  topTolerance: {
    type: Number,
    default: 8,
  },
  indicatorMaxOffset: {
    type: Number,
    default: 64,
  },
  disabled: {
    type: Boolean,
    default: false,
  },
  refreshOnResume: {
    type: Boolean,
    default: true,
  },
  staleAfterMs: {
    type: Number,
    default: 45000,
  },
  refreshCooldownMs: {
    type: Number,
    default: 15000,
  },
  resumeDebounceMs: {
    type: Number,
    default: 1200,
  },
  resumeRefreshDelayMs: {
    type: Number,
    default: 180,
  },
  onResume: {
    type: Function,
    default: null,
  },
  ignoreSelectors: {
    type: String,
    default:
      '[data-ptr-ignore], .mapboxgl-map, .mapboxgl-canvas-container, .mapboxgl-canvas, .mapboxgl-ctrl, input, textarea, select, [contenteditable="true"]',
  },
})

const wrapperRef = ref(null)
const isRefreshing = ref(false)
const pullDistance = ref(0)
const isReadyToRefresh = ref(false)

let startX = 0
let startY = 0
let isPulling = false
let hapticTriggered = false
let startTarget = null
let touchListenersBound = false
let appStateListenerHandle = null
let resumeRefreshTimeoutId = null
let lastInactiveAt = 0
let lastRefreshAt = 0
let lastResumeHandledAt = 0
let lastInteractionAt = Date.now()
let runtimeListenersBound = false

const showIndicator = computed(() => pullDistance.value > 0 || isRefreshing.value)
const indicatorOffset = computed(() => (isRefreshing.value ? 0 : pullDistance.value))
const pullProgress = computed(() => Math.min(100, Math.round((pullDistance.value / props.indicatorMaxOffset) * 100)))

const markInteraction = () => {
  lastInteractionAt = Date.now()
}

const getScrollTop = () => {
  const scrollingElement = document.scrollingElement || document.documentElement
  return scrollingElement?.scrollTop || window.scrollY || 0
}

const targetShouldBeIgnored = (target) => {
  if (!target || !props.ignoreSelectors) {
    return false
  }

  return typeof target.closest === 'function' && !!target.closest(props.ignoreSelectors)
}

const resetGestureState = ({ keepIndicator = false } = {}) => {
  isPulling = false
  startTarget = null
  hapticTriggered = false
  isReadyToRefresh.value = false

  if (!keepIndicator) {
    pullDistance.value = 0
  }
}

const clearPendingResumeRefresh = () => {
  if (resumeRefreshTimeoutId) {
    window.clearTimeout(resumeRefreshTimeoutId)
    resumeRefreshTimeoutId = null
  }
}

const detachTouchListeners = () => {
  const wrapper = wrapperRef.value
  if (!wrapper || !touchListenersBound) {
    return
  }

  wrapper.removeEventListener('touchstart', handleTouchStart)
  wrapper.removeEventListener('touchmove', handleTouchMove)
  wrapper.removeEventListener('touchend', handleTouchEnd)
  wrapper.removeEventListener('touchcancel', handleTouchCancel)
  touchListenersBound = false
}

const attachTouchListeners = () => {
  const wrapper = wrapperRef.value
  if (!wrapper || touchListenersBound) {
    return
  }

  wrapper.addEventListener('touchstart', handleTouchStart, { passive: true })
  wrapper.addEventListener('touchmove', handleTouchMove, { passive: false })
  wrapper.addEventListener('touchend', handleTouchEnd)
  wrapper.addEventListener('touchcancel', handleTouchCancel)
  touchListenersBound = true
}

const performRefresh = async ({ force = false } = {}) => {
  if (props.disabled || isRefreshing.value || typeof props.onRefresh !== 'function') {
    return false
  }

  const now = Date.now()
  if (!force && now - lastRefreshAt < props.refreshCooldownMs) {
    return false
  }

  clearPendingResumeRefresh()
  lastRefreshAt = now
  isRefreshing.value = true
  pullDistance.value = 0
  isReadyToRefresh.value = false

  try {
    await props.onRefresh()
    markInteraction()
    return true
  } catch (error) {
    console.error('Refresh failed:', error)
    return false
  } finally {
    window.setTimeout(() => {
      isRefreshing.value = false
      pullDistance.value = 0
    }, 350)
  }
}

const handleAppInactive = () => {
  lastInactiveAt = Date.now()
  clearPendingResumeRefresh()
  resetGestureState({ keepIndicator: isRefreshing.value })
}

const handleAppActive = async (source = 'unknown') => {
  const now = Date.now()
  if (now - lastResumeHandledAt < props.resumeDebounceMs) {
    return
  }

  lastResumeHandledAt = now
  clearPendingResumeRefresh()
  resetGestureState({ keepIndicator: false })
  detachTouchListeners()
  await nextTick()
  attachTouchListeners()
  window.dispatchEvent(new Event('resize'))

  if (typeof props.onResume === 'function') {
    try {
      await props.onResume({ source, inactiveForMs: lastInactiveAt ? now - lastInactiveAt : 0 })
    } catch (error) {
      console.error('Resume recovery failed:', error)
    }
  }

  const inactiveForMs = lastInactiveAt ? now - lastInactiveAt : now - lastInteractionAt
  markInteraction()

  if (!props.refreshOnResume || inactiveForMs < props.staleAfterMs) {
    return
  }

  resumeRefreshTimeoutId = window.setTimeout(() => {
    void performRefresh()
  }, props.resumeRefreshDelayMs)
}

const handleTouchStart = (event) => {
  if (props.disabled || isRefreshing.value || event.touches.length !== 1) {
    return
  }

  const target = event.target instanceof Element ? event.target : null
  if (targetShouldBeIgnored(target)) {
    return
  }

  if (getScrollTop() > props.topTolerance) {
    return
  }

  startX = event.touches[0].clientX
  startY = event.touches[0].clientY
  startTarget = target
  isPulling = true
  hapticTriggered = false
  isReadyToRefresh.value = false
  pullDistance.value = 0
  markInteraction()
}

const handleTouchMove = async (event) => {
  if (!isPulling || isRefreshing.value || event.touches.length !== 1) {
    return
  }

  if (targetShouldBeIgnored(startTarget)) {
    resetGestureState()
    return
  }

  const currentTouch = event.touches[0]
  const deltaX = currentTouch.clientX - startX
  const deltaY = currentTouch.clientY - startY

  if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 10) {
    resetGestureState()
    return
  }

  if (deltaY <= 0) {
    pullDistance.value = 0
    isReadyToRefresh.value = false
    return
  }

  if (getScrollTop() > props.topTolerance) {
    resetGestureState()
    return
  }

  if (deltaY < props.activationDistance) {
    pullDistance.value = 0
    isReadyToRefresh.value = false
    return
  }

  const adjustedDistance = (deltaY - props.activationDistance) * props.resistance
  pullDistance.value = Math.min(props.indicatorMaxOffset, Math.round(adjustedDistance))
  isReadyToRefresh.value = deltaY >= props.threshold
  markInteraction()

  if (event.cancelable) {
    event.preventDefault()
  }

  if (isReadyToRefresh.value && !hapticTriggered && Capacitor.isNativePlatform()) {
    try {
      await Haptics.vibrate({ duration: 20 })
    } catch (error) {
      console.warn('Haptic feedback failed:', error)
    } finally {
      hapticTriggered = true
    }
  }
}

const handleTouchEnd = async () => {
  if (!isPulling || isRefreshing.value) {
    resetGestureState({ keepIndicator: isRefreshing.value })
    return
  }

  const shouldRefresh = isReadyToRefresh.value
  resetGestureState()

  if (!shouldRefresh) {
    return
  }

  await performRefresh({ force: true })
}

const handleTouchCancel = () => {
  if (isRefreshing.value) {
    resetGestureState({ keepIndicator: true })
    return
  }

  resetGestureState()
}

watch(
  () => props.disabled,
  (disabled) => {
    if (disabled) {
      handleAppInactive()
      handleTouchCancel()
    }
  },
)

const handleVisibilityChange = () => {
  if (document.hidden) {
    handleAppInactive()
    return
  }

  void handleAppActive('visibilitychange')
}

const handleWindowFocus = () => {
  if (!document.hidden) {
    void handleAppActive('focus')
  }
}

const handlePageShow = () => {
  if (!document.hidden) {
    void handleAppActive('pageshow')
  }
}

const attachRuntimeListeners = () => {
  if (runtimeListenersBound) {
    return
  }

  attachTouchListeners()
  lastInteractionAt = Date.now()

  window.addEventListener('focus', handleWindowFocus)
  window.addEventListener('pageshow', handlePageShow)
  window.addEventListener('scroll', markInteraction, { passive: true })
  window.addEventListener('pointerdown', markInteraction, { passive: true })
  document.addEventListener('visibilitychange', handleVisibilityChange)

  if (Capacitor.isNativePlatform()) {
    CapacitorApp.addListener('appStateChange', ({ isActive }) => {
      if (isActive) {
        void handleAppActive('capacitor')
        return
      }

      handleAppInactive()
    }).then((listenerHandle) => {
      appStateListenerHandle = listenerHandle
    }).catch((error) => {
      console.warn('Failed to register app state listener:', error)
    })
  }
 
  runtimeListenersBound = true
}

const detachRuntimeListeners = () => {
  if (!runtimeListenersBound) {
    return
  }

  clearPendingResumeRefresh()
  detachTouchListeners()

  window.removeEventListener('focus', handleWindowFocus)
  window.removeEventListener('pageshow', handlePageShow)
  window.removeEventListener('scroll', markInteraction)
  window.removeEventListener('pointerdown', markInteraction)
  document.removeEventListener('visibilitychange', handleVisibilityChange)

  if (appStateListenerHandle?.remove) {
    appStateListenerHandle.remove()
    appStateListenerHandle = null
  }

  runtimeListenersBound = false
}

onMounted(() => {
  attachRuntimeListeners()
})

onActivated(() => {
  attachRuntimeListeners()

  if (!document.hidden) {
    void handleAppActive('activated')
  }
})

onDeactivated(() => {
  handleAppInactive()
  detachRuntimeListeners()
})

onUnmounted(() => {
  handleAppInactive()
  detachRuntimeListeners()
})
</script>

<style scoped>
.pull-to-refresh-wrapper {
  position: relative;
  min-height: 100vh;
}

.refresh-indicator {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 9999;
  display: flex;
  justify-content: center;
  align-items: flex-start;
  height: 64px;
  padding-top: calc(env(safe-area-inset-top, 0px) + 8px);
  background: transparent;
  transition: transform 0.18s ease, opacity 0.18s ease;
  pointer-events: none;
  opacity: 0;
  visibility: hidden;
}

.refresh-indicator.visible {
  opacity: 1;
  visibility: visible;
}

.refresh-indicator.refreshing {
  opacity: 1;
  visibility: visible;
}

.refresh-indicator-content {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 42px;
  height: 42px;
  padding: 6px;
  background: rgba(255, 255, 255, 0.96);
  border-radius: 999px;
  box-shadow: 0 4px 12px rgba(15, 23, 42, 0.12);
  backdrop-filter: blur(10px);
}

.refresh-indicator.ready .refresh-indicator-content {
  box-shadow: 0 6px 16px rgba(63, 131, 199, 0.18);
}
</style>
