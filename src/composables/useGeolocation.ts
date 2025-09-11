// fr to display user location
import { ref } from 'vue'
import { useGeolocation } from '@/composables/useGeolocation'
import { useMap } from '@/composables/useMap'


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

 /*
// use map for the shop-build.vue file, for display shop location
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

let map: L.Map | null = null
let marker: L.Marker | null = null

const isMapReady = ref(false)

/**
 // Initialize the map
 
export function initMap(elementId: string, defaultCoords: [number, number] = [8.9475, 125.5406]) {
  if (map) return map

  map = L.map(elementId).setView(defaultCoords, 13)

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors'
  }).addTo(map)

  marker = L.marker(defaultCoords).addTo(map)
  isMapReady.value = true
  return map
}

/**
 // Update marker and center map
 
export function updateMapPosition(coords: [number, number]) {
  if (!map || !marker) return
  marker.setLatLng(coords)
  map.setView(coords, 16)
}

/**
  Geocode an address string to coords
 
export async function geocodeAddress(address: string): Promise<[number, number] | null> {
  if (!address) return null

  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}`
    )
    const results = await response.json()
    if (results && results.length > 0) {
      const { lat, lon } = results[0]
      return [parseFloat(lat), parseFloat(lon)]
    }
  } catch (err) {
    console.error('Geocode error:', err)
  }
  return null
}

export function useMap() {
  return {
    initMap,
    updateMapPosition,
    geocodeAddress,
    isMapReady
  }
}
  */
