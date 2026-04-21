<template>
  <div class="pull-to-refresh-wrapper">
    <!-- Refresh Indicator - Hidden by default, only visible when pulling -->
    <div 
      class="refresh-indicator"
      :class="{ 
        'refreshing': isRefreshing,
        'visible': pullDistance > 0 || isRefreshing
      }"
      :style="{ transform: `translateY(${pullDistance}px)` }"
    >
      <div class="refresh-indicator-content">
        <!-- Only show the circular progress indicator -->
        <v-progress-circular 
          v-if="isRefreshing" 
          indeterminate 
          size="32" 
          color="#3f83c7"
          :width="3"
        />
        <v-progress-circular 
          v-else 
          :size="32" 
          :width="3"
          color="#3f83c7"
        />
      </div>
    </div>
    
    <!-- Slot for page content -->
    <slot />
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { Capacitor } from '@capacitor/core'
import { Haptics } from '@capacitor/haptics'

const props = defineProps({
  onRefresh: {
    type: Function,
    required: true
  },
  threshold: {
    type: Number,
    default: 80
  }
})

const isRefreshing = ref(false)
const pullDistance = ref(0)
let startY = 0
let isPulling = false

const handleTouchStart = (e) => {
  const scrollTop = window.scrollY || document.documentElement.scrollTop
  if (scrollTop > 10) return
  
  startY = e.touches[0].clientY
  isPulling = true
}

const handleTouchMove = async (e) => {
  if (!isPulling || isRefreshing.value) return
  
  const currentY = e.touches[0].clientY
  const distance = currentY - startY
  
  if (distance > 0 && (window.scrollY === 0 || document.documentElement.scrollTop === 0)) {
    e.preventDefault()
    pullDistance.value = Math.min(distance, props.threshold + 40)
    
    // Add haptic feedback when reaching threshold
    if (pullDistance.value >= props.threshold && Capacitor.isNativePlatform()) {
      try {
        await Haptics.vibrate({ duration: 30 })
      } catch (err) {
        console.warn('Haptic feedback failed:', err)
      }
    }
  }
}

const handleTouchEnd = async () => {
  if (!isPulling || isRefreshing.value) {
    isPulling = false
    return
  }
  
  isPulling = false
  
  if (pullDistance.value >= props.threshold) {
    isRefreshing.value = true
    
    try {
      await props.onRefresh()
    } catch (error) {
      console.error('Refresh failed:', error)
    } finally {
      setTimeout(() => {
        isRefreshing.value = false
        pullDistance.value = 0
      }, 500)
    }
  } else {
    pullDistance.value = 0
  }
}

onMounted(() => {
  document.addEventListener('touchstart', handleTouchStart, { passive: false })
  document.addEventListener('touchmove', handleTouchMove, { passive: false })
  document.addEventListener('touchend', handleTouchEnd)
})

onUnmounted(() => {
  document.removeEventListener('touchstart', handleTouchStart)
  document.removeEventListener('touchmove', handleTouchMove)
  document.removeEventListener('touchend', handleTouchEnd)
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
  align-items: center;
  height: 80px;
  background: transparent;
  transition: transform 0.2s ease, opacity 0.2s ease;
  pointer-events: none;
  opacity: 0;
  visibility: hidden;
}

.refresh-indicator.visible {
  opacity: 1;
  visibility: visible;
}

.refresh-indicator.refreshing {
  transform: translateY(0);
  opacity: 1;
  visibility: visible;
}

.refresh-indicator-content {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 8px;
  background: rgba(255, 255, 255, 0.95);
  border-radius: 50%;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
  backdrop-filter: blur(10px);
  width: 56px;
  height: 56px;
}

/* Optional: Add a subtle animation for the refresh icon */
@keyframes rotate {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.refresh-indicator.refreshing .v-progress-circular {
  animation: rotate 1s linear infinite;
}
</style>