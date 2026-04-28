import { supabase } from '@/utils/supabase'
import {
  resolveConversationViewerRole,
  resolveCounterpartyIdentity,
} from '@/utils/chatIdentity'
import { parseAppTimestamp } from '@/utils/dateTime'

const ORDER_MESSAGE_MARKERS = ['New Order Received!', 'Order ID:', 'Transaction #:']

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

type RecentMessageNotificationParams = {
  receiverUserId: string
  conversationId?: string
  senderUserId?: string
  messageCreatedAt: string
  lookbackMs?: number
  maxAttempts?: number
  retryDelayMs?: number
}

type PriorSenderMessageParams = {
  conversationId: string
  senderId: string
  beforeCreatedAt: string
}

type NotificationRecord = {
  id?: string | null
  user_id?: string | null
  type?: string | null
  title?: string | null
  message?: string | null
  related_id?: string | null
  created_at?: string | null
}

type MessageRecord = {
  id: string
  conversation_id: string
  sender_id: string
  receiver_id: string
  content: string | null
  created_at: string
}

type MessageNotificationInsight = {
  shouldSuppress: boolean
  sourceMessage: MessageRecord | null
  event: 'conversation_start' | 'first_reply' | null
  counterpartyDisplayName: string | null
  counterpartyAvatar: string | null
  customerFacingShopIdentity: boolean
  notificationTitle: string | null
  notificationMessage: string | null
}

type ProfileRecord = {
  first_name?: string | null
  last_name?: string | null
  avatar_url?: string | null
}

type ShopRecord = {
  business_name?: string | null
  logo_url?: string | null
}

type ConversationRecord = {
  user1?: string | null
  user2?: string | null
}

const ORDER_MESSAGE_NOTIFICATION_MATCH_WINDOW_MS = 2 * 60 * 1000
const shopCache = new Map<string, ShopRecord | null>()
const profileCache = new Map<string, ProfileRecord | null>()
const conversationCache = new Map<string, ConversationRecord | null>()

const getConversationRoleForUser = (conversation?: ConversationRecord | null, userId?: string | null) => {
  if (!conversation || !userId) {
    return null
  }

  if (conversation.user1 === userId) {
    return 'customer'
  }

  if (conversation.user2 === userId) {
    return 'seller'
  }

  return null
}

export const isOrderChatMessage = (content?: string | null) => {
  if (!content) return false
  return ORDER_MESSAGE_MARKERS.some((marker) => content.includes(marker))
}

const getShopByOwnerId = async (ownerId?: string | null) => {
  if (!ownerId) {
    return null
  }

  if (shopCache.has(ownerId)) {
    return shopCache.get(ownerId) || null
  }

  const { data, error } = await supabase
    .from('shops')
    .select('business_name, logo_url')
    .eq('owner_id', ownerId)
    .maybeSingle()

  if (error) {
    console.warn('Could not inspect sender shop for notification labeling:', error)
    shopCache.set(ownerId, null)
    return null
  }

  const shop = data || null
  shopCache.set(ownerId, shop)
  return shop
}

const getProfileById = async (userId?: string | null) => {
  if (!userId) {
    return null
  }

  if (profileCache.has(userId)) {
    return profileCache.get(userId) || null
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('first_name, last_name, avatar_url')
    .eq('id', userId)
    .maybeSingle()

  if (error) {
    console.warn('Could not inspect sender profile for notification labeling:', error)
    profileCache.set(userId, null)
    return null
  }

  const profile = data || null
  profileCache.set(userId, profile)
  return profile
}

const getConversationById = async (conversationId?: string | null) => {
  if (!conversationId) {
    return null
  }

  if (conversationCache.has(conversationId)) {
    return conversationCache.get(conversationId) || null
  }

  const { data, error } = await supabase
    .from('conversations')
    .select('user1, user2')
    .eq('id', conversationId)
    .maybeSingle()

  if (error) {
    console.warn('Could not inspect conversation for notification labeling:', error)
    conversationCache.set(conversationId, null)
    return null
  }

  const conversation = data || null
  conversationCache.set(conversationId, conversation)
  return conversation
}

const findRecentMessageNotifications = async ({
  receiverUserId,
  conversationId,
  senderUserId,
  messageCreatedAt,
  lookbackMs = 15000,
}: RecentMessageNotificationParams) => {
  const messageDate = parseAppTimestamp(messageCreatedAt)
  if (!messageDate) {
    return []
  }

  const earliestCreatedAt = messageDate.toISOString()
  const latestCreatedAt = new Date(messageDate.getTime() + lookbackMs).toISOString()
  const relatedId = conversationId || senderUserId

  if (!relatedId) {
    return []
  }

  const { data, error } = await supabase
    .from('notifications')
    .select('id, title, message, created_at')
    .eq('user_id', receiverUserId)
    .eq('type', 'new_message')
    .eq('related_id', relatedId)
    .gte('created_at', earliestCreatedAt)
    .lte('created_at', latestCreatedAt)
    .order('created_at', { ascending: false })

  if (error) {
    console.warn('Could not inspect recent message notifications:', error)
    return []
  }

  return data || []
}

export const removeRecentMessageNotification = async ({
  receiverUserId,
  conversationId,
  senderUserId,
  messageCreatedAt,
  lookbackMs = 15000,
  maxAttempts = 4,
  retryDelayMs = 250,
}: RecentMessageNotificationParams) => {
  let removedAny = false

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const notifications = await findRecentMessageNotifications({
      receiverUserId,
      conversationId,
      senderUserId,
      messageCreatedAt,
      lookbackMs,
    })

    if (notifications.length > 0) {
      const notificationIds = notifications
        .map((notification) => notification.id)
        .filter((notificationId): notificationId is string => !!notificationId)

      if (notificationIds.length > 0) {
        const { error } = await supabase.from('notifications').delete().in('id', notificationIds)

        if (error) {
          console.warn('Could not remove recent message notifications:', error)
          return removedAny
        }

        removedAny = true
      }
    }

    if (attempt < maxAttempts - 1) {
      await wait(retryDelayMs)
    }
  }

  return removedAny
}

const deleteNotificationsByIds = async (notificationIds: string[]) => {
  if (notificationIds.length === 0) return

  const { error } = await supabase.from('notifications').delete().in('id', notificationIds)

  if (error) {
    console.warn('Could not delete suppressed message notifications:', error)
  }
}

export const hasPriorSenderChatMessages = async ({
  conversationId,
  senderId,
  beforeCreatedAt,
}: PriorSenderMessageParams) => {
  const { count, error } = await supabase
    .from('messages')
    .select('id', { count: 'exact', head: true })
    .eq('conversation_id', conversationId)
    .eq('sender_id', senderId)
    .lt('created_at', beforeCreatedAt)
    .not('content', 'ilike', '%New Order Received!%')
    .not('content', 'ilike', '%Order ID:%')
    .not('content', 'ilike', '%Transaction #:%')

  if (error) {
    console.warn('Could not inspect prior sender messages:', error)
    return false
  }

  return (count ?? 0) > 0
}

const hasPriorConversationChatMessages = async ({
  conversationId,
  beforeCreatedAt,
}: {
  conversationId: string
  beforeCreatedAt: string
}) => {
  const { count, error } = await supabase
    .from('messages')
    .select('id', { count: 'exact', head: true })
    .eq('conversation_id', conversationId)
    .lt('created_at', beforeCreatedAt)
    .not('content', 'ilike', '%New Order Received!%')
    .not('content', 'ilike', '%Order ID:%')
    .not('content', 'ilike', '%Transaction #:%')

  if (error) {
    console.warn('Could not inspect prior conversation messages:', error)
    return false
  }

  return (count ?? 0) > 0
}

const findNotificationSourceMessage = async (notification?: NotificationRecord | null) => {
  if (
    notification?.type !== 'new_message' ||
    !notification.related_id ||
    !notification.user_id ||
    !notification.created_at
  ) {
    return null
  }

  const notificationDate = parseAppTimestamp(notification.created_at)
  if (!notificationDate) {
    return null
  }

  const notificationCreatedAt = notificationDate.toISOString()
  const earliestCreatedAt = new Date(
    notificationDate.getTime() - ORDER_MESSAGE_NOTIFICATION_MATCH_WINDOW_MS,
  ).toISOString()

  const { data, error } = await supabase
    .from('messages')
    .select('id, conversation_id, sender_id, receiver_id, content, created_at')
    .eq('conversation_id', notification.related_id)
    .eq('receiver_id', notification.user_id)
    .gte('created_at', earliestCreatedAt)
    .lte('created_at', notificationCreatedAt)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    console.warn('Could not inspect source message for notification decisions:', error)
    return null
  }

  if (data) {
    return data as MessageRecord | null
  }

  const { data: fallbackData, error: fallbackError } = await supabase
    .from('messages')
    .select('id, conversation_id, sender_id, receiver_id, content, created_at')
    .eq('sender_id', notification.related_id)
    .eq('receiver_id', notification.user_id)
    .gte('created_at', earliestCreatedAt)
    .lte('created_at', notificationCreatedAt)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (fallbackError) {
    console.warn('Could not inspect legacy message notification source:', fallbackError)
    return null
  }

  return fallbackData as MessageRecord | null
}

const inspectSourceMessageNotification = async ({
  sourceMessage,
  recipientUserId,
}: {
  sourceMessage?: MessageRecord | null
  recipientUserId?: string | null
}): Promise<MessageNotificationInsight> => {
  if (!sourceMessage || !recipientUserId) {
    return {
      shouldSuppress: false,
      sourceMessage: sourceMessage || null,
      event: null,
      counterpartyDisplayName: null,
      counterpartyAvatar: null,
      customerFacingShopIdentity: false,
      notificationTitle: null,
      notificationMessage: null,
    }
  }

  const conversation = await getConversationById(sourceMessage.conversation_id)
  const viewerRole = resolveConversationViewerRole({
    currentUserId: recipientUserId,
    customerUserId: conversation?.user1,
    sellerUserId: conversation?.user2,
  })
  const senderRole = getConversationRoleForUser(conversation, sourceMessage.sender_id)
  const recipientRole = getConversationRoleForUser(conversation, recipientUserId)
  const senderProfile = await getProfileById(sourceMessage.sender_id)
  const senderShop = await getShopByOwnerId(sourceMessage.sender_id)
  const counterpartyIdentity =
    viewerRole && conversation
      ? resolveCounterpartyIdentity({
          viewerRole,
          profile: senderProfile,
          shop: senderShop,
        })
      : null
  const counterpartyDisplayName = counterpartyIdentity?.displayName || null
  const counterpartyAvatar = counterpartyIdentity?.avatar || null
  const customerFacingShopIdentity = !!counterpartyIdentity?.customerFacingShopIdentity

  if (isOrderChatMessage(sourceMessage.content)) {
    return {
      shouldSuppress: true,
      sourceMessage,
      event: null,
      counterpartyDisplayName: null,
      counterpartyAvatar: null,
      customerFacingShopIdentity: false,
      notificationTitle: null,
      notificationMessage: null,
    }
  }

  const hasPriorSenderMessages = await hasPriorSenderChatMessages({
    conversationId: sourceMessage.conversation_id,
    senderId: sourceMessage.sender_id,
    beforeCreatedAt: sourceMessage.created_at,
  })
  const hasPriorConversationMessages = await hasPriorConversationChatMessages({
    conversationId: sourceMessage.conversation_id,
    beforeCreatedAt: sourceMessage.created_at,
  })

  const isConversationStart =
    senderRole === 'customer' && recipientRole === 'seller' && !hasPriorConversationMessages
  const isFirstReply =
    senderRole === 'seller' &&
    recipientRole === 'customer' &&
    hasPriorConversationMessages &&
    !hasPriorSenderMessages

  const event = isConversationStart ? 'conversation_start' : isFirstReply ? 'first_reply' : null

  if (!event) {
    return {
      shouldSuppress: true,
      sourceMessage,
      event: null,
      counterpartyDisplayName: null,
      counterpartyAvatar: null,
      customerFacingShopIdentity: false,
      notificationTitle: null,
      notificationMessage: null,
    }
  }

  const fallbackName = event === 'conversation_start' ? 'Customer' : 'Shop'
  const notificationTitle =
    event === 'conversation_start'
      ? `New message from ${counterpartyDisplayName || fallbackName}`
      : `${counterpartyDisplayName || fallbackName} replied`

  return {
    shouldSuppress: false,
    sourceMessage,
    event,
    counterpartyDisplayName,
    counterpartyAvatar,
    customerFacingShopIdentity,
    notificationTitle,
    notificationMessage: notificationTitle,
  }
}

const inspectMessageNotification = async (
  notification?: NotificationRecord | null,
): Promise<MessageNotificationInsight> => {
  const sourceMessage = await findNotificationSourceMessage(notification)
  return inspectSourceMessageNotification({
    sourceMessage,
    recipientUserId: notification?.user_id,
  })
}

export const isOrderTriggeredMessageNotification = async (notification?: NotificationRecord | null) => {
  const insight = await inspectMessageNotification(notification)
  return insight.shouldSuppress && isOrderChatMessage(insight.sourceMessage?.content)
}

export const suppressOrderTriggeredMessageNotification = async (
  notification?: NotificationRecord | null,
) => {
  const shouldSuppress = await isOrderTriggeredMessageNotification(notification)

  if (!shouldSuppress) {
    return false
  }

  if (notification?.id) {
    await deleteNotificationsByIds([notification.id])
  }

  return true
}

export const shouldRetainMessageNotification = async ({
  conversationId,
  senderId,
  receiverUserId,
  messageCreatedAt,
  content,
}: {
  conversationId: string
  senderId: string
  receiverUserId: string
  messageCreatedAt: string
  content?: string | null
}) => {
  const insight = await inspectSourceMessageNotification({
    recipientUserId: receiverUserId,
    sourceMessage: {
      id: 'pending-notification',
      conversation_id: conversationId,
      sender_id: senderId,
      receiver_id: receiverUserId,
      content: content || null,
      created_at: messageCreatedAt,
    },
  })

  return !insight.shouldSuppress
}

export const resolveVisibleNotification = async <T extends NotificationRecord>(
  notification?: T | null,
): Promise<T | null> => {
  if (!notification) {
    return null
  }

  const insight = await inspectMessageNotification(notification)

  if (insight.shouldSuppress) {
    if (notification.id) {
      await deleteNotificationsByIds([notification.id])
    }

    return null
  }

  if (notification.type !== 'new_message') {
    return notification
  }

  if (insight.notificationTitle) {
    return {
      ...notification,
      title: insight.notificationTitle,
      message: insight.notificationMessage || insight.notificationTitle,
      notificationEvent: insight.event,
      counterpartyDisplayName: insight.counterpartyDisplayName,
      counterpartyAvatar: insight.counterpartyAvatar,
      customerFacingShopIdentity: insight.customerFacingShopIdentity,
    } as T
  }

  return notification
}

export const filterVisibleNotifications = async <T extends NotificationRecord>(notifications: T[] = []) => {
  if (notifications.length === 0) {
    return []
  }

  const visibleNotifications = await Promise.all(
    notifications.map((notification) => resolveVisibleNotification(notification)),
  )

  return visibleNotifications.filter((notification): notification is T => !!notification)
}

export const getVisibleUnreadNotificationCount = async (userId: string) => {
  const { count, error } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('is_read', false)

  if (error) {
    console.warn('Could not fetch unread notification count:', error)
    return 0
  }

  if (!count) {
    return 0
  }

  const { data: unreadMessageNotifications, error: unreadMessagesError } = await supabase
    .from('notifications')
    .select('id, user_id, type, title, message, related_id, created_at')
    .eq('user_id', userId)
    .eq('is_read', false)
    .eq('type', 'new_message')
    .order('created_at', { ascending: false })

  if (unreadMessagesError) {
    console.warn('Could not inspect unread message notifications:', unreadMessagesError)
    return count
  }

  if (!unreadMessageNotifications || unreadMessageNotifications.length === 0) {
    return count
  }

  const visibleUnreadMessageNotifications = await filterVisibleNotifications(unreadMessageNotifications)
  const suppressedCount = unreadMessageNotifications.length - visibleUnreadMessageNotifications.length

  return Math.max(0, count - suppressedCount)
}
