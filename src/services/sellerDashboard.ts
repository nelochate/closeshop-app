import { supabase } from '@/utils/supabase'
import {
  fetchShopVisitSummary,
  getEmptyShopVisitSummary,
  type ShopVisitSummary,
} from './shopVisitTracking'
import { reconcileAutoCompletedOrders } from '@/utils/orderAutoCompletion'
import { isOrderCancellationRequestedStatus, normalizeOrderStatus } from '@/utils/orderStatus'
import { parseAppTimestamp } from '@/utils/dateTime'

export const LOW_STOCK_THRESHOLD = 10

const VALID_PAID_STATUSES = new Set([
  'paid',
  'completed',
  'confirmed',
  'approved',
  'success',
  'succeeded',
])
const INVALID_REVENUE_STATUSES = new Set(['cancelled', 'failed', 'rejected', 'declined', 'refunded'])
const CASH_PAYMENT_METHODS = new Set(['cash', 'cod', 'cash on delivery'])

export type SellerDashboardShop = {
  id: string
  owner_id?: string | null
  business_name?: string | null
  description?: string | null
  logo_url?: string | null
  physical_store?: string | null
  open_time?: string | null
  close_time?: string | null
  barangay?: string | null
  building?: string | null
  street?: string | null
  house_no?: string | null
  postal?: string | null
  manual_status?: string | null
  open_days?: number[] | null
  meetup_details?: string | null
}

export type SellerDashboardProduct = {
  id: string
  shop_id: string
  prod_name: string
  prod_description?: string | null
  price?: number | null
  stock?: number | null
  sold?: number | null
  main_img_urls?: string[] | string | null
  created_at?: string | null
}

export type SellerDashboardOrder = Record<string, any> & {
  items: Array<{
    id: string
    name: string
    quantity: number
    price: number
    image: string | null
  }>
  customer_name: string
  customer_phone: string
  rider_details: null | {
    name: string
    phone: string | null
  }
}

export type SellerSalesPoint = {
  label: string
  shortLabel: string
  revenue: number
  orders: number
  isToday: boolean
}

export type SellerDashboardMetrics = {
  totalRevenue: number
  totalOrders: number
  pendingOrders: number
  processingOrders: number
  shippedOrders: number
  completedOrders: number
  cancelledOrders: number
  totalCustomers: number
  totalProducts: number
  lowStockProducts: number
  outOfStockProducts: number
  totalUnitsSold: number
  dailySales: number
  weeklySales: number
  monthlySales: number
}

export type SellerDashboardSnapshot = {
  shop: SellerDashboardShop | null
  orders: SellerDashboardOrder[]
  products: SellerDashboardProduct[]
  visits: ShopVisitSummary
  metrics: SellerDashboardMetrics
  salesSeries: SellerSalesPoint[]
  lowStockItems: SellerDashboardProduct[]
  topProducts: SellerDashboardProduct[]
}

const EMPTY_METRICS: SellerDashboardMetrics = {
  totalRevenue: 0,
  totalOrders: 0,
  pendingOrders: 0,
  processingOrders: 0,
  shippedOrders: 0,
  completedOrders: 0,
  cancelledOrders: 0,
  totalCustomers: 0,
  totalProducts: 0,
  lowStockProducts: 0,
  outOfStockProducts: 0,
  totalUnitsSold: 0,
  dailySales: 0,
  weeklySales: 0,
  monthlySales: 0,
}

const EMPTY_SNAPSHOT: SellerDashboardSnapshot = {
  shop: null,
  orders: [],
  products: [],
  visits: getEmptyShopVisitSummary(),
  metrics: { ...EMPTY_METRICS },
  salesSeries: [],
  lowStockItems: [],
  topProducts: [],
}

const normalizeCount = (value: unknown) => {
  const numericValue = Number(value ?? 0)
  if (!Number.isFinite(numericValue)) return 0
  return Math.max(0, Math.trunc(numericValue))
}

const normalizeMoney = (value: unknown) => {
  const numericValue = Number(value ?? 0)
  if (!Number.isFinite(numericValue)) return 0
  return Math.max(0, numericValue)
}

const normalizeText = (value: unknown) => String(value ?? '').trim().toLowerCase()

const startOfDay = (date: Date) => {
  const nextDate = new Date(date)
  nextDate.setHours(0, 0, 0, 0)
  return nextDate
}

const startOfWeek = (date: Date) => {
  const nextDate = startOfDay(date)
  const day = nextDate.getDay()
  const diff = day === 0 ? -6 : 1 - day
  nextDate.setDate(nextDate.getDate() + diff)
  return nextDate
}

const startOfMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth(), 1)

const getOrderTimestamp = (order: Record<string, any>) =>
  parseAppTimestamp(
    order?.completed_at || order?.delivered_at || order?.updated_at || order?.created_at || null,
  )

export const isSellerCompletedOrder = (order: Record<string, any> = {}) =>
  !!order?.completed_at ||
  ['completed', 'auto_completed'].includes(normalizeOrderStatus(order?.status)) ||
  normalizeOrderStatus(order?.status) === 'delivered' ||
  (normalizeOrderStatus(order?.status) === 'picked_up' &&
    !!order?.delivered_at &&
    !order?.cancelled_at)

const isSellerCancelledOrder = (order: Record<string, any> = {}) =>
  normalizeOrderStatus(order?.status) === 'cancelled' ||
  normalizeText(order?.payment_status) === 'cancelled'

const isRevenueEligiblePayment = (order: Record<string, any> = {}) => {
  const statuses = [
    normalizeText(order?.payment_status),
    ...(Array.isArray(order?.payments)
      ? order.payments.map((payment: Record<string, any>) => normalizeText(payment?.status))
      : []),
  ].filter(Boolean)

  if (statuses.some((status) => INVALID_REVENUE_STATUSES.has(status))) {
    return false
  }

  if (statuses.some((status) => VALID_PAID_STATUSES.has(status))) {
    return true
  }

  const paymentMethod = normalizeText(order?.payment_method || order?.payments?.[0]?.method)
  return CASH_PAYMENT_METHODS.has(paymentMethod)
}

export const isRevenueEligibleOrder = (order: Record<string, any> = {}) =>
  !isSellerCancelledOrder(order) && isSellerCompletedOrder(order) && isRevenueEligiblePayment(order)

const parseImage = (mainImageUrls: SellerDashboardProduct['main_img_urls']) => {
  if (!mainImageUrls) return null
  if (Array.isArray(mainImageUrls)) return mainImageUrls[0] || null

  if (typeof mainImageUrls === 'string') {
    try {
      const parsed = JSON.parse(mainImageUrls)
      if (Array.isArray(parsed)) return parsed[0] || null
    } catch {
      return mainImageUrls
    }
  }

  return null
}

const getProfileDisplayName = (profile: Record<string, any> = {}) =>
  [profile?.first_name, profile?.last_name].filter(Boolean).join(' ').trim()

const getCustomerDisplayName = (order: Record<string, any> = {}) =>
  order?.address?.recipient_name?.trim() || getProfileDisplayName(order?.user) || 'Customer'

export const fetchSellerShopByOwner = async (ownerId: string): Promise<SellerDashboardShop | null> => {
  if (!ownerId) return null

  const { data, error } = await supabase
    .from('shops')
    .select(
      'id, owner_id, business_name, description, logo_url, physical_store, open_time, close_time, barangay, building, street, house_no, postal, manual_status, open_days, meetup_details',
    )
    .eq('owner_id', ownerId)
    .maybeSingle()

  if (error) throw error

  return data || null
}

export const fetchSellerProducts = async (
  shopId: string,
): Promise<SellerDashboardProduct[]> => {
  if (!shopId) return []

  const { data, error } = await supabase
    .from('products')
    .select('id, shop_id, prod_name, prod_description, price, stock, sold, main_img_urls, created_at')
    .eq('shop_id', shopId)
    .order('created_at', { ascending: false })

  if (error) throw error

  return (data || []).map((product: SellerDashboardProduct) => ({
    ...product,
    stock: normalizeCount(product.stock),
    sold: normalizeCount(product.sold),
    price: normalizeMoney(product.price),
  }))
}

export const fetchSellerOrders = async (shopId: string): Promise<SellerDashboardOrder[]> => {
  if (!shopId) return []

  const { data: ordersData, error } = await supabase
    .from('orders')
    .select(
      `
      *,
      address:addresses (
        id,
        recipient_name,
        phone,
        building,
        house_no,
        street,
        purok,
        barangay_name,
        city_name,
        province_name,
        region_name,
        postal_code,
        is_default
      ),
      user:profiles!orders_user_id_fkey (
        id,
        first_name,
        last_name,
        avatar_url,
        phone
      ),
      order_items (
        id,
        product_id,
        quantity,
        price,
        selected_size,
        selected_variety,
        variety_data,
        created_at,
        product:products (
          id,
          prod_name,
          prod_description,
          main_img_urls,
          price,
          sizes,
          varieties,
          stock
        )
      ),
      payments (
        id,
        amount,
        status,
        transaction_id,
        payment_date,
        method
      )
    `,
    )
    .eq('shop_id', shopId)
    .order('created_at', { ascending: false })

  if (error) throw error

  const riderIds = [...new Set((ordersData || []).map((order: Record<string, any>) => order.rider_id).filter(Boolean))]
  let riderMap = new Map<number, { name: string; phone: string | null }>()

  if (riderIds.length > 0) {
    const { data: riderRows, error: riderError } = await supabase
      .from('Rider_Registration')
      .select('rider_id, first_name, last_name, phone')
      .in('rider_id', riderIds)

    if (riderError) {
      console.warn('Could not load rider details for seller dashboard:', riderError)
    } else {
      riderMap = new Map(
        (riderRows || []).map((rider: Record<string, any>) => [
          rider.rider_id,
          {
            name: [rider.first_name, rider.last_name].filter(Boolean).join(' ').trim(),
            phone: rider.phone || null,
          },
        ]),
      )
    }
  }

  const hydratedOrders = (ordersData || []).map((order: Record<string, any>) => ({
    ...order,
    items: (order.order_items || []).map((item: Record<string, any>) => ({
      id: String(item.id),
      name: item.product?.prod_name || 'Product',
      quantity: normalizeCount(item.quantity || 1),
      price: normalizeMoney(item.price ?? item.product?.price),
      image: parseImage(item.product?.main_img_urls),
    })),
    customer_name: getCustomerDisplayName(order),
    customer_phone: order.contact_number || order.address?.phone || order.user?.phone || '',
    rider_details: order.rider_id ? riderMap.get(order.rider_id) || null : null,
  }))

  return reconcileAutoCompletedOrders(hydratedOrders)
}

export const buildSalesSeries = (orders: SellerDashboardOrder[] = [], days = 7): SellerSalesPoint[] => {
  const today = startOfDay(new Date())
  const points = Array.from({ length: days }, (_, index) => {
    const date = new Date(today)
    date.setDate(today.getDate() - (days - index - 1))

    return {
      dateKey: date.toISOString().slice(0, 10),
      label: date.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' }),
      shortLabel: date.toLocaleDateString('en-PH', { weekday: 'short' }),
      revenue: 0,
      orders: 0,
      isToday: date.getTime() === today.getTime(),
    }
  })

  const seriesByDate = new Map(points.map((point) => [point.dateKey, point]))

  orders.forEach((order) => {
    if (!isRevenueEligibleOrder(order)) return

    const timestamp = getOrderTimestamp(order)
    if (!timestamp) return

    const dateKey = startOfDay(timestamp).toISOString().slice(0, 10)
    const currentPoint = seriesByDate.get(dateKey)
    if (!currentPoint) return

    currentPoint.revenue += normalizeMoney(order.total_amount)
    currentPoint.orders += 1
  })

  return points.map(({ dateKey, ...point }) => point)
}

export const buildSellerDashboardMetrics = ({
  orders = [],
  products = [],
}: {
  orders?: SellerDashboardOrder[]
  products?: SellerDashboardProduct[]
}): SellerDashboardMetrics => {
  const now = new Date()
  const todayStart = startOfDay(now)
  const weekStart = startOfWeek(now)
  const monthStart = startOfMonth(now)

  const uniqueCustomers = new Set<string>()
  let totalRevenue = 0
  let pendingOrders = 0
  let processingOrders = 0
  let shippedOrders = 0
  let completedOrders = 0
  let cancelledOrders = 0
  let dailySales = 0
  let weeklySales = 0
  let monthlySales = 0

  orders.forEach((order) => {
    const status = normalizeOrderStatus(order.status)
    const orderTimestamp = getOrderTimestamp(order)

    if (order.user_id) {
      uniqueCustomers.add(String(order.user_id))
    } else if (order.user?.id) {
      uniqueCustomers.add(String(order.user.id))
    }

    if (status === 'pending_approval') pendingOrders++
    else if (status === 'waiting_for_rider' || isOrderCancellationRequestedStatus(status)) {
      processingOrders++
    } else if (status === 'accepted_by_rider' || status === 'picked_up') {
      shippedOrders++
    } else if (isSellerCompletedOrder(order)) {
      completedOrders++
    } else if (status === 'cancelled') {
      cancelledOrders++
    }

    if (!isRevenueEligibleOrder(order) || !orderTimestamp) {
      return
    }

    const orderRevenue = normalizeMoney(order.total_amount)
    totalRevenue += orderRevenue

    if (orderTimestamp >= todayStart) dailySales += orderRevenue
    if (orderTimestamp >= weekStart) weeklySales += orderRevenue
    if (orderTimestamp >= monthStart) monthlySales += orderRevenue
  })

  const lowStockProducts = products.filter(
    (product) => normalizeCount(product.stock) > 0 && normalizeCount(product.stock) < LOW_STOCK_THRESHOLD,
  ).length
  const outOfStockProducts = products.filter((product) => normalizeCount(product.stock) === 0).length
  const totalUnitsSold = products.reduce((total, product) => total + normalizeCount(product.sold), 0)

  return {
    totalRevenue,
    totalOrders: orders.length,
    pendingOrders,
    processingOrders,
    shippedOrders,
    completedOrders,
    cancelledOrders,
    totalCustomers: uniqueCustomers.size,
    totalProducts: products.length,
    lowStockProducts,
    outOfStockProducts,
    totalUnitsSold,
    dailySales,
    weeklySales,
    monthlySales,
  }
}

export const fetchSellerDashboardSnapshot = async (
  ownerId: string,
): Promise<SellerDashboardSnapshot> => {
  if (!ownerId) return { ...EMPTY_SNAPSHOT }

  const shop = await fetchSellerShopByOwner(ownerId)

  if (!shop?.id) {
    return {
      ...EMPTY_SNAPSHOT,
      shop,
    }
  }

  const [orders, products, visits] = await Promise.all([
    fetchSellerOrders(shop.id),
    fetchSellerProducts(shop.id),
    fetchShopVisitSummary(shop.id),
  ])

  const metrics = buildSellerDashboardMetrics({ orders, products })
  const salesSeries = buildSalesSeries(orders)
  const lowStockItems = [...products]
    .filter(
      (product) => normalizeCount(product.stock) > 0 && normalizeCount(product.stock) < LOW_STOCK_THRESHOLD,
    )
    .sort((left, right) => normalizeCount(left.stock) - normalizeCount(right.stock))
    .slice(0, 5)
  const topProducts = [...products]
    .sort((left, right) => normalizeCount(right.sold) - normalizeCount(left.sold))
    .slice(0, 5)

  return {
    shop,
    orders,
    products,
    visits,
    metrics,
    salesSeries,
    lowStockItems,
    topProducts,
  }
}
