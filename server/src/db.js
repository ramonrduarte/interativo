const fs   = require('fs')
const path = require('path')

const uploadsDir = path.join(__dirname, '../../uploads')
fs.mkdirSync(path.join(uploadsDir, 'images'), { recursive: true })
fs.mkdirSync(path.join(uploadsDir, 'videos'), { recursive: true })

// ---------------------------------------------------------------------------
// Knex — PostgreSQL required (set DATABASE_URL)
// ---------------------------------------------------------------------------
if (!process.env.DATABASE_URL) {
  console.error('ERRO: DATABASE_URL não definida. Configure a variável de ambiente com a string de conexão PostgreSQL.')
  process.exit(1)
}

const knex = require('knex')({
  client:     'pg',
  connection: process.env.DATABASE_URL,
  migrations: { directory: path.join(__dirname, 'migrations') },
})

// Fields that are serialized as JSON strings in the database
const JSON_FIELDS = {
  layouts:         ['config'],
  media:           ['content'],
  playlists:       [],
  playlist_slides: ['zone_content'],
  tickers:         ['messages'],
  screens:         [],
  schedules:       ['days'],
  companies:       [],
  users:           [],
}

const BOOL_FIELDS = {}  // PostgreSQL handles booleans natively

// ---------------------------------------------------------------------------
// Table — async wrapper around a Knex table keeping the same API shape
// ---------------------------------------------------------------------------
class Table {
  constructor(name) {
    this.name       = name
    this.jsonFields = JSON_FIELDS[name] || []
    this.boolFields = BOOL_FIELDS[name] || []
  }

  _serialize(data) {
    const out = { ...data }
    for (const f of this.jsonFields) {
      if (out[f] !== undefined && out[f] !== null && typeof out[f] !== 'string') {
        out[f] = JSON.stringify(out[f])
      }
    }
    return out
  }

  _deserialize(row) {
    if (!row) return null
    const out = { ...row }
    for (const f of this.jsonFields) {
      if (out[f] !== null && out[f] !== undefined && typeof out[f] === 'string') {
        try { out[f] = JSON.parse(out[f]) } catch {}
      }
    }
    for (const f of this.boolFields) {
      if (out[f] !== null && out[f] !== undefined) {
        out[f] = out[f] === true || out[f] === 1
      }
    }
    return out
  }

  async all() {
    const rows = await knex(this.name).select('*').orderBy('id')
    return rows.map(r => this._deserialize(r))
  }

  async allForCompany(companyId) {
    const rows = await knex(this.name).select('*').where({ company_id: companyId }).orderBy('id')
    return rows.map(r => this._deserialize(r))
  }

  async get(id) {
    const row = await knex(this.name).where({ id: Number(id) }).first()
    return this._deserialize(row || null)
  }

  async findByIdAndCompany(id, companyId) {
    const row = await knex(this.name).where({ id: Number(id), company_id: companyId }).first()
    return this._deserialize(row || null)
  }

  // JavaScript predicate filter — fetches all rows then filters in memory.
  // Fine for datasets of this size; switch to knex().where() if tables grow large.
  async where(pred) {
    const rows = await this.all()
    return rows.filter(pred)
  }

  async findOne(pred) {
    const rows = await this.all()
    return rows.find(pred) || null
  }

  async insert(data) {
    const toInsert = this._serialize({ ...data, created_at: new Date().toISOString() })
    const [row] = await knex(this.name).insert(toInsert).returning('*')
    return this._deserialize(row)
  }

  async update(id, data) {
    const clean = {}
    for (const [k, v] of Object.entries(data)) {
      if (v !== undefined) clean[k] = v
    }
    if (Object.keys(clean).length === 0) return this.get(id)
    const updates = this._serialize(clean)
    const [row] = await knex(this.name).where({ id: Number(id) }).update(updates).returning('*')
    return this._deserialize(row || null)
  }

  async remove(id) {
    const count = await knex(this.name).where({ id: Number(id) }).delete()
    return count > 0
  }

  async removeWhere(pred) {
    const rows = await this.all()
    const ids  = rows.filter(pred).map(r => r.id)
    if (ids.length === 0) return
    await knex(this.name).whereIn('id', ids).delete()
  }
}

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------
const db = {
  layouts:        new Table('layouts'),
  media:          new Table('media'),
  playlists:      new Table('playlists'),
  playlistSlides: new Table('playlist_slides'),
  tickers:        new Table('tickers'),
  screens:        new Table('screens'),
  schedules:      new Table('schedules'),
  companies:      new Table('companies'),
  users:          new Table('users'),
}

// ---------------------------------------------------------------------------
// Layout seeds (inserted once per template)
// ---------------------------------------------------------------------------
const allSeeds = [
  // ── Horizontal (paisagem) ─────────────────────────────────────────────────
  { name: 'Tela Cheia',               template: 'fullscreen',   zone_count: 1, orientation: 'landscape', config: { zones: [{ id: 0, label: 'Principal' }] } },
  { name: 'Dividida 50/50',           template: 'split5050',    zone_count: 2, orientation: 'landscape', config: { zones: [{ id: 0, label: 'Esquerda' }, { id: 1, label: 'Direita' }] } },
  { name: 'Dividida 70/30',           template: 'split7030',    zone_count: 2, orientation: 'landscape', config: { zones: [{ id: 0, label: 'Principal' }, { id: 1, label: 'Lateral' }] } },
  { name: 'Cima / Baixo',             template: 'topbottom',    zone_count: 2, orientation: 'landscape', config: { zones: [{ id: 0, label: 'Superior' }, { id: 1, label: 'Inferior' }] } },
  { name: 'Grade 2x2',                template: 'grid2x2',      zone_count: 4, orientation: 'landscape', config: { zones: [{ id: 0, label: 'Sup. Esq' }, { id: 1, label: 'Sup. Dir' }, { id: 2, label: 'Inf. Esq' }, { id: 3, label: 'Inf. Dir' }] } },
  { name: 'Principal + Banner',       template: 'mainbanner',   zone_count: 2, orientation: 'landscape', config: { zones: [{ id: 0, label: 'Principal' }, { id: 1, label: 'Banner' }] } },
  // ── Vertical (retrato) ────────────────────────────────────────────────────
  { name: '[V] Tela Cheia',           template: 'v-fullscreen', zone_count: 1, orientation: 'portrait',  config: { zones: [{ id: 0, label: 'Principal' }] } },
  { name: '[V] Metade / Metade',      template: 'v-half',       zone_count: 2, orientation: 'portrait',  config: { zones: [{ id: 0, label: 'Superior' }, { id: 1, label: 'Inferior' }] } },
  { name: '[V] 70% Cima + 30% Baixo', template: 'v-7030',      zone_count: 2, orientation: 'portrait',  config: { zones: [{ id: 0, label: 'Principal' }, { id: 1, label: 'Rodapé' }] } },
  { name: '[V] Três Faixas',          template: 'v-thirds',     zone_count: 3, orientation: 'portrait',  config: { zones: [{ id: 0, label: 'Topo' }, { id: 1, label: 'Meio' }, { id: 2, label: 'Base' }] } },
  { name: '[V] Principal + Banner',   template: 'v-mainbanner', zone_count: 2, orientation: 'portrait',  config: { zones: [{ id: 0, label: 'Principal' }, { id: 1, label: 'Banner' }] } },
  { name: '[V] Grade 2x2',            template: 'v-grid2x2',    zone_count: 4, orientation: 'portrait',  config: { zones: [{ id: 0, label: 'Sup. Esq' }, { id: 1, label: 'Sup. Dir' }, { id: 2, label: 'Inf. Esq' }, { id: 3, label: 'Inf. Dir' }] } },
]

// ---------------------------------------------------------------------------
// initDb — run migrations + seed layouts + seed default company/user.
// Must be awaited before server starts.
// ---------------------------------------------------------------------------
async function initDb() {
  await knex.migrate.latest()

  // Seed layout templates
  const existing = await db.layouts.all()
  const existingTemplates = new Set(existing.map(l => l.template))
  for (const seed of allSeeds) {
    if (!existingTemplates.has(seed.template)) await db.layouts.insert(seed)
  }

  // Seed default company + admin user (only on first boot)
  const companies = await db.companies.all()
  if (companies.length === 0) {
    const bcrypt = require('bcryptjs')
    const company = await db.companies.insert({ name: 'Principal' })
    const hash = await bcrypt.hash('admin123', 10)
    await db.users.insert({
      company_id:    company.id,
      name:          'Admin',
      email:         'admin@interativa.local',
      password_hash: hash,
      role:          'superadmin',
    })

    // Migrate any existing rows (created before multi-tenancy) to the default company
    const tables = ['media', 'playlists', 'tickers', 'screens', 'schedules']
    for (const table of tables) {
      await knex(table).whereNull('company_id').update({ company_id: company.id })
    }

    console.log('[db] Empresa e usuário padrão criados')
    console.log('[db]   Email: admin@interativa.local')
    console.log('[db]   Senha: admin123  ← TROQUE após o primeiro login')
  }

  console.log('[db] PostgreSQL — migrações aplicadas')
}

module.exports = { db, initDb }
