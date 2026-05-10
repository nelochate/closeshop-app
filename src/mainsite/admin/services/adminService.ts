import { supabase } from '@/utils/supabase'
import { isRevenueEligibleOrder } from '@/services/sellerDashboard'

const SHOP_ADS_REVENUE_PREVIEW = 12850
const MARKETING_PURCHASES_REVENUE_PREVIEW = 4860

export type AdminProfile = {
  id: string
  email?: string | null
  first_name?: string | null
  last_name?: string | null
  phone?: string | null
  avatar_url?: string | null
  role?: string | null
}

export type AdminShopStatus = 'pending' | 'approved' | 'declined'
export type AdminRiderStatus = 'pending' | 'approved' | 'rejected'

export type AdminShopRecord = Record<string, any> & {
  id: string
  owner_id: string
  status?: AdminShopStatus | string | null
  ownerProfile?: AdminProfile | null
}

export type AdminRiderRecord = Record<string, any> & {
  rider_id: string | number
  status?: AdminRiderStatus | string | null
  profiles?: AdminProfile | null
}

export type AdminDashboardSnapshot = {
  totalShops: number
  activeShops: number
  pendingShopApprovals: number
  declinedShops: number
  totalRiders: number
  activeRiders: number
  pendingRiderApprovals: number
  rejectedRiders: number
  totalUsers: number
  totalOrders: number
  platformRevenue: number
  shopAdsRevenue: number
  marketingPurchasesRevenue: number
  monetizationPlaceholders: {
    shopAdsRevenue: boolean
    marketingPurchasesRevenue: boolean
  }
}

export type AdminApprovalAlert = {
  id: string
  entityType: 'shop' | 'rider'
  entityId: string
  title: string
  message: string
  createdAt: string | null
}

export type AdminApprovalNotificationSnapshot = {
  pendingShopApprovals: number
  pendingRiderApprovals: number
  alerts: AdminApprovalAlert[]
}

const normalizeMoney = (value: unknown) => {
  const numericValue = Number(value ?? 0)
  if (!Number.isFinite(numericValue)) return 0
  return Math.max(0, numericValue)
}

const countRows = async (table: string, mutate?: (query: any) => any) => {
  let query = supabase.from(table).select('*', { count: 'exact', head: true })

  if (mutate) {
    query = mutate(query)
  }

  const { count, error } = await query

  if (error) throw error

  return count || 0
}

const fetchProfilesByIds = async (profileIds: string[]) => {
  if (profileIds.length === 0) {
    return new Map<string, AdminProfile>()
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, first_name, last_name, phone, avatar_url, role')
    .in('id', profileIds)

  if (error) throw error

  return new Map(
    (data || []).map((profile: AdminProfile) => [profile.id, profile]),
  )
}

const fetchOrdersForAdminMetrics = async () => {
  const { data, error } = await supabase
    .from('orders')
    .select(
      `
      id,
      status,
      total_amount,
      payment_status,
      payment_method,
      completed_at,
      delivered_at,
      updated_at,
      created_at,
      payments (
        status,
        method
      )
    `,
    )

  if (error) throw error

  return data || []
}

export const fetchCurrentAdminContext = async () => {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError) throw userError

  if (!user) {
    return {
      user: null,
      profile: null as AdminProfile | null,
    }
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, email, first_name, last_name, phone, avatar_url, role')
    .eq('id', user.id)
    .maybeSingle()

  if (profileError) throw profileError

  return {
    user,
    profile: (profile as AdminProfile | null) || null,
  }
}

export const fetchAdminDashboardSnapshot = async (): Promise<AdminDashboardSnapshot> => {
  const [
    totalShops,
    activeShops,
    pendingShopApprovals,
    declinedShops,
    totalRiders,
    activeRiders,
    pendingRiderApprovals,
    rejectedRiders,
    totalUsers,
    orders,
  ] = await Promise.all([
    countRows('shops'),
    countRows('shops', (query) => query.eq('status', 'approved')),
    countRows('shops', (query) => query.eq('status', 'pending')),
    countRows('shops', (query) => query.eq('status', 'declined')),
    countRows('Rider_Registration'),
    countRows('Rider_Registration', (query) => query.eq('status', 'approved')),
    countRows('Rider_Registration', (query) => query.eq('status', 'pending')),
    countRows('Rider_Registration', (query) => query.eq('status', 'rejected')),
    countRows('profiles'),
    fetchOrdersForAdminMetrics(),
  ])

  const platformRevenue = orders.reduce((sum, order) => {
    if (!isRevenueEligibleOrder(order)) {
      return sum
    }

    return sum + normalizeMoney(order.total_amount)
  }, 0)

  return {
    totalShops,
    activeShops,
    pendingShopApprovals,
    declinedShops,
    totalRiders,
    activeRiders,
    pendingRiderApprovals,
    rejectedRiders,
    totalUsers,
    totalOrders: orders.length,
    platformRevenue,
    shopAdsRevenue: SHOP_ADS_REVENUE_PREVIEW,
    marketingPurchasesRevenue: MARKETING_PURCHASES_REVENUE_PREVIEW,
    monetizationPlaceholders: {
      shopAdsRevenue: true,
      marketingPurchasesRevenue: true,
    },
  }
}

export const fetchAdminShops = async (): Promise<AdminShopRecord[]> => {
  const { data, error } = await supabase
    .from('shops')
    .select(
      `
      id,
      owner_id,
      business_name,
      description,
      logo_url,
      physical_store,
      status,
      manual_status,
      building,
      house_no,
      street,
      barangay,
      city,
      province,
      postal,
      detected_address,
      open_time,
      close_time,
      open_days,
      valid_id_front,
      valid_id_back,
      created_at,
      updated_at
    `,
    )
    .order('created_at', { ascending: false })

  if (error) throw error

  const shops = (data || []) as AdminShopRecord[]
  const ownerIds = [...new Set(shops.map((shop) => shop.owner_id).filter(Boolean))]
  const ownerProfiles = await fetchProfilesByIds(ownerIds)

  return shops.map((shop) => ({
    ...shop,
    ownerProfile: ownerProfiles.get(shop.owner_id) || null,
  }))
}

export const fetchAdminRiders = async (): Promise<AdminRiderRecord[]> => {
  const { data, error } = await supabase
    .from('Rider_Registration')
    .select(
      `
      *,
      profiles:profile_id (
        id,
        email,
        first_name,
        last_name,
        phone,
        avatar_url,
        role
      )
    `,
    )
    .order('application_date', { ascending: false })

  if (error) throw error

  return (data || []) as AdminRiderRecord[]
}

const fetchAdminPendingShops = async (limit: number) => {
  const { data, error } = await supabase
    .from('shops')
    .select(
      `
      id,
      owner_id,
      business_name,
      status,
      created_at
    `,
    )
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw error

  const shops = (data || []) as AdminShopRecord[]
  const ownerIds = [...new Set(shops.map((shop) => shop.owner_id).filter(Boolean))]
  const ownerProfiles = await fetchProfilesByIds(ownerIds)

  return shops.map((shop) => ({
    ...shop,
    ownerProfile: ownerProfiles.get(shop.owner_id) || null,
  }))
}

const fetchAdminPendingRiders = async (limit: number) => {
  const { data, error } = await supabase
    .from('Rider_Registration')
    .select(
      `
      rider_id,
      status,
      application_date,
      first_name,
      last_name,
      email,
      profiles:profile_id (
        id,
        email,
        first_name,
        last_name,
        phone,
        avatar_url,
        role
      )
    `,
    )
    .eq('status', 'pending')
    .order('application_date', { ascending: false })
    .limit(limit)

  if (error) throw error

  return (data || []) as AdminRiderRecord[]
}

export const setAdminShopStatus = async (shopId: string, status: AdminShopStatus) => {
  const { error } = await supabase
    .from('shops')
    .update({
      status,
      updated_at: new Date().toISOString(),
    })
    .eq('id', shopId)

  if (error) throw error
}

export const setAdminRiderStatus = async (
  riderId: string | number,
  status: AdminRiderStatus,
) => {
  const { error } = await supabase
    .from('Rider_Registration')
    .update({
      status,
      updated_at: new Date().toISOString(),
    })
    .eq('rider_id', riderId)

  if (error) throw error
}

export const getAdminStoragePublicUrl = (path: string | null | undefined, bucket: string) => {
  if (!path) return null

  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from(bucket).getPublicUrl(path)

  return publicUrl
}

export const getAdminDisplayName = (profile: AdminProfile | null | undefined) => {
  if (!profile) return 'Admin user'

  const fullName = [profile.first_name, profile.last_name].filter(Boolean).join(' ').trim()
  return fullName || profile.email || 'Admin user'
}

export const getShopOwnerName = (shop: AdminShopRecord) =>
  getAdminDisplayName(shop.ownerProfile) || shop.owner_id

export const getShopOwnerEmail = (shop: AdminShopRecord) =>
  shop.ownerProfile?.email || 'Not available'

export const getShopOwnerPhone = (shop: AdminShopRecord) =>
  shop.ownerProfile?.phone || 'Not available'

export const getShopAddress = (shop: AdminShopRecord) => {
  const parts = [
    shop.house_no,
    shop.building,
    shop.street,
    shop.barangay,
    shop.city,
    shop.province,
    shop.postal,
  ].filter(Boolean)

  if (parts.length > 0) {
    return parts.join(', ')
  }

  return shop.detected_address || 'No address provided'
}

export const getShopIdStatus = (shop: AdminShopRecord) => {
  const hasFrontId = !!shop.valid_id_front
  const hasBackId = !!shop.valid_id_back

  if (!hasFrontId && !hasBackId) {
    return {
      color: 'error',
      text: 'No IDs uploaded',
      icon: 'mdi-alert-circle-outline',
      description: 'Both valid ID images are missing.',
      canApprove: false,
    }
  }

  if (!hasFrontId || !hasBackId) {
    return {
      color: 'warning',
      text: 'Incomplete IDs',
      icon: 'mdi-alert-outline',
      description: 'One side of the valid ID is still missing.',
      canApprove: false,
    }
  }

  return {
    color: 'success',
    text: 'IDs complete',
    icon: 'mdi-check-decagram',
    description: 'Both valid ID images are available.',
    canApprove: true,
  }
}

export const getRiderDocumentStatus = (rider: AdminRiderRecord) => {
  const documents = {
    validId: !!rider.valid_id_url,
    driversLicense: !!rider.drivers_license_url,
    orCr: !!rider.or_cr_url,
  }

  const missingDocuments = []

  if (!documents.validId) missingDocuments.push('Valid ID')
  if (!documents.driversLicense) missingDocuments.push("Driver's License")
  if (!documents.orCr) missingDocuments.push('OR/CR')

  if (missingDocuments.length === 0) {
    return {
      color: 'success',
      text: 'Docs complete',
      icon: 'mdi-check-decagram',
      description: 'All required rider documents are present.',
      canApprove: true,
    }
  }

  return {
    color: 'warning',
    text: `${missingDocuments.length} missing`,
    icon: 'mdi-alert-outline',
    description: `Missing: ${missingDocuments.join(', ')}`,
    canApprove: true,
  }
}

export const getRiderFullName = (rider: AdminRiderRecord) => {
  const profile = rider.profiles
  const profileName = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ').trim()
  const fallbackName = [rider.first_name, rider.last_name].filter(Boolean).join(' ').trim()

  return profileName || fallbackName || rider.email || 'Rider'
}

const buildAdminShopApprovalAlert = (shop: AdminShopRecord): AdminApprovalAlert => ({
  id: `shop:${shop.id}`,
  entityType: 'shop',
  entityId: shop.id,
  title: 'New shop approval request',
  message: `${shop.business_name || 'Unnamed shop'} by ${getShopOwnerName(shop)} is waiting for review.`,
  createdAt: shop.created_at || null,
})

const buildAdminRiderApprovalAlert = (rider: AdminRiderRecord): AdminApprovalAlert => ({
  id: `rider:${String(rider.rider_id)}`,
  entityType: 'rider',
  entityId: String(rider.rider_id),
  title: 'New rider registration',
  message: `${getRiderFullName(rider)} is waiting for approval.`,
  createdAt: (rider.application_date as string | null | undefined) || null,
})

const sortAdminApprovalAlerts = (alerts: AdminApprovalAlert[]) =>
  [...alerts].sort((left, right) => {
    const leftTime = left.createdAt ? new Date(left.createdAt).getTime() : 0
    const rightTime = right.createdAt ? new Date(right.createdAt).getTime() : 0
    return rightTime - leftTime
  })

export const fetchAdminApprovalNotificationSnapshot = async (
  limit = 8,
): Promise<AdminApprovalNotificationSnapshot> => {
  const perTypeLimit = Math.max(4, Math.ceil(limit / 2))

  const [pendingShopApprovals, pendingRiderApprovals, pendingShops, pendingRiders] =
    await Promise.all([
      countRows('shops', (query) => query.eq('status', 'pending')),
      countRows('Rider_Registration', (query) => query.eq('status', 'pending')),
      fetchAdminPendingShops(perTypeLimit),
      fetchAdminPendingRiders(perTypeLimit),
    ])

  const alerts = sortAdminApprovalAlerts([
    ...pendingShops.map(buildAdminShopApprovalAlert),
    ...pendingRiders.map(buildAdminRiderApprovalAlert),
  ]).slice(0, limit)

  return {
    pendingShopApprovals,
    pendingRiderApprovals,
    alerts,
  }
}

export const formatAdminDate = (value: string | null | undefined) => {
  if (!value) return 'N/A'

  return new Date(value).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

export const formatAdminDateTime = (value: string | null | undefined) => {
  if (!value) return 'N/A'

  return new Date(value).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export const formatAdminCurrency = (value: number) =>
  new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(Number(value || 0))

export const formatAdminCompactNumber = (value: number) =>
  new Intl.NumberFormat('en-PH', {
    notation: value >= 1000 ? 'compact' : 'standard',
    maximumFractionDigits: value >= 1000 ? 1 : 0,
  }).format(Number(value || 0))
