// src/composables/useGeolocation.ts
import { ref } from 'vue'
import { Geolocation } from '@capacitor/geolocation'

const latitude = ref<number | null>(null)
const longitude = ref<number | null>(null)
const error = ref<string | null>(null)
let watchId: string | null = null

const requestPermission = async () => {
  try {
    const permResult = await Geolocation.requestPermissions()
    console.log('Permission result:', permResult)
    return permResult
  } catch (err: any) {
    error.value = err.message
    console.error('Permission error:', err)
  }
}

const getLocation = async () => {
  try {
    const position = await Geolocation.getCurrentPosition({
      enableHighAccuracy: true,
      timeout: 10000,
    })
    latitude.value = position.coords.latitude
    longitude.value = position.coords.longitude
    return position
  } catch (err: any) {
    error.value = err.message
    console.error('Get location error:', err)
  }
}

const startWatching = async () => {
  try {
    watchId = await Geolocation.watchPosition(
      { enableHighAccuracy: true },
      (position, err) => {
        if (err) {
          error.value = err.message
          console.error('Watch error:', err)
          return
        }
        if (position) {
          latitude.value = position.coords.latitude
          longitude.value = position.coords.longitude
        }
      }
    )
  } catch (err: any) {
    error.value = err.message
    console.error('Start watch error:', err)
  }
}

const stopWatching = () => {
  if (watchId) {
    Geolocation.clearWatch({ id: watchId })
    watchId = null
  }
}

export function useGeolocation() {
  return {
    latitude,
    longitude,
    error,
    requestPermission,
    getLocation,
    startWatching,
    stopWatching,
  }
}
