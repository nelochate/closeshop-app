export const ORDER_CANCEL_REQUESTED_STATUS = 'cancel_requested'
export const LEGACY_ORDER_CANCEL_REQUESTED_STATUS = 'cancellation_requested'
export const ORDER_CANCEL_REQUESTED_STATUSES = [
  ORDER_CANCEL_REQUESTED_STATUS,
  LEGACY_ORDER_CANCEL_REQUESTED_STATUS,
]

export const isOrderCancellationRequestedStatus = (status) =>
  ORDER_CANCEL_REQUESTED_STATUSES.includes(String(status || ''))

export const normalizeOrderStatus = (status) =>
  isOrderCancellationRequestedStatus(status)
    ? ORDER_CANCEL_REQUESTED_STATUS
    : String(status || '')
