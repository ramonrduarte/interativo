const { db } = require('./db')

let pushToScreen  // injected after socket initializes to avoid circular dep

// Track the last playlist pushed per screen to avoid redundant pushes
const lastPushed = new Map() // screenId -> playlistId

function getActivePlaylistId(screen) {
  const now = new Date()
  const currentDay = now.getDay()
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

function tick() {
  if (!pushToScreen) return
  const screens = db.screens.all()
  for (const screen of screens) {
    const activeId = getActivePlaylistId(screen)
    const prev = lastPushed.get(screen.id)
    if (prev !== activeId) {
      lastPushed.set(screen.id, activeId)
      pushToScreen(screen.id)
      console.log(`[scheduler] Screen ${screen.id} (${screen.name}): playlist mudou para ${activeId ?? 'nenhuma'}`)
    }
  }
}

function startScheduler(pushFn) {
  pushToScreen = pushFn
  // Run once at startup to populate lastPushed without pushing
  const screens = db.screens.all()
  for (const screen of screens) {
    lastPushed.set(screen.id, getActivePlaylistId(screen))
  }
  // Check every 30 seconds (catches changes within the minute)
  setInterval(tick, 30_000)
  console.log('[scheduler] Iniciado — verificando agendamentos a cada 30s')
}

// Call this whenever a schedule is created/updated/deleted so changes take effect immediately
function triggerCheck() {
  tick()
}

module.exports = { startScheduler, triggerCheck }
