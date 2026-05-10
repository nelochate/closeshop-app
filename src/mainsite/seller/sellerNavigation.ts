import type { RouteLocationRaw } from 'vue-router'

export type SellerAnalyticsSection = 'sales' | 'visits' | 'inventory' | 'customers'
export type SellerProductsFilter = 'all' | 'low-stock' | 'out-of-stock'
export type SellerOrdersRouteFilter =
  | 'all'
  | 'pending'
  | 'processing'
  | 'cancel-requests'
  | 'waiting'
  | 'shipped'
  | 'completed'
  | 'cancelled'

const ANALYTICS_SECTIONS = new Set<SellerAnalyticsSection>([
  'sales',
  'visits',
  'inventory',
  'customers',
])
const PRODUCT_FILTERS = new Set<SellerProductsFilter>(['all', 'low-stock', 'out-of-stock'])
const ORDER_FILTERS = new Set<SellerOrdersRouteFilter>([
  'all',
  'pending',
  'processing',
  'cancel-requests',
  'waiting',
  'shipped',
  'completed',
  'cancelled',
])

const normalizeQueryValue = (value: unknown) =>
  typeof value === 'string' ? value.trim().toLowerCase() : ''

export const normalizeSellerAnalyticsSection = (value: unknown): SellerAnalyticsSection => {
  const normalizedValue = normalizeQueryValue(value)
  return ANALYTICS_SECTIONS.has(normalizedValue as SellerAnalyticsSection)
    ? (normalizedValue as SellerAnalyticsSection)
    : 'sales'
}

export const normalizeSellerProductsFilter = (value: unknown): SellerProductsFilter => {
  const normalizedValue = normalizeQueryValue(value)
  return PRODUCT_FILTERS.has(normalizedValue as SellerProductsFilter)
    ? (normalizedValue as SellerProductsFilter)
    : 'all'
}

export const normalizeSellerOrdersRouteFilter = (value: unknown): SellerOrdersRouteFilter => {
  const normalizedValue = normalizeQueryValue(value)

  if (normalizedValue === 'pending_approval') return 'pending'
  if (normalizedValue === 'cancel_requests') return 'cancel-requests'
  if (normalizedValue === 'waiting_for_rider') return 'waiting'
  if (normalizedValue === 'active' || normalizedValue === 'delivered') {
    return normalizedValue === 'active' ? 'shipped' : 'completed'
  }

  return ORDER_FILTERS.has(normalizedValue as SellerOrdersRouteFilter)
    ? (normalizedValue as SellerOrdersRouteFilter)
    : 'all'
}

export const buildSellerOrdersRoute = (
  status: SellerOrdersRouteFilter = 'all',
): RouteLocationRaw => ({
  name: 'seller-orders',
  query: status === 'all' ? {} : { status },
})

export const buildSellerProductsRoute = (
  filter: SellerProductsFilter = 'all',
): RouteLocationRaw => ({
  name: 'seller-products',
  query: filter === 'all' ? {} : { filter },
})

export const buildSellerAnalyticsRoute = (
  section: SellerAnalyticsSection = 'sales',
): RouteLocationRaw => ({
  name: 'seller-analytics',
  query: section === 'sales' ? {} : { section },
})
