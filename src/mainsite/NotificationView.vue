<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/utils/supabase'

const router = useRouter()
const goBack = () => router.back()

const notifications = ref<any[]>([])
const loading = ref(true)
const snackbar = ref(false)
const snackbarMessage = ref('')
const snackbarColor = ref('primary')
let channel: any = null

// ✅ Fetch user's notifications
const fetchNotifications = async (userId: string) => {
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (error) console.error('❌ Error fetching notifications:', error)
  else notifications.value = data || []
  loading.value = false
}

// ✅ Listen for real-time inserts
const listenForNotifications = (userId: string) => {
  channel = supabase
    .channel(`user_notifications_${userId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${userId}`,
      },
      (payload) => {
        const newNotif = payload.new
        notifications.value.unshift(newNotif)

        // 🔔 Show toast
        snackbarMessage.value = `📬 ${newNotif.title}: ${newNotif.message}`
        snackbarColor.value = 'primary'
        snackbar.value = true

        console.log('🔔 New notification received:', newNotif)
      }
    )
    .subscribe()
}

onMounted(async () => {
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (session?.user) {
    const userId = session.user.id
    await fetchNotifications(userId)
    listenForNotifications(userId)
  } else {
    console.warn('⚠️ No user session found. Cannot fetch notifications.')
  }
})

onBeforeUnmount(() => {
  if (channel) supabase.removeChannel(channel)
})
</script>

<template>
  <v-app>
    <!-- Top Bar -->
    <v-app-bar class="app-bar" flat elevation="0" color="transparent">
      <v-btn variant="text" @click="goBack">
        <v-icon start>mdi-arrow-left</v-icon>
      </v-btn>
      <v-toolbar-title class="font-bold">
        <strong>Notifications</strong>
      </v-toolbar-title>
    </v-app-bar>

    <v-divider />

    <v-main>
      <div class="notification-view">
        <!-- Loading -->
        <v-progress-circular
          v-if="loading"
          indeterminate
          color="primary"
          class="my-4"
        />

        <!-- If no notifications -->
        <v-alert
          v-else-if="notifications.length === 0"
          type="info"
          border="start"
          color="primary"
          icon="mdi-information-outline"
        >
          No notifications yet!
        </v-alert>

        <!-- Otherwise show list -->
        <v-list v-else>
          <v-list-item
            v-for="notif in notifications"
            :key="notif.id"
            :class="{ 'bg-grey-lighten-4': !notif.read }"
            class="notification-item"
          >
            <!-- ✅ Vuetify 3 syntax: prepend slot replaces v-list-item-avatar -->
            <template #prepend>
              <v-avatar color="primary" size="40">
                <v-icon color="white">{{ notif.icon || 'mdi-bell' }}</v-icon>
              </v-avatar>
            </template>

            <v-list-item-title>
              <strong>{{ notif.title }}</strong>
            </v-list-item-title>
            <v-list-item-subtitle>
              {{ notif.message }}
            </v-list-item-subtitle>

            <!-- ✅ append slot replaces manual div -->
            <template #append>
              <div class="text-caption text-grey">
                {{ new Date(notif.created_at).toLocaleString() }}
              </div>
            </template>
          </v-list-item>
        </v-list>
      </div>
    </v-main>

    <!-- ✅ Snackbar for real-time notification -->
    <v-snackbar
      v-model="snackbar"
      :timeout="4000"
      :color="snackbarColor"
      location="top"
    >
      {{ snackbarMessage }}
      <template #actions>
        <v-btn variant="text" color="white" @click="snackbar = false">
          Close
        </v-btn>
      </template>
    </v-snackbar>
  </v-app>
</template>

<style scoped>
.app-bar {
  padding-top: 19px;
}

.notification-view {
  padding: 16px;
}
.notification-item {
  border-bottom: 1px solid #eee;
  cursor: pointer;
}
.notification-item:hover {
  background: #f5f5f5;
}
</style>
