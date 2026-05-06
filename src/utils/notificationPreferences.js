import { useAuthUserStore } from '@/stores/authUser'
import { supabase } from '@/utils/supabase'
import { withSchemaColumnFallback } from '@/utils/supabaseSchema'

const DEFAULT_NOTIFICATION_PREFERENCES = Object.freeze({
  enabled: true,
  chatMessages: true,
  orderUpdates: true,
})

const ORDER_NOTIFICATION_TYPES = new Set([
  'order_placed',
  'shipping_update',
  'order_delivered',
])

const normalizeBooleanSetting = (value, fallbackValue) => {
  if (value === true) return true
  if (value === false) return false
  return fallbackValue
}

const getAuthStoreSafely = () => {
  try {
    return useAuthUserStore()
  } catch (error) {
    return null
  }
}

export const normalizeNotificationPreferences = (source = {}) => ({
  enabled: normalizeBooleanSetting(
    source.enabled ?? source.notification_push_enabled,
    DEFAULT_NOTIFICATION_PREFERENCES.enabled,
  ),
  chatMessages: normalizeBooleanSetting(
    source.chatMessages ?? source.notification_chat_enabled,
    DEFAULT_NOTIFICATION_PREFERENCES.chatMessages,
  ),
  orderUpdates: normalizeBooleanSetting(
    source.orderUpdates ?? source.notification_order_enabled,
    DEFAULT_NOTIFICATION_PREFERENCES.orderUpdates,
  ),
})

export const buildProfileNotificationPreferencePayload = (preferences = {}) => {
  const normalizedPreferences = normalizeNotificationPreferences(preferences)

  return {
    notification_push_enabled: normalizedPreferences.enabled,
    notification_chat_enabled: normalizedPreferences.chatMessages,
    notification_order_enabled: normalizedPreferences.orderUpdates,
  }
}

const syncAuthStoreProfilePreferences = (profileLike = null, userId = null) => {
  const authStore = getAuthStoreSafely()
  if (!authStore?.userData?.id) {
    return
  }

  if (userId && authStore.userData.id !== userId) {
    return
  }

  const existingProfile = authStore.profile || { id: authStore.userData.id }
  const payload =
    profileLike && typeof profileLike === 'object'
      ? {
          ...buildProfileNotificationPreferencePayload(profileLike),
          ...profileLike,
        }
      : buildProfileNotificationPreferencePayload()

  authStore.profile = {
    ...existingProfile,
    ...payload,
  }
}

export const getNotificationPreferencesSnapshot = (profile = null) => {
  if (profile && typeof profile === 'object') {
    return normalizeNotificationPreferences(profile)
  }

  const authStore = getAuthStoreSafely()
  if (authStore?.profile) {
    return normalizeNotificationPreferences(authStore.profile)
  }

  return { ...DEFAULT_NOTIFICATION_PREFERENCES }
}

export const fetchNotificationPreferences = async (userId) => {
  if (!userId) {
    return { ...DEFAULT_NOTIFICATION_PREFERENCES }
  }

  const authStore = getAuthStoreSafely()
  if (authStore?.userData?.id === userId && authStore.profile) {
    return normalizeNotificationPreferences(authStore.profile)
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle()

  if (error) {
    console.warn('Could not fetch notification preferences from profiles:', error)
    return { ...DEFAULT_NOTIFICATION_PREFERENCES }
  }

  if (data) {
    syncAuthStoreProfilePreferences(data, userId)
  }

  return normalizeNotificationPreferences(data || {})
}

export const saveNotificationPreferences = async ({ userId, preferences }) => {
  if (!userId) {
    throw new Error('A user id is required to save notification preferences.')
  }

  const authStore = getAuthStoreSafely()
  const currentPreferences = await fetchNotificationPreferences(userId)
  const normalizedPreferences = normalizeNotificationPreferences({
    ...currentPreferences,
    ...(preferences && typeof preferences === 'object' ? preferences : {}),
  })
  const profilePayload = buildProfileNotificationPreferencePayload(normalizedPreferences)
  const baseProfile = authStore?.profile || {}

  const { data, error, appliedPayload } = await withSchemaColumnFallback({
    payload: {
      id: userId,
      role: baseProfile.role || 'customer',
      ...profilePayload,
    },
    requiredColumns: ['id', 'role'],
    execute: (currentPayload) =>
      supabase
        .from('profiles')
        .upsert(currentPayload, { onConflict: 'id' })
        .select('*')
        .single(),
  })

  if (error) {
    throw error
  }

  const mergedProfile = {
    ...baseProfile,
    id: userId,
    ...appliedPayload,
    ...(data || {}),
  }

  syncAuthStoreProfilePreferences(mergedProfile, userId)
  return normalizeNotificationPreferences(mergedProfile)
}

const isChatNotification = ({ type } = {}) => type === 'new_message'

const isOrderNotification = ({ type, relatedType } = {}) =>
  relatedType === 'order' || ORDER_NOTIFICATION_TYPES.has(type || '')

export const notificationRecordMatchesPreferences = ({
  type,
  relatedType,
  preferences = null,
} = {}) => {
  const resolvedPreferences = normalizeNotificationPreferences(
    preferences || getNotificationPreferencesSnapshot(),
  )

  if (isChatNotification({ type })) {
    return resolvedPreferences.chatMessages
  }

  if (isOrderNotification({ type, relatedType })) {
    return resolvedPreferences.orderUpdates
  }

  return true
}

export const notificationTypeMatchesPreferences = ({
  type,
  relatedType,
  preferences = null,
} = {}) => {
  const resolvedPreferences = normalizeNotificationPreferences(
    preferences || getNotificationPreferencesSnapshot(),
  )

  if (!resolvedPreferences.enabled) {
    return false
  }

  return notificationRecordMatchesPreferences({
    type,
    relatedType,
    preferences: resolvedPreferences,
  })
}

export const canUserReceiveNotificationRecord = async ({
  userId,
  type,
  relatedType,
}) => {
  if (!userId) {
    return false
  }

  const preferences = await fetchNotificationPreferences(userId)
  return notificationRecordMatchesPreferences({
    type,
    relatedType,
    preferences,
  })
}

export const createNotificationRecordIfEnabled = async ({
  userId,
  type,
  title,
  message,
  relatedId = null,
  relatedType = null,
  isRead = false,
  createdAt = new Date().toISOString(),
}) => {
  if (!userId) {
    return { created: false, reason: 'missing-user-id' }
  }

  const canReceiveNotification = await canUserReceiveNotificationRecord({
    userId,
    type,
    relatedType,
  })

  if (!canReceiveNotification) {
    return { created: false, reason: 'disabled-by-user-preference' }
  }

  const { error } = await supabase.from('notifications').insert({
    user_id: userId,
    type,
    title,
    message,
    related_id: relatedId,
    related_type: relatedType,
    is_read: isRead,
    created_at: createdAt,
  })

  if (error) {
    throw error
  }

  return { created: true }
}
