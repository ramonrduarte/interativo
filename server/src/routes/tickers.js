const express = require('express')
const { db } = require('../db')
const { pushToScreen } = require('../socket')

module.exports = function tickerRoutes(_io) {
  const router = express.Router()

  function pushScreensWithTicker(tickerId) {
    db.screens.where(s => s.ticker_id == tickerId).forEach(s => pushToScreen(s.id))
  }

  router.get('/', (_req, res) => {
    res.json(db.tickers.all().sort((a, b) => b.created_at.localeCompare(a.created_at)))
  })

  router.post('/', (req, res) => {
    const { name, messages, speed = 60, font_size = 32, color = '#ffffff', bg_color = '#dc2626' } = req.body
    if (!name) return res.status(400).json({ error: 'name é obrigatório' })
    if (!messages || messages.length === 0) return res.status(400).json({ error: 'Adicione ao menos uma mensagem' })
    res.json(db.tickers.insert({ name, messages, speed, font_size, color, bg_color }))
  })

  router.get('/:id', (req, res) => {
    const t = db.tickers.get(req.params.id)
    if (!t) return res.status(404).json({ error: 'Não encontrado' })
    res.json(t)
  })

  router.put('/:id', (req, res) => {
    const t = db.tickers.get(req.params.id)
    if (!t) return res.status(404).json({ error: 'Não encontrado' })
    const { name, messages, speed, font_size, color, bg_color } = req.body
    const updated = db.tickers.update(req.params.id, {
      name:      name      ?? t.name,
      messages:  messages  ?? t.messages,
      speed:     speed     ?? t.speed,
      font_size: font_size ?? t.font_size,
      color:     color     ?? t.color,
      bg_color:  bg_color  ?? t.bg_color,
    })
    pushScreensWithTicker(req.params.id)
    res.json(updated)
  })

  router.delete('/:id', (req, res) => {
    db.tickers.remove(req.params.id)
    res.json({ ok: true })
  })

  return router
}
