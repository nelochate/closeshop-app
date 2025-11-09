// server.js
import express from 'express'
import fetch from 'node-fetch'
import cors from 'cors'

const app = express()
const PORT = 3000

// Enable CORS for your frontend origin
app.use(cors({ origin: 'http://localhost:5173' }))

// Simple proxy route for Nominatim (OpenStreetMap)
app.get('/api/geocode', async (req, res) => {
  const query = req.query.q
  if (!query) return res.status(400).json({ error: 'Missing query parameter' })

  try {
    const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}`, {
      headers: { 'User-Agent': 'YourAppName/1.0 (your@email.com)' }
    })
    const data = await response.json()
    res.json(data)
  } catch (error) {
    console.error('Proxy error:', error)
    res.status(500).json({ error: 'Server error' })
  }
})

// Start the server
app.listen(PORT, () => {
  console.log(`✅ Proxy server running on http://localhost:${PORT}`)
})
