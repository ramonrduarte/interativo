const express = require('express')
const { createServer } = require('http')
const cors        = require('cors')
const path        = require('path')
const { db, initDb } = require('./db')
const { initSocket, pushToScreen, completePairing, registry, pairingRegistry } = require('./socket')
const { startScheduler, getDebugState } = require('./scheduler')
const requireAuth = require('./middleware/auth')

async function main() {
  // Initialize database + run migrations + seed layouts + seed default company/user
  await initDb()

  const app    = express()
  const server = createServer(app)

  const io = initSocket(server)
  await startScheduler(pushToScreen)

  app.use(cors({ origin: '*' }))
  app.use(express.json())
  app.use('/uploads', express.static(path.join(__dirname, '../../uploads')))

  // Serve built TV app at /tv/ (no auth — TV uses screen token)
  app.use('/tv', express.static(path.join(__dirname, '../public/tv')))
  app.get('/tv/*', (_req, res) => res.sendFile(path.join(__dirname, '../public/tv/index.html')))

  // Public API — auth routes (no JWT required)
  app.use('/api/auth', require('./routes/auth'))

  // Public endpoint — TV pairing (TV has no JWT)
  app.post('/api/pair', async (req, res) => {
    const { code, screen_id } = req.body
    if (!code || !screen_id) return res.status(400).json({ error: 'code e screen_id são obrigatórios' })
    const screen = await db.screens.get(screen_id)
    if (!screen) return res.status(404).json({ error: 'Tela não encontrada' })
    const ok = completePairing(code, screen.token)
    if (!ok) return res.status(404).json({ error: 'Código não encontrado ou expirado. A TV está com a tela de pareamento aberta?' })
    res.json({ ok: true, screen_name: screen.name })
  })

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, connectedScreens: registry.size, uptime: process.uptime() })
  })

  // Debug endpoint — shows scheduler state + connected screens (no auth, local diagnosis)
  app.get('/api/debug/scheduler', async (_req, res) => {
    try {
      const now = new Date()
      const hh  = String(now.getHours()).padStart(2, '0')
      const mm  = String(now.getMinutes()).padStart(2, '0')
      const screens   = await db.screens.all()
      const schedules = await db.schedules.all()
      const lastPushedState = getDebugState()

      const screensInfo = screens.map(s => {
        const connected = [...registry.values()].some(r => r.screenId === s.id)
        return {
          id: s.id, name: s.name, token: s.token,
          playlist_id: s.playlist_id, playlist_group_id: s.playlist_group_id,
          connected,
          schedulerKey: lastPushedState[s.id] ?? '(não inicializado)',
        }
      })

      const schedulesInfo = schedules.map(s => {
        const days = Array.isArray(s.days) ? s.days : []
        const currentDay = now.getDay()
        const currentTime = `${hh}:${mm}`
        const isActiveNow = s.active == 1
          && days.includes(currentDay)
          && currentTime >= s.start_time
          && currentTime < s.end_time
        return {
          id: s.id, name: s.name, screen_id: s.screen_id,
          playlist_id: s.playlist_id, active: s.active,
          days, start_time: s.start_time, end_time: s.end_time,
          isActiveNow,
        }
      })

      res.json({
        serverTime: `${hh}:${mm}`, serverDay: now.getDay(),
        dayNames: ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'],
        screens: screensInfo,
        schedules: schedulesInfo,
      })
    } catch (e) {
      res.status(500).json({ error: e.message })
    }
  })

  // Protected API — all routes below require JWT
  app.use('/api', requireAuth)

  app.get('/api/pair/waiting', (_req, res) => {
    const waiting = []
    pairingRegistry.forEach((_socketId, code) => waiting.push({ code }))
    res.json(waiting)
  })

  app.get('/api/status', (_req, res) => {
    const list = []
    registry.forEach((info, token) => list.push({ token, ...info }))
    res.json(list)
  })

  app.use('/api/admin',          require('./routes/admin'))
  app.use('/api/playlist-groups', require('./routes/playlist_groups')())
  app.use('/api/users',     require('./routes/users'))
  app.use('/api/content',   require('./routes/content')(io))
  app.use('/api/layouts',   require('./routes/layouts'))
  app.use('/api/playlists', require('./routes/playlists')(io))
  app.use('/api/screens',   require('./routes/screens')(io))
  app.use('/api/tickers',   require('./routes/tickers')(io))
  app.use('/api/schedules', require('./routes/schedules'))
  app.use('/api/iptv',      require('./routes/iptv'))

  // Serve built Dashboard at / (must be after all API routes)
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
}

main().catch(err => {
  console.error('Erro ao iniciar servidor:', err)
  process.exit(1)
})
