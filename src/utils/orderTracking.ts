import { supabase } from '@/utils/supabase'
import { withSchemaColumnFallback } from '@/utils/supabaseSchema'

export const MAPBOX_ACCESS_TOKEN =
  import.meta.env.VITE_MAPBOX_ACCESS_TOKEN ||
  'pk.eyJ1IjoiY2xvc2VzaG9wIiwiYSI6ImNtaDI2emxocjEwdnVqMHExenFpam42bjcifQ.QDsWVOHM9JPhPQ---Ca4MA'

export const ORDER_TRACKING_CHANNEL_PREFIX = 'order-tracking'

export type TrackingViewerMode = 'customer' | 'seller' | 'rider'

export interface TrackingCoordinates {
  lat: number
  lng: number
  updatedAt?: string | null
  name?: string
  address?: string
}

export interface TrackingLocation extends TrackingCoordinates {
  name: string
  address?: string
}

type RecordLike = Record<string, any> | null | undefined

let cachedTrackingPersistenceColumns: string[] | null = null

const riderCoordinateKeyPairs = [
  ['rider_latitude', 'rider_longitude'],
  ['rider_lat', 'rider_lng'],
  ['rider_lat', 'rider_long'],
  ['current_rider_latitude', 'current_rider_longitude'],
  ['current_rider_lat', 'current_rider_lng'],
  ['delivery_rider_latitude', 'delivery_rider_longitude'],
  ['delivery_rider_lat', 'delivery_rider_lng'],
  ['live_latitude', 'live_longitude'],
  ['live_lat', 'live_lng'],
  ['current_latitude', 'current_longitude'],
  ['current_lat', 'current_lng'],
]

export const getTrackingChannelName = (orderId: string) =>
  `${ORDER_TRACKING_CHANNEL_PREFIX}:${orderId}`

export const toCoordinate = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null

  const parsed = typeof value === 'number' ? value : Number(value)

  if (!Number.isFinite(parsed)) return null

  return parsed
}

export const hasValidCoordinates = (lat: unknown, lng: unknown) => {
  const parsedLat = toCoordinate(lat)
  const parsedLng = toCoordinate(lng)

  if (parsedLat === null || parsedLng === null) return false

  return parsedLat >= -90 && parsedLat <= 90 && parsedLng >= -180 && parsedLng <= 180
}

export const buildShopAddress = (shop: RecordLike) =>
  [
    shop?.house_no,
    shop?.building,
    shop?.street,
    shop?.barangay,
    shop?.city,
    shop?.province,
    shop?.postal,
  ]
    .filter(Boolean)
    .join(', ') || shop?.detected_address || 'Shop address unavailable'

export const buildDeliveryAddress = (address: RecordLike) =>
  [
    address?.house_no,
    address?.building,
    address?.street,
    address?.purok,
    address?.barangay_name,
    address?.city_name,
    address?.province_name,
    address?.postal_code,
  ]
    .filter(Boolean)
    .join(', ') || 'Delivery address unavailable'

const parseCoordinateRecord = (value: unknown): TrackingCoordinates | null => {
  if (!value) return null

  if (typeof value === 'string') {
    try {
      return parseCoordinateRecord(JSON.parse(value))
    } catch {
      return null
    }
  }

  if (Array.isArray(value) && value.length >= 2) {
    const lng = toCoordinate(value[0])
    const lat = toCoordinate(value[1])

    if (hasValidCoordinates(lat, lng)) {
      return {
        lat: Number(lat),
        lng: Number(lng),
      }
    }

    return null
  }

  if (typeof value !== 'object') return null

  const record = value as Record<string, unknown>
  const lat =
    toCoordinate(record.lat) ??
    toCoordinate(record.latitude) ??
    toCoordinate(record.current_latitude) ??
    toCoordinate(record.current_lat)
  const lng =
    toCoordinate(record.lng) ??
    toCoordinate(record.lon) ??
    toCoordinate(record.long) ??
    toCoordinate(record.longitude) ??
    toCoordinate(record.current_longitude) ??
    toCoordinate(record.current_lng)

  if (!hasValidCoordinates(lat, lng)) return null

  return {
    lat: Number(lat),
    lng: Number(lng),
    name: typeof record.name === 'string' ? record.name : undefined,
    address: typeof record.address === 'string' ? record.address : undefined,
    updatedAt:
      (record.updatedAt as string | undefined) ||
      (record.updated_at as string | undefined) ||
      (record.timestamp as string | undefined) ||
      null,
  }
}

export const extractPersistedRiderCoordinates = (order: RecordLike): TrackingCoordinates | null => {
  if (!order) return null

  for (const [latKey, lngKey] of riderCoordinateKeyPairs) {
    if (hasValidCoordinates(order[latKey], order[lngKey])) {
      return {
        lat: Number(toCoordinate(order[latKey])),
        lng: Number(toCoordinate(order[lngKey])),
        updatedAt:
          order.rider_location_updated_at ||
          order.rider_updated_at ||
          order.live_location_updated_at ||
          null,
      }
    }
  }

  const nestedCandidates = [
    order.rider_location,
    order.live_location,
    order.current_location,
    order.tracking_location,
    order.delivery_tracking,
  ]

  for (const candidate of nestedCandidates) {
    const parsed = parseCoordinateRecord(candidate)
    if (parsed) return parsed
  }

  return null
}

export const supportsOrderTrackingPersistence = (order: RecordLike) =>
  !!order && Object.prototype.hasOwnProperty.call(order, 'tracking_location')

export const buildRiderTrackingLocation = ({
  lat,
  lng,
  name = 'Assigned rider',
  address = '',
  updatedAt = new Date().toISOString(),
}: {
  lat: unknown
  lng: unknown
  name?: string
  address?: string
  updatedAt?: string | null
}): TrackingLocation | null => {
  if (!hasValidCoordinates(lat, lng)) return null

  return {
    lat: Number(toCoordinate(lat)),
    lng: Number(toCoordinate(lng)),
    name,
    address,
    updatedAt,
  }
}

const buildTrackingPersistencePayload = (location: TrackingLocation) => {
  const snapshot = {
    lat: location.lat,
    lng: location.lng,
    name: location.name,
    address: location.address || null,
    updatedAt: location.updatedAt || new Date().toISOString(),
  }

  return {
    tracking_location: snapshot,
  }
}

export const persistOrderTrackingLocation = async ({
  orderId,
  location,
}: {
  orderId: string
  location: TrackingLocation | null
}) => {
  if (!orderId) {
    return { persisted: false, reason: 'missing-order-id' as const }
  }

  if (!location) {
    return { persisted: false, reason: 'missing-location' as const }
  }

  const basePayload = buildTrackingPersistencePayload(location)
  const payload =
    cachedTrackingPersistenceColumns === null
      ? basePayload
      : Object.fromEntries(
          Object.entries(basePayload).filter(([columnName]) =>
            cachedTrackingPersistenceColumns.includes(columnName),
          ),
        )

  if (!Object.keys(payload).length) {
    return { persisted: false, reason: 'tracking-columns-unavailable' as const }
  }

  const { data, error, appliedPayload } = await withSchemaColumnFallback({
    payload,
    execute: (currentPayload) =>
      supabase.from('orders').update(currentPayload).eq('id', orderId).select('id'),
  })

  if (error) {
    return { persisted: false, error, appliedPayload }
  }

  const appliedColumns = Object.keys(appliedPayload || {})

  if (!appliedColumns.length) {
    cachedTrackingPersistenceColumns = []
    return { persisted: false, reason: 'tracking-columns-unavailable' as const }
  }

  cachedTrackingPersistenceColumns = appliedColumns

  return {
    persisted: true,
    data,
    appliedPayload,
  }
}

export const geocodeAddress = async (query: string): Promise<TrackingCoordinates | null> => {
  if (!query || !MAPBOX_ACCESS_TOKEN) return null

  try {
    const url =
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json` +
      `?country=PH&limit=1&access_token=${MAPBOX_ACCESS_TOKEN}`

    const response = await fetch(url)

    if (!response.ok) {
      throw new Error(`Geocoding failed with status ${response.status}`)
    }

    const data = await response.json()
    const [lng, lat] = data?.features?.[0]?.center ?? []

    if (!hasValidCoordinates(lat, lng)) return null

    return {
      lat: Number(lat),
      lng: Number(lng),
    }
  } catch (error) {
    console.error('Unable to geocode tracking address:', error)
    return null
  }
}

export const resolveTrackingLocation = async ({
  name,
  address,
  lat,
  lng,
  fallbackQuery,
  updatedAt = null,
}: {
  name: string
  address?: string
  lat: unknown
  lng: unknown
  fallbackQuery?: string
  updatedAt?: string | null
}): Promise<TrackingLocation | null> => {
  if (hasValidCoordinates(lat, lng)) {
    return {
      lat: Number(toCoordinate(lat)),
      lng: Number(toCoordinate(lng)),
      name,
      address,
      updatedAt,
    }
  }

  if (!fallbackQuery) return null

  const geocoded = await geocodeAddress(fallbackQuery)
  if (!geocoded) return null

  return {
    ...geocoded,
    name,
    address,
    updatedAt,
  }
}

export const formatTrackingDistance = (meters?: number | null) => {
  if (!meters || Number.isNaN(meters)) return 'Not available'
  if (meters < 1000) return `${Math.round(meters)} m`
  return `${(meters / 1000).toFixed(meters >= 10000 ? 0 : 1)} km`
}

export const formatTrackingDuration = (seconds?: number | null) => {
  if (!seconds || Number.isNaN(seconds)) return 'Not available'

  const totalMinutes = Math.round(seconds / 60)

  if (totalMinutes < 60) return `${totalMinutes} min`

  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60

  if (!minutes) return `${hours} hr`

  return `${hours} hr ${minutes} min`
}

export const formatTrackingTimestamp = (timestamp?: string | null) => {
  if (!timestamp) return 'Awaiting rider location'

  const date = new Date(timestamp)

  if (Number.isNaN(date.getTime())) return 'Awaiting rider location'

  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}
