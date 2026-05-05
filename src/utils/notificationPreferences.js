const NOTIFICATION_SETTINGS_KEY = 'closeshop_notification_settings'
const CHAT_SETTINGS_KEY = 'closeshop_chat_settings'

const DEFAULT_NOTIFICATION_SETTINGS = {
  enabled: true,
  orderStatus: true,
  delivery: true,
  promotions: false,
}

const DEFAULT_CHAT_SETTINGS = {
  notifications: true,
  muteAll: false,
}

const readJsonStorage = (storageKey, fallbackValue) => {
  try {
    const rawValue = localStorage.getItem(storageKey)
    if (!rawValue) {
      return { ...fallbackValue }
    }

    const parsedValue = JSON.parse(rawValue)
    return {
      ...fallbackValue,
      ...(parsedValue && typeof parsedValue === 'object' ? parsedValue : {}),
    }
  } catch (error) {
    console.warn(`Unable to read notification preference storage for ${storageKey}:`, error)
    return { ...fallbackValue }
  }
}

export const loadNotificationSettings = () =>
  readJsonStorage(NOTIFICATION_SETTINGS_KEY, DEFAULT_NOTIFICATION_SETTINGS)

export const saveNotificationSettings = (settings) => {
  const normalizedSettings = {
    ...DEFAULT_NOTIFICATION_SETTINGS,
    ...(settings && typeof settings === 'object' ? settings : {}),
  }
  localStorage.setItem(NOTIFICATION_SETTINGS_KEY, JSON.stringify(normalizedSettings))
  return normalizedSettings
}

export const loadChatSettings = () => readJsonStorage(CHAT_SETTINGS_KEY, DEFAULT_CHAT_SETTINGS)

export const saveChatSettings = (settings) => {
  const normalizedSettings = {
    ...DEFAULT_CHAT_SETTINGS,
    ...(settings && typeof settings === 'object' ? settings : {}),
  }
  localStorage.setItem(CHAT_SETTINGS_KEY, JSON.stringify(normalizedSettings))
  return normalizedSettings
}

export const loadUnifiedPushPreferences = () => {
  const notificationSettings = loadNotificationSettings()
  const chatSettings = loadChatSettings()

  return {
    enabled: !!notificationSettings.enabled,
    chatMessages: !!chatSettings.notifications && !chatSettings.muteAll,
    orderUpdates: !!notificationSettings.orderStatus || !!notificationSettings.delivery,
    promotions: !!notificationSettings.promotions,
  }
}

export const notificationTypeMatchesPreferences = ({ type, relatedType } = {}) => {
  const preferences = loadUnifiedPushPreferences()
  if (!preferences.enabled) {
    return false
  }

  if (type === 'new_message') {
    return preferences.chatMessages
  }

  if (
    relatedType === 'order' ||
    type === 'order_placed' ||
    type === 'shipping_update' ||
    type === 'order_delivered'
  ) {
    return preferences.orderUpdates
  }

  return true
}
