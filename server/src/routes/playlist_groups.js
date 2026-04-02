const express = require('express')
const { db }  = require('../db')
const { pushToScreen } = require('../socket')

module.exports = function playlistGroupRoutes() {
  const router = express.Router()

  async function pushScreensUsingGroup(groupId) {
    const screens = await db.screens.where(s => s.playlist_group_id == groupId)
    for (const s of screens) await pushToScreen(s.id)
  }

  async function enrichGroup(g) {
    const items = await db.playlistGroupItems.where(i => i.group_id == g.id)
    items.sort((a, b) => a.position - b.position)
    const playlists = await Promise.all(
      items.map(async item => {
        const pl = await db.playlists.get(item.playlist_id)
        const slides = pl ? await db.playlistSlides.where(s => s.playlist_id == pl.id) : []
        return pl ? { item_id: item.id, position: item.position, ...pl, slide_count: slides.length } : null
      })
    )
    const screens = await db.screens.where(s => s.playlist_group_id == g.id)
    return {
      ...g,
      playlists:    playlists.filter(Boolean),
      screen_count: screens.length,
    }
  }

  // List all groups for company
  router.get('/', async (req, res) => {
    try {
      const groups  = await db.playlistGroups.allForCompany(req.user.company_id)
      const result  = await Promise.all(groups.map(enrichGroup))
      res.json(result.sort((a, b) => b.created_at.localeCompare(a.created_at)))
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  // Create group
  router.post('/', async (req, res) => {
    try {
      const { name, description } = req.body
      if (!name) return res.status(400).json({ error: 'name é obrigatório' })
      const group = await db.playlistGroups.insert({
        name, description: description || null, company_id: req.user.company_id,
      })
      res.json(await enrichGroup(group))
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  // Update group name/description
  router.put('/:id', async (req, res) => {
    try {
      const group = await db.playlistGroups.findByIdAndCompany(req.params.id, req.user.company_id)
      if (!group) return res.status(404).json({ error: 'Não encontrado' })
      const { name, description } = req.body
      const updated = await db.playlistGroups.update(req.params.id, { name, description: description || null })
      res.json(await enrichGroup(updated))
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  // Delete group
  router.delete('/:id', async (req, res) => {
    try {
      const group = await db.playlistGroups.findByIdAndCompany(req.params.id, req.user.company_id)
      if (!group) return res.status(404).json({ error: 'Não encontrado' })
      await db.playlistGroupItems.removeWhere(i => i.group_id == req.params.id)
      await db.playlistGroups.remove(req.params.id)
      res.json({ ok: true })
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  // Add playlist to group
  router.post('/:id/playlists', async (req, res) => {
    try {
      const group = await db.playlistGroups.findByIdAndCompany(req.params.id, req.user.company_id)
      if (!group) return res.status(404).json({ error: 'Não encontrado' })
      const { playlist_id } = req.body
      if (!playlist_id) return res.status(400).json({ error: 'playlist_id é obrigatório' })

      // Verify playlist belongs to same company
      const playlist = await db.playlists.findByIdAndCompany(playlist_id, req.user.company_id)
      if (!playlist) return res.status(404).json({ error: 'Playlist não encontrada' })

      const existing = await db.playlistGroupItems.where(i => i.group_id == req.params.id)
      const maxPos   = existing.length > 0 ? Math.max(...existing.map(i => i.position)) : -1

      await db.playlistGroupItems.insert({
        group_id:    Number(req.params.id),
        playlist_id: Number(playlist_id),
        position:    maxPos + 1,
      })

      await pushScreensUsingGroup(req.params.id)
      res.json(await enrichGroup(group))
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  // Remove playlist from group
  router.delete('/:id/playlists/:itemId', async (req, res) => {
    try {
      const group = await db.playlistGroups.findByIdAndCompany(req.params.id, req.user.company_id)
      if (!group) return res.status(404).json({ error: 'Não encontrado' })
      await db.playlistGroupItems.remove(req.params.itemId)
      await pushScreensUsingGroup(req.params.id)
      res.json(await enrichGroup(group))
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  // Reorder playlists in group
  router.put('/:id/playlists/reorder', async (req, res) => {
    try {
      const group = await db.playlistGroups.findByIdAndCompany(req.params.id, req.user.company_id)
      if (!group) return res.status(404).json({ error: 'Não encontrado' })
      const { items } = req.body
      if (!Array.isArray(items)) return res.status(400).json({ error: 'items deve ser array' })
      for (const item of items) await db.playlistGroupItems.update(item.id, { position: item.position })
      await pushScreensUsingGroup(req.params.id)
      res.json(await enrichGroup(group))
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  return router
}
