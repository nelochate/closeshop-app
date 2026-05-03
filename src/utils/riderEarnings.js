const BASE_PAY_RULE = 'distance_tier_v1'
const EXTRA_DISTANCE_THRESHOLD_KM = 10
const EXTRA_DISTANCE_RATE = 5
const RIDER_EARNINGS_LEDGER_MISSING_SESSION_KEY = 'closeshop:rider-earnings-ledger-missing'

const normalizeNumber = (value) => {
  if (value === null || value === undefined || value === '') return null

  const parsed = typeof value === 'number' ? value : Number(value)

  if (!Number.isFinite(parsed)) return null

  return parsed
}

export const normalizeDistanceKm = (value) => {
  const parsed = normalizeNumber(value)

  if (parsed === null || parsed < 0) return null

  return Number(parsed.toFixed(2))
}

export const normalizeMoney = (value) => {
  const parsed = normalizeNumber(value)

  if (parsed === null || parsed < 0) return null

  return Number(parsed.toFixed(2))
}

export const calculateHaversineDistanceKm = (startLat, startLng, endLat, endLng) => {
  const originLat = normalizeNumber(startLat)
  const originLng = normalizeNumber(startLng)
  const destinationLat = normalizeNumber(endLat)
  const destinationLng = normalizeNumber(endLng)

  if (
    originLat === null ||
    originLng === null ||
    destinationLat === null ||
    destinationLng === null
  ) {
    return null
  }

  const earthRadiusKm = 6371
  const toRadians = (degrees) => (degrees * Math.PI) / 180
  const deltaLat = toRadians(destinationLat - originLat)
  const deltaLng = toRadians(destinationLng - originLng)

  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(toRadians(originLat)) *
      Math.cos(toRadians(destinationLat)) *
      Math.sin(deltaLng / 2) *
      Math.sin(deltaLng / 2)

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))

  return Number((earthRadiusKm * c).toFixed(2))
}

export const calculateRiderBasePayQuote = (distanceValue) => {
  const distanceKm = normalizeDistanceKm(distanceValue)

  if (distanceKm === null) return null

  if (distanceKm <= 3) {
    return {
      distanceKm,
      tierLabel: '0-3 km',
      basePay: 30,
      additionalDistanceKm: 0,
      additionalPay: 0,
      totalPay: 30,
      payRule: BASE_PAY_RULE,
    }
  }

  if (distanceKm <= 6) {
    return {
      distanceKm,
      tierLabel: '3-6 km',
      basePay: 45,
      additionalDistanceKm: 0,
      additionalPay: 0,
      totalPay: 45,
      payRule: BASE_PAY_RULE,
    }
  }

  if (distanceKm <= 10) {
    return {
      distanceKm,
      tierLabel: '6-10 km',
      basePay: 65,
      additionalDistanceKm: 0,
      additionalPay: 0,
      totalPay: 65,
      payRule: BASE_PAY_RULE,
    }
  }

  const additionalDistanceKm = Math.max(0, Math.ceil(distanceKm - EXTRA_DISTANCE_THRESHOLD_KM))
  const additionalPay = additionalDistanceKm * EXTRA_DISTANCE_RATE

  return {
    distanceKm,
    tierLabel: '10+ km',
    basePay: 80,
    additionalDistanceKm,
    additionalPay,
    totalPay: 80 + additionalPay,
    payRule: BASE_PAY_RULE,
  }
}

export const resolveOrderDeliveryDistanceKm = (order = {}) => {
  const storedDistance = normalizeDistanceKm(order?.delivery_distance_km)
  if (storedDistance !== null) return storedDistance

  return calculateHaversineDistanceKm(
    order?.pickup_lat ?? order?.shop?.latitude,
    order?.pickup_lng ?? order?.shop?.longitude,
    order?.delivery_lat ?? order?.address?.latitude,
    order?.delivery_lng ?? order?.address?.longitude,
  )
}

export const resolveOrderRiderEarningsQuote = (order = {}) => {
  const storedDistance = resolveOrderDeliveryDistanceKm(order)
  const calculatedQuote = calculateRiderBasePayQuote(storedDistance)
  const storedEarnings = normalizeMoney(order?.rider_earnings)

  if (!calculatedQuote && storedEarnings === null) return null

  return {
    ...(calculatedQuote || {
      distanceKm: storedDistance,
      tierLabel: 'Unavailable',
      basePay: storedEarnings || 0,
      additionalDistanceKm: 0,
      additionalPay: 0,
      totalPay: storedEarnings || 0,
      payRule: order?.rider_pay_rule || BASE_PAY_RULE,
    }),
    totalPay: storedEarnings ?? calculatedQuote?.totalPay ?? 0,
    payRule: order?.rider_pay_rule || calculatedQuote?.payRule || BASE_PAY_RULE,
    isEstimated: storedEarnings === null,
  }
}

export const isMissingRiderEarningsTableError = (error) => {
  const message = String(error?.message || '')
  const hint = String(error?.hint || '')

  return (
    error?.code === 'PGRST205' &&
    (message.includes("public.rider_earnings") || hint.includes('rider_earnings'))
  )
}

const getRiderEarningsLedgerStorage = () => {
  if (typeof window === 'undefined') return null

  try {
    return window.sessionStorage
  } catch {
    return null
  }
}

export const isRiderEarningsLedgerMarkedMissing = () => {
  const storage = getRiderEarningsLedgerStorage()
  return storage?.getItem(RIDER_EARNINGS_LEDGER_MISSING_SESSION_KEY) === '1'
}

export const markRiderEarningsLedgerMissing = () => {
  const storage = getRiderEarningsLedgerStorage()
  storage?.setItem(RIDER_EARNINGS_LEDGER_MISSING_SESSION_KEY, '1')
}

export const clearRiderEarningsLedgerMissingMark = () => {
  const storage = getRiderEarningsLedgerStorage()
  storage?.removeItem(RIDER_EARNINGS_LEDGER_MISSING_SESSION_KEY)
}

export const getOrderEarningsTimestamp = (order = {}) =>
  order?.completed_at ||
  order?.delivered_at ||
  order?.rider_earnings_computed_at ||
  order?.updated_at ||
  order?.created_at ||
  null

export const buildRiderEarningsRecordFromOrder = (order = {}) => {
  if (!order?.id || !order?.rider_id) return null

  const earnedAt = getOrderEarningsTimestamp(order)
  const isCompletedOrder = !!order?.completed_at || !!order?.delivered_at || order?.status === 'completed'

  if (!earnedAt || !isCompletedOrder) return null

  const quote = resolveOrderRiderEarningsQuote(order)

  if (!quote) return null

  return {
    id: `order-${order.id}`,
    order_id: order.id,
    rider_id: order.rider_id,
    amount: quote.totalPay,
    base_pay: quote.basePay,
    additional_distance_km: quote.additionalDistanceKm,
    additional_pay: quote.additionalPay,
    delivery_distance_km: quote.distanceKm ?? 0,
    pay_rule: order?.rider_pay_rule || quote.payRule || BASE_PAY_RULE,
    status: 'pending',
    earned_at: earnedAt,
    paid_at: null,
    created_at: order?.created_at || earnedAt,
    order: {
      id: order.id,
      transaction_number: order.transaction_number,
      status: order.status,
    },
    source: 'orders_fallback',
    isEstimated: !!quote.isEstimated,
  }
}

export const buildRiderEarningsRecordsFromOrders = (orders = [], riderId = null) => {
  return [...orders]
    .filter((order) => {
      if (!order?.rider_id) return false
      if (riderId !== null && riderId !== undefined && order.rider_id !== riderId) return false

      return !!order?.completed_at || !!order?.delivered_at || order?.status === 'completed'
    })
    .map((order) => buildRiderEarningsRecordFromOrder(order))
    .filter(Boolean)
    .sort((left, right) => {
      const leftTime = Date.parse(left.earned_at || left.created_at || 0) || 0
      const rightTime = Date.parse(right.earned_at || right.created_at || 0) || 0
      return rightTime - leftTime
    })
}

export const formatRiderDistanceLabel = (distanceValue) => {
  const distanceKm = normalizeDistanceKm(distanceValue)
  if (distanceKm === null) return 'Distance unavailable'

  return `${distanceKm.toFixed(1)} km`
}

export const formatPhpAmount = (amountValue, options = {}) => {
  const amount = normalizeMoney(amountValue) ?? 0
  const formatter = new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: options.minimumFractionDigits ?? 0,
    maximumFractionDigits: options.maximumFractionDigits ?? 0,
  })

  return formatter.format(amount)
}
