const express      = require('express')
const bcrypt       = require('bcryptjs')
const jwt          = require('jsonwebtoken')
const { db }       = require('../db')
const requireAuth  = require('../middleware/auth')

const SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-prod'
const router = express.Router()

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body
    if (!email || !password) return res.status(400).json({ error: 'Email e senha são obrigatórios' })

    const user = await db.users.findOne(u => u.email === email.toLowerCase().trim())
    if (!user) return res.status(401).json({ error: 'Email ou senha incorretos' })

    const ok = await bcrypt.compare(password, user.password_hash)
    if (!ok) return res.status(401).json({ error: 'Email ou senha incorretos' })

    const token = jwt.sign(
      { id: user.id, company_id: user.company_id, email: user.email, name: user.name, role: user.role },
      SECRET,
      { expiresIn: '30d' }
    )

    res.json({
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role, company_id: user.company_id },
    })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

router.get('/me', requireAuth, async (req, res) => {
  try {
    const user = await db.users.get(req.user.id)
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado' })
    const { password_hash, ...safe } = user
    res.json(safe)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// Change password
router.put('/me/password', requireAuth, async (req, res) => {
  try {
    const { current_password, new_password } = req.body
    if (!current_password || !new_password) return res.status(400).json({ error: 'current_password e new_password são obrigatórios' })
    if (new_password.length < 6) return res.status(400).json({ error: 'A nova senha deve ter no mínimo 6 caracteres' })

    const user = await db.users.get(req.user.id)
    const ok = await bcrypt.compare(current_password, user.password_hash)
    if (!ok) return res.status(401).json({ error: 'Senha atual incorreta' })

    const password_hash = await bcrypt.hash(new_password, 10)
    await db.users.update(req.user.id, { password_hash })
    res.json({ ok: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

module.exports = router
