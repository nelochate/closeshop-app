// server.js
import express from 'express'
import fetch from 'node-fetch'
import cors from 'cors'

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
          'Accept': 'application/json'
        }
      }
    )
    const data = await response.json()
    res.json(data)
  } catch (error) {
    console.error('Geocoding proxy error:', error)
    res.status(500).json({ error: 'Server error' })
  }
})

// ADD THIS ENDPOINT: Reverse geocoding (coordinates to address)
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
          'Accept': 'application/json'
        }
      }
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

// Start the server
app.listen(PORT, () => {
  console.log(`✅ Proxy server running on http://localhost:${PORT}`)
  console.log(`✅ Available endpoints:`)
  console.log(`   - GET /api/geocode?q=address`)
  console.log(`   - GET /api/reverse-geocode?lat=latitude&lon=longitude`)
})
