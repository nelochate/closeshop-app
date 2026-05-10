import type { SellerDashboardOrder } from '@/services/sellerDashboard'
import { isOrderCancellationRequestedStatus, normalizeOrderStatus } from '@/utils/orderStatus'
import type { SellerOrdersRouteFilter } from './sellerNavigation'

export type SellerOrderFilter = SellerOrdersRouteFilter

export type SellerOrderCounts = {
  all: number
  pending: number
  processing: number
  cancelRequests: number
  waiting: number
  shipped: number
  completed: number
  cancelled: number
}

export const isSellerOrderCompletedState = (order: Record<string, any> = {}) =>
  !!order.completed_at || normalizeOrderStatus(order.status) === 'completed'

export const isSellerOrderDeliveredState = (order: Record<string, any> = {}) =>
  isSellerOrderCompletedState(order) ||
  normalizeOrderStatus(order.status) === 'delivered' ||
  (normalizeOrderStatus(order.status) === 'picked_up' && !!order.delivered_at && !order.completed_at)

export const getSellerOrderStatusText = (order: Record<string, any> = {}) => {
  if (isSellerOrderDeliveredState(order)) {
    return isSellerOrderCompletedState(order) ? 'Completed' : 'Delivered'
  }

  const status = normalizeOrderStatus(order.status)
  const statusMap: Record<string, string> = {
    pending_approval: 'Pending Approval',
    waiting_for_rider: 'Waiting for Rider',
    cancel_requested: 'Cancellation Requested',
    accepted_by_rider: 'Rider Accepted',
    picked_up: 'Picked Up',
    cancelled: 'Cancelled',
  }

  return statusMap[status] || status.replace(/_/g, ' ')
}

export const getSellerOrderStatusColor = (order: Record<string, any> = {}) => {
  if (isSellerOrderDeliveredState(order)) return 'success'

  const status = normalizeOrderStatus(order.status)
  const colorMap: Record<string, string> = {
    pending_approval: 'warning',
    waiting_for_rider: 'info',
    cancel_requested: 'warning',
    accepted_by_rider: 'primary',
    picked_up: 'warning',
    cancelled: 'error',
  }

  return colorMap[status] || 'grey'
}

export const getWaitingForRiderStatusProps = (order: Record<string, any> = {}) => {
  if (isOrderCancellationRequestedStatus(order.status)) {
    return {
      color: 'warning',
      icon: 'mdi-timer-sand',
      text: 'Cancellation Requested',
      subtitle: 'Buyer is waiting for your cancellation decision',
    }
  }

  return {
    color: 'info',
    icon: 'mdi-bike-fast',
    text: 'Waiting for Rider',
    subtitle: 'Approved and ready for rider assignment',
  }
}

export const getSellerOrderCounts = (
  orders: SellerDashboardOrder[] = [],
): SellerOrderCounts => {
  const counts: SellerOrderCounts = {
    all: orders.length,
    pending: 0,
    processing: 0,
    cancelRequests: 0,
    waiting: 0,
    shipped: 0,
    completed: 0,
    cancelled: 0,
  }

  orders.forEach((order) => {
    const status = normalizeOrderStatus(order.status)

    if (status === 'pending_approval') {
      counts.pending += 1
      return
    }

    if (isOrderCancellationRequestedStatus(status)) {
      counts.processing += 1
      counts.cancelRequests += 1
      return
    }

    if (status === 'waiting_for_rider') {
      counts.processing += 1
      counts.waiting += 1
      return
    }

    if (status === 'accepted_by_rider' || (status === 'picked_up' && !order.delivered_at)) {
      counts.shipped += 1
      return
    }

    if (isSellerOrderDeliveredState(order)) {
      counts.completed += 1
      return
    }

    if (status === 'cancelled') {
      counts.cancelled += 1
    }
  })

  return counts
}

export const filterSellerOrders = (
  orders: SellerDashboardOrder[] = [],
  filter: SellerOrderFilter = 'all',
) => {
  switch (filter) {
    case 'pending':
      return orders.filter((order) => normalizeOrderStatus(order.status) === 'pending_approval')
    case 'processing':
      return orders.filter((order) => {
        const status = normalizeOrderStatus(order.status)
        return status === 'waiting_for_rider' || isOrderCancellationRequestedStatus(status)
      })
    case 'cancel-requests':
      return orders.filter((order) => isOrderCancellationRequestedStatus(order.status))
    case 'waiting':
      return orders.filter((order) => normalizeOrderStatus(order.status) === 'waiting_for_rider')
    case 'shipped':
      return orders.filter((order) => {
        const status = normalizeOrderStatus(order.status)
        return status === 'accepted_by_rider' || (status === 'picked_up' && !order.delivered_at)
      })
    case 'completed':
      return orders.filter((order) => isSellerOrderDeliveredState(order))
    case 'cancelled':
      return orders.filter((order) => normalizeOrderStatus(order.status) === 'cancelled')
    default:
      return orders
  }
}
