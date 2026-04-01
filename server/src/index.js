const express = require('express')
const { createServer } = require('http')
const cors = require('cors')
const path = require('path')
const { initSocket, pushToScreen, completePairing, registry, pairingRegistry } = require('./socket')
const { startScheduler } = require('./scheduler')

require('./db') // ensure DB + seeds run

const app = express()
const server = createServer(app)

const io = initSocket(server)
startScheduler(pushToScreen)

app.use(cors({ origin: '*' }))
app.use(express.json())
app.use('/uploads', express.static(path.join(__dirname, '../../uploads')))

// Serve built TV app at /tv/
app.use('/tv', express.static(path.join(__dirname, '../public/tv')))
app.get('/tv/*', (_req, res) => res.sendFile(path.join(__dirname, '../public/tv/index.html')))

// API Routes
app.use('/api/content',   require('./routes/content')(io))
app.use('/api/layouts',   require('./routes/layouts'))
app.use('/api/playlists', require('./routes/playlists')(io))
app.use('/api/screens',   require('./routes/screens')(io))
app.use('/api/tickers',   require('./routes/tickers')(io))
app.use('/api/schedules', require('./routes/schedules'))
app.use('/api/iptv',     require('./routes/iptv'))

// Pairing endpoint — called from dashboard when user enters the TV code
app.post('/api/pair', (req, res) => {
  const { code, screen_id } = req.body
  if (!code || !screen_id) return res.status(400).json({ error: 'code e screen_id são obrigatórios' })

  const { db } = require('./db')
  const screen = db.screens.get(screen_id)
  if (!screen) return res.status(404).json({ error: 'Tela não encontrada' })

  const ok = completePairing(code, screen.token)
  if (!ok) return res.status(404).json({ error: 'Código não encontrado ou expirado. A TV está com a tela de pareamento aberta?' })

  res.json({ ok: true, screen_name: screen.name })
})

app.get('/api/pair/waiting', (_req, res) => {
  const waiting = []
  pairingRegistry.forEach((socketId, code) => waiting.push({ code }))
  res.json(waiting)
})

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, connectedScreens: registry.size, uptime: process.uptime() })
})

app.get('/api/status', (_req, res) => {
  const list = []
  registry.forEach((info, token) => list.push({ token, ...info }))
  res.json(list)
})

// Serve built Dashboard app at / (must be after all API routes)
app.use(express.static(path.join(__dirname, '../public/dashboard')))
app.get('*', (_req, res) => {
  const indexPath = path.join(__dirname, '../public/dashboard/index.html')
  if (require('fs').existsSync(indexPath)) res.sendFile(indexPath)
  else res.status(404).send('Dashboard not built. Run: npm run build')
})

const PORT = process.env.PORT || 3001
server.listen(PORT, () => {
  console.log(`\n🚀 Interativa Server  → http://localhost:${PORT}`)
  console.log(`🎛️  Dashboard         → http://localhost:${PORT}  (production)`)
  console.log(`📺 TV Client          → http://localhost:${PORT}/tv/  (production)\n`)
})
