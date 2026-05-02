import {
  calculateHaversineDistanceKm,
  calculateRiderBasePayQuote,
  normalizeDistanceKm,
  normalizeMoney,
} from '@/utils/riderEarnings.js'

export const DEFAULT_DELIVERY_FEE = 30

const resolveNormalizedMoney = (value, fallback = 0) => normalizeMoney(value) ?? fallback

export const calculateOrderItemsSubtotal = (items = []) => {
  const rawSubtotal = items.reduce((sum, item) => {
    const price = Number(item?.price || 0)
    const quantity = Number(item?.quantity || 0)
    return sum + price * quantity
  }, 0)

  return resolveNormalizedMoney(rawSubtotal, 0)
}

export const calculateOrderTotalAmount = (subtotalValue, deliveryFeeValue) => {
  const subtotal = resolveNormalizedMoney(subtotalValue, 0)
  const deliveryFee = resolveNormalizedMoney(deliveryFeeValue, DEFAULT_DELIVERY_FEE)
  return resolveNormalizedMoney(subtotal + deliveryFee, subtotal + deliveryFee)
}

export const calculateCheckoutDeliveryPricing = ({
  deliveryFee = null,
  distanceKm = null,
  pickupLat = null,
  pickupLng = null,
  deliveryLat = null,
  deliveryLng = null,
  fallbackFee = DEFAULT_DELIVERY_FEE,
} = {}) => {
  const fallbackFeeAmount = resolveNormalizedMoney(fallbackFee, DEFAULT_DELIVERY_FEE)
  const storedFee = normalizeMoney(deliveryFee)
  const storedDistance = normalizeDistanceKm(distanceKm)
  const resolvedDistance =
    storedDistance ??
    calculateHaversineDistanceKm(pickupLat, pickupLng, deliveryLat, deliveryLng)
  const quote = calculateRiderBasePayQuote(resolvedDistance)
  const computedFee = normalizeMoney(quote?.totalPay)
  const resolvedFee = storedFee ?? computedFee ?? fallbackFeeAmount

  return {
    distanceKm: resolvedDistance,
    deliveryFee: resolvedFee,
    tierLabel: quote?.tierLabel || 'Fixed rate',
    payRule: quote?.payRule || 'fixed_delivery_fee_v1',
    fallbackApplied: storedFee === null && computedFee === null,
    isEstimated: storedFee === null,
  }
}

export const resolveOrderDeliveryFee = (
  order = {},
  fallbackFee = DEFAULT_DELIVERY_FEE,
  subtotalValue = null,
) => {
  const storedFee = normalizeMoney(order?.delivery_fee)

  if (storedFee !== null) return storedFee

  const subtotal = normalizeMoney(subtotalValue ?? order?.subtotal)
  const totalAmount = normalizeMoney(order?.total_amount)

  if (subtotal !== null && totalAmount !== null && totalAmount >= subtotal) {
    return normalizeMoney(totalAmount - subtotal) ?? 0
  }

  return calculateCheckoutDeliveryPricing({
    deliveryFee: order?.delivery_fee,
    distanceKm: order?.delivery_distance_km,
    pickupLat: order?.pickup_lat ?? order?.shop?.latitude,
    pickupLng: order?.pickup_lng ?? order?.shop?.longitude,
    deliveryLat: order?.delivery_lat ?? order?.address?.latitude,
    deliveryLng: order?.delivery_lng ?? order?.address?.longitude,
    fallbackFee,
  }).deliveryFee
}

export const isMissingDeliveryFeeColumnError = (error) => {
  const code = String(error?.code || '')
  const message = String(error?.message || '')
  const details = String(error?.details || '')
  const hint = String(error?.hint || '')
  const combinedText = `${message} ${details} ${hint}`.toLowerCase()

  return (
    code === 'PGRST204' ||
    code === '42703' ||
    combinedText.includes('delivery_fee')
  )
}
