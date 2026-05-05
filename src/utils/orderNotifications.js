import { supabase } from '@/utils/supabase'
import {
  LEGACY_ORDER_CANCEL_REQUESTED_STATUS,
  ORDER_CANCEL_REQUESTED_STATUS,
  isOrderCancellationRequestedStatus,
} from '@/utils/orderStatus'

const getShopName = (orderData = {}) => {
  if (orderData.shop_name) return orderData.shop_name
  if (orderData.business_name) return orderData.business_name
  if (orderData.shop?.business_name) return orderData.shop.business_name
  return ''
}

const getProfileDisplayName = (profile = {}) =>
  [profile?.first_name, profile?.last_name].filter(Boolean).join(' ').trim()

const getCustomerName = (orderData = {}) => {
  const preferredName = [
    orderData.customer_name,
    orderData.address?.recipient_name,
    getProfileDisplayName(orderData.user),
    getProfileDisplayName(orderData.buyer),
    getProfileDisplayName(orderData.profiles),
  ].find((value) => typeof value === 'string' && value.trim())

  return preferredName?.trim() || ''
}

const normalizeOrderContext = (orderData = {}) => {
  return {
    customerUserId:
      orderData.user_id ||
      orderData.customer_id ||
      orderData.user?.id ||
      orderData.buyer?.id ||
      null,
    sellerUserId: orderData.shop_owner_id || orderData.shop?.owner_id || null,
    riderRegistrationId: orderData.rider_id || orderData.rider?.rider_id || null,
    shopName: getShopName(orderData),
    transactionNumber: orderData.transaction_number || null,
    customerName: getCustomerName(orderData),
  }
}

const mergeOrderContext = (primaryContext = {}, fallbackContext = {}) => {
  return {
    customerUserId: primaryContext.customerUserId || fallbackContext.customerUserId || null,
    sellerUserId: primaryContext.sellerUserId || fallbackContext.sellerUserId || null,
    riderRegistrationId:
      primaryContext.riderRegistrationId || fallbackContext.riderRegistrationId || null,
    shopName: primaryContext.shopName || fallbackContext.shopName || '',
    transactionNumber:
      primaryContext.transactionNumber || fallbackContext.transactionNumber || null,
    customerName: primaryContext.customerName || fallbackContext.customerName || '',
  }
}

const fetchOrderContext = async (orderId) => {
  const { data, error } = await supabase
    .from('orders')
    .select(
      `
      id,
      user_id,
      rider_id,
      transaction_number,
      buyer:profiles!orders_user_id_fkey (
        id,
        first_name,
        last_name
      ),
      address:addresses!orders_address_id_fkey (
        recipient_name
      ),
      shop:shop_id (
        business_name,
        owner_id
      )
    `,
    )
    .eq('id', orderId)
    .single()

  if (error) throw error

  return normalizeOrderContext(data || {})
}

const fetchAssignedRiderProfileId = async (riderRegistrationId) => {
  if (!riderRegistrationId) return null

  const { data, error } = await supabase
    .from('Rider_Registration')
    .select('profile_id')
    .eq('rider_id', riderRegistrationId)
    .maybeSingle()

  if (error) throw error

  return data?.profile_id || null
}

const buildCustomerOrderStatusNotification = ({ status, shopName, transactionNumber }) => {
  const orderLabel = transactionNumber ? `Order ${transactionNumber}` : 'Your order'
  const shopLabel = shopName ? ` from ${shopName}` : ''

  switch (status) {
    case 'cancelled':
      return {
        type: 'shipping_update',
        title: 'Order Cancelled',
        message: `${orderLabel}${shopLabel} was cancelled.`,
      }
    case 'cancellation_request_declined':
      return {
        type: 'shipping_update',
        title: 'Cancellation Request Declined',
        message: `The shop did not approve the cancellation request for ${orderLabel}${shopLabel}.`,
      }
    case 'picked_up':
      return {
        type: 'shipping_update',
        title: 'Order Picked Up',
        message: `${orderLabel}${shopLabel} has been picked up and is on the way.`,
      }
    case 'delivered':
      return {
        type: 'order_delivered',
        title: 'Order Delivered',
        message: `${orderLabel}${shopLabel} has been marked as delivered.`,
      }
    case 'auto_completed':
      return {
        type: 'shipping_update',
        title: 'Order Automatically Completed',
        message: `${orderLabel}${shopLabel} has been automatically completed after 24 hours.`,
      }
    default:
      return null
  }
}

const buildSellerOrderStatusNotification = ({ status, transactionNumber, customerName }) => {
  const orderLabel = transactionNumber ? `order ${transactionNumber}` : 'the order'
  const customerLabel = customerName ? ` for ${customerName}` : ''

  switch (status) {
    case ORDER_CANCEL_REQUESTED_STATUS:
    case LEGACY_ORDER_CANCEL_REQUESTED_STATUS:
      return {
        type: 'shipping_update',
        title: 'Cancellation Requested',
        message: `Customer requested cancellation approval for ${orderLabel}${customerLabel}.`,
      }
    case 'accepted_by_rider':
      return {
        type: 'shipping_update',
        title: 'Rider Accepted Order',
        message: `A rider has accepted ${orderLabel}${customerLabel}.`,
      }
    case 'picked_up':
      return {
        type: 'shipping_update',
        title: 'Order Picked Up',
        message: `${orderLabel.charAt(0).toUpperCase()}${orderLabel.slice(1)}${customerLabel} has been picked up by the rider.`,
      }
    case 'delivered':
      return {
        type: 'order_delivered',
        title: 'Order Delivered',
        message: `${orderLabel.charAt(0).toUpperCase()}${orderLabel.slice(1)}${customerLabel} has been delivered.`,
      }
    case 'not_received':
      return {
        type: 'shipping_update',
        title: 'Delivery Issue Reported',
        message: `Customer reported ${orderLabel}${customerLabel} was not received.`,
      }
    case 'auto_completed':
      return {
        type: 'shipping_update',
        title: 'Order Automatically Completed',
        message: `${orderLabel.charAt(0).toUpperCase()}${orderLabel.slice(1)}${customerLabel} has been automatically completed after 24 hours.`,
      }
    default:
      return null
  }
}

const buildAssignedRiderOrderStatusNotification = ({ status, transactionNumber, customerName }) => {
  const orderLabel = transactionNumber ? `order ${transactionNumber}` : 'the order'
  const customerLabel = customerName ? ` for ${customerName}` : ''

  switch (status) {
    case 'not_received':
      return {
        type: 'shipping_update',
        title: 'Delivery Issue Reported',
        message: `Customer reported ${orderLabel}${customerLabel} was not received. Please reattempt delivery.`,
      }
    case 'auto_completed':
      return {
        type: 'shipping_update',
        title: 'Delivery Marked as Completed',
        message: `${orderLabel.charAt(0).toUpperCase()}${orderLabel.slice(1)}${customerLabel} was marked as completed automatically after 24 hours.`,
      }
    default:
      return null
  }
}

const notificationAlreadyExists = async ({ userId, orderId, type, title }) => {
  const { data, error } = await supabase
    .from('notifications')
    .select('id')
    .eq('user_id', userId)
    .eq('type', type)
    .eq('related_id', orderId)
    .eq('related_type', 'order')
    .eq('title', title)
    .limit(1)

  if (error) {
    console.warn('Could not check for existing order status notification:', error)
    return false
  }

  return Array.isArray(data) && data.length > 0
}

export const notifyCustomerOrderStatus = async ({
  orderId,
  status,
  orderData = null,
  createdAt = null,
}) => {
  if (!orderId || !status) return { created: false, reason: 'missing-order-or-status' }

  let context = normalizeOrderContext(orderData || {})

  if (!context.customerUserId || !context.shopName || !context.transactionNumber) {
    const fetchedContext = await fetchOrderContext(orderId)
    context = mergeOrderContext(context, fetchedContext)
  }

  const notification = buildCustomerOrderStatusNotification({
    status,
    shopName: context.shopName,
    transactionNumber: context.transactionNumber,
  })

  if (!context.customerUserId || !notification) {
    return { created: false, reason: 'missing-context' }
  }

  const exists = await notificationAlreadyExists({
    userId: context.customerUserId,
    orderId,
    type: notification.type,
    title: notification.title,
  })

  if (exists) {
    return { created: false, reason: 'duplicate' }
  }

  const { error } = await supabase.from('notifications').insert({
    user_id: context.customerUserId,
    type: notification.type,
    title: notification.title,
    message: notification.message,
    related_id: orderId,
    related_type: 'order',
    is_read: false,
    created_at: createdAt || new Date().toISOString(),
  })

  if (error) throw error

  return { created: true }
}

export const notifySellerOrderStatus = async ({
  orderId,
  status,
  orderData = null,
  createdAt = null,
  actorUserId = null,
}) => {
  if (!orderId || !status) return { created: false, reason: 'missing-order-or-status' }

  let context = normalizeOrderContext(orderData || {})

  if (
    !context.sellerUserId ||
    !context.shopName ||
    !context.transactionNumber ||
    !context.customerName
  ) {
    const fetchedContext = await fetchOrderContext(orderId)
    context = mergeOrderContext(context, fetchedContext)
  }

  if (actorUserId && context.sellerUserId && actorUserId === context.sellerUserId) {
    return { created: false, reason: 'actor-is-recipient' }
  }

  const notification = buildSellerOrderStatusNotification({
    status,
    transactionNumber: context.transactionNumber,
    customerName: context.customerName,
  })

  if (!context.sellerUserId || !notification) {
    return { created: false, reason: 'missing-context' }
  }

  const skipDuplicateCheck = status === 'not_received' || isOrderCancellationRequestedStatus(status)
  const exists = skipDuplicateCheck
    ? false
    : await notificationAlreadyExists({
        userId: context.sellerUserId,
        orderId,
        type: notification.type,
        title: notification.title,
      })

  if (exists) {
    return { created: false, reason: 'duplicate' }
  }

  const { error } = await supabase.from('notifications').insert({
    user_id: context.sellerUserId,
    type: notification.type,
    title: notification.title,
    message: notification.message,
    related_id: orderId,
    related_type: 'order',
    is_read: false,
    created_at: createdAt || new Date().toISOString(),
  })

  if (error) throw error

  return { created: true }
}

export const notifyAssignedRiderOrderStatus = async ({
  orderId,
  status,
  orderData = null,
  createdAt = null,
  actorUserId = null,
}) => {
  if (!orderId || !status) return { created: false, reason: 'missing-order-or-status' }

  let context = normalizeOrderContext(orderData || {})

  if (!context.riderRegistrationId || !context.transactionNumber || !context.customerName) {
    const fetchedContext = await fetchOrderContext(orderId)
    context = mergeOrderContext(context, fetchedContext)
  }

  const notification = buildAssignedRiderOrderStatusNotification({
    status,
    transactionNumber: context.transactionNumber,
    customerName: context.customerName,
  })

  if (!context.riderRegistrationId || !notification) {
    return { created: false, reason: 'missing-context' }
  }

  const riderProfileId = await fetchAssignedRiderProfileId(context.riderRegistrationId)

  if (!riderProfileId) {
    return { created: false, reason: 'missing-rider-profile' }
  }

  if (actorUserId && actorUserId === riderProfileId) {
    return { created: false, reason: 'actor-is-recipient' }
  }

  const skipDuplicateCheck = status === 'not_received'
  const exists = skipDuplicateCheck
    ? false
    : await notificationAlreadyExists({
        userId: riderProfileId,
        orderId,
        type: notification.type,
        title: notification.title,
      })

  if (exists) {
    return { created: false, reason: 'duplicate' }
  }

  const { error } = await supabase.from('notifications').insert({
    user_id: riderProfileId,
    type: notification.type,
    title: notification.title,
    message: notification.message,
    related_id: orderId,
    related_type: 'order',
    is_read: false,
    created_at: createdAt || new Date().toISOString(),
  })

  if (error) throw error

  return { created: true }
}
