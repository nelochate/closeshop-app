import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { supabase } from '@/utils/supabase'

export const useMessageBadgeStore = defineStore('messageBadge', () => {
  const unreadCount = ref(0)
  const subscription = ref(null)
  const initialized = ref(false)
  const activeUserId = ref(null)
  let authListenerRegistered = false
  let initPromise = null

  const hasUnreadMessages = computed(() => unreadCount.value > 0)

  const clearState = () => {
    unreadCount.value = 0
    activeUserId.value = null

    if (subscription.value) {
      supabase.removeChannel(subscription.value)
      subscription.value = null
    }

    initialized.value = false
  }

  const fetchUnreadMessages = async (userId = activeUserId.value) => {
    if (!userId) {
      unreadCount.value = 0
      return 0
    }

    const { count, error } = await supabase
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('receiver_id', userId)
      .eq('is_read', false)

    if (error) {
      console.error('Error fetching unread messages:', error)
      return unreadCount.value
    }

    unreadCount.value = count || 0
    return unreadCount.value
  }

  const subscribeToMessages = async (userId = activeUserId.value) => {
    if (!userId) {
      return
    }

    if (subscription.value && activeUserId.value === userId) {
      return
    }

    if (subscription.value) {
      supabase.removeChannel(subscription.value)
      subscription.value = null
    }

    activeUserId.value = userId
    subscription.value = supabase
      .channel(`message-badge:${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `receiver_id=eq.${userId}`,
        },
        (payload) => {
          if (!payload.new?.is_read) {
            unreadCount.value += 1
          }
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'messages',
          filter: `receiver_id=eq.${userId}`,
        },
        (payload) => {
          if (payload.new?.is_read && payload.old?.is_read === false) {
            unreadCount.value = Math.max(0, unreadCount.value - 1)
          }
        },
      )
      .subscribe()
  }

  const registerAuthListener = () => {
    if (authListenerRegistered) {
      return
    }

    supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT' || !session?.user?.id) {
        clearState()
        return
      }

      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
        void initialize(session.user.id)
      }
    })

    authListenerRegistered = true
  }

  const initialize = async (userId = null) => {
    if (initPromise) {
      return initPromise
    }

    initPromise = (async () => {
      registerAuthListener()

      let resolvedUserId = userId
      if (!resolvedUserId) {
        const {
          data: { user },
        } = await supabase.auth.getUser()

        resolvedUserId = user?.id || null
      }

      if (!resolvedUserId) {
        clearState()
        return false
      }

      if (initialized.value && activeUserId.value === resolvedUserId && subscription.value) {
        return true
      }

      activeUserId.value = resolvedUserId
      await fetchUnreadMessages(resolvedUserId)
      await subscribeToMessages(resolvedUserId)
      initialized.value = true
      return true
    })()

    try {
      return await initPromise
    } finally {
      initPromise = null
    }
  }

  const markAllMessagesAsRead = async () => {
    let userId = activeUserId.value

    if (!userId) {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      userId = user?.id || null
    }

    if (!userId) {
      return
    }

    const { error } = await supabase
      .from('messages')
      .update({ is_read: true })
      .eq('receiver_id', userId)
      .eq('is_read', false)

    if (error) {
      console.error('Error marking messages as read:', error)
      return
    }

    unreadCount.value = 0
  }

  return {
    unreadCount,
    hasUnreadMessages,
    initialized,
    activeUserId,
    initialize,
    fetchUnreadMessages,
    markAllMessagesAsRead,
    clearState,
  }
})
