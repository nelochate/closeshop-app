// src/composables/useMap.ts
import { ref } from 'vue'
import * as L from 'leaflet'

let map: L.Map | null = null
let marker: L.Marker | null = null

const isMapReady = ref(false)

/**
 * Initialize the map
 * @param elementId The ID of the <div> where the map should be mounted
 */
export const initMap = (elementId: string) => {
  if (map) return // prevent multiple inits

  map = L.map(elementId).setView([8.9475, 125.5406], 13) // Default: Butuan City

  // Add OpenStreetMap tiles
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors',
  }).addTo(map)

  isMapReady.value = true
}

/**
 * Update the map position and marker
 */
export const updateMapPosition = (coords: [number, number]) => {
  if (!map) return
  map.setView(coords, 16)

  if (marker) {
    marker.setLatLng(coords)
  } else {
    marker = L.marker(coords).addTo(map)
  }
}

/**
 * Geocode an address → coordinates
 */
export const geocodeAddress = async (address: string): Promise<[number, number] | null> => {
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}`
    const res = await fetch(url)
    const data = await res.json()

    if (data.length > 0) {
      return [parseFloat(data[0].lat), parseFloat(data[0].lon)]
    }
    return null
  } catch (err) {
    console.error('Geocoding error:', err)
    return null
  }
}

export const useMap = () => {
  return {
    initMap,
    updateMapPosition,
    geocodeAddress,
    isMapReady,
  }
}
