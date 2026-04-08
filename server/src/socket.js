const { Server } = require('socket.io')
const { db } = require('./db')
const { isScheduleActiveNow } = require('./scheduleUtils')

let io
const registry        = new Map()  // token -> { socketId, screenId, lastSeen }
const pairingRegistry = new Map()  // code  -> socketId

// ---------------------------------------------------------------------------
// Evaluate which playlist is active right now for a screen
// ---------------------------------------------------------------------------
async function getActivePlaylistId(screen) {
  const now = new Date()

  const schedules = await db.schedules.where(s => s.screen_id == screen.id)
  const active = schedules
    .filter(s => isScheduleActiveNow(s, now))
    .sort((a, b) => (b.priority || 0) - (a.priority || 0))

  // Schedule overrides always return a single playlist_id
  if (active.length > 0) return { type: 'single', playlist_id: active[0].playlist_id }

  // No active schedule — use group or fallback to single playlist
  if (screen.playlist_group_id) return { type: 'group', group_id: screen.playlist_group_id }
  if (screen.playlist_id)       return { type: 'single', playlist_id: screen.playlist_id }
  return null
}

async function getSlidesForPlaylistId(playlistId) {
  const rawSlides = await db.playlistSlides.where(s => s.playlist_id == playlistId)
  rawSlides.sort((a, b) => a.position - b.position)
  const slides = []
  for (const slide of rawSlides) {
    const layout      = slide.layout_id ? await db.layouts.get(slide.layout_id) : null
    const zoneContent = slide.zone_content || {}
    const zones       = {}
    for (const [zoneIdx, mediaId] of Object.entries(zoneContent)) {
      if (!mediaId) continue
      const media = await db.media.get(mediaId)
      if (!media) continue
      zones[Number(zoneIdx)] = {
        type:      media.type,
        url:       media.filename ? `/uploads/${media.filename}` : (media.url || null),
        content:   media.content || null,
        name:      media.name,
        objectFit: media.object_fit || 'cover',
      }
    }
    slides.push({
      id:       slide.id,
      duration: slide.duration || 10,
      layout: {
        template: layout?.template || 'fullscreen',
        zones:    layout?.config?.zones || [{ id: 0, label: 'Principal' }],
      },
      zones,
    })
  }
  return slides
}

// ---------------------------------------------------------------------------
// Build the full config payload sent to a TV
// ---------------------------------------------------------------------------
async function buildPayload(screenId) {
  const screen = await db.screens.get(screenId)
  if (!screen) return null

  const ticker      = screen.ticker_id ? await db.tickers.get(screen.ticker_id) : null
  const playlistRef = await getActivePlaylistId(screen)

  const slides = []
  if (playlistRef) {
    if (playlistRef.type === 'single') {
      slides.push(...await getSlidesForPlaylistId(playlistRef.playlist_id))
    } else if (playlistRef.type === 'group') {
      const items = await db.playlistGroupItems.where(i => i.group_id == playlistRef.group_id)
      items.sort((a, b) => a.position - b.position)
      for (const item of items) {
        slides.push(...await getSlidesForPlaylistId(item.playlist_id))
      }
    }
  }

  return {
    version: Date.now(),
    screen:  { id: screen.id, name: screen.name, token: screen.token, orientation: screen.orientation || 'landscape' },
    slides,
    ticker: ticker ? {
      id:       ticker.id,
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

  io.on('connection', async socket => {
    const { token, pairing } = socket.handshake.query

    // ── Pairing mode ──────────────────────────────────────────────────────────
    if (pairing) {
      const code = pairing.toUpperCase()
      pairingRegistry.set(code, socket.id)
      socket.on('disconnect', () => pairingRegistry.delete(code))
      return
    }

    // ── Normal TV connection ──────────────────────────────────────────────────
    if (token && token !== 'dashboard') {
      const screen = await db.screens.findOne(s => s.token === token)
      if (!screen) { socket.disconnect(); return }

      socket.join(token)
      registry.set(token, { socketId: socket.id, screenId: screen.id, lastSeen: new Date().toISOString() })

      const payload = await buildPayload(screen.id)
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

    // ── Dashboard connection ──────────────────────────────────────────────────
    socket.join('dashboard')
    registry.forEach((info, t) => {
      socket.emit('screen:status', {
        screenId: info.screenId, token: t, online: true, lastSeen: info.lastSeen,
      })
    })
  })

  return io
}

// ---------------------------------------------------------------------------
// Called by POST /api/pair
// ---------------------------------------------------------------------------
function completePairing(code, screenToken) {
  const socketId = pairingRegistry.get(code.toUpperCase())
  if (!socketId || !io) return false
  io.to(socketId).emit('pairing:success', { token: screenToken })
  pairingRegistry.delete(code.toUpperCase())
  return true
}

async function pushToScreen(screenId) {
  const screen = await db.screens.get(screenId)
  if (!screen || !io) return false
  const payload = await buildPayload(screenId)
  if (!payload) return false
  const room = io.sockets.adapter.rooms.get(screen.token)
  const sockets = room ? room.size : 0
  console.log(`[push] Tela ${screenId} (${screen.name}): ${payload.slides.length} slides → ${sockets} TV(s) conectada(s)`)
  io.to(screen.token).emit('config:update', payload)
  return true
}

module.exports = { initSocket, pushToScreen, completePairing, registry, pairingRegistry }
