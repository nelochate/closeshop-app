<<<<<<< HEAD
// 🧭 useGeolocation composable - Android Optimized for Capacitor
// ------------------------------------------------------------
// This Vue composable provides reactive access to the user's
// geolocation data with proper Android/Capacitor support.
// ------------------------------------------------------------

import { ref, onUnmounted } from 'vue'
import { Geolocation } from '@capacitor/geolocation'
import { Capacitor } from '@capacitor/core'

export function useGeolocation() {
=======
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
>>>>>>> 60136d593ea6f108a4b2a0949e150167fd61b2bb
  // Reactive state for coordinates
  const latitude = ref<number | null>(null)
  const longitude = ref<number | null>(null)
  const accuracy = ref<number | null>(null)
<<<<<<< HEAD
  const error = ref<string | null>(null)
=======
  const heading = ref<number | null>(null)
  const speed = ref<number | null>(null)
>>>>>>> 60136d593ea6f108a4b2a0949e150167fd61b2bb

  // Flags
  const watching = ref(false)
  const permissionGranted = ref(false)
  const permissionDenied = ref(false)
<<<<<<< HEAD

  // Platform detection
  const isNative = Capacitor.isNativePlatform()
  const isAndroid = Capacitor.getPlatform() === 'android'

  // Keep track of the geolocation watcher ID for cleanup
  let watchId: string | null = null

  // ------------------------------------------------------------
  // 🧾 requestPermission()
  // Requests location permission specifically for Android
  // ------------------------------------------------------------
  const requestPermission = async (): Promise<boolean> => {
    console.log('📍 Requesting location permission...')
    console.log('Platform:', Capacitor.getPlatform())
    console.log('Is Native:', isNative)
    
    try {
      if (isNative) {
        // ANDROID / IOS - Use Capacitor Geolocation
        console.log('Using Capacitor Geolocation for native platform')
        
        // Check current permission status
        const permStatus = await Geolocation.checkPermissions()
        console.log('Current permission status:', permStatus)
        
        if (permStatus.location === 'granted') {
          console.log('Permission already granted')
          permissionGranted.value = true
          permissionDenied.value = false
          return true
        }
        
        // Request permission
        console.log('Requesting permission...')
        const requestStatus = await Geolocation.requestPermissions()
        console.log('Permission request result:', requestStatus)
        
        const granted = requestStatus.location === 'granted'
        
        if (granted) {
          console.log('Permission granted successfully')
          permissionGranted.value = true
          permissionDenied.value = false
        } else {
          console.log('Permission denied')
          permissionGranted.value = false
          permissionDenied.value = true
          error.value = 'Location permission denied'
        }
        
        return granted
      } else {
        // WEB - Use browser geolocation
        console.log('Using browser geolocation for web platform')
        
        if (!navigator.geolocation) {
          error.value = 'Geolocation is not supported by your browser.'
          return false
        }

        return new Promise((resolve) => {
          navigator.geolocation.getCurrentPosition(
            () => {
              console.log('Web permission granted')
              permissionGranted.value = true
              permissionDenied.value = false
              resolve(true)
            },
            (err) => {
              console.log('Web permission denied:', err)
              permissionGranted.value = false
              permissionDenied.value = true
              error.value = getWebErrorMessage(err)
              resolve(false)
            },
            {
              enableHighAccuracy: true,
              timeout: 10000,
              maximumAge: 0
            }
          )
        })
      }
    } catch (err) {
      console.error('Error requesting permission:', err)
      error.value = err instanceof Error ? err.message : 'Unknown error requesting permission'
      permissionGranted.value = false
      permissionDenied.value = true
      return false
    }
  }

  // ------------------------------------------------------------
  // 📍 getCurrentPosition()
  // Gets current location once - Android optimized
  // ------------------------------------------------------------
  const getCurrentPosition = async () => {
    console.log('📍 Getting current position...')
    
    try {
      // First ensure we have permission
      const hasPermission = await requestPermission()
      if (!hasPermission) {
        throw new Error('Location permission not granted')
      }

      if (isNative) {
        // ANDROID - Use Capacitor Geolocation
        console.log('Getting position with Capacitor Geolocation...')
        
        const position = await Geolocation.getCurrentPosition({
          enableHighAccuracy: true,  // Use GPS on Android
          timeout: 15000,           // 15 seconds for Android
          maximumAge: 0            // Don't use cached position
        })
        
        console.log('Position received:', position)
        
        // Update reactive state
        latitude.value = position.coords.latitude
        longitude.value = position.coords.longitude
        accuracy.value = position.coords.accuracy
        error.value = null
        
        return position
      } else {
        // WEB - Use browser geolocation
        return new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(
            (position) => {
              latitude.value = position.coords.latitude
              longitude.value = position.coords.longitude
              accuracy.value = position.coords.accuracy
              error.value = null
              resolve(position)
            },
            (err) => {
              error.value = getWebErrorMessage(err)
              reject(err)
            },
            {
              enableHighAccuracy: true,
              timeout: 10000,
              maximumAge: 0
            }
          )
        })
      }
    } catch (err) {
      console.error('Error getting current position:', err)
      error.value = err instanceof Error ? err.message : 'Unknown error getting position'
      throw err
    }
=======
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
>>>>>>> 60136d593ea6f108a4b2a0949e150167fd61b2bb
  }

  // ------------------------------------------------------------
  // 🛰 startWatching()
  // Starts continuously tracking the user's position
<<<<<<< HEAD
  // Android optimized with Capacitor
  // ------------------------------------------------------------
  const startWatching = async () => {
    console.log('📍 Starting location watch...')
    
    if (watching.value) {
      console.log('Already watching location')
      return
    }

    try {
      // First ensure we have permission
      const hasPermission = await requestPermission()
      if (!hasPermission) {
        throw new Error('Location permission not granted')
      }

      if (isNative) {
        // ANDROID - Use Capacitor Geolocation watchPosition
        console.log('Starting Capacitor Geolocation watch...')
        
        watchId = await Geolocation.watchPosition(
          {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 0
          },
          (position, err) => {
            if (err) {
              console.error('Watch position error:', err)
              error.value = err.message
              return
            }
            
            if (position) {
              console.log('Position updated:', position.coords)
              latitude.value = position.coords.latitude
              longitude.value = position.coords.longitude
              accuracy.value = position.coords.accuracy
              error.value = null
            }
          }
        )
        
        console.log('Watch ID:', watchId)
        watching.value = true
      } else {
        // WEB - Use browser geolocation watchPosition
        const id = navigator.geolocation.watchPosition(
          (position) => {
            latitude.value = position.coords.latitude
            longitude.value = position.coords.longitude
            accuracy.value = position.coords.accuracy
            error.value = null
          },
          (err) => {
            error.value = getWebErrorMessage(err)
          },
          {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 0
          }
        )
        watchId = id.toString()
        watching.value = true
      }
    } catch (err) {
      console.error('Error starting location watch:', err)
      error.value = err instanceof Error ? err.message : 'Unknown error starting watch'
      throw err
    }
=======
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
>>>>>>> 60136d593ea6f108a4b2a0949e150167fd61b2bb
  }

  // ------------------------------------------------------------
  // 🛑 stopWatching()
  // Stops the ongoing geolocation watcher
  // ------------------------------------------------------------
  const stopWatching = () => {
<<<<<<< HEAD
    console.log('📍 Stopping location watch...')
    
    if (watchId) {
      if (isNative) {
        // ANDROID - Use Capacitor clearWatch
        Geolocation.clearWatch({ id: watchId })
          .then(() => console.log('Watch cleared'))
          .catch(err => console.error('Error clearing watch:', err))
      } else {
        // WEB - Use browser clearWatch
        navigator.geolocation.clearWatch(parseInt(watchId))
      }
      
      watchId = null
    }
    
    watching.value = false
    console.log('Location watch stopped')
=======
    if (watchId !== null) {
      navigator.geolocation.clearWatch(watchId)
      watchId = null
    }
    watching.value = false
>>>>>>> 60136d593ea6f108a4b2a0949e150167fd61b2bb
  }

  // ------------------------------------------------------------
  // 🎯 recenterToLocation()
<<<<<<< HEAD
  // Helper function to center map on user's location
  // ------------------------------------------------------------
  const recenterToLocation = (map: any) => {
    if (!latitude.value || !longitude.value) {
      error.value = 'No location data available'
      return false
=======
  // Helper function to center map on user's location (Mapbox specific)
  // ------------------------------------------------------------
  const recenterToLocation = (map: any) => {
    if (!latitude.value || !longitude.value) {
      throw new Error('No location data available')
>>>>>>> 60136d593ea6f108a4b2a0949e150167fd61b2bb
    }

    if (map && typeof map.flyTo === 'function') {
      map.flyTo({
        center: [longitude.value, latitude.value],
        zoom: 16,
        essential: true,
        duration: 1000,
      })
<<<<<<< HEAD
      return true
    }
    
    return false
  }

  // ------------------------------------------------------------
  // 🆘 Helper function for web error messages
  // ------------------------------------------------------------
  const getWebErrorMessage = (error: GeolocationPositionError): string => {
    switch (error.code) {
      case error.PERMISSION_DENIED:
        permissionDenied.value = true
        return 'Location permission denied. Please enable location services in your browser.'
=======
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
>>>>>>> 60136d593ea6f108a4b2a0949e150167fd61b2bb
      case error.POSITION_UNAVAILABLE:
        return 'Location information is unavailable.'
      case error.TIMEOUT:
        return 'Location request timed out.'
      default:
        return 'An unknown error occurred.'
    }
  }

  // ------------------------------------------------------------
<<<<<<< HEAD
  // 🔄 refreshLocation()
  // Force a fresh location update
  // ------------------------------------------------------------
  const refreshLocation = async () => {
    try {
      const position = await getCurrentPosition()
      return position
    } catch (err) {
      console.error('Error refreshing location:', err)
      throw err
    }
  }

  // ------------------------------------------------------------
=======
>>>>>>> 60136d593ea6f108a4b2a0949e150167fd61b2bb
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
<<<<<<< HEAD
    error,
    watching,
    permissionGranted,
    permissionDenied,
    
    // Platform info
    isNative,
    isAndroid,
    
    // Methods
    requestPermission,
    getCurrentPosition,
    startWatching,
    stopWatching,
    recenterToLocation,
    refreshLocation,
=======
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
>>>>>>> 60136d593ea6f108a4b2a0949e150167fd61b2bb
    
    // Convenience computed values
    hasLocation: () => latitude.value !== null && longitude.value !== null,
    isTracking: () => watching.value,
  }
<<<<<<< HEAD
}
=======
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
>>>>>>> 60136d593ea6f108a4b2a0949e150167fd61b2bb
