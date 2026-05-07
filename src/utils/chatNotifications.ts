import { supabase } from '@/utils/supabase'
import {
  resolveConversationViewerRole,
  resolveCounterpartyIdentity,
  type CounterpartyViewerRole,
} from '@/utils/chatIdentity'
import { parseAppTimestamp } from '@/utils/dateTime'
import { notificationRecordMatchesPreferences } from '@/utils/notificationPreferences'

const ORDER_MESSAGE_MARKERS = ['New Order Received!', 'Order ID:', 'Transaction #:']
const UNSENT_MESSAGE_TEXT = 'Message unsent'

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

type NotificationRecord = {
  id?: string | null
  user_id?: string | null
  type?: string | null
  title?: string | null
  message?: string | null
  related_id?: string | null
  related_type?: string | null
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
  has_customer_messaged?: boolean | null
  has_seller_replied?: boolean | null
}

type ConversationNotificationState = {
  hasCustomerMessaged: boolean
  hasSellerReplied: boolean
}

const ORDER_MESSAGE_NOTIFICATION_MATCH_WINDOW_MS = 2 * 60 * 1000
const MESSAGE_NOTIFICATION_SOURCE_FUTURE_WINDOW_MS = 30 * 1000
const MESSAGE_NOTIFICATION_SOURCE_RETRY_DELAY_MS = 200
const MESSAGE_NOTIFICATION_SOURCE_MAX_ATTEMPTS = 4
const shopCache = new Map<string, ShopRecord | null>()
const profileCache = new Map<string, ProfileRecord | null>()
const conversationCache = new Map<string, ConversationRecord | null>()
// Keep client-side notification decisions schema-safe.
// We derive the one-time message milestones from conversation history
// instead of probing optional conversation columns that may not exist yet.
let supportsConversationNotificationState = false

const getNotificationRelatedIds = ({
  conversationId,
  senderUserId,
}: {
  conversationId?: string | null
  senderUserId?: string | null
}) =>
  [...new Set([conversationId, senderUserId].filter((value): value is string => Boolean(value)))]

export const isOrderChatMessage = (content?: string | null) => {
  if (!content) return false
  return ORDER_MESSAGE_MARKERS.some((marker) => content.includes(marker))
}

const isMissingConversationNotificationStateColumnError = (error: unknown) => {
  const message = typeof error === 'object' && error && 'message' in error ? String(error.message) : ''

  return ['has_customer_messaged', 'has_seller_replied'].some((column) =>
    message.includes(column),
  )
}

const getConversationRoleForUser = (
  conversation?: ConversationRecord | null,
  userId?: string | null,
): CounterpartyViewerRole | null => {
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

const resolveNotificationRoleForUser = ({
  conversation,
  currentUserId,
  otherUserId,
  currentUserShop,
  otherUserShop,
  messages,
}: {
  conversation?: ConversationRecord | null
  currentUserId?: string | null
  otherUserId?: string | null
  currentUserShop?: ShopRecord | null
  otherUserShop?: ShopRecord | null
  messages?: MessageRecord[] | null
}) =>
  getConversationRoleForUser(conversation, currentUserId) ||
  resolveConversationViewerRole({
    currentUserId,
    otherUserId,
    customerUserId: conversation?.user1,
    sellerUserId: conversation?.user2,
    currentUserShop,
    otherUserShop,
    messages,
  })

const hasConversationNotificationStateChanged = (
  currentConversation: ConversationRecord | null,
  nextState: ConversationNotificationState,
) =>
  Boolean(currentConversation?.has_customer_messaged) !== nextState.hasCustomerMessaged ||
  Boolean(currentConversation?.has_seller_replied) !== nextState.hasSellerReplied

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

  let data = null
  let error = null as any

  if (supportsConversationNotificationState !== false) {
    const response = await supabase
      .from('conversations')
      .select('user1, user2, has_customer_messaged, has_seller_replied')
      .eq('id', conversationId)
      .maybeSingle()

    data = response.data
    error = response.error

    if (error && isMissingConversationNotificationStateColumnError(error)) {
      supportsConversationNotificationState = false
      error = null
      data = null
    } else if (!error) {
      supportsConversationNotificationState = true
    }
  }

  if (!data && !error) {
    const fallbackResponse = await supabase
      .from('conversations')
      .select('user1, user2')
      .eq('id', conversationId)
      .maybeSingle()

    data = fallbackResponse.data
    error = fallbackResponse.error
  }

  if (error) {
    console.warn('Could not inspect conversation for notification labeling:', error)
    conversationCache.set(conversationId, null)
    return null
  }

  const conversation = data || null
  conversationCache.set(conversationId, conversation)
  return conversation
}

const persistConversationNotificationState = async ({
  conversationId,
  nextState,
}: {
  conversationId: string
  nextState: ConversationNotificationState
}) => {
  if (supportsConversationNotificationState === false) {
    return false
  }

  const payload = {
    has_customer_messaged: nextState.hasCustomerMessaged,
    has_seller_replied: nextState.hasSellerReplied,
  }

  const { error } = await supabase.from('conversations').update(payload).eq('id', conversationId)

  if (error) {
    if (isMissingConversationNotificationStateColumnError(error)) {
      supportsConversationNotificationState = false
      return false
    }

    console.warn('Could not persist conversation notification state:', error)
    return false
  }

  supportsConversationNotificationState = true

  const cachedConversation = conversationCache.get(conversationId)
  if (cachedConversation) {
    conversationCache.set(conversationId, {
      ...cachedConversation,
      ...payload,
    })
  }

  return true
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
  const relatedIds = getNotificationRelatedIds({
    conversationId,
    senderUserId,
  })

  if (relatedIds.length === 0) {
    return []
  }

  let query = supabase
    .from('notifications')
    .select('id, title, message, created_at')
    .eq('user_id', receiverUserId)
    .eq('type', 'new_message')
    .gte('created_at', earliestCreatedAt)
    .lte('created_at', latestCreatedAt)
    .order('created_at', { ascending: false })

  if (relatedIds.length === 1) {
    query = query.eq('related_id', relatedIds[0])
  } else {
    query = query.in('related_id', relatedIds)
  }

  const { data, error } = await query

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

const isUnsentChatMessage = (content?: string | null) => content?.trim() === UNSENT_MESSAGE_TEXT

const isIgnoredMessageNotificationContent = (content?: string | null) =>
  isUnsentChatMessage(content) || isOrderChatMessage(content)

const isActualConversationMessage = (content?: string | null) =>
  !isIgnoredMessageNotificationContent(content)

const buildPendingMessageRecord = ({
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
}): MessageRecord => ({
  id: 'pending-notification',
  conversation_id: conversationId,
  sender_id: senderId,
  receiver_id: receiverUserId,
  content: content || null,
  created_at: messageCreatedAt,
})

const findConversationMessagesBefore = async ({
  conversationId,
  beforeCreatedAt,
}: {
  conversationId: string
  beforeCreatedAt: string
}) => {
  const { data, error } = await supabase
    .from('messages')
    .select('id, conversation_id, sender_id, receiver_id, content, created_at')
    .eq('conversation_id', conversationId)
    .lt('created_at', beforeCreatedAt)
    .neq('content', UNSENT_MESSAGE_TEXT)
    .order('created_at', { ascending: true })

  if (error) {
    console.warn('Could not inspect previous conversation messages:', error)
    return []
  }

  return (data as MessageRecord[] | null) || []
}

const evaluateMessageNotificationEvent = async ({
  sourceMessage,
  recipientUserId,
}: {
  sourceMessage?: MessageRecord | null
  recipientUserId?: string | null
}): Promise<{
  shouldSuppress: boolean
  event: 'conversation_start' | 'first_reply' | null
  senderRole: CounterpartyViewerRole | null
  recipientRole: CounterpartyViewerRole | null
  nextState: ConversationNotificationState | null
}> => {
  if (!sourceMessage || !recipientUserId) {
    return {
      shouldSuppress: false,
      event: null,
      senderRole: null,
      recipientRole: null,
      nextState: null,
    }
  }

  if (isIgnoredMessageNotificationContent(sourceMessage.content)) {
    return {
      shouldSuppress: true,
      event: null,
      senderRole: null,
      recipientRole: null,
      nextState: null,
    }
  }

  const conversation = await getConversationById(sourceMessage.conversation_id)
  const senderShop = await getShopByOwnerId(sourceMessage.sender_id)
  const recipientShop = await getShopByOwnerId(recipientUserId)
  const senderRole = resolveNotificationRoleForUser({
    conversation,
    currentUserId: sourceMessage.sender_id,
    otherUserId: recipientUserId,
    currentUserShop: senderShop,
    otherUserShop: recipientShop,
    messages: [sourceMessage],
  })
  const recipientRole = resolveNotificationRoleForUser({
    conversation,
    currentUserId: recipientUserId,
    otherUserId: sourceMessage.sender_id,
    currentUserShop: recipientShop,
    otherUserShop: senderShop,
    messages: [sourceMessage],
  })

  if (!senderRole || !recipientRole) {
    return {
      shouldSuppress: true,
      event: null,
      senderRole,
      recipientRole,
      nextState: null,
    }
  }

  const customerUserId = senderRole === 'customer' ? sourceMessage.sender_id : recipientUserId
  const sellerUserId = senderRole === 'seller' ? sourceMessage.sender_id : recipientUserId
  const priorMessages = await findConversationMessagesBefore({
    conversationId: sourceMessage.conversation_id,
    beforeCreatedAt: sourceMessage.created_at,
  })
  const priorActualMessages = priorMessages.filter((message) =>
    isActualConversationMessage(message.content),
  )
  const firstCustomerMessage =
    priorActualMessages.find((message) => message.sender_id === customerUserId) || null
  const hasPriorCustomerMessage = Boolean(firstCustomerMessage)
  const hasPriorSellerReply = Boolean(
    firstCustomerMessage &&
      priorActualMessages.some(
        (message) =>
          message.sender_id === sellerUserId &&
          message.created_at > firstCustomerMessage.created_at,
      ),
  )

  const isFirstCustomerMessage =
    senderRole === 'customer' && recipientRole === 'seller' && !hasPriorCustomerMessage
  const isFirstSellerReply =
    senderRole === 'seller' &&
    recipientRole === 'customer' &&
    hasPriorCustomerMessage &&
    !hasPriorSellerReply
  const event = isFirstCustomerMessage
    ? 'conversation_start'
    : isFirstSellerReply
      ? 'first_reply'
      : null

  return {
    shouldSuppress: !event,
    event,
    senderRole,
    recipientRole,
    nextState: {
      hasCustomerMessaged:
        hasPriorCustomerMessage || (senderRole === 'customer' && recipientRole === 'seller'),
      hasSellerReplied: hasPriorSellerReply || isFirstSellerReply,
    },
  }
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

  const earliestCreatedAt = new Date(
    notificationDate.getTime() - ORDER_MESSAGE_NOTIFICATION_MATCH_WINDOW_MS,
  ).toISOString()
  const latestCreatedAt = new Date(
    notificationDate.getTime() + MESSAGE_NOTIFICATION_SOURCE_FUTURE_WINDOW_MS,
  ).toISOString()
  const notificationAgeMs = Math.max(0, Date.now() - notificationDate.getTime())
  const maxAttempts =
    notificationAgeMs <= 5000 ? MESSAGE_NOTIFICATION_SOURCE_MAX_ATTEMPTS : 1

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const { data, error } = await supabase
      .from('messages')
      .select('id, conversation_id, sender_id, receiver_id, content, created_at')
      .eq('conversation_id', notification.related_id)
      .eq('receiver_id', notification.user_id)
      .gte('created_at', earliestCreatedAt)
      .lte('created_at', latestCreatedAt)
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
      .lte('created_at', latestCreatedAt)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (fallbackError) {
      console.warn('Could not inspect legacy message notification source:', fallbackError)
      return null
    }

    if (fallbackData) {
      return fallbackData as MessageRecord | null
    }

    if (attempt < maxAttempts - 1) {
      await wait(MESSAGE_NOTIFICATION_SOURCE_RETRY_DELAY_MS)
    }
  }

  return null
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

  const evaluation = await evaluateMessageNotificationEvent({
    sourceMessage,
    recipientUserId,
  })
  const senderProfile = await getProfileById(sourceMessage.sender_id)
  const senderShop = await getShopByOwnerId(sourceMessage.sender_id)
  const counterpartyIdentity = evaluation.recipientRole
    ? resolveCounterpartyIdentity({
        viewerRole: evaluation.recipientRole,
        profile: senderProfile,
        shop: senderShop,
      })
    : null
  const counterpartyDisplayName = counterpartyIdentity?.displayName || null
  const counterpartyAvatar = counterpartyIdentity?.avatar || null
  const customerFacingShopIdentity = !!counterpartyIdentity?.customerFacingShopIdentity

  if (evaluation.shouldSuppress || !evaluation.event) {
    return {
      shouldSuppress: evaluation.shouldSuppress,
      sourceMessage,
      event: evaluation.event,
      counterpartyDisplayName: null,
      counterpartyAvatar: null,
      customerFacingShopIdentity: false,
      notificationTitle: null,
      notificationMessage: null,
    }
  }

  const fallbackName = evaluation.event === 'conversation_start' ? 'Customer' : 'Shop'
  const notificationTitle =
    evaluation.event === 'conversation_start'
      ? `${counterpartyDisplayName || fallbackName} sent you a message`
      : `${counterpartyDisplayName || fallbackName} replied to your message`

  return {
    shouldSuppress: false,
    sourceMessage,
    event: evaluation.event,
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
  if (isIgnoredMessageNotificationContent(content)) {
    return false
  }

  const conversation = await getConversationById(conversationId)
  const evaluation = await evaluateMessageNotificationEvent({
    recipientUserId: receiverUserId,
    sourceMessage: buildPendingMessageRecord({
      conversationId,
      senderId,
      receiverUserId,
      messageCreatedAt,
      content,
    }),
  })

  if (
    supportsConversationNotificationState !== false &&
    evaluation.nextState &&
    hasConversationNotificationStateChanged(conversation, evaluation.nextState)
  ) {
    await persistConversationNotificationState({
      conversationId,
      nextState: evaluation.nextState,
    })
  }

  return !evaluation.shouldSuppress
}

export const resolveVisibleNotification = async <T extends NotificationRecord>(
  notification?: T | null,
): Promise<T | null> => {
  if (!notification) {
    return null
  }

  if (
    !notificationRecordMatchesPreferences({
      type: notification.type || '',
      relatedType: notification.related_type || '',
    })
  ) {
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

  return visibleNotifications.filter((notification) => !!notification) as T[]
}

export const getVisibleUnreadNotificationCount = async (userId: string) => {
  const { data, error } = await supabase
    .from('notifications')
    .select('id, user_id, type, title, message, related_id, related_type, created_at')
    .eq('user_id', userId)
    .eq('is_read', false)
    .order('created_at', { ascending: false })

  if (error) {
    console.warn('Could not fetch unread notification count:', error)
    return 0
  }

  if (!data || data.length === 0) {
    return 0
  }

  const visibleUnreadNotifications = await filterVisibleNotifications(data)
  return visibleUnreadNotifications.length
}
