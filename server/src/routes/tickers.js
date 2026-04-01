const express = require('express')
const { db } = require('../db')
const { pushToScreen } = require('../socket')

module.exports = function tickerRoutes(_io) {
  const router = express.Router()

  async function pushScreensWithTicker(tickerId) {
    const screens = await db.screens.where(s => s.ticker_id == tickerId)
    for (const s of screens) await pushToScreen(s.id)
  }

  router.get('/', async (_req, res) => {
    try {
      const tickers = await db.tickers.all()
      res.json(tickers.sort((a, b) => b.created_at.localeCompare(a.created_at)))
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  router.post('/', async (req, res) => {
    try {
      const { name, messages, speed = 60, font_size = 32, color = '#ffffff', bg_color = '#dc2626' } = req.body
      if (!name) return res.status(400).json({ error: 'name é obrigatório' })
      if (!messages || messages.length === 0) return res.status(400).json({ error: 'Adicione ao menos uma mensagem' })
      res.json(await db.tickers.insert({ name, messages, speed, font_size, color, bg_color }))
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  router.get('/:id', async (req, res) => {
    try {
      const t = await db.tickers.get(req.params.id)
      if (!t) return res.status(404).json({ error: 'Não encontrado' })
      res.json(t)
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  router.put('/:id', async (req, res) => {
    try {
      const t = await db.tickers.get(req.params.id)
      if (!t) return res.status(404).json({ error: 'Não encontrado' })
      const { name, messages, speed, font_size, color, bg_color } = req.body
      const updated = await db.tickers.update(req.params.id, {
        name:      name      ?? t.name,
        messages:  messages  ?? t.messages,
        speed:     speed     ?? t.speed,
        font_size: font_size ?? t.font_size,
        color:     color     ?? t.color,
        bg_color:  bg_color  ?? t.bg_color,
      })
      await pushScreensWithTicker(req.params.id)
      res.json(updated)
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  router.delete('/:id', async (req, res) => {
    try {
      await db.tickers.remove(req.params.id)
      res.json({ ok: true })
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  return router
}
