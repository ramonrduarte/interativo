const express = require('express')
const bcrypt  = require('bcryptjs')
const { db }  = require('../db')

const router = express.Router()

// Lista usuários da empresa
router.get('/', async (req, res) => {
  try {
    const users = await db.users.allForCompany(req.user.company_id)
    res.json(users.map(({ password_hash, ...u }) => u))
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// Cria novo usuário na empresa
router.post('/', async (req, res) => {
  try {
    const { name, email, password, role = 'admin' } = req.body
    if (!name || !email || !password) return res.status(400).json({ error: 'name, email e password são obrigatórios' })
    if (password.length < 6) return res.status(400).json({ error: 'A senha deve ter no mínimo 6 caracteres' })

    const existing = await db.users.findOne(u => u.email === email.toLowerCase().trim())
    if (existing) return res.status(409).json({ error: 'Já existe um usuário com esse email' })

    const password_hash = await bcrypt.hash(password, 10)
    const user = await db.users.insert({
      company_id: req.user.company_id,
      name,
      email: email.toLowerCase().trim(),
      password_hash,
      role,
    })
    const { password_hash: _, ...safe } = user
    res.json(safe)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// Remove usuário (não pode remover a si mesmo)
router.delete('/:id', async (req, res) => {
  try {
    if (Number(req.params.id) === req.user.id) {
      return res.status(400).json({ error: 'Você não pode remover sua própria conta' })
    }
    const user = await db.users.findByIdAndCompany(req.params.id, req.user.company_id)
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado' })
    await db.users.remove(req.params.id)
    res.json({ ok: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

module.exports = router
