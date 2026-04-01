const express = require('express')
const { db } = require('../db')
const { pushToScreen } = require('../socket')

module.exports = function playlistRoutes(_io) {
  const router = express.Router()

  function pushScreensUsingPlaylist(playlistId) {
    db.screens.where(s => s.playlist_id == playlistId).forEach(s => pushToScreen(s.id))
  }

  function getPlaylistWithSlides(id) {
    const playlist = db.playlists.get(id)
    if (!playlist) return null
    const slides = db.playlistSlides
      .where(s => s.playlist_id == id)
      .sort((a, b) => a.position - b.position)
      .map(slide => {
        const layout = slide.layout_id ? db.layouts.get(slide.layout_id) : null
        const zoneContent = slide.zone_content || {}
        const zones = {}
        Object.entries(zoneContent).forEach(([zi, mediaId]) => {
          if (!mediaId) return
          const media = db.media.get(mediaId)
          if (media) zones[zi] = { media_id: mediaId, name: media.name, type: media.type }
        })
        return {
          ...slide,
          layout_name: layout?.name || null,
          layout_template: layout?.template || null,
          layout_zones: layout?.config?.zones || [],
          zone_content_detail: zones,
        }
      })
    return { ...playlist, slides }
  }

  // GET /api/playlists
  router.get('/', (_req, res) => {
    res.json(db.playlists.all().sort((a, b) => b.created_at.localeCompare(a.created_at)))
  })

  // POST /api/playlists
  router.post('/', (req, res) => {
    const { name, description } = req.body
    if (!name) return res.status(400).json({ error: 'name é obrigatório' })
    res.json(db.playlists.insert({ name, description: description || null }))
  })

  // GET /api/playlists/:id
  router.get('/:id', (req, res) => {
    const p = getPlaylistWithSlides(req.params.id)
    if (!p) return res.status(404).json({ error: 'Não encontrado' })
    res.json(p)
  })

  // PUT /api/playlists/:id
  router.put('/:id', (req, res) => {
    const { name, description } = req.body
    const row = db.playlists.update(req.params.id, { name, description: description || null })
    if (!row) return res.status(404).json({ error: 'Não encontrado' })
    res.json(row)
  })

  // DELETE /api/playlists/:id
  router.delete('/:id', (req, res) => {
    db.playlistSlides.removeWhere(s => s.playlist_id == req.params.id)
    db.playlists.remove(req.params.id)
    res.json({ ok: true })
  })

  // POST /api/playlists/:id/slides
  router.post('/:id/slides', (req, res) => {
    const { layout_id, zone_content = {}, duration = 10 } = req.body
    const existing = db.playlistSlides.where(s => s.playlist_id == req.params.id)
    const maxPos = existing.length > 0 ? Math.max(...existing.map(s => s.position)) : -1

    const slide = db.playlistSlides.insert({
      playlist_id: Number(req.params.id),
      layout_id: layout_id ? Number(layout_id) : null,
      zone_content,
      position: maxPos + 1,
      duration: Number(duration),
    })

    pushScreensUsingPlaylist(req.params.id)
    res.json(slide)
  })

  // PUT /api/playlists/:id/slides/reorder  (must be before /:slideId)
  router.put('/:id/slides/reorder', (req, res) => {
    const { slides } = req.body
    if (!Array.isArray(slides)) return res.status(400).json({ error: 'slides deve ser array' })
    slides.forEach(s => db.playlistSlides.update(s.id, { position: s.position }))
    pushScreensUsingPlaylist(req.params.id)
    res.json({ ok: true })
  })

  // PUT /api/playlists/:id/slides/:slideId
  router.put('/:id/slides/:slideId', (req, res) => {
    const { layout_id, zone_content, duration } = req.body
    const slide = db.playlistSlides.get(req.params.slideId)
    if (!slide || slide.playlist_id != req.params.id) return res.status(404).json({ error: 'Slide não encontrado' })

    const updated = db.playlistSlides.update(req.params.slideId, {
      layout_id: layout_id !== undefined ? (layout_id ? Number(layout_id) : null) : slide.layout_id,
      zone_content: zone_content !== undefined ? zone_content : slide.zone_content,
      duration: duration !== undefined ? Number(duration) : slide.duration,
    })

    pushScreensUsingPlaylist(req.params.id)
    res.json(updated)
  })

  // DELETE /api/playlists/:id/slides/:slideId
  router.delete('/:id/slides/:slideId', (req, res) => {
    const slide = db.playlistSlides.get(req.params.slideId)
    if (!slide || slide.playlist_id != req.params.id) return res.status(404).json({ error: 'Slide não encontrado' })
    db.playlistSlides.remove(req.params.slideId)
    pushScreensUsingPlaylist(req.params.id)
    res.json({ ok: true })
  })

  return router
}
