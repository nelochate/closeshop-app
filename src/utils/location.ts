import { Geolocation } from '@capacitor/geolocation'

export type LocationRelation = string | { code?: string; name?: string | null } | null

export interface LocationOption {
  code: string
  name: string
  province?: LocationRelation
  region?: LocationRelation
}

export interface ResolvedLocationResult {
  city: string | null
  province: string | null
  cityCode: string | null
  provinceCode: string | null
  isIndependentCity: boolean
  query: string | null
  feature: any | null
  center: [number, number] | null
  bounds: [number, number, number, number] | null
}

export interface ShopAddressComponents {
  houseNo: string
  building: string
  street: string
  postal: string
  barangay: string
  city: string
  province: string
  region: string
}

export interface ResolvedCoordinateAddress {
  displayName: string | null
  components: ShopAddressComponents
  resolved: ResolvedLocationResult
}

export interface PositionLike {
  coords: {
    latitude: number
    longitude: number
    accuracy?: number | null
  }
}

const ARCGIS_CITY_BOUNDARY_LAYER_URL =
  'https://services.arcgis.com/yP8JAHhUybB6y4EL/ArcGIS/rest/services/Philippines_City_Municipality_Administrative_Boundary/FeatureServer/0'

const boundaryQueryCache = new Map<string, any[]>()
const resolvedLocationCache = new Map<string, ResolvedLocationResult>()
const resolvedAddressCache = new Map<string, ResolvedCoordinateAddress>()

export const parseCoordinate = (value: unknown): number | null => {
  if (value == null || value === '') return null
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

export const validateCoordinates = (lat: number, lng: number): boolean => {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false
  if (lat === 0 && lng === 0) return false
  if (lat < -90 || lat > 90) return false
  if (lng < -180 || lng > 180) return false
  return true
}

export const buildLocationQuery = (
  city?: string | null,
  province?: string | null,
): string | null => {
  const parts = [city, province, 'Philippines'].filter(Boolean)
  return parts.length ? parts.join(', ') : null
}

export const normalizeLocationName = (name: string | null | undefined) => {
  if (!name) return ''

  return name
    .toLowerCase()
    .replace(/[()]/g, ' ')
    .replace(/\b(city|municipality|municipal|town|province|district|region)\s+of\b/g, '')
    .replace(/\b(city|municipality|municipal|town|province|district|region|barangay|brgy\.?)\b/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export const locationNamesMatch = (left: string | null | undefined, right: string | null | undefined) => {
  const normalizedLeft = normalizeLocationName(left)
  const normalizedRight = normalizeLocationName(right)

  if (!normalizedLeft || !normalizedRight) return false

  return normalizedLeft === normalizedRight
}

export const findMatchingLocationOption = (
  options: LocationOption[],
  value: string | null | undefined,
) => {
  if (!value) return null

  const normalizedValue = normalizeLocationName(value)
  if (!normalizedValue) return null

  return (
    options.find((option) => locationNamesMatch(option.name, value)) ||
    options.find((option) => {
      const normalizedOption = normalizeLocationName(option.name)
      return (
        Boolean(normalizedOption) &&
        (normalizedOption.includes(normalizedValue) || normalizedValue.includes(normalizedOption))
      )
    }) ||
    null
  )
}

export const readHierarchyRelationName = (
  relation: LocationOption['province'] | LocationOption['region'],
) => {
  if (typeof relation === 'string') return relation
  if (relation && typeof relation === 'object' && typeof relation.name === 'string') {
    return relation.name
  }
  return null
}

export const sanitizeLocationOptions = (data: unknown): LocationOption[] => {
  if (!Array.isArray(data)) return []

  return data.filter((item): item is LocationOption => {
    return typeof item?.code === 'string' && typeof item?.name === 'string'
  })
}

export const sortLocationOptions = (items: LocationOption[]) =>
  [...items].sort((left, right) => left.name.localeCompare(right.name))

export const mergeLocationOptions = (...groups: LocationOption[][]) => {
  const merged = new Map<string, LocationOption>()

  for (const group of groups) {
    for (const item of group) {
      const key = item.code || normalizeLocationName(item.name)
      if (!key || merged.has(key)) continue
      merged.set(key, item)
    }
  }

  return sortLocationOptions(Array.from(merged.values()))
}

const escapeArcGisSql = (value: string) => value.replace(/'/g, "''")

const getExactLocationVariants = (name: string | null | undefined) => {
  if (!name) return []

  const trimmed = name.trim()
  if (!trimmed) return []

  const variants = new Set<string>([trimmed])
  const lower = trimmed.toLowerCase()

  if (lower.endsWith(' city')) {
    const base = trimmed.slice(0, -5).trim()
    if (base) {
      variants.add(base)
      variants.add(`City of ${base}`)
    }
  }

  if (lower.startsWith('city of ')) {
    const base = trimmed.slice(8).trim()
    if (base) {
      variants.add(base)
      variants.add(`${base} City`)
    }
  }

  if (lower.endsWith(' municipality')) {
    const base = trimmed.slice(0, -13).trim()
    if (base) {
      variants.add(base)
      variants.add(`Municipality of ${base}`)
    }
  }

  if (lower.startsWith('municipality of ')) {
    const base = trimmed.slice(16).trim()
    if (base) {
      variants.add(base)
      variants.add(`${base} Municipality`)
    }
  }

  return Array.from(variants)
}

const buildArcGisEqualsClause = (field: string, values: string[]) => {
  const exactValues = [...new Set(values.map((value) => value.trim()).filter(Boolean))]
  if (!exactValues.length) return '1=0'

  return `UPPER(${field}) IN (${exactValues
    .map((value) => `'${escapeArcGisSql(value.toUpperCase())}'`)
    .join(', ')})`
}

export const isIndependentCityClass = (cityClass: string | null | undefined) => {
  if (!cityClass) return false
  const normalized = cityClass.toLowerCase()
  return normalized.includes('highly urbanized') || normalized.includes('independent')
}

export const getFeatureAttributes = (feature: any) => feature?.properties || feature?.attributes || {}

const getFeatureCityLabels = (feature: any): string[] =>
  [
    getFeatureAttributes(feature).CITYMUN,
    getFeatureAttributes(feature).OLD_NAME,
    getFeatureAttributes(feature).SUBMUNI,
  ].filter((label): label is string => typeof label === 'string' && Boolean(label.trim()))

const getFeatureProvinceLabel = (feature: any): string | null => {
  const province = getFeatureAttributes(feature).PROVINCE
  return typeof province === 'string' ? province : null
}

const appendCoordinateBounds = (
  bounds: { minLng: number; minLat: number; maxLng: number; maxLat: number },
  coordinates: any,
) => {
  if (!Array.isArray(coordinates)) return

  if (
    coordinates.length >= 2 &&
    typeof coordinates[0] === 'number' &&
    typeof coordinates[1] === 'number'
  ) {
    const [lng, lat] = coordinates as [number, number]
    bounds.minLng = Math.min(bounds.minLng, lng)
    bounds.minLat = Math.min(bounds.minLat, lat)
    bounds.maxLng = Math.max(bounds.maxLng, lng)
    bounds.maxLat = Math.max(bounds.maxLat, lat)
    return
  }

  coordinates.forEach((entry: any) => appendCoordinateBounds(bounds, entry))
}

export const getGeoJsonBounds = (
  geojson: any,
): [number, number, number, number] | null => {
  const bounds = {
    minLng: Infinity,
    minLat: Infinity,
    maxLng: -Infinity,
    maxLat: -Infinity,
  }

  const visitFeature = (feature: any) => {
    if (!feature?.geometry) return
    appendCoordinateBounds(bounds, feature.geometry.coordinates)
  }

  if (geojson?.type === 'FeatureCollection' && Array.isArray(geojson.features)) {
    geojson.features.forEach(visitFeature)
  } else if (geojson?.type === 'Feature') {
    visitFeature(geojson)
  } else if (geojson?.coordinates) {
    appendCoordinateBounds(bounds, geojson.coordinates)
  }

  if (!Number.isFinite(bounds.minLng) || !Number.isFinite(bounds.minLat)) return null
  return [bounds.minLng, bounds.minLat, bounds.maxLng, bounds.maxLat]
}

export const getBoundsCenter = (
  bounds: [number, number, number, number] | null,
): [number, number] | null => {
  if (!bounds) return null
  const [minLng, minLat, maxLng, maxLat] = bounds
  return [(minLat + maxLat) / 2, (minLng + maxLng) / 2]
}

const createCircularBoundary = (lat: number, lng: number, radiusKm: number = 5) => {
  const points = 40
  const coordinates: [number, number][] = []

  for (let index = 0; index < points; index += 1) {
    const angle = (index * 360) / points
    const bearing = (angle * Math.PI) / 180
    const latRad = (lat * Math.PI) / 180
    const lngRad = (lng * Math.PI) / 180
    const angularDistance = radiusKm / 6371

    const newLat = Math.asin(
      Math.sin(latRad) * Math.cos(angularDistance) +
        Math.cos(latRad) * Math.sin(angularDistance) * Math.cos(bearing),
    )

    const newLng =
      lngRad +
      Math.atan2(
        Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(latRad),
        Math.cos(angularDistance) - Math.sin(latRad) * Math.sin(newLat),
      )

    coordinates.push([(newLng * 180) / Math.PI, (newLat * 180) / Math.PI])
  }

  coordinates.push(coordinates[0])

  return {
    type: 'Feature',
    properties: {
      name: 'Approximate Area',
      isFallback: true,
    },
    geometry: {
      type: 'Polygon',
      coordinates: [coordinates],
    },
  }
}

const buildFeatureCollection = (features: any[]) => ({
  type: 'FeatureCollection',
  features,
})

const queryArcGisBoundaryLayer = async ({
  where,
  point,
}: {
  where?: string
  point?: [number, number]
}) => {
  const cacheKey = where
    ? `where:${where}`
    : point
      ? `point:${point[0].toFixed(5)},${point[1].toFixed(5)}`
      : null

  if (cacheKey && boundaryQueryCache.has(cacheKey)) {
    return boundaryQueryCache.get(cacheKey) || []
  }

  const params = new URLSearchParams({
    outFields: 'CITYMUN,OLD_NAME,SUBMUNI,PROVINCE,GEOCODE10,GEOCODE_PROV,CITY_CLASS,REGION',
    returnGeometry: 'true',
    outSR: '4326',
    f: 'geojson',
  })

  params.set('where', where || '1=1')

  if (point) {
    params.set(
      'geometry',
      JSON.stringify({
        x: point[1],
        y: point[0],
        spatialReference: { wkid: 4326 },
      }),
    )
    params.set('geometryType', 'esriGeometryPoint')
    params.set('spatialRel', 'esriSpatialRelIntersects')
    params.set('inSR', '4326')
  }

  const response = await fetch(`${ARCGIS_CITY_BOUNDARY_LAYER_URL}/query?${params.toString()}`)
  if (!response.ok) {
    throw new Error(`ArcGIS boundary query failed: ${response.status}`)
  }

  const data = await response.json()
  const features = Array.isArray(data?.features) ? data.features : []

  if (cacheKey) {
    boundaryQueryCache.set(cacheKey, features)
  }

  return features
}

const scoreArcGisBoundaryFeature = (
  feature: any,
  options: {
    cityName?: string | null
    provinceName?: string | null
    cityCode?: string | null
    provinceCode?: string | null
  },
) => {
  const attributes = getFeatureAttributes(feature)
  const cityLabels = getFeatureCityLabels(feature)
  const provinceLabel = getFeatureProvinceLabel(feature)
  const cityClass = typeof attributes.CITY_CLASS === 'string' ? attributes.CITY_CLASS : null
  const independentCity = isIndependentCityClass(cityClass)

  let score = 0

  if (options.cityCode && attributes.GEOCODE10 === options.cityCode) {
    score += 180
  }

  if (options.provinceCode && attributes.GEOCODE_PROV === options.provinceCode) {
    score += 80
  }

  if (options.cityName) {
    const cityMatches = cityLabels.some((label) => locationNamesMatch(label, options.cityName))
    if (!cityMatches) return Number.NEGATIVE_INFINITY
    score += 220

    if (cityLabels.some((label) => label === options.cityName)) {
      score += 25
    }

    if (options.provinceName) {
      const provinceMatches = locationNamesMatch(provinceLabel, options.provinceName)
      if (!provinceMatches && !independentCity) {
        return Number.NEGATIVE_INFINITY
      }
      if (provinceMatches) score += 35
      if (!provinceMatches && independentCity) score += 15
    }
  } else if (options.provinceName) {
    if (!locationNamesMatch(provinceLabel, options.provinceName)) {
      return Number.NEGATIVE_INFINITY
    }
    score += 180
  }

  return score
}

const pickBestArcGisFeature = (
  features: any[],
  options: {
    cityName?: string | null
    provinceName?: string | null
    cityCode?: string | null
    provinceCode?: string | null
  },
) => {
  const scored = features
    .map((feature) => ({
      feature,
      score: scoreArcGisBoundaryFeature(feature, options),
    }))
    .filter((entry) => entry.score > Number.NEGATIVE_INFINITY)
    .sort((left, right) => right.score - left.score)

  return scored[0]?.feature || null
}

export const fetchBoundaryData = async ({
  cityName,
  provinceName,
  cityCode,
  provinceCode,
  fallbackCenter,
}: {
  cityName?: string | null
  provinceName?: string | null
  cityCode?: string | null
  provinceCode?: string | null
  fallbackCenter?: [number, number] | null
}) => {
  if (cityName) {
    const cityVariants = getExactLocationVariants(cityName)
    const where = [
      buildArcGisEqualsClause('CITYMUN', cityVariants),
      buildArcGisEqualsClause('OLD_NAME', cityVariants),
      buildArcGisEqualsClause('SUBMUNI', cityVariants),
    ].join(' OR ')

    const features = await queryArcGisBoundaryLayer({ where: `(${where})` })
    const feature = pickBestArcGisFeature(features, {
      cityName,
      provinceName,
      cityCode,
      provinceCode,
    })

    if (feature) return feature
  }

  if (provinceName || provinceCode) {
    const provinceWhereParts: string[] = []
    if (provinceCode) {
      provinceWhereParts.push(buildArcGisEqualsClause('GEOCODE_PROV', [provinceCode]))
    }
    if (provinceName) {
      provinceWhereParts.push(buildArcGisEqualsClause('PROVINCE', [provinceName]))
    }

    const features = await queryArcGisBoundaryLayer({
      where: provinceWhereParts.length ? provinceWhereParts.join(' OR ') : '1=0',
    })

    const provinceFeatures = features.filter((feature: any) => {
      const attributes = getFeatureAttributes(feature)
      if (provinceCode && attributes.GEOCODE_PROV === provinceCode) return true
      if (provinceName && locationNamesMatch(attributes.PROVINCE, provinceName)) return true
      return false
    })

    if (provinceFeatures.length) {
      return buildFeatureCollection(provinceFeatures)
    }
  }

  if (fallbackCenter) {
    return createCircularBoundary(fallbackCenter[0], fallbackCenter[1])
  }

  return null
}

const createFallbackResolvedLocationResult = (
  lat: number,
  lng: number,
): ResolvedLocationResult => ({
  city: null,
  province: null,
  cityCode: null,
  provinceCode: null,
  isIndependentCity: false,
  query: null,
  feature: null,
  center: [lat, lng],
  bounds: [lng, lat, lng, lat],
})

const createResolvedLocationResult = (
  feature: any | null,
  fallbackCenter: [number, number] | null,
): ResolvedLocationResult => {
  if (!feature) {
    return {
      city: null,
      province: null,
      cityCode: null,
      provinceCode: null,
      isIndependentCity: false,
      query: null,
      feature: null,
      center: fallbackCenter,
      bounds: fallbackCenter
        ? [fallbackCenter[1], fallbackCenter[0], fallbackCenter[1], fallbackCenter[0]]
        : null,
    }
  }

  const attributes = getFeatureAttributes(feature)
  const city =
    getFeatureCityLabels(feature).find((label) => typeof label === 'string' && Boolean(label)) ||
    null
  const province = getFeatureProvinceLabel(feature)
  const bounds = getGeoJsonBounds(feature)
  const center = getBoundsCenter(bounds) || fallbackCenter

  return {
    city,
    province,
    cityCode: typeof attributes.GEOCODE10 === 'string' ? attributes.GEOCODE10 : null,
    provinceCode: typeof attributes.GEOCODE_PROV === 'string' ? attributes.GEOCODE_PROV : null,
    isIndependentCity: isIndependentCityClass(attributes.CITY_CLASS),
    query: buildLocationQuery(city, province),
    feature,
    center,
    bounds,
  }
}

export const resolveLocationFromCoordinates = async (
  lat: number,
  lng: number,
): Promise<ResolvedLocationResult> => {
  const cacheKey = `${lat.toFixed(5)},${lng.toFixed(5)}`
  if (resolvedLocationCache.has(cacheKey)) {
    return resolvedLocationCache.get(cacheKey)!
  }

  try {
    const features = await queryArcGisBoundaryLayer({ point: [lat, lng] })
    const feature = features[0] || null
    const result = createResolvedLocationResult(feature, [lat, lng])
    resolvedLocationCache.set(cacheKey, result)
    return result
  } catch (error) {
    console.warn('ArcGIS point-in-polygon lookup failed:', error)
    const fallbackResult = createFallbackResolvedLocationResult(lat, lng)
    resolvedLocationCache.set(cacheKey, fallbackResult)
    return fallbackResult
  }
}

export const extractShopAddressComponents = (
  addressData: any,
  resolved?: Partial<ResolvedLocationResult>,
): ShopAddressComponents => ({
  houseNo: addressData?.house_number || '',
  building:
    addressData?.building ||
    addressData?.amenity ||
    addressData?.shop ||
    addressData?.office ||
    addressData?.tourism ||
    '',
  street:
    addressData?.road ||
    addressData?.street ||
    addressData?.residential ||
    addressData?.pedestrian ||
    '',
  postal: addressData?.postcode || '',
  barangay:
    addressData?.quarter ||
    addressData?.suburb ||
    addressData?.village ||
    addressData?.neighbourhood ||
    addressData?.hamlet ||
    '',
  city:
    resolved?.city ||
    addressData?.city ||
    addressData?.town ||
    addressData?.municipality ||
    addressData?.city_district ||
    '',
  province:
    resolved?.province ||
    addressData?.province ||
    addressData?.state_district ||
    addressData?.county ||
    '',
  region: addressData?.region || addressData?.state || '',
})

const uniqueAddressSegments = (segments: Array<string | null | undefined>) => {
  const seen = new Set<string>()
  return segments.filter((segment): segment is string => {
    if (!segment) return false
    const trimmed = segment.trim()
    if (!trimmed) return false

    const key = normalizeLocationName(trimmed) || trimmed.toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export const formatShopAddress = (
  components: Partial<ShopAddressComponents>,
  fallback: string | null = null,
) => {
  const parts = uniqueAddressSegments([
    components.houseNo,
    components.building,
    components.street,
    components.barangay,
    components.city,
    components.province,
    components.postal,
    components.region,
  ])

  return parts.join(', ') || fallback || ''
}

const fetchReverseGeocodeResult = async (lat: number, lng: number) => {
  const response = await fetch(
    `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`,
    {
      headers: {
        'Accept-Language': 'en',
      },
    },
  )

  if (!response.ok) {
    throw new Error(`Reverse geocode failed: ${response.status}`)
  }

  return response.json()
}

export const resolveCoordinateAddress = async (
  lat: number,
  lng: number,
): Promise<ResolvedCoordinateAddress> => {
  const cacheKey = `${lat.toFixed(5)},${lng.toFixed(5)}`
  if (resolvedAddressCache.has(cacheKey)) {
    return resolvedAddressCache.get(cacheKey)!
  }

  const [locationResult, reverseResult] = await Promise.allSettled([
    resolveLocationFromCoordinates(lat, lng),
    fetchReverseGeocodeResult(lat, lng),
  ])

  const resolved =
    locationResult.status === 'fulfilled'
      ? locationResult.value
      : createFallbackResolvedLocationResult(lat, lng)

  const reverseData = reverseResult.status === 'fulfilled' ? reverseResult.value : null
  const components = extractShopAddressComponents(reverseData?.address, resolved)
  const displayName = formatShopAddress(
    components,
    reverseData?.display_name || resolved.query || null,
  )

  const result: ResolvedCoordinateAddress = {
    displayName: displayName || null,
    components,
    resolved,
  }

  resolvedAddressCache.set(cacheKey, result)
  return result
}

const getPositionAccuracy = (position: PositionLike | null) =>
  position?.coords.accuracy ?? Number.POSITIVE_INFINITY

const sampleBrowserPrecisePosition = async (
  durationMs = 7000,
): Promise<PositionLike | null> => {
  if (typeof navigator === 'undefined' || !navigator.geolocation) return null

  return new Promise((resolve) => {
    let bestPosition: PositionLike | null = null
    let watchId: number | null = null
    let timeoutId: number | null = null
    let settled = false

    const finish = () => {
      if (settled) return
      settled = true

      if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId)
      }

      if (timeoutId !== null) {
        window.clearTimeout(timeoutId)
      }

      resolve(bestPosition)
    }

    watchId = navigator.geolocation.watchPosition(
      (position) => {
        if (!bestPosition || getPositionAccuracy(position) < getPositionAccuracy(bestPosition)) {
          bestPosition = position
        }

        if (getPositionAccuracy(position) <= 25) {
          finish()
        }
      },
      () => finish(),
      {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: Math.min(durationMs, 5000),
      },
    )

    timeoutId = window.setTimeout(finish, durationMs)
  })
}

export const ensureLocationPermission = async () => {
  try {
    const permissions = await Geolocation.checkPermissions()
    if (permissions.location === 'granted' || permissions.coarseLocation === 'granted') {
      return
    }

    const requested = await Geolocation.requestPermissions()
    if (requested.location !== 'granted' && requested.coarseLocation !== 'granted') {
      throw new Error('Location permission denied')
    }
  } catch (error) {
    if (typeof navigator !== 'undefined' && navigator.geolocation) {
      return
    }

    throw error instanceof Error ? error : new Error('Location permission denied')
  }
}

export const getPreciseCurrentPosition = async () => {
  const attempts = [
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    { enableHighAccuracy: false, timeout: 7000, maximumAge: 30000 },
  ]

  let bestPosition: PositionLike | null = null
  let lastError: unknown = null

  for (const options of attempts) {
    try {
      const position = await Geolocation.getCurrentPosition(options)
      const accuracy = getPositionAccuracy(position)

      if (!bestPosition || accuracy < getPositionAccuracy(bestPosition)) {
        bestPosition = position
      }

      if (accuracy <= 30) {
        break
      }
    } catch (error) {
      lastError = error
    }
  }

  const browserPosition = await sampleBrowserPrecisePosition()
  if (
    browserPosition &&
    (!bestPosition || getPositionAccuracy(browserPosition) < getPositionAccuracy(bestPosition))
  ) {
    bestPosition = browserPosition
  }

  if (!bestPosition) {
    throw lastError || new Error('Unable to detect your location')
  }

  return bestPosition
}
