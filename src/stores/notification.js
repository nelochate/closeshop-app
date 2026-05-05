import { defineStore } from 'pinia'
import { supabase } from '@/utils/supabase'
import {
  filterVisibleNotifications,
  resolveVisibleNotification,
} from '@/utils/chatNotifications'

export const useNotificationStore = defineStore('notification', {
  state: () => ({
    notifications: [],
    loading: false,
    channel: null,
    currentUserId: null,
  }),

  actions: {
    async fetchNotifications(userId) {
      this.loading = true
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })

      if (error) {
        console.error('❌ Error fetching notifications:', error)
      } else {
        this.notifications = await filterVisibleNotifications(data || [])
      }
      this.loading = false
    },

    cleanupListener() {
      if (this.channel) {
        supabase.removeChannel(this.channel)
        this.channel = null
      }

      this.currentUserId = null
    },

    listenForNotifications(userId) {
      if (!userId) return

      if (this.channel && this.currentUserId === userId) {
        return
      }

      this.cleanupListener()
      this.currentUserId = userId

      this.channel = supabase
        .channel(`notifications:user:${userId}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'notifications',
            filter: `user_id=eq.${userId}`,
          },
          async (payload) => {
            console.log('🔔 New notification:', payload.new)
            const visibleNotification = await resolveVisibleNotification(payload.new)
            if (!visibleNotification) {
              return
            }
            this.notifications.unshift(visibleNotification)
          }
        )
        .subscribe()
    },
  },
})
