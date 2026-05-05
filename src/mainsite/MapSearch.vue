<script setup lang="ts">
import { computed, ref, onMounted, watch, onUnmounted, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { useGeolocation } from '@/composables/useGeolocation'
import { Capacitor } from '@capacitor/core'
import { supabase } from '@/utils/supabase'
import BottomNav from '@/common/layout/BottomNav.vue'
import { Geolocation } from '@capacitor/geolocation'
import PullToRefreshWrapper from '@/components/PullToRefreshWrapper.vue'

// Import Mapbox - use dynamic import to avoid SSR issues
let mapboxgl: any = null

/* -------------------- MAPBOX CONFIG -------------------- */
const MAPBOX_ACCESS_TOKEN = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN

/* -------------------- ROUTE OPTIONS INTERFACE -------------------- */
interface RouteOption {
  coords: [number, number][]
  distance: number // in meters
  duration: number // in seconds
  summary: string
  color: string
  type: 'driving' | 'walking' | 'cycling'
}

type AreaScope = 'province' | 'municipality'

type LocationRelation = string | { code?: string; name?: string | null } | null

interface LocationOption {
  code: string
  name: string
  province?: LocationRelation
  region?: LocationRelation
}

interface ResolvedLocationResult {
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

/* -------------------- STATE -------------------- */
const activeTab = ref('map')
const map = ref<any>(null)
const router = useRouter()
const search = ref('')
const shops = ref<any[]>([])
const rawShops = ref<any[]>([])
const loading = ref(false)
const errorMsg = ref<string | null>(null)
const showShopMenu = ref(false)
const shopDisplayMode = ref<'within' | 'outside'>('within')
const userCity = ref<string | null>(null)
const userProvince = ref<string | null>(null)
const currentLocationCity = ref<string | null>(null)
const currentLocationProvince = ref<string | null>(null)
const currentLocationCityCode = ref<string | null>(null)
const currentLocationProvinceCode = ref<string | null>(null)
const activeLocationCenter = ref<[number, number] | null>(null)
const activeLocationBounds = ref<[number, number, number, number] | null>(null)
const activeBoundaryFeature = ref<any | null>(null)
const activeAreaScope = ref<AreaScope | null>(null)
const manualLocationBrowsing = ref(false)
const activeAreaIsIndependentCity = ref(false)
const provinces = ref<LocationOption[]>([])
const citiesMunicipalities = ref<LocationOption[]>([])
const citiesMunicipalitiesCatalog = ref<LocationOption[] | null>(null)
const selectedProvinceCode = ref<string | null>(null)
const selectedProvinceName = ref<string | null>(null)
const selectedCityCode = ref<string | null>(null)
const selectedCityName = ref<string | null>(null)
const provincesLoading = ref(false)
const citiesLoading = ref(false)
const locationNavigationLoading = ref(false)
const showDisplayOptionsMenu = ref(false)
const primaryServiceAreaReminderDismissed = ref(false)
const lastKnownKey = 'closeshop_last_location'
const lastKnown = ref<[number, number] | null>(null)
let lastUpdateTs = 0
const productMatches = ref<any[]>([])
const routeLoading = ref(false)
const filteredShops = ref<any[]>([])
const outsideSearchResults = ref<any[]>([])
const showOutsideSearchResults = ref(true)
const mapInitialized = ref(false)
const isSearchMode = ref(false)
const boundaryLoading = ref(false)
const hasValidLocation = ref(false)
const selectedShopId = ref<string | null>(null)
const showBoundary = ref(true)
const heroPaddingTop = ref('env(safe-area-inset-top)')
const boundaryQueryCache = new Map<string, any[]>()
const reverseGeocodeCache = new Map<string, ResolvedLocationResult>()
const PRIMARY_SERVICE_AREA = {
  cityName: 'Butuan City',
  provinceName: 'Agusan del Norte',
} as const

const ARCGIS_CITY_BOUNDARY_LAYER_URL =
  'https://services.arcgis.com/yP8JAHhUybB6y4EL/ArcGIS/rest/services/Philippines_City_Municipality_Administrative_Boundary/FeatureServer/0'

/* -------------------- ROUTE TYPE SELECTOR -------------------- */
type RouteType = 'driving' | 'walking' | 'cycling'
const selectedRouteType = ref<RouteType>('driving') // Default to driving
const routeOptions = ref<RouteOption[]>([]) // All calculated routes
const showRoutePanel = ref(false) // Control visibility of route panel
const routePanelMinimized = ref(false) // Control minimized state

/* -------------------- ROUTE CONFIG -------------------- */
const routeConfig = {
  driving: {
    label: 'Car',
    icon: 'mdi-car',
    color: '#3b82f6',
    activeColor: '#1d4ed8',
  },
  walking: {
    label: 'Walking',
    icon: 'mdi-walk',
    color: '#10b981',
    activeColor: '#059669',
  },
  cycling: {
    label: 'Cycling',
    icon: 'mdi-bike',
    color: '#f59e0b',
    activeColor: '#d97706',
  },
}

const mapPullIgnoreSelectors =
  '#map, .map-container, .mapboxgl-map, .mapboxgl-canvas-container, .mapboxgl-canvas, .mapboxgl-ctrl, .map-controls-container'

const activeLocationLabel = computed(() => {
  const parts = [userCity.value, userProvince.value].filter(Boolean)
  return parts.join(', ') || null
})

const activeLocationShortLabel = computed(() => userCity.value || userProvince.value || 'your area')

const activeLocationModeLabel = computed(() =>
  manualLocationBrowsing.value ? 'Selected Area' : 'My Area',
)

const shopDrawerContextLabel = computed(() =>
  isSearchMode.value ? 'Search Mode' : activeLocationModeLabel.value,
)

const searchLocationLabel = computed(() => {
  if (activeLocationShortLabel.value && activeLocationShortLabel.value !== 'your area') {
    return activeLocationShortLabel.value
  }

  return 'your area'
})

const searchLocationLabelTitleCase = computed(() =>
  searchLocationLabel.value === 'your area' ? 'Your Area' : searchLocationLabel.value,
)

const shopDrawerTitle = computed(() => (isSearchMode.value ? 'Search Results' : 'Shops & Products'))

const shopDrawerSubtitle = computed(() => {
  if (isSearchMode.value) return 'Shops & Products'
  if (activeLocationLabel.value) return `Browsing ${activeLocationLabel.value}`
  return 'Nearby shops and products'
})

const hasOutsideSearchResults = computed(() => outsideSearchResults.value.length > 0)

const hasLocalSearchResults = computed(() => filteredShops.value.length > 0)

const outsideSearchResultIds = computed(
  () => new Set(outsideSearchResults.value.map((shop) => String(shop.id))),
)

const outsideSearchSectionTitle = computed(
  () => `Available Outside ${searchLocationLabelTitleCase.value}`,
)

const shopDrawerResultSections = computed(() => {
  if (!isSearchMode.value) {
    return filteredShops.value.length
      ? [
          {
            key: 'browse-results',
            title: null,
            subtitle: null,
            shops: filteredShops.value,
            tone: 'default',
          },
        ]
      : []
  }

  if (hasLocalSearchResults.value) {
    return [
      {
        key: 'local-results',
        title:
          searchLocationLabel.value === 'your area'
            ? 'Results In Your Area'
            : `Results In ${searchLocationLabel.value}`,
        subtitle: `${filteredShops.value.length} matching shops or products nearby`,
        shops: filteredShops.value,
        tone: 'local',
      },
    ]
  }

  if (hasOutsideSearchResults.value && showOutsideSearchResults.value) {
    return [
      {
        key: 'outside-results',
        title: outsideSearchSectionTitle.value,
        subtitle: `${outsideSearchResults.value.length} matching shops or products found elsewhere`,
        shops: outsideSearchResults.value,
        tone: 'outside',
      },
    ]
  }

  return []
})

const activeAreaScopeLabel = computed(() => {
  if (activeAreaScope.value === 'province') return 'Province'
  if (activeAreaScope.value === 'municipality') return 'Municipality'
  return 'Area'
})

const distanceDisplayLabel = computed(() =>
  manualLocationBrowsing.value ? 'from selected area' : 'away',
)

const locationOverlayMessage = computed(() =>
  locationNavigationLoading.value ? 'Loading selected area...' : 'Loading area boundary...',
)

const currentLocationLabel = computed(() => {
  const parts = [currentLocationCity.value, currentLocationProvince.value].filter(Boolean)
  return parts.join(', ') || null
})

const canDeterminePrimaryServiceAreaStatus = computed(() => {
  if (currentLocationCity.value) return true

  return (
    Boolean(currentLocationProvince.value) &&
    !locationNamesMatch(currentLocationProvince.value, PRIMARY_SERVICE_AREA.provinceName)
  )
})

const isCurrentLocationInPrimaryServiceArea = computed(() =>
  isPrimaryServiceAreaLocation(currentLocationCity.value, currentLocationProvince.value),
)

const isActiveLocationInPrimaryServiceArea = computed(() =>
  isPrimaryServiceAreaLocation(userCity.value, userProvince.value),
)

const primaryServiceAreaReminderLocationKey = computed(() => {
  const city = normalizeLocationName(currentLocationCity.value)
  const province = normalizeLocationName(currentLocationProvince.value)

  if (!city && !province) return null

  return [province, city].filter(Boolean).join('::')
})

const showPrimaryServiceAreaReminder = computed(() => {
  if (showShopMenu.value) return false
  if (primaryServiceAreaReminderDismissed.value) return false
  if (!canDeterminePrimaryServiceAreaStatus.value) return false
  if (isCurrentLocationInPrimaryServiceArea.value) return false
  return !isActiveLocationInPrimaryServiceArea.value
})

/* -------------------- PULL TO REFRESH HANDLER -------------------- */
const handleRefresh = async () => {
  console.log('🔄 Pull-to-refresh triggered - Refreshing map data...')

  try {
    // Clear any existing errors
    errorMsg.value = null

    // Refresh shops data
    await doFetchShops()

    if (showBoundary.value && activeBoundaryFeature.value) {
      applyBoundaryVisibility()
    } else if (!showBoundary.value) {
      clearCityBoundary()
    }

    // Refresh route if there's a selected shop
    if (selectedShopId.value) {
      const shop = shops.value.find((s) => s.id === selectedShopId.value)
      if (shop && shop.latitude && shop.longitude) {
        await focusOnShopMarker(selectedShopId.value)
      }
    }

    console.log('✅ Map page refresh complete!')
  } catch (error) {
    console.error('❌ Refresh failed:', error)
    errorMsg.value = 'Failed to refresh data'
  }
}

const handleResumeRecovery = async () => {
  console.log('📱 App resumed on map view - restoring map responsiveness...')

  try {
    await nextTick()

    if (!map.value) {
      await initializeMap()
    }

    window.setTimeout(() => {
      map.value?.resize()
    }, 60)

    window.setTimeout(() => {
      map.value?.resize()
    }, 240)
  } catch (error) {
    console.warn('Map resume recovery failed:', error)
  }
}

/* -------------------- GEOLOCATION -------------------- */
const { latitude, longitude, requestPermission, startWatching, stopWatching } = useGeolocation()
let shopMarkers: any[] = []
let cityBoundarySourceId: string | null = null
const locating = ref(false)
let fetchTimeout: number | null = null

/* -------------------- MAP INITIALIZATION -------------------- */
const initializeMap = async (): Promise<void> => {
  try {
    // Dynamically import mapbox-gl to avoid SSR issues
    if (typeof window !== 'undefined') {
      const mapboxModule = await import('mapbox-gl')
      mapboxgl = mapboxModule.default
      mapboxgl.accessToken = MAPBOX_ACCESS_TOKEN
    }

    if (map.value) {
      try {
        map.value.remove()
      } catch (e) {
        console.warn('Error removing existing map:', e)
      }
      map.value = null
    }

    await nextTick()

    const mapContainer = document.getElementById('map')
    if (!mapContainer) {
      console.error('Map container not found')
      return
    }

    // Clear container
    mapContainer.innerHTML = ''

    // Load cached location
    loadCachedLocation()
    const initialCenter = lastKnown.value ?? [8.95, 125.53]

    // Create map
    map.value = new mapboxgl.Map({
      container: 'map',
      style: 'mapbox://styles/mapbox/streets-v12',
      center: [initialCenter[1], initialCenter[0]], // Mapbox uses [lng, lat]
      zoom: 13,
      attributionControl: false,
      interactive: true,
      pitchWithRotate: false,
      dragRotate: false,
      touchZoomRotate: true,
      maxZoom: 19,
      minZoom: 3,
    })

    // Add navigation control
    map.value.addControl(
      new mapboxgl.NavigationControl({
        showCompass: false,
        showZoom: true,
        visualizePitch: false,
      }),
      'top-right',
    )

    // Add geolocate control (this will show the default blue dot marker)
    const geolocate = new mapboxgl.GeolocateControl({
      positionOptions: {
        enableHighAccuracy: true,
      },
      trackUserLocation: true,
      showUserLocation: true,
      showAccuracyCircle: true,
    })
    map.value.addControl(geolocate, 'top-right')

    // Add attribution
    map.value.addControl(new mapboxgl.AttributionControl({ compact: true }), 'bottom-right')

    // Handle map load
    map.value.on('load', async () => {
      console.log('Mapbox map loaded successfully')
      mapInitialized.value = true

      // Force map resize
      setTimeout(() => {
        map.value?.resize()
      }, 100)

      // Trigger geolocation automatically
      setTimeout(() => {
        geolocate.trigger()
      }, 1000)

      // Load city boundary if we have location
      if (lastKnown.value) {
        await highlightUserCityBoundary(lastKnown.value[0], lastKnown.value[1])
      }
    })

    // Handle map errors
    map.value.on('error', (e: any) => {
      console.error('Mapbox error:', e)
    })

    console.log('Map initialized successfully')
  } catch (error) {
    console.error('Error initializing map:', error)
  }
}

/* -------------------- TIME FORMATTING FUNCTIONS -------------------- */
const formatTime12Hour = (time24: string): string => {
  if (!time24) return ''

  try {
    const [hours, minutes] = time24.split(':').map(Number)

    if (isNaN(hours) || isNaN(minutes)) return time24

    const period = hours >= 12 ? 'PM' : 'AM'
    const hours12 = hours % 12 || 12 // Convert 0 to 12 for midnight
    const minutesStr = minutes.toString().padStart(2, '0')

    return `${hours12}:${minutesStr} ${period}`
  } catch (error) {
    console.warn('Error formatting time:', error)
    return time24
  }
}

const formatTimeRange = (openTime: string, closeTime: string): string => {
  if (!openTime || !closeTime) return ''
  return `${formatTime12Hour(openTime)} - ${formatTime12Hour(closeTime)}`
}

/* -------------------- LOCATION LOOKUPS & AREA DISPLAY -------------------- */
const buildLocationQuery = (city?: string | null, province?: string | null): string | null => {
  const parts = [city, province, 'Philippines'].filter(Boolean)
  return parts.length ? parts.join(', ') : null
}

const normalizeLocationName = (name: string | null | undefined) => {
  if (!name) return ''
  return name
    .toLowerCase()
    .replace(/\b(city|municipality|municipal|town|province)\s+of\b/g, '')
    .replace(/\b(city|municipality|municipal|town|province)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

const locationNamesMatch = (left: string | null | undefined, right: string | null | undefined) => {
  const normalizedLeft = normalizeLocationName(left)
  const normalizedRight = normalizeLocationName(right)

  if (!normalizedLeft || !normalizedRight) return false

  return normalizedLeft === normalizedRight
}

function isPrimaryServiceAreaLocation(
  city: string | null | undefined,
  province: string | null | undefined,
) {
  if (!locationNamesMatch(city, PRIMARY_SERVICE_AREA.cityName)) return false
  if (province && !locationNamesMatch(province, PRIMARY_SERVICE_AREA.provinceName)) return false
  return true
}

const readHierarchyRelationName = (
  relation: LocationOption['province'] | LocationOption['region'],
) => {
  if (typeof relation === 'string') return relation
  if (relation && typeof relation === 'object' && typeof relation.name === 'string') {
    return relation.name
  }
  return null
}

const sanitizeLocationOptions = (data: unknown): LocationOption[] => {
  if (!Array.isArray(data)) return []

  return data.filter((item): item is LocationOption => {
    return typeof item?.code === 'string' && typeof item?.name === 'string'
  })
}

const sortLocationOptions = (items: LocationOption[]) =>
  [...items].sort((a, b) => a.name.localeCompare(b.name))

const mergeLocationOptions = (...groups: LocationOption[][]) => {
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

  const variants = new Set<string>()
  const trimmed = name.trim()
  if (!trimmed) return []

  const lower = trimmed.toLowerCase()
  variants.add(trimmed)

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

const isIndependentCityClass = (cityClass: string | null | undefined) => {
  if (!cityClass) return false
  const normalized = cityClass.toLowerCase()
  return normalized.includes('highly urbanized') || normalized.includes('independent')
}

const getFeatureAttributes = (feature: any) => feature?.properties || feature?.attributes || {}

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

const getGeoJsonBounds = (geojson: any): [number, number, number, number] | null => {
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

  if (!isFinite(bounds.minLng) || !isFinite(bounds.minLat)) return null
  return [bounds.minLng, bounds.minLat, bounds.maxLng, bounds.maxLat]
}

const getBoundsCenter = (
  bounds: [number, number, number, number] | null,
): [number, number] | null => {
  if (!bounds) return null
  const [minLng, minLat, maxLng, maxLat] = bounds
  return [(minLat + maxLat) / 2, (minLng + maxLng) / 2]
}

const getKnownLocation = (): [number, number] | null => {
  if (latitude.value != null && longitude.value != null) {
    const userLat = Number(latitude.value)
    const userLng = Number(longitude.value)
    if (isFinite(userLat) && isFinite(userLng)) return [userLat, userLng]
  }

  if (lastKnown.value) return lastKnown.value
  return activeLocationCenter.value
}

const flyToLocation = (lat: number, lng: number, zoom: number, duration: number = 900) => {
  if (!map.value) return

  map.value.flyTo({
    center: [lng, lat],
    zoom,
    essential: true,
    duration,
  })
}

const createCircularBoundary = (lat: number, lng: number, radiusKm: number = 5) => {
  const points = 40
  const coordinates: [number, number][] = []

  for (let i = 0; i < points; i++) {
    const angle = (i * 360) / points
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

  if (where) {
    params.set('where', where)
  } else {
    params.set('where', '1=1')
  }

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

const fetchBoundaryData = async ({
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

const fetchProvinces = async () => {
  if (provincesLoading.value || provinces.value.length > 0) return

  provincesLoading.value = true
  try {
    const response = await fetch('https://psgc.cloud/api/provinces')
    if (!response.ok) throw new Error(`Province fetch failed: ${response.status}`)

    const data = await response.json()
    provinces.value = sortLocationOptions(sanitizeLocationOptions(data))
  } catch (error) {
    console.error('Failed to fetch provinces:', error)
    setErrorMessage('Unable to load provinces right now.', 3000)
  } finally {
    provincesLoading.value = false
  }
}

const fetchCitiesMunicipalitiesCatalog = async () => {
  if (citiesMunicipalitiesCatalog.value) {
    return citiesMunicipalitiesCatalog.value
  }

  const response = await fetch('https://psgc.cloud/api/v2/cities-municipalities')
  if (!response.ok) {
    throw new Error(`City catalog fetch failed: ${response.status}`)
  }

  const data = await response.json()
  citiesMunicipalitiesCatalog.value = sanitizeLocationOptions(data)
  return citiesMunicipalitiesCatalog.value
}

const fetchCitiesMunicipalities = async (provinceCode: string) => {
  if (!provinceCode) {
    citiesMunicipalities.value = []
    return
  }

  citiesLoading.value = true
  try {
    const provinceName =
      provinces.value.find((province) => province.code === provinceCode)?.name ||
      selectedProvinceName.value

    const [provinceLocalitiesResult, catalogLocalitiesResult] = await Promise.allSettled([
      fetch(`https://psgc.cloud/api/provinces/${provinceCode}/cities-municipalities`).then(
        async (response) => {
          if (!response.ok) throw new Error(`City fetch failed: ${response.status}`)
          return sanitizeLocationOptions(await response.json())
        },
      ),
      fetchCitiesMunicipalitiesCatalog(),
    ])

    if (provinceLocalitiesResult.status === 'rejected') {
      console.error(
        'Failed to fetch province city/municipality list:',
        provinceLocalitiesResult.reason,
      )
    }

    if (catalogLocalitiesResult.status === 'rejected') {
      console.warn('Failed to fetch supplemental city catalog:', catalogLocalitiesResult.reason)
    }

    const provinceLocalities =
      provinceLocalitiesResult.status === 'fulfilled' ? provinceLocalitiesResult.value : []

    const supplementalLocalities =
      provinceName && catalogLocalitiesResult.status === 'fulfilled'
        ? catalogLocalitiesResult.value.filter((city) =>
            locationNamesMatch(readHierarchyRelationName(city.province), provinceName),
          )
        : []

    citiesMunicipalities.value = mergeLocationOptions(provinceLocalities, supplementalLocalities)
  } catch (error) {
    console.error('Failed to fetch cities/municipalities:', error)
    citiesMunicipalities.value = []
    setErrorMessage('Unable to load cities for that province.', 3000)
  } finally {
    citiesLoading.value = false
  }
}

const ensureLocationOptionsLoaded = async () => {
  await fetchProvinces()
}

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

const resolveLocationFromCoordinates = async (
  lat: number,
  lng: number,
): Promise<ResolvedLocationResult> => {
  const cacheKey = `${lat.toFixed(5)},${lng.toFixed(5)}`
  if (reverseGeocodeCache.has(cacheKey)) {
    return reverseGeocodeCache.get(cacheKey)!
  }

  try {
    const features = await queryArcGisBoundaryLayer({ point: [lat, lng] })
    const feature = features[0] || null
    const result = createResolvedLocationResult(feature, [lat, lng])
    reverseGeocodeCache.set(cacheKey, result)
    return result
  } catch (error) {
    console.warn('ArcGIS point-in-polygon lookup failed:', error)

    const fallbackResult: ResolvedLocationResult = {
      city: null,
      province: null,
      cityCode: null,
      provinceCode: null,
      isIndependentCity: false,
      query: null,
      feature: null,
      center: [lat, lng],
      bounds: [lng, lat, lng, lat],
    }

    reverseGeocodeCache.set(cacheKey, fallbackResult)
    return fallbackResult
  }
}

const getActiveResultShops = () => {
  if (isSearchMode.value && !hasLocalSearchResults.value && hasOutsideSearchResults.value) {
    return showOutsideSearchResults.value ? outsideSearchResults.value : []
  }

  return filteredShops.value
}

const fitMapToGeoJson = (geojson: any, shopsToInclude: any[] = []) => {
  if (!map.value || !mapboxgl) return

  const bounds = new mapboxgl.LngLatBounds()
  const geoBounds = getGeoJsonBounds(geojson)

  if (geoBounds) {
    bounds.extend([geoBounds[0], geoBounds[1]])
    bounds.extend([geoBounds[2], geoBounds[3]])
  }

  shopsToInclude.forEach((shop) => {
    const lat = Number(shop.latitude)
    const lng = Number(shop.longitude)
    if (validateCoordinates(lat, lng)) {
      bounds.extend([lng, lat])
    }
  })

  if (bounds.isEmpty()) return

  map.value.fitBounds(bounds, {
    padding: 54,
    animate: true,
    duration: 900,
    maxZoom: 15.5,
  })
}

const renderBoundaryData = (boundaryData: any) => {
  if (!map.value || !mapboxgl || !boundaryData) return

  const sourceId = 'city-boundary-source'
  const fillLayerId = 'city-boundary-fill'
  const lineLayerId = 'city-boundary-line'

  if (!map.value.getSource(sourceId)) {
    map.value.addSource(sourceId, {
      type: 'geojson',
      data: boundaryData,
    })
  } else {
    const source = map.value.getSource(sourceId)
    source.setData(boundaryData)
  }

  if (!map.value.getLayer(fillLayerId)) {
    map.value.addLayer({
      id: fillLayerId,
      type: 'fill',
      source: sourceId,
      paint: {
        'fill-color': '#2563eb',
        'fill-opacity': 0.1,
        'fill-outline-color': '#2563eb',
      },
    })
  }

  if (!map.value.getLayer(lineLayerId)) {
    map.value.addLayer({
      id: lineLayerId,
      type: 'line',
      source: sourceId,
      paint: {
        'line-color': '#2563eb',
        'line-width': 3,
        'line-opacity': 0.85,
        'line-dasharray': [2, 2],
      },
    })
  }
}

const clearCityBoundary = () => {
  if (!map.value) return
  ;['city-boundary-fill', 'city-boundary-line'].forEach((layerId) => {
    if (map.value.getLayer(layerId)) {
      map.value.removeLayer(layerId)
    }
  })

  if (map.value.getSource('city-boundary-source')) {
    map.value.removeSource('city-boundary-source')
  }
}

const applyBoundaryVisibility = () => {
  clearCityBoundary()

  if (showBoundary.value && activeBoundaryFeature.value) {
    renderBoundaryData(activeBoundaryFeature.value)
  }
}

const fitMapToActiveArea = () => {
  if (!map.value || !mapboxgl) return

  if (activeBoundaryFeature.value) {
    fitMapToGeoJson(activeBoundaryFeature.value, getActiveResultShops())
    setErrorMessage(`Fitted map to ${activeLocationLabel.value || 'your active area'}`, 2000)
    return
  }

  const knownLocation = activeLocationCenter.value || getKnownLocation()
  if (knownLocation) {
    flyToLocation(knownLocation[0], knownLocation[1], 14.5, 900)
    setErrorMessage('Fitted map to your location', 2000)
  }
}

const highlightAreaBoundary = async (
  boundaryData: any,
  {
    fitMap = false,
    showMessage = false,
    messageLabel,
  }: {
    fitMap?: boolean
    showMessage?: boolean
    messageLabel?: string | null
  } = {},
) => {
  activeBoundaryFeature.value = boundaryData
  activeLocationBounds.value = getGeoJsonBounds(boundaryData)

  if (!activeLocationCenter.value) {
    activeLocationCenter.value = getBoundsCenter(activeLocationBounds.value)
  }

  applyBoundaryVisibility()

  if (fitMap) {
    fitMapToActiveArea()
  }

  if (showMessage && messageLabel) {
    setErrorMessage(`Showing shops in ${messageLabel}`, 2500)
  }
}

const refreshShopMetrics = () => {
  const distanceOrigin =
    (manualLocationBrowsing.value && activeLocationCenter.value) || getKnownLocation() || null

  shops.value = rawShops.value
    .map((shop) => {
      const lat = Number(shop.latitude)
      const lng = Number(shop.longitude)
      const distanceKm =
        distanceOrigin && validateCoordinates(lat, lng)
          ? getDistanceKm(distanceOrigin[0], distanceOrigin[1], lat, lng)
          : shop.distanceKm || 0

      return {
        ...shop,
        distanceKm,
        withinBoundary: isShopWithinBoundary(shop),
      }
    })
    .sort((left, right) => left.distanceKm - right.distanceKm)
}

const refreshDisplayedShops = async () => {
  refreshShopMetrics()

  if (isSearchMode.value && search.value.trim()) {
    await smartSearch()
    return
  }

  applyShopFilters()
}

const resetLocationSelectionInputs = () => {
  selectedProvinceCode.value = null
  selectedProvinceName.value = null
  selectedCityCode.value = null
  selectedCityName.value = null
  citiesMunicipalities.value = []
}

const activateCurrentLocationArea = async ({
  centerMap = false,
  syncSelectors = false,
  showMessage = false,
}: {
  centerMap?: boolean
  syncSelectors?: boolean
  showMessage?: boolean
} = {}) => {
  manualLocationBrowsing.value = false
  userCity.value = currentLocationCity.value
  userProvince.value = currentLocationProvince.value
  activeAreaScope.value = currentLocationCity.value
    ? 'municipality'
    : currentLocationProvince.value
      ? 'province'
      : null
  if (!currentLocationCity.value) {
    activeAreaIsIndependentCity.value = false
  }

  if (syncSelectors) {
    resetLocationSelectionInputs()
  }

  await refreshDisplayedShops()

  if (showBoundary.value && activeBoundaryFeature.value) {
    applyBoundaryVisibility()
  }

  if (centerMap) {
    fitMapToActiveArea()
  }

  if (showMessage) {
    setErrorMessage('Showing shops near your current location', 2500)
  }
}

const syncCurrentLocationArea = async (
  lat: number,
  lng: number,
  { centerMap = false, showMessage = false }: { centerMap?: boolean; showMessage?: boolean } = {},
) => {
  const resolved = await resolveLocationFromCoordinates(lat, lng)

  currentLocationCity.value = resolved.city
  currentLocationProvince.value = resolved.province
  currentLocationCityCode.value = resolved.cityCode
  currentLocationProvinceCode.value = resolved.provinceCode

  if (manualLocationBrowsing.value) {
    return
  }

  userCity.value = resolved.city
  userProvince.value = resolved.province
  activeAreaScope.value = resolved.city ? 'municipality' : resolved.province ? 'province' : null
  activeAreaIsIndependentCity.value = resolved.isIndependentCity
  activeLocationCenter.value = resolved.center || [lat, lng]

  const boundaryData =
    resolved.feature ||
    (await fetchBoundaryData({
      cityName: resolved.city,
      provinceName: resolved.province,
      cityCode: resolved.cityCode,
      provinceCode: resolved.provinceCode,
      fallbackCenter: [lat, lng],
    }))

  if (boundaryData) {
    activeBoundaryFeature.value = boundaryData
    activeLocationBounds.value = getGeoJsonBounds(boundaryData)
  } else {
    activeBoundaryFeature.value = null
    activeLocationBounds.value = null
  }

  await refreshDisplayedShops()

  if (showBoundary.value && boundaryData) {
    applyBoundaryVisibility()
  } else if (!showBoundary.value) {
    clearCityBoundary()
  }

  if (centerMap) {
    fitMapToActiveArea()
  }

  if (showMessage) {
    setErrorMessage(`Showing shops in ${activeLocationLabel.value || 'your current area'}`, 2500)
  }
}

const navigateToSelectedArea = async () => {
  if (!selectedProvinceName.value) {
    await activateCurrentLocationArea({
      centerMap: true,
      syncSelectors: true,
      showMessage: true,
    })
    return
  }

  locationNavigationLoading.value = true
  boundaryLoading.value = true

  try {
    const areaScope: AreaScope = selectedCityName.value ? 'municipality' : 'province'
    const boundaryData = await fetchBoundaryData({
      cityName: selectedCityName.value,
      provinceName: selectedProvinceName.value,
      cityCode: selectedCityCode.value,
      provinceCode: selectedProvinceCode.value,
      fallbackCenter: getKnownLocation(),
    })

    if (!boundaryData) {
      throw new Error('Boundary data unavailable')
    }

    manualLocationBrowsing.value = true
    userCity.value = selectedCityName.value
    userProvince.value = selectedProvinceName.value
    activeAreaScope.value = areaScope
    const boundaryFeatureForClass =
      boundaryData?.type === 'FeatureCollection' ? boundaryData.features?.[0] : boundaryData
    activeAreaIsIndependentCity.value = Boolean(
      selectedCityName.value &&
        isIndependentCityClass(getFeatureAttributes(boundaryFeatureForClass).CITY_CLASS),
    )

    activeBoundaryFeature.value = boundaryData
    activeLocationBounds.value = getGeoJsonBounds(boundaryData)
    activeLocationCenter.value =
      getBoundsCenter(activeLocationBounds.value) ||
      activeLocationCenter.value ||
      getKnownLocation()

    await refreshDisplayedShops()
    await highlightAreaBoundary(boundaryData, {
      fitMap: true,
      showMessage: true,
      messageLabel: activeLocationLabel.value || selectedProvinceName.value,
    })
  } catch (error) {
    console.error('Manual location navigation failed:', error)
    setErrorMessage('Unable to switch to that area right now.', 3000)
  } finally {
    boundaryLoading.value = false
    locationNavigationLoading.value = false
  }
}

const handleProvinceSelection = async (provinceCode: string | null) => {
  selectedProvinceCode.value = provinceCode
  selectedProvinceName.value =
    provinces.value.find((province) => province.code === provinceCode)?.name || null
  selectedCityCode.value = null
  selectedCityName.value = null

  if (!provinceCode) {
    citiesMunicipalities.value = []
    await activateCurrentLocationArea({
      centerMap: true,
      syncSelectors: true,
      showMessage: true,
    })
    return
  }

  await fetchCitiesMunicipalities(provinceCode)
  await navigateToSelectedArea()
}

const handleCitySelection = async (cityCode: string | null) => {
  selectedCityCode.value = cityCode
  selectedCityName.value =
    citiesMunicipalities.value.find((city) => city.code === cityCode)?.name || null

  if (!selectedProvinceName.value) return

  await navigateToSelectedArea()
}

const openDisplayOptionsFromReminder = async () => {
  showDisplayOptionsMenu.value = true
  await ensureLocationOptionsLoaded()
}

const dismissPrimaryServiceAreaReminder = () => {
  primaryServiceAreaReminderDismissed.value = true
}

const browsePrimaryServiceArea = async () => {
  await ensureLocationOptionsLoaded()

  const targetProvince = provinces.value.find((province) =>
    locationNamesMatch(province.name, PRIMARY_SERVICE_AREA.provinceName),
  )

  if (!targetProvince) {
    setErrorMessage(`Unable to load ${PRIMARY_SERVICE_AREA.provinceName} right now.`, 3000)
    showDisplayOptionsMenu.value = true
    return
  }

  selectedProvinceCode.value = targetProvince.code
  selectedProvinceName.value = targetProvince.name
  selectedCityCode.value = null
  selectedCityName.value = null

  await fetchCitiesMunicipalities(targetProvince.code)

  const targetCity = citiesMunicipalities.value.find((city) =>
    locationNamesMatch(city.name, PRIMARY_SERVICE_AREA.cityName),
  )

  if (!targetCity) {
    setErrorMessage(`Unable to load ${PRIMARY_SERVICE_AREA.cityName} right now.`, 3000)
    showDisplayOptionsMenu.value = true
    return
  }

  selectedCityCode.value = targetCity.code
  selectedCityName.value = targetCity.name

  await navigateToSelectedArea()
  showDisplayOptionsMenu.value = false
}

const toggleBoundaryVisibility = () => {
  showBoundary.value = !showBoundary.value

  if (showBoundary.value && activeBoundaryFeature.value) {
    applyBoundaryVisibility()
  } else {
    clearCityBoundary()
  }

  setErrorMessage(showBoundary.value ? 'Area boundary enabled' : 'Area boundary disabled', 2000)
}

/* -------------------- BOUNDARY CHECK -------------------- */
const isShopInSameCity = (shop: any): boolean => {
  if (!userCity.value || !shop.city) return false

  if (!locationNamesMatch(shop.city, userCity.value)) {
    return false
  }

  if (!userProvince.value || activeAreaIsIndependentCity.value) {
    return true
  }

  return locationNamesMatch(shop.province, userProvince.value)
}

const isShopWithinBoundary = (shop: any): boolean => {
  if (!userCity.value && !userProvince.value) return true

  if (userCity.value) {
    return isShopInSameCity(shop)
  }

  if (userProvince.value) {
    return locationNamesMatch(shop.province, userProvince.value)
  }

  return true
}

/* -------------------- CACHE LOCATION -------------------- */
function loadCachedLocation() {
  try {
    const v = localStorage.getItem(lastKnownKey)
    if (v) {
      const arr = JSON.parse(v)
      if (Array.isArray(arr) && arr.length === 2) {
        lastKnown.value = [Number(arr[0]), Number(arr[1])]
      }
    }
  } catch (e) {
    console.warn('Could not read cached location', e)
  }
}

function saveCachedLocation(lat: number, lng: number) {
  try {
    localStorage.setItem(lastKnownKey, JSON.stringify([lat, lng]))
  } catch (e) {
    console.warn('Could not save cached location', e)
  }
}

/* -------------------- LOCATION ACTIONS -------------------- */
const zoomToMyLocation = async () => {
  if (!map.value || !mapboxgl) return

  locating.value = true
  errorMsg.value = null

  const knownLocation = getKnownLocation()

  try {
    if (knownLocation) {
      flyToLocation(knownLocation[0], knownLocation[1], 16.5, 850)
    }

    try {
      const position = await Geolocation.getCurrentPosition({
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: knownLocation ? 5000 : 0,
      })

      const currentLat = position.coords.latitude
      const currentLng = position.coords.longitude

      if (!validateCoordinates(currentLat, currentLng)) {
        throw new Error('Invalid location coordinates received')
      }

      hasValidLocation.value = true
      saveCachedLocation(currentLat, currentLng)

      const resolved = await resolveLocationFromCoordinates(currentLat, currentLng)
      currentLocationCity.value = resolved.city
      currentLocationProvince.value = resolved.province
      currentLocationCityCode.value = resolved.cityCode
      currentLocationProvinceCode.value = resolved.provinceCode
      activeAreaIsIndependentCity.value = resolved.isIndependentCity
      manualLocationBrowsing.value = false
      userCity.value = resolved.city
      userProvince.value = resolved.province
      activeAreaScope.value = resolved.city ? 'municipality' : resolved.province ? 'province' : null
      activeLocationCenter.value = [currentLat, currentLng]
      resetLocationSelectionInputs()

      const boundaryData =
        resolved.feature ||
        (await fetchBoundaryData({
          cityName: resolved.city,
          provinceName: resolved.province,
          cityCode: resolved.cityCode,
          provinceCode: resolved.provinceCode,
          fallbackCenter: [currentLat, currentLng],
        }))

      activeBoundaryFeature.value = boundaryData
      activeLocationBounds.value = getGeoJsonBounds(boundaryData)
      await refreshDisplayedShops()

      if (boundaryData) {
        await highlightAreaBoundary(boundaryData, {
          fitMap: false,
        })
      } else {
        clearCityBoundary()
      }

      flyToLocation(currentLat, currentLng, 16.5, 850)
      setErrorMessage('Centered on your current location', 2000)
    } catch (geolocationError) {
      console.warn('Unable to refresh current location:', geolocationError)

      if (!knownLocation) {
        setErrorMessage('Unable to determine your location', 3000)
        return
      }

      flyToLocation(knownLocation[0], knownLocation[1], 16, 900)
      await activateCurrentLocationArea({
        centerMap: false,
        syncSelectors: true,
      })
      setErrorMessage('Using your last known location', 2200)
    }
  } catch (error) {
    console.error('Error centering on current location:', error)
    setErrorMessage('Failed to update location', 3000)
  } finally {
    locating.value = false
  }
}

const recenterToUser = zoomToMyLocation
const highlightUserCityBoundary = async (lat: number, lng: number) => {
  await syncCurrentLocationArea(lat, lng, { centerMap: false })
}

/* -------------------- ROUTE MANAGEMENT -------------------- */
let currentRouteLayers: string[] = []
let currentRouteMarkers: any[] = []

/* -------------------- MULTIPLE ROUTING VIA MAPBOX -------------------- */
const getRouteOptions = async (
  start: [number, number],
  end: [number, number],
): Promise<RouteOption[]> => {
  try {
    if (!navigator.onLine) {
      throw new Error('No internet connection')
    }

    const routeOptions: RouteOption[] = []
    const profiles = [
      { type: 'driving' as const, color: '#3b82f6', name: 'Car' },
      { type: 'walking' as const, color: '#10b981', name: 'Walking' },
      { type: 'cycling' as const, color: '#f59e0b', name: 'Cycling' },
    ]

    for (const profile of profiles) {
      try {
        const coordinates = `${start[1]},${start[0]};${end[1]},${end[0]}`
        const url = `https://api.mapbox.com/directions/v5/mapbox/${profile.type}/${coordinates}?alternatives=false&geometries=geojson&steps=false&overview=full&access_token=${MAPBOX_ACCESS_TOKEN}`

        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 10000)

        const res = await fetch(url, {
          signal: controller.signal,
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
        })

        clearTimeout(timeoutId)

        if (!res.ok) continue

        const data = await res.json()

        if (!data.routes || data.routes.length === 0) continue

        const route = data.routes[0]

        if (route.geometry && route.geometry.coordinates) {
          const coords = route.geometry.coordinates.map((coord: [number, number]) => [
            coord[1], // lat
            coord[0], // lon
          ])

          const distance = route.distance
          const duration = route.duration

          routeOptions.push({
            coords,
            distance,
            duration,
            summary: `${profile.name} Route`,
            color: profile.color,
            type: profile.type,
          })
        }
      } catch (err) {
        console.warn(`Failed to get ${profile.type} route:`, err)
      }
    }

    if (routeOptions.length === 0) {
      return [createStraightLineRoute(start, end, 'driving')]
    }

    return routeOptions.sort((a, b) => a.duration - b.duration)
  } catch (err) {
    console.error('Mapbox routing failed:', err)
    return [createStraightLineRoute(start, end, 'driving')]
  }
}

/* -------------------- FALLBACK ROUTE CREATION -------------------- */
const createStraightLineRoute = (
  start: [number, number],
  end: [number, number],
  type: 'driving' | 'walking' | 'cycling',
): RouteOption => {
  const distance = getDistanceKm(start[0], start[1], end[0], end[1]) * 1000

  const speedEstimates = {
    driving: 40,
    walking: 5,
    cycling: 15,
  }

  const estimatedDuration = (distance / 1000 / speedEstimates[type]) * 3600

  const typeNames = {
    driving: 'Car',
    walking: 'Walking',
    cycling: 'Cycling',
  }

  const colors = {
    driving: '#3b82f6',
    walking: '#10b981',
    cycling: '#f59e0b',
  }

  return {
    coords: [start, end],
    distance,
    duration: estimatedDuration,
    summary: `${typeNames[type]} Route`,
    color: colors[type],
    type,
  }
}

/* -------------------- DRAW ROUTE -------------------- */
const drawRoute = (route: RouteOption) => {
  if (!map.value || !mapboxgl || !route) return

  clearRoutes()

  try {
    const routeId = `route-${route.type}`
    const geojson = {
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: route.coords.map((coord) => [coord[1], coord[0]]), // Convert to [lng, lat]
      },
      properties: {
        type: route.type,
        color: route.color,
      },
    }

    // Add source
    map.value.addSource(routeId, {
      type: 'geojson',
      data: geojson,
    })

    // Add layer
    map.value.addLayer({
      id: routeId,
      type: 'line',
      source: routeId,
      layout: {
        'line-join': 'round',
        'line-cap': 'round',
      },
      paint: {
        'line-color': route.color,
        'line-width': 6,
        'line-opacity': 0.8,
      },
    })

    currentRouteLayers.push(routeId)

    // Fit bounds to route
    const bounds = new mapboxgl.LngLatBounds()
    route.coords.forEach((coord) => {
      bounds.extend([coord[1], coord[0]])
    })

    if (bounds.getNorth() !== bounds.getSouth() && bounds.getEast() !== bounds.getWest()) {
      map.value.fitBounds(bounds, {
        padding: 50,
        animate: false,
        duration: 0,
      })
    }

    // Show route info
    const distanceKm = (route.distance / 1000).toFixed(1)
    const durationMin = Math.round(route.duration / 60)
    setErrorMessage(
      `${routeConfig[route.type].label} Route: ${distanceKm} km • ${durationMin} min`,
      5000,
    )
  } catch (error) {
    console.error('Error drawing route:', error)
  }
}

/* -------------------- CLEAR ROUTES -------------------- */
const clearRoutes = () => {
  if (!map.value || !mapboxgl) return

  // Remove layers
  currentRouteLayers.forEach((layerId) => {
    if (map.value.getLayer(layerId)) {
      map.value.removeLayer(layerId)
    }
    if (map.value.getSource(layerId)) {
      map.value.removeSource(layerId)
    }
  })

  // Remove markers
  currentRouteMarkers.forEach((marker) => {
    marker.remove()
  })

  currentRouteLayers = []
  currentRouteMarkers = []
}

/* -------------------- CLEAR ALL ROUTES -------------------- */
const clearAllRoutes = () => {
  clearRoutes()
  routeOptions.value = []
  showRoutePanel.value = false
  routePanelMinimized.value = false
  selectedRouteType.value = 'driving'
  console.log('All routes cleared')
}

/* -------------------- MINIMIZE/EXPAND ROUTE PANEL -------------------- */
const toggleRoutePanelMinimize = () => {
  routePanelMinimized.value = !routePanelMinimized.value
  setErrorMessage(
    routePanelMinimized.value ? 'Route panel minimized' : 'Route panel expanded',
    2000,
  )
}

/* -------------------- SHOW ROUTE PANEL -------------------- */
const showRouteSelectionPanel = () => {
  if (routeOptions.value.length > 0) {
    showRoutePanel.value = true
    routePanelMinimized.value = false
    setErrorMessage('Route panel opened', 2000)
  } else {
    setErrorMessage('No route calculated yet. Select a shop first.', 3000)
  }
}

/* -------------------- SELECT ROUTE TYPE -------------------- */
const selectRouteType = async (type: RouteType) => {
  selectedRouteType.value = type

  // Find the route for the selected type
  const route = routeOptions.value.find((r) => r.type === type)
  if (route) {
    drawRoute(route)
  } else {
    // If route not found, try to get it
    await calculateAndDisplayRoute(type)
  }
}

/* -------------------- CALCULATE AND DISPLAY SPECIFIC ROUTE -------------------- */
const calculateAndDisplayRoute = async (type: RouteType) => {
  routeLoading.value = true

  try {
    // Find the shop that's currently selected
    const shop = shops.value.find((s) => s.id === selectedShopId.value)
    if (!shop || !shop.latitude || !shop.longitude) {
      setErrorMessage('Shop location not available')
      return
    }

    const userLat = Number(latitude.value ?? lastKnown.value?.[0])
    const userLng = Number(longitude.value ?? lastKnown.value?.[1])

    if (!isFinite(userLat) || !isFinite(userLng)) {
      setErrorMessage('Your location is not available')
      return
    }

    const start: [number, number] = [userLat, userLng]
    const end: [number, number] = [Number(shop.latitude), Number(shop.longitude)]

    // Calculate specific route type
    const route = await getSingleRoute(start, end, type)

    if (route) {
      // Add to route options if not already there
      const existingIndex = routeOptions.value.findIndex((r) => r.type === type)
      if (existingIndex >= 0) {
        routeOptions.value[existingIndex] = route
      } else {
        routeOptions.value.push(route)
      }

      // Draw the route
      drawRoute(route)
    } else {
      setErrorMessage(`${type} route not available`, 3000)
    }
  } catch (error) {
    console.error('Error calculating route:', error)
    setErrorMessage('Failed to calculate route', 3000)
  } finally {
    routeLoading.value = false
  }
}

/* -------------------- GET SINGLE ROUTE -------------------- */
const getSingleRoute = async (
  start: [number, number],
  end: [number, number],
  type: 'driving' | 'walking' | 'cycling',
): Promise<RouteOption | null> => {
  try {
    const coordinates = `${start[1]},${start[0]};${end[1]},${end[0]}`
    const url = `https://api.mapbox.com/directions/v5/mapbox/${type}/${coordinates}?alternatives=false&geometries=geojson&steps=false&overview=full&access_token=${MAPBOX_ACCESS_TOKEN}`

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 10000)

    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    })

    clearTimeout(timeoutId)

    if (!res.ok) return null

    const data = await res.json()

    if (!data.routes || data.routes.length === 0) return null

    const mapboxRoute = data.routes[0]

    if (mapboxRoute.geometry && mapboxRoute.geometry.coordinates) {
      const coords = mapboxRoute.geometry.coordinates.map((coord: [number, number]) => [
        coord[1], // lat
        coord[0], // lon
      ])

      const color = routeConfig[type].color

      return {
        coords,
        distance: mapboxRoute.distance,
        duration: mapboxRoute.duration,
        summary: `${routeConfig[type].label} Route`,
        color,
        type,
      }
    }
  } catch (err) {
    console.warn(`Failed to get ${type} route:`, err)
  }

  return null
}

/* -------------------- DISTANCE CALCULATION -------------------- */
const getDistanceKm = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const R = 6371
  const toRad = (v: number) => (v * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

/* -------------------- COORDINATE VALIDATION -------------------- */
const validateCoordinates = (lat: number, lng: number): boolean => {
  if (!isFinite(lat) || !isFinite(lng)) return false
  if (lat === 0 && lng === 0) return false // Avoid 0,0 coordinates
  if (lat < -90 || lat > 90) return false // Valid latitude range
  if (lng < -180 || lng > 180) return false // Valid longitude range
  return true
}

const validateShopCoordinates = (shop: any): boolean => {
  if (!shop.latitude || !shop.longitude) return false
  const lat = Number(shop.latitude)
  const lng = Number(shop.longitude)
  return validateCoordinates(lat, lng)
}

/* -------------------- FETCH SHOPS - UPDATED WITH COORDINATE FILTERS -------------------- */
const doFetchShops = async () => {
  try {
    loading.value = true
    errorMsg.value = null

    const { data, error } = await supabase
      .from('shops')
      .select(
        `
        id,
        business_name,
        latitude,
        longitude,
        logo_url,
        physical_store,
        detected_address,
        house_no,
        building,
        street,
        barangay,
        city,
        province,
        postal,
        status,
        manual_status,
        open_time,
        close_time,
        open_days,
        products:products(id, prod_name, price, main_img_urls)
      `,
      )
      .eq('status', 'approved') // ✅ Only approved shops
      .not('latitude', 'is', null) // ✅ Only shops with latitude
      .not('longitude', 'is', null) // ✅ Only shops with longitude

    if (error) throw error

    if (!data) {
      rawShops.value = []
      shops.value = []
      clearShopMarkers()
      return
    }

    rawShops.value = data.filter((shop: any) => {
      const lat = Number(shop.latitude)
      const lng = Number(shop.longitude)
      return validateCoordinates(lat, lng)
    })

    await refreshDisplayedShops()
  } catch (e) {
    console.error('Error fetching shops:', e)
    errorMsg.value = 'Failed to fetch shops.'
    rawShops.value = []
    shops.value = []
  } finally {
    loading.value = false
  }
}

const fetchShops = () => {
  if (fetchTimeout) window.clearTimeout(fetchTimeout)
  fetchTimeout = window.setTimeout(() => {
    void doFetchShops()
    fetchTimeout = null
  }, 350)
}

/* -------------------- APPLY SHOP FILTERS -------------------- */
const applyShopFilters = () => {
  if (shopDisplayMode.value === 'within') {
    filteredShops.value = shops.value.filter(
      (shop) => shop.withinBoundary || isShopWithinBoundary(shop),
    )
  } else {
    filteredShops.value = shops.value.filter(
      (shop) => !shop.withinBoundary && !isShopWithinBoundary(shop),
    )
  }

  plotShops(filteredShops.value)
}

const toggleDisplayMode = (mode: 'within' | 'outside') => {
  shopDisplayMode.value = mode
  applyShopFilters()

  if (activeLocationLabel.value) {
    setErrorMessage(
      mode === 'within'
        ? `Showing shops within ${activeLocationShortLabel.value}`
        : `Showing shops outside ${activeLocationShortLabel.value}`,
    )
  } else {
    setErrorMessage(
      mode === 'within' ? 'Showing shops in your area' : 'Showing shops outside your area',
    )
  }
}

/* -------------------- SHOP POPUP -------------------- */
const createShopPopup = (shop: any): string => {
  const statusDisplay = getShopStatusDisplay(shop)
  const isOpen = isShopCurrentlyOpen(shop)
  const distanceValue = (shop.searchDistance || shop.distanceKm || 0).toFixed(1)

  return `
    <div style="min-width: 240px; max-width: 280px; padding: 12px;" class="shop-popup-content">
      <!-- Shop Header -->
      <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px;">
        <img src="${shop.logo_url || shop.physical_store || 'https://placehold.co/50x50?text=Shop'}"
             width="50" height="50"
             style="border-radius:8px;object-fit:cover;border: 2px solid ${statusDisplay.color};" />
        <div>
          <p style="margin:0;font-weight:bold;font-size:15px;color:#1f2937;">${shop.business_name}</p>
          <div style="display: flex; align-items: center; gap: 6px; margin-top: 4px;">
            <div style="background:${statusDisplay.color};color:white;padding:3px 10px;border-radius:12px;font-size:11px;font-weight:bold;">
              ${statusDisplay.text}
            </div>
            ${
              shop.manual_status !== 'auto'
                ? '<span style="font-size:10px;color:#f59e0b;" title="Manual override">⚡</span>'
                : ''
            }
          </div>
        </div>
      </div>

      <!-- Essential Info -->
      <div style="font-size:13px;color:#4b5563;">
        <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 6px;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="#6b7280">
            <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
          </svg>
          <span>${getFullAddress(shop).split(',').slice(0, 2).join(',')}</span>
        </div>

        <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 6px;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="#6b7280">
            <path d="M12 8v4l3 3m6-3c0 5.52-4.48 10-10 10S2 17.52 2 12 6.48 2 12 2s10 4.48 10 10z"/>
          </svg>
          <span>${distanceValue} km ${manualLocationBrowsing.value ? 'from selected area' : 'away'}</span>
        </div>

        ${
          shop.open_time && shop.close_time
            ? `
        <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 12px;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="#6b7280">
            <path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z"/>
          </svg>
          <span>${formatTimeRange(shop.open_time, shop.close_time)}</span>
        </div>
        `
            : ''
        }
      </div>

      <!-- Action Buttons -->
      <div style="display: flex; gap: 8px; margin-top: 16px; margin-right: 20px">
        <button id="view-${shop.id}"
                class="popup-btn view-btn"
                style="padding:8px 12px;background:#3b82f6;color:#fff;border:none;border-radius:8px;cursor:pointer;flex:1;font-size:13px;font-weight:600;">
          View Details
        </button>
        <button id="route-${shop.id}"
                class="popup-btn route-btn"
                style="padding:8px 12px;background:#10b981;color:#fff;border:none;border-radius:8px;cursor:pointer;flex:1;font-size:13px;font-weight:600;">
          Get Directions
        </button>
      </div>

      ${
        !isOpen
          ? `<p style="color: #ef4444; font-size: 12px; margin-top: 8px; padding: 4px; background: #fee; border-radius: 4px;">
          Currently closed • Opens at ${formatTime12Hour(shop.open_time) || 'unknown'}
        </p>`
          : ''
      }
    </div>
  `
}

/* -------------------- ATTACH POPUP EVENT HANDLERS -------------------- */
const attachPopupEventHandlers = (popup: any, shopId: string) => {
  // Wait for popup to be added to DOM
  setTimeout(() => {
    const viewBtn = document.getElementById(`view-${shopId}`)
    const routeBtn = document.getElementById(`route-${shopId}`)

    if (viewBtn) {
      viewBtn.addEventListener('click', (e) => {
        e.stopPropagation()
        openShopDetails(shopId)
      })
    }

    if (routeBtn) {
      routeBtn.addEventListener('click', (e) => {
        e.stopPropagation()
        focusOnShopMarker(shopId)
      })
    }
  }, 100)
}

/* -------------------- MARKER MANAGEMENT - UPDATED -------------------- */
const clearShopMarkers = () => {
  shopMarkers.forEach((m) => {
    try {
      m.remove()
    } catch {}
  })
  shopMarkers = []
}

const plotShops = (source = filteredShops.value) => {
  if (!map.value || !mapboxgl) return
  clearShopMarkers()

  let plottedCount = 0
  let skippedCount = 0

  for (const shop of source) {
    // Double-check: only plot approved shops
    if (shop.status !== 'approved') {
      skippedCount++
      continue
    }

    const lat = Number(shop.latitude)
    const lng = Number(shop.longitude)

    // ✅ Validate coordinates before plotting
    if (!validateCoordinates(lat, lng)) {
      console.warn(`Skipping shop ${shop.id} - invalid coordinates: ${lat}, ${lng}`)
      skippedCount++
      continue
    }

    // Create custom marker
    const el = document.createElement('div')
    el.className = 'shop-marker'
    el.innerHTML = `
      <div class="shop-marker-inner" data-shop-id="${shop.id}">
        <svg width="28" height="40" viewBox="0 0 24 24" fill="#EF4444">
          <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
        </svg>
      </div>
    `

    const marker = new mapboxgl.Marker({
      element: el,
      anchor: 'bottom',
    })
      .setLngLat([lng, lat])
      .addTo(map.value)

    // Create popup
    const popup = new mapboxgl.Popup({
      offset: 25,
      closeButton: true,
      className: 'shop-popup',
    }).setHTML(createShopPopup(shop))

    // Attach event handlers to popup buttons
    popup.on('open', () => {
      attachPopupEventHandlers(popup, shop.id)
    })

    marker.setPopup(popup)

    // Store shop data
    marker.shopId = shop.id
    marker.shopData = shop
    shopMarkers.push(marker)

    // Add click handler to marker
    el.addEventListener('click', () => {
      marker.togglePopup()
    })

    plottedCount++
  }

  console.log(
    `📍 Plotted ${plottedCount} shop markers (skipped ${skippedCount} shops without valid coordinates)`,
  )
}

/* -------------------- FOCUS ON SHOP MARKER -------------------- */
const focusOnShopMarker = async (shopId: string) => {
  console.log('Focusing on shop:', shopId)
  setErrorMessage(null)

  let marker = shopMarkers.find((m: any) => m.shopId === shopId)
  if (!marker) return

  const shop = marker.shopData
  if (!shop || !shop.latitude || !shop.longitude) {
    setErrorMessage('Shop location data is incomplete')
    return
  }

  const userLat = Number(latitude.value ?? lastKnown.value?.[0])
  const userLng = Number(longitude.value ?? lastKnown.value?.[1])

  if (!isFinite(userLat) || !isFinite(userLng)) {
    setErrorMessage('Your location is not available for routing')
    return
  }

  // Highlight the marker
  const markerEl = marker.getElement()
  if (markerEl) {
    markerEl.classList.add('shop-marker-highlighted')
    setTimeout(() => {
      markerEl.classList.remove('shop-marker-highlighted')
    }, 3000)
  }

  routeLoading.value = true

  try {
    // Clear any existing routes first
    clearAllRoutes()

    // Calculate routes from user to shop
    const start: [number, number] = [userLat, userLng]
    const end: [number, number] = [Number(shop.latitude), Number(shop.longitude)]

    console.log('Calculating routes from:', start, 'to:', end)

    // Get multiple route options
    const routes = await getRouteOptions(start, end)
    console.log('Route options received:', routes)

    if (routes.length === 0) {
      setErrorMessage('No routes found between your location and the shop')
      return
    }

    // Store all routes
    routeOptions.value = routes

    // Show route panel
    showRoutePanel.value = true
    routePanelMinimized.value = false

    // Set default route type to driving if available, otherwise first available
    const defaultType = routes.find((r) => r.type === 'driving') ? 'driving' : routes[0].type
    selectedRouteType.value = defaultType

    // Draw the default route
    const defaultRoute = routes.find((r) => r.type === defaultType) || routes[0]
    if (defaultRoute) {
      drawRoute(defaultRoute)
    }

    // Fly to shop
    map.value.flyTo({
      center: [end[1], end[0]],
      zoom: 14,
      essential: true,
      duration: 1000,
    })

    // Open popup
    if (marker.getPopup()) {
      marker.togglePopup()
    }

    setErrorMessage(`Found ${routes.length} route options`, 3000)
  } catch (error) {
    console.error('Error calculating routes:', error)
    setErrorMessage('Error calculating routes to shop', 3000)
  } finally {
    routeLoading.value = false
  }
}

/* -------------------- HELPERS -------------------- */
const getFullAddress = (shop: any) => {
  if (shop.detected_address) return shop.detected_address
  const parts = [
    shop.house_no,
    shop.building,
    shop.street,
    shop.barangay,
    shop.city,
    shop.province,
    shop.postal,
  ].filter(Boolean)
  if (parts.length) return parts.join(', ')
  if (shop.physical_store) return shop.physical_store
  return 'Address not available'
}

const convertTimeToNumber = (timeStr: string): number => {
  if (!timeStr) return 0
  const [hours, minutes] = timeStr.split(':').map(Number)
  return hours * 100 + minutes
}

const isShopCurrentlyOpen = (shop: any): boolean => {
  if (shop.manual_status === 'closed') return false
  if (shop.manual_status === 'open') return true
  return isShopOpenByHours(shop)
}

const getShopStatusDisplay = (shop: any): { text: string; color: string; tooltip: string } => {
  const isOpen = isShopCurrentlyOpen(shop)

  if (shop.manual_status === 'open') {
    return {
      text: 'OPEN',
      color: '#10b981',
      tooltip: 'Manually set to OPEN by seller',
    }
  }
  if (shop.manual_status === 'closed') {
    return {
      text: 'CLOSED',
      color: '#ef4444',
      tooltip: 'Manually set to CLOSED by seller',
    }
  }

  if (isOpen) {
    return {
      text: 'OPEN',
      color: '#10b981',
      tooltip: 'Open based on business hours',
    }
  } else {
    return {
      text: 'CLOSED',
      color: '#ef4444',
      tooltip: 'Closed based on business hours',
    }
  }
}

const isShopOpenByHours = (shop: any): boolean => {
  const now = new Date()
  const currentDay = now.getDay()
  const currentTime = now.getHours() * 100 + now.getMinutes()

  if (shop.open_days && shop.open_days.length > 0) {
    const adjustedDay = currentDay === 0 ? 7 : currentDay
    if (!shop.open_days.includes(adjustedDay)) {
      return false
    }
  }

  if (shop.open_time && shop.close_time) {
    const openTime = convertTimeToNumber(shop.open_time)
    const closeTime = convertTimeToNumber(shop.close_time)
    return currentTime >= openTime && currentTime <= closeTime
  }

  return true
}

/* -------------------- SEARCH FUNCTIONALITY -------------------- */
const smartSearch = async () => {
  const query = search.value.trim().toLowerCase()
  if (!query || !map.value) return

  loading.value = true
  errorMsg.value = null
  isSearchMode.value = true

  try {
    const localResults = getLocalSearchShops(query)
    const outsideResults = getOutsideSearchShops(query)

    filteredShops.value = localResults
    outsideSearchResults.value = outsideResults
    showOutsideSearchResults.value = true
    showShopMenu.value = true

    if (localResults.length > 0) {
      errorMsg.value = `Found ${localResults.length} results in ${searchLocationLabel.value}`
      plotShops(localResults)

      if (localResults.length === 1) {
        await focusOnShopMarker(localResults[0].id)
      }
      return
    }

    if (outsideResults.length > 0) {
      errorMsg.value = `No results found in ${searchLocationLabel.value}`
      plotShops(outsideResults)
      return
    }

    errorMsg.value = `No shops or products found for "${query}"`
    plotShops([])
  } catch (error) {
    console.error('Search failed:', error)
    errorMsg.value = 'Search failed. Please try again.'
  } finally {
    loading.value = false
  }
}

const clearSearch = () => {
  search.value = ''
  isSearchMode.value = false
  outsideSearchResults.value = []
  showOutsideSearchResults.value = true
  applyShopFilters()
  showShopMenu.value = false

  if (manualLocationBrowsing.value || activeBoundaryFeature.value) {
    fitMapToActiveArea()
    return
  }

  const knownLocation = getKnownLocation()
  if (knownLocation) {
    flyToLocation(knownLocation[0], knownLocation[1], 13.5, 900)
  }
}

const getMatchingProducts = (shop: any): any[] => {
  const query = search.value.trim().toLowerCase()
  if (!query || !shop.products) return []
  return shop.products.filter((product: any) => product.prod_name?.toLowerCase().includes(query))
}

const matchesSearchQuery = (shop: any, query: string) => {
  const searchTerms = [
    shop.business_name?.toLowerCase(),
    shop.city?.toLowerCase(),
    shop.barangay?.toLowerCase(),
    shop.street?.toLowerCase(),
    shop.province?.toLowerCase(),
    ...(shop.products || []).map((product: any) => product.prod_name?.toLowerCase()),
  ].filter(Boolean)

  return searchTerms.some((term) => term && term.includes(query))
}

const sortSearchResults = (items: any[]) =>
  [...items]
    .map((shop) => ({
      ...shop,
      searchDistance: shop.searchDistance ?? shop.distanceKm ?? 0,
    }))
    .sort((left, right) => left.searchDistance - right.searchDistance)

const getLocalSearchShops = (query: string) =>
  sortSearchResults(
    shops.value
      .filter((shop) => matchesSearchQuery(shop, query))
      .filter((shop) => isShopWithinBoundary(shop)),
  )

const getOutsideSearchShops = (query: string) =>
  sortSearchResults(
    shops.value
      .filter((shop) => matchesSearchQuery(shop, query))
      .filter((shop) => !isShopWithinBoundary(shop)),
  )

const hasSearchMatch = (shop: any): boolean => {
  if (!isSearchMode.value || !search.value) return false
  return matchesSearchQuery(shop, search.value.toLowerCase())
}

const onSearchKeydown = (e: KeyboardEvent) => {
  if (e.key === 'Enter') smartSearch()
}

const toggleShopMenu = () => {
  showShopMenu.value = !showShopMenu.value
  if (showShopMenu.value && !isSearchMode.value) {
    applyShopFilters()
  }
}

const isOutsideSearchResult = (shop: any) => outsideSearchResultIds.value.has(String(shop.id))

const getShopLocationSummary = (shop: any) => {
  const parts = [shop.city, shop.province].filter(Boolean)
  return parts.join(', ') || 'Outside your area'
}

/* -------------------- SHOP SELECTION -------------------- */
const handleShopClick = async (shopId: string, _index: number) => {
  selectedShopId.value = shopId
  await focusOnShopFromList(shopId)
}

const focusOnShopFromList = async (shopId: string) => {
  showShopMenu.value = false
  await new Promise((resolve) => setTimeout(resolve, 300))
  await focusOnShopMarker(shopId)
  setTimeout(() => {
    selectedShopId.value = null
  }, 2000)
}

const openShopDetails = async (shopId: string) => {
  const shop = shops.value.find((s) => s.id === shopId)
  if (!shop) return
  showShopMenu.value = false
  await new Promise((resolve) => setTimeout(resolve, 300))
  router.push(`/shop/${shopId}`)
}

/* -------------------- ERROR MESSAGE HANDLER -------------------- */
let errorTimeout: number | null = null

const setErrorMessage = (message: string | null, duration: number = 4000) => {
  if (errorTimeout) {
    clearTimeout(errorTimeout)
    errorTimeout = null
  }

  errorMsg.value = null

  if (message) {
    setTimeout(() => {
      errorMsg.value = message

      if (duration > 0) {
        errorTimeout = window.setTimeout(() => {
          errorMsg.value = null
        }, duration)
      }
    }, 50)
  }
}

/* -------------------- LIFECYCLE -------------------- */
onMounted(async () => {
  console.log('Mounting map component...')

  try {
    await initializeMap()

    if (Capacitor.getPlatform() !== 'web') await requestPermission()

    const pos = await Geolocation.getCurrentPosition({
      enableHighAccuracy: false,
      timeout: 10000,
    })
    const quickLat = pos.coords.latitude
    const quickLng = pos.coords.longitude

    console.log('Got location:', quickLat, quickLng)

    if (map.value) {
      flyToLocation(quickLat, quickLng, 14, 1000)
    }

    saveCachedLocation(quickLat, quickLng)
    hasValidLocation.value = true
    await syncCurrentLocationArea(quickLat, quickLng, {
      centerMap: false,
    })
    await doFetchShops()
  } catch (err) {
    console.warn('Quick geolocation failed:', err)
    setErrorMessage('Location access failed. Using default location.', 3000)

    const knownLocation = getKnownLocation()
    if (knownLocation) {
      await syncCurrentLocationArea(knownLocation[0], knownLocation[1], {
        centerMap: false,
      })
    }

    await doFetchShops()
  }
})

watch(
  [latitude, longitude],
  async ([lat, lng]) => {
    if (!map.value || lat == null || lng == null) return

    const userLat = Number(lat)
    const userLng = Number(lng)

    if (!isFinite(userLat) || !isFinite(userLng)) return

    const now = Date.now()
    if (now - lastUpdateTs < 1000) {
      saveCachedLocation(userLat, userLng)
      return
    }
    lastUpdateTs = now

    hasValidLocation.value = true

    saveCachedLocation(userLat, userLng)
    await syncCurrentLocationArea(userLat, userLng, {
      centerMap: false,
    })
  },
  { immediate: true },
)

watch(showDisplayOptionsMenu, (isOpen) => {
  if (isOpen) {
    void ensureLocationOptionsLoaded()
  }
})

watch(primaryServiceAreaReminderLocationKey, (nextKey, previousKey) => {
  if (!nextKey) {
    primaryServiceAreaReminderDismissed.value = false
    return
  }

  if (previousKey && nextKey !== previousKey) {
    primaryServiceAreaReminderDismissed.value = false
  }
})

watch(showOutsideSearchResults, (isVisible) => {
  if (!isSearchMode.value || hasLocalSearchResults.value || !hasOutsideSearchResults.value) return

  plotShops(isVisible ? outsideSearchResults.value : [])
})

onUnmounted(() => {
  stopWatching()
  if (map.value) {
    try {
      map.value.remove()
    } catch (e) {
      console.warn('Error removing map:', e)
    }
  }
})
</script>

<template>
  <v-app>
    <PullToRefreshWrapper
      :on-refresh="handleRefresh"
      :on-resume="handleResumeRecovery"
      :threshold="150"
      :ignore-selectors="mapPullIgnoreSelectors"
    >
      <!-- Hero Section - Fixed positioning -->
      <v-sheet class="hero" :style="{ paddingTop: heroPaddingTop }">
        <div class="hero-row">
          <v-text-field
            v-model="search"
            class="search-field"
            variant="solo"
            rounded="pill"
            hide-details
            clearable
            density="comfortable"
            placeholder="Search product or shop"
            append-inner-icon="mdi-cloud-outline"
            @keydown="onSearchKeydown"
            @click:clear="clearSearch"
            @click:append-inner="smartSearch"
          />
          <v-btn
            class="search-btn"
            @click="smartSearch"
           
            :disabled="!search.trim()"
            elevation="2"
          >
            <v-icon size="20">mdi-magnify</v-icon>
          </v-btn>
        </div>
      </v-sheet>

      <!-- Main Content Area -->
      <v-main class="main-content">
        <div id="map" class="map-container" data-ptr-ignore></div>

        <transition name="service-area-banner-fade">
          <div v-if="showPrimaryServiceAreaReminder" class="service-area-banner-wrap">
            <v-alert
              class="service-area-banner"
              color="info"
              variant="tonal"
              border="start"
              icon="mdi-information-outline"
            >
              <div class="service-area-banner-content">
                <div class="service-area-banner-top">
                  <div class="service-area-banner-lead">
                    <div class="service-area-banner-eyebrow">Primary Service Area</div>
                    <div class="service-area-banner-title">
                      You are currently outside Butuan City
                    </div>
                  </div>
                  <v-btn
                    icon
                    variant="text"
                    size="x-small"
                    class="service-area-banner-dismiss"
                    aria-label="Dismiss primary service area reminder"
                    @click="dismissPrimaryServiceAreaReminder"
                  >
                    <v-icon size="18">mdi-close</v-icon>
                  </v-btn>
                </div>
                <p class="service-area-banner-copy">
                  Butuan City is the main service area of this app, where registered shops are
                  currently available. Please use the Display Options below to navigate to Butuan
                  City.
                </p>
                <div v-if="currentLocationLabel" class="service-area-banner-meta">
                  Current location: {{ currentLocationLabel }}
                </div>
                <div class="service-area-banner-actions">
                  <v-btn
                    color="info"
                    variant="flat"
                    size="small"
                    class="service-area-banner-btn"
                    :loading="locationNavigationLoading"
                    @click="browsePrimaryServiceArea"
                  >
                    Go to Butuan City
                  </v-btn>
                  <v-btn
                    variant="text"
                    size="small"
                    class="service-area-banner-link"
                    @click="openDisplayOptionsFromReminder"
                  >
                    Open Display Options
                  </v-btn>
                </div>
              </div>
            </v-alert>
          </div>
        </transition>

        <!-- Boundary Loading Overlay -->
        <div v-if="boundaryLoading || locationNavigationLoading" class="boundary-loading">
          <v-progress-circular indeterminate color="primary" size="24"></v-progress-circular>
          <span>{{ locationOverlayMessage }}</span>
        </div>

        <!-- Route Loading Overlay -->
        <div v-if="routeLoading" class="route-loading">
          <v-progress-circular indeterminate color="primary" size="32"></v-progress-circular>
          <span>Calculating routes...</span>
        </div>

        <!-- Route Selection Panel -->
        <v-card
          v-if="showRoutePanel"
          :class="['route-selection-panel', 'bottom-panel', { minimized: routePanelMinimized }]"
          elevation="4"
        >
          <v-card-title class="d-flex align-center justify-space-between py-2">
            <div class="d-flex align-center">
              <v-icon color="primary" class="mr-2">mdi-routes</v-icon>
              <span class="text-subtitle-1 font-weight-bold">Route Options</span>
            </div>
            <div class="d-flex align-center gap-1">
              <!-- Minimize Button -->
              <v-btn
                icon
                size="small"
                @click="toggleRoutePanelMinimize"
                variant="text"
                :title="routePanelMinimized ? 'Expand panel' : 'Minimize panel'"
              >
                <v-icon>{{ routePanelMinimized ? 'mdi-chevron-up' : 'mdi-chevron-down' }}</v-icon>
              </v-btn>
              <!-- Close Button -->
              <v-btn
                icon
                size="small"
                @click="clearAllRoutes"
                variant="text"
                title="Close route panel"
              >
                <v-icon>mdi-close</v-icon>
              </v-btn>
            </div>
          </v-card-title>

          <v-card-text v-if="!routePanelMinimized" class="py-3">
            <div class="route-buttons-grid">
              <v-btn
                v-for="type in ['driving', 'walking', 'cycling'] as RouteType[]"
                :key="type"
                :color="
                  selectedRouteType === type
                    ? routeConfig[type].activeColor
                    : routeConfig[type].color
                "
                variant="flat"
                class="route-type-btn"
                @click="selectRouteType(type)"
                :disabled="!routeOptions.find((r) => r.type === type)"
              >
                <v-icon start>{{ routeConfig[type].icon }}</v-icon>
                {{ routeConfig[type].label }}
                <template v-if="routeOptions.find((r) => r.type === type)">
                  <v-spacer></v-spacer>
                  <span class="ml-2 text-caption">
                    {{ Math.round(routeOptions.find((r) => r.type === type)!.duration / 60) }} min
                  </span>
                </template>
              </v-btn>
            </div>

            <!-- Route Info -->
            <div
              v-if="routeOptions.find((r) => r.type === selectedRouteType)"
              class="route-info mt-3"
            >
              <v-divider class="my-2"></v-divider>
              <div class="d-flex justify-space-between align-center">
                <div>
                  <div class="text-caption text-medium-emphasis">Distance</div>
                  <div class="text-body-1 font-weight-medium">
                    {{
                      (
                        routeOptions.find((r) => r.type === selectedRouteType)!.distance / 1000
                      ).toFixed(1)
                    }}
                    km
                  </div>
                </div>
                <div>
                  <div class="text-caption text-medium-emphasis">Duration</div>
                  <div class="text-body-1 font-weight-medium">
                    {{
                      Math.round(
                        routeOptions.find((r) => r.type === selectedRouteType)!.duration / 60,
                      )
                    }}
                    minutes
                  </div>
                </div>
              </div>
            </div>
          </v-card-text>

          <!-- Minimized Panel Content -->
          <v-card-text v-else class="py-2 px-3">
            <div class="d-flex align-center justify-space-between">
              <div class="d-flex align-center">
                <v-icon color="primary" size="small" class="mr-2">mdi-routes</v-icon>
                <span class="text-caption text-medium-emphasis">Route calculated</span>
              </div>
              <div class="d-flex align-center">
                <span class="text-caption font-weight-medium mr-2">
                  {{
                    routeOptions.find((r) => r.type === selectedRouteType)
                      ? `${(routeOptions.find((r) => r.type === selectedRouteType)!.distance / 1000).toFixed(1)} km • ${Math.round(routeOptions.find((r) => r.type === selectedRouteType)!.duration / 60)} min`
                      : ''
                  }}
                </span>
                <v-icon size="small" :color="routeConfig[selectedRouteType].color">
                  {{ routeConfig[selectedRouteType].icon }}
                </v-icon>
              </div>
            </div>
          </v-card-text>
        </v-card>

        <!-- Map Controls Container -->
        <div class="map-controls-container" v-if="!showShopMenu && !showRoutePanel">
          <!-- Display Mode Chip -->
          <v-chip
            v-if="activeLocationLabel"
            :color="shopDisplayMode === 'within' ? 'green' : 'orange'"
            size="small"
            class="mode-chip"
          >
            <v-icon small class="mr-1">
              {{ shopDisplayMode === 'within' ? 'mdi-checkbox-marked-circle' : 'mdi-arrow-expand' }}
            </v-icon>
            {{ shopDisplayMode === 'within' ? 'Within' : 'Outside' }} {{ activeLocationShortLabel }}
          </v-chip>

          <div class="map-controls-group">
            <!-- Shop Menu Toggle -->
            <v-btn
              @click="toggleShopMenu"
              class="control-btn"
              variant="text"
              rounded="xl"
              title="Show shops list"
              aria-label="Show shops"
            >
              <span class="control-btn-content">
                <v-icon size="22" color="primary">mdi-store</v-icon>
                <span class="control-btn-label">Show Shops</span>
              </span>
            </v-btn>

            <!-- Display Mode Menu -->
            <v-menu
              v-model="showDisplayOptionsMenu"
              :close-on-content-click="false"
              location="top center"
              transition="scale-transition"
            >
              <template #activator="{ props }">
                <v-btn
                  v-bind="props"
                  :loading="locationNavigationLoading"
                  title="Display Options"
                  class="control-btn"
                  variant="text"
                  rounded="xl"
                  aria-label="Display options"
                >
                  <span class="control-btn-content">
                    <v-icon size="22" color="primary">mdi-filter</v-icon>
                    <span class="control-btn-label">Display Options</span>
                  </span>
                </v-btn>
              </template>
              <v-card class="display-options-card" rounded="xl">
                <v-card-title class="display-options-title">
                  <div>
                    <div class="text-subtitle-1 font-weight-bold">Display Options</div>
                    <div class="text-caption text-medium-emphasis">
                      Browse shops by your current municipality or switch to another province and
                      municipality.
                    </div>
                  </div>
                  <v-chip size="small" color="primary" variant="tonal">
                    {{ activeLocationModeLabel }} {{ activeAreaScopeLabel }}
                  </v-chip>
                </v-card-title>

                <v-card-text class="pt-0">
                  <div class="display-options-section">
                    <div class="display-options-section-title">Shop Coverage</div>
                    <v-btn-group class="display-options-toggle" variant="outlined" divided>
                      <v-btn
                        :color="shopDisplayMode === 'within' ? 'primary' : undefined"
                        @click="toggleDisplayMode('within')"
                      >
                        <v-icon start size="small">mdi-checkbox-marked-circle</v-icon>
                        Within
                      </v-btn>
                      <v-btn
                        :color="shopDisplayMode === 'outside' ? 'orange' : undefined"
                        @click="toggleDisplayMode('outside')"
                      >
                        <v-icon start size="small">mdi-arrow-expand</v-icon>
                        Outside
                      </v-btn>
                    </v-btn-group>
                    <div class="display-options-helper">
                      Currently showing: {{ activeLocationLabel || 'All approved shops' }}
                      <span v-if="activeLocationLabel"
                        >({{ activeAreaScopeLabel.toLowerCase() }})</span
                      >
                    </div>
                  </div>

                  <div class="display-options-section">
                    <div class="display-options-section-title">Browse Another Area</div>
                    <div class="display-options-helper">
                      Select a province, then optionally choose a city or municipality, including
                      independent cities when available, to move the map and reload nearby shops
                      there.
                    </div>

                    <v-autocomplete
                      v-model="selectedProvinceCode"
                      :items="provinces"
                      item-title="name"
                      item-value="code"
                      label="Province"
                      variant="outlined"
                      density="comfortable"
                      prepend-inner-icon="mdi-map-marker-radius"
                      hide-details="auto"
                      clearable
                      :loading="provincesLoading"
                      no-data-text="No provinces found"
                      @update:modelValue="handleProvinceSelection"
                    />

                    <v-autocomplete
                      v-model="selectedCityCode"
                      :items="citiesMunicipalities"
                      item-title="name"
                      item-value="code"
                      label="City / Municipality"
                      variant="outlined"
                      density="comfortable"
                      prepend-inner-icon="mdi-city"
                      hide-details="auto"
                      clearable
                      :disabled="!selectedProvinceCode"
                      :loading="citiesLoading"
                      no-data-text="No cities or municipalities found"
                      @update:modelValue="handleCitySelection"
                    />
                  </div>

                  <div class="display-options-section">
                    <div class="display-options-section-title">Map Boundary</div>
                    <div class="display-options-helper">
                      Show the active province or municipality outline so you can see the area being
                      used for shop results.
                    </div>
                    <v-btn
                      block
                      variant="outlined"
                      :color="showBoundary ? 'primary' : undefined"
                      @click="toggleBoundaryVisibility"
                    >
                      <v-icon start>{{ showBoundary ? 'mdi-eye' : 'mdi-eye-off' }}</v-icon>
                      {{ showBoundary ? 'Hide Boundary' : 'Show Boundary' }}
                    </v-btn>
                  </div>
                </v-card-text>
              </v-card>
            </v-menu>

            <v-btn
              :loading="locating"
              @click="zoomToMyLocation"
              :disabled="!hasValidLocation && !lastKnown"
              :title="hasValidLocation ? 'Go to my current location' : 'Location not available'"
              class="control-btn"
              variant="text"
              rounded="xl"
              aria-label="My location"
            >
              <span class="control-btn-content">
                <v-icon :color="hasValidLocation ? 'primary' : 'grey'" size="22">
                  mdi-crosshairs-gps
                </v-icon>
                <span class="control-btn-label">My Location</span>
              </span>
            </v-btn>

            <!-- Fit Map Button -->
            <v-btn
              @click="fitMapToActiveArea"
              :disabled="!activeLocationCenter && !hasValidLocation && !lastKnown"
              title="Fit map to active area"
              class="control-btn"
              variant="text"
              rounded="xl"
              aria-label="Fit map"
            >
              <span class="control-btn-content">
                <v-icon
                  :color="
                    activeLocationCenter || hasValidLocation || lastKnown ? 'primary' : 'grey'
                  "
                  size="22"
                >
                  mdi-fit-to-page
                </v-icon>
                <span class="control-btn-label">Fit Map</span>
              </span>
            </v-btn>
          </div>
        </div>

        <!-- Re-open Route Panel Button -->
        <v-btn
          v-if="routeOptions.length > 0 && !showRoutePanel"
          class="reopen-route-btn"
          @click="showRouteSelectionPanel"
          icon
          size="large"
          elevation="3"
          title="Show route options"
        >
          <v-badge dot color="green" offset-x="-8" offset-y="2">
            <v-icon color="primary">mdi-routes</v-icon>
          </v-badge>
        </v-btn>

        <!-- Error Message Alert -->
        <v-alert
          v-if="errorMsg"
          type="info"
          :class="[
            'route-info-alert',
            { 'route-info-alert-with-service-area': showPrimaryServiceAreaReminder },
          ]"
          @click="setErrorMessage(null)"
          style="cursor: pointer"
        >
          <div class="d-flex justify-center align-center">
            <span class="alert-text">{{ errorMsg }}</span>
            <v-btn icon size="small" @click.stop="setErrorMessage(null)" class="ml-2">
              <v-icon>mdi-close</v-icon>
            </v-btn>
          </div>
        </v-alert>
      </v-main>

      <!-- Shop Menu Drawer -->
      <v-navigation-drawer
        v-model="showShopMenu"
        location="right"
        temporary
        width="400"
        class="shop-drawer"
      >
        <v-card class="shop-drawer-card h-100 d-flex flex-column" rounded="0">
          <div class="shop-drawer-header">
            <div class="shop-drawer-header-main">
              <div class="shop-drawer-icon-wrap">
                <v-icon color="primary" size="22">mdi-store</v-icon>
              </div>

              <div class="shop-drawer-heading">
                <div class="shop-drawer-context">{{ shopDrawerContextLabel }}</div>
                <div class="shop-drawer-title">{{ shopDrawerTitle }}</div>
                <div class="shop-drawer-subtitle">{{ shopDrawerSubtitle }}</div>
              </div>

              <v-btn
                icon
                @click="showShopMenu = false"
                variant="text"
                size="small"
                class="shop-drawer-close"
                aria-label="Close shop menu"
              >
                <v-icon>mdi-close</v-icon>
              </v-btn>
            </div>
          </div>

          <div class="shop-drawer-scroll">
            <div v-if="isSearchMode && search" class="shop-drawer-search-meta">
              <div class="shop-drawer-search-meta-row">
                <span class="shop-drawer-search-result-text">
                  <template v-if="hasLocalSearchResults">
                    Found {{ filteredShops.length }} results in {{ searchLocationLabel }} for "{{
                      search
                    }}"
                  </template>
                  <template v-else-if="hasOutsideSearchResults">
                    No local results for "{{ search }}". {{ outsideSearchResults.length }} available
                    outside {{ searchLocationLabel }}.
                  </template>
                  <template v-else> No results found for "{{ search }}" </template>
                </span>
                <v-btn size="x-small" variant="text" @click="clearSearch" class="text-caption">
                  Clear
                </v-btn>
              </div>
            </div>

            <div v-if="!isSearchMode && activeLocationLabel" class="shop-drawer-section">
              <div class="shop-drawer-toggle-card">
                <div class="shop-drawer-toggle-title">Shop Coverage</div>
                <v-btn-group variant="outlined" class="shop-drawer-toggle-group">
                  <v-btn
                    :color="shopDisplayMode === 'within' ? 'primary' : undefined"
                    @click="toggleDisplayMode('within')"
                    size="small"
                  >
                    <v-icon start size="small">mdi-checkbox-marked-circle</v-icon>
                    Within {{ activeLocationShortLabel }}
                  </v-btn>
                  <v-btn
                    :color="shopDisplayMode === 'outside' ? 'orange' : undefined"
                    @click="toggleDisplayMode('outside')"
                    size="small"
                  >
                    <v-icon start size="small">mdi-arrow-expand</v-icon>
                    Outside {{ activeLocationShortLabel }}
                  </v-btn>
                </v-btn-group>
              </div>
            </div>

            <div v-if="loading" class="shop-drawer-state">
              <v-progress-circular indeterminate color="primary"></v-progress-circular>
              <div class="shop-drawer-state-title">Loading shops...</div>
              <div class="shop-drawer-state-copy">Updating available shops and products.</div>
            </div>

            <div
              v-if="!loading && isSearchMode && !hasLocalSearchResults && hasOutsideSearchResults"
              class="shop-drawer-search-empty"
            >
              <div class="shop-drawer-search-empty-title">
                No results found in {{ searchLocationLabelTitleCase }}
              </div>
              <div class="shop-drawer-search-empty-copy">
                Matching products are available in other locations. You can browse them below.
              </div>
              <v-switch
                v-model="showOutsideSearchResults"
                inset
                hide-details
                color="primary"
                class="shop-drawer-outside-switch"
                label="Show results outside my area"
              />
            </div>

            <div
              v-if="!loading && !isSearchMode && filteredShops.length === 0"
              class="shop-drawer-state"
            >
              <v-icon size="64" color="grey-lighten-1">mdi-store-off-outline</v-icon>
              <div class="shop-drawer-state-title">No shops found</div>
              <div class="shop-drawer-state-copy">No shops match the current area and filter.</div>
            </div>

            <div
              v-if="!loading && isSearchMode && !hasLocalSearchResults && !hasOutsideSearchResults"
              class="shop-drawer-state"
            >
              <v-icon size="64" color="grey-lighten-1">mdi-magnify-close</v-icon>
              <div class="shop-drawer-state-title">No search results</div>
              <div class="shop-drawer-state-copy">
                Try a different product, shop, or location keyword.
              </div>
            </div>

            <div v-if="!loading && shopDrawerResultSections.length > 0">
              <div
                v-for="section in shopDrawerResultSections"
                :key="section.key"
                class="shop-drawer-section"
              >
                <div v-if="section.title" class="shop-drawer-results-header">
                  <div class="shop-drawer-results-title">{{ section.title }}</div>
                  <div v-if="section.subtitle" class="shop-drawer-results-subtitle">
                    {{ section.subtitle }}
                  </div>
                </div>

                <v-list density="comfortable" class="pa-0">
                  <v-list-item
                    v-for="(shop, index) in section.shops"
                    :key="shop.id"
                    @click="handleShopClick(shop.id, index)"
                    class="mb-2 shop-list-item"
                    :class="{
                      'bg-blue-lighten-5': isSearchMode && hasSearchMatch(shop),
                      'selected-shop': selectedShopId === shop.id,
                    }"
                  >
                    <template #prepend>
                      <div class="position-relative">
                        <v-avatar size="56" rounded class="elevation-1">
                          <v-img
                            :src="
                              shop.logo_url ||
                              shop.physical_store ||
                              'https://placehold.co/80x80?text=Shop'
                            "
                            :alt="shop.business_name"
                            cover
                          />
                        </v-avatar>
                        <div
                          class="status-badge"
                          :class="isShopCurrentlyOpen(shop) ? 'bg-green' : 'bg-red'"
                        >
                          <v-icon size="12" color="white">
                            {{ isShopCurrentlyOpen(shop) ? 'mdi-check' : 'mdi-close' }}
                          </v-icon>
                        </div>
                      </div>
                    </template>

                    <v-list-item-title class="d-flex align-center mb-1">
                      <span class="font-weight-medium text-body-1">{{ shop.business_name }}</span>
                      <v-chip
                        :color="isShopCurrentlyOpen(shop) ? 'green' : 'red'"
                        size="x-small"
                        class="ml-2"
                        density="compact"
                      >
                        {{ isShopCurrentlyOpen(shop) ? 'OPEN' : 'CLOSED' }}
                      </v-chip>
                      <v-spacer></v-spacer>
                      <v-icon
                        v-if="isSearchMode && hasSearchMatch(shop)"
                        size="16"
                        color="primary"
                        title="Search match"
                      >
                        mdi-magnify
                      </v-icon>
                    </v-list-item-title>

                    <v-list-item-subtitle class="text-caption">
                      <div
                        v-if="isSearchMode && isOutsideSearchResult(shop)"
                        class="shop-search-location-pill"
                      >
                        <v-icon size="13" color="orange-darken-2">mdi-earth</v-icon>
                        <span>{{ getShopLocationSummary(shop) }}</span>
                      </div>

                      <div class="d-flex align-center mb-1">
                        <v-icon size="14" class="mr-1">mdi-map-marker</v-icon>
                        <span>{{ getFullAddress(shop) }}</span>
                      </div>

                      <div class="d-flex align-center mb-1">
                        <v-icon size="14" class="mr-1">mdi-navigation</v-icon>
                        <span>
                          {{ (shop.searchDistance || shop.distanceKm || 0).toFixed(1) }} km
                          {{ distanceDisplayLabel }}
                        </span>
                      </div>

                      <div
                        v-if="isSearchMode && getMatchingProducts(shop).length > 0"
                        class="matching-products mt-1"
                      >
                        <v-chip
                          v-for="product in getMatchingProducts(shop).slice(0, 2)"
                          :key="product.id"
                          size="x-small"
                          variant="outlined"
                          color="primary"
                          class="mr-1 mb-1"
                          density="compact"
                        >
                          <v-icon start size="12">mdi-package-variant</v-icon>
                          {{ product.prod_name }}
                        </v-chip>
                        <span
                          v-if="getMatchingProducts(shop).length > 2"
                          class="text-caption text-medium-emphasis"
                        >
                          +{{ getMatchingProducts(shop).length - 2 }} more
                        </span>
                      </div>

                      <div
                        v-if="shop.open_time && shop.close_time"
                        class="d-flex align-center mt-1"
                      >
                        <v-icon size="14" class="mr-1">mdi-clock-outline</v-icon>
                        <span class="text-caption">
                          {{ formatTime12Hour(shop.open_time) }} -
                          {{ formatTime12Hour(shop.close_time) }}
                        </span>
                      </div>
                    </v-list-item-subtitle>

                    <template #append>
                      <div class="d-flex flex-column align-center gap-1">
                        <v-btn
                          icon
                          variant="text"
                          size="small"
                          @click.stop="openShopDetails(shop.id)"
                          title="View shop details"
                          color="primary"
                        >
                          <v-icon>mdi-information</v-icon>
                        </v-btn>
                        <v-btn
                          icon
                          variant="text"
                          size="small"
                          @click.stop="focusOnShopFromList(shop.id)"
                          title="Show on map"
                          color="green"
                        >
                          <v-icon>mdi-map-marker</v-icon>
                        </v-btn>
                      </div>
                    </template>
                  </v-list-item>
                </v-list>
              </div>
            </div>
          </div>

          <v-card-actions v-if="shopDrawerResultSections.length > 0" class="shop-drawer-footer">
            <v-btn
              variant="text"
              block
              @click="fitMapToActiveArea"
              :loading="locating"
              prepend-icon="mdi-fit-to-page"
            >
              Fit Map
            </v-btn>
          </v-card-actions>
        </v-card>
      </v-navigation-drawer>

      <BottomNav v-model="activeTab" />
    </PullToRefreshWrapper>
  </v-app>
</template>

<style scoped>
/* Main layout */
.v-application {
  height: 100vh;
  overflow: hidden;
}

.main-content {
  position: relative;
  height: calc(100vh - 140px) !important; /* Increased from 120px to 140px */
  margin: 0 !important;
  padding: 0 !important;
}

.map-container {
  width: 100%;
  height: 100%;
  position: absolute;
  top: 0;
  left: 0;
  z-index: 1;
}

/* Hero section - UPDATED for Android spacing */
:root {
  --sat: env(safe-area-inset-top);
  --sar: env(safe-area-inset-right);
  --sab: env(safe-area-inset-bottom);
  --sal: env(safe-area-inset-left);
}

.hero {
  background: #3f83c7;
  border-radius: 0;
  margin: 0;
  width: 100%;
  position: relative;
  z-index: 1000;
  box-sizing: border-box;
  padding: calc(20px + var(--sat, 0px)) 16px 16px 16px;
  min-height: calc(80px + var(--sat, 0px));
}

.hero-row {
  display: flex;
  align-items: center;
  gap: 12px; /* Increased gap */
  width: 100%;
  padding-top: 4px; /* Added padding at top */
}

.search-field {
  flex: 1;
  margin-top: 2px; /* Added spacing above field */
}

.search-field :deep(.v-field) {
  background: #fff !important;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.06);
}

.search-btn {
  background: #1d4ed8 !important;
  color: white !important;
  min-width: 60px !important;
  width: 60px !important;
  height: 60px !important;
  box-shadow: 0 4px 14px rgba(16, 185, 129, 0.4) !important;
  border: none;
  transition: all 0.3s ease !important;
  border-radius: 50% !important;
  margin-top: 2px; /* Added spacing above button */
}

.search-btn:hover:not(.v-btn--disabled) {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(16, 185, 129, 0.5) !important;
}

/* Route Selection Panel - Bottom Position */
.route-selection-panel.bottom-panel {
  position: absolute;
  bottom: 90px; /* Position above bottom nav */
  left: 50%;
  transform: translateX(-50%);
  z-index: 2000;
  width: 90%;
  max-width: 400px;
  background: white;
  border-radius: 12px;
  box-shadow: 0 -4px 32px rgba(0, 0, 0, 0.15);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.9);
  animation: slideUp 0.3s ease-out;
}

.route-selection-panel.bottom-panel.minimized {
  max-height: 60px;
  overflow: hidden;
}

/* Animation for bottom panel */
@keyframes slideUp {
  from {
    opacity: 0;
    transform: translate(-50%, 20px);
  }
  to {
    opacity: 1;
    transform: translate(-50%, 0);
  }
}

.route-buttons-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}

.route-type-btn {
  height: 44px !important;
  text-transform: none;
  font-weight: 600;
  transition: all 0.2s ease;
}

.route-type-btn:hover:not(.v-btn--disabled) {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.route-info {
  background: #f8fafc;
  border-radius: 8px;
  padding: 12px;
}

/* Re-open Route Panel Button */
.reopen-route-btn {
  position: absolute;
  bottom: 100px; /* Position above bottom navigation */
  left: 50%;
  transform: translateX(-50%);
  z-index: 2000;
  background: white !important;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.25) !important;
  border-radius: 50% !important;
  width: 56px !important;
  height: 56px !important;
  border: 2px solid #3b82f6 !important;
  transition: all 0.3s ease !important;
}

.reopen-route-btn:hover {
  transform: translateX(-50%) scale(1.1);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3) !important;
  background: #f8fafc !important;
}

.reopen-route-btn .v-badge {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* Map Controls */
.map-controls-container {
  position: absolute;
  bottom: 160px; /* Increased from 100px to make room for route panel */
  right: 20px;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 8px;
  z-index: 2000;
  pointer-events: none;
  margin-bottom: -75px !important;
}

.map-controls-group {
  display: flex;
  flex-direction: column;
  gap: 10px;
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(10px);
  border-radius: 20px;
  padding: 10px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
  border: 1px solid rgba(255, 255, 255, 0.9);
  pointer-events: auto;
}

.mode-chip {
  font-weight: 600;
  padding: 8px 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
  backdrop-filter: blur(10px);
  border: none;
  margin-bottom: 8px;
  align-self: center;
  cursor: pointer;
  transition: all 0.3s ease;
  pointer-events: auto;
}

.mode-chip:hover {
  transform: scale(1.05);
}

.control-btn {
  background: white !important;
  box-shadow: 0 3px 12px rgba(0, 0, 0, 0.15) !important;
  width: 48px !important;
  height: 48px !important;
  border: 1px solid #e2e8f0 !important;
  transition: all 0.3s ease !important;
}

.control-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.2) !important;
  background: #f8fafc !important;
}

/* Loading Overlays */
.boundary-loading {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background: rgba(255, 255, 255, 0.95);
  padding: 16px 24px;
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
  display: flex;
  align-items: center;
  gap: 12px;
  z-index: 2500;
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.8);
  font-weight: 500;
  color: #1f2937;
}

.route-loading {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background: rgba(255, 255, 255, 0.98);
  padding: 24px;
  border-radius: 16px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.2);
  display: flex;
  align-items: center;
  gap: 16px;
  z-index: 3000;
  backdrop-filter: blur(20px);
}

/* Error Message Alert */
.route-info-alert {
  position: absolute;
  top: 100px; /* Increased from 80px to be below hero section */
  left: 50%;
  transform: translateX(-50%);
  z-index: 2000;
  width: 90%;
  max-width: 500px;
  margin: 0;
  padding: 8px 16px;
}

.route-info-alert .d-flex {
  min-height: 32px;
}

.alert-text {
  flex: 1;
  text-align: center;
  margin: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* Status badge */
.status-badge {
  position: absolute;
  top: -4px;
  right: -4px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2px solid white;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
}

/* Shop Marker Styles */
:deep(.shop-marker) {
  cursor: pointer;
  transition: all 0.3s ease;
}

.shop-marker-inner {
  filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.3));
  transition: all 0.3s ease;
}

.shop-marker:hover .shop-marker-inner,
.shop-marker-highlighted .shop-marker-inner {
  transform: scale(1.2);
  filter: drop-shadow(0 4px 8px rgba(0, 0, 0, 0.4));
}

/* Popup Button Styles */
:deep(.popup-btn) {
  transition: all 0.2s ease !important;
  font-weight: 600 !important;
  cursor: pointer !important;
}

:deep(.popup-btn:hover:not(:disabled)) {
  transform: translateY(-2px) !important;
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2) !important;
}

:deep(.popup-btn:disabled) {
  opacity: 0.5 !important;
  cursor: not-allowed !important;
}

:deep(.view-btn:hover) {
  background: #2c7ac2 !important;
}

:deep(.route-btn:hover:not(:disabled)) {
  background: #0da271 !important;
}

/* Mapbox Popup Customization */
:deep(.mapboxgl-popup-content) {
  padding: 12px !important;
  border-radius: 12px !important;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2) !important;
}

:deep(.mapboxgl-popup-close-button) {
  font-size: 20px !important;
  padding: 4px 8px !important;
}

/* Animation for search matches */
.bg-blue-lighten-5 {
  transition: all 0.3s ease;
  animation: highlight-pulse 2s ease-in-out;
}

@keyframes highlight-pulse {
  0% {
    background-color: #f1f5f9;
  }
  50% {
    background-color: #dbeafe;
  }
  100% {
    background-color: #f1f5f9;
  }
}

/* Shop List Item */
.shop-list-item {
  transition: all 0.3s ease;
  border-radius: 8px;
  margin: 4px 8px;
  border: 2px solid transparent;
  cursor: pointer;
}

.shop-list-item:hover {
  background-color: #f1f5f9;
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  border-color: #e2e8f0;
}

.selected-shop {
  background-color: #dbeafe !important;
  border-color: #3b82f6 !important;
  transform: scale(1.02);
  box-shadow: 0 6px 20px rgba(59, 130, 246, 0.3) !important;
}

/* Mobile Optimizations - UPDATED for better Android spacing */
@media (max-width: 768px) {
  .hero {
    padding: calc(20px + env(safe-area-inset-top)) 12px 16px 12px; /* Increased top padding */
    min-height: calc(90px + env(safe-area-inset-top)); /* Taller on mobile */
  }

  .hero-row {
    gap: 10px;
    padding-top: 6px; /* Increased padding */
  }

  .main-content {
    height: calc(
      100vh - 150px - env(safe-area-inset-top)
    ) !important; /* Adjusted for taller header */
  }

  .search-field {
    margin-top: 4px; /* More spacing on mobile */
  }

  .search-btn {
    margin-top: 4px; /* More spacing on mobile */
    min-width: 56px !important;
    width: 56px !important;
    height: 56px !important;
  }

  .route-selection-panel.bottom-panel {
    bottom: calc(80px + env(safe-area-inset-bottom)); /* Account for safe area */
    width: 95%;
    max-width: 380px;
  }

  .route-buttons-grid {
    grid-template-columns: 1fr;
    gap: 6px;
  }

  .route-type-btn {
    height: 40px !important;
    font-size: 14px;
  }

  /* Re-open Route Panel Button adjustments for mobile */
  .reopen-route-btn {
    bottom: calc(80px + env(safe-area-inset-bottom));
    width: 52px !important;
    height: 52px !important;
  }

  .map-controls-container {
    bottom: 140px; /* Adjusted for mobile */
    right: max(12px, env(safe-area-inset-right));
  }

  /* When route panel is open, move controls higher */
  .map-controls-container:has(~ .bottom-panel) {
    bottom: 180px;
  }

  .control-btn {
    width: 44px !important;
    height: 44px !important;
  }

  /* NEW: Responsive margin for tablet/small screens */
  .map-controls-group {
    padding: 8px; /* Optional: slightly smaller padding */
  }

  .route-info-alert {
    top: 70px; /* Increased from 50px */
    width: 95%;
    padding: 8px 12px;
    font-size: 14px;
  }

  .v-navigation-drawer {
    width: 100vw !important;
    max-width: 400px;
  }

  .shop-list-item {
    margin: 2px 4px;
  }
}

/* Extra small devices */
@media (max-width: 480px) {
  .hero {
    padding: calc(18px + env(safe-area-inset-top)) 10px 14px 10px;
    min-height: calc(85px + env(safe-area-inset-top));
  }

  .hero-row {
    gap: 8px;
    padding-top: 4px;
  }

  .search-field {
    font-size: 14px;
    margin-top: 3px;
  }

  .search-btn {
    min-width: 52px !important;
    width: 52px !important;
    height: 52px !important;
    margin-top: 3px;
  }

  .mode-chip {
    font-size: 12px;
    padding: 6px 10px;
  }

  .route-selection-panel.bottom-panel {
    bottom: calc(70px + env(safe-area-inset-bottom));
    max-width: 340px;
  }

  .route-selection-panel.bottom-panel.minimized {
    max-width: 300px;
    max-height: 50px;
  }

  /* Re-open Route Panel Button adjustments for extra small */
  .reopen-route-btn {
    bottom: calc(75px + env(safe-area-inset-bottom));
    width: 48px !important;
    height: 48px !important;
  }

  /* NEW: Smaller margin for extra small devices */
  .map-controls-group {
    padding: 6px; /* Smaller padding */
  }

  .route-info-alert {
    top: 65px;
    font-size: 13px;
    padding: 6px 10px;
  }
}

/* Landscape orientation adjustments */
@media (max-height: 600px) and (orientation: landscape) {
  .hero {
    padding: calc(12px + env(safe-area-inset-top)) 12px 8px 12px;
    min-height: calc(65px + env(safe-area-inset-top));
  }

  .hero-row {
    padding-top: 2px;
  }

  .main-content {
    height: calc(100vh - 110px - env(safe-area-inset-top)) !important;
  }

  .route-selection-panel.bottom-panel {
    bottom: 70px;
    max-width: 350px;
  }

  .route-selection-panel.bottom-panel.minimized {
    max-width: 320px;
    max-height: 48px;
  }

  /* Re-open Route Panel Button adjustments for landscape */
  .reopen-route-btn {
    bottom: 80px;
    width: 44px !important;
    height: 44px !important;
  }

  /* NEW: Minimal margin for landscape mode */
  .map-controls-group {
    padding: 5px; /* Compact padding */
    gap: 6px; /* Smaller gap between buttons */
  }

  .route-info-alert {
    top: 60px;
  }

  .map-controls-container {
    bottom: 120px;
  }
}

/* iOS-specific adjustments */
@supports (-webkit-touch-callout: none) {
  .hero {
    padding-top: calc(20px + constant(safe-area-inset-top)) !important;
    padding-top: calc(20px + env(safe-area-inset-top)) !important;
    min-height: calc(80px + constant(safe-area-inset-top)) !important;
    min-height: calc(80px + env(safe-area-inset-top)) !important;
  }

  .reopen-route-btn {
    bottom: calc(100px + constant(safe-area-inset-bottom)) !important;
    bottom: calc(100px + env(safe-area-inset-bottom)) !important;
  }
}

/* Restored MapSearch overrides */
.main-content {
  --map-floating-offset: calc(88px + env(safe-area-inset-bottom));
  --map-controls-height: 112px;
  --map-controls-max-width: 390px;
}

.service-area-banner-wrap {
  position: absolute;
  top: 12px;
  left: 0;
  right: 0;
  padding: 0 max(12px, env(safe-area-inset-right)) 0 max(12px, env(safe-area-inset-left));
  z-index: 1900;
  pointer-events: none;
}

.service-area-banner {
  width: min(100%, 680px);
  margin: 0;
  margin-inline: auto;
  border-radius: 22px !important;
  border: 1px solid rgba(147, 197, 253, 0.82) !important;
  background: rgba(239, 246, 255, 0.94) !important;
  box-shadow: 0 20px 42px rgba(15, 23, 42, 0.16);
  backdrop-filter: blur(18px);
  pointer-events: auto;
}

.service-area-banner :deep(.v-alert__content) {
  width: 100%;
}

.service-area-banner-fade-enter-active,
.service-area-banner-fade-leave-active {
  transition:
    opacity 0.22s ease,
    transform 0.22s ease;
}

.service-area-banner-fade-enter-from,
.service-area-banner-fade-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}

.service-area-banner-content {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.service-area-banner-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.service-area-banner-lead {
  min-width: 0;
}

.service-area-banner-eyebrow {
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: #1d4ed8;
}

.service-area-banner-title {
  font-size: 1rem;
  font-weight: 800;
  line-height: 1.25;
  color: #0f172a;
}

.service-area-banner-copy {
  margin: 0;
  font-size: 0.88rem;
  line-height: 1.55;
  color: #1e3a5f;
}

.service-area-banner-meta {
  font-size: 0.78rem;
  font-weight: 600;
  color: #334155;
}

.service-area-banner-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.service-area-banner-btn,
.service-area-banner-link {
  text-transform: none !important;
  letter-spacing: 0 !important;
}

.service-area-banner-dismiss {
  flex-shrink: 0;
  margin-right: -4px;
  margin-top: -2px;
  color: #1d4ed8 !important;
}

.service-area-banner-btn {
  font-weight: 700 !important;
}

.service-area-banner-link {
  font-weight: 600 !important;
}

.reopen-route-btn {
  left: auto;
  right: max(16px, env(safe-area-inset-right));
  transform: none;
  bottom: calc(var(--map-floating-offset) + var(--map-controls-height) + 12px);
}

.reopen-route-btn:hover {
  transform: scale(1.08);
}

.map-controls-container {
  left: 50%;
  right: auto;
  bottom: var(--map-floating-offset);
  transform: translateX(-50%);
  align-items: center;
  gap: 10px;
  width: min(calc(100% - 24px), var(--map-controls-max-width));
  margin-bottom: -75px;
}

.map-controls-group {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
  width: 100%;
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(18px);
  border-radius: 15px;
  padding: 8px;
  box-shadow: 0 18px 40px rgba(15, 23, 42, 0.18);
  border: 1px solid rgba(255, 255, 255, 0.9);
}

.mode-chip {
  font-weight: 600;
  padding: 8px 14px;
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.16);
  backdrop-filter: blur(16px);
  border: none;
  cursor: default;
}

.control-btn {
  background: linear-gradient(180deg, #ffffff 0%, #f8fbff 100%) !important;
  box-shadow: 0 8px 20px rgba(15, 23, 42, 0.12) !important;
  min-width: 0 !important;
  width: 100% !important;
  min-height: 72px !important;
  height: 72px !important;
  padding: 8px 4px !important;
  border-radius: 18px !important;
  border: 1px solid #e2e8f0 !important;
  text-transform: none !important;
  letter-spacing: 0 !important;
}

:deep(.control-btn .v-btn__content) {
  width: 100%;
}

.control-btn-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  width: 100%;
  line-height: 1.2;
}

.control-btn-label {
  font-size: 0.66rem;
  font-weight: 700;
  color: #0f172a;
  text-align: center;
  white-space: normal;
  overflow-wrap: anywhere;
  line-height: 1.1;
}

.display-options-card {
  width: min(92vw, 360px);
  border: 1px solid rgba(226, 232, 240, 0.95);
  box-shadow: 0 20px 44px rgba(15, 23, 42, 0.2);
  overflow: hidden;
}

.display-options-title {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding-bottom: 8px;
}

.display-options-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.display-options-section + .display-options-section {
  margin-top: 18px;
  padding-top: 18px;
  border-top: 1px solid #e2e8f0;
}

.display-options-section-title {
  font-size: 0.85rem;
  font-weight: 700;
  color: #0f172a;
}

.display-options-helper {
  font-size: 0.75rem;
  line-height: 1.5;
  color: #64748b;
}

.display-options-toggle {
  width: 100%;
}

.display-options-toggle :deep(.v-btn) {
  flex: 1 1 0;
  text-transform: none;
  font-weight: 600;
}

.route-info-alert-with-service-area {
  top: 180px;
}

.shop-drawer {
  width: min(100vw, 420px) !important;
}

.shop-drawer-card {
  background: linear-gradient(180deg, #f8fbff 0%, #ffffff 38%, #f8fafc 100%);
}

.shop-drawer-header {
  padding: calc(14px + env(safe-area-inset-top)) calc(16px + env(safe-area-inset-right)) 16px
    calc(16px + env(safe-area-inset-left));
  background: linear-gradient(180deg, rgba(219, 234, 254, 0.92) 0%, rgba(255, 255, 255, 0.98) 100%);
  border-bottom: 1px solid rgba(191, 219, 254, 0.72);
}

.shop-drawer-header-main {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

.shop-drawer-icon-wrap {
  width: 42px;
  height: 42px;
  border-radius: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.85);
  box-shadow: 0 10px 22px rgba(37, 99, 235, 0.16);
  flex: 0 0 auto;
}

.shop-drawer-heading {
  min-width: 0;
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.shop-drawer-context {
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #2563eb;
}

.shop-drawer-title {
  font-size: 1.1rem;
  font-weight: 800;
  color: #0f172a;
  line-height: 1.2;
}

.shop-drawer-subtitle {
  font-size: 0.82rem;
  line-height: 1.45;
  color: #64748b;
}

.shop-drawer-close {
  flex: 0 0 auto;
}

.shop-drawer-scroll {
  flex: 1 1 auto;
  overflow-y: auto;
  padding: 12px 16px 14px;
}

.shop-drawer-search-meta,
.shop-drawer-section,
.shop-drawer-search-empty {
  margin-bottom: 14px;
}

.shop-drawer-search-meta-row,
.shop-drawer-results-header {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
}

.shop-drawer-search-result-text,
.shop-drawer-results-subtitle {
  font-size: 0.78rem;
  line-height: 1.5;
  color: #64748b;
}

.shop-drawer-results-title,
.shop-drawer-toggle-title,
.shop-drawer-search-empty-title,
.shop-drawer-state-title {
  font-size: 0.92rem;
  font-weight: 800;
  color: #0f172a;
}

.shop-drawer-toggle-card,
.shop-drawer-search-empty {
  background: rgba(255, 255, 255, 0.92);
  border: 1px solid #dbeafe;
  border-radius: 18px;
  padding: 12px 14px;
  box-shadow: 0 12px 28px rgba(15, 23, 42, 0.06);
}

.shop-drawer-toggle-group {
  width: 100%;
  margin-top: 10px;
}

.shop-drawer-toggle-group :deep(.v-btn) {
  flex: 1 1 0;
  text-transform: none;
}

.shop-drawer-search-empty-copy,
.shop-drawer-state-copy {
  margin-top: 6px;
  font-size: 0.8rem;
  line-height: 1.55;
  color: #64748b;
}

.shop-drawer-outside-switch {
  margin-top: 8px;
}

.shop-search-location-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 8px;
  padding: 6px 10px;
  border-radius: 999px;
  background: #fff7ed;
  border: 1px solid #fdba74;
  color: #9a3412;
  font-size: 0.74rem;
  font-weight: 700;
}

.shop-drawer-state {
  min-height: 220px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  gap: 8px;
  padding: 24px 16px;
}

.shop-drawer-footer {
  padding: 12px calc(16px + env(safe-area-inset-right)) calc(12px + env(safe-area-inset-bottom))
    calc(16px + env(safe-area-inset-left));
  background: rgba(248, 250, 252, 0.94);
  border-top: 1px solid rgba(226, 232, 240, 0.9);
}

@media (max-width: 768px) {
  .main-content {
    --map-controls-height: 102px;
  }

  .service-area-banner-wrap {
    top: 10px;
    padding: 0 max(10px, env(safe-area-inset-right)) 0 max(10px, env(safe-area-inset-left));
  }

  .service-area-banner {
    border-radius: 20px !important;
  }

  .service-area-banner-title {
    font-size: 0.95rem;
  }

  .service-area-banner-copy {
    font-size: 0.82rem;
  }

  .reopen-route-btn {
    right: max(12px, env(safe-area-inset-right));
    bottom: calc(var(--map-floating-offset) + var(--map-controls-height) + 10px);
    width: 52px !important;
    height: 52px !important;
  }

  .map-controls-container {
    bottom: calc(82px + env(safe-area-inset-bottom));
    width: min(calc(100% - 16px), 392px);
  }

  .map-controls-group {
    gap: 6px;
    padding: 6px;
  }

  .control-btn {
    min-height: 62px !important;
    height: 62px !important;
    padding: 6px 3px !important;
  }

  .control-btn-label {
    font-size: 0.6rem;
  }

  .display-options-card {
    width: min(calc(100vw - 16px), 360px);
    max-height: min(72vh, 560px);
    overflow-y: auto;
  }

  .route-info-alert-with-service-area {
    top: 220px;
  }

  .shop-drawer {
    width: 100vw !important;
    max-width: 420px !important;
  }

  .shop-drawer-header {
    padding: calc(12px + env(safe-area-inset-top)) calc(14px + env(safe-area-inset-right)) 14px
      calc(14px + env(safe-area-inset-left));
  }
}

@media (max-width: 480px) {
  .service-area-banner-wrap {
    padding: 0 max(8px, env(safe-area-inset-right)) 0 max(8px, env(safe-area-inset-left));
  }

  .service-area-banner-title {
    font-size: 0.88rem;
  }

  .service-area-banner-copy {
    font-size: 0.78rem;
  }
}

@media (max-height: 600px) and (orientation: landscape) {
  .map-controls-container {
    bottom: calc(72px + env(safe-area-inset-bottom));
    width: min(calc(100% - 16px), 360px);
  }

  .map-controls-group {
    padding: 5px;
    gap: 4px;
  }

  .control-btn {
    min-height: 52px !important;
    height: 52px !important;
    padding: 4px 2px !important;
  }

  .route-info-alert-with-service-area {
    top: 170px;
  }

  .shop-drawer-header {
    padding: calc(8px + env(safe-area-inset-top)) calc(12px + env(safe-area-inset-right)) 10px
      calc(12px + env(safe-area-inset-left));
  }
}
</style>
