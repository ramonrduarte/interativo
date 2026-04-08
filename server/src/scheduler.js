const { db } = require('./db')
const { isScheduleActiveNow } = require('./scheduleUtils')

let pushToScreen  // injected after socket initializes to avoid circular dep

const lastPushed = new Map() // screenId -> stateKey string

// Returns a stable string key representing what a screen should be showing right now.
// Comparing this key across ticks lets us detect any change (schedule start, end, or default switch).
async function getScreenStateKey(screen) {
  const now = new Date()

  const schedules = await db.schedules.where(s => s.screen_id == screen.id)
  const active = schedules
    .filter(s => isScheduleActiveNow(s, now))
    .sort((a, b) => (b.priority || 0) - (a.priority || 0))

  if (active.length > 0) {
    const s = active[0]
    // For interval schedules include the cycle number so the key changes each occurrence
    if (s.interval_minutes && s.interval_duration) {
      const [sh, sm] = s.start_time.split(':').map(Number)
      const elapsedMins = now.getHours() * 60 + now.getMinutes() - (sh * 60 + sm)
      const cycle = Math.floor(elapsedMins / s.interval_minutes)
      return `sched-int:${s.id}:${cycle}`
    }
    return `sched:${s.id}`
  }

  if (screen.playlist_group_id) return `group:${screen.playlist_group_id}`
  if (screen.playlist_id)       return `pl:${screen.playlist_id}`
  return 'empty'
}

async function tick() {
  if (!pushToScreen) return
  try {
    const screens = await db.screens.all()
    for (const screen of screens) {
      try {
        const key  = await getScreenStateKey(screen)
        const prev = lastPushed.get(screen.id)
        if (prev !== key) {
          lastPushed.set(screen.id, key)
          await pushToScreen(screen.id)
          console.log(`[scheduler] Tela ${screen.id} (${screen.name}): ${prev ?? '?'} → ${key}`)
        }
      } catch (e) {
        console.error(`[scheduler] erro na tela ${screen.id}:`, e.message)
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
      lastPushed.set(screen.id, await getScreenStateKey(screen))
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

function getDebugState() {
  const state = {}
  lastPushed.forEach((key, screenId) => { state[screenId] = key })
  return state
}

module.exports = { startScheduler, triggerCheck, getDebugState }
