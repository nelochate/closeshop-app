import { supabase } from '@/utils/supabase'

const getShopName = (orderData = {}) => {
  if (orderData.shop_name) return orderData.shop_name
  if (orderData.business_name) return orderData.business_name
  if (orderData.shop?.business_name) return orderData.shop.business_name
  return ''
}

const normalizeOrderContext = (orderData = {}) => {
  return {
    customerUserId: orderData.user_id || orderData.customer_id || orderData.buyer?.id || null,
    shopName: getShopName(orderData),
    transactionNumber: orderData.transaction_number || null,
  }
}

const mergeOrderContext = (primaryContext = {}, fallbackContext = {}) => {
  return {
    customerUserId: primaryContext.customerUserId || fallbackContext.customerUserId || null,
    shopName: primaryContext.shopName || fallbackContext.shopName || '',
    transactionNumber: primaryContext.transactionNumber || fallbackContext.transactionNumber || null,
  }
}

const fetchOrderContext = async (orderId) => {
  const { data, error } = await supabase
    .from('orders')
    .select(`
      id,
      user_id,
      transaction_number,
      shop:shop_id (
        business_name
      )
    `)
    .eq('id', orderId)
    .single()

  if (error) throw error

  return normalizeOrderContext(data || {})
}

const buildCustomerOrderStatusNotification = ({ status, shopName, transactionNumber }) => {
  const orderLabel = transactionNumber ? `Order ${transactionNumber}` : 'Your order'
  const shopLabel = shopName ? ` from ${shopName}` : ''

  switch (status) {
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
