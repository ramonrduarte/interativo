const express = require('express')
const { db } = require('../db')

const router = express.Router()

router.get('/', async (_req, res) => {
  try {
    res.json(await db.layouts.all())
  } catch (e) { res.status(500).json({ error: e.message }) }
})

router.get('/:id', async (req, res) => {
  try {
    const layout = await db.layouts.get(req.params.id)
    if (!layout) return res.status(404).json({ error: 'Não encontrado' })
    res.json(layout)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

module.exports = router
