import { ref, onUnmounted } from 'vue'

export function useGeolocation() {
  const latitude = ref<number | null>(null)
  const longitude = ref<number | null>(null)
  const watching = ref(false)

  const requestPermission = async () => {
    if (!navigator.geolocation) {
      throw new Error('Geolocation is not supported by your browser.')
    }
    return new Promise<void>((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          latitude.value = position.coords.latitude
          longitude.value = position.coords.longitude
          resolve()
        },
        (error) => reject(error)
      )
    })
  }

  const getLocation = async () => {
    if (!navigator.geolocation) {
      throw new Error('Geolocation is not supported by your browser.')
    }
    return new Promise<void>((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          latitude.value = position.coords.latitude
          longitude.value = position.coords.longitude
          resolve()
        },
        (error) => reject(error)
      )
    })
  }

  let watchId: number | null = null

  const startWatching = () => {
    if (!navigator.geolocation) {
      throw new Error('Geolocation is not supported by your browser.')
    }
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

  const stopWatching = () => {
    if (watchId !== null) {
      navigator.geolocation.clearWatch(watchId)
      watchId = null
    }
    watching.value = false
  }

  onUnmounted(() => {
    stopWatching()
  })

  return {
    latitude,
    longitude,
    requestPermission,
    getLocation,
    startWatching,
    stopWatching,
  }
}
