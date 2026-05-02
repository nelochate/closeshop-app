// server.js
import express from 'express'
import fetch from 'node-fetch'
import cors from 'cors'
import {
  calculateHaversineDistanceKm,
  calculateRiderBasePayQuote,
} from './src/utils/riderEarnings.js'

const app = express()
const PORT = 3000

// Enable CORS for your frontend origin
app.use(cors({ origin: 'http://localhost:5173' }))
app.use(express.json())

// Forward geocoding (address to coordinates)
app.get('/api/geocode', async (req, res) => {
  const query = req.query.q
  if (!query) return res.status(400).json({ error: 'Missing query parameter' })

  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1`,
      {
        headers: {
          'User-Agent': 'YourAppName/1.0 (your@email.com)',
          Accept: 'application/json',
        },
      },
    )
    const data = await response.json()
    res.json(data)
  } catch (error) {
    console.error('Geocoding proxy error:', error)
    res.status(500).json({ error: 'Server error' })
  }
})

// Reverse geocoding (coordinates to address)
app.get('/api/reverse-geocode', async (req, res) => {
  const { lat, lon } = req.query
  console.log('Reverse geocoding request for:', lat, lon)

  if (!lat || !lon) return res.status(400).json({ error: 'Missing lat or lon parameters' })

  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&addressdetails=1`,
      {
        headers: {
          'User-Agent': 'YourAppName/1.0 (your@email.com)',
          Accept: 'application/json',
        },
      },
    )

    if (!response.ok) {
      throw new Error(`Nominatim API error: ${response.status}`)
    }

    const data = await response.json()
    console.log('Reverse geocoding result:', data)
    res.json(data)
  } catch (error) {
    console.error('Reverse geocoding proxy error:', error)
    res.status(500).json({ error: 'Server error: ' + error.message })
  }
})

// Rider earnings quote endpoint
app.get('/api/rider-earnings', (req, res) => {
  const distanceKmQuery = req.query.distanceKm ?? req.query.distance_km
  const pickupLat = req.query.pickupLat ?? req.query.pickup_lat
  const pickupLng = req.query.pickupLng ?? req.query.pickup_lng
  const deliveryLat = req.query.deliveryLat ?? req.query.delivery_lat
  const deliveryLng = req.query.deliveryLng ?? req.query.delivery_lng
  const resolvedDistanceKm =
    distanceKmQuery ??
    calculateHaversineDistanceKm(pickupLat, pickupLng, deliveryLat, deliveryLng)
  const quote = calculateRiderBasePayQuote(resolvedDistanceKm)

  if (!quote) {
    return res.status(400).json({
      error: 'Provide either distanceKm or pickup/delivery coordinates.',
      examples: [
        '/api/rider-earnings?distanceKm=12',
        '/api/rider-earnings?pickupLat=8.95&pickupLng=125.53&deliveryLat=8.97&deliveryLng=125.56',
      ],
    })
  }

  return res.json({
    ...quote,
    source: distanceKmQuery !== null && distanceKmQuery !== undefined ? 'distance' : 'coordinates',
  })
})

// Start the server
app.listen(PORT, () => {
  console.log(`Proxy server running on http://localhost:${PORT}`)
  console.log('Available endpoints:')
  console.log('   - GET /api/geocode?q=address')
  console.log('   - GET /api/reverse-geocode?lat=latitude&lon=longitude')
  console.log('   - GET /api/rider-earnings?distanceKm=12')
  console.log(
    '   - GET /api/rider-earnings?pickupLat=8.95&pickupLng=125.53&deliveryLat=8.97&deliveryLng=125.56',
  )
})
