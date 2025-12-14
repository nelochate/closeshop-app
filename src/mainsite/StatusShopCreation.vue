<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { supabase } from '@/utils/supabase' // Remove createClient import

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
      {
        icon: 'mdi-storefront',
        color: 'success',
        title: 'Customize Shop',
        description: 'Personalize your shop'
      },
      {
        icon: 'mdi-chart-line',
        color: 'success',
        title: 'View Dashboard',
        description: 'Monitor performance'
      }
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
    router.push('/seller/dashboard')
  } else {
    alert('Please log in to access your dashboard.')
    router.push('/login')
  }
}

const handleDeclined = () => {
  if (profile.value) {
    router.push(`/seller/shop/edit/${shop.value.id}`)
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
  router.push('/create-shop')
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
  <v-container class="fill-height bg-grey-lighten-4">
    <v-row justify="center" align="center">
      <v-col cols="12" md="8" lg="6" xl="5">
        <!-- Header with Home and Reload buttons -->
        <div class="d-flex justify-space-between align-center mb-4">
          <v-btn 
            icon 
            @click="goToHome"
            color="primary"
            variant="text"
            size="small"
          >
            <v-icon>mdi-home</v-icon>
          </v-btn>
          
          <h2 class="text-h5 font-weight-bold">Shop Application Status</h2>
          
          <v-btn 
            icon 
            @click="fetchData"
            :loading="loading"
            color="primary"
            variant="text"
            size="small"
          >
            <v-icon>mdi-refresh</v-icon>
          </v-btn>
        </div>

        <!-- Loading State -->
        <v-card v-if="loading" class="pa-8 text-center">
          <v-progress-circular
            indeterminate
            color="primary"
            size="64"
            class="mb-4"
          ></v-progress-circular>
          <h2 class="text-h5 mb-2">Loading shop status...</h2>
          <p class="text-body-1 text-medium-emphasis">
            Fetching your information...
          </p>
        </v-card>

        <!-- Error State -->
        <v-card v-else-if="error" class="pa-8 text-center error-card">
          <v-icon size="64" color="error" class="mb-4">mdi-alert-circle</v-icon>
          <h2 class="text-h5 mb-2">Error Loading Status</h2>
          <p class="text-body-1 mb-4">{{ error }}</p>
          <div class="d-flex justify-center gap-2">
            <v-btn color="primary" @click="fetchData">
              Try Again
            </v-btn>
            <v-btn color="secondary" variant="outlined" @click="goToHome">
              Go Home
            </v-btn>
          </div>
        </v-card>

        <!-- No Shop State -->
        <v-card v-else-if="!shop" class="pa-8 text-center">
          <v-icon size="64" color="warning" class="mb-4">mdi-store-alert</v-icon>
          <h2 class="text-h5 mb-2">No Shop Found</h2>
          <p class="text-body-1 mb-4">You haven't created a shop yet.</p>
          <div class="d-flex justify-center gap-2">
            <v-btn color="primary" @click="createShop">
              Create a Shop
            </v-btn>
            <v-btn color="secondary" variant="outlined" @click="goToHome">
              Go Home
            </v-btn>
          </div>
        </v-card>

        <!-- Main Status Card -->
        <v-card v-else class="pa-8 elevation-6 rounded-xl" :color="cardColor">
          <!-- Status Header -->
          <div class="text-center mb-6">
            <!-- Animated Status Icon -->
            <div class="status-icon-container mb-4">
              <v-icon 
                size="100" 
                :color="iconColor"
                :class="{ 'pulse-animation': isPending }"
              >
                {{ statusIcon }}
              </v-icon>
            </div>

            <!-- Shop Name -->
            <h2 class="text-h4 font-weight-bold mb-2">
              {{ shop.business_name }}
            </h2>

            <!-- Status Title -->
            <h1 class="text-h3 font-weight-bold mb-2" :class="`text-${iconColor}`">
              {{ statusTitle }}
            </h1>

            <!-- Status Subtitle -->
            <p class="text-h5 text-medium-emphasis mb-1">
              {{ statusMessage }}
            </p>

            <!-- Status Chip -->
            <v-chip
              :color="statusChipColor"
              size="x-large"
              class="mt-4"
              label
              :prepend-icon="statusIcon"
            >
              <span class="text-h6 font-weight-bold">{{ shopStatus.toUpperCase() }}</span>
            </v-chip>

            <!-- Owner Info if profile exists -->
            <div v-if="profile" class="mt-3">
              <div class="d-flex align-center justify-center">
                <v-avatar size="32" class="mr-2" v-if="profile.avatar_url">
                  <v-img :src="profile.avatar_url"></v-img>
                </v-avatar>
                <v-avatar size="32" color="primary" class="mr-2" v-else>
                  <span class="text-white text-caption">
                    {{ getInitials(profile.first_name, profile.last_name) }}
                  </span>
                </v-avatar>
                <span class="text-body-2">
                  Owner: {{ profile.first_name }} {{ profile.last_name }}
                </span>
              </div>
            </div>

            <!-- Submission Date -->
            <div class="mt-2 text-caption text-medium-emphasis">
              Submitted on: {{ formatDate(shop.created_at) }}
            </div>

            <!-- Shop ID (for reference) -->
            <div class="mt-1 text-caption text-medium-emphasis">
              Shop ID: {{ shop.id.substring(0, 8) }}...
            </div>
          </div>

          <!-- Status Content -->
          <v-card-text class="text-center">
            <!-- Status Message Card -->
            <v-card 
              variant="outlined" 
              :color="messageCardColor"
              class="mb-6"
              elevation="2"
            >
              <v-card-text>
                <v-icon :color="iconColor" size="24" class="mr-2">{{ statusIcon }}</v-icon>
                <span class="text-body-1 font-weight-medium">
                  {{ statusContent }}
                </span>
              </v-card-text>
            </v-card>

            <!-- Shop Information -->
            <v-card class="mb-6" variant="outlined">
              <v-card-title class="text-subtitle-1 font-weight-bold">
                <v-icon :color="iconColor" class="mr-2">mdi-store</v-icon>
                Shop Information
              </v-card-title>
              <v-card-text>
                <v-list density="compact">
                  <v-list-item>
                    <template v-slot:prepend>
                      <v-icon>mdi-store</v-icon>
                    </template>
                    <v-list-item-title>{{ shop.business_name }}</v-list-item-title>
                    <v-list-item-subtitle>Business Name</v-list-item-subtitle>
                  </v-list-item>
                  
                  <v-list-item>
                    <template v-slot:prepend>
                      <v-icon>mdi-map-marker</v-icon>
                    </template>
                    <v-list-item-title>
                      {{ formatAddress() }}
                    </v-list-item-title>
                    <v-list-item-subtitle>Location</v-list-item-subtitle>
                  </v-list-item>
                  
                  <v-list-item v-if="shop.description">
                    <template v-slot:prepend>
                      <v-icon>mdi-text</v-icon>
                    </template>
                    <v-list-item-title class="text-truncate">{{ shop.description }}</v-list-item-title>
                    <v-list-item-subtitle>Description</v-list-item-subtitle>
                  </v-list-item>
                  
                  <v-list-item v-if="shop.valid_id_front || shop.valid_id_back">
                    <template v-slot:prepend>
                      <v-icon>mdi-card-account-details</v-icon>
                    </template>
                    <v-list-item-title>
                      <span v-if="shop.valid_id_front && shop.valid_id_back">IDs Uploaded ✓</span>
                      <span v-else>ID Upload Required</span>
                    </v-list-item-title>
                    <v-list-item-subtitle>Valid ID</v-list-item-subtitle>
                  </v-list-item>
                  
                  <v-list-item v-if="shop.open_time && shop.close_time">
                    <template v-slot:prepend>
                      <v-icon>mdi-clock</v-icon>
                    </template>
                    <v-list-item-title>
                      {{ formatTime(shop.open_time) }} - {{ formatTime(shop.close_time) }}
                    </v-list-item-title>
                    <v-list-item-subtitle>Business Hours</v-list-item-subtitle>
                  </v-list-item>
                </v-list>
              </v-card-text>
            </v-card>

            <!-- Action Steps -->
            <div v-if="showActionSteps" class="action-steps mb-8">
              <h3 class="text-h5 font-weight-bold mb-4">
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
                >
                  <v-card 
                    class="pa-4 text-center h-100" 
                    elevation="1"
                    :class="`step-card step-${index + 1}`"
                  >
                    <v-icon size="32" :color="step.color" class="mb-2">
                      {{ step.icon }}
                    </v-icon>
                    <h4 class="text-subtitle-1 font-weight-bold mb-2">
                      {{ step.title }}
                    </h4>
                    <p class="text-body-2 text-medium-emphasis">
                      {{ step.description }}
                    </p>
                  </v-card>
                </v-col>
              </v-row>
            </div>

            <!-- Main Action Button -->
            <div class="text-center mt-8">
              <v-btn
                v-if="isApproved"
                color="success"
                size="large"
                variant="flat"
                @click="handleApproved"
                prepend-icon="mdi-view-dashboard"
                rounded="xl"
                class="px-8"
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
                rounded="xl"
                class="px-8"
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
                rounded="xl"
                class="px-8"
              >
                Prepare Shop
              </v-btn>
            </div>

            <!-- Secondary Actions -->
            <div class="text-center mt-4">
              <v-btn
                v-if="isDeclined"
                color="primary"
                variant="text"
                @click="contactSupport"
                prepend-icon="mdi-lifebuoy"
                class="mr-2"
              >
                Contact Support
              </v-btn>
              
              <v-btn
                v-if="isPending"
                color="warning"
                variant="text"
                @click="checkStatus"
                prepend-icon="mdi-information"
              >
                Check Status Details
              </v-btn>
            </div>

           

            <!-- Timeline for Shop Review -->
            <div v-if="isPending" class="mt-8">
              <h3 class="text-h5 font-weight-bold mb-4">Review Timeline</h3>
              <v-timeline density="compact" align="start">
                <v-timeline-item
                  dot-color="success"
                  size="small"
                >
                  <div class="text-subtitle-1">Application Submitted</div>
                  <div class="text-caption">{{ formatDate(shop.created_at) }}</div>
                </v-timeline-item>

                <v-timeline-item
                  dot-color="info"
                  size="small"
                >
                  <div class="text-subtitle-1">Under Review</div>
                  <div class="text-caption">Admin is reviewing your application</div>
                </v-timeline-item>

                <v-timeline-item
                  :dot-color="isApproved ? 'success' : isDeclined ? 'error' : 'grey'"
                  size="small"
                >
                  <div class="text-subtitle-1">Decision</div>
                  <div class="text-caption">
                    {{ isApproved ? 'Approved' : isDeclined ? 'Declined' : 'Awaiting decision' }}
                  </div>
                </v-timeline-item>
              </v-timeline>
            </div>

            <!-- Share/Bookmark Section -->
            <div class="mt-6 pt-4 border-t text-center">
              <p class="text-caption text-medium-emphasis mb-2">
                Bookmark this page to check your status later
              </p>
              <v-btn
                color="secondary"
                variant="outlined"
                size="small"
                prepend-icon="mdi-content-copy"
                @click="copyStatusLink"
              >
                Copy Status Link
              </v-btn>
            </div>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>
  </v-container>
</template>

<style scoped>
.fill-height {
  min-height: 100vh;
  background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
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
}

.step-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0,0,0,0.1);
}

.error-card {
  border: 1px solid #f44336;
}

.border-t {
  border-top: 1px solid rgba(0,0,0,0.1);
}

.gap-2 {
  gap: 8px;
}

/* Card hover effects */
.v-card {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.v-card:hover {
  box-shadow: 0 6px 20px rgba(0,0,0,0.1) !important;
}

.text-truncate {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>