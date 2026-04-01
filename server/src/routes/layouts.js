const express = require('express')
const { db } = require('../db')

const router = express.Router()

router.get('/', (_req, res) => {
  res.json(db.layouts.all())
})

router.get('/:id', (req, res) => {
  const layout = db.layouts.get(req.params.id)
  if (!layout) return res.status(404).json({ error: 'Não encontrado' })
  res.json(layout)
})

module.exports = router
