const express = require('express')
const { db } = require('../db')
const { pushToScreen } = require('../socket')

module.exports = function playlistRoutes(_io) {
  const router = express.Router()

  async function pushScreensUsingPlaylist(playlistId) {
    const screens = await db.screens.where(s => s.playlist_id == playlistId)
    for (const s of screens) await pushToScreen(s.id)
  }

  async function getPlaylistWithSlides(id) {
    const playlist = await db.playlists.get(id)
    if (!playlist) return null
    const allSlides = await db.playlistSlides.where(s => s.playlist_id == id)
    const slides = await Promise.all(
      allSlides.sort((a, b) => a.position - b.position).map(async slide => {
        const layout = slide.layout_id ? await db.layouts.get(slide.layout_id) : null
        const zoneContent = slide.zone_content || {}
        const zones = {}
        for (const [zi, mediaId] of Object.entries(zoneContent)) {
          if (!mediaId) continue
          const media = await db.media.get(mediaId)
          if (media) zones[zi] = { media_id: mediaId, name: media.name, type: media.type }
        }
        return {
          ...slide,
          layout_name:         layout?.name     || null,
          layout_template:     layout?.template  || null,
          layout_zones:        layout?.config?.zones || [],
          zone_content_detail: zones,
        }
      })
    )
    return { ...playlist, slides }
  }

  router.get('/', async (_req, res) => {
    try {
      const playlists = await db.playlists.all()
      res.json(playlists.sort((a, b) => b.created_at.localeCompare(a.created_at)))
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  router.post('/', async (req, res) => {
    try {
      const { name, description } = req.body
      if (!name) return res.status(400).json({ error: 'name é obrigatório' })
      res.json(await db.playlists.insert({ name, description: description || null }))
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  router.get('/:id', async (req, res) => {
    try {
      const p = await getPlaylistWithSlides(req.params.id)
      if (!p) return res.status(404).json({ error: 'Não encontrado' })
      res.json(p)
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  router.put('/:id', async (req, res) => {
    try {
      const { name, description } = req.body
      const row = await db.playlists.update(req.params.id, { name, description: description || null })
      if (!row) return res.status(404).json({ error: 'Não encontrado' })
      res.json(row)
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  router.delete('/:id', async (req, res) => {
    try {
      await db.playlistSlides.removeWhere(s => s.playlist_id == req.params.id)
      await db.playlists.remove(req.params.id)
      res.json({ ok: true })
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  router.post('/:id/slides', async (req, res) => {
    try {
      const { layout_id, zone_content = {}, duration = 10 } = req.body
      const existing = await db.playlistSlides.where(s => s.playlist_id == req.params.id)
      const maxPos   = existing.length > 0 ? Math.max(...existing.map(s => s.position)) : -1
      const slide = await db.playlistSlides.insert({
        playlist_id: Number(req.params.id),
        layout_id:   layout_id ? Number(layout_id) : null,
        zone_content,
        position:    maxPos + 1,
        duration:    Number(duration),
      })
      await pushScreensUsingPlaylist(req.params.id)
      res.json(slide)
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  // PUT reorder — must come before /:slideId
  router.put('/:id/slides/reorder', async (req, res) => {
    try {
      const { slides } = req.body
      if (!Array.isArray(slides)) return res.status(400).json({ error: 'slides deve ser array' })
      for (const s of slides) await db.playlistSlides.update(s.id, { position: s.position })
      await pushScreensUsingPlaylist(req.params.id)
      res.json({ ok: true })
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  router.put('/:id/slides/:slideId', async (req, res) => {
    try {
      const { layout_id, zone_content, duration } = req.body
      const slide = await db.playlistSlides.get(req.params.slideId)
      if (!slide || slide.playlist_id != req.params.id) return res.status(404).json({ error: 'Slide não encontrado' })
      const updated = await db.playlistSlides.update(req.params.slideId, {
        layout_id:    layout_id    !== undefined ? (layout_id ? Number(layout_id) : null)  : slide.layout_id,
        zone_content: zone_content !== undefined ? zone_content                             : slide.zone_content,
        duration:     duration     !== undefined ? Number(duration)                         : slide.duration,
      })
      await pushScreensUsingPlaylist(req.params.id)
      res.json(updated)
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  router.delete('/:id/slides/:slideId', async (req, res) => {
    try {
      const slide = await db.playlistSlides.get(req.params.slideId)
      if (!slide || slide.playlist_id != req.params.id) return res.status(404).json({ error: 'Slide não encontrado' })
      await db.playlistSlides.remove(req.params.slideId)
      await pushScreensUsingPlaylist(req.params.id)
      res.json({ ok: true })
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  return router
}
