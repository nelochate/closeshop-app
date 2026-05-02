import { supabase } from '@/utils/supabase'
import {
  notifyAssignedRiderOrderStatus,
  notifyCustomerOrderStatus,
  notifySellerOrderStatus,
} from '@/utils/orderNotifications'

export const ORDER_AUTO_COMPLETE_WINDOW_MS = 24 * 60 * 60 * 1000

type OrderLike = {
  id?: string | number | null
  status?: string | null
  delivered_at?: string | null
  completed_at?: string | null
  updated_at?: string | null
  [key: string]: any
}

const AUTO_COMPLETE_ELIGIBLE_STATUSES = ['picked_up', 'delivered']
const AUTO_COMPLETE_BLOCKED_STATUSES = ['completed', 'cancelled', 'not_received']

export const isOrderCompletedState = (order?: OrderLike | null) =>
  !!order?.completed_at || order?.status === 'completed'

export const isOrderAwaitingCustomerConfirmationState = (order?: OrderLike | null) => {
  if (!order) return false

  if (AUTO_COMPLETE_BLOCKED_STATUSES.includes(order.status || '')) return false

  return (
    AUTO_COMPLETE_ELIGIBLE_STATUSES.includes(order.status || '') &&
    !!order.delivered_at &&
    !order.completed_at
  )
}

export const getOrderAutoCompletionDeadline = (order?: OrderLike | null) => {
  if (!order?.delivered_at) return null

  const deliveredAt = new Date(order.delivered_at).getTime()
  if (Number.isNaN(deliveredAt)) return null

  return deliveredAt + ORDER_AUTO_COMPLETE_WINDOW_MS
}

export const shouldAutoCompleteDeliveredOrder = (order?: OrderLike | null, now = Date.now()) => {
  if (!order?.id) return false
  if (!isOrderAwaitingCustomerConfirmationState(order)) return false

  const deadline = getOrderAutoCompletionDeadline(order)
  if (!deadline) return false

  return now >= deadline
}

const mergeAutoCompletedOrder = <T extends OrderLike>(order: T, completedAt: string) =>
  ({
    ...order,
    status: 'completed',
    completed_at: completedAt,
    updated_at: completedAt,
  }) as T

const fetchCurrentOrderCompletionState = async (orderId: string) => {
  const { data, error } = await supabase
    .from('orders')
    .select('id, status, delivered_at, completed_at, updated_at')
    .eq('id', orderId)
    .maybeSingle()

  if (error) throw error

  return data
}

const sendAutoCompletionNotifications = async (
  orderId: string,
  completedAt: string,
  orderData: OrderLike,
) => {
  const notificationArgs = {
    orderId,
    status: 'auto_completed',
    createdAt: completedAt,
    orderData,
  }

  const notificationTasks = [
    notifyCustomerOrderStatus(notificationArgs),
    notifySellerOrderStatus(notificationArgs),
    notifyAssignedRiderOrderStatus(notificationArgs),
  ]

  const results = await Promise.allSettled(notificationTasks)

  results.forEach((result, index) => {
    if (result.status === 'fulfilled') return

    const recipient = index === 0 ? 'customer' : index === 1 ? 'seller' : 'assigned rider'
    console.warn(`Could not notify ${recipient} about auto-completed order:`, result.reason)
  })
}

export const ensureOrderAutoCompletionUpToDate = async <T extends OrderLike>(
  order?: T | null,
): Promise<T | null | undefined> => {
  if (!order) return order
  if (!shouldAutoCompleteDeliveredOrder(order)) return order

  const orderId = String(order.id)
  const completedAt = new Date().toISOString()

  try {
    const { data, error } = await supabase
      .from('orders')
      .update({
        status: 'completed',
        completed_at: completedAt,
        updated_at: completedAt,
      })
      .eq('id', orderId)
      .in('status', AUTO_COMPLETE_ELIGIBLE_STATUSES)
      .not('delivered_at', 'is', null)
      .is('completed_at', null)
      .select('id, status, delivered_at, completed_at, updated_at')

    if (error) throw error

    if (data?.[0]) {
      const mergedOrder = {
        ...order,
        ...data[0],
      } as T

      await sendAutoCompletionNotifications(orderId, completedAt, mergedOrder)
      return mergedOrder
    }

    const latestOrder = await fetchCurrentOrderCompletionState(orderId)
    if (latestOrder && isOrderCompletedState(latestOrder)) {
      return {
        ...order,
        ...latestOrder,
      } as T
    }
  } catch (error) {
    console.error('Unable to auto-complete overdue delivered order:', error)
  }

  return order
}

export const reconcileAutoCompletedOrders = async <T extends OrderLike>(orders: T[] = []) => {
  if (!Array.isArray(orders) || orders.length === 0) return orders

  return Promise.all(orders.map((order) => ensureOrderAutoCompletionUpToDate(order))) as Promise<
    T[]
  >
}
