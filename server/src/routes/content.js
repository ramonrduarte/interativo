const express = require('express')
const multer  = require('multer')
const path    = require('path')
const fs      = require('fs')
const { db }  = require('../db')

const uploadsDir = path.join(__dirname, '../../../uploads')

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const sub = file.mimetype.startsWith('image/') ? 'images' : 'videos'
    cb(null, path.join(uploadsDir, sub))
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname)
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`)
  },
})

const upload = multer({
  storage,
  limits: { fileSize: 500 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/')) cb(null, true)
    else cb(new Error('Tipo não suportado. Envie imagens ou vídeos.'))
  },
})

module.exports = function contentRoutes(_io) {
  const router = express.Router()

  router.get('/', async (req, res) => {
    try {
      const items = await db.media.allForCompany(req.user.company_id)
      res.json(items.sort((a, b) => b.created_at.localeCompare(a.created_at)))
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  router.post('/upload', upload.single('file'), async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: 'Nenhum arquivo enviado' })
      const sub      = req.file.mimetype.startsWith('image/') ? 'images' : 'videos'
      const filename = `${sub}/${req.file.filename}`
      const type     = req.file.mimetype.startsWith('image/') ? 'image' : 'video'
      const name     = (req.body.name || req.file.originalname).replace(/\.[^.]+$/, '')
      const object_fit = req.body.object_fit || 'cover'
      res.json(await db.media.insert({
        name, type, filename, mime_type: req.file.mimetype, file_size: req.file.size,
        object_fit, company_id: req.user.company_id,
      }))
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  router.post('/external', async (req, res) => {
    try {
      const { name, type, url, content } = req.body
      if (!name || !type) return res.status(400).json({ error: 'name e type são obrigatórios' })
      res.json(await db.media.insert({ name, type, url: url || null, content: content || null, company_id: req.user.company_id }))
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  router.put('/:id', async (req, res) => {
    try {
      const item = await db.media.findByIdAndCompany(req.params.id, req.user.company_id)
      if (!item) return res.status(404).json({ error: 'Não encontrado' })
      const { name, url, content, object_fit } = req.body
      const updates = { name, url: url || null, content: content || null }
      if (object_fit) updates.object_fit = object_fit
      const row = await db.media.update(req.params.id, updates)
      res.json(row)
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  router.delete('/:id', async (req, res) => {
    try {
      const item = await db.media.findByIdAndCompany(req.params.id, req.user.company_id)
      if (!item) return res.status(404).json({ error: 'Não encontrado' })
      if (item.filename) {
        try { fs.unlinkSync(path.join(uploadsDir, item.filename)) } catch (_) {}
      }
      await db.media.remove(req.params.id)
      res.json({ ok: true })
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  return router
}
