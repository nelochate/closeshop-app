<script setup>
import { computed, ref, onMounted, onUnmounted, watch } from 'vue'
import { useRouter, onBeforeRouteUpdate } from 'vue-router'
import { supabase } from '@/utils/supabase'
import { useAuthUserStore } from '@/stores/authUser'
import BottomNav from '@/common/layout/BottomNav.vue'
import PullToRefreshWrapper from '@/components/PullToRefreshWrapper.vue'
import {
  getVisibleUnreadNotificationCount,
  resolveVisibleNotification,
} from '@/utils/chatNotifications'
import { reconcileAutoCompletedOrders } from '@/utils/orderAutoCompletion'

const activeTab = ref('account')

// Router and store
const router = useRouter()
const authStore = useAuthUserStore()

// Reactive state
const avatarUrl = ref(null)
const user = ref(null)
const fullName = ref('')
const hasShop = ref(false)
const shopCreationStatus = ref(null)

const unreadNotifications = ref(0)
const notificationSubscription = ref(null)

// Notification state
const showApprovalToast = ref(false)
const toastMessage = ref('')
const toastColor = ref('success')
const toastIcon = ref('mdi-check-circle')

const shopData = ref(null)

// Rider state
const isRider = ref(false)
const riderStatus = ref(null)
const riderApplicationId = ref(null)
const availableRiderOrdersCount = ref(0)
const riderOrdersSubscription = ref(null)
const hasAvailableRiderOrders = computed(
  () => isRider.value && riderStatus.value === 'approved' && availableRiderOrdersCount.value > 0,
)

const cleanupRiderOrdersSubscription = () => {
  if (riderOrdersSubscription.value) {
    riderOrdersSubscription.value.unsubscribe()
    riderOrdersSubscription.value = null
  }
}

const fetchAvailableRiderOrdersCount = async () => {
  if (!isRider.value || riderStatus.value !== 'approved') {
    availableRiderOrdersCount.value = 0
    return
  }

  try {
    const { count, error } = await supabase
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'waiting_for_rider')
      .is('rider_id', null)

    if (error) throw error

    availableRiderOrdersCount.value = count || 0
  } catch (error) {
    console.error('Error fetching available rider orders count:', error)
    availableRiderOrdersCount.value = 0
  }
}

const setupRiderOrdersSubscription = () => {
  cleanupRiderOrdersSubscription()

  if (!isRider.value || riderStatus.value !== 'approved') return

  riderOrdersSubscription.value = supabase
    .channel(`profile-rider-orders-${user.value?.id || 'guest'}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'orders',
      },
      async () => {
        await fetchAvailableRiderOrdersCount()
      },
    )
    .subscribe()
}

const handleRefresh = async () => {
  console.log('🔄 Refreshing profile...')

  await loadUser()
  await loadOrderCounts()
  await loadSectionItems(selectedSection.value)
  await checkUserShop()
  await checkRiderStatus()

  console.log('✅ Profile refresh complete!')
}

let shopSubscription = null
// Set up real-time subscription for shop status
const setupShopRealtimeSubscription = () => {
  if (!user.value?.id) return

  // Clean up existing subscription
  if (shopSubscription) {
    shopSubscription.unsubscribe()
  }

  shopSubscription = supabase
    .channel('shop-status-changes')
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'shops',
        filter: `owner_id=eq.${user.value.id}`,
      },
      (payload) => {
        console.log('Shop status changed:', payload)
        const updatedShop = payload.new

        if (updatedShop) {
          const wasApproved = hasShop.value && shopCreationStatus.value === 'approved'
          const isNowApproved = updatedShop.status === 'approved'

          // Update local state
          hasShop.value = updatedShop.status === 'approved'
          shopCreationStatus.value = updatedShop.status

          console.log('Updated shop status:', {
            hasShop: hasShop.value,
            status: shopCreationStatus.value,
          })

          // Show toast notification if status changed to approved
          if (!wasApproved && isNowApproved) {
            showApprovalNotification()
          }
        }
      },
    )
    .subscribe()
}

// Check if shop was recently approved (for first load after approval)
const checkRecentApproval = () => {
  if (!shopData.value || shopCreationStatus.value !== 'approved') return false

  // Check if this is the first time seeing the approved status
  const lastApprovedShown = localStorage.getItem(`shop_approved_shown_${user.value?.id}`)
  const now = new Date().getTime()

  // If never shown before, show notification
  if (!lastApprovedShown) {
    localStorage.setItem(`shop_approved_shown_${user.value?.id}`, now.toString())
    showApprovalNotification()
    return true
  }

  // If shown more than 24 hours ago, show again (optional)
  const lastShown = parseInt(lastApprovedShown)
  const hoursSinceLastShown = (now - lastShown) / (1000 * 60 * 60)

  if (hoursSinceLastShown > 24) {
    localStorage.setItem(`shop_approved_shown_${user.value?.id}`, now.toString())
    showApprovalNotification()
    return true
  }

  return false
}

// Show approval notification
const showApprovalNotification = () => {
  toastMessage.value = '🎉 Congratulations! Your shop has been approved! You can now start selling.'
  toastColor.value = 'success'
  toastIcon.value = 'mdi-check-circle'
  showApprovalToast.value = true
}

// Add this function to clean up subscription
const cleanupShopSubscription = () => {
  if (shopSubscription) {
    shopSubscription.unsubscribe()
    shopSubscription = null
  }
}

//for navigation items
const sectionItems = ref([]) // Holds items for the selected section
const isLoadingSection = ref(false)

// Shopee-style navigation items - UPDATED with correct status mapping
const navItems = ref([
  {
    id: 'my-purchases',
    title: 'My Purchases',
    icon: 'mdi-package-variant',
    color: '#354d7c',
    count: 0,
  },
  {
    id: 'to-receive',
    title: 'To Receive & Pay',
    icon: 'mdi-package-down',
    color: '#354d7c',
    count: 0,
  },
  {
    id: 'reviews',
    title: 'To Review',
    icon: 'mdi-star-outline',
    color: '#354d7c',
    count: 0,
  },
  {
    id: 'completed',
    title: 'Completed',
    icon: 'mdi-check-circle-outline',
    color: '#354d7c',
    count: 0,
  },
  {
    id: 'cancelled',
    title: 'Cancelled',
    icon: 'mdi-close-circle-outline',
    color: '#354d7c',
    count: 0,
  },
  {
    id: 'failed',
    title: 'Failed Transactions',
    icon: 'mdi-alert-circle-outline',
    color: '#354d7c',
    count: 0,
  },
])

const selectedSection = ref('my-purchases')
// Rate order function
const rateOrder = (orderId) => {
  if (orderId) {
    router.push(`/rateview/${orderId}`)
  }
}

// Check if user has a shop and get its status
const checkUserShop = async () => {
  if (!user.value?.id) {
    console.log('❌ No user ID available')
    return
  }

  console.log('🔍 Checking shop for user:', user.value.id)

  try {
    const { data: shop, error } = await supabase
      .from('shops')
      .select('id, status, business_name, approved_at, updated_at')
      .eq('owner_id', user.value.id)
      .maybeSingle()

    console.log('📊 Shop query result:', { shop, error })

    if (error) {
      console.error('Error checking shop:', error)
      hasShop.value = false
      shopCreationStatus.value = null
      shopData.value = null
      return
    }

    if (shop) {
      shopData.value = shop
      hasShop.value = true
      shopCreationStatus.value = shop.status
      console.log('✅ User has shop:', {
        id: shop.id,
        status: shop.status,
        business_name: shop.business_name,
        isApproved: shop.status === 'approved',
      })

      // Check if this is a recent approval
      checkRecentApproval()
    } else {
      hasShop.value = false
      shopCreationStatus.value = null
      shopData.value = null
      console.log('❌ User does not have a shop yet')
      console.log('   User ID checked:', user.value.id)
    }
  } catch (err) {
    console.error('Error in checkUserShop:', err)
    hasShop.value = false
    shopCreationStatus.value = null
    shopData.value = null
  }
}

// Debug function to check current user
const debugCurrentUser = async () => {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  console.log('Current user:', user)
  console.log('User ID:', user?.id)

  // Check if there's a shop for this user
  const { data: shop } = await supabase.from('shops').select('*').eq('owner_id', user?.id)

  console.log('Shops found for this user:', shop)
}

// Handle avatar image loading errors
const handleAvatarError = () => {
  console.log('Avatar failed to load, falling back to initials')
  avatarUrl.value = null
  // The template will automatically show initials
}

// Helper function to get Google avatar URL (handles both custom and default avatars)
const getGoogleAvatarUrl = (userData) => {
  if (!userData) return null

  // Check identities array first (most reliable for Google)
  if (userData.identities && userData.identities.length > 0) {
    const identity = userData.identities.find((i) => i.provider === 'google')
    if (identity && identity.identity_data) {
      const identityData = identity.identity_data

      // Google provides avatar_url in identity_data
      if (identityData.avatar_url) {
        console.log('Found Google avatar URL:', identityData.avatar_url)
        return identityData.avatar_url
      }

      // Sometimes Google uses 'picture' field
      if (identityData.picture) {
        console.log('Found Google picture URL:', identityData.picture)
        return identityData.picture
      }
    }
  }

  // Check user_metadata as fallback
  if (userData.user_metadata?.avatar_url) {
    return userData.user_metadata.avatar_url
  }

  // Check raw_user_meta_data
  if (userData.raw_user_meta_data?.avatar_url) {
    return userData.raw_user_meta_data.avatar_url
  }

  return null
}

// Helper to get user initials for fallback avatar
const getUserInitials = (fullName) => {
  if (!fullName || fullName === 'User') return '?'

  const names = fullName.trim().split(' ')
  if (names.length === 1) {
    return names[0].charAt(0).toUpperCase()
  }
  return (names[0].charAt(0) + names[names.length - 1].charAt(0)).toUpperCase()
}

// NEW HELPER FUNCTION: Get user display name from various auth provider formats
const getUserDisplayName = (userData) => {
  if (!userData) return 'User'

  // Check user_metadata first
  if (userData.user_metadata) {
    const metadata = userData.user_metadata
    if (metadata.full_name) return metadata.full_name
    if (metadata.name) return metadata.name
    if (metadata.first_name && metadata.last_name) {
      return `${metadata.first_name} ${metadata.last_name}`.trim()
    }
  }

  // Check identities array (Google stores full_name here)
  if (userData.identities && userData.identities.length > 0) {
    const identityData = userData.identities[0].identity_data
    if (identityData) {
      if (identityData.full_name) return identityData.full_name
      if (identityData.name) return identityData.name
    }
  }

  // Fallback to email username
  if (userData.email) {
    return userData.email.split('@')[0]
  }

  return 'User'
}

// Check if user is a rider
const checkRiderStatus = async () => {
  if (!user.value?.id) return

  try {
    // Get profile first
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', user.value.id)
      .single()

    if (profileError) {
      console.error('Error fetching profile:', profileError)
      availableRiderOrdersCount.value = 0
      cleanupRiderOrdersSubscription()
      return
    }

    // Query Rider_Registration
    const { data, error } = await supabase
      .from('Rider_Registration')
      .select('rider_id, status')
      .eq('profile_id', profile.id)
      .maybeSingle()

    if (error && error.code !== 'PGRST116') {
      console.error('Error checking rider status:', error.message)
    }

    isRider.value = !!data
    riderStatus.value = data?.status || null
    riderApplicationId.value = data?.rider_id || null

    console.log('Rider status check result:', {
      isRider: isRider.value,
      status: riderStatus.value,
    })

    if (isRider.value && riderStatus.value === 'approved') {
      await fetchAvailableRiderOrdersCount()
      setupRiderOrdersSubscription()
    } else {
      availableRiderOrdersCount.value = 0
      cleanupRiderOrdersSubscription()
    }
  } catch (err) {
    console.error('Error checking rider:', err)
    availableRiderOrdersCount.value = 0
    cleanupRiderOrdersSubscription()
  }
}

// Rider navigation - Only for approved riders
const goToRiderDashboard = () => {
  if (isRider.value && riderStatus.value === 'approved') {
    router.push('/RiderDashboard')
  }
}

const getSupabaseAuthAvatar = async () => {
  try {
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser()
    if (error) throw error

    // Check in user_metadata
    if (user?.user_metadata?.avatar_url) {
      return user.user_metadata.avatar_url
    }

    // Check raw_app_meta_data
    if (user?.raw_app_meta_data?.avatar_url) {
      return user.raw_app_meta_data.avatar_url
    }

    return null
  } catch (err) {
    console.error('Error getting avatar from Supabase auth:', err)
    return null
  }
}

// Updated loadUser function
const loadUser = async () => {
  if (authStore.userData && authStore.profile) {
    user.value = authStore.userData
    fullName.value = getUserDisplayName(authStore.userData)

    // Priority 1: Check if user has custom avatar in profiles table
    if (
      authStore.profile.avatar_url &&
      !authStore.profile.avatar_url.includes('googleusercontent.com')
    ) {
      avatarUrl.value = authStore.profile.avatar_url
      console.log('Using custom profile avatar')
    }
    // Priority 2: Check Supabase auth user_metadata
    else {
      const supabaseAvatar = await getSupabaseAuthAvatar()
      if (supabaseAvatar) {
        avatarUrl.value = supabaseAvatar
        console.log('Using avatar from Supabase auth:', supabaseAvatar)
      }
      // Priority 3: Use Google's avatar (even default ones)
      else {
        const googleAvatar = getGoogleAvatarUrl(authStore.userData)
        if (googleAvatar) {
          avatarUrl.value = googleAvatar
          console.log('Using Google avatar (may be default):', googleAvatar)
        } else {
          avatarUrl.value = null // Will show initials avatar
          console.log('No avatar found, will use initials')
        }
      }
    }

    // After loading user, check for shop status
    await checkUserShop()
    await checkRiderStatus()
    setupShopRealtimeSubscription()
  } else {
    const { data: userData, error } = await supabase.auth.getUser()
    if (error || !userData?.user) {
      console.error('No user found:', error?.message)
      return
    }
    user.value = userData.user
    fullName.value = getUserDisplayName(userData.user)

    // Same avatar logic as above
    if (
      authStore.profile?.avatar_url &&
      !authStore.profile.avatar_url.includes('googleusercontent.com')
    ) {
      avatarUrl.value = authStore.profile.avatar_url
    } else {
      const supabaseAvatar = await getSupabaseAuthAvatar()
      if (supabaseAvatar) {
        avatarUrl.value = supabaseAvatar
        console.log('Using avatar from Supabase auth:', supabaseAvatar)
      } else {
        const googleAvatar = getGoogleAvatarUrl(userData.user)
        avatarUrl.value = googleAvatar || null
      }
    }

    console.log('Avatar loading debug:', {
      fullName: fullName.value,
      hasGoogleAvatar: !!getGoogleAvatarUrl(userData.user),
      avatarUrl: avatarUrl.value,
    })

    await checkUserShop()
    await checkRiderStatus()
    setupShopRealtimeSubscription()
  }
}

const loadOrderCounts = async () => {
  if (!user.value?.id) return

  try {
    const { data: orders, error } = await supabase
      .from('orders')
      .select('status, payment_status, delivered_at, completed_at, id')
      .eq('user_id', user.value.id)

    if (error) {
      console.error('Error loading order counts:', error)
      return
    }

    const currentOrders = await reconcileAutoCompletedOrders(orders || [])

    console.log('📊 All orders for counts:', currentOrders)

    navItems.value = navItems.value.map((item) => {
      let count = 0
      switch (item.id) {
        case 'my-purchases':
          // Show ALL orders regardless of status
          count = currentOrders.filter((o) => o.status !== 'cancelled').length
          break
        case 'to-receive':
          count = currentOrders.filter(
            (o) => isOrderPendingDelivery(o) || isOrderAwaitingCustomerConfirmation(o),
          ).length
          break
        case 'reviews':
          count = currentOrders.filter(
            (o) => isOrderDeliveredState(o) && o.status !== 'cancelled',
          ).length
          break
        case 'completed':
          count = currentOrders.filter((o) => isOrderCompleted(o)).length
          break
        case 'cancelled':
          count = currentOrders.filter(
            (o) => o.status === 'cancelled' || o.payment_status === 'cancelled',
          ).length
          break
        case 'failed':
          count = currentOrders.filter(
            (o) =>
              o.payment_status === 'failed' ||
              o.status === 'failed' ||
              (o.payment_status === 'rejected' && o.status !== 'cancelled'),
          ).length
          break
        default:
          count = 0
      }
      console.log(`🔢 ${item.title} count:`, count)
      return { ...item, count }
    })
  } catch (err) {
    console.error('Error loading order counts:', err)
  }
}
// Navigation handler
const handleNavClick = async (itemId) => {
  selectedSection.value = itemId
  await loadSectionItems(itemId)
}

const isOrderCompleted = (order) => !!order?.completed_at || order?.status === 'completed'

const isOrderAwaitingCustomerConfirmation = (order) => {
  if (!order) return false
  return (
    ['picked_up', 'delivered'].includes(order.status) && !!order.delivered_at && !order.completed_at
  )
}

const isOrderDeliveredState = (order) => {
  if (!order) return false
  if (isOrderCompleted(order) || order.status === 'delivered') return true

  return order.status === 'picked_up' && !!order.delivered_at && !order.completed_at
}

const isOrderPendingDelivery = (order) => {
  if (!order || order.status === 'cancelled') return false
  if (order.status === 'waiting_for_rider' || order.status === 'accepted_by_rider') return true

  return order.status === 'picked_up' && !order.delivered_at && !order.completed_at
}

// FIXED: Load items for the selected section with correct filtering
const loadSectionItems = async (sectionId) => {
  if (!user.value?.id) return
  isLoadingSection.value = true

  try {
    let query = supabase
      .from('orders')
      .select(
        `
        id,
        status,
        payment_status,
        delivered_at,
        completed_at,
        total_amount,
        created_at,
        transaction_number,
        order_items (
          id,
          product_id,
          quantity,
          price,
          selected_size,
          selected_variety,
          products (
            id,
            prod_name,
            main_img_urls
          )
        )
      `,
      )
      .eq('user_id', user.value.id)

    // Apply filters based on section
    switch (sectionId) {
      case 'to-receive':
        query = query.in('status', [
          'waiting_for_rider',
          'accepted_by_rider',
          'picked_up',
          'completed',
          'delivered',
        ])
        break
      case 'reviews':
        query = query
          .in('status', ['picked_up', 'completed', 'delivered'])
          .neq('status', 'cancelled')
        break
      case 'completed':
        query = query
          .in('status', ['picked_up', 'completed', 'delivered'])
          .neq('status', 'cancelled')
        break
      case 'cancelled':
        query = query.or('status.eq.cancelled,payment_status.eq.cancelled')
        break
      case 'failed':
        query = query.or('payment_status.eq.failed,status.eq.failed')
        break
      case 'my-purchases':
        query = query.neq('status', 'cancelled')
        break
    }

    const { data, error } = await query.order('created_at', { ascending: false })

    if (error) {
      console.error('Error loading section items:', error)
      sectionItems.value = []
    } else {
      const currentOrders = await reconcileAutoCompletedOrders(data || [])

      console.log(`📦 ${sectionId} items:`, currentOrders)

      const filteredData = currentOrders.filter((order) => {
        switch (sectionId) {
          case 'to-receive':
            return isOrderPendingDelivery(order) || isOrderAwaitingCustomerConfirmation(order)
          case 'reviews':
            return isOrderDeliveredState(order) && order.status !== 'cancelled'
          case 'completed':
            return isOrderCompleted(order) && order.status !== 'cancelled'
          case 'cancelled':
            return order.status === 'cancelled' || order.payment_status === 'cancelled'
          case 'failed':
            return (
              order.payment_status === 'failed' ||
              order.status === 'failed' ||
              (order.payment_status === 'rejected' && order.status !== 'cancelled')
            )
          case 'my-purchases':
            return order.status !== 'cancelled'
          default:
            return true
        }
      })

      // Enhanced order data structure
      sectionItems.value = filteredData.map((order) => ({
        id: order.id,
        transaction_number: order.transaction_number,
        status: order.status,
        payment_status: order.payment_status,
        delivered_at: order.delivered_at,
        completed_at: order.completed_at,
        total_amount: order.total_amount,
        created_at: order.created_at,
        items: order.order_items.map((item) => ({
          id: item.id,
          product_id: item.product_id,
          quantity: item.quantity,
          price: item.price,
          product_name: item.products?.prod_name,
          product_img: Array.isArray(item.products?.main_img_urls)
            ? item.products.main_img_urls[0]
            : item.products?.main_img_urls || null,
          selected_size: item.selected_size,
          selected_variety: item.selected_variety,
        })),
      }))
    }
  } catch (err) {
    console.error('Error fetching section items:', err)
    sectionItems.value = []
  } finally {
    isLoadingSection.value = false
  }
}

// Helper function to get status color
const getStatusColor = (order) => {
  if (order.status === 'cancelled' || order.payment_status === 'cancelled') return 'error'
  if (isOrderDeliveredState(order)) return 'success'
  if (order.status === 'waiting_for_rider') return 'warning' // Orange/Yellow
  if (order.status === 'accepted_by_rider') return 'info' // Blue
  if (order.status === 'picked_up') return 'warning' // Orange/Yellow
  if (order.payment_status === 'paid') return 'primary'
  if (order.status === 'pending_approval') return 'warning' // Orange/Yellow
  if (order.payment_status === 'pending') return 'warning'
  if (order.payment_status === 'failed') return 'error'
  return 'grey'
}

// Helper function to get status text
const getStatusText = (order) => {
  if (order.status === 'cancelled' || order.payment_status === 'cancelled') return 'Cancelled'
  if (isOrderCompleted(order)) return 'Completed'
  if (isOrderDeliveredState(order)) return 'Delivered'
  if (order.status === 'waiting_for_rider') return 'Waiting for Rider' // Added
  if (order.status === 'accepted_by_rider') return 'Rider Accepted' // Added
  if (order.status === 'picked_up') return 'Picked Up' // Added
  if (order.payment_status === 'paid') return 'To Receive'
  if (order.status === 'pending_approval') return 'Pending Approval' // Added
  if (order.payment_status === 'pending') return 'Pending'
  if (order.payment_status === 'failed') return 'Failed'
  return 'Processing'
}

// Function to subscribe to order status changes
const setupOrderSubscription = () => {
  if (!user.value?.id) return

  const orderChannel = supabase
    .channel('customer-orders')
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'orders',
        filter: `user_id=eq.${user.value.id}`,
      },
      async (payload) => {
        console.log('Order status changed:', payload)
        // Refresh counts and current section
        await loadOrderCounts()
        await loadSectionItems(selectedSection.value)
      },
    )
    .subscribe()

  return orderChannel
}

// Format date
const formatDate = (dateString) => {
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

// View order details function
const viewOrder = (orderId) => {
  if (orderId) {
    router.push({ name: 'order-details', params: { id: orderId } })
  }
}

const goShopOrBuild = () => {
  console.log('Shop button clicked:', {
    hasShop: hasShop.value,
    status: shopCreationStatus.value,
  })

  // If user has a shop
  if (hasShop.value) {
    // Check if shop is approved
    if (shopCreationStatus.value === 'approved') {
      // Approved shop - go to usershop
      router.push('/usershop')
    } else {
      // Shop exists but not approved yet - go to status page
      router.push('/statusshopcreation')
    }
  } else {
    // User doesn't have a shop, go to creation page
    router.push('/shop-build')
  }
}

const setupNotificationListener = async () => {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return

  // Fetch initial unread count
  await fetchUnreadNotificationCount()

  // Subscribe to real-time notifications
  notificationSubscription.value = supabase
    .channel('user-notifications-profile')
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${user.id}`,
      },
      async (payload) => {
        console.log('New notification received in profile:', payload)

        const visibleNotification = await resolveVisibleNotification(payload.new)

        if (!visibleNotification) {
          return
        }

        unreadNotifications.value++

        // Show native notification if enabled
        if (Notification.permission === 'granted') {
          new Notification('CloseShop', {
            body: visibleNotification.message,
            icon: '/icon.png',
          })
        }
      },
    )
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${user.id}`,
      },
      (payload) => {
        // If notification is marked as read, decrease count
        if (payload.new.is_read && !payload.old.is_read) {
          unreadNotifications.value = Math.max(0, unreadNotifications.value - 1)
        }
      },
    )
    .subscribe()
}

const fetchUnreadNotificationCount = async () => {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return

  unreadNotifications.value = await getVisibleUnreadNotificationCount(user.id)
}

// Add goNotifications function
const goNotifications = () => {
  router.push('/notificationview')
}

// Run when component mounts
onMounted(async () => {
  await loadUser()
  await loadOrderCounts()
  await debugCurrentUser()
  await loadSectionItems(selectedSection.value)
  setupShopRealtimeSubscription()
  await setupNotificationListener()
  setupOrderSubscription()
})

onUnmounted(() => {
  cleanupShopSubscription()
  cleanupRiderOrdersSubscription()
  if (notificationSubscription.value) {
    notificationSubscription.value.unsubscribe()
  }
})

// Watch for user changes
watch(
  () => user.value?.id,
  async (newId) => {
    if (newId) {
      await checkRiderStatus()
      await loadOrderCounts()
      await loadSectionItems(selectedSection.value)
    }
  },
)

// Watch for store userData changes → update name
watch(
  () => authStore.userData,
  (newUser) => {
    if (newUser) {
      fullName.value = getUserDisplayName(newUser)
    }
  },
  { immediate: true },
)

// Watch for profile changes → update avatar and name
watch(
  () => authStore.profile,
  (newProfile) => {
    if (newProfile) {
      fullName.value = getUserDisplayName(authStore.userData)
      // Profile avatar takes precedence
      if (newProfile.avatar_url) {
        avatarUrl.value = newProfile.avatar_url
      } else if (authStore.userData) {
        // Fallback to Google avatar
        avatarUrl.value = getGoogleAvatarUrl(authStore.userData)
      }
    }
  },
  { immediate: true, deep: true },
)

// Reload user if route changes but component is reused
onBeforeRouteUpdate((to, from, next) => {
  loadUser()
  next()
})
</script>

<template>
  <v-app>
    <PullToRefreshWrapper :on-refresh="handleRefresh">
      <!-- Main Profile Content -->
      <v-main class="profile-main">
        <!-- Action Buttons Container -->
        <div class="top-actions-container">
          <!-- Shop Button - Left -->
          <v-btn @click="goShopOrBuild" class="action-btn shop-btn" elevation="2">
            <v-icon start size="20">mdi-storefront-outline</v-icon>
            {{ hasShop ? 'My Shop' : 'Create Shop' }}
          </v-btn>

          <!-- Right Side Buttons Container -->
          <div class="right-buttons-container">
            <!-- Rider Dashboard Icon - Only shows for approved riders -->
            <v-btn
              v-if="isRider && riderStatus === 'approved'"
              variant="text"
              icon
              class="rider-dashboard-btn"
              @click="goToRiderDashboard"
              title="Rider Dashboard"
            >
              <v-icon size="28">mdi-motorbike</v-icon>
              <span v-if="hasAvailableRiderOrders" class="rider-available-dot"></span>
            </v-btn>

            <!-- Notification Button with Badge -->
            <div class="notification-wrapper-profile">
              <v-btn class="notif2-btn" @click="goNotifications">
                <v-icon size="22">mdi-bell-outline</v-icon>
              </v-btn>
              <!-- Badge -->
              <div
                v-if="unreadNotifications > 0"
                class="notification-badge-profile"
                :class="{ 'badge-large-profile': unreadNotifications > 9 }"
              >
                {{ unreadNotifications > 99 ? '99+' : unreadNotifications }}
              </div>
            </div>

            <!-- Settings Icon -->
            <v-btn variant="text" icon class="settings-btn" @click="router.push('/settings')">
              <v-icon size="28">mdi-cog</v-icon>
            </v-btn>
          </div>
        </div>

        <!-- Profile Header -->
        <div class="profile-header">
          <div class="profile-inline">
            <div class="avatar-container">
              <v-avatar size="80" color="primary" class="avatar-glow">
                <!-- Show Google/Custom avatar if available -->
                <v-img v-if="avatarUrl" :src="avatarUrl" cover @error="handleAvatarError" />
                <!-- Show initials if no avatar or avatar failed to load -->
                <div v-else class="initials-avatar">
                  {{ getUserInitials(fullName || user?.email?.split('@')[0] || 'U') }}
                </div>
              </v-avatar>
              <v-btn
                class="edit-btn"
                color="primary"
                icon
                elevation="4"
                @click="router.push('/edit-profile')"
              >
                <v-icon class="edit-icon">mdi-pencil</v-icon>
              </v-btn>
            </div>

            <!-- Name above Email -->
            <div class="info-block">
              <h2 class="name-row">{{ fullName || user?.email?.split('@')[0] || 'User' }}</h2>
              <p class="email-row">{{ user?.email || '...' }}</p>
            </div>
          </div>
        </div>

        <v-divider thickness="2" class="my-4"></v-divider>

        <!-- Enhanced Icon Navigation -->
        <div class="shopee-nav-section">
          <div class="nav-grid">
            <div
              v-for="item in navItems"
              :key="item.id"
              class="nav-item"
              :class="{ active: selectedSection === item.id }"
              @click="handleNavClick(item.id)"
            >
              <div class="nav-icon-container">
                <div class="nav-icon-wrapper" :class="{ active: selectedSection === item.id }">
                  <v-icon :color="selectedSection === item.id ? 'white' : item.color" size="24">
                    {{ item.icon }}
                  </v-icon>
                </div>
                <div v-if="item.count > 0" class="badge">
                  {{ item.count > 99 ? '99+' : item.count }}
                </div>
              </div>
              <span class="nav-title">{{ item.title }}</span>
            </div>
          </div>
        </div>

        <!-- Enhanced Content Section -->
        <div class="content-section">
          <v-expand-transition>
            <div v-if="isLoadingSection" class="section-loading">
              <v-progress-circular indeterminate color="primary" size="32"></v-progress-circular>
              <p class="loading-text">Loading your orders...</p>
            </div>

            <div v-else class="section-content">
              <!-- Enhanced Order Cards -->
              <div v-if="sectionItems.length > 0" class="orders-container">
                <v-card
                  v-for="order in sectionItems"
                  :key="order.id"
                  class="order-card elevation-2"
                  rounded="lg"
                >
                  <v-card-title class="order-header">
                    <div class="order-info">
                      <div class="order-number">Order #{{ order.transaction_number }}</div>
                      <div class="order-date">{{ formatDate(order.created_at) }}</div>
                    </div>
                    <v-chip :color="getStatusColor(order)" variant="flat" size="small">
                      {{ getStatusText(order) }}
                    </v-chip>
                  </v-card-title>

                  <v-divider></v-divider>

                  <!-- Order Items with Fixed Image Container -->
                  <div class="order-items">
                    <div v-for="item in order.items" :key="item.id" class="order-item">
                      <!-- Fixed Image Container -->
                      <div class="product-image-container">
                        <v-img
                          :src="item.product_img || '/placeholder-product.png'"
                          :lazy-src="'/placeholder-product.png'"
                          cover
                          class="product-image"
                          @click="viewOrder(order.id)"
                          aspect-ratio="1"
                        >
                          <template v-slot:placeholder>
                            <v-row class="fill-height ma-0" align="center" justify="center">
                              <v-progress-circular
                                indeterminate
                                color="primary"
                              ></v-progress-circular>
                            </v-row>
                          </template>
                        </v-img>
                      </div>

                      <div class="item-details">
                        <h4 class="product-name" @click="viewOrder(order.id)">
                          {{ item.product_name || 'Product' }}
                        </h4>
                        <div class="item-specs">
                          <span class="quantity">Qty: {{ item.quantity }}</span>
                          <span class="price">₱{{ item.price?.toLocaleString() }}</span>
                        </div>
                        <div v-if="item.selected_size || item.selected_variety" class="variants">
                          <v-chip v-if="item.selected_size" size="x-small" class="mr-1">
                            {{ item.selected_size }}
                          </v-chip>
                          <v-chip v-if="item.selected_variety" size="x-small">
                            {{ item.selected_variety }}
                          </v-chip>
                        </div>
                      </div>
                    </div>
                  </div>

                  <v-divider></v-divider>

                  <v-card-actions class="order-actions">
                    <div class="order-total">
                      <strong>Total: ₱{{ order.total_amount?.toLocaleString() }}</strong>
                    </div>
                    <div class="action-buttons">
                      <v-btn
                        color="primary"
                        variant="outlined"
                        size="small"
                        @click="viewOrder(order.id)"
                      >
                        <v-icon left small>mdi-receipt</v-icon>
                        View Order
                      </v-btn>
                      <v-btn
                        v-if="isOrderDeliveredState(order)"
                        color="secondary"
                        variant="flat"
                        size="small"
                        @click="rateOrder(order.id)"
                      >
                        <v-icon left small>mdi-star</v-icon>
                        Review
                      </v-btn>
                    </div>
                  </v-card-actions>
                </v-card>
              </div>

              <!-- Enhanced Empty State -->
              <div v-else class="empty-state">
                <div class="empty-icon">
                  <v-icon size="80" color="grey-lighten-2">mdi-cart-off</v-icon>
                </div>
                <h3 class="empty-title">No orders found</h3>
                <p class="empty-text">
                  {{
                    selectedSection === 'my-purchases'
                      ? "You haven't made any purchases yet."
                      : `No ${selectedSection.replace('-', ' ')} orders.`
                  }}
                </p>

                <v-btn
                  v-if="selectedSection === 'my-purchases'"
                  color="primary"
                  class="empty-action-btn"
                  @click="router.push('/')"
                  size="large"
                >
                  <v-icon left>mdi-shopping</v-icon>
                  Start Shopping
                </v-btn>
              </div>
            </div>
          </v-expand-transition>
        </div>
      </v-main>

      <!-- Success Toast Notification -->
      <v-snackbar
        v-model="showApprovalToast"
        :color="toastColor"
        :timeout="6000"
        location="top"
        rounded="lg"
        elevation="24"
      >
        <template v-slot:activator>
          <!-- This is just for the snackbar itself -->
        </template>

        <div class="d-flex align-center">
          <v-icon :icon="toastIcon" size="28" class="mr-3" color="white"></v-icon>
          <div class="flex-grow-1">
            <strong class="text-white">Shop Approved!</strong>
            <div class="text-white text-caption">{{ toastMessage }}</div>
          </div>
          <v-btn
            variant="text"
            icon="mdi-close"
            color="white"
            @click="showApprovalToast = false"
            size="small"
          ></v-btn>
        </div>
      </v-snackbar>

      <!-- Reusable BottomNav -->
      <BottomNav v-model="activeTab" />
    </PullToRefreshWrapper>
  </v-app>
</template>

<style scoped>
/* Global font style */
:root {
  font-family: 'Inter', 'Poppins', 'Roboto', sans-serif;
}

.profile-main {
  background: linear-gradient(180deg, #f8fafc 0%, #ffffff 100%);
}

/* Action Buttons Container - Top Left */
.action-buttons-container {
  position: absolute;
  top: 20px;
  left: 16px;
  z-index: 1200;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

/* Common styles for both buttons */
.action-btn {
  text-transform: none;
  border-radius: 20px;
  transition: all 0.3s ease;
  font-weight: 600;
  font-size: 0.95rem;
  padding: 8px 20px;
  height: 40px !important;
  min-width: 140px;
  justify-content: center;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15) !important;
}

.action-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.25) !important;
}

/*Top buttons */
/* Top Actions Container - Single row with flex */
.top-actions-container {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  z-index: 1200;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: max(16px, env(safe-area-inset-top)) 16px 0 0; /* Changed: removed left padding */
  width: 100%;
  background: transparent;

  /* For devices with notches, add extra padding */
  padding-top: max(20px, env(safe-area-inset-top));
  padding-right: max(16px, env(safe-area-inset-right));
  padding-left: 0; /* Added: no left padding */
}

/* Shop Button - Left side */
.shop-btn {
  text-transform: none;
  border-radius: 0 20px 20px 0 !important; /* Changed: only top-right and bottom-right rounded */
  transition: all 0.3s ease;
  font-weight: 600;
  font-size: 0.9rem;
  padding: 6px 18px;
  height: 38px !important;
  min-width: 130px;
  justify-content: center;
  background: linear-gradient(135deg, #ffffff, #f8f9faf7) !important;
  color: #464749 !important;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15) !important;
  margin-left: 0; /* Ensure no margin */
  margin-right: 0;
  position: relative;
  box-shadow: 2px 4px 12px rgba(0, 0, 0, 0.15) !important;
}

.shop-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.25) !important;
}

/* Right side buttons container */
.right-buttons-container {
  display: flex;
  align-items: center;
  gap: 8px;
}

/* Rider Dashboard Button */
.rider-dashboard-btn {
  position: relative;
  color: #ffffff;
  width: 38px;
  height: 38px;
  backdrop-filter: blur(8px);
  border-radius: 50%;
  transition: all 0.3s ease;
}

.rider-available-dot {
  position: absolute;
  top: 6px;
  right: 5px;
  width: 10px;
  height: 10px;
  border-radius: 999px;
  background: #ef4444;
  border: 2px solid #ffffff;
  box-shadow: 0 0 0 2px rgba(239, 68, 68, 0.15);
}

.rider-dashboard-btn:hover {
  background: rgba(255, 255, 255, 0.25);
  transform: scale(1.05);
}

/* Notification Wrapper and Badge Styles for Profile */
.notification-wrapper-profile {
  position: relative;
  display: inline-block;
  flex-shrink: 0;
}

.notif2-btn {
  color: white;
  background: transparent !important;
  border-radius: 0 !important;
  box-shadow: none !important;
  width: 38px;
  height: 38px;
  min-width: 38px;
  transition: all 0.3s ease;
}

.notification-badge-profile {
  position: absolute;
  top: -4px;
  right: -4px;
  background: linear-gradient(135deg, #ff4444, #ff6666);
  color: white;
  border-radius: 20px;
  min-width: 20px;
  height: 20px;
  font-size: 11px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2px solid white;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
  animation: pulseProfile 2s infinite;
  padding: 0 5px;
}

.badge-large-profile {
  min-width: 24px;
  height: 24px;
  font-size: 10px;
  top: -6px;
  right: -6px;
}

@keyframes pulseProfile {
  0% {
    transform: scale(1);
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
  }
  50% {
    transform: scale(1.05);
    box-shadow: 0 3px 10px rgba(0, 0, 0, 0.3);
  }
  100% {
    transform: scale(1);
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
  }
}

/* Update settings-btn for consistent sizing */
.settings-btn {
  color: #ffffff;
  width: 38px;
  height: 38px;
  backdrop-filter: blur(8px);
  border-radius: 50%;
  transition: all 0.3s ease;
  margin-right: 0;
}

.settings-btn:hover {
  background: rgba(255, 255, 255, 0.25);
  transform: rotate(90deg);
}

/* Profile Header */
.profile-header {
  padding: 120px 24px 30px !important;
  display: flex;
  align-items: flex-start;
  gap: 20px;
  flex-wrap: wrap;
  background: linear-gradient(135deg, #354d7c, #5276b0, #354d7c);
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.12);
  color: #fff;
  border-bottom-right-radius: 24px;
}

.profile-inline {
  display: flex;
  align-items: center;
  gap: 20px;
  flex-wrap: nowrap;
  margin-top: -30px !important;
}

.avatar-container {
  position: relative;
  display: inline-block;
  flex-shrink: 0;
}

.avatar-glow {
  box-shadow: 0 0 20px rgba(232, 232, 232, 0.15);
}

.edit-btn {
  position: absolute;
  bottom: 0;
  right: 0;
  transform: translate(30%, 30%);
  border: 2px solid white;
  border-radius: 50%;
  transition: all 0.25s ease-in-out;
  width: 28px !important;
  height: 28px !important;
  background: linear-gradient(135deg, #5ca3eb, #354d7c);
  color: white;
}

.edit-btn:hover {
  transform: translate(30%, 30%) scale(1.1);
}

.edit-icon {
  font-size: 16px;
}

.info-block {
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex: 1 1 auto;
}

.name-row {
  margin: 0;
  font-size: 1.8rem;
  font-weight: 600;
  letter-spacing: 0.3px;
  color: #fff;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  text-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.email-row {
  margin: 0;
  font-size: 1rem;
  color: #e0e7ef;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Enhanced Shopee-style Navigation */
.shopee-nav-section {
  padding: 24px 16px;
  background: white;
  border-radius: 16px;
  margin: -20px 16px 0;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
  position: relative;
  z-index: 10;
}

.nav-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
}

.nav-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 16px 8px;
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.3s ease;
  position: relative;
  background: #f8fafc;
}

.nav-item:hover {
  background-color: #e3f2fd;
  transform: translateY(-2px);
}

.nav-item.active {
  background: linear-gradient(135deg, #354d7c, #5276b0);
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(53, 77, 124, 0.3);
}

.nav-icon-container {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
}

.nav-icon-wrapper {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #e3f2fd;
  transition: all 0.3s ease;
}

.nav-item.active .nav-icon-wrapper {
  background: rgba(255, 255, 255, 0.2);
}

.badge {
  position: absolute;
  top: -8px;
  right: -8px;
  background: linear-gradient(135deg, #ff4757, #ff3742) !important;
  color: white;
  border-radius: 10px;
  padding: 4px 8px;
  font-size: 11px;
  font-weight: 700;
  min-width: 20px;
  text-align: center;
  line-height: 1;
  border: 2px solid white;
}

.nav-title {
  font-size: 0.8rem;
  font-weight: 600;
  text-align: center;
  color: #666;
  line-height: 1.2;
}

.nav-item.active .nav-title {
  color: white !important;
  font-weight: 700;
}

/* Enhanced Content Section */
.content-section {
  padding: 24px 16px;
  min-height: 400px;
}

.section-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
  text-align: center;
}

.loading-text {
  margin-top: 16px;
  color: #666;
  font-size: 1rem;
}

/* Enhanced Order Cards */
.orders-container {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.order-card {
  border: 1px solid #e0e0e0;
  transition: all 0.3s ease;
  overflow: hidden;
}

.order-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 8px 25px rgba(0, 0, 0, 0.15);
  border-color: #354d7c;
}

.order-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding: 16px 20px;
  background: #f8fafc;
}

.order-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.order-number {
  font-weight: 700;
  color: #354d7c;
  font-size: 1rem;
}

.order-date {
  font-size: 0.85rem;
  color: #666;
}

/* Order Items Container */
.order-items {
  padding: 16px 20px;
}

.order-item {
  display: flex;
  gap: 16px;
  padding: 12px 0;
  border-bottom: 1px solid #f0f0f0;
}

.order-item:last-child {
  border-bottom: none;
}

/* Fixed Image Container - prevents cutting */
.product-image-container {
  flex-shrink: 0;
  width: 80px;
  height: 80px;
  border-radius: 8px;
  overflow: hidden;
  background-color: #f5f5f5;
  position: relative;
}

.product-image {
  width: 100% !important;
  height: 100% !important;
  cursor: pointer;
  transition: transform 0.3s ease;
  object-fit: cover;
}

.product-image:hover {
  transform: scale(1.05);
}

/* Fallback for when v-img doesn't maintain aspect ratio properly */
.product-image :deep(img) {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.item-details {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0; /* Prevents text overflow */
}

.product-name {
  font-weight: 600;
  color: #333;
  cursor: pointer;
  transition: color 0.2s ease;
  margin: 0;
  font-size: 1rem;
  line-height: 1.3;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.product-name:hover {
  color: #354d7c;
}

.item-specs {
  display: flex;
  gap: 16px;
  font-size: 0.9rem;
  color: #666;
  flex-wrap: wrap;
}

.quantity,
.price {
  font-size: 0.85rem;
}

.variants {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 4px;
}

.order-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  background: #fafafa;
}

.order-total {
  font-size: 1.1rem;
  color: #354d7c;
}

.action-buttons {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

/* Enhanced Empty State */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 80px 20px;
  text-align: center;
}

.empty-icon {
  margin-bottom: 24px;
}

.empty-title {
  font-size: 1.5rem;
  font-weight: 600;
  color: #333;
  margin-bottom: 12px;
}

.empty-text {
  font-size: 1rem;
  color: #666;
  margin-bottom: 24px;
  max-width: 300px;
}

.empty-action-btn {
  border-radius: 12px;
  padding: 12px 32px;
  font-weight: 600;
}

/* Terms Content Styles */
.terms-content {
  max-height: 400px;
  overflow-y: auto;
  padding: 8px;
}

.terms-content h4 {
  color: #354d7c;
  margin-top: 16px;
  margin-bottom: 8px;
}

.terms-content p {
  color: #666;
  line-height: 1.6;
  margin-bottom: 12px;
}

.primary-bg {
  background: linear-gradient(135deg, #354d7c, #5276b0);
}

.white--text {
  color: white !important;
}

.initials-avatar {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #354d7c, #5276b0);
  color: white;
  font-size: 32px;
  font-weight: 600;
  text-transform: uppercase;
  border-radius: 50%;
}

/*Different colors for different users */
.initials-avatar {
  background: linear-gradient(135deg, #354d7c, #5276b0);
}

/* Responsive styles */
@media (max-width: 1024px) {
  .nav-grid {
    grid-template-columns: repeat(3, 1fr);
  }
}

@media (max-width: 768px) {
  .notification-badge-profile {
    min-width: 18px;
    height: 18px;
    font-size: 10px;
    top: -3px;
    right: -3px;
  }

  .badge-large-profile {
    min-width: 22px;
    height: 22px;
    font-size: 9px;
    top: -5px;
    right: -5px;
  }

  .profile-inline {
    margin-top: -20px !important;
    gap: 16px;
  }
  .top-actions-container {
    padding-top: max(16px, env(safe-area-inset-top));
    padding-left: 0; /* Added: no left padding on mobile */
    padding-right: max(12px, env(safe-area-inset-right));
  }

  .shop-btn {
    padding: 5px 14px;
    font-size: 0.85rem;
    height: 35px !important;
    min-width: 115px;
    border-radius: 0 16px 16px 0 !important; /* Smaller radius on mobile */
  }

  .rider-dashboard-btn {
    width: 35px;
    height: 35px;
  }

  .rider-dashboard-btn .v-icon {
    font-size: 24px !important;
  }

  .settings-btn {
    width: 35px;
    height: 35px;
  }

  .profile-header {
    padding: 100px 20px 24px !important;
  }

  .action-buttons-container {
    top: 16px;
    left: 12px;
    gap: 8px;
  }

  .action-btn {
    padding: 6px 16px;
    font-size: 0.85rem;
    height: 36px !important;
    min-width: 120px;
  }

  .status-info-card {
    margin: 120px 12px 12px;
  }

  .status-btn {
    top: 24px;
    font-size: 0.8rem;
    padding: 3px 12px;
    height: 28px !important;
  }

  .nav-grid {
    grid-template-columns: repeat(3, 1fr);
    gap: 12px;
  }

  .order-actions {
    flex-direction: column;
    gap: 16px;
    align-items: stretch;
  }

  .action-buttons {
    justify-content: center;
  }
}

@media (max-width: 600px) {
  .notification-badge-profile {
    min-width: 16px;
    height: 16px;
    font-size: 9px;
    top: -2px;
    right: -2px;
  }

  .badge-large-profile {
    min-width: 20px;
    height: 20px;
    font-size: 8px;
    top: -4px;
    right: -4px;
  }

  .profile-inline {
    margin-top: -15px !important;
    gap: 14px;
  }
  .top-actions-container {
    padding-top: max(12px, env(safe-area-inset-top));
    padding-left: 0; /* Added: no left padding */
    padding-right: max(12px, env(safe-area-inset-right));
  }

  .shop-btn {
    padding: 4px 12px;
    font-size: 0.8rem;
    height: 32px !important;
    min-width: 105px;
    border-radius: 0 14px 14px 0 !important;
  }

  .right-buttons-container {
    gap: 6px;
  }

  .rider-dashboard-btn {
    width: 32px;
    height: 32px;
  }

  .rider-dashboard-btn .v-icon {
    font-size: 22px !important;
  }

  .settings-btn {
    width: 32px;
    height: 32px;
  }

  .settings-btn .v-icon {
    font-size: 24px !important;
  }

  .action-btn {
    padding: 5px 14px;
    font-size: 0.8rem;
    height: 34px !important;
    min-width: 110px;
  }

  .profile-header {
    padding: 100px 16px 25px !important;
    border-bottom-right-radius: 20px;
  }

  .profile-inline {
    gap: 16px;
  }

  .name-row {
    font-size: 1.4rem;
  }

  .email-row {
    font-size: 0.9rem;
  }

  .shopee-nav-section {
    margin: -16px 12px 0;
    padding: 20px 12px;
  }

  .nav-grid {
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
  }

  .nav-item {
    padding: 12px 6px;
    gap: 8px;
  }

  .nav-icon-wrapper {
    width: 40px;
    height: 40px;
  }

  .nav-title {
    font-size: 0.7rem;
  }

  .content-section {
    padding: 20px 12px;
  }

  .order-header {
    flex-direction: column;
    gap: 12px;
    align-items: flex-start;
  }

  .order-items {
    padding: 12px 16px;
  }

  .product-image-container {
    width: 70px;
    height: 70px;
  }

  .item-specs {
    font-size: 0.8rem;
    gap: 12px;
  }

  .product-name {
    font-size: 0.9rem;
  }
}

@media (max-width: 480px) {
  .profile-inline {
    margin-top: -10px !important;
    gap: 12px;
  }
  .top-actions-container {
    padding-top: max(10px, env(safe-area-inset-top));
    padding-left: 0; /* Added: no left padding */
    padding-right: max(10px, env(safe-area-inset-right));
  }

  .shop-btn {
    padding: 3px 10px;
    font-size: 0.75rem;
    height: 30px !important;
    min-width: 95px;
    border-radius: 0 12px 12px 0 !important;
  }

  .right-buttons-container {
    gap: 5px;
  }

  .rider-dashboard-btn {
    width: 30px;
    height: 30px;
  }

  .rider-dashboard-btn .v-icon {
    font-size: 20px !important;
  }

  .settings-btn {
    width: 30px;
    height: 30px;
  }

  .status-btn {
    font-size: 0.7rem;
    padding: 2px 8px;
  }

  .nav-grid {
    grid-template-columns: repeat(2, 1fr);
  }

  .nav-title {
    font-size: 0.65rem;
  }

  .order-item {
    gap: 12px;
  }

  .product-image-container {
    width: 60px;
    height: 60px;
  }

  .item-details {
    gap: 6px;
  }

  .product-name {
    font-size: 0.85rem;
  }

  .quantity,
  .price {
    font-size: 0.75rem;
  }
}

@media (max-width: 380px) {
  .action-btn {
    min-width: 90px;
    font-size: 0.7rem;
  }

  .status-btn {
    font-size: 0.65rem;
    padding: 2px 6px;
  }
}

/* Animation enhancements */
.v-avatar,
.v-btn,
.nav-item,
.order-card {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

/* Custom scrollbar for orders container */
.orders-container {
  scrollbar-width: thin;
  scrollbar-color: #c1c1c1 #f1f1f1;
}

.orders-container::-webkit-scrollbar {
  width: 6px;
}

.orders-container::-webkit-scrollbar-track {
  background: #f1f1f1;
  border-radius: 10px;
}

.orders-container::-webkit-scrollbar-thumb {
  background: #c1c1c1;
  border-radius: 10px;
}

.orders-container::-webkit-scrollbar-thumb:hover {
  background: #a8a8a8;
}
</style>
