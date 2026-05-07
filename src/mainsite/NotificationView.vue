<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/utils/supabase'
import { filterVisibleNotifications, resolveVisibleNotification } from '@/utils/chatNotifications'
import { formatLiveTimestamp, formatRelativeDayLabel } from '@/utils/dateTime'

import PullToRefreshWrapper from '@/components/PullToRefreshWrapper.vue'

const router = useRouter()
const notifications = ref([])
const unreadCount = ref(0)
const loading = ref(true)
const showDeleteDialog = ref(false)
const notificationToDelete = ref(null)
const showDeleteAllDialog = ref(false)
const deleting = ref(false)
const deleteOption = ref('read')
const currentTime = ref(Date.now())
const currentRiderNumericId = ref(null)
const routingContextLoaded = ref(false)
let notificationSubscription
let timeUpdateInterval

const handleRefresh = async () => {
  console.log('🔄 Pull-to-refresh triggered - Refreshing notifications...')

  try {
    loading.value = true
    await fetchNotifications()
    console.log('✅ Notifications refresh complete!')
  } catch (err) {
    console.error('❌ Refresh failed:', err)
  } finally {
    loading.value = false
  }
}

// Request browser notification permission
async function requestNotificationPermission() {
  if ('Notification' in window && Notification.permission === 'default') {
    await Notification.requestPermission()
  }
}

async function setupNotificationListener() {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return

  // Listen for new notifications
  notificationSubscription = supabase
    .channel('user-notifications')
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${user.id}`,
      },
      async (payload) => {
        console.log('New notification:', payload)

        const visibleNotification = await resolveVisibleNotification(payload.new)

        if (!visibleNotification) {
          return
        }

        notifications.value.unshift(visibleNotification)
        unreadCount.value++

        // Show browser notification
        showBrowserNotification(visibleNotification)
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
      async (payload) => {
        const visibleNotification = await resolveVisibleNotification(payload.new)
        const index = notifications.value.findIndex((n) => n.id === payload.new.id)

        if (!visibleNotification) {
          if (index !== -1) {
            if (!notifications.value[index].is_read) {
              unreadCount.value = Math.max(0, unreadCount.value - 1)
            }
            notifications.value.splice(index, 1)
          }
          return
        }

        if (index !== -1) {
          const wasUnread = !notifications.value[index].is_read
          notifications.value[index] = {
            ...notifications.value[index],
            ...visibleNotification,
          }

          if (visibleNotification.is_read && wasUnread) {
            unreadCount.value = Math.max(0, unreadCount.value - 1)
          } else if (!visibleNotification.is_read && !wasUnread) {
            unreadCount.value += 1
          }
          return
        }

        notifications.value.unshift(visibleNotification)
        if (!visibleNotification.is_read) {
          unreadCount.value += 1
        }
      },
    )
    .on(
      'postgres_changes',
      {
        event: 'DELETE',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${user.id}`,
      },
      (payload) => {
        // Remove deleted notification from local state
        const index = notifications.value.findIndex((n) => n.id === payload.old.id)
        if (index !== -1) {
          if (!notifications.value[index].is_read) {
            unreadCount.value = Math.max(0, unreadCount.value - 1)
          }
          notifications.value.splice(index, 1)
        }
      },
    )
    .subscribe()
}

async function fetchNotifications() {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return

  try {
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50)

    if (error) throw error

    if (data) {
      const visibleNotifications = await filterVisibleNotifications(data)
      notifications.value = visibleNotifications
      unreadCount.value = visibleNotifications.filter((n) => !n.is_read).length
    }
  } catch (error) {
    console.error('Error fetching notifications:', error)
  } finally {
    loading.value = false
  }
}

async function ensureRoutingContextLoaded() {
  if (routingContextLoaded.value) {
    return
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()

  currentRiderNumericId.value = null

  if (!user) {
    routingContextLoaded.value = true
    return
  }

  try {
    const { data, error } = await supabase
      .from('Rider_Registration')
      .select('rider_id')
      .eq('profile_id', user.id)
      .maybeSingle()

    if (error) {
      throw error
    }

    currentRiderNumericId.value = data?.rider_id ?? null
  } catch (error) {
    console.warn('Could not load rider routing context for notifications:', error)
    currentRiderNumericId.value = null
  } finally {
    routingContextLoaded.value = true
  }
}

async function resolveOrderNotificationRoute(orderId) {
  if (!orderId) {
    return { name: 'profileview' }
  }

  await ensureRoutingContextLoaded()

  if (!currentRiderNumericId.value) {
    return { name: 'order-details', params: { id: orderId } }
  }

  try {
    const { data, error } = await supabase
      .from('orders')
      .select('rider_id')
      .eq('id', orderId)
      .maybeSingle()

    if (error) {
      throw error
    }

    if (Number(data?.rider_id) === Number(currentRiderNumericId.value)) {
      return { name: 'rider-order-details', params: { id: orderId } }
    }
  } catch (error) {
    console.warn('Could not resolve rider order notification target:', error)
  }

  return { name: 'order-details', params: { id: orderId } }
}

function showBrowserNotification(notification) {
  const notificationBody = getNotificationTitle(notification) || notification.message

  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification('CloseShop', {
      body: notificationBody,
      icon: notification.counterpartyAvatar || notification.senderShopAvatar || '/icon.png',
      tag: notification.id,
    })
  }
}

function getNotificationAvatar(notification) {
  if (notification.type === 'new_message') {
    return notification.counterpartyAvatar || notification.senderShopAvatar || null
  }

  return null
}

async function markAsRead(notificationId) {
  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true, read_at: new Date().toISOString() })
    .eq('id', notificationId)

  if (!error) {
    // Update local state
    const notification = notifications.value.find((n) => n.id === notificationId)
    if (notification && !notification.is_read) {
      notification.is_read = true
      notification.read_at = new Date().toISOString()
      unreadCount.value = Math.max(0, unreadCount.value - 1)
    }
  }
}

async function markAllAsRead() {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return

  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true, read_at: new Date().toISOString() })
    .eq('user_id', user.id)
    .eq('is_read', false)

  if (!error) {
    // Update all local notifications to read
    const now = new Date().toISOString()
    notifications.value.forEach((notification) => {
      if (!notification.is_read) {
        notification.is_read = true
        notification.read_at = now
      }
    })
    unreadCount.value = 0
  }
}

// 🗑️ DELETE FUNCTIONS
async function deleteNotification(notificationId) {
  deleting.value = true
  try {
    const { error } = await supabase.from('notifications').delete().eq('id', notificationId)

    if (error) throw error

    // Remove from local state
    const index = notifications.value.findIndex((n) => n.id === notificationId)
    if (index !== -1) {
      const notification = notifications.value[index]
      if (!notification.is_read) {
        unreadCount.value = Math.max(0, unreadCount.value - 1)
      }
      notifications.value.splice(index, 1)
    }
  } catch (error) {
    console.error('Error deleting notification:', error)
    alert('Failed to delete notification. Please try again.')
  } finally {
    deleting.value = false
    showDeleteDialog.value = false
    notificationToDelete.value = null
  }
}

async function deleteAllRead() {
  deleting.value = true
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return

    const { error } = await supabase
      .from('notifications')
      .delete()
      .eq('user_id', user.id)
      .eq('is_read', true)

    if (error) throw error

    // Remove all read notifications from local state
    const readCount = notifications.value.filter((n) => n.is_read).length
    notifications.value = notifications.value.filter((n) => !n.is_read)

    console.log(`Deleted ${readCount} read notifications`)
  } catch (error) {
    console.error('Error deleting all read notifications:', error)
    alert('Failed to delete read notifications. Please try again.')
  } finally {
    deleting.value = false
    showDeleteAllDialog.value = false
  }
}

async function deleteAllNotifications() {
  deleting.value = true
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return

    const { error } = await supabase.from('notifications').delete().eq('user_id', user.id)

    if (error) throw error

    // Clear all notifications from local state
    const totalCount = notifications.value.length
    notifications.value = []
    unreadCount.value = 0

    console.log(`Deleted all ${totalCount} notifications`)
  } catch (error) {
    console.error('Error deleting all notifications:', error)
    alert('Failed to delete notifications. Please try again.')
  } finally {
    deleting.value = false
    showDeleteAllDialog.value = false
  }
}

// Confirmation dialogs
function confirmDelete(notification) {
  notificationToDelete.value = notification
  showDeleteDialog.value = true
}

function confirmDeleteAllRead() {
  const readCount = notifications.value.filter((n) => n.is_read).length
  if (readCount === 0) {
    alert('No read notifications to delete.')
    return
  }
  showDeleteAllDialog.value = true
}

// 🎯 ENHANCED: Smart notification routing based on type and related_id
async function handleNotificationClick(notification) {
  // Mark as read when clicked
  if (!notification.is_read) {
    await markAsRead(notification.id)
  }

  // Navigate based on notification type and related_id
  await navigateToNotificationTarget(notification)
}

async function openMessageNotification(notification) {
  const conversationId = notification.related_id
  if (!conversationId) {
    router.push({ name: 'messageview' })
    return
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    router.push({ name: 'messageview' })
    return
  }

  const { data: conversation, error } = await supabase
    .from('conversations')
    .select('id, user1, user2')
    .eq('id', conversationId)
    .maybeSingle()

  if (error) {
    console.error('Error resolving message notification conversation:', error)
    router.push({ name: 'messageview' })
    return
  }

  if (conversation) {
    if (![conversation.user1, conversation.user2].includes(user.id)) {
      router.push({ name: 'messageview' })
      return
    }

    const otherUserId = conversation.user1 === user.id ? conversation.user2 : conversation.user1

    if (!otherUserId) {
      router.push({ name: 'messageview' })
      return
    }

    router.push({
      name: 'chatview',
      params: { id: otherUserId },
      query: { conversationId: conversation.id },
    })
    return
  }

  // Backward-compatible fallback if older notifications store a user ID instead.
  router.push({ name: 'chatview', params: { id: conversationId } })
}

async function navigateToNotificationTarget(notification) {
  const { type, related_id, related_type, action_url } = notification

  console.log('Navigating notification:', { type, related_id, related_type, action_url })

  // If there's a specific action_url, use it
  if (action_url) {
    if (action_url.startsWith('http')) {
      window.open(action_url, '_blank')
    } else {
      router.push(action_url)
    }
    return
  }

  // Determine route based on notification type and related data
  switch (type) {
    // 🛒 Order-related notifications
    case 'order_placed':
    case 'order_confirmed':
    case 'order_shipped':
    case 'order_delivered':
    case 'order_cancelled':
    case 'order_update':
    case 'shipping_update':
      if (related_id) {
        router.push(await resolveOrderNotificationRoute(related_id))
      } else {
        router.push({ name: 'profileview' }) // Fallback to profile/orders
      }
      break

    // 💬 Message notifications
    case 'new_message':
      await openMessageNotification(notification)
      break

    // 🏪 Shop-related notifications
    case 'shop_approved':
    case 'shop_declined':
      router.push({ name: 'usershop' })
      break

    // 👥 Social notifications
    case 'new_follower':
      if (related_id) {
        router.push({ name: 'profile', params: { id: related_id } })
      } else {
        router.push({ name: 'profileview' })
      }
      break

    // 📦 Product-related notifications
    case 'low_stock':
    case 'out_of_stock':
    case 'new_review':
      if (related_id) {
        // If it's a product notification, go to product detail
        if (related_type === 'product') {
          router.push({ name: 'product-detail', params: { id: related_id } })
        }
        // If it's a shop notification, go to user shop
        else if (related_type === 'shop') {
          router.push({ name: 'usershop' })
        }
      } else {
        router.push({ name: 'productlist' })
      }
      break

    // 💰 Payment notifications
    case 'payment_received':
    case 'payment_failed':
    case 'payment_successful':
      if (related_id) {
        // If payment is related to an order
        router.push(await resolveOrderNotificationRoute(related_id))
      } else {
        router.push({ name: 'profileview' })
      }
      break

    // 🎯 Promotional and system notifications
    case 'promotional':
      router.push({ name: 'homepage' })
      break

    case 'system':
      router.push({ name: 'settings' })
      break

    // Default fallback
    default:
      console.warn('Unknown notification type:', type)
      router.push({ name: 'homepage' })
  }
}

function formatTime(timestamp) {
  return formatLiveTimestamp(timestamp, currentTime.value)
}

function getNotificationIcon(type) {
  const icons = {
    order_placed: 'mdi-package-variant',
    order_confirmed: 'mdi-check-circle',
    order_shipped: 'mdi-truck-delivery',
    order_delivered: 'mdi-package',
    order_cancelled: 'mdi-close-circle',
    order_update: 'mdi-bell-badge-outline',
    payment_received: 'mdi-credit-card-check',
    payment_failed: 'mdi-credit-card-remove',
    payment_successful: 'mdi-credit-card-check',
    new_message: 'mdi-message-text',
    new_review: 'mdi-star',
    low_stock: 'mdi-alert',
    out_of_stock: 'mdi-alert-circle',
    shop_approved: 'mdi-store-check',
    shop_declined: 'mdi-store-remove',
    new_follower: 'mdi-account-plus',
    promotional: 'mdi-percent',
    system: 'mdi-cog',
    shipping_update: 'mdi-truck-fast',
  }
  return icons[type] || 'mdi-bell'
}

function getNotificationColor(type) {
  const colors = {
    order_placed: 'blue',
    order_confirmed: 'green',
    order_shipped: 'orange',
    order_delivered: 'success',
    order_cancelled: 'error',
    order_update: 'warning',
    payment_received: 'success',
    payment_failed: 'error',
    payment_successful: 'success',
    new_message: 'primary',
    new_review: 'amber',
    low_stock: 'warning',
    out_of_stock: 'error',
    shop_approved: 'success',
    shop_declined: 'error',
    new_follower: 'purple',
    promotional: 'purple',
    system: 'grey',
    shipping_update: 'blue',
  }
  return colors[type] || 'primary'
}

function getResolvedMessageNotificationTitle(notification) {
  if (notification.type !== 'new_message' || !notification.counterpartyDisplayName) {
    return null
  }

  if (notification.notificationEvent === 'conversation_start') {
    return `${notification.counterpartyDisplayName} sent you a message`
  }

  if (notification.notificationEvent === 'first_reply') {
    return `${notification.counterpartyDisplayName} replied to your message`
  }

  if (notification.customerFacingShopIdentity) {
    return `${notification.counterpartyDisplayName} replied to your message`
  }

  return `${notification.counterpartyDisplayName} sent you a message`
}

// Helper to get human-readable notification title
function getNotificationTitle(notification) {
  const resolvedMessageTitle = getResolvedMessageNotificationTitle(notification)

  if (resolvedMessageTitle) return resolvedMessageTitle
  if (notification.title) return notification.title
  if (notification.type === 'new_message' && notification.message) return notification.message

  const titles = {
    order_placed: 'New Order',
    order_confirmed: 'Order Confirmed',
    order_shipped: 'Order Shipped',
    order_delivered: 'Order Delivered',
    order_cancelled: 'Order Cancelled',
    order_update: 'Order Update',
    payment_received: 'Payment Received',
    payment_failed: 'Payment Failed',
    payment_successful: 'Payment Successful',
    new_message: 'New Message',
    new_review: 'New Review',
    low_stock: 'Low Stock Alert',
    out_of_stock: 'Out of Stock',
    shop_approved: 'Shop Approved',
    shop_declined: 'Shop Declined',
    new_follower: 'New Follower',
    promotional: 'Special Offer',
    system: 'System Update',
    shipping_update: 'Shipping Update',
  }
  return titles[notification.type] || 'Notification'
}

function getNotificationSubtitle(notification) {
  const resolvedMessageTitle = getResolvedMessageNotificationTitle(notification)

  if (resolvedMessageTitle && notification.message === resolvedMessageTitle) {
    return ''
  }

  if (notification.type === 'new_message' && !notification.title) {
    return ''
  }

  if (notification.type === 'new_message' && notification.title === notification.message) {
    return ''
  }

  return notification.message || ''
}

// Get notification age badge
function getNotificationAge(createdAt) {
  return formatRelativeDayLabel(createdAt, currentTime.value)
}

function getPriorityLabel(priority) {
  const labels = {
    low: 'Low',
    normal: 'Normal',
    high: 'High',
    urgent: 'Urgent',
  }
  return labels[priority] || 'Normal'
}

function getPriorityColor(priority) {
  const colors = {
    low: 'grey',
    normal: 'blue',
    high: 'orange',
    urgent: 'red',
  }
  return colors[priority] || 'blue'
}

onMounted(() => {
  currentTime.value = Date.now()
  timeUpdateInterval = setInterval(() => {
    currentTime.value = Date.now()
  }, 30000)
  ensureRoutingContextLoaded()
  setupNotificationListener()
  fetchNotifications()
  requestNotificationPermission()
})

onUnmounted(() => {
  notificationSubscription?.unsubscribe()

  if (timeUpdateInterval) {
    clearInterval(timeUpdateInterval)
    timeUpdateInterval = null
  }
})
</script>

<template>
  <v-app>
    <PullToRefreshWrapper :on-refresh="handleRefresh">
      <v-main>
        <!-- Top App Bar with Safe Area Support -->
        <v-app-bar density="compact" class="top-nav">
          <v-app-bar-nav-icon @click="router.back()">
            <v-icon>mdi-arrow-left</v-icon>
          </v-app-bar-nav-icon>
          <v-app-bar-title>Notifications</v-app-bar-title>
          <v-spacer></v-spacer>

          <!-- Action buttons -->
          <v-menu v-if="notifications.length > 0">
            <template v-slot:activator="{ props }">
              <v-btn icon v-bind="props" :disabled="loading">
                <v-icon>mdi-dots-vertical</v-icon>
              </v-btn>
            </template>
            <v-list density="compact">
              <v-list-item @click="markAllAsRead" :disabled="unreadCount === 0">
                <template v-slot:prepend>
                  <v-icon>mdi-check-all</v-icon>
                </template>
                <v-list-item-title>Mark all as read</v-list-item-title>
              </v-list-item>
              <v-list-item
                @click="confirmDeleteAllRead"
                :disabled="unreadCount === notifications.length"
              >
                <template v-slot:prepend>
                  <v-icon>mdi-delete-sweep</v-icon>
                </template>
                <v-list-item-title>Delete all read</v-list-item-title>
              </v-list-item>
              <v-divider></v-divider>
              <v-list-item @click="showDeleteAllDialog = true">
                <template v-slot:prepend>
                  <v-icon color="error">mdi-delete-forever</v-icon>
                </template>
                <v-list-item-title class="text-error">Delete all notifications</v-list-item-title>
              </v-list-item>
            </v-list>
          </v-menu>
        </v-app-bar>

        <v-container class="notification-view">
          <!-- Stats Summary -->
          <div v-if="!loading && notifications.length > 0" class="stats-summary">
            <v-card variant="flat" color="surface">
              <v-card-text class="d-flex justify-space-between align-center">
                <div>
                  <div class="text-h6">{{ notifications.length }}</div>
                  <div class="text-caption text-grey">Total</div>
                </div>
                <v-divider vertical></v-divider>
                <div>
                  <div class="text-h6 text-primary">{{ unreadCount }}</div>
                  <div class="text-caption text-grey">Unread</div>
                </div>
                <v-divider vertical></v-divider>
                <div>
                  <div class="text-h6">{{ notifications.length - unreadCount }}</div>
                  <div class="text-caption text-grey">Read</div>
                </div>
              </v-card-text>
            </v-card>
          </div>

          <!-- Loading State -->
          <div v-if="loading" class="text-center py-8">
            <v-progress-circular indeterminate color="primary"></v-progress-circular>
            <div class="mt-2">Loading notifications...</div>
          </div>

          <!-- Empty State -->
          <div v-else-if="notifications.length === 0" class="text-center py-8">
            <v-icon size="64" color="grey-lighten-2">mdi-bell-off-outline</v-icon>
            <div class="text-h6 mt-4 text-grey">No notifications yet</div>
            <div class="text-grey">We'll notify you when something arrives</div>
          </div>

          <!-- Notifications List -->
          <div v-else class="notifications-list">
            <v-card variant="flat">
              <v-list lines="two">
                <template v-for="(notification, index) in notifications" :key="notification.id">
                  <v-list-item
                    :class="['notification-item', { 'notification-unread': !notification.is_read }]"
                    @click="handleNotificationClick(notification)"
                  >
                    <template #prepend>
                      <v-avatar v-if="getNotificationAvatar(notification)" size="40">
                        <v-img
                          :src="getNotificationAvatar(notification)"
                          :alt="getNotificationTitle(notification)"
                          cover
                        />
                      </v-avatar>
                      <v-avatar v-else :color="getNotificationColor(notification.type)" size="40">
                        <v-icon :icon="getNotificationIcon(notification.type)" color="white" />
                      </v-avatar>
                    </template>

                    <v-list-item-title
                      :class="{ 'text-bold': !notification.is_read }"
                      class="text-body-1 d-flex align-center"
                    >
                      {{ getNotificationTitle(notification) }}
                      <v-chip
                        v-if="notification.priority !== 'normal'"
                        :color="getPriorityColor(notification.priority)"
                        size="x-small"
                        class="ml-2"
                      >
                        {{ getPriorityLabel(notification.priority) }}
                      </v-chip>
                    </v-list-item-title>

                    <v-list-item-subtitle class="text-caption">
                      {{ getNotificationSubtitle(notification) }}
                    </v-list-item-subtitle>

                    <template #append>
                      <div class="notification-actions">
                        <!-- Add time display using formatTime -->
                        <div class="notification-time text-caption text-grey mb-1">
                          {{ formatTime(notification.created_at) }}
                        </div>

                        <v-menu location="bottom">
                          <template v-slot:activator="{ props }">
                            <v-btn icon size="small" variant="text" v-bind="props" @click.stop>
                              <v-icon size="small">mdi-dots-vertical</v-icon>
                            </v-btn>
                          </template>
                          <v-list density="compact">
                            <v-list-item
                              @click="markAsRead(notification.id)"
                              v-if="!notification.is_read"
                            >
                              <template v-slot:prepend>
                                <v-icon size="small">mdi-check</v-icon>
                              </template>
                              <v-list-item-title>Mark as read</v-list-item-title>
                            </v-list-item>
                            <v-list-item @click="markAsRead(notification.id)" v-else>
                              <template v-slot:prepend>
                                <v-icon size="small">mdi-email-open</v-icon>
                              </template>
                              <v-list-item-title>Mark as unread</v-list-item-title>
                            </v-list-item>
                            <v-divider></v-divider>
                            <v-list-item @click="confirmDelete(notification)">
                              <template v-slot:prepend>
                                <v-icon size="small" color="error">mdi-delete</v-icon>
                              </template>
                              <v-list-item-title class="text-error">Delete</v-list-item-title>
                            </v-list-item>
                          </v-list>
                        </v-menu>
                      </div>
                    </template>
                  </v-list-item>

                  <!-- Date separator -->
                  <v-divider
                    v-if="
                      index < notifications.length - 1 &&
                      getNotificationAge(notification.created_at) !==
                        getNotificationAge(notifications[index + 1].created_at)
                    "
                    :key="`divider-${notification.id}`"
                    class="my-2"
                  >
                    <v-chip size="small" variant="outlined" color="grey" class="mx-2">
                      {{ getNotificationAge(notifications[index + 1].created_at) }}
                    </v-chip>
                  </v-divider>
                </template>
              </v-list>
            </v-card>
          </div>
        </v-container>

        <!-- Delete Single Notification Dialog -->
        <v-dialog v-model="showDeleteDialog" max-width="400">
          <v-card>
            <v-card-title class="text-h6">Delete Notification</v-card-title>
            <v-card-text>
              Are you sure you want to delete this notification?
              <div class="mt-2 text-body-2 text-grey">
                "{{ notificationToDelete?.message?.substring(0, 100)
                }}{{ notificationToDelete?.message?.length > 100 ? '...' : '' }}"
              </div>
            </v-card-text>
            <v-card-actions>
              <v-spacer></v-spacer>
              <v-btn
                color="grey"
                variant="text"
                @click="showDeleteDialog = false"
                :disabled="deleting"
              >
                Cancel
              </v-btn>
              <v-btn
                color="error"
                variant="flat"
                @click="deleteNotification(notificationToDelete?.id)"
                :loading="deleting"
              >
                Delete
              </v-btn>
            </v-card-actions>
          </v-card>
        </v-dialog>

        <!-- Delete All Read Dialog -->
        <v-dialog v-model="showDeleteAllDialog" max-width="400">
          <v-card>
            <v-card-title class="text-h6">Delete Notifications</v-card-title>
            <v-card-text>
              <v-radio-group v-model="deleteOption">
                <v-radio value="read">
                  <template v-slot:label>
                    <div>
                      <div class="font-weight-medium">Delete all read notifications</div>
                      <div class="text-caption text-grey">
                        {{ notifications.filter((n) => n.is_read).length }} notifications will be
                        deleted
                      </div>
                    </div>
                  </template>
                </v-radio>
                <v-radio value="all">
                  <template v-slot:label>
                    <div>
                      <div class="font-weight-medium text-error">Delete ALL notifications</div>
                      <div class="text-caption text-grey">
                        {{ notifications.length }} notifications will be deleted. This cannot be
                        undone.
                      </div>
                    </div>
                  </template>
                </v-radio>
              </v-radio-group>
            </v-card-text>
            <v-card-actions>
              <v-spacer></v-spacer>
              <v-btn
                color="grey"
                variant="text"
                @click="showDeleteAllDialog = false"
                :disabled="deleting"
              >
                Cancel
              </v-btn>
              <v-btn
                :color="deleteOption === 'all' ? 'error' : 'primary'"
                variant="flat"
                @click="deleteOption === 'all' ? deleteAllNotifications() : deleteAllRead()"
                :loading="deleting"
              >
                {{ deleteOption === 'all' ? 'Delete All' : 'Delete Read' }}
              </v-btn>
            </v-card-actions>
          </v-card>
        </v-dialog>
      </v-main>
    </PullToRefreshWrapper>
  </v-app>
</template>

<style scoped>
/* CSS Variables for safe area insets */
/* CSS Variables for safe area insets */
:root {
  --sat: env(safe-area-inset-top);
  --sar: env(safe-area-inset-right);
  --sab: env(safe-area-inset-bottom);
  --sal: env(safe-area-inset-left);
}

/* Top Navigation Bar - Fixed for notches */
.top-nav {
  padding-top: env(safe-area-inset-top);
  background: linear-gradient(135deg, #3f83c7, #2f6ca9) !important;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.12) !important;
  color: white !important;
}

/* For iOS devices with dynamic island */
@supports (padding-top: env(safe-area-inset-top)) {
  .top-nav {
    padding-top: env(safe-area-inset-top);
    height: calc(56px + env(safe-area-inset-top)) !important;
  }
}

/* For older iOS devices */
@supports (padding-top: constant(safe-area-inset-top)) {
  .top-nav {
    padding-top: constant(safe-area-inset-top);
    height: calc(56px + constant(safe-area-inset-top)) !important;
  }
}

/* Ensure toolbar content is properly aligned */
.top-nav :deep(.v-toolbar__content) {
  height: 56px !important;
  padding-top: 0 !important;
}

.top-nav :deep(.v-toolbar-title) {
  font-size: 1.05rem;
  font-weight: 700;
  letter-spacing: 0.2px;
}

.top-nav :deep(.v-btn) {
  color: white !important;
}

/* Main content area - accounts for the fixed header */
.messages-view {
  margin-top: calc(56px + var(--sat, 0px));
  min-height: calc(100vh - 56px - var(--sat, 0px));
  padding-bottom: 80px;
}

/* iOS support for margin-top */
@supports (padding-top: env(safe-area-inset-top)) {
  .top-nav {
    padding-top: env(safe-area-inset-top);
  }

  .messages-view {
    margin-top: calc(56px + env(safe-area-inset-top));
  }
}

/* Landscape mode adjustment */
@media (orientation: landscape) and (max-height: 500px) {
  .top-nav {
    height: 56px !important;
    padding-top: 0 !important;
  }

  .messages-view {
    margin-top: 56px;
  }
}

/* Main content area - accounts for the fixed header */
.notification-view {
  max-width: 800px;
  margin: 0 auto;
  padding-top: calc(64px + var(--sat, 0px));
  padding-bottom: 80px;
}

/* iOS support for padding-top */
@supports (padding-top: env(safe-area-inset-top)) {
  .notification-view {
    padding-top: calc(64px + env(safe-area-inset-top));
  }
}

/* Landscape mode adjustment */
@media (orientation: landscape) and (max-height: 500px) {
  .notification-app-bar {
    height: 64px !important;
    padding-top: 0 !important;
  }

  .notification-view {
    padding-top: 64px;
  }
}

/* Rest of your existing styles */
.notification-item {
  border-bottom: 1px solid #e0e0e0;
  transition: background-color 0.2s ease;
  cursor: pointer;
  padding: 12px 16px;
}

.notification-item:last-child {
  border-bottom: none;
}

.notification-item:hover {
  background-color: #f5f7fa;
}

.notification-unread {
  background-color: #f0f7ff;
}

.notification-unread:hover {
  background-color: #e8f2ff;
}

.text-bold {
  font-weight: 600;
}

/* Time display styling */
.notification-time {
  font-size: 0.7rem;
  color: #999;
  white-space: nowrap;
}

/* Group header styling */
.v-subheader {
  background-color: #f8fafc;
  font-size: 0.85rem;
  font-weight: 600;
  padding: 8px 16px;
}

.notification-actions {
  opacity: 0;
  transition: opacity 0.2s ease;
}

.notification-item:hover .notification-actions {
  opacity: 1;
}

.notifications-list {
  border-radius: 8px;
  overflow: hidden;
}

.stats-summary {
  margin-top: -60px;
}

.stats-summary .v-card {
  border-radius: 12px;
}

.stats-summary .text-h6 {
  font-weight: 700;
}

:deep(.v-list-item__prepend) {
  align-items: flex-start;
  padding-top: 12px;
}

:deep(.v-list-item-title) {
  margin-bottom: 2px;
}

:deep(.v-list-item-subtitle) {
  opacity: 0.8;
  line-height: 1.4;
  white-space: normal;
  overflow-wrap: break-word;
}

/* Date separator styling */
:deep(.v-divider) {
  position: relative;
}

:deep(.v-divider__text) {
  background: white;
  padding: 0 12px;
}

/* Animation for new notifications */
@keyframes highlight {
  0% {
    background-color: #e3f2fd;
  }
  100% {
    background-color: transparent;
  }
}

.notification-item.new-notification {
  animation: highlight 2s ease;
}

/* Responsive adjustments */
@media (max-width: 600px) {
  .notification-item {
    padding: 10px 12px;
  }

  .notification-actions {
    opacity: 1; /* Always show actions on mobile */
  }

  .stats-summary .v-card-text {
    padding: 12px;
  }
}

/* Priority indicator */
.priority-indicator {
  width: 4px;
  height: 100%;
  position: absolute;
  left: 0;
  top: 0;
}

.priority-urgent {
  background-color: #f44336;
}
.priority-high {
  background-color: #ff9800;
}
.priority-normal {
  background-color: #2196f3;
}
.priority-low {
  background-color: #9e9e9e;
}
</style>
