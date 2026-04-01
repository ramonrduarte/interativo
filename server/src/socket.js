const { Server } = require('socket.io')
const { db } = require('./db')

let io
const registry = new Map()       // token -> { socketId, screenId, lastSeen }
const pairingRegistry = new Map() // code  -> socketId

// ---------------------------------------------------------------------------
// Evaluate which playlist is active right now for a screen
// ---------------------------------------------------------------------------
function getActivePlaylistId(screen) {
  const now = new Date()
  const currentDay = now.getDay() // 0=Sun … 6=Sat
  const hh = String(now.getHours()).padStart(2, '0')
  const mm = String(now.getMinutes()).padStart(2, '0')
  const currentTime = `${hh}:${mm}`

  const active = db.schedules
    .where(s => s.screen_id == screen.id && s.active !== false)
    .filter(s => {
      const days = s.days || []
      if (!days.includes(currentDay)) return false
      return currentTime >= s.start_time && currentTime < s.end_time
    })
    .sort((a, b) => (b.priority || 0) - (a.priority || 0))

  return active.length > 0 ? active[0].playlist_id : screen.playlist_id
}

// ---------------------------------------------------------------------------
// Build the full config payload sent to a TV
// ---------------------------------------------------------------------------
function buildPayload(screenId) {
  const screen = db.screens.get(screenId)
  if (!screen) return null

  const ticker = screen.ticker_id ? db.tickers.get(screen.ticker_id) : null
  const playlistId = getActivePlaylistId(screen)

  const slides = []
  if (playlistId) {
    const rawSlides = db.playlistSlides
      .where(s => s.playlist_id == playlistId)
      .sort((a, b) => a.position - b.position)

    for (const slide of rawSlides) {
      const layout = slide.layout_id ? db.layouts.get(slide.layout_id) : null
      const zoneContent = slide.zone_content || {}
      const zones = {}

      Object.entries(zoneContent).forEach(([zoneIdx, mediaId]) => {
        if (!mediaId) return
        const media = db.media.get(mediaId)
        if (!media) return
        zones[Number(zoneIdx)] = {
          type: media.type,
          url: media.filename ? `/uploads/${media.filename}` : (media.url || null),
          content: media.content || null,
          name: media.name,
          objectFit: media.object_fit || 'cover',
        }
      })

      slides.push({
        id: slide.id,
        duration: slide.duration || 10,
        layout: {
          template: layout?.template || 'fullscreen',
          zones: layout?.config?.zones || [{ id: 0, label: 'Principal' }],
        },
        zones,
      })
    }
  }

  return {
    version: Date.now(),
    screen: { id: screen.id, name: screen.name, token: screen.token, orientation: screen.orientation || 'landscape' },
    slides,
    ticker: ticker ? {
      id: ticker.id,
      // Support both old single `message` and new `messages` array
      messages: ticker.messages?.length
        ? ticker.messages
        : [{ text: ticker.message || '', duration: 10 }],
      speed:    ticker.speed,
      fontSize: ticker.font_size,
      color:    ticker.color,
      bgColor:  ticker.bg_color,
    } : null,
  }
}

// ---------------------------------------------------------------------------
// Socket.io setup
// ---------------------------------------------------------------------------
function initSocket(server) {
  io = new Server(server, { cors: { origin: '*' } })

  io.on('connection', socket => {
    const { token, pairing } = socket.handshake.query

    // ── Pairing mode: TV waiting to be linked ──────────────────────────────
    if (pairing) {
      const code = pairing.toUpperCase()
      pairingRegistry.set(code, socket.id)
      socket.on('disconnect', () => pairingRegistry.delete(code))
      return
    }

    // ── Normal TV connection ───────────────────────────────────────────────
    if (token && token !== 'dashboard') {
      const screen = db.screens.findOne(s => s.token === token)
      if (!screen) { socket.disconnect(); return }

      socket.join(token)
      registry.set(token, { socketId: socket.id, screenId: screen.id, lastSeen: new Date().toISOString() })

      const payload = buildPayload(screen.id)
      if (payload) socket.emit('config:update', payload)

      io.to('dashboard').emit('screen:status', {
        screenId: screen.id, token, online: true, lastSeen: registry.get(token).lastSeen,
      })

      socket.on('tv:heartbeat', () => {
        if (registry.has(token)) registry.get(token).lastSeen = new Date().toISOString()
      })

      socket.on('disconnect', () => {
        registry.delete(token)
        io.to('dashboard').emit('screen:status', {
          screenId: screen.id, token, online: false, lastSeen: new Date().toISOString(),
        })
      })
      return
    }

    // ── Dashboard connection ───────────────────────────────────────────────
    socket.join('dashboard')
    registry.forEach((info, t) => {
      socket.emit('screen:status', {
        screenId: info.screenId, token: t, online: true, lastSeen: info.lastSeen,
      })
    })
  })

  return io
}

// Called by POST /api/pair — sends token directly to the waiting TV socket
function completePairing(code, screenToken) {
  const socketId = pairingRegistry.get(code.toUpperCase())
  if (!socketId || !io) return false
  io.to(socketId).emit('pairing:success', { token: screenToken })
  pairingRegistry.delete(code.toUpperCase())
  return true
}

function pushToScreen(screenId) {
  const screen = db.screens.get(screenId)
  if (!screen || !io) return false
  const payload = buildPayload(screenId)
  if (!payload) return false
  io.to(screen.token).emit('config:update', payload)
  return true
}

module.exports = { initSocket, pushToScreen, completePairing, registry, pairingRegistry }
