<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import mapboxgl from 'mapbox-gl'
import { supabase } from '@/utils/supabase'
import {
  MAPBOX_ACCESS_TOKEN,
  formatTrackingDistance,
  formatTrackingDuration,
  formatTrackingTimestamp,
  getTrackingChannelName,
  type TrackingLocation,
  type TrackingViewerMode,
} from '@/utils/orderTracking'

interface RouteSummary {
  distanceText: string
  durationText: string
  pickupToDeliveryText: string
}

type TrackingPointKey = 'rider' | 'pickup' | 'delivery'

const props = withDefaults(
  defineProps<{
    orderId: string
    pickupLocation: TrackingLocation | null
    deliveryLocation: TrackingLocation | null
    riderLocation?: TrackingLocation | null
    viewerMode?: TrackingViewerMode
    trackOwnLocation?: boolean
    subscribeToLiveLocation?: boolean
    fullscreen?: boolean
    panelCollapsed?: boolean
    title?: string
    subtitle?: string
    showFullscreenButton?: boolean
    fullscreenButtonLabel?: string
  }>(),
  {
    riderLocation: null,
    viewerMode: 'customer',
    trackOwnLocation: false,
    subscribeToLiveLocation: true,
    fullscreen: false,
    panelCollapsed: false,
    title: 'Order tracking',
    subtitle: '',
    showFullscreenButton: false,
    fullscreenButtonLabel: 'See full-screen map',
  },
)

const emit = defineEmits<{
  (event: 'open-fullscreen'): void
}>()

const mapContainer = ref<HTMLElement | null>(null)
const mapReady = ref(false)
const mapLoading = ref(true)
const mapError = ref<string | null>(null)
const mapInitError = ref<string | null>(null)
const routeLoading = ref(false)
const routeSummary = ref<RouteSummary | null>(null)
const liveRiderLocation = ref<TrackingLocation | null>(props.riderLocation)
const heartbeat = ref(Date.now())

let map: mapboxgl.Map | null = null
let riderMarker: mapboxgl.Marker | null = null
let pickupMarker: mapboxgl.Marker | null = null
let deliveryMarker: mapboxgl.Marker | null = null
let trackingChannel: any = null
let geolocationWatchId: number | null = null
let routeRefreshTimeout: number | null = null
let heartbeatInterval: number | null = null
let hasFramedBounds = false
let lastRenderedPointCount = 0

const sourceId = `order-tracking-source-${props.orderId}`.replace(/[^a-zA-Z0-9_-]/g, '-')
const outlineLayerId = `${sourceId}-outline`
const lineLayerId = `${sourceId}-line`

const resolvedRiderLocation = computed(() => liveRiderLocation.value || props.riderLocation || null)

const trackedPointCount = computed(
  () =>
    [resolvedRiderLocation.value, props.pickupLocation, props.deliveryLocation].filter(Boolean)
      .length,
)

const canFitMap = computed(() => mapReady.value && trackedPointCount.value > 0)
const displayedMapError = computed(() => mapInitError.value || mapError.value)

const isRiderLocationFresh = computed(() => {
  const timestamp = resolvedRiderLocation.value?.updatedAt
  if (!timestamp) return props.trackOwnLocation && !!resolvedRiderLocation.value

  const updatedAt = new Date(timestamp).getTime()
  if (Number.isNaN(updatedAt)) return false

  return heartbeat.value - updatedAt < 90_000
})

const riderStatusLabel = computed(() => {
  if (props.trackOwnLocation && resolvedRiderLocation.value) return 'Sharing live location'
  if (resolvedRiderLocation.value && isRiderLocationFresh.value) return 'Live rider location'
  if (resolvedRiderLocation.value) return 'Last known rider location'
  return 'Rider location unavailable'
})

const riderStatusTone = computed(() => {
  if (props.trackOwnLocation && resolvedRiderLocation.value) return 'live'
  if (resolvedRiderLocation.value && isRiderLocationFresh.value) return 'live'
  if (resolvedRiderLocation.value) return 'stale'
  return 'idle'
})

const viewerEyebrow = computed(() => {
  if (props.viewerMode === 'rider') return 'Rider dashboard'
  if (props.viewerMode === 'seller') return 'Seller tracking'
  return 'Customer tracking'
})

const summarySubtitle = computed(() => {
  if (props.subtitle) return props.subtitle
  if (resolvedRiderLocation.value && isRiderLocationFresh.value) {
    return `Last update ${formatTrackingTimestamp(resolvedRiderLocation.value.updatedAt)}`
  }
  if (resolvedRiderLocation.value) {
    return `Last known update ${formatTrackingTimestamp(resolvedRiderLocation.value.updatedAt)}`
  }
  return 'Pickup and delivery points are ready. Rider location will appear when it is shared.'
})

const routeSummaryCards = computed(() => [
  {
    label: 'Estimated travel',
    value: routeSummary.value?.durationText || 'Pending',
    icon: 'mdi-clock-outline',
  },
  {
    label: 'Total distance',
    value: routeSummary.value?.distanceText || 'Pending',
    icon: 'mdi-map-marker-distance',
  },
  {
    label: 'Store to customer',
    value: routeSummary.value?.pickupToDeliveryText || 'Pending',
    icon: 'mdi-store-marker-outline',
  },
])

const getWebGlUnavailableMessage = () =>
  'Interactive map is unavailable on this device or browser because WebGL could not be started. Tracking details are still available below.'

const isMapboxWebGlSupported = () => {
  if (typeof window === 'undefined') return false

  try {
    return mapboxgl.supported()
  } catch (error) {
    console.error('Unable to verify Mapbox WebGL support:', error)
    return false
  }
}

const locationCards = computed(() => [
  {
    key: 'rider',
    title: props.viewerMode === 'rider' ? 'Current rider position' : 'Rider location',
    subtitle:
      resolvedRiderLocation.value?.name ||
      (props.viewerMode === 'rider' ? 'Your current location' : 'Assigned rider'),
    address:
      resolvedRiderLocation.value?.address ||
      (resolvedRiderLocation.value
        ? `${resolvedRiderLocation.value.lat.toFixed(5)}, ${resolvedRiderLocation.value.lng.toFixed(5)}`
        : 'Waiting for a live rider update'),
    icon: props.viewerMode === 'rider' ? 'mdi-map-marker' : 'mdi-motorbike',
    tone: 'rider',
    location: resolvedRiderLocation.value,
    meta: resolvedRiderLocation.value?.updatedAt
      ? formatTrackingTimestamp(resolvedRiderLocation.value.updatedAt)
      : 'Realtime when available',
  },
  {
    key: 'pickup',
    title: 'Pickup point',
    subtitle: props.pickupLocation?.name || 'Shop location',
    address: props.pickupLocation?.address || 'Pickup location unavailable',
    icon: 'mdi-warehouse',
    tone: 'pickup',
    location: props.pickupLocation,
    meta: 'Shop or warehouse',
  },
  {
    key: 'delivery',
    title: 'Delivery point',
    subtitle: props.deliveryLocation?.name || 'Customer location',
    address: props.deliveryLocation?.address || 'Delivery location unavailable',
    icon: 'mdi-home',
    tone: 'delivery',
    location: props.deliveryLocation,
    meta: 'Customer address',
  },
])

const getTrackedPoints = () =>
  [resolvedRiderLocation.value, props.pickupLocation, props.deliveryLocation].filter(
    Boolean,
  ) as TrackingLocation[]

const getMarkerDisplayLocations = () => {
  const groupedPoints = new Map<
    string,
    Array<{ key: TrackingPointKey; location: TrackingLocation }>
  >()
  const displayLocations: Partial<Record<TrackingPointKey, TrackingLocation>> = {}

  ;(
    [
      ['rider', resolvedRiderLocation.value],
      ['pickup', props.pickupLocation],
      ['delivery', props.deliveryLocation],
    ] as Array<[TrackingPointKey, TrackingLocation | null]>
  ).forEach(([key, location]) => {
    if (!location) return

    const groupKey = `${location.lat.toFixed(5)}:${location.lng.toFixed(5)}`
    const group = groupedPoints.get(groupKey) || []
    group.push({ key, location })
    groupedPoints.set(groupKey, group)
  })

  groupedPoints.forEach((group) => {
    if (group.length === 1) {
      const [point] = group
      displayLocations[point.key] = point.location
      return
    }

    const baseRadius = 0.00012

    group.forEach((point, index) => {
      const angle = -Math.PI / 2 + (Math.PI * 2 * index) / group.length
      const latOffset = baseRadius * Math.sin(angle)
      const longitudeScale = Math.max(Math.cos((point.location.lat * Math.PI) / 180), 0.35)
      const lngOffset = (baseRadius * Math.cos(angle)) / longitudeScale

      displayLocations[point.key] = {
        ...point.location,
        lat: point.location.lat + latOffset,
        lng: point.location.lng + lngOffset,
      }
    })
  })

  return displayLocations
}

const getRouteWaypoints = () => {
  const points = getTrackedPoints()

  if (!props.pickupLocation || !props.deliveryLocation) return []

  if (!resolvedRiderLocation.value) {
    return [props.pickupLocation, props.deliveryLocation]
  }

  return points
}

const buildPopupHtml = (
  title: string,
  subtitle: string,
  address: string,
  updatedAt?: string | null,
) => {
  const updatedMarkup = updatedAt
    ? `<div class="tracking-popup__meta">Updated ${formatTrackingTimestamp(updatedAt)}</div>`
    : ''

  return `
    <div class="tracking-popup">
      <div class="tracking-popup__title">${title}</div>
      <div class="tracking-popup__subtitle">${subtitle}</div>
      <div class="tracking-popup__address">${address}</div>
      ${updatedMarkup}
    </div>
  `
}

const getMarkerIcon = (key: 'rider' | 'pickup' | 'delivery') => {
  if (key === 'rider') {
    return props.viewerMode === 'rider' ? 'mdi-map-marker' : 'mdi-motorbike'
  }

  if (key === 'pickup') return 'mdi-warehouse'

  return 'mdi-home'
}

const getMarkerLabel = (key: 'rider' | 'pickup' | 'delivery') => {
  if (key === 'rider') {
    return props.viewerMode === 'rider' ? 'Current position' : 'Rider'
  }

  if (key === 'pickup') return 'Pickup'

  return 'Delivery'
}

const createMarkerElement = (key: 'rider' | 'pickup' | 'delivery') => {
  const element = document.createElement('button')
  element.type = 'button'
  element.className = `tracking-marker tracking-marker--${key}`
  element.innerHTML = `
    <span class="tracking-marker__bubble">
      <i class="mdi ${getMarkerIcon(key)}" aria-hidden="true"></i>
    </span>
    <span class="tracking-marker__label">${getMarkerLabel(key)}</span>
  `

  return element
}

const ensureMarker = (
  existingMarker: mapboxgl.Marker | null,
  key: TrackingPointKey,
  location: TrackingLocation | null,
  displayLocation: TrackingLocation | null = location,
) => {
  if (!map || !mapReady.value) return existingMarker

  if (!location) {
    existingMarker?.remove()
    return null
  }

  const popup = new mapboxgl.Popup({ offset: 28 }).setHTML(
    buildPopupHtml(
      getMarkerLabel(key),
      location.name,
      location.address || 'Address unavailable',
      location.updatedAt,
    ),
  )

  if (!existingMarker) {
    const marker = new mapboxgl.Marker({
      element: createMarkerElement(key),
      anchor: 'bottom',
    })
      .setLngLat([displayLocation?.lng ?? location.lng, displayLocation?.lat ?? location.lat])
      .setPopup(popup)
      .addTo(map)

    return marker
  }

  existingMarker.setLngLat([
    displayLocation?.lng ?? location.lng,
    displayLocation?.lat ?? location.lat,
  ])
  existingMarker.setPopup(popup)

  return existingMarker
}

const renderMarkers = () => {
  const displayLocations = getMarkerDisplayLocations()

  riderMarker = ensureMarker(
    riderMarker,
    'rider',
    resolvedRiderLocation.value,
    displayLocations.rider || resolvedRiderLocation.value,
  )
  pickupMarker = ensureMarker(
    pickupMarker,
    'pickup',
    props.pickupLocation,
    displayLocations.pickup || props.pickupLocation,
  )
  deliveryMarker = ensureMarker(
    deliveryMarker,
    'delivery',
    props.deliveryLocation,
    displayLocations.delivery || props.deliveryLocation,
  )
}

const removeRoute = () => {
  if (!map) return

  if (map.getLayer(lineLayerId)) map.removeLayer(lineLayerId)
  if (map.getLayer(outlineLayerId)) map.removeLayer(outlineLayerId)
  if (map.getSource(sourceId)) map.removeSource(sourceId)
}

const getFitPadding = () => {
  if (!props.fullscreen) {
    return { top: 32, right: 32, bottom: 32, left: 32 }
  }

  if (props.panelCollapsed) {
    return { top: 48, right: 24, bottom: 48, left: 24 }
  }

  if (window.innerWidth <= 1080) {
    return {
      top: 72,
      right: 24,
      bottom: Math.min(Math.round(window.innerHeight * 0.38), 320),
      left: 24,
    }
  }

  return { top: 40, right: 32, bottom: 48, left: 32 }
}

const fitToAllPoints = () => {
  if (!map || !mapReady.value) return

  const bounds = new mapboxgl.LngLatBounds()
  const points = getTrackedPoints()

  if (!points.length) return

  points.forEach((point) => bounds.extend([point.lng, point.lat]))

  map.fitBounds(bounds, {
    padding: getFitPadding(),
    duration: 900,
    maxZoom: points.length === 1 ? 15.5 : 14.5,
  })

  hasFramedBounds = true
}

const mapContainsAllPoints = () => {
  if (!map || !mapReady.value) return false

  const points = getTrackedPoints()
  if (!points.length) return false

  const bounds = map.getBounds()
  if (!bounds) return false

  return points.every((point) => bounds.contains([point.lng, point.lat]))
}

const focusPoint = (key: 'rider' | 'pickup' | 'delivery') => {
  if (!map) return

  const target =
    key === 'rider'
      ? resolvedRiderLocation.value
      : key === 'pickup'
        ? props.pickupLocation
        : props.deliveryLocation

  if (!target) return

  map.flyTo({
    center: [target.lng, target.lat],
    zoom: 15.5,
    duration: 900,
    essential: true,
  })
}

const updateRoute = async () => {
  if (!map || !mapReady.value) return

  const waypoints = getRouteWaypoints()

  if (waypoints.length < 2) {
    routeSummary.value = null
    removeRoute()
    return
  }

  routeLoading.value = true

  try {
    const coordinates = waypoints.map((point) => `${point.lng},${point.lat}`).join(';')
    const url =
      `https://api.mapbox.com/directions/v5/mapbox/driving/${coordinates}` +
      `?alternatives=false&geometries=geojson&overview=full&steps=false&access_token=${MAPBOX_ACCESS_TOKEN}`

    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`Directions request failed with status ${response.status}`)
    }

    const data = await response.json()
    const route = data?.routes?.[0]

    if (!route?.geometry?.coordinates?.length) {
      removeRoute()
      routeSummary.value = null
      return
    }

    const routeGeoJson = {
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'LineString',
        coordinates: route.geometry.coordinates,
      },
    }

    if (map.getSource(sourceId)) {
      ;(map.getSource(sourceId) as mapboxgl.GeoJSONSource).setData(routeGeoJson as any)
    } else {
      map.addSource(sourceId, {
        type: 'geojson',
        data: routeGeoJson as any,
      })

      map.addLayer({
        id: outlineLayerId,
        type: 'line',
        source: sourceId,
        layout: {
          'line-cap': 'round',
          'line-join': 'round',
        },
        paint: {
          'line-color': '#12304f',
          'line-opacity': 0.28,
          'line-width': 10,
        },
      })

      map.addLayer({
        id: lineLayerId,
        type: 'line',
        source: sourceId,
        layout: {
          'line-cap': 'round',
          'line-join': 'round',
        },
        paint: {
          'line-color': '#2f7de1',
          'line-opacity': 0.9,
          'line-width': 5,
        },
      })
    }

    const pickupToDeliveryLeg =
      route.legs?.length > 1 ? route.legs[route.legs.length - 1] : route.legs?.[0]

    routeSummary.value = {
      distanceText: formatTrackingDistance(route.distance),
      durationText: formatTrackingDuration(route.duration),
      pickupToDeliveryText: formatTrackingDistance(pickupToDeliveryLeg?.distance),
    }
  } catch (error) {
    console.error('Unable to update tracking route:', error)
    routeSummary.value = null
    mapError.value = 'Unable to load the latest route right now.'
  } finally {
    routeLoading.value = false
  }
}

const scheduleRouteRefresh = () => {
  if (routeRefreshTimeout) {
    window.clearTimeout(routeRefreshTimeout)
  }

  routeRefreshTimeout = window.setTimeout(() => {
    updateRoute()
  }, 250)
}

const syncMapScene = ({
  fit = false,
  fitIfPointCountIncreases = false,
}: {
  fit?: boolean
  fitIfPointCountIncreases?: boolean
} = {}) => {
  if (!map || !mapReady.value) return

  const currentPointCount = trackedPointCount.value
  const shouldFit =
    fit ||
    !hasFramedBounds ||
    (fitIfPointCountIncreases && currentPointCount > lastRenderedPointCount) ||
    (props.fullscreen && !mapContainsAllPoints())

  renderMarkers()
  scheduleRouteRefresh()

  if (shouldFit) {
    window.setTimeout(() => {
      fitToAllPoints()
    }, 120)
  }

  lastRenderedPointCount = currentPointCount
}

const publishRiderLocation = async (location: TrackingLocation) => {
  if (!trackingChannel) return

  try {
    await trackingChannel.send({
      type: 'broadcast',
      event: 'rider-location',
      payload: location,
    })
  } catch (error) {
    console.error('Unable to publish rider location:', error)
  }
}

const handleTrackedPosition = async (position: GeolocationPosition) => {
  const location: TrackingLocation = {
    lat: position.coords.latitude,
    lng: position.coords.longitude,
    name: 'Assigned rider',
    address: `${position.coords.latitude.toFixed(5)}, ${position.coords.longitude.toFixed(5)}`,
    updatedAt: new Date().toISOString(),
  }

  liveRiderLocation.value = location
  if (!mapInitError.value) {
    mapError.value = null
  }
  syncMapScene({ fitIfPointCountIncreases: true })
  await publishRiderLocation(location)
}

const startOwnLocationTracking = async () => {
  if (!props.trackOwnLocation || geolocationWatchId !== null || !navigator.geolocation) return

  navigator.geolocation.getCurrentPosition(
    (position) => {
      handleTrackedPosition(position)
    },
    (error) => {
      console.error('Unable to get rider location:', error)
      mapError.value = 'Location permission is needed to share your rider position.'
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
  )

  geolocationWatchId = navigator.geolocation.watchPosition(
    (position) => {
      handleTrackedPosition(position)
    },
    (error) => {
      console.error('Unable to watch rider location:', error)
      mapError.value =
        'Live rider tracking paused because the current location could not be refreshed.'
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 15000 },
  )
}

const stopOwnLocationTracking = () => {
  if (geolocationWatchId !== null && navigator.geolocation) {
    navigator.geolocation.clearWatch(geolocationWatchId)
    geolocationWatchId = null
  }
}

const subscribeToTracking = async () => {
  if (!props.orderId || (!props.subscribeToLiveLocation && !props.trackOwnLocation)) return

  if (trackingChannel) {
    supabase.removeChannel(trackingChannel)
    trackingChannel = null
  }

  trackingChannel = supabase.channel(getTrackingChannelName(props.orderId), {
    config: {
      broadcast: {
        self: true,
      },
    },
  })

  trackingChannel.on(
    'broadcast',
    { event: 'rider-location' },
    ({ payload }: { payload: TrackingLocation }) => {
      if (!payload) return

      liveRiderLocation.value = {
        lat: Number(payload.lat),
        lng: Number(payload.lng),
        name: payload.name || 'Assigned rider',
        address: payload.address,
        updatedAt: payload.updatedAt || new Date().toISOString(),
      }

      syncMapScene({ fitIfPointCountIncreases: true })
    },
  )

  trackingChannel.subscribe((status: string) => {
    if (status === 'SUBSCRIBED' && props.trackOwnLocation && liveRiderLocation.value) {
      publishRiderLocation(liveRiderLocation.value)
    }
  })
}

const initMap = async () => {
  if (!mapContainer.value) return

  if (!MAPBOX_ACCESS_TOKEN) {
    mapInitError.value = 'Mapbox access token is missing.'
    mapLoading.value = false
    return
  }

  if (!isMapboxWebGlSupported()) {
    mapInitError.value = getWebGlUnavailableMessage()
    mapLoading.value = false
    return
  }

  mapboxgl.accessToken = MAPBOX_ACCESS_TOKEN

  await nextTick()

  try {
    map = new mapboxgl.Map({
      container: mapContainer.value,
      style: 'mapbox://styles/mapbox/streets-v12',
      center: [121.774, 12.8797],
      zoom: 11,
      attributionControl: false,
    })
  } catch (error) {
    console.error('Unable to initialize tracking map:', error)
    mapInitError.value = getWebGlUnavailableMessage()
    mapLoading.value = false

    if (map) {
      try {
        map.remove()
      } catch (removeError) {
        console.error('Unable to clean up failed tracking map instance:', removeError)
      }
      map = null
    }

    return
  }

  map.addControl(
    new mapboxgl.NavigationControl({
      showCompass: false,
      visualizePitch: false,
    }),
    'top-right',
  )
  map.addControl(new mapboxgl.AttributionControl({ compact: true }), 'bottom-right')

  map.on('load', () => {
    mapInitError.value = null
    mapReady.value = true
    mapLoading.value = false
    syncMapScene({ fit: true })

    window.setTimeout(() => {
      map?.resize()
    }, 120)
  })

  map.on('error', (error) => {
    console.error('Tracking map error:', error)

    const errorMessage =
      error && typeof error === 'object' && 'error' in error
        ? String((error as { error?: { message?: string } }).error?.message || '')
        : ''

    if (!mapReady.value && /webgl/i.test(errorMessage)) {
      mapInitError.value = getWebGlUnavailableMessage()
      mapLoading.value = false

      if (map) {
        try {
          map.remove()
        } catch (removeError) {
          console.error('Unable to clean up Mapbox after WebGL failure:', removeError)
        }
        map = null
      }

      return
    }

    mapError.value = 'Unable to refresh the interactive map right now.'
    mapLoading.value = false
  })
}

const handleWindowResize = () => {
  if (!map) return

  map.resize()

  if (mapReady.value && !mapContainsAllPoints()) {
    fitToAllPoints()
  }
}

watch(
  () => props.riderLocation,
  (value) => {
    if (!liveRiderLocation.value && value) {
      liveRiderLocation.value = value
    }

    if (value?.updatedAt && liveRiderLocation.value?.updatedAt) {
      const incoming = new Date(value.updatedAt).getTime()
      const current = new Date(liveRiderLocation.value.updatedAt).getTime()

      if (!Number.isNaN(incoming) && (Number.isNaN(current) || incoming >= current)) {
        liveRiderLocation.value = value
      }
    }

    syncMapScene({ fitIfPointCountIncreases: true })
  },
  { deep: true },
)

watch(
  () => [props.pickupLocation, props.deliveryLocation],
  () => {
    syncMapScene({ fitIfPointCountIncreases: true })
  },
  { deep: true },
)

watch(
  () => props.panelCollapsed,
  () => {
    window.setTimeout(() => {
      map?.resize()
      syncMapScene({ fit: true })
    }, 120)
  },
)

watch(
  () => props.trackOwnLocation,
  async (shouldTrack) => {
    if (shouldTrack) {
      await startOwnLocationTracking()

      if (trackingChannel && liveRiderLocation.value) {
        await publishRiderLocation(liveRiderLocation.value)
      }

      return
    }

    stopOwnLocationTracking()
  },
)

onMounted(async () => {
  heartbeatInterval = window.setInterval(() => {
    heartbeat.value = Date.now()
  }, 30_000)

  await Promise.all([subscribeToTracking(), initMap()])
  await startOwnLocationTracking()
  window.addEventListener('resize', handleWindowResize)
})

onUnmounted(async () => {
  if (routeRefreshTimeout) window.clearTimeout(routeRefreshTimeout)
  if (heartbeatInterval) window.clearInterval(heartbeatInterval)
  window.removeEventListener('resize', handleWindowResize)

  stopOwnLocationTracking()

  if (trackingChannel) {
    if (props.trackOwnLocation) {
      try {
        await trackingChannel.send({
          type: 'broadcast',
          event: 'rider-location-ended',
          payload: { updatedAt: new Date().toISOString() },
        })
      } catch (error) {
        console.error('Unable to announce tracking stop:', error)
      }
    }

    supabase.removeChannel(trackingChannel)
    trackingChannel = null
  }

  if (map) {
    map.remove()
    map = null
  }
})
</script>

<template>
  <section
    class="tracking-card"
    :class="{
      'tracking-card--fullscreen': fullscreen,
      'tracking-card--panel-collapsed': panelCollapsed,
    }"
  >
    <div class="tracking-stage">
      <div class="tracking-stage__map">
        <div class="tracking-stage__map-frame">
          <div ref="mapContainer" class="tracking-map"></div>

          <div v-if="mapLoading" class="tracking-overlay">
            <v-progress-circular indeterminate color="#2f7de1" size="42" />
            <p>Preparing the tracking map...</p>
          </div>

          <div v-else-if="mapInitError" class="tracking-overlay tracking-overlay--error">
            <v-icon size="42" color="#d97706">mdi-map-off</v-icon>
            <p>{{ mapInitError }}</p>
          </div>

          <div v-if="fullscreen" class="tracking-map-floating-actions">
            <v-btn
              color="white"
              variant="elevated"
              size="small"
              class="tracking-map-floating-btn"
              :disabled="!canFitMap"
              @click="fitToAllPoints"
            >
              <v-icon start size="16">mdi-fit-to-screen-outline</v-icon>
              Fit map
            </v-btn>
          </div>
        </div>

        <div v-if="!fullscreen" class="tracking-map-actions">
          <v-btn
            v-if="showFullscreenButton"
            color="primary"
            variant="flat"
            size="large"
            class="tracking-map-action tracking-map-action--primary"
            @click="emit('open-fullscreen')"
          >
            <v-icon start size="18">mdi-map-search-outline</v-icon>
            {{ fullscreenButtonLabel }}
          </v-btn>

          <v-btn
            color="primary"
            variant="tonal"
            size="large"
            class="tracking-map-action tracking-map-action--secondary"
            :disabled="!canFitMap"
            @click="fitToAllPoints"
          >
            <v-icon start size="18">mdi-fit-to-screen-outline</v-icon>
            Fit map
          </v-btn>
        </div>
      </div>

      <div class="tracking-panel">
        <div class="tracking-panel__header">
          <div>
            <p class="tracking-eyebrow">{{ viewerEyebrow }}</p>
            <h3>{{ title }}</h3>
            <p class="tracking-subtitle">{{ summarySubtitle }}</p>
          </div>

          <div class="tracking-chip-row">
            <span class="tracking-chip" :class="`tracking-chip--${riderStatusTone}`">
              {{ riderStatusLabel }}
            </span>
            <span class="tracking-chip tracking-chip--muted">
              {{ trackedPointCount }} map point{{ trackedPointCount === 1 ? '' : 's' }}
            </span>
          </div>
        </div>

        <div class="tracking-stats">
          <article v-for="stat in routeSummaryCards" :key="stat.label" class="tracking-stat">
            <v-icon size="18" color="#2f7de1">{{ stat.icon }}</v-icon>
            <div>
              <div class="tracking-stat__label">{{ stat.label }}</div>
              <div class="tracking-stat__value">
                {{ routeLoading ? 'Refreshing...' : stat.value }}
              </div>
            </div>
          </article>
        </div>

        <div class="tracking-location-list">
          <button
            v-for="card in locationCards"
            :key="card.key"
            class="tracking-location"
            :class="[
              `tracking-location--${card.tone}`,
              { 'tracking-location--disabled': !card.location },
            ]"
            type="button"
            :disabled="!card.location"
            @click="focusPoint(card.key as 'rider' | 'pickup' | 'delivery')"
          >
            <span class="tracking-location__icon">
              <v-icon size="18">{{ card.icon }}</v-icon>
            </span>

            <span class="tracking-location__content">
              <span class="tracking-location__title">{{ card.title }}</span>
              <span class="tracking-location__name">{{ card.subtitle }}</span>
              <span class="tracking-location__address">{{ card.address }}</span>
            </span>

            <span class="tracking-location__meta">{{ card.meta }}</span>
          </button>
        </div>

        <v-alert
          v-if="displayedMapError"
          type="warning"
          variant="tonal"
          density="comfortable"
          class="tracking-alert"
        >
          {{ displayedMapError }}
        </v-alert>
      </div>
    </div>
  </section>
</template>

<style scoped>
.tracking-card {
  width: 100%;
  border-radius: 24px;
  overflow: hidden;
  background:
    radial-gradient(circle at top left, rgba(47, 125, 225, 0.12), transparent 40%),
    linear-gradient(180deg, #ffffff, #f6f9ff);
  border: 1px solid rgba(53, 77, 124, 0.08);
  box-shadow: 0 24px 60px rgba(18, 48, 79, 0.12);
}

.tracking-card--fullscreen {
  height: 100%;
  min-height: 0;
  border-radius: 0;
  border: 0;
  box-shadow: none;
}

.tracking-card--fullscreen .tracking-stage {
  min-height: 100%;
}

.tracking-card--fullscreen .tracking-stage__map,
.tracking-card--fullscreen .tracking-map {
  min-height: 100%;
}

.tracking-card--fullscreen .tracking-panel {
  max-height: 100%;
  overflow: auto;
  background: rgba(255, 255, 255, 0.94);
  backdrop-filter: blur(18px);
  border-left: 1px solid rgba(53, 77, 124, 0.08);
  padding-bottom: calc(22px + env(safe-area-inset-bottom, 0px));
}

.tracking-card--panel-collapsed .tracking-stage {
  grid-template-columns: 1fr;
}

.tracking-card--panel-collapsed .tracking-panel {
  display: none;
}

.tracking-stage {
  display: grid;
  grid-template-columns: minmax(0, 1.4fr) minmax(320px, 0.8fr);
  min-height: 100%;
}

.tracking-stage__map {
  display: flex;
  flex-direction: column;
  background: #dbe7f8;
}

.tracking-stage__map-frame {
  position: relative;
  min-height: 360px;
  flex: 1 1 auto;
}

.tracking-map {
  width: 100%;
  height: 100%;
  min-height: 360px;
}

.tracking-overlay {
  position: absolute;
  inset: 20px;
  display: grid;
  place-items: center;
  gap: 10px;
  text-align: center;
  color: #12304f;
  background: rgba(255, 255, 255, 0.75);
  border-radius: 20px;
  backdrop-filter: blur(12px);
}

.tracking-overlay--error {
  padding: 24px;
  align-content: center;
  background: rgba(255, 248, 235, 0.92);
  border: 1px solid rgba(217, 119, 6, 0.18);
}

.tracking-overlay--error p {
  max-width: 440px;
  margin: 0;
  font-size: 0.94rem;
  line-height: 1.5;
}

.tracking-map-actions {
  display: flex;
  gap: 12px;
  padding: 16px;
  background: rgba(255, 255, 255, 0.92);
  border-top: 1px solid rgba(53, 77, 124, 0.08);
}

.tracking-map-action {
  flex: 1 1 0;
  min-width: 0;
  font-weight: 700;
  letter-spacing: 0;
  text-transform: none;
}

.tracking-map-action--primary {
  box-shadow: 0 16px 30px rgba(47, 125, 225, 0.18);
}

.tracking-map-action--secondary {
  color: #1f4f8a;
}

.tracking-map-floating-actions {
  position: absolute;
  left: 16px;
  bottom: 16px;
  z-index: 3;
}

.tracking-map-floating-btn {
  font-weight: 700;
  text-transform: none;
  color: #12304f !important;
  box-shadow: 0 14px 30px rgba(18, 48, 79, 0.18);
}

.tracking-panel {
  padding: 22px;
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.tracking-panel__header {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.tracking-eyebrow {
  margin: 0 0 6px;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #5276b0;
}

.tracking-panel__header h3 {
  margin: 0;
  font-size: 1.25rem;
  line-height: 1.2;
  color: #102a43;
}

.tracking-subtitle {
  margin: 8px 0 0;
  font-size: 0.92rem;
  line-height: 1.5;
  color: #52667d;
}

.tracking-chip-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.tracking-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 32px;
  padding: 0 12px;
  border-radius: 999px;
  font-size: 0.78rem;
  font-weight: 700;
}

.tracking-chip--live {
  color: #0a6b3f;
  background: rgba(56, 191, 113, 0.14);
}

.tracking-chip--stale {
  color: #875b00;
  background: rgba(244, 183, 58, 0.16);
}

.tracking-chip--idle,
.tracking-chip--muted {
  color: #52667d;
  background: rgba(82, 118, 176, 0.1);
}

.tracking-stats {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.tracking-stat {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 14px;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.88);
  border: 1px solid rgba(53, 77, 124, 0.07);
}

.tracking-stat__label {
  font-size: 0.78rem;
  color: #627d98;
}

.tracking-stat__value {
  margin-top: 4px;
  font-size: 0.96rem;
  font-weight: 700;
  color: #102a43;
}

.tracking-location-list {
  display: grid;
  gap: 10px;
}

.tracking-location {
  width: 100%;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: flex-start;
  gap: 12px;
  padding: 14px;
  border: 1px solid rgba(53, 77, 124, 0.08);
  border-radius: 18px;
  background: #ffffff;
  color: inherit;
  text-align: left;
  transition:
    transform 0.2s ease,
    border-color 0.2s ease,
    box-shadow 0.2s ease;
}

.tracking-location:not(:disabled):hover {
  transform: translateY(-1px);
  border-color: rgba(47, 125, 225, 0.3);
  box-shadow: 0 16px 32px rgba(18, 48, 79, 0.08);
}

.tracking-location--disabled {
  opacity: 0.68;
}

.tracking-location__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  border-radius: 12px;
  color: #fff;
}

.tracking-location--rider .tracking-location__icon {
  background: linear-gradient(135deg, #2f7de1, #1b5fbe);
}

.tracking-location--pickup .tracking-location__icon {
  background: linear-gradient(135deg, #f59e0b, #d97706);
}

.tracking-location--delivery .tracking-location__icon {
  background: linear-gradient(135deg, #22a06b, #178352);
}

.tracking-location__content {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.tracking-location__title {
  font-size: 0.74rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: #5276b0;
}

.tracking-location__name {
  font-size: 0.96rem;
  font-weight: 700;
  color: #102a43;
}

.tracking-location__address {
  font-size: 0.82rem;
  line-height: 1.45;
  color: #52667d;
}

.tracking-location__meta {
  font-size: 0.74rem;
  line-height: 1.3;
  text-align: right;
  color: #7b8794;
}

.tracking-alert {
  margin: 0;
}

:deep(.mapboxgl-ctrl-top-right) {
  top: 12px;
  right: 12px;
}

:deep(.mapboxgl-ctrl-bottom-right) {
  right: 12px;
  bottom: 12px;
}

:deep(.mapboxgl-ctrl-group) {
  border-radius: 14px;
  overflow: hidden;
  box-shadow: 0 14px 28px rgba(18, 48, 79, 0.16);
}

:deep(.tracking-marker) {
  background: transparent;
  border: 0;
  padding: 0;
  cursor: pointer;
  transform: translateY(10px);
}

:deep(.tracking-marker__bubble) {
  width: 44px;
  height: 44px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 18px;
  border: 3px solid rgba(255, 255, 255, 0.94);
  color: #fff;
  box-shadow: 0 12px 24px rgba(18, 48, 79, 0.24);
  position: relative;
}

:deep(.tracking-marker__bubble::after) {
  content: '';
  position: absolute;
  left: 50%;
  bottom: -8px;
  width: 14px;
  height: 14px;
  background: inherit;
  transform: translateX(-50%) rotate(45deg);
  border-radius: 4px;
  z-index: -1;
}

:deep(.tracking-marker--rider .tracking-marker__bubble) {
  background: linear-gradient(135deg, #2f7de1, #1b5fbe);
}

:deep(.tracking-marker--pickup .tracking-marker__bubble) {
  background: linear-gradient(135deg, #f59e0b, #d97706);
}

:deep(.tracking-marker--delivery .tracking-marker__bubble) {
  background: linear-gradient(135deg, #22a06b, #178352);
}

:deep(.tracking-marker__bubble i) {
  font-size: 22px;
  line-height: 1;
}

:deep(.tracking-marker__label) {
  position: absolute;
  left: 50%;
  bottom: -34px;
  transform: translateX(-50%);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 24px;
  padding: 0 10px;
  border-radius: 999px;
  background: rgba(16, 42, 67, 0.92);
  color: #fff;
  font-size: 0.68rem;
  font-weight: 700;
  white-space: nowrap;
}

:deep(.tracking-popup) {
  min-width: 190px;
  color: #102a43;
}

:deep(.tracking-popup__title) {
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #5276b0;
}

:deep(.tracking-popup__subtitle) {
  margin-top: 4px;
  font-size: 0.96rem;
  font-weight: 700;
}

:deep(.tracking-popup__address) {
  margin-top: 6px;
  font-size: 0.8rem;
  line-height: 1.45;
  color: #52667d;
}

:deep(.tracking-popup__meta) {
  margin-top: 8px;
  font-size: 0.74rem;
  color: #7b8794;
}

@media (max-width: 1080px) {
  .tracking-stage {
    grid-template-columns: 1fr;
  }

  .tracking-stage__map,
  .tracking-stage__map-frame,
  .tracking-map {
    min-height: 340px;
  }

  .tracking-card--fullscreen .tracking-stage {
    position: relative;
    height: 100%;
  }

  .tracking-card--fullscreen .tracking-stage__map,
  .tracking-card--fullscreen .tracking-stage__map-frame,
  .tracking-card--fullscreen .tracking-map {
    min-height: 100%;
  }

  .tracking-card--fullscreen:not(.tracking-card--panel-collapsed) .tracking-panel {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 4;
    max-height: min(46dvh, 460px);
    border-left: 0;
    border-top: 1px solid rgba(53, 77, 124, 0.08);
    border-radius: 28px 28px 0 0;
    box-shadow: 0 -18px 46px rgba(18, 48, 79, 0.18);
  }
}

@media (max-width: 720px) {
  .tracking-card {
    border-radius: 20px;
  }

  .tracking-panel {
    padding: 16px;
  }

  .tracking-panel__header h3 {
    font-size: 1.1rem;
  }

  .tracking-subtitle {
    font-size: 0.86rem;
  }

  .tracking-stats {
    grid-template-columns: 1fr;
  }

  .tracking-location {
    grid-template-columns: auto minmax(0, 1fr);
  }

  .tracking-location__meta {
    grid-column: 2;
    text-align: left;
  }

  .tracking-stage__map,
  .tracking-stage__map-frame,
  .tracking-map {
    min-height: 300px;
  }

  .tracking-card--fullscreen {
    border-radius: 0;
  }

  .tracking-map-actions {
    flex-direction: column;
    padding: 12px;
  }

  .tracking-card--fullscreen:not(.tracking-card--panel-collapsed) .tracking-panel {
    max-height: min(52dvh, 500px);
    padding: 16px 16px calc(18px + env(safe-area-inset-bottom, 0px));
  }

  :deep(.tracking-marker__bubble) {
    width: 40px;
    height: 40px;
    border-radius: 16px;
  }

  :deep(.tracking-marker__bubble i) {
    font-size: 20px;
  }

  :deep(.tracking-marker__label) {
    font-size: 0.62rem;
  }
}
</style>
