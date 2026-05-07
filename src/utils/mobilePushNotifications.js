import { Capacitor } from '@capacitor/core'
import { App } from '@capacitor/app'
import { PushNotifications } from '@capacitor/push-notifications'
import { LocalNotifications } from '@capacitor/local-notifications'
import router from '@/router'
import { supabase } from '@/utils/supabase'
import {
  fetchNotificationPreferences,
  getNotificationPreferencesSnapshot,
  notificationTypeMatchesPreferences,
} from '@/utils/notificationPreferences'

const PUSH_CHANNEL_ID = 'closeshop-high-priority'
const PUSH_CHANNEL_NAME = 'CloseShop Alerts'
const PUSH_TOKEN_TABLE = 'user_push_tokens'

let activeUserId = null
let activePushToken = ''
let appStateInitialized = false
let listenersRegistered = false
let isAppActive = true
let lastForegroundNotificationKey = ''

const normalizeText = (value) => (typeof value === 'string' ? value.trim() : '')

const isNativePushSupported = () => Capacitor.isNativePlatform()

const buildPushPreferencePayload = async ({ userId, preferences = null } = {}) => {
  const resolvedPreferences =
    preferences ||
    (userId ? await fetchNotificationPreferences(userId) : getNotificationPreferencesSnapshot())

  return {
    notifications_enabled: !!resolvedPreferences.enabled,
    chat_enabled: !!resolvedPreferences.chatMessages,
    order_enabled: !!resolvedPreferences.orderUpdates,
  }
}

const buildNotificationPayload = (notification = {}) => {
  const data = notification?.data && typeof notification.data === 'object' ? notification.data : {}

  return {
    id: normalizeText(data.notification_id || notification?.id),
    title: normalizeText(notification?.title || data.title) || 'CloseShop',
    body: normalizeText(notification?.body || data.message),
    type: normalizeText(data.type),
    relatedId: normalizeText(data.related_id),
    relatedType: normalizeText(data.related_type),
    actionUrl: normalizeText(data.action_url),
    data: {
      ...data,
    },
  }
}

const shouldDisplayPushNotification = (notification = {}) =>
  notificationTypeMatchesPreferences({
    type: normalizeText(notification.type),
    relatedType: normalizeText(notification.relatedType),
  })

const ensureAppStateTracking = async () => {
  if (!isNativePushSupported() || appStateInitialized) {
    return
  }

  const appState = await App.getState()
  isAppActive = !!appState?.isActive

  App.addListener('appStateChange', ({ isActive }) => {
    isAppActive = !!isActive
  })

  appStateInitialized = true
}

const ensureForegroundNotificationPermission = async () => {
  if (!isNativePushSupported()) {
    return false
  }

  let permissionStatus = await LocalNotifications.checkPermissions()
  if (permissionStatus.display === 'prompt') {
    permissionStatus = await LocalNotifications.requestPermissions()
  }

  return permissionStatus.display === 'granted'
}

const persistPushToken = async ({ userId, token }) => {
  if (!userId || !token) {
    return
  }

  activePushToken = token

  const { error } = await supabase.from(PUSH_TOKEN_TABLE).upsert(
    {
      user_id: userId,
      token,
      platform: Capacitor.getPlatform(),
      is_active: true,
      ...(await buildPushPreferencePayload({ userId })),
      last_seen_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'token' },
  )

  if (error) {
    console.error('Failed to save mobile push token:', error)
  }
}

const showAndroidForegroundNotification = async (notification) => {
  if (Capacitor.getPlatform() !== 'android' || !isAppActive) {
    return
  }

  if (!shouldDisplayPushNotification(notification)) {
    return
  }

  const permissionGranted = await ensureForegroundNotificationPermission()
  if (!permissionGranted) {
    return
  }

  const dedupeKey = [notification.id, notification.title, notification.body].filter(Boolean).join(':')
  if (dedupeKey && dedupeKey === lastForegroundNotificationKey) {
    return
  }

  lastForegroundNotificationKey = dedupeKey
  window.setTimeout(() => {
    if (lastForegroundNotificationKey === dedupeKey) {
      lastForegroundNotificationKey = ''
    }
  }, 1500)

  await LocalNotifications.schedule({
    notifications: [
      {
        id: Date.now() % 2147483647,
        title: notification.title || 'CloseShop',
        body: notification.body || 'You have a new update.',
        channelId: PUSH_CHANNEL_ID,
        extra: notification.data,
      },
    ],
  })
}

const resolveOrderRoute = async (orderId) => {
  if (!orderId) {
    return { name: 'notificationview' }
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user?.id) {
    return { name: 'notificationview' }
  }

  try {
    const { data: riderRegistration, error: riderError } = await supabase
      .from('Rider_Registration')
      .select('rider_id')
      .eq('profile_id', user.id)
      .maybeSingle()

    if (riderError) {
      throw riderError
    }

    if (!riderRegistration?.rider_id) {
      return { name: 'order-details', params: { id: orderId } }
    }

    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('rider_id')
      .eq('id', orderId)
      .maybeSingle()

    if (orderError) {
      throw orderError
    }

    if (Number(order?.rider_id) === Number(riderRegistration.rider_id)) {
      return { name: 'rider-order-details', params: { id: orderId } }
    }
  } catch (error) {
    console.warn('Could not resolve order route from push notification:', error)
  }

  return { name: 'order-details', params: { id: orderId } }
}

const routeFromPushPayload = async (data = {}) => {
  const actionUrl = normalizeText(data.action_url)
  const type = normalizeText(data.type)
  const relatedId = normalizeText(data.related_id)
  const relatedType = normalizeText(data.related_type)

  if (actionUrl) {
    await router.push(actionUrl)
    return
  }

  if (type === 'new_message' && relatedId) {
    await router.push({ name: 'chatview', params: { id: relatedId } })
    return
  }

  if (relatedType === 'order' && relatedId) {
    await router.push(await resolveOrderRoute(relatedId))
    return
  }

  await router.push({ name: 'notificationview' })
}

const registerPushListeners = async () => {
  if (!isNativePushSupported() || listenersRegistered) {
    return
  }

  await ensureAppStateTracking()

  await PushNotifications.addListener('registration', async (token) => {
    activePushToken = normalizeText(token?.value)

    if (activeUserId && activePushToken) {
      await persistPushToken({
        userId: activeUserId,
        token: activePushToken,
      })
    }
  })

  await PushNotifications.addListener('registrationError', (error) => {
    console.error('Mobile push registration failed:', error)
  })

  await PushNotifications.addListener('pushNotificationReceived', async (notification) => {
    await showAndroidForegroundNotification(buildNotificationPayload(notification))
  })

  await PushNotifications.addListener('pushNotificationActionPerformed', async (action) => {
    await routeFromPushPayload(action?.notification?.data || {})
  })

  await LocalNotifications.addListener('localNotificationActionPerformed', async (event) => {
    await routeFromPushPayload(event?.notification?.extra || {})
  })

  listenersRegistered = true
}

export const initializeMobilePushNotifications = async (user) => {
  if (!isNativePushSupported() || !user?.id) {
    return false
  }

  activeUserId = user.id

  await ensureAppStateTracking()
  await registerPushListeners()

  if (Capacitor.getPlatform() === 'android') {
    await PushNotifications.createChannel({
      id: PUSH_CHANNEL_ID,
      name: PUSH_CHANNEL_NAME,
      description: 'Chat messages and order updates',
      importance: 5,
      visibility: 1,
      sound: 'default',
    })
  }

  let permissionStatus = await PushNotifications.checkPermissions()
  if (permissionStatus.receive === 'prompt') {
    permissionStatus = await PushNotifications.requestPermissions()
  }

  if (permissionStatus.receive !== 'granted') {
    console.warn('Mobile push notification permission was not granted.')
    return false
  }

  await ensureForegroundNotificationPermission()
  await PushNotifications.register()

  if (activePushToken) {
    await persistPushToken({
      userId: user.id,
      token: activePushToken,
    })
  }

  await syncPushNotificationPreferences(user.id)
  return true
}

export const syncPushNotificationPreferences = async (userId, preferences = null) => {
  if (!isNativePushSupported() || !userId) {
    return
  }

  const pushPreferencePayload = await buildPushPreferencePayload({
    userId,
    preferences,
  })

  const { error } = await supabase
    .from(PUSH_TOKEN_TABLE)
    .update({
      ...pushPreferencePayload,
      updated_at: new Date().toISOString(),
      last_seen_at: new Date().toISOString(),
    })
    .eq('user_id', userId)

  if (error) {
    console.error('Failed to sync push notification preferences:', error)
  }
}

export const deactivateCurrentPushToken = async (userId) => {
  if (!isNativePushSupported() || !userId || !activePushToken) {
    activeUserId = null
    return
  }

  const { error } = await supabase
    .from(PUSH_TOKEN_TABLE)
    .update({
      is_active: false,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId)
    .eq('token', activePushToken)

  if (error) {
    console.error('Failed to deactivate current push token:', error)
  }

  activeUserId = null
}

export const canUseNativePushNotifications = () => isNativePushSupported()
