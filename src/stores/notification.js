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

    listenForNotifications(userId) {
      const channel = supabase
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
