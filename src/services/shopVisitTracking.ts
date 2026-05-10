import { supabase } from '@/utils/supabase'

export type ShopVisitType = 'shop_page' | 'profile_page'

export type ShopVisitSummary = {
  totalVisits: number
  shopPageVisits: number
  profilePageVisits: number
  uniqueVisitors: number
  last7DaysVisits: number
  last30DaysVisits: number
  hasVisitTracking: boolean
}

const VISIT_TRACKING_UNAVAILABLE_SESSION_KEY = 'closeshop:shop-visit-tracking-unavailable'
const VISITOR_KEY_STORAGE_KEY = 'closeshop:visitor-key'
const SESSION_ID_STORAGE_KEY = 'closeshop:visit-session-id'
const VISIT_THROTTLE_STORAGE_PREFIX = 'closeshop:shop-visit-throttle'
const VISIT_THROTTLE_MS = 30 * 60 * 1000

const EMPTY_VISIT_SUMMARY: ShopVisitSummary = {
  totalVisits: 0,
  shopPageVisits: 0,
  profilePageVisits: 0,
  uniqueVisitors: 0,
  last7DaysVisits: 0,
  last30DaysVisits: 0,
  hasVisitTracking: false,
}

const getSafeStorage = (storageType: 'localStorage' | 'sessionStorage') => {
  if (typeof window === 'undefined') return null

  try {
    return window[storageType]
  } catch {
    return null
  }
}

const createId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  return `visit-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

const getOrCreateStorageValue = (storageType: 'localStorage' | 'sessionStorage', storageKey: string) => {
  const storage = getSafeStorage(storageType)
  if (!storage) return createId()

  const existing = storage.getItem(storageKey)
  if (existing) return existing

  const nextValue = createId()
  storage.setItem(storageKey, nextValue)
  return nextValue
}

const getThrottleStorageKey = (shopId: string, visitType: ShopVisitType) =>
  `${VISIT_THROTTLE_STORAGE_PREFIX}:${shopId}:${visitType}`

const setLastTrackedAt = (shopId: string, visitType: ShopVisitType, timestamp: number) => {
  const storage = getSafeStorage('localStorage')
  storage?.setItem(getThrottleStorageKey(shopId, visitType), String(timestamp))
}

const getLastTrackedAt = (shopId: string, visitType: ShopVisitType) => {
  const storage = getSafeStorage('localStorage')
  if (!storage) return 0

  const rawValue = storage.getItem(getThrottleStorageKey(shopId, visitType))
  const parsedValue = Number(rawValue || 0)
  return Number.isFinite(parsedValue) ? parsedValue : 0
}

const shouldTrackVisit = (shopId: string, visitType: ShopVisitType) => {
  const lastTrackedAt = getLastTrackedAt(shopId, visitType)
  if (!lastTrackedAt) return true

  return Date.now() - lastTrackedAt >= VISIT_THROTTLE_MS
}

export const isShopVisitTrackingUnavailableError = (error: any) => {
  const message = String(error?.message || '').toLowerCase()
  const hint = String(error?.hint || '').toLowerCase()
  const code = String(error?.code || '')
  const joinedText = `${message} ${hint}`

  return (
    ['PGRST202', 'PGRST205', '42883', '42P01'].includes(code) &&
    (joinedText.includes('shop_visits') ||
      joinedText.includes('record_shop_visit') ||
      joinedText.includes('get_shop_visit_summary'))
  )
}

const getVisitTrackingSessionStorage = () => getSafeStorage('sessionStorage')

export const isShopVisitTrackingMarkedUnavailable = () =>
  getVisitTrackingSessionStorage()?.getItem(VISIT_TRACKING_UNAVAILABLE_SESSION_KEY) === '1'

export const markShopVisitTrackingUnavailable = () => {
  getVisitTrackingSessionStorage()?.setItem(VISIT_TRACKING_UNAVAILABLE_SESSION_KEY, '1')
}

export const clearShopVisitTrackingUnavailableMark = () => {
  getVisitTrackingSessionStorage()?.removeItem(VISIT_TRACKING_UNAVAILABLE_SESSION_KEY)
}

export const getEmptyShopVisitSummary = (): ShopVisitSummary => ({ ...EMPTY_VISIT_SUMMARY })

export const recordShopVisit = async (
  shopId: string | null | undefined,
  visitType: ShopVisitType = 'shop_page',
) => {
  if (!shopId) {
    return { tracked: false, reason: 'missing-shop-id' as const }
  }

  if (isShopVisitTrackingMarkedUnavailable()) {
    return { tracked: false, reason: 'tracking-unavailable' as const }
  }

  if (!shouldTrackVisit(shopId, visitType)) {
    return { tracked: false, reason: 'throttled' as const }
  }

  try {
    const {
      data: { user },
    } = await supabase.auth.getUser()

    const visitorKey = getOrCreateStorageValue('localStorage', VISITOR_KEY_STORAGE_KEY)
    const sessionId = getOrCreateStorageValue('sessionStorage', SESSION_ID_STORAGE_KEY)

    const { error } = await supabase.rpc('record_shop_visit', {
      p_shop_id: shopId,
      p_visit_type: visitType,
      p_visitor_key: visitorKey,
      p_session_id: sessionId,
    })

    if (error) {
      if (isShopVisitTrackingUnavailableError(error)) {
        markShopVisitTrackingUnavailable()
        return { tracked: false, reason: 'tracking-unavailable' as const }
      }

      throw error
    }

    clearShopVisitTrackingUnavailableMark()
    setLastTrackedAt(shopId, visitType, Date.now())

    return {
      tracked: true,
      reason: user?.id ? ('authenticated' as const) : ('anonymous' as const),
    }
  } catch (error) {
    console.warn('Could not record shop visit:', error)
    return { tracked: false, reason: 'error' as const }
  }
}

export const fetchShopVisitSummary = async (
  shopId: string | null | undefined,
): Promise<ShopVisitSummary> => {
  if (!shopId || isShopVisitTrackingMarkedUnavailable()) {
    return getEmptyShopVisitSummary()
  }

  try {
    const { data, error } = await supabase.rpc('get_shop_visit_summary', {
      p_shop_id: shopId,
    })

    if (error) {
      if (isShopVisitTrackingUnavailableError(error)) {
        markShopVisitTrackingUnavailable()
        return getEmptyShopVisitSummary()
      }

      throw error
    }

    clearShopVisitTrackingUnavailableMark()

    const summary = Array.isArray(data) ? data[0] : data

    return {
      totalVisits: Number(summary?.total_visits || 0),
      shopPageVisits: Number(summary?.shop_page_visits || 0),
      profilePageVisits: Number(summary?.profile_page_visits || 0),
      uniqueVisitors: Number(summary?.unique_visitors || 0),
      last7DaysVisits: Number(summary?.last_7_days_visits || 0),
      last30DaysVisits: Number(summary?.last_30_days_visits || 0),
      hasVisitTracking: true,
    }
  } catch (error) {
    console.warn('Could not load shop visit summary:', error)
    return getEmptyShopVisitSummary()
  }
}
