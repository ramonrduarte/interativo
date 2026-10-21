// Login por nome de usuário; e-mail passa a ser opcional.
// Usuários existentes ganham um username derivado do e-mail (parte antes do @).
const { normalizeUsername } = require('../usernames')

// Ajustes pedidos para usuários já existentes (e-mail → usuário)
const PRESET = {
  'nfc@adrofecha.com.br': 'ramon',
}

const clean = s => normalizeUsername(s).replace(/[^a-z0-9._-]/g, '')

exports.up = async function (knex) {
  await knex.schema.alterTable('users', t => {
    t.string('username').nullable()
  })
  await knex.schema.alterTable('users', t => {
    t.string('email').nullable().alter()
  })

  const users = await knex('users').select('id', 'name', 'email').orderBy('id')
  const used = new Set()
  for (const u of users) {
    const email = (u.email || '').toLowerCase()
    const placeholder = email.endsWith('@interativa.local')   // e-mail padrão inválido da instalação
    let base = PRESET[email] || (placeholder ? 'admin' : clean(email.split('@')[0])) || clean(u.name) || 'usuario'
    if (base.length < 3) base = base.padEnd(3, '0')
    base = base.slice(0, 28)
    let username = base, n = 2
    while (used.has(username)) username = `${base}${n++}`
    used.add(username)
    const update = { username }
    if (placeholder) update.email = null
    await knex('users').where({ id: u.id }).update(update)
  }

  await knex.schema.alterTable('users', t => {
    t.unique(['username'])
  })
}

exports.down = async function (knex) {
  await knex.schema.alterTable('users', t => {
    t.dropUnique(['username'])
    t.dropColumn('username')
  })
}
