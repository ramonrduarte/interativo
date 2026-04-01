const express = require('express')
const { db } = require('../db')
const { triggerCheck } = require('../scheduler')

const router = express.Router()

function enrichSchedule(s) {
  const screen   = s.screen_id   ? db.screens.get(s.screen_id)     : null
  const playlist = s.playlist_id ? db.playlists.get(s.playlist_id) : null
  return {
    ...s,
    screen_name:   screen?.name   || null,
    playlist_name: playlist?.name || null,
  }
}

// GET /api/schedules?screen_id=X
router.get('/', (req, res) => {
  let rows = db.schedules.all()
  if (req.query.screen_id) rows = rows.filter(s => s.screen_id == req.query.screen_id)
  res.json(rows.map(enrichSchedule))
})

// POST /api/schedules
router.post('/', (req, res) => {
  const { screen_id, playlist_id, name, days, start_time, end_time, priority = 0 } = req.body
  if (!screen_id)   return res.status(400).json({ error: 'screen_id é obrigatório' })
  if (!playlist_id) return res.status(400).json({ error: 'playlist_id é obrigatório' })
  if (!start_time || !end_time) return res.status(400).json({ error: 'start_time e end_time são obrigatórios' })
  if (!Array.isArray(days) || days.length === 0) return res.status(400).json({ error: 'days é obrigatório' })

  const row = db.schedules.insert({
    screen_id:   Number(screen_id),
    playlist_id: Number(playlist_id),
    name:        name || null,
    days,
    start_time,
    end_time,
    priority:    Number(priority),
    active:      true,
  })
  triggerCheck()
  res.json(enrichSchedule(row))
})

// GET /api/schedules/:id
router.get('/:id', (req, res) => {
  const s = db.schedules.get(req.params.id)
  if (!s) return res.status(404).json({ error: 'Não encontrado' })
  res.json(enrichSchedule(s))
})

// PUT /api/schedules/:id
router.put('/:id', (req, res) => {
  const { screen_id, playlist_id, name, days, start_time, end_time, priority, active } = req.body
  const s = db.schedules.update(req.params.id, {
    screen_id:   screen_id   !== undefined ? Number(screen_id)   : undefined,
    playlist_id: playlist_id !== undefined ? Number(playlist_id) : undefined,
    name:        name        !== undefined ? name                : undefined,
    days:        days        !== undefined ? days                : undefined,
    start_time:  start_time  !== undefined ? start_time         : undefined,
    end_time:    end_time    !== undefined ? end_time           : undefined,
    priority:    priority    !== undefined ? Number(priority)   : undefined,
    active:      active      !== undefined ? Boolean(active)    : undefined,
  })
  if (!s) return res.status(404).json({ error: 'Não encontrado' })
  triggerCheck()
  res.json(enrichSchedule(s))
})

// DELETE /api/schedules/:id
router.delete('/:id', (req, res) => {
  db.schedules.remove(req.params.id)
  triggerCheck()
  res.json({ ok: true })
})

module.exports = router
