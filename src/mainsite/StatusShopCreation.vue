<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { supabase } from '@/utils/supabase'

const route = useRoute()
const router = useRouter()

// State
const loading = ref(true)
const error = ref(null)
const shop = ref(null)
const profile = ref(null)
const listening = ref(false)
let subscription = null

// Custom Color Palette based on #3f83c7
const colorPalette = {
  primary: {
    main: '#3f83c7',    // Your specified blue
    light: '#6ba1d4',
    dark: '#2c5c8d',
    lighter: '#a0c2e5',
    gradient: 'linear-gradient(135deg, #3f83c7 0%, #5a95d1 100%)',
    gradientLight: 'linear-gradient(135deg, #6ba1d4 0%, #8bb5df 100%)',
  },
  success: {
    main: '#4CAF50',    // Green
    light: '#80e27e',
    dark: '#087f23',
    gradient: 'linear-gradient(135deg, #4CAF50 0%, #66BB6A 100%)',
  },
  error: {
    main: '#F44336',    // Red
    light: '#ff7961',
    dark: '#ba000d',
    gradient: 'linear-gradient(135deg, #F44336 0%, #EF5350 100%)',
  },
  warning: {
    main: '#FF9800',    // Orange
    light: '#ffc947',
    dark: '#c66900',
    gradient: 'linear-gradient(135deg, #FF9800 0%, #FFB74D 100%)',
  },
  info: {
    main: '#2196F3',    // Blue
    light: '#6ec6ff',
    dark: '#0069c0',
    gradient: 'linear-gradient(135deg, #2196F3 0%, #42A5F5 100%)',
  },
  neutral: {
    50: '#fafbfc',
    100: '#f2f4f7',
    200: '#e4e7ec',
    300: '#d0d5dd',
    400: '#98a2b3',
    500: '#667085',
    600: '#475467',
    700: '#344054',
    800: '#1d2939',
    900: '#101828',
  },
  accent: {
    purple: '#9c27b0',
    teal: '#26a69a',
    pink: '#e91e63',
    amber: '#ffc107',
  }
}

// Get initials for avatar
const getInitials = (firstName, lastName) => {
  if (!firstName && !lastName) return '?'
  const first = firstName ? firstName.charAt(0) : ''
  const last = lastName ? lastName.charAt(0) : ''
  return (first + last).toUpperCase()
}

// Format time from PostgreSQL time format
const formatTime = (timeString) => {
  if (!timeString) return ''
  const [hours, minutes] = timeString.split(':')
  const hour = parseInt(hours)
  const ampm = hour >= 12 ? 'PM' : 'AM'
  const formattedHour = hour % 12 || 12
  return `${formattedHour}:${minutes} ${ampm}`
}

// Try to get shop ID from different sources
const getShopId = () => {
  if (route.query.shopId) return route.query.shopId
  if (route.params.id) return route.params.id
  const storedShopId = localStorage.getItem('lastCreatedShopId')
  if (storedShopId) return storedShopId
  const userShopId = sessionStorage.getItem('userShopId')
  if (userShopId) return userShopId
  return null
}

// Fetch shop and profile data
const fetchData = async () => {
  try {
    loading.value = true
    error.value = null
    
    const shopId = getShopId()
    
    if (!shopId) {
      shop.value = null
      error.value = 'No shop ID found. Please provide a shop ID or create a new shop.'
      return
    }

    const { data: shopData, error: shopError } = await supabase
      .from('shops')
      .select('*')
      .eq('id', shopId)
      .single()

    if (shopError) {
      if (shopError.code === 'PGRST116') {
        shop.value = null
        error.value = 'Shop not found. Please check the shop ID or create a new shop.'
      } else {
        throw shopError
      }
    } else {
      shop.value = shopData
      localStorage.setItem('lastCreatedShopId', shopData.id)
      
      if (shopData.owner_id) {
        try {
          const { data: profileData } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', shopData.owner_id)
            .single()
          profile.value = profileData
        } catch (err) {
          // It's okay if profile doesn't exist
        }
      }
      
      if (shopData.id) {
        setupRealtimeSubscription(shopData.id)
      }
    }
  } catch (err) {
    console.error('Error fetching data:', err)
    error.value = err.message || 'Failed to load shop status. Please try again.'
  } finally {
    loading.value = false
  }
}

// Setup real-time subscription
const setupRealtimeSubscription = (shopId) => {
  try {
    if (subscription) {
      supabase.removeChannel(subscription)
    }

    subscription = supabase
      .channel(`shop-${shopId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'shops',
          filter: `id=eq.${shopId}`
        },
        (payload) => {
          shop.value = payload.new
          listening.value = true
          
          if (payload.old && payload.old.status !== payload.new.status) {
            showStatusUpdateNotification(payload.new.status)
          }
        }
      )
      .subscribe((status) => {
        listening.value = status === 'SUBSCRIBED'
      })
  } catch (err) {
    console.error('Error setting up real-time subscription:', err)
  }
}

// Show notification when status changes
const showStatusUpdateNotification = (newStatus) => {
  const messages = {
    approved: '🎉 Your shop has been approved!',
    declined: '⚠️ Your shop application has been declined.',
    pending: '📋 Your shop status has been updated.'
  }
  
  if (messages[newStatus]) {
    createNotification(messages[newStatus], newStatus)
  }
}

// Create custom notification
const createNotification = (message, type) => {
  const notification = document.createElement('div')
  notification.className = `custom-notification notification-${type}`
  notification.innerHTML = `
    <div class="notification-icon">
      <v-icon>${statusIcon.value}</v-icon>
    </div>
    <div class="notification-message">${message}</div>
    <button class="notification-close" onclick="this.parentElement.remove()">
      <v-icon>mdi-close</v-icon>
    </button>
  `
  document.body.appendChild(notification)
  
  setTimeout(() => notification.classList.add('show'), 10)
  setTimeout(() => {
    notification.classList.remove('show')
    setTimeout(() => notification.remove(), 300)
  }, 4000)
}

// Format address from shop data
const formatAddress = () => {
  if (!shop.value) return ''
  
  const parts = [
    shop.value.house_no,
    shop.value.building,
    shop.value.street,
    shop.value.barangay,
    shop.value.city,
    shop.value.province
  ].filter(Boolean)
  
  return parts.join(', ') || 'No address provided'
}

// Format date
const formatDate = (dateString) => {
  if (!dateString) return 'N/A'
  
  try {
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    })
  } catch (err) {
    return 'Invalid date'
  }
}

// Format date with time
const formatDateTime = (dateString) => {
  if (!dateString) return 'N/A'
  
  try {
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  } catch (err) {
    return 'Invalid date'
  }
}

// Copy status link to clipboard
const copyStatusLink = async () => {
  if (!shop.value) return
  
  const currentUrl = window.location.origin + window.location.pathname
  const statusUrl = `${currentUrl}?shopId=${shop.value.id}`
  
  try {
    await navigator.clipboard.writeText(statusUrl)
    showToast('Status link copied to clipboard!', 'success')
  } catch (err) {
    const textArea = document.createElement('textarea')
    textArea.value = statusUrl
    document.body.appendChild(textArea)
    textArea.select()
    document.execCommand('copy')
    document.body.removeChild(textArea)
    showToast('Link copied to clipboard!', 'success')
  }
}

// Show toast notification
const showToast = (message, type = 'info') => {
  const toast = document.createElement('div')
  toast.className = `custom-toast toast-${type}`
  toast.innerHTML = `
    <div class="toast-content">
      <v-icon>mdi-check-circle</v-icon>
      <span>${message}</span>
    </div>
  `
  document.body.appendChild(toast)
  
  setTimeout(() => toast.classList.add('show'), 10)
  
  setTimeout(() => {
    toast.classList.remove('show')
    setTimeout(() => toast.remove(), 300)
  }, 3000)
}

// Go back function
const goBack = () => {
  router.go(-1)
}

// Go to home
const goToHome = () => {
  router.push('/')
}

// Computed properties
const shopStatus = computed(() => shop.value?.status || 'pending')
const isApproved = computed(() => shopStatus.value === 'approved')
const isDeclined = computed(() => shopStatus.value === 'declined')
const isPending = computed(() => shopStatus.value === 'pending')
const showActionSteps = computed(() => actionSteps.value.length > 0)

// Status colors based on palette
const statusColors = computed(() => {
  const colors = {
    approved: colorPalette.success,
    declined: colorPalette.error,
    pending: colorPalette.primary // Using your blue for pending
  }
  return colors[shopStatus.value] || colorPalette.primary
})

const statusIcon = computed(() => {
  const icons = {
    approved: 'mdi-check-circle',
    declined: 'mdi-alert-circle',
    pending: 'mdi-clock-outline'
  }
  return icons[shopStatus.value]
})

const statusTitle = computed(() => {
  const titles = {
    approved: 'Approved! 🎉',
    declined: 'Needs Attention',
    pending: 'Under Review'
  }
  return titles[shopStatus.value]
})

const statusMessage = computed(() => {
  const messages = {
    approved: 'Your shop is now live and ready for business',
    declined: 'Your application requires some updates',
    pending: 'Your shop application is being reviewed'
  }
  return messages[shopStatus.value]
})

const statusContent = computed(() => {
  const contents = {
    approved: 'Congratulations! Your shop has been approved and is now visible to customers. You can start adding products and managing your shop.',
    declined: 'We\'ve reviewed your application and found some areas that need attention. Please review the feedback below and resubmit.',
    pending: 'Our team is currently reviewing your shop application. This usually takes 24-48 hours. You\'ll be notified as soon as there\'s an update.'
  }
  return contents[shopStatus.value]
})

// Action Steps
const actionSteps = computed(() => {
  if (isApproved.value) {
    return [
      {
        icon: 'mdi-package-variant',
        color: colorPalette.success.main,
        bgColor: colorPalette.success.light + '20',
        title: 'Add Products',
        description: 'Start listing your inventory'
      },
      {
        icon: 'mdi-store',
        color: colorPalette.primary.main,
        bgColor: colorPalette.primary.light + '20',
        title: 'Setup Store',
        description: 'Customize your shop'
      },
      {
        icon: 'mdi-chart-line',
        color: colorPalette.accent.teal,
        bgColor: colorPalette.accent.teal + '20',
        title: 'View Analytics',
        description: 'Track performance'
      }
    ]
  } else if (isDeclined.value) {
    return [
      {
        icon: 'mdi-file-document-edit',
        color: colorPalette.error.main,
        bgColor: colorPalette.error.light + '20',
        title: 'Review Feedback',
        description: 'Check what needs fixing'
      },
      {
        icon: 'mdi-update',
        color: colorPalette.warning.main,
        bgColor: colorPalette.warning.light + '20',
        title: 'Update Info',
        description: 'Make necessary changes'
      },
      {
        icon: 'mdi-send-check',
        color: colorPalette.primary.main,
        bgColor: colorPalette.primary.light + '20',
        title: 'Resubmit',
        description: 'Submit updated application'
      }
    ]
  } else {
    return [
      {
        icon: 'mdi-clipboard-list',
        color: colorPalette.primary.main,
        bgColor: colorPalette.primary.light + '20',
        title: 'Prepare Products',
        description: 'Get your catalog ready'
      },
      {
        icon: 'mdi-image-multiple',
        color: colorPalette.accent.purple,
        bgColor: colorPalette.accent.purple + '20',
        title: 'Upload Images',
        description: 'Add shop and product photos'
      },
      {
        icon: 'mdi-bell-ring',
        color: colorPalette.accent.amber,
        bgColor: colorPalette.accent.amber + '20',
        title: 'Stay Alert',
        description: 'Check for updates'
      }
    ]
  }
})

// Action handlers
const handleApproved = () => {
  if (profile.value) {
    router.push('/usershop')
  } else {
    showToast('Please log in to access your dashboard', 'info')
    router.push('/login')
  }
}

const handleDeclined = () => {
  if (profile.value) {
    router.push('/shop-build')
  } else {
    showToast('Please log in to edit your shop application', 'info')
    router.push('/login')
  }
}

const handlePending = () => {
  if (profile.value) {
    router.push('/usershop')
  } else {
    showToast('Please log in to prepare your shop', 'info')
    router.push('/login')
  }
}

const contactSupport = () => {
  window.open('mailto:support@closeshop.com?subject=Shop%20Application%20Support')
}

const checkStatus = () => {
  showToast('Refreshing status...', 'info')
  fetchData()
}

const createShop = () => {
  router.push('/shop-build')
}

// Calculate time since submission
const timeSinceSubmission = computed(() => {
  if (!shop.value?.created_at) return ''
  
  const created = new Date(shop.value.created_at)
  const now = new Date()
  const diffInHours = Math.floor((now - created) / (1000 * 60 * 60))
  
  if (diffInHours < 1) return 'Just now'
  if (diffInHours < 24) return `${diffInHours} hours ago`
  
  const diffInDays = Math.floor(diffInHours / 24)
  return `${diffInDays} days ago`
})

// Initialize
onMounted(() => {
  fetchData()
})

// Cleanup
onUnmounted(() => {
  if (subscription) {
    try {
      supabase.removeChannel(subscription)
    } catch (err) {
      console.error('Error removing subscription:', err)
    }
  }
})
</script>

<template>
  <div class="status-view-wrapper">
    <!-- Header -->
    <div class="app-header">
      <div class="header-backdrop"></div>
      <div class="header-content">
        <v-btn 
          icon 
          @click="goBack"
          class="header-back-btn"
          size="small"
          variant="flat"
        >
          <v-icon size="20">mdi-chevron-left</v-icon>
        </v-btn>
        <div class="header-title">
          <h1>Shop Status</h1>
          <p class="subtitle">Track your application progress</p>
        </div>
        <div class="header-actions">
          <v-btn 
            icon 
            @click="checkStatus"
            :loading="loading"
            size="small"
            variant="text"
            class="header-refresh-btn"
          >
            <v-icon size="20">mdi-refresh</v-icon>
          </v-btn>
        </div>
      </div>
    </div>

    <!-- Main Content -->
    <main class="main-content">
      <!-- Loading State -->
      <div v-if="loading" class="loading-container">
        <div class="loading-card">
          <div class="loading-spinner">
            <div class="spinner-ring"></div>
            <div class="spinner-inner"></div>
          </div>
          <h3>Loading Shop Status</h3>
          <p>Getting the latest information...</p>
        </div>
      </div>

      <!-- Error State -->
      <div v-else-if="error" class="error-container">
        <div class="error-card">
          <div class="error-icon">
            <v-icon size="64" color="error">mdi-alert-circle</v-icon>
          </div>
          <h3>Unable to Load</h3>
          <p>{{ error }}</p>
          <div class="error-actions">
            <v-btn 
              color="primary" 
              @click="fetchData" 
              variant="flat"
              prepend-icon="mdi-refresh"
              class="action-btn"
            >
              Try Again
            </v-btn>
            <v-btn 
              color="secondary" 
              @click="goToHome" 
              variant="outlined"
              prepend-icon="mdi-home"
              class="action-btn"
            >
              Go Home
            </v-btn>
          </div>
        </div>
      </div>

      <!-- No Shop State -->
      <div v-else-if="!shop" class="no-shop-container">
        <div class="no-shop-card">
          <div class="no-shop-icon">
            <v-icon size="64" color="warning">mdi-store-off</v-icon>
          </div>
          <h3>No Shop Found</h3>
          <p>You haven't created a shop yet.</p>
          <div class="no-shop-actions">
            <v-btn 
              color="primary" 
              @click="createShop" 
              variant="flat"
              prepend-icon="mdi-plus-circle"
              size="large"
              class="create-btn"
            >
              Create New Shop
            </v-btn>
            <v-btn 
              color="secondary" 
              @click="goToHome" 
              variant="outlined"
              prepend-icon="mdi-home"
              class="home-btn"
            >
              Go to Homepage
            </v-btn>
          </div>
        </div>
      </div>

      <!-- Status Content -->
      <div v-else class="status-container">
        <!-- Status Banner -->
        <div class="status-banner" :style="{ background: statusColors.gradient }">
          <div class="banner-content">
            <div class="status-icon-wrapper">
              <div class="icon-circle">
                <v-icon 
                  size="32" 
                  color="white"
                  :class="{ 'pulse-icon': isPending }"
                >
                  {{ statusIcon }}
                </v-icon>
              </div>
            </div>
            <div class="status-text">
              <h2 class="status-title">{{ statusTitle }}</h2>
              <p class="status-subtitle">{{ statusMessage }}</p>
              <div class="shop-name-chip">
                <span class="shop-name">{{ shop.business_name }}</span>
                <div class="status-badge" :style="{ 
                  backgroundColor: statusColors.light + '40',
                  color: statusColors.dark
                }">
                  {{ shopStatus.toUpperCase() }}
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Status Details -->
        <div class="status-details">
          <!-- Status Message -->
          <div class="message-card">
            <div class="message-header">
              <div class="message-icon">
                <v-icon :color="statusColors.main" size="24">mdi-information-variant</v-icon>
              </div>
              <h3>Status Details</h3>
            </div>
            <p class="message-content">{{ statusContent }}</p>
            <div class="message-footer">
              <span class="timestamp">
                <v-icon size="14">mdi-clock-outline</v-icon>
                Submitted {{ timeSinceSubmission }}
              </span>
            </div>
          </div>

          <!-- Shop Information -->
          <div class="info-card">
            <div class="card-header">
              <h3>
                <v-icon :color="colorPalette.primary.main" size="20">mdi-storefront</v-icon>
                Shop Details
              </h3>
            </div>
            
            <div class="info-grid">
              <div class="info-row">
                <div class="info-label">
                  <v-icon size="16">mdi-store</v-icon>
                  Business Name
                </div>
                <div class="info-value">{{ shop.business_name }}</div>
              </div>
              
              <div class="info-row">
                <div class="info-label">
                  <v-icon size="16">mdi-map-marker</v-icon>
                  Location
                </div>
                <div class="info-value multiline">{{ formatAddress() }}</div>
              </div>
              
              <div v-if="shop.description" class="info-row">
                <div class="info-label">
                  <v-icon size="16">mdi-text</v-icon>
                  Description
                </div>
                <div class="info-value multiline">{{ shop.description }}</div>
              </div>
              
              <div v-if="shop.open_time && shop.close_time" class="info-row">
                <div class="info-label">
                  <v-icon size="16">mdi-clock-time-four</v-icon>
                  Business Hours
                </div>
                <div class="info-value">
                  {{ formatTime(shop.open_time) }} - {{ formatTime(shop.close_time) }}
                </div>
              </div>
              
              <div class="info-row">
                <div class="info-label">
                  <v-icon size="16">mdi-calendar-check</v-icon>
                  Application Date
                </div>
                <div class="info-value">
                  {{ formatDateTime(shop.created_at) }}
                </div>
              </div>
            </div>
          </div>

          <!-- Action Steps -->
          <div v-if="showActionSteps" class="actions-card">
            <div class="card-header">
              <h3>
                <v-icon :color="statusColors.main" size="20">mdi-progress-check</v-icon>
                {{ isApproved ? 'Get Started' : isDeclined ? 'Next Steps' : 'Preparation Tips' }}
              </h3>
            </div>
            
            <div class="steps-container">
              <div 
                v-for="(step, index) in actionSteps" 
                :key="index" 
                class="step-item"
                :style="{ borderLeftColor: step.color }"
              >
                <div class="step-number">{{ index + 1 }}</div>
                <div class="step-icon" :style="{ color: step.color }">
                  <v-icon size="20">{{ step.icon }}</v-icon>
                </div>
                <div class="step-content">
                  <h4>{{ step.title }}</h4>
                  <p>{{ step.description }}</p>
                </div>
              </div>
            </div>
          </div>

          <!-- Timeline -->
          <div v-if="isPending" class="timeline-card">
            <div class="card-header">
              <h3>
                <v-icon :color="colorPalette.info.main" size="20">mdi-timeline-text</v-icon>
                Review Progress
              </h3>
            </div>
            
            <div class="timeline">
              <div class="timeline-item completed">
                <div class="timeline-dot" :style="{ backgroundColor: colorPalette.success.main }"></div>
                <div class="timeline-content">
                  <h4>Application Submitted</h4>
                  <p>{{ formatDate(shop.created_at) }}</p>
                </div>
              </div>
              
              <div class="timeline-item active">
                <div class="timeline-dot" :style="{ 
                  backgroundColor: colorPalette.primary.main,
                  boxShadow: `0 0 0 4px ${colorPalette.primary.light}40`
                }"></div>
                <div class="timeline-content">
                  <h4>Under Review</h4>
                  <p>Team is reviewing your application</p>
                </div>
              </div>
              
              <div class="timeline-item" :class="{ completed: isApproved || isDeclined }">
                <div class="timeline-dot" :style="{ 
                  backgroundColor: isApproved ? colorPalette.success.main : 
                                 isDeclined ? colorPalette.error.main : 
                                 colorPalette.neutral[300] 
                }"></div>
                <div class="timeline-content">
                  <h4>Decision</h4>
                  <p>{{ isApproved ? 'Approved' : isDeclined ? 'Declined' : 'Pending decision' }}</p>
                </div>
              </div>
            </div>
          </div>

          <!-- Action Buttons -->
          <div class="action-buttons">
            <v-btn
              v-if="isApproved"
              :style="{ background: statusColors.gradient }"
              size="large"
              variant="flat"
              @click="handleApproved"
              prepend-icon="mdi-rocket-launch"
              block
              class="primary-action"
            >
              Launch Dashboard
            </v-btn>
            
            <v-btn
              v-else-if="isDeclined"
              :style="{ background: statusColors.gradient }"
              size="large"
              variant="flat"
              @click="handleDeclined"
              prepend-icon="mdi-pencil-box"
              block
              class="primary-action"
            >
              Edit & Resubmit
            </v-btn>
            
            <v-btn
              v-else
              :style="{ background: statusColors.gradient }"
              size="large"
              variant="flat"
              @click="handlePending"
              prepend-icon="mdi-clipboard-text"
              block
              class="primary-action"
            >
              Prepare Shop
            </v-btn>

            <div class="secondary-actions">
              <v-btn
                v-if="isDeclined"
                color="primary"
                variant="outlined"
                @click="contactSupport"
                prepend-icon="mdi-help-circle"
                block
                class="secondary-btn"
              >
                Get Help
              </v-btn>
              
              <v-btn
                variant="outlined"
                @click="copyStatusLink"
                prepend-icon="mdi-link-variant"
                block
                class="secondary-btn link-btn"
              >
                Copy Status Link
              </v-btn>
            </div>
          </div>

          <!-- Footer Note -->
          <div class="footer-note">
            <p>
              <v-icon size="16" :color="colorPalette.neutral[500]">mdi-information</v-icon>
              Need help? Contact our support team at support@closeshop.com
            </p>
          </div>
        </div>
      </div>
    </main>
  </div>
</template>

<style scoped>
/* Base Styles */
.status-view-wrapper {
  min-height: 100vh;
  background: linear-gradient(135deg, #f8fafc 0%, #f2f4f7 100%);
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  padding-top: env(safe-area-inset-top, 0);
  padding-bottom: env(safe-area-inset-bottom, 0);
}

/* Header */
.app-header {
  position: relative;
  height: 180px;
  overflow: hidden;
}

.header-backdrop {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 100%;
  background: linear-gradient(135deg, 
    v-bind('colorPalette.primary.dark') 0%, 
    v-bind('colorPalette.primary.main') 50%,
    v-bind('colorPalette.primary.light') 100%);
  clip-path: polygon(0 0, 100% 0, 100% 80%, 0 100%);
}

.header-content {
  position: relative;
  z-index: 10;
  padding: calc(24px + env(safe-area-inset-top, 0)) 20px 0;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
}

.header-back-btn {
  background: rgba(255, 255, 255, 0.15) !important;
  backdrop-filter: blur(10px);
  color: white !important;
  min-width: 40px !important;
  width: 40px !important;
  height: 40px !important;
  border-radius: 12px !important;
  border: 1px solid rgba(255, 255, 255, 0.2) !important;
}

.header-title {
  flex: 1;
  text-align: center;
  padding: 0 16px;
}

.header-title h1 {
  color: white;
  font-size: 1.75rem;
  font-weight: 700;
  margin: 0 0 4px 0;
  letter-spacing: -0.5px;
}

.header-title .subtitle {
  color: rgba(255, 255, 255, 0.85);
  font-size: 0.875rem;
  margin: 0;
  font-weight: 400;
}

.header-refresh-btn {
  color: white !important;
  opacity: 0.8;
}

/* Main Content */
.main-content {
  padding: 0 16px 40px;
  position: relative;
  margin-top: -40px;
}

/* Loading State */
.loading-container {
  min-height: 400px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.loading-card {
  text-align: center;
  padding: 40px;
  background: white;
  border-radius: 20px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.08);
  max-width: 400px;
  width: 100%;
}

.loading-spinner {
  position: relative;
  width: 80px;
  height: 80px;
  margin: 0 auto 24px;
}

.spinner-ring {
  position: absolute;
  width: 100%;
  height: 100%;
  border: 4px solid v-bind('colorPalette.primary.light + "40"');
  border-top-color: v-bind('colorPalette.primary.main');
  border-radius: 50%;
  animation: spin 1.5s linear infinite;
}

.spinner-inner {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 60%;
  height: 60%;
  border: 4px solid transparent;
  border-top-color: v-bind('colorPalette.primary.light');
  border-radius: 50%;
  animation: spin 1s linear infinite reverse;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.loading-card h3 {
  color: v-bind('colorPalette.neutral[800]');
  margin-bottom: 8px;
  font-weight: 600;
}

.loading-card p {
  color: v-bind('colorPalette.neutral[600]');
  font-size: 0.875rem;
}

/* Error & No Shop States */
.error-container, .no-shop-container {
  min-height: 400px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.error-card, .no-shop-card {
  text-align: center;
  padding: 40px;
  background: white;
  border-radius: 20px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.08);
  max-width: 400px;
  width: 100%;
}

.error-icon, .no-shop-icon {
  margin-bottom: 24px;
}

.error-card h3, .no-shop-card h3 {
  color: v-bind('colorPalette.neutral[900]');
  margin-bottom: 8px;
  font-weight: 600;
}

.error-card p, .no-shop-card p {
  color: v-bind('colorPalette.neutral[600]');
  margin-bottom: 24px;
  line-height: 1.5;
}

.error-actions, .no-shop-actions {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: 24px;
}

.action-btn {
  height: 44px !important;
  border-radius: 12px !important;
}

.create-btn {
  height: 48px !important;
}

/* Status Banner */
.status-banner {
  border-radius: 20px;
  overflow: hidden;
  box-shadow: 0 20px 40px rgba(63, 131, 199, 0.2);
  margin-bottom: 24px;
  color: white;
  position: relative;
  overflow: hidden;
}

.status-banner::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: linear-gradient(45deg, transparent 30%, rgba(255, 255, 255, 0.1) 50%, transparent 70%);
  animation: shimmer 3s infinite;
}

@keyframes shimmer {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(100%); }
}

.banner-content {
  padding: 24px;
  display: flex;
  align-items: center;
  gap: 20px;
  position: relative;
  z-index: 1;
}

.status-icon-wrapper {
  flex-shrink: 0;
}

.icon-circle {
  width: 64px;
  height: 64px;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.3);
}

.status-text {
  flex: 1;
}

.status-title {
  font-size: 1.5rem;
  font-weight: 700;
  margin-bottom: 4px;
  letter-spacing: -0.5px;
}

.status-subtitle {
  opacity: 0.9;
  font-size: 0.875rem;
  margin-bottom: 16px;
  font-weight: 400;
}

.shop-name-chip {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.shop-name {
  font-size: 1.125rem;
  font-weight: 600;
  margin: 0;
}

.status-badge {
  padding: 6px 14px;
  border-radius: 20px;
  font-size: 0.75rem;
  font-weight: 600;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.3);
}

/* Status Details */
.status-details {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

/* Cards */
.message-card, .info-card, .actions-card, .timeline-card {
  background: white;
  border-radius: 20px;
  padding: 24px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.05);
  border: 1px solid v-bind('colorPalette.neutral[200]');
}

.card-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 20px;
}

.card-header h3 {
  color: v-bind('colorPalette.neutral[900]');
  font-size: 1.125rem;
  font-weight: 600;
  margin: 0;
  display: flex;
  align-items: center;
  gap: 8px;
}

/* Message Card */
.message-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}

.message-icon {
  width: 40px;
  height: 40px;
  background: v-bind('statusColors.light + "20"');
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.message-content {
  color: v-bind('colorPalette.neutral[700]');
  line-height: 1.6;
  margin-bottom: 16px;
  font-size: 0.9375rem;
}

.message-footer {
  border-top: 1px solid v-bind('colorPalette.neutral[200]');
  padding-top: 16px;
}

.timestamp {
  color: v-bind('colorPalette.neutral[600]');
  font-size: 0.875rem;
  display: flex;
  align-items: center;
  gap: 6px;
}

/* Info Grid */
.info-grid {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.info-row {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.info-label {
  color: v-bind('colorPalette.neutral[600]');
  font-size: 0.875rem;
  font-weight: 500;
  display: flex;
  align-items: center;
  gap: 8px;
}

.info-value {
  color: v-bind('colorPalette.neutral[900]');
  font-size: 0.9375rem;
  font-weight: 500;
}

.info-value.multiline {
  line-height: 1.5;
}

/* Steps */
.steps-container {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.step-item {
  display: flex;
  align-items: flex-start;
  gap: 16px;
  padding: 16px;
  border-radius: 12px;
  border-left: 4px solid;
  background: v-bind('colorPalette.neutral[50]');
  transition: all 0.3s ease;
  position: relative;
  overflow: hidden;
}

.step-item::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: linear-gradient(45deg, transparent 30%, rgba(255, 255, 255, 0.3) 50%, transparent 70%);
  opacity: 0;
  transition: opacity 0.3s ease;
}

.step-item:hover::before {
  opacity: 1;
  animation: shimmer 2s infinite;
}

.step-number {
  width: 28px;
  height: 28px;
  background: v-bind('colorPalette.neutral[200]');
  color: v-bind('colorPalette.neutral[700]');
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.75rem;
  font-weight: 600;
  flex-shrink: 0;
}

.step-icon {
  flex-shrink: 0;
  margin-top: 2px;
}

.step-content {
  flex: 1;
}

.step-content h4 {
  color: v-bind('colorPalette.neutral[900]');
  font-size: 0.9375rem;
  font-weight: 600;
  margin: 0 0 4px 0;
}

.step-content p {
  color: v-bind('colorPalette.neutral[600]');
  font-size: 0.8125rem;
  margin: 0;
  line-height: 1.4;
}

/* Timeline */
.timeline {
  display: flex;
  flex-direction: column;
  gap: 32px;
  position: relative;
}

.timeline::before {
  content: '';
  position: absolute;
  left: 28px;
  top: 0;
  bottom: 0;
  width: 2px;
  background: v-bind('colorPalette.neutral[300]');
  z-index: 1;
}

.timeline-item {
  display: flex;
  gap: 16px;
  position: relative;
  z-index: 2;
}

.timeline-dot {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  flex-shrink: 0;
  position: relative;
  z-index: 2;
  border: 3px solid white;
}

.timeline-content {
  flex: 1;
  padding-top: 2px;
}

.timeline-content h4 {
  color: v-bind('colorPalette.neutral[900]');
  font-size: 0.9375rem;
  font-weight: 600;
  margin: 0 0 4px 0;
}

.timeline-content p {
  color: v-bind('colorPalette.neutral[600]');
  font-size: 0.8125rem;
  margin: 0;
}

.timeline-item.completed .timeline-content h4 {
  color: v-bind('colorPalette.neutral[700]');
}

.timeline-item.completed .timeline-content p {
  color: v-bind('colorPalette.neutral[500]');
}

/* Action Buttons */
.action-buttons {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.primary-action {
  height: 56px !important;
  border-radius: 16px !important;
  font-weight: 600 !important;
  font-size: 1rem !important;
  color: white !important;
  box-shadow: 0 8px 24px rgba(63, 131, 199, 0.3) !important;
  transition: all 0.3s ease !important;
  position: relative;
  overflow: hidden;
}

.primary-action::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: linear-gradient(45deg, transparent 30%, rgba(255, 255, 255, 0.2) 50%, transparent 70%);
  opacity: 0;
  transition: opacity 0.3s ease;
}

.primary-action:hover {
  transform: translateY(-2px);
  box-shadow: 0 12px 32px rgba(63, 131, 199, 0.4) !important;
}

.primary-action:hover::before {
  opacity: 1;
  animation: shimmer 2s infinite;
}

.secondary-actions {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.secondary-btn {
  height: 48px !important;
  border-radius: 14px !important;
  font-weight: 500 !important;
  border: 2px solid v-bind('colorPalette.neutral[300]') !important;
}

.link-btn {
  color: v-bind('colorPalette.primary.main') !important;
  border-color: v-bind('colorPalette.primary.light') !important;
}

/* Footer Note */
.footer-note {
  text-align: center;
  padding: 20px;
  background: v-bind('colorPalette.neutral[50]');
  border-radius: 16px;
  border: 1px solid v-bind('colorPalette.neutral[200]');
}

.footer-note p {
  color: v-bind('colorPalette.neutral[600]');
  font-size: 0.875rem;
  margin: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

/* Animations */
.pulse-icon {
  animation: pulse 2s infinite;
}

@keyframes pulse {
  0% { transform: scale(1); opacity: 1; }
  50% { transform: scale(1.1); opacity: 0.8; }
  100% { transform: scale(1); opacity: 1; }
}

/* Responsive Design */
@media (max-width: 600px) {
  .app-header {
    height: 160px;
  }
  
  .header-content {
    padding: calc(20px + env(safe-area-inset-top, 0)) 16px 0;
  }
  
  .header-title h1 {
    font-size: 1.5rem;
  }
  
  .main-content {
    padding: 0 12px 32px;
    margin-top: -32px;
  }
  
  .banner-content {
    padding: 20px;
    flex-direction: column;
    text-align: center;
    gap: 16px;
  }
  
  .shop-name-chip {
    justify-content: center;
  }
  
  .icon-circle {
    width: 56px;
    height: 56px;
  }
  
  .status-title {
    font-size: 1.25rem;
  }
  
  .message-card,
  .info-card,
  .actions-card,
  .timeline-card {
    padding: 20px;
  }
  
  .primary-action {
    height: 52px !important;
  }
}

@media (max-width: 400px) {
  .app-header {
    height: 140px;
  }
  
  .header-title h1 {
    font-size: 1.25rem;
  }
  
  .status-banner {
    border-radius: 16px;
  }
  
  .timeline::before {
    left: 20px;
  }
  
  .timeline-dot {
    width: 24px;
    height: 24px;
  }
}

/* iOS Safe Areas */
@supports (-webkit-touch-callout: none) {
  .status-view-wrapper {
    min-height: -webkit-fill-available;
  }
}

/* Custom Notifications */
.custom-notification {
  position: fixed;
  top: 20px;
  right: 20px;
  background: white;
  border-radius: 16px;
  padding: 16px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.15);
  border-left: 4px solid;
  transform: translateX(120%);
  transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  z-index: 9999;
  max-width: 320px;
  display: flex;
  align-items: center;
  gap: 12px;
}

.custom-notification.show {
  transform: translateX(0);
}

.notification-icon .v-icon {
  font-size: 24px;
}

.notification-message {
  flex: 1;
  font-size: 0.875rem;
  font-weight: 500;
}

.notification-close {
  background: none;
  border: none;
  padding: 4px;
  cursor: pointer;
  color: v-bind('colorPalette.neutral[500]');
}

.notification-approved {
  border-left-color: v-bind('colorPalette.success.main');
}

.notification-declined {
  border-left-color: v-bind('colorPalette.error.main');
}

.notification-pending {
  border-left-color: v-bind('colorPalette.primary.main');
}

.custom-toast {
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%) translateY(100px);
  background: v-bind('colorPalette.neutral[900]');
  color: white;
  padding: 12px 20px;
  border-radius: 12px;
  font-size: 0.875rem;
  font-weight: 500;
  opacity: 0;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  z-index: 9999;
  display: flex;
  align-items: center;
  gap: 8px;
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.2);
}

.custom-toast.show {
  transform: translateX(-50%) translateY(0);
  opacity: 1;
}

.toast-success {
  background: v-bind('colorPalette.success.main');
}

.toast-info {
  background: v-bind('colorPalette.primary.main');
}

/* Improve touch targets */
.v-btn,
.info-row,
.step-item {
  min-height: 44px;
}

/* Prevent iOS auto-zoom */
input,
textarea,
select {
  font-size: 16px !important;
}
</style>