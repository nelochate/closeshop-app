// 🧭 useGeolocation composable - Enhanced for Mapbox
// ------------------------------------------------------------
// This Vue composable provides reactive access to the user's
// geolocation data (latitude and longitude). It supports:
// - One-time location retrieval
// - Continuous tracking (watch mode)
// - Stopping geolocation tracking when no longer needed
// - Optional Mapbox integration
// ------------------------------------------------------------

import { ref, onUnmounted } from 'vue'

export function useGeolocation(options?: {
  enableHighAccuracy?: boolean
  timeout?: number
  maximumAge?: number
  mapboxControl?: any // Optional Mapbox geolocate control
}) {
  // Reactive state for coordinates
  const latitude = ref<number | null>(null)
  const longitude = ref<number | null>(null)
  const accuracy = ref<number | null>(null)
  const heading = ref<number | null>(null)
  const speed = ref<number | null>(null)

  // Flags
  const watching = ref(false)
  const permissionGranted = ref(false)
  const permissionDenied = ref(false)
  const error = ref<string | null>(null)

  // Default options
  const defaultOptions = {
    enableHighAccuracy: true,
    timeout: 10000, // 10 seconds
    maximumAge: 0,
    ...options
  }

  // Keep track of the geolocation watcher ID for cleanup
  let watchId: number | null = null

  // ------------------------------------------------------------
  // 🧾 requestPermission()
  // Requests location permission and fetches initial position.
  // ------------------------------------------------------------
  const requestPermission = async () => {
    if (!navigator.geolocation) {
      error.value = 'Geolocation is not supported by your browser.'
      throw new Error(error.value)
    }

    return new Promise<void>((resolve, reject) => {
      const success = (position: GeolocationPosition) => {
        latitude.value = position.coords.latitude
        longitude.value = position.coords.longitude
        accuracy.value = position.coords.accuracy
        heading.value = position.coords.heading ?? null
        speed.value = position.coords.speed ?? null
        permissionGranted.value = true
        error.value = null
        resolve()
      }

      const failure = (err: GeolocationPositionError) => {
        permissionDenied.value = true
        error.value = getErrorMessage(err)
        reject(err)
      }

      // Use Mapbox control if available
      if (options?.mapboxControl) {
        try {
          options.mapboxControl.trigger()
          // Mapbox will handle permission internally
          permissionGranted.value = true
          resolve()
        } catch (err) {
          failure(err as GeolocationPositionError)
        }
      } else {
        // Use standard browser API
        navigator.geolocation.getCurrentPosition(
          success,
          failure,
          defaultOptions
        )
      }
    })
  }

  // ------------------------------------------------------------
  // 📍 getLocation()
  // Fetches the current location once
  // ------------------------------------------------------------
  const getLocation = async () => {
    if (!navigator.geolocation) {
      error.value = 'Geolocation is not supported by your browser.'
      throw new Error(error.value)
    }

    return new Promise<GeolocationPosition>((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          latitude.value = position.coords.latitude
          longitude.value = position.coords.longitude
          accuracy.value = position.coords.accuracy
          heading.value = position.coords.heading ?? null
          speed.value = position.coords.speed ?? null
          error.value = null
          resolve(position)
        },
        (err) => {
          error.value = getErrorMessage(err)
          reject(err)
        },
        defaultOptions
      )
    })
  }

  // ------------------------------------------------------------
  // 🛰 startWatching()
  // Starts continuously tracking the user's position
  // ------------------------------------------------------------
  const startWatching = () => {
    if (!navigator.geolocation) {
      error.value = 'Geolocation is not supported by your browser.'
      throw new Error(error.value)
    }

    if (watching.value) return

    watching.value = true
    watchId = navigator.geolocation.watchPosition(
      (position) => {
        latitude.value = position.coords.latitude
        longitude.value = position.coords.longitude
        accuracy.value = position.coords.accuracy
        heading.value = position.coords.heading ?? null
        speed.value = position.coords.speed ?? null
        error.value = null
      },
      (err) => {
        error.value = getErrorMessage(err)
        console.error('Error watching position:', err)
      },
      defaultOptions
    )
  }

  // ------------------------------------------------------------
  // 🛑 stopWatching()
  // Stops the ongoing geolocation watcher
  // ------------------------------------------------------------
  const stopWatching = () => {
    if (watchId !== null) {
      navigator.geolocation.clearWatch(watchId)
      watchId = null
    }
    watching.value = false
  }

  // ------------------------------------------------------------
  // 🎯 recenterToLocation()
  // Helper function to center map on user's location (Mapbox specific)
  // ------------------------------------------------------------
  const recenterToLocation = (map: any) => {
    if (!latitude.value || !longitude.value) {
      throw new Error('No location data available')
    }

    if (map && typeof map.flyTo === 'function') {
      map.flyTo({
        center: [longitude.value, latitude.value],
        zoom: 16,
        essential: true,
        duration: 1000,
      })
    }
  }

  // ------------------------------------------------------------
  // 🆘 Helper function for error messages
  // ------------------------------------------------------------
  const getErrorMessage = (error: GeolocationPositionError): string => {
    switch (error.code) {
      case error.PERMISSION_DENIED:
        permissionDenied.value = true
        return 'Location permission denied. Please enable location services.'
      case error.POSITION_UNAVAILABLE:
        return 'Location information is unavailable.'
      case error.TIMEOUT:
        return 'Location request timed out.'
      default:
        return 'An unknown error occurred.'
    }
  }

  // ------------------------------------------------------------
  // 🧹 Lifecycle cleanup
  // ------------------------------------------------------------
  onUnmounted(() => {
    stopWatching()
  })

  // ------------------------------------------------------------
  // Expose everything
  // ------------------------------------------------------------
  return {
    // Reactive state
    latitude,
    longitude,
    accuracy,
    heading,
    speed,
    watching,
    permissionGranted,
    permissionDenied,
    error,
    
    // Methods
    requestPermission,
    getLocation,
    startWatching,
    stopWatching,
    recenterToLocation,
    
    // Convenience computed values
    hasLocation: () => latitude.value !== null && longitude.value !== null,
    isTracking: () => watching.value,
  }
}


/*
// 🧭 useGeolocation composable
// ------------------------------------------------------------
// This Vue composable provides reactive access to the user's
// geolocation data (latitude and longitude). It supports:
// - One-time location retrieval
// - Continuous tracking (watch mode)
// - Stopping geolocation tracking when no longer needed
// ------------------------------------------------------------

import { ref, onUnmounted } from 'vue'

export function useGeolocation() {
  // Reactive state for coordinates
  const latitude = ref<number | null>(null)
  const longitude = ref<number | null>(null)

  // Flag to indicate if we are currently tracking the user
  const watching = ref(false)

  // ------------------------------------------------------------
  // 🧾 requestPermission()
  // Requests location permission and fetches initial position.
  // This is useful to trigger the browser's permission prompt
  // before starting background tracking.
  // ------------------------------------------------------------
  const requestPermission = async () => {
    if (!navigator.geolocation) {
      throw new Error('Geolocation is not supported by your browser.')
    }

    return new Promise<void>((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          // Store user's current coordinates
          latitude.value = position.coords.latitude
          longitude.value = position.coords.longitude
          resolve()
        },
        (error) => reject(error) // Handle denied or failed requests
      )
    })
  }

  // ------------------------------------------------------------
  // 📍 getLocation()
  // Fetches the current location once (without continuous tracking)
  // and updates the reactive latitude/longitude refs.
  // Returns a Promise that resolves once a position is retrieved.
  // ------------------------------------------------------------
  const getLocation = async () => {
    if (!navigator.geolocation) {
      throw new Error('Geolocation is not supported by your browser.')
    }

    return new Promise<GeolocationPosition>((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          latitude.value = position.coords.latitude
          longitude.value = position.coords.longitude
          resolve(position) // Return the position for convenience
        },
        (error) => reject(error)
      )
    })
  }

  // Keep track of the geolocation watcher ID for cleanup
  let watchId: number | null = null

  // ------------------------------------------------------------
  // 🛰 startWatching()
  // Starts continuously tracking the user's position using
  // navigator.geolocation.watchPosition(). Each time the user's
  // position changes, the reactive latitude and longitude are updated.
  // ------------------------------------------------------------
  const startWatching = () => {
    if (!navigator.geolocation) {
      throw new Error('Geolocation is not supported by your browser.')
    }

    // Prevent multiple watchers from being started
    if (watching.value) return

    watching.value = true
    watchId = navigator.geolocation.watchPosition(
      (position) => {
        latitude.value = position.coords.latitude
        longitude.value = position.coords.longitude
      },
      (error) => console.error('Error watching position:', error)
    )
  }

  // ------------------------------------------------------------
  // 🛑 stopWatching()
  // Stops the ongoing geolocation watcher to save resources.
  // Should be called when the component unmounts or when
  // location tracking is no longer needed.
  // ------------------------------------------------------------
  const stopWatching = () => {
    if (watchId !== null) {
      navigator.geolocation.clearWatch(watchId)
      watchId = null
    }
    watching.value = false
  }

  // ------------------------------------------------------------
  // 🧹 Lifecycle cleanup
  // Automatically stop tracking when the component using this
  // composable is unmounted to prevent memory leaks.
  // ------------------------------------------------------------
  onUnmounted(() => {
    stopWatching()
  })

  // ------------------------------------------------------------
  // Expose the reactive data and functions to components
  // ------------------------------------------------------------
  return {
    latitude,
    longitude,
    requestPermission,
    getLocation,
    startWatching,
    stopWatching,
  }
}
*/