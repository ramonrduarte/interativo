const fs   = require('fs')
const path = require('path')

const uploadsDir = path.join(__dirname, '../../uploads')
fs.mkdirSync(path.join(uploadsDir, 'images'), { recursive: true })
fs.mkdirSync(path.join(uploadsDir, 'videos'), { recursive: true })

// ---------------------------------------------------------------------------
// Knex — uses PostgreSQL in production (DATABASE_URL set), SQLite otherwise
// ---------------------------------------------------------------------------
const isPg = !!(process.env.DATABASE_URL)

const knex = require('knex')({
  client:            isPg ? 'pg' : 'better-sqlite3',
  connection:        isPg
    ? process.env.DATABASE_URL
    : { filename: path.join(__dirname, '../../data/interativa.db') },
  useNullAsDefault:  true,
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
}

// Fields stored as 0/1 integers in SQLite that should be JS booleans
const BOOL_FIELDS = {
  schedules: ['active'],
}

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

  async get(id) {
    const row = await knex(this.name).where({ id: Number(id) }).first()
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

    if (isPg) {
      const [row] = await knex(this.name).insert(toInsert).returning('*')
      return this._deserialize(row)
    } else {
      const [id] = await knex(this.name).insert(toInsert)
      return this.get(id)
    }
  }

  async update(id, data) {
    // Drop undefined values so only provided fields are updated
    const clean = {}
    for (const [k, v] of Object.entries(data)) {
      if (v !== undefined) clean[k] = v
    }
    if (Object.keys(clean).length === 0) return this.get(id)

    const updates = this._serialize(clean)

    if (isPg) {
      const [row] = await knex(this.name).where({ id: Number(id) }).update(updates).returning('*')
      return this._deserialize(row || null)
    } else {
      const count = await knex(this.name).where({ id: Number(id) }).update(updates)
      if (count === 0) return null
      return this.get(id)
    }
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
// initDb — run migrations + seed layouts. Must be awaited before server starts.
// ---------------------------------------------------------------------------
async function initDb() {
  if (!isPg) {
    fs.mkdirSync(path.join(__dirname, '../../data'), { recursive: true })
  }

  await knex.migrate.latest()

  const existing = await db.layouts.all()
  const existingTemplates = new Set(existing.map(l => l.template))
  for (const seed of allSeeds) {
    if (!existingTemplates.has(seed.template)) await db.layouts.insert(seed)
  }

  console.log(`[db] ${isPg ? 'PostgreSQL' : 'SQLite'} — migrações aplicadas`)
}

module.exports = { db, initDb }
