const express = require('express')
const { v4: uuidv4 } = require('uuid')
const { db } = require('../db')
const { pushToScreen, registry } = require('../socket')

module.exports = function screenRoutes(_io) {
  const router = express.Router()

  function enrichScreen(s) {
    const playlist = s.playlist_id ? db.playlists.get(s.playlist_id) : null
    const ticker   = s.ticker_id   ? db.tickers.get(s.ticker_id)   : null
    const slideCount = s.playlist_id
      ? db.playlistSlides.where(sl => sl.playlist_id == s.playlist_id).length
      : 0

    return {
      ...s,
      playlist_name: playlist?.name || null,
      ticker_name:   ticker?.name   || null,
      slide_count:   slideCount,
      online: registry.has(s.token),
    }
  }

  // GET /api/screens
  router.get('/', (_req, res) => {
    res.json(
      db.screens.all()
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .map(enrichScreen)
    )
  })

  // POST /api/screens
  router.post('/', (req, res) => {
    const { name, playlist_id, ticker_id, orientation } = req.body
    if (!name) return res.status(400).json({ error: 'name é obrigatório' })

    const screen = db.screens.insert({
      name,
      token:       uuidv4(),
      playlist_id: playlist_id ? Number(playlist_id) : null,
      ticker_id:   ticker_id   ? Number(ticker_id)   : null,
      orientation: orientation || 'landscape',
    })
    res.json(enrichScreen(screen))
  })

  // GET /api/screens/:id
  router.get('/:id', (req, res) => {
    const s = db.screens.get(req.params.id)
    if (!s) return res.status(404).json({ error: 'Não encontrado' })
    res.json(enrichScreen(s))
  })

  // PUT /api/screens/:id
  router.put('/:id', (req, res) => {
    const { name, playlist_id, ticker_id, orientation } = req.body

    const s = db.screens.update(req.params.id, {
      name,
      playlist_id:  playlist_id  ? Number(playlist_id)  : null,
      ticker_id:    ticker_id    ? Number(ticker_id)    : null,
      orientation:  orientation  || 'landscape',
    })
    if (!s) return res.status(404).json({ error: 'Não encontrado' })

    pushToScreen(Number(req.params.id))
    res.json(enrichScreen(s))
  })

  // DELETE /api/screens/:id
  router.delete('/:id', (req, res) => {
    db.screens.remove(req.params.id)
    res.json({ ok: true })
  })

  // POST /api/screens/:id/push
  router.post('/:id/push', (req, res) => {
    const ok = pushToScreen(Number(req.params.id))
    res.json({ ok })
  })

  return router
}
