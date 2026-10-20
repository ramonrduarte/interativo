const { Server } = require('socket.io')
const { db } = require('./db')
const { isScheduleActiveNow } = require('./scheduleUtils')

let io
const registry        = new Map()  // token -> { socketId, screenId, lastSeen }  (tela online)
const pairingRegistry = new Map()  // code  -> socketId
const devices         = new Map()  // socketId -> aparelho conectado (pode haver vários por tela)

// ---------------------------------------------------------------------------
// Aparelhos conectados
// ---------------------------------------------------------------------------
function clientIp(socket) {
  const fwd = socket.handshake.headers['x-forwarded-for']
  const ip  = (fwd ? String(fwd).split(',')[0] : socket.handshake.address) || ''
  return ip.trim().replace(/^::ffff:/, '')
}

const clip = (v, n = 80) => (v === undefined || v === null) ? null : String(v).slice(0, n)

// O app Android envia { token, device: { client: 'android-app', model, ... } }.
// A página /tv/ envia só { token } → fica como 'browser'.
function applyDeviceInfo(device, data) {
  const d = data?.device
  if (!d || typeof d !== 'object') return
  device.client       = d.client === 'android-app' ? 'app' : 'browser'
  device.manufacturer = clip(d.manufacturer)
  device.model        = clip(d.model)
  device.android      = clip(d.android, 20)
  device.appVersion   = clip(d.appVersion, 20)
  device.localIp      = clip(d.localIp, 45)
  if (d.power === 'on' || d.power === 'standby') device.power = d.power
}

function devicesFor(token) {
  const list = []
  devices.forEach((d, socketId) => {
    if (d.token !== token || !d.screenId) return
    const { token: _t, ...info } = d
    list.push({ socketId, ...info })
  })
  return list.sort((a, b) => a.connectedAt.localeCompare(b.connectedAt))
}

function statusFor(token, screenId) {
  const list = devicesFor(token)
  return {
    screenId, token,
    online:   list.length > 0,
    lastSeen: list.length ? list.map(d => d.lastSeen).sort().pop() : new Date().toISOString(),
    devices:  list,
  }
}

function emitStatus(token, screenId) {
  if (io) io.to('dashboard').emit('screen:status', statusFor(token, screenId))
}

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
        type:          media.type,
        url:           media.filename ? `/uploads/${media.filename}` : (media.url || null),
        content:       media.content || null,
        name:          media.name,
        objectFit:     media.object_fit || 'cover',
        videoDuration: media.video_duration || null,
      }
    }
    slides.push({
      id:               slide.id,
      duration:         slide.duration || 10,
      useVideoDuration: slide.use_video_duration || false,
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
    // Horário de funcionamento — lido pelo app Android nativo (a página /tv/ ignora)
    power: screen.power_schedule || null,
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
      const code         = String(pairing).toUpperCase()
      const companyToken = String(socket.handshake.query.c || '').trim().toUpperCase()
      // Pareamento só com o código da empresa: impede que um cliente pareie a TV de outro
      if (!companyToken) {
        socket.emit('pairing:error', { error: 'company_required', message: 'Informe o código da empresa para parear esta TV.' })
        socket.disconnect()
        return
      }
      const companies = await db.companies.all()
      const company   = companies.find(c => (c.pairing_token || '').toUpperCase() === companyToken)
      if (!company) {
        socket.emit('pairing:error', { error: 'company_invalid', message: 'Código da empresa inválido.' })
        socket.disconnect()
        return
      }
      if (!socket.connected) return
      pairingRegistry.set(code, { socketId: socket.id, companyToken, companyId: company.id })
      socket.on('disconnect', () => {
        if (pairingRegistry.get(code)?.socketId === socket.id) pairingRegistry.delete(code)
      })
      socket.emit('pairing:ready', { company: company.name })
      return
    }

    // ── Normal TV connection ──────────────────────────────────────────────────
    if (token && token !== 'dashboard') {
      // Registra o aparelho e os listeners ANTES de qualquer await:
      // o app envia "tv:register" logo ao conectar e o evento se perderia.
      const now    = new Date().toISOString()
      const device = {
        token, screenId: null, client: 'browser', ip: clientIp(socket),
        connectedAt: now, lastSeen: now, power: 'on',
      }
      devices.set(socket.id, device)

      socket.on('tv:register', data => {
        applyDeviceInfo(device, data)
        if (device.screenId) emitStatus(token, device.screenId)
      })

      socket.on('tv:heartbeat', data => {
        const prevPower = device.power
        device.lastSeen = new Date().toISOString()
        if (registry.has(token)) registry.get(token).lastSeen = device.lastSeen
        if (data?.power === 'on' || data?.power === 'standby') device.power = data.power
        if (device.power !== prevPower && device.screenId) emitStatus(token, device.screenId)
      })

      socket.on('disconnect', () => {
        devices.delete(socket.id)
        // Só fica offline quando o ÚLTIMO aparelho desta tela desconecta
        const remaining = devicesFor(token)
        if (remaining.length === 0) registry.delete(token)
        else if (registry.has(token)) registry.get(token).socketId = remaining[0].socketId
        if (device.screenId) emitStatus(token, device.screenId)
      })

      const screen = await db.screens.findOne(s => s.token === token)
      if (!screen) { devices.delete(socket.id); socket.disconnect(); return }
      if (!socket.connected) return

      device.screenId = screen.id
      socket.join(token)
      registry.set(token, { socketId: socket.id, screenId: screen.id, lastSeen: now })

      const payload = await buildPayload(screen.id)
      if (payload) socket.emit('config:update', payload)

      emitStatus(token, screen.id)
      return
    }

    // ── Dashboard connection ──────────────────────────────────────────────────
    socket.join('dashboard')
    registry.forEach((info, t) => {
      socket.emit('screen:status', statusFor(t, info.screenId))
    })
  })

  return io
}

// ---------------------------------------------------------------------------
// Called by POST /api/pair
// ---------------------------------------------------------------------------
function getPairingEntry(code) {
  return pairingRegistry.get(code.toUpperCase()) || null
}

function completePairing(code, screenToken) {
  const entry = pairingRegistry.get(code.toUpperCase())
  if (!entry || !io) return false
  io.to(entry.socketId).emit('pairing:success', { token: screenToken })
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

module.exports = { initSocket, pushToScreen, completePairing, getPairingEntry, registry, pairingRegistry, devicesFor }
