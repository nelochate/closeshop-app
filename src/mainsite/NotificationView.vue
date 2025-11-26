<script setup>
import { ref, onMounted, onUnmounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/utils/supabase'

const router = useRouter()
const notifications = ref([])
const unreadCount = ref(0)
const loading = ref(true)

let notificationSubscription

// Computed for unread notifications
const unreadNotifications = computed(() => 
  notifications.value.filter(n => !n.is_read)
)

onMounted(() => {
  setupNotificationListener()
  fetchNotifications()
  requestNotificationPermission()
})

onUnmounted(() => {
  notificationSubscription?.unsubscribe()
})

// Request browser notification permission
async function requestNotificationPermission() {
  if ('Notification' in window && Notification.permission === 'default') {
    await Notification.requestPermission()
  }
}

async function setupNotificationListener() {
  const { data: { user } } = await supabase.auth.getUser()
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
        filter: `user_id=eq.${user.id}`
      },
      (payload) => {
        console.log('New notification:', payload)
        notifications.value.unshift(payload.new)
        unreadCount.value++
        
        // Show browser notification
        showBrowserNotification(payload.new)
      }
    )
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${user.id}`
      },
      (payload) => {
        // Update local state if notification is marked as read
        const index = notifications.value.findIndex(n => n.id === payload.new.id)
        if (index !== -1) {
          notifications.value[index] = payload.new
          if (payload.new.is_read && !payload.old.is_read) {
            unreadCount.value = Math.max(0, unreadCount.value - 1)
          }
        }
      }
    )
    .subscribe()
}

async function fetchNotifications() {
  const { data: { user } } = await supabase.auth.getUser()
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
      notifications.value = data
      unreadCount.value = data.filter(n => !n.is_read).length
    }
  } catch (error) {
    console.error('Error fetching notifications:', error)
  } finally {
    loading.value = false
  }
}

function showBrowserNotification(notification) {
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification('CloseShop', {
      body: notification.message,
      icon: '/icon.png',
      tag: notification.id
    })
  }
}

async function markAsRead(notificationId) {
  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('id', notificationId)

  if (!error) {
    // Update local state
    const notification = notifications.value.find(n => n.id === notificationId)
    if (notification && !notification.is_read) {
      notification.is_read = true
      unreadCount.value = Math.max(0, unreadCount.value - 1)
    }
  }
}

async function markAllAsRead() {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('user_id', user.id)
    .eq('is_read', false)

  if (!error) {
    // Update all local notifications to read
    notifications.value.forEach(notification => {
      notification.is_read = true
    })
    unreadCount.value = 0
  }
}

// 🎯 ENHANCED: Smart notification routing based on type and related_id
function handleNotificationClick(notification) {
  // Mark as read when clicked
  if (!notification.is_read) {
    markAsRead(notification.id)
  }

  // Navigate based on notification type and related_id
  navigateToNotificationTarget(notification)
}

function navigateToNotificationTarget(notification) {
  const { type, related_id, related_type } = notification
  
  console.log('Navigating notification:', { type, related_id, related_type })

  // Determine route based on notification type and related data
  switch (type) {
    
    // 🛒 Order-related notifications
    case 'order_placed':
    case 'order_confirmed':
    case 'order_shipped':
    case 'order_delivered':
    case 'order_cancelled':
      if (related_id) {
        router.push({ name: 'orderdetails', params: { id: related_id } })
      } else {
        router.push({ name: 'profileview' }) // Fallback to profile/orders
      }
      break

    // 💬 Message notifications
    case 'new_message':
      if (related_id) {
        router.push({ name: 'chatview', params: { id: related_id } })
      } else {
        router.push({ name: 'messageview' })
      }
      break

    // 🏪 Shop-related notifications
    case 'shop_approved':
    case 'shop_declined':
      router.push({ name: 'usershop' })
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
        router.push({ name: 'orderdetails', params: { id: related_id } })
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
  const date = new Date(timestamp)
  const now = new Date()
  const diffMs = now - date
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return 'Just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  
  return date.toLocaleDateString()
}

function getNotificationIcon(type) {
  const icons = {
    order_placed: 'mdi-package-variant',
    order_confirmed: 'mdi-check-circle',
    order_shipped: 'mdi-truck-delivery',
    order_delivered: 'mdi-package',
    order_cancelled: 'mdi-close-circle',
    payment_received: 'mdi-credit-card-check',
    payment_failed: 'mdi-credit-card-remove',
    payment_successful: 'mdi-credit-card-check',
    new_message: 'mdi-message-text',
    new_review: 'mdi-star',
    low_stock: 'mdi-alert',
    out_of_stock: 'mdi-alert-circle',
    shop_approved: 'mdi-store-check',
    shop_declined: 'mdi-store-remove',
    promotional: 'mdi-percent',
    system: 'mdi-cog'
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
    payment_received: 'success',
    payment_failed: 'error',
    payment_successful: 'success',
    new_message: 'primary',
    new_review: 'amber',
    low_stock: 'warning',
    out_of_stock: 'error',
    shop_approved: 'success',
    shop_declined: 'error',
    promotional: 'purple',
    system: 'grey'
  }
  return colors[type] || 'primary'
}

// Helper to get human-readable notification title
function getNotificationTitle(notification) {
  const titles = {
    order_placed: 'New Order',
    order_confirmed: 'Order Confirmed',
    order_shipped: 'Order Shipped',
    order_delivered: 'Order Delivered',
    order_cancelled: 'Order Cancelled',
    payment_received: 'Payment Received',
    payment_failed: 'Payment Failed',
    payment_successful: 'Payment Successful',
    new_message: 'New Message',
    new_review: 'New Review',
    low_stock: 'Low Stock Alert',
    out_of_stock: 'Out of Stock',
    shop_approved: 'Shop Approved',
    shop_declined: 'Shop Declined',
    promotional: 'Special Offer',
    system: 'System Update'
  }
  return titles[notification.type] || 'Notification'
}
</script>

<template>
  <v-app>
    <v-main>
      <v-app-bar color="primary" density="compact">
        <v-app-bar-nav-icon @click="router.back()">
          <v-icon>mdi-arrow-left</v-icon>
        </v-app-bar-nav-icon>
        <v-app-bar-title>Notifications</v-app-bar-title>
        <v-spacer></v-spacer>
        <v-btn 
          v-if="unreadCount > 0" 
          icon 
          @click="markAllAsRead"
          :disabled="loading"
        >
          <v-icon>mdi-check-all</v-icon>
          <v-tooltip activator="parent" location="bottom">Mark all as read</v-tooltip>
        </v-btn>
      </v-app-bar>

      <v-container class="notification-view">
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
              <v-list-item
                v-for="notification in notifications"
                :key="notification.id"
                :class="['notification-item', { 'notification-unread': !notification.is_read }]"
                @click="handleNotificationClick(notification)"
              >
                <template #prepend>
                  <v-avatar :color="getNotificationColor(notification.type)" size="40">
                    <v-icon :icon="getNotificationIcon(notification.type)" color="white" />
                  </v-avatar>
                </template>

                <v-list-item-title 
                  :class="{ 'text-bold': !notification.is_read }"
                  class="text-body-1"
                >
                  {{ getNotificationTitle(notification) }}
                </v-list-item-title>

                <v-list-item-subtitle class="text-caption">
                  {{ notification.message }}
                </v-list-item-subtitle>

                <template #append>
                  <div class="notification-meta">
                    <div class="text-caption text-grey">
                      {{ formatTime(notification.created_at) }}
                    </div>
                    <v-icon 
                      v-if="!notification.is_read" 
                      color="primary" 
                      size="small"
                    >
                      mdi-circle-small
                    </v-icon>
                  </div>
                </template>
              </v-list-item>
            </v-list>
          </v-card>
        </div>
      </v-container>
    </v-main>
  </v-app>
</template>

<style scoped>
.notification-view {
  max-width: 800px;
  margin: 0 auto;
}

.notification-item {
  border-bottom: 1px solid #e0e0e0;
  transition: background-color 0.2s ease;
  cursor: pointer;
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

.notification-meta {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
  min-width: 60px;
}

.notifications-list {
  border-radius: 8px;
  overflow: hidden;
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
}
</style>