const { db } = require('./db')

let pushToScreen  // injected after socket initializes to avoid circular dep

const lastPushed = new Map() // screenId -> playlistId

async function getActivePlaylistId(screen) {
  const now = new Date()
  const currentDay  = now.getDay()
  const hh          = String(now.getHours()).padStart(2, '0')
  const mm          = String(now.getMinutes()).padStart(2, '0')
  const currentTime = `${hh}:${mm}`

  const schedules = await db.schedules.where(
    s => s.screen_id == screen.id && s.active !== false
  )
  const active = schedules
    .filter(s => {
      const days = s.days || []
      if (!days.includes(currentDay)) return false
      return currentTime >= s.start_time && currentTime < s.end_time
    })
    .sort((a, b) => (b.priority || 0) - (a.priority || 0))

  return active.length > 0 ? active[0].playlist_id : screen.playlist_id
}

async function tick() {
  if (!pushToScreen) return
  try {
    const screens = await db.screens.all()
    for (const screen of screens) {
      const activeId = await getActivePlaylistId(screen)
      const prev     = lastPushed.get(screen.id)
      if (prev !== activeId) {
        lastPushed.set(screen.id, activeId)
        await pushToScreen(screen.id)
        console.log(`[scheduler] Screen ${screen.id} (${screen.name}): playlist → ${activeId ?? 'nenhuma'}`)
      }
    }
  } catch (e) {
    console.error('[scheduler] erro no tick:', e.message)
  }
}

async function startScheduler(pushFn) {
  pushToScreen = pushFn
  // Populate lastPushed at startup without pushing
  try {
    const screens = await db.screens.all()
    for (const screen of screens) {
      lastPushed.set(screen.id, await getActivePlaylistId(screen))
    }
  } catch (e) {
    console.error('[scheduler] erro ao inicializar:', e.message)
  }
  setInterval(tick, 30_000)
  console.log('[scheduler] Iniciado — verificando agendamentos a cada 30s')
}

function triggerCheck() {
  tick().catch(e => console.error('[scheduler] triggerCheck erro:', e.message))
}

module.exports = { startScheduler, triggerCheck }
