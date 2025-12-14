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
  // Convert "HH:MM:SS" to "HH:MM AM/PM"
  const [hours, minutes] = timeString.split(':')
  const hour = parseInt(hours)
  const ampm = hour >= 12 ? 'PM' : 'AM'
  const formattedHour = hour % 12 || 12
  return `${formattedHour}:${minutes} ${ampm}`
}

// Try to get shop ID from different sources
const getShopId = () => {
  // 1. Try URL query parameter
  if (route.query.shopId) {
    return route.query.shopId
  }
  
  // 2. Try URL path parameter
  if (route.params.id) {
    return route.params.id
  }
  
  // 3. Try localStorage (from shop creation)
  const storedShopId = localStorage.getItem('lastCreatedShopId')
  if (storedShopId) {
    return storedShopId
  }
  
  // 4. Try to get from authenticated user
  const userShopId = sessionStorage.getItem('userShopId')
  if (userShopId) {
    return userShopId
  }
  
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

    console.log('Fetching shop with ID:', shopId)

    // Get shop data from shops table using shop ID
    const { data: shopData, error: shopError } = await supabase
      .from('shops')
      .select('*')
      .eq('id', shopId)
      .single()

    if (shopError) {
      // If shop doesn't exist
      if (shopError.code === 'PGRST116') {
        console.log('Shop not found with ID:', shopId)
        shop.value = null
        error.value = 'Shop not found. Please check the shop ID or create a new shop.'
      } else {
        console.error('Shop fetch error:', shopError)
        throw shopError
      }
    } else {
      console.log('Shop data loaded:', shopData)
      shop.value = shopData
      
      // Store the shop ID for future reference
      localStorage.setItem('lastCreatedShopId', shopData.id)
      
      // Try to get user profile if owner_id exists
      if (shopData.owner_id) {
        try {
          const { data: profileData, error: profileError } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', shopData.owner_id)
            .single()

          if (!profileError && profileData) {
            console.log('Profile data loaded:', profileData)
            profile.value = profileData
          }
        } catch (profileErr) {
          console.log('No profile found or error loading profile:', profileErr)
          // It's okay if profile doesn't exist
        }
      }
      
      // Setup real-time subscription for shop updates
      if (shopData && shopData.id) {
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
          console.log('Shop status updated:', payload.new)
          shop.value = payload.new
          listening.value = true
          
          // Show notification if status changed
          if (payload.old && payload.old.status !== payload.new.status) {
            showStatusUpdateNotification(payload.new.status)
          }
        }
      )
      .subscribe((status) => {
        console.log('Subscription status:', status)
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
    alert(messages[newStatus])
  }
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
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  } catch (err) {
    console.error('Error formatting date:', err)
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
    alert('Status link copied to clipboard!')
  } catch (err) {
    console.error('Failed to copy:', err)
    // Fallback for older browsers
    const textArea = document.createElement('textarea')
    textArea.value = statusUrl
    document.body.appendChild(textArea)
    textArea.select()
    document.execCommand('copy')
    document.body.removeChild(textArea)
    alert('Link copied to clipboard!')
  }
}

// Go back function
const goBack = () => {
  router.go(-1)
}

// Computed properties
const shopStatus = computed(() => shop.value?.status || 'pending')
const isApproved = computed(() => shopStatus.value === 'approved')
const isDeclined = computed(() => shopStatus.value === 'declined')
const isPending = computed(() => shopStatus.value === 'pending')
const showActionSteps = computed(() => actionSteps.value.length > 0)

const cardColor = computed(() => {
  const colors = {
    approved: 'success-lighten-5',
    declined: 'error-lighten-5',
    pending: 'info-lighten-5'
  }
  return colors[shopStatus.value]
})

const iconColor = computed(() => {
  const colors = {
    approved: 'success',
    declined: 'error',
    pending: 'info'
  }
  return colors[shopStatus.value]
})

const statusIcon = computed(() => {
  const icons = {
    approved: 'mdi-check-circle',
    declined: 'mdi-close-circle',
    pending: 'mdi-clock-time-three-outline'
  }
  return icons[shopStatus.value]
})

const statusTitle = computed(() => {
  const titles = {
    approved: 'Congratulations!',
    declined: 'Application Review',
    pending: 'Application Submitted'
  }
  return titles[shopStatus.value]
})

const statusMessage = computed(() => {
  const messages = {
    approved: 'Your shop has been approved!',
    declined: 'Your shop application has been declined',
    pending: 'Your application is under review'
  }
  return messages[shopStatus.value]
})

const statusContent = computed(() => {
  const contents = {
    approved: 'Your shop is now live and ready to serve customers. Welcome to our marketplace!',
    declined: 'Our team has reviewed your application and found areas needing attention. Please check the details below.',
    pending: 'Our admin team will review your application. This typically takes 24-48 hours. You will be notified once a decision is made.'
  }
  return contents[shopStatus.value]
})

const statusChipColor = computed(() => iconColor.value)

const messageCardColor = computed(() => {
  return `${iconColor.value}-lighten-4`
})

// Action Steps
const actionSteps = computed(() => {
  if (isApproved.value) {
    return [
      {
        icon: 'mdi-package-variant',
        color: 'success',
        title: 'Add Products',
        description: 'Start listing your products'
      },

    ]
  } else if (isDeclined.value) {
    return [
      {
        icon: 'mdi-pencil',
        color: 'error',
        title: 'Review Feedback',
        description: 'Check reasons for decline'
      },
      {
        icon: 'mdi-update',
        color: 'error',
        title: 'Update Info',
        description: 'Make necessary changes'
      },
      {
        icon: 'mdi-send',
        color: 'error',
        title: 'Resubmit',
        description: 'Submit updated application'
      }
    ]
  } else {
    return [
      {
        icon: 'mdi-clipboard-list',
        color: 'info',
        title: 'Prepare Products',
        description: 'Get product catalog ready'
      },
      {
        icon: 'mdi-image',
        color: 'info',
        title: 'Upload Images',
        description: 'Prepare shop photos'
      },
      {
        icon: 'mdi-information',
        color: 'info',
        title: 'Stay Updated',
        description: 'Check back regularly'
      }
    ]
  }
})

// Action handlers
const goToHome = () => {
  router.push('/')
}

const handleApproved = () => {
  // If user is logged in, go to dashboard, otherwise show login prompt
  if (profile.value) {
    router.push('/usershop')
  } else {
    alert('Please log in to access your dashboard.')
    router.push('/login')
  }
}

const handleDeclined = () => {
  if (profile.value) {
    router.push('/shop-build')
  } else {
    alert('Please log in to edit your shop application.')
    router.push('/login')
  }
}

const handlePending = () => {
  if (profile.value) {
    router.push('/usershop')
  } else {
    alert('Please log in to prepare your shop.')
    router.push('/login')
  }
}

const contactSupport = () => {
  window.open('mailto:support@closeshop.com')
}

const checkStatus = () => {
  const details = `
Shop Details:
Name: ${shop.value.business_name}
Status: ${shop.value.status}
Created: ${formatDate(shop.value.created_at)}
Last Updated: ${formatDate(shop.value.updated_at)}
Address: ${formatAddress()}
Shop ID: ${shop.value.id}

${profile.value ? `Owner: ${profile.value.first_name} ${profile.value.last_name}` : ''}
${profile.value?.phone ? `Phone: ${profile.value.phone}` : ''}
${profile.value?.role ? `Role: ${profile.value.role}` : ''}
  `
  alert(details.trim())
}

const createShop = () => {
  router.push('/shop-build')
}

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
    <!-- Back Button - Fixed at top -->
    <div class="back-button-container">
      <v-btn 
        icon 
        @click="goBack"
        color="primary"
        variant="text"
        class="back-btn"
        size="large"
      >
        <v-icon>mdi-arrow-left</v-icon>
      </v-btn>
      <h2 class="page-title">Shop Status</h2>
    </div>

    <v-container class="fill-height">
      <v-row justify="center" align="center">
        <v-col cols="12" sm="10" md="8" lg="6">
          <!-- Loading State -->
          <v-card v-if="loading" class="pa-6 text-center loading-card">
            <v-progress-circular
              indeterminate
              color="primary"
              size="48"
              class="mb-4"
            ></v-progress-circular>
            <h3 class="text-h6 mb-2">Loading shop status...</h3>
            <p class="text-body-2 text-medium-emphasis">
              Fetching your information...
            </p>
          </v-card>

          <!-- Error State -->
          <v-card v-else-if="error" class="pa-6 text-center error-card">
            <v-icon size="56" color="error" class="mb-4">mdi-alert-circle</v-icon>
            <h3 class="text-h6 mb-2">Error Loading Status</h3>
            <p class="text-body-2 mb-4">{{ error }}</p>
            <div class="d-flex justify-center gap-2 flex-wrap">
              <v-btn color="primary" @click="fetchData" size="small">
                Try Again
              </v-btn>
              <v-btn color="secondary" variant="outlined" @click="goToHome" size="small">
                Go Home
              </v-btn>
            </div>
          </v-card>

          <!-- No Shop State -->
          <v-card v-else-if="!shop" class="pa-6 text-center no-shop-card">
            <v-icon size="56" color="warning" class="mb-4">mdi-store-alert</v-icon>
            <h3 class="text-h6 mb-2">No Shop Found</h3>
            <p class="text-body-2 mb-4">You haven't created a shop yet.</p>
            <div class="d-flex justify-center gap-2 flex-wrap">
              <v-btn color="primary" @click="createShop" size="small">
                Create a Shop
              </v-btn>
              <v-btn color="secondary" variant="outlined" @click="goToHome" size="small">
                Go Home
              </v-btn>
            </div>
          </v-card>

          <!-- Main Status Card -->
          <v-card v-else class="pa-4 elevation-4 rounded-lg" :color="cardColor">
            <!-- Status Header -->
            <div class="text-center mb-4">
              <!-- Status Icon -->
              <div class="status-icon-container mb-3">
                <v-icon 
                  size="80" 
                  :color="iconColor"
                  :class="{ 'pulse-animation': isPending }"
                >
                  {{ statusIcon }}
                </v-icon>
              </div>

              <!-- Shop Name -->
              <h2 class="text-h5 font-weight-bold mb-1">
                {{ shop.business_name }}
              </h2>

              <!-- Status Title -->
              <h1 class="text-h4 font-weight-bold mb-1" :class="`text-${iconColor}`">
                {{ statusTitle }}
              </h1>

              <!-- Status Subtitle -->
              <p class="text-subtitle-1 text-medium-emphasis mb-1">
                {{ statusMessage }}
              </p>

              <!-- Status Chip -->
              <v-chip
                :color="statusChipColor"
                size="large"
                class="mt-3"
                label
                :prepend-icon="statusIcon"
              >
                <span class="text-subtitle-2 font-weight-bold">{{ shopStatus.toUpperCase() }}</span>
              </v-chip>

              <!-- Owner Info if profile exists -->
              <div v-if="profile" class="mt-2">
                <div class="d-flex align-center justify-center">
                  <v-avatar size="28" class="mr-2" v-if="profile.avatar_url">
                    <v-img :src="profile.avatar_url"></v-img>
                  </v-avatar>
                  <v-avatar size="28" color="primary" class="mr-2" v-else>
                    <span class="text-white text-caption">
                      {{ getInitials(profile.first_name, profile.last_name) }}
                    </span>
                  </v-avatar>
                  <span class="text-caption">
                    Owner: {{ profile.first_name }} {{ profile.last_name }}
                  </span>
                </div>
              </div>

              <!-- Submission Date -->
              <div class="mt-1 text-caption text-medium-emphasis">
                Submitted: {{ formatDate(shop.created_at) }}
              </div>
            </div>

            <!-- Status Content -->
            <v-card-text class="text-center pa-2">
              <!-- Status Message Card -->
              <v-card 
                variant="outlined" 
                :color="messageCardColor"
                class="mb-4"
                elevation="1"
              >
                <v-card-text class="py-3">
                  <v-icon :color="iconColor" size="20" class="mr-2">{{ statusIcon }}</v-icon>
                  <span class="text-body-2 font-weight-medium">
                    {{ statusContent }}
                  </span>
                </v-card-text>
              </v-card>

              <!-- Shop Information -->
              <v-card class="mb-4" variant="outlined">
                <v-card-title class="text-subtitle-2 font-weight-bold py-3">
                  <v-icon :color="iconColor" class="mr-2" size="18">mdi-store</v-icon>
                  Shop Information
                </v-card-title>
                <v-card-text class="py-2">
                  <v-list density="compact" class="py-0">
                    <v-list-item class="px-0">
                      <template v-slot:prepend>
                        <v-icon size="18">mdi-store</v-icon>
                      </template>
                      <v-list-item-title class="text-body-2">{{ shop.business_name }}</v-list-item-title>
                      <v-list-item-subtitle class="text-caption">Business Name</v-list-item-subtitle>
                    </v-list-item>
                    
                    <v-list-item class="px-0">
                      <template v-slot:prepend>
                        <v-icon size="18">mdi-map-marker</v-icon>
                      </template>
                      <v-list-item-title class="text-body-2">
                        {{ formatAddress() }}
                      </v-list-item-title>
                      <v-list-item-subtitle class="text-caption">Location</v-list-item-subtitle>
                    </v-list-item>
                    
                    <v-list-item v-if="shop.description" class="px-0">
                      <template v-slot:prepend>
                        <v-icon size="18">mdi-text</v-icon>
                      </template>
                      <v-list-item-title class="text-body-2 text-truncate">{{ shop.description }}</v-list-item-title>
                      <v-list-item-subtitle class="text-caption">Description</v-list-item-subtitle>
                    </v-list-item>
                    
                    <v-list-item v-if="shop.valid_id_front || shop.valid_id_back" class="px-0">
                      <template v-slot:prepend>
                        <v-icon size="18">mdi-card-account-details</v-icon>
                      </template>
                      <v-list-item-title class="text-body-2">
                        <span v-if="shop.valid_id_front && shop.valid_id_back">IDs Uploaded ✓</span>
                        <span v-else>ID Upload Required</span>
                      </v-list-item-title>
                      <v-list-item-subtitle class="text-caption">Valid ID</v-list-item-subtitle>
                    </v-list-item>
                    
                    <v-list-item v-if="shop.open_time && shop.close_time" class="px-0">
                      <template v-slot:prepend>
                        <v-icon size="18">mdi-clock</v-icon>
                      </template>
                      <v-list-item-title class="text-body-2">
                        {{ formatTime(shop.open_time) }} - {{ formatTime(shop.close_time) }}
                      </v-list-item-title>
                      <v-list-item-subtitle class="text-caption">Business Hours</v-list-item-subtitle>
                    </v-list-item>
                  </v-list>
                </v-card-text>
              </v-card>

              <!-- Action Steps -->
              <div v-if="showActionSteps" class="action-steps mb-4">
                <h3 class="text-h6 font-weight-bold mb-3">
                  {{ isApproved ? 'Next Steps:' : 
                     isDeclined ? 'What to do next:' : 
                     'While you wait:' }}
                </h3>
                
                <v-row class="justify-center">
                  <v-col 
                    v-for="(step, index) in actionSteps" 
                    :key="index" 
                    cols="12" 
                    sm="4"
                    class="py-1"
                  >
                    <v-card 
                      class="pa-3 text-center h-100" 
                      elevation="0"
                      :class="`step-card step-${index + 1}`"
                      variant="outlined"
                    >
                      <v-icon size="28" :color="step.color" class="mb-1">
                        {{ step.icon }}
                      </v-icon>
                      <h4 class="text-subtitle-2 font-weight-bold mb-1">
                        {{ step.title }}
                      </h4>
                      <p class="text-caption text-medium-emphasis">
                        {{ step.description }}
                      </p>
                    </v-card>
                  </v-col>
                </v-row>
              </div>

              <!-- Main Action Button -->
              <div class="text-center mt-4">
                <v-btn
                  v-if="isApproved"
                  color="success"
                  size="large"
                  variant="flat"
                  @click="handleApproved"
                  prepend-icon="mdi-view-dashboard"
                  block
                  class="mb-2"
                >
                  Go to Dashboard
                </v-btn>
                
                <v-btn
                  v-else-if="isDeclined"
                  color="error"
                  size="large"
                  variant="flat"
                  @click="handleDeclined"
                  prepend-icon="mdi-pencil"
                  block
                  class="mb-2"
                >
                  Edit Application
                </v-btn>
                
                <v-btn
                  v-else
                  color="info"
                  size="large"
                  variant="flat"
                  @click="handlePending"
                  prepend-icon="mdi-clipboard-check"
                  block
                  class="mb-2"
                >
                  Prepare Shop
                </v-btn>
              </div>

              <!-- Secondary Actions -->
              <div class="text-center mt-3">
                <v-btn
                  v-if="isDeclined"
                  color="primary"
                  variant="text"
                  @click="contactSupport"
                  prepend-icon="mdi-lifebuoy"
                  size="small"
                  class="mr-1 mb-1"
                >
                  Contact Support
                </v-btn>
                
                <v-btn
                  v-if="isPending"
                  color="warning"
                  variant="text"
                  @click="checkStatus"
                  prepend-icon="mdi-information"
                  size="small"
                  class="mb-1"
                >
                  Check Details
                </v-btn>
              </div>

              <!-- Timeline for Shop Review -->
              <div v-if="isPending" class="mt-4">
                <h3 class="text-h6 font-weight-bold mb-3">Review Timeline</h3>
                <v-timeline density="compact" align="start" class="px-0">
                  <v-timeline-item
                    dot-color="success"
                    size="x-small"
                    class="pb-2"
                  >
                    <div class="text-subtitle-2">Application Submitted</div>
                    <div class="text-caption">{{ formatDate(shop.created_at) }}</div>
                  </v-timeline-item>

                  <v-timeline-item
                    dot-color="info"
                    size="x-small"
                    class="pb-2"
                  >
                    <div class="text-subtitle-2">Under Review</div>
                    <div class="text-caption">Admin is reviewing your application</div>
                  </v-timeline-item>

                  <v-timeline-item
                    :dot-color="isApproved ? 'success' : isDeclined ? 'error' : 'grey'"
                    size="x-small"
                  >
                    <div class="text-subtitle-2">Decision</div>
                    <div class="text-caption">
                      {{ isApproved ? 'Approved' : isDeclined ? 'Declined' : 'Awaiting decision' }}
                    </div>
                  </v-timeline-item>
                </v-timeline>
              </div>

              <!-- Share/Bookmark Section -->
              <div class="mt-4 pt-3 border-t text-center">
                <p class="text-caption text-medium-emphasis mb-2">
                  Bookmark this page to check your status later
                </p>
                <v-btn
                  color="secondary"
                  variant="outlined"
                  size="small"
                  prepend-icon="mdi-content-copy"
                  @click="copyStatusLink"
                  block
                >
                  Copy Status Link
                </v-btn>
              </div>
            </v-card-text>
          </v-card>

          <!-- Refresh Button -->
          <div class="text-center mt-4">
            <v-btn
              icon
              @click="fetchData"
              :loading="loading"
              color="primary"
              variant="text"
              size="large"
            >
              <v-icon>mdi-refresh</v-icon>
            </v-btn>
          </div>
        </v-col>
      </v-row>
    </v-container>
  </div>
</template>

<style scoped>
.status-view-wrapper {
  min-height: 100vh;
  background: linear-gradient(135deg, #f5f7fa 0%, #e3e8f0 100%);
  padding-top: env(safe-area-inset-top, 0);
  padding-bottom: env(safe-area-inset-bottom, 0);
  box-sizing: border-box;
  overflow-x: hidden;
}

.back-button-container {
  position: sticky;
  top: 0;
  left: 0;
  right: 0;
  background: linear-gradient(135deg, #354d7c, #5276b0);
  color: white;
  z-index: 100;
  padding: calc(12px + env(safe-area-inset-top, 0)) 16px 12px 16px;
  display: flex;
  align-items: center;
  gap: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
}

.back-btn {
  color: white !important;
  width: 40px !important;
  height: 40px !important;
}

.page-title {
  margin: 0;
  font-size: 1.25rem;
  font-weight: 600;
  flex: 1;
}

.fill-height {
  min-height: calc(100vh - 64px);
  padding-top: 16px;
  padding-bottom: 16px;
  overflow-y: auto;
}

.status-icon-container {
  position: relative;
  display: inline-block;
}

.pulse-animation {
  animation: pulse 2s infinite;
}

@keyframes pulse {
  0% { transform: scale(1); }
  50% { transform: scale(1.05); }
  100% { transform: scale(1); }
}

.step-card {
  transition: all 0.3s ease;
  border-radius: 8px;
  height: 100%;
  min-height: 100px;
}

.step-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 8px rgba(0,0,0,0.1) !important;
}

.error-card {
  border: 1px solid #f44336;
}

.no-shop-card {
  border: 1px solid #ff9800;
}

.loading-card {
  border: 1px solid #2196f3;
}

.border-t {
  border-top: 1px solid rgba(0,0,0,0.1);
}

.gap-2 {
  gap: 8px;
}

/* Responsive adjustments */
@media (max-width: 600px) {
  .fill-height {
    padding: 12px;
    min-height: calc(100vh - 56px);
  }

  .back-button-container {
    padding: calc(8px + env(safe-area-inset-top, 0)) 12px 8px 12px;
  }

  .page-title {
    font-size: 1.1rem;
  }

  .back-btn {
    width: 36px !important;
    height: 36px !important;
  }

  .step-card {
    min-height: 90px;
  }
}

@media (max-width: 480px) {
  .fill-height {
    padding: 8px;
  }

  .action-steps .v-col {
    padding: 4px !important;
  }

  .step-card {
    padding: 12px !important;
    min-height: 80px;
  }

  .v-btn {
    font-size: 0.875rem !important;
  }

  .v-timeline-item {
    padding-bottom: 8px !important;
  }
}

/* Prevent auto-zoom on iOS */
input,
textarea,
select,
.v-text-field,
.v-select {
  font-size: 16px !important; /* Prevents iOS auto-zoom */
}

/* Improve touch targets */
.v-btn,
.v-list-item,
.v-chip {
  min-height: 44px !important; /* Minimum touch target size */
}

/* Card hover effects */
.v-card {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.v-card:hover {
  box-shadow: 0 4px 12px rgba(0,0,0,0.1) !important;
}

.text-truncate {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Ensure proper scrolling on mobile */
.v-container,
.v-row,
.v-col {
  max-width: 100%;
}

/* Fix for iOS safari 100vh issue */
@supports (-webkit-touch-callout: none) {
  .status-view-wrapper {
    min-height: -webkit-fill-available;
  }
}

/* Safe area adjustments for notched devices */
@supports (padding: max(0px)) {
  .back-button-container {
    padding-left: max(16px, env(safe-area-inset-left));
    padding-right: max(16px, env(safe-area-inset-right));
  }
}
</style>