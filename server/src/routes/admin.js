const express    = require('express')
const bcrypt     = require('bcryptjs')
const jwt        = require('jsonwebtoken')
const { db }     = require('../db')
const requireSuperadmin = require('../middleware/superadmin')
const { validateUsername, validateEmail } = require('../usernames')

const SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-prod'

const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
function makeToken(len = 8) {
  return Array.from({ length: len }, () => CHARS[Math.floor(Math.random() * CHARS.length)]).join('')
}

const router = express.Router()
router.use(requireSuperadmin)

// Publicação do app Android (atualização automática das TVs)
router.use(require('./appRelease').adminRouter)

// Lista todas as empresas com contadores
router.get('/companies', async (_req, res) => {
  try {
    const companies = await db.companies.all()
    const result = await Promise.all(companies.map(async c => {
      const users   = await db.users.allForCompany(c.id)
      const screens = await db.screens.allForCompany(c.id)
      return {
        ...c,
        user_count:   users.length,
        screen_count: screens.length,
        users: users.map(({ password_hash, ...u }) => u),
      }
    }))
    res.json(result)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// Cria empresa + usuário administrador inicial
router.post('/companies', async (req, res) => {
  try {
    const { company_name, admin_name, admin_password } = req.body
    if (!company_name)   return res.status(400).json({ error: 'Informe o nome da empresa' })
    if (!admin_name)     return res.status(400).json({ error: 'Informe o nome do administrador' })
    if (!admin_password) return res.status(400).json({ error: 'Informe a senha do administrador' })
    if (admin_password.length < 6) return res.status(400).json({ error: 'A senha deve ter no mínimo 6 caracteres' })
    const u = validateUsername(req.body.admin_username)
    if (u.error) return res.status(400).json({ error: u.error })
    const e = validateEmail(req.body.admin_email)
    if (e.error) return res.status(400).json({ error: e.error })

    const existing = await db.users.findOne(x => x.username === u.value || (e.value && x.email === e.value))
    if (existing) return res.status(409).json({ error: existing.username === u.value ? 'Já existe um usuário com esse nome de usuário' : 'Já existe um usuário com esse e-mail' })

    const company      = await db.companies.insert({ name: company_name, pairing_token: makeToken() })
    const password_hash = await bcrypt.hash(admin_password, 10)
    const user = await db.users.insert({
      company_id:    company.id,
      name:          admin_name,
      username:      u.value,
      email:         e.value,
      password_hash,
      role:          'admin',
    })

    const { password_hash: _, ...safeUser } = user
    res.json({ company, user: safeUser })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// Exclui empresa e todos os seus dados
router.delete('/companies/:id', async (req, res) => {
  try {
    const companyId = Number(req.params.id)
    const company   = await db.companies.get(companyId)
    if (!company) return res.status(404).json({ error: 'Empresa não encontrada' })

    // Cascade delete: slides → playlists, media, tickers, screens, schedules, users → company
    const playlists    = await db.playlists.allForCompany(companyId)
    const playlistIds  = playlists.map(p => p.id)
    if (playlistIds.length > 0) {
      await db.playlistSlides.removeWhere(s => playlistIds.includes(s.playlist_id))
    }
    await db.schedules.removeWhere(s => s.company_id === companyId)
    await db.playlists.removeWhere(p => p.company_id === companyId)
    await db.media.removeWhere(m => m.company_id === companyId)
    await db.tickers.removeWhere(t => t.company_id === companyId)
    await db.screens.removeWhere(s => s.company_id === companyId)
    await db.users.removeWhere(u => u.company_id === companyId)
    await db.companies.remove(companyId)

    res.json({ ok: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// Superadmin impersonates a company — returns a scoped token
router.post('/impersonate/:companyId', async (req, res) => {
  try {
    const company = await db.companies.get(req.params.companyId)
    if (!company) return res.status(404).json({ error: 'Empresa não encontrada' })

    const token = jwt.sign(
      {
        id:                    req.user.id,
        company_id:            company.id,
        email:                 req.user.email,
        username:              req.user.username,
        name:                  req.user.name,
        role:                  req.user.role,       // still superadmin
        impersonating_company: company.id,
        impersonating_name:    company.name,
      },
      SECRET,
      { expiresIn: '8h' }
    )
    res.json({ token, company })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

module.exports = router
