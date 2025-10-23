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
