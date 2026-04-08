const express = require('express')
const { db } = require('../db')
const { triggerCheck } = require('../scheduler')

const router = express.Router()

async function enrichSchedule(s) {
  const screen   = s.screen_id   ? await db.screens.get(s.screen_id)     : null
  const playlist = s.playlist_id ? await db.playlists.get(s.playlist_id) : null
  return {
    ...s,
    screen_name:   screen?.name   || null,
    playlist_name: playlist?.name || null,
  }
}

router.get('/', async (req, res) => {
  try {
    let rows = await db.schedules.allForCompany(req.user.company_id)
    if (req.query.screen_id) rows = rows.filter(s => s.screen_id == req.query.screen_id)
    res.json(await Promise.all(rows.map(enrichSchedule)))
  } catch (e) { res.status(500).json({ error: e.message }) }
})

router.post('/', async (req, res) => {
  try {
    const {
      screen_id, playlist_id, name,
      days, start_time, end_time, priority = 0,
      interval_minutes, interval_duration,
      date_from, date_to,
    } = req.body
    if (!screen_id)   return res.status(400).json({ error: 'screen_id é obrigatório' })
    if (!playlist_id) return res.status(400).json({ error: 'playlist_id é obrigatório' })
    if (!start_time || !end_time) return res.status(400).json({ error: 'start_time e end_time são obrigatórios' })

    const row = await db.schedules.insert({
      screen_id:         Number(screen_id),
      playlist_id:       Number(playlist_id),
      name:              name || null,
      days:              Array.isArray(days) ? days : [],
      start_time,
      end_time,
      priority:          Number(priority),
      active:            1,
      interval_minutes:  interval_minutes ? Number(interval_minutes) : null,
      interval_duration: interval_duration ? Number(interval_duration) : null,
      date_from:         date_from || null,
      date_to:           date_to   || null,
      company_id:        req.user.company_id,
    })
    triggerCheck()
    res.json(await enrichSchedule(row))
  } catch (e) { res.status(500).json({ error: e.message }) }
})

router.get('/:id', async (req, res) => {
  try {
    const s = await db.schedules.findByIdAndCompany(req.params.id, req.user.company_id)
    if (!s) return res.status(404).json({ error: 'Não encontrado' })
    res.json(await enrichSchedule(s))
  } catch (e) { res.status(500).json({ error: e.message }) }
})

router.put('/:id', async (req, res) => {
  try {
    const existing = await db.schedules.findByIdAndCompany(req.params.id, req.user.company_id)
    if (!existing) return res.status(404).json({ error: 'Não encontrado' })
    const {
      screen_id, playlist_id, name,
      days, start_time, end_time, priority, active,
      interval_minutes, interval_duration,
      date_from, date_to,
    } = req.body
    const s = await db.schedules.update(req.params.id, {
      screen_id:         screen_id         !== undefined ? Number(screen_id)                  : undefined,
      playlist_id:       playlist_id       !== undefined ? Number(playlist_id)                : undefined,
      name:              name              !== undefined ? name                               : undefined,
      days:              days              !== undefined ? days                               : undefined,
      start_time:        start_time        !== undefined ? start_time                         : undefined,
      end_time:          end_time          !== undefined ? end_time                           : undefined,
      priority:          priority          !== undefined ? Number(priority)                   : undefined,
      active:            active            !== undefined ? (active ? 1 : 0)                  : undefined,
      interval_minutes:  interval_minutes  !== undefined ? (interval_minutes  ? Number(interval_minutes)  : null) : undefined,
      interval_duration: interval_duration !== undefined ? (interval_duration ? Number(interval_duration) : null) : undefined,
      date_from:         date_from         !== undefined ? (date_from || null)                : undefined,
      date_to:           date_to           !== undefined ? (date_to   || null)                : undefined,
    })
    triggerCheck()
    res.json(await enrichSchedule(s))
  } catch (e) { res.status(500).json({ error: e.message }) }
})

router.delete('/:id', async (req, res) => {
  try {
    const existing = await db.schedules.findByIdAndCompany(req.params.id, req.user.company_id)
    if (!existing) return res.status(404).json({ error: 'Não encontrado' })
    await db.schedules.remove(req.params.id)
    triggerCheck()
    res.json({ ok: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

module.exports = router
