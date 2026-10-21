const express      = require('express')
const bcrypt       = require('bcryptjs')
const jwt          = require('jsonwebtoken')
const { db }       = require('../db')
const requireAuth  = require('../middleware/auth')

const { normalizeUsername, validateUsername, validateEmail } = require('../usernames')

const SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-prod'
const router = express.Router()

function signFor(user, extra = {}) {
  return jwt.sign(
    { id: user.id, company_id: user.company_id, email: user.email, username: user.username, name: user.name, role: user.role, ...extra },
    SECRET,
    { expiresIn: '30d' }
  )
}

function publicUser(user) {
  const { password_hash, ...safe } = user
  return safe
}

// Login com usuário ou e-mail (sem diferenciar maiúsculas). O nome de exibição
// ainda é aceito, mas só quando nenhum outro usuário tem o mesmo nome.
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body
    if (!email || !password) return res.status(400).json({ error: 'Usuário e senha são obrigatórios' })

    const identifier = normalizeUsername(email)
    let user = await db.users.findOne(u =>
      (u.username || '') === identifier || (u.email || '') === identifier
    )
    if (!user) {
      const byName = await db.users.where(u => normalizeUsername(u.name) === identifier)
      if (byName.length === 1) user = byName[0]
    }
    if (!user) return res.status(401).json({ error: 'Usuário ou senha incorretos' })

    const ok = await bcrypt.compare(password, user.password_hash)
    if (!ok) return res.status(401).json({ error: 'Usuário ou senha incorretos' })

    res.json({ token: signFor(user), user: publicUser(user) })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// Meu perfil: nome, usuário e e-mail (opcional). Devolve um token novo com os dados atualizados.
router.put('/me', requireAuth, async (req, res) => {
  try {
    const name = String(req.body.name || '').trim()
    if (!name) return res.status(400).json({ error: 'O nome é obrigatório' })
    const u = validateUsername(req.body.username)
    if (u.error) return res.status(400).json({ error: u.error })
    const e = validateEmail(req.body.email)
    if (e.error) return res.status(400).json({ error: e.error })

    const clash = await db.users.findOne(x => x.id !== req.user.id && (x.username === u.value || (e.value && x.email === e.value)))
    if (clash) {
      return res.status(409).json({ error: clash.username === u.value ? 'Esse usuário já está em uso' : 'Esse e-mail já está em uso' })
    }

    const user = await db.users.update(req.user.id, { name, username: u.value, email: e.value })
    // Mantém o acesso à empresa que o administrador principal estiver visualizando
    const extra = req.user.impersonating_company
      ? { company_id: req.user.company_id, impersonating_company: req.user.impersonating_company, impersonating_name: req.user.impersonating_name }
      : {}
    res.json({ token: signFor(user, extra), user: publicUser(user) })
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
