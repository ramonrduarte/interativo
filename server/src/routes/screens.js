const express = require('express')
const { v4: uuidv4 } = require('uuid')
const { db } = require('../db')
const { pushToScreen, registry } = require('../socket')

module.exports = function screenRoutes(_io) {
  const router = express.Router()

  async function enrichScreen(s) {
    const playlist      = s.playlist_id       ? await db.playlists.get(s.playlist_id)           : null
    const playlistGroup = s.playlist_group_id ? await db.playlistGroups.get(s.playlist_group_id) : null
    const ticker        = s.ticker_id         ? await db.tickers.get(s.ticker_id)               : null

    let slide_count = 0
    if (s.playlist_group_id) {
      const items = await db.playlistGroupItems.where(i => i.group_id == s.playlist_group_id)
      for (const item of items) {
        const slides = await db.playlistSlides.where(sl => sl.playlist_id == item.playlist_id)
        slide_count += slides.length
      }
    } else if (s.playlist_id) {
      const slides = await db.playlistSlides.where(sl => sl.playlist_id == s.playlist_id)
      slide_count = slides.length
    }

    return {
      ...s,
      playlist_name:       playlist?.name       || null,
      playlist_group_name: playlistGroup?.name  || null,
      ticker_name:         ticker?.name         || null,
      slide_count,
      online: registry.has(s.token),
    }
  }

  router.get('/', async (req, res) => {
    try {
      const screens = await db.screens.allForCompany(req.user.company_id)
      const enriched = await Promise.all(screens.map(enrichScreen))
      res.json(enriched.sort((a, b) => b.created_at.localeCompare(a.created_at)))
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  router.post('/', async (req, res) => {
    try {
      const { name, playlist_id, ticker_id, orientation } = req.body
      if (!name) return res.status(400).json({ error: 'name é obrigatório' })
      const { playlist_group_id } = req.body
      const screen = await db.screens.insert({
        name,
        token:             uuidv4(),
        playlist_id:       playlist_id       ? Number(playlist_id)       : null,
        playlist_group_id: playlist_group_id ? Number(playlist_group_id) : null,
        ticker_id:         ticker_id         ? Number(ticker_id)         : null,
        orientation:       orientation || 'landscape',
        company_id:        req.user.company_id,
      })
      res.json(await enrichScreen(screen))
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  router.get('/:id', async (req, res) => {
    try {
      const s = await db.screens.findByIdAndCompany(req.params.id, req.user.company_id)
      if (!s) return res.status(404).json({ error: 'Não encontrado' })
      res.json(await enrichScreen(s))
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  router.put('/:id', async (req, res) => {
    try {
      const existing = await db.screens.findByIdAndCompany(req.params.id, req.user.company_id)
      if (!existing) return res.status(404).json({ error: 'Não encontrado' })
      const { name, playlist_id, playlist_group_id, ticker_id, orientation } = req.body
      const s = await db.screens.update(req.params.id, {
        name,
        playlist_id:       playlist_id       ? Number(playlist_id)       : null,
        playlist_group_id: playlist_group_id ? Number(playlist_group_id) : null,
        ticker_id:         ticker_id         ? Number(ticker_id)         : null,
        orientation:       orientation || 'landscape',
      })
      await pushToScreen(Number(req.params.id))
      res.json(await enrichScreen(s))
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  router.delete('/:id', async (req, res) => {
    try {
      const existing = await db.screens.findByIdAndCompany(req.params.id, req.user.company_id)
      if (!existing) return res.status(404).json({ error: 'Não encontrado' })
      await db.screens.remove(req.params.id)
      res.json({ ok: true })
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  router.post('/:id/push', async (req, res) => {
    try {
      const existing = await db.screens.findByIdAndCompany(req.params.id, req.user.company_id)
      if (!existing) return res.status(404).json({ error: 'Não encontrado' })
      const ok = await pushToScreen(Number(req.params.id))
      res.json({ ok })
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  return router
}
